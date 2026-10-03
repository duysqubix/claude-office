// Claude Code compatibility check: does this Claude Code still work the way the office expects?
// It runs the real `claude` (CLAUDE_BIN, else claude on PATH) against a pretend Anthropic API on
// localhost (no login, nothing sent to Anthropic, no cost) in an office of its own
// (scripts/ci/office.mjs: its own HOME and ~/.claude, tmux server and port), and does what the
// game does through the office's own API: hire, answer, call an intern, let go, call back.
// Every integration point the server depends on gets a check:
//   command line  hire: --session-id, -n, --permission-mode <manual|plan|acceptEdits>, -- prompt;
//                 call back: --resume; thought bubbles: -p --model haiku --no-session-persistence
//                 --tools "" --setting-sources "" --strict-mcp-config --system-prompt
//   registry      ~/.claude/sessions/<pid>.json: pid, sessionId, cwd, name, status, procStart
//   transcripts   ~/.claude/projects/<cwd>/<id>.jsonl, and <id>/subagents/ for interns
//   hooks         PermissionRequest and PreToolUse (AskUserQuestion, ExitPlanMode): the payload
//                 Claude Code sends (hooks:install, office-hook.mjs) and the decision it takes back
//   status line   the JSON Claude Code pipes to statusline-tap.mjs (statusline:install)
//   terminal      the trust dialog spotted on screen, keys through /term, text through /api/say
//   input box     what Say reads off the screen before it pastes and before Enter: drafts, ghost
//                 text, dialogs, panels, themes (scripts/ci/say/: synthetic screens, then a real
//                 Claude Code, each with a tmux server of its own)
// Not checked: anything that needs a real login (plan usage limits) or real model replies.
//   CLAUDE_BIN=$(command -v claude) node scripts/compat.mjs [--json report.json] [--markdown report.md]
// Exit 1 if a check failed. "!" lines are notes: worth knowing, not a failure. COMPAT_SAY=0 skips
// the input-box checks, which take a few minutes.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import WebSocket from 'ws';
import { cleanEnv, freePort, makeHome, ROOT, startOffice, wait } from './ci/office.mjs';
import { blocks, lastUser, startPretendApi, text } from './ci/pretend-api.mjs';

const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const t0 = Date.now();

// ── Reporting ────────────────────────────────────────────────────────────────────────────
const results = [];
let area = '';
function section(name) {
  area = name;
  console.log(`\n${name}`);
}
function check(name, ok, detail = '', { note = false } = {}) {
  const status = ok ? 'pass' : note ? 'note' : 'fail';
  results.push({ area, name, status, detail: short(detail, 400) });
  console.log(`${ok ? '✔' : note ? '!' : '✘'} ${name}${detail ? `  (${short(detail, 400)})` : ''}`);
  return !!ok;
}
function short(v, n = 160) {
  const s = typeof v === 'string' ? v : v === undefined ? '' : JSON.stringify(v);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
async function until(fn, ms, every = 250) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) return null;
    await wait(every);
  }
}
const readJson = (p) => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return undefined;
  }
};
const readJsonl = (p) => {
  try {
    return readFileSync(p, 'utf8').split('\n').filter(Boolean).flatMap((l) => {
      try {
        return [JSON.parse(l)];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
};
const encodeCwd = (cwd) => cwd.replace(/[^a-zA-Z0-9]/g, '-');

// ── The Claude Code under test ───────────────────────────────────────────────────────────
const which = (bin) => spawnSync('sh', ['-c', `command -v ${bin}`], { encoding: 'utf8' }).stdout?.trim() ?? '';
const CLAUDE = process.env.CLAUDE_BIN || which('claude');
if (!CLAUDE) {
  console.error('No claude found: install Claude Code or set CLAUDE_BIN.');
  process.exit(2);
}

// ── A pretend Anthropic API (scripts/ci/pretend-api.mjs) ─────────────────────────────────
// It answers following a script keyed by COMPAT:<step> in the latest user message: a Bash
// call, a question, a plan, an intern. A tool result gets a short closing reply. Every
// request is kept for the checks.
const THOUGHT = 'This bug is hiding under the coffee machine again';
const TITLE = 'Fix the flaky login test';
const PLAN = '# Plan\n1. Write plan-ok.txt\n2. Stop there\n';
const INTERN_MS = 6000;
/** Requests seen, tool calls made (id → tool) and what to call once a result comes back. */
const mock = { requests: [], issued: new Map(), then: new Map() };
let toolN = 0;
const toolUse = (name, input) => ({ type: 'tool_use', id: `toolu_compat_${++toolN}_${randomBytes(4).toString('hex')}`, name, input });
const systemText = (j) => (typeof j?.system === 'string' ? j.system : Array.isArray(j?.system) ? j.system.map((b) => b?.text ?? '').join('\n') : '');
const resultText = (b) => (typeof b.content === 'string' ? b.content : Array.isArray(b.content) ? b.content.map((c) => c?.text ?? '').join(' ') : '');

/** A value that fits a JSON schema (structured outputs, such as the session title Claude Code asks Haiku for). */
function fit(schema) {
  if (schema?.type === 'object') return Object.fromEntries(Object.entries(schema.properties ?? {}).map(([k, v]) => [k, k === 'title' ? TITLE : fit(v)]));
  if (schema?.type === 'array') return [];
  if (schema?.type === 'number' || schema?.type === 'integer') return 1;
  if (schema?.type === 'boolean') return true;
  return schema?.enum?.[0] ?? 'compat';
}

function script(j) {
  const tools = (j?.tools ?? []).map((t) => t.name);
  const last = lastUser(j);
  const format = j?.output_config?.format;
  if (format?.type === 'json_schema') return { content: [text(JSON.stringify(fit(format.schema)))] };
  const results = blocks(last).filter((b) => b?.type === 'tool_result');
  const next = results.map((b) => mock.then.get(b.tool_use_id)).find(Boolean);
  if (next) return { content: [next()] };
  if (results.length) return { content: [text(`Done. ${short(results.map(resultText).join(' '), 300)}`)] };
  const said = blocks(last).filter((b) => b?.type === 'text').map((b) => b.text).join('\n');
  if (!tools.length && /Doing now:/.test(said)) return { content: [text(THOUGHT)] };
  const step = said.match(/COMPAT:([a-z-]+)/)?.[1];
  const agent = tools.find((t) => t === 'Agent' || t === 'Task');
  if (step === 'bash' && tools.includes('Bash')) return { content: [toolUse('Bash', { command: 'echo compat-ok > compat-ok.txt', description: 'Leave a compat note' })] };
  if (step === 'question' && tools.includes('AskUserQuestion'))
    return {
      content: [toolUse('AskUserQuestion', { questions: [{ question: 'Tea or coffee?', header: 'Drink', multiSelect: false, options: [{ label: 'Tea', description: 'A cup of tea' }, { label: 'Coffee', description: 'A cup of coffee' }] }] })],
    };
  if (step === 'plan' && tools.includes('ExitPlanMode')) {
    // Like a real model: write the plan to the plan file plan mode names, then ask to leave it
    // (Claude Code reads the file back into the hook's tool_input). Without a plan file, the
    // plan rides in the tool input, as it used to.
    const file = (j.messages ?? []).flatMap(blocks).map((b) => b?.text ?? '').join('\n').match(/\/[^\s"'`<>]*\/plans\/[\w.-]+\.md/)?.[0];
    if (!file || !tools.includes('Write')) return { content: [toolUse('ExitPlanMode', { plan: PLAN })] };
    const write = toolUse('Write', { file_path: file, content: PLAN });
    mock.then.set(write.id, () => toolUse('ExitPlanMode', {}));
    return { content: [write] };
  }
  if (step === 'intern' && agent) return { content: [toolUse(agent, { description: 'Count the paperclips', prompt: 'COMPAT:intern-work Count the paperclips and reply with the number.', subagent_type: 'general-purpose' })] };
  if (step === 'intern-work') return { content: [text('There are 42 paperclips.')], delay: INTERN_MS };
  return { content: [text('Mock reply.')] };
}

/** Keep every request, and the tool calls made in answer, for the checks. */
function record(j, headers, reply) {
  for (const b of reply.content) if (b.type === 'tool_use') mock.issued.set(b.id, b.name);
  const last = lastUser(j);
  mock.requests.push({
    at: Date.now(),
    session: headers['x-claude-code-session-id'],
    model: j.model,
    stream: !!j.stream,
    system: systemText(j),
    tools: (j.tools ?? []).map((t) => t.name),
    said: blocks(last).filter((b) => b?.type === 'text').map((b) => b.text).join('\n'),
    // What a person (or the office) typed, without Claude Code's <system-reminder> blocks.
    prompt: blocks(last).filter((b) => b?.type === 'text' && !b.text.trimStart().startsWith('<')).map((b) => b.text).join('\n'),
    results: blocks(last).filter((b) => b?.type === 'tool_result').map((b) => ({ id: b.tool_use_id, text: resultText(b), isError: !!b.is_error })),
    reply: reply.content.map((b) => (b.type === 'text' ? `text: ${b.text}` : `${b.name} ${b.id}`)),
  });
  return reply;
}
/** The tool result Claude Code sent back for a tool call the mock made, once it has. */
const resultFor = (id) => mock.requests.flatMap((r) => r.results).find((r) => r.id === id);
const issuedId = (name) => [...mock.issued].filter(([, n]) => n === name).map(([id]) => id).at(-1);

// ── An office of its own, and a Claude Code that talks to the mock ─────────────────────────
const home = makeHome('office-compat-');
const KEY = `sk-ant-api03-compat-${randomBytes(12).toString('hex')}`;
const api = await startPretendApi((j, headers) => record(j, headers, script(j)), { usage: { input_tokens: 1234, cache_creation_input_tokens: 100, cache_read_input_tokens: 200, output_tokens: 20 } });
const env = {
  ...home.env,
  ANTHROPIC_BASE_URL: api.base,
  ANTHROPIC_API_KEY: KEY,
  // No updates, telemetry, feature-flag fetches, marketplace installs or prompt suggestions:
  // the same requests on every run.
  DISABLE_AUTOUPDATER: '1',
  DISABLE_TELEMETRY: '1',
  DISABLE_ERROR_REPORTING: '1',
  CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL: '1',
  CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION: 'false',
};
const claude = (args) => spawnSync(CLAUDE, args, { env, cwd: home.home, encoding: 'utf8', timeout: 60_000 });
const project = join(home.home, 'compat-desk');
mkdirSync(project);
const git = (...a) => spawnSync('git', ['-C', project, '-c', 'user.name=Compat', '-c', 'user.email=compat@example.invalid', ...a], { env, encoding: 'utf8' });
git('init', '-q', '-b', 'compat-branch');
writeFileSync(join(project, 'README.md'), 'A desk for the compat check.\n');
git('add', '.');
git('commit', '-q', '-m', 'A desk');

let office;
let feed;
let presence;
let version = '';
const hires = [];
const notices = [];
try {
  // ── The command line ───────────────────────────────────────────────────────────────────
  const v = claude(['--version']);
  version = v.stdout?.match(/\d+\.\d+\.\d+[\w.-]*/)?.[0] ?? '';
  section(`Claude Code ${version || '?'}: the command line`);
  check('claude --version', v.status === 0 && !!version, short(v.stdout?.trim() || v.stderr || v.error?.message));
  const help = claude(['--help']).stdout ?? '';
  const defined = new Set();
  const commands = new Set();
  let inCommands = false;
  for (const line of help.split('\n')) {
    if (/^Commands:/.test(line)) inCommands = true;
    const flag = line.match(/^ {2}(--?[\w-]+(?:, --?[\w-]+)*)/);
    if (flag && !inCommands) for (const f of flag[1].split(', ')) defined.add(f);
    const cmd = inCommands && line.match(/^ {2}([a-z][\w-]*(?:\|[\w-]+)*)/);
    if (cmd) for (const c of cmd[1].split('|')) commands.add(c);
  }
  /** Every flag the office passes to claude, and what for. */
  const CONTRACT = {
    '--session-id': 'hire with a session id the office chose',
    '-n': 'hire with the name the manager typed',
    '--permission-mode': 'hire in manual, plan or acceptEdits mode',
    '--resume': 'call back a past session',
    '-p': 'thought bubbles',
    '--model': 'thought bubbles on Haiku',
    '--no-session-persistence': 'thought bubbles leave no session behind',
    '--tools': 'thought bubbles get no tools',
    '--setting-sources': 'thought bubbles ignore your settings',
    '--strict-mcp-config': 'thought bubbles get no MCP servers',
    '--system-prompt': "thought bubbles use the office's own prompt",
  };
  const missing = Object.keys(CONTRACT).filter((f) => !defined.has(f));
  check(`every flag the office passes is in claude --help (${Object.keys(CONTRACT).length})`, defined.size > 0 && !missing.length, missing.map((f) => `${f}: ${CONTRACT[f]}`).join('; ') || [...Object.keys(CONTRACT)].join(' '));
  // The server and this check must agree on that list: a new flag in server/ needs a line above.
  const passed = ['tmux.ts', 'thoughts.ts'].flatMap((f) => [...readFileSync(join(ROOT, 'server', f), 'utf8').matchAll(/'(--[a-z][a-z-]*)'/g)].map((m) => m[1]));
  const unchecked = [...new Set(passed)].filter((f) => !(f in CONTRACT));
  check('compat.mjs knows every --flag server/tmux.ts and server/thoughts.ts pass', !unchecked.length, unchecked.length ? `add to CONTRACT: ${unchecked.join(', ')}` : '');

  // From here on, server modules run in this process (tsx): HOME and PATH must be the test's.
  for (const k of Object.keys(process.env)) if (!(k in env)) delete process.env[k];
  Object.assign(process.env, env, { CLAUDE_BIN: CLAUDE });
  const { register } = await import('tsx/esm/api');
  register();
  const { HIRE_PERMISSION_MODES } = await import('../shared/protocol.ts');
  const modes = help.match(/--permission-mode <mode>[\s\S]*?\(choices:([^)]*)\)/)?.[1].match(/"([^"]+)"/g)?.map((s) => s.slice(1, -1)) ?? [];
  if (modes.length) check(`--permission-mode takes every mode a hire can start in (${HIRE_PERMISSION_MODES.join(', ')})`, HIRE_PERMISSION_MODES.every((m) => modes.includes(m)), `choices: ${modes.join(', ')}`);
  else check('--permission-mode lists its choices in --help', false, 'no "(choices: …)" found; the hires below still try manual and plan', { note: true });
  check('claude setup-token exists (CONTRIBUTING: the compat bot\'s secret)', commands.has('setup-token'), '', { note: true });

  // ── Thought bubbles ────────────────────────────────────────────────────────────────────
  section('Thought bubbles: claude -p with no tools, no settings, nothing saved (server/thoughts.ts)');
  {
    const { initTmux } = await import('../server/tmux.ts');
    await initTmux();
    const { THINK_DIR } = await import('../server/config.ts');
    const { ThoughtService } = await import('../server/thoughts.ts');
    mkdirSync(THINK_DIR, { recursive: true });
    const worker = { sessionId: '5e1f0c2a-9d3b-4c7e-8a6f-1b2c3d4e5f60', displayName: 'Clyde', project: 'compat-desk', state: 'working', title: 'Keep the office compatible', activity: { kind: 'typing', label: 'Editing compat.ts' }, lastText: 'Checking the hooks.' };
    const svc = new ThoughtService(() => [worker], () => true);
    let thought = null;
    svc.on('thought', (t) => (thought = t));
    const warned = [];
    const warn = console.warn;
    console.warn = (...a) => warned.push(a.join(' '));
    // A thinker registers as a live session for a moment: note which folder it says it's in.
    const seen = new Set();
    const sessions = join(home.claudeHome, 'sessions');
    const watch = setInterval(() => {
      for (const f of readdirSync(sessions).filter((x) => /^\d+\.json$/.test(x))) {
        const e = readJson(join(sessions, f));
        if (e?.cwd) seen.add(e.cwd);
      }
    }, 50);
    const before = mock.requests.length;
    await svc.tick();
    clearInterval(watch);
    console.warn = warn;
    const call = mock.requests.slice(before).find((r) => /Doing now:/.test(r.said));
    check('a thought comes back as one plain line', thought?.text === THOUGHT, thought ? thought.text : warned.join(' ') || 'no thought');
    check('on Haiku (--model haiku)', /haiku/i.test(call?.model ?? ''), call?.model ?? 'no request');
    check('with no tools (--tools "")', !!call && call.tools.length === 0, call ? `${call.tools.length} tools` : 'no request');
    const source = readFileSync(join(ROOT, 'server', 'thoughts.ts'), 'utf8').match(/const SYSTEM = \[([\s\S]*?)\]\.join\(' '\)/)?.[1];
    const ours = source ? [...source.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\'/g, "'")).join(' ') : '';
    check("on the office's own system prompt, not Claude Code's (--system-prompt)", !!call && !!ours && call.system.includes(ours) && !/interactive agent that helps users/i.test(call.system), ours ? short(call?.system.split('\n').at(-1)) : 'SYSTEM not found in thoughts.ts');
    check("with what they're doing in the prompt", !!call && call.said.includes('Name: Clyde') && call.said.includes('Doing now: Editing compat.ts'), short(call?.prompt.replace(/\n/g, ' / ')));
    check('nothing saved (--no-session-persistence)', !existsSync(join(home.claudeHome, 'projects', encodeCwd(THINK_DIR))), encodeCwd(THINK_DIR));
    const strays = [...seen].filter((c) => c !== THINK_DIR);
    if (seen.size) check('the thinker registers in its own folder, which the roster skips', !strays.length, strays.length ? `registered in ${strays.join(', ')}, not ${THINK_DIR}` : THINK_DIR);
    else check('the thinker registers in its own folder, which the roster skips', false, 'it never showed up in ~/.claude/sessions while it ran', { note: true });
  }

  // ── The installers and the office ─────────────────────────────────────────────────────
  section('Opt-in installers: npm run hooks:install and statusline:install');
  const settingsPath = join(home.claudeHome, 'settings.json');
  const hi = spawnSync(process.execPath, [join(ROOT, 'scripts', 'hooks.mjs'), 'install'], { env, encoding: 'utf8' });
  const hooks = readJson(settingsPath)?.hooks;
  check('hooks:install adds PermissionRequest (*) and PreToolUse (AskUserQuestion|ExitPlanMode)', hi.status === 0 && hooks?.PermissionRequest?.some((g) => g.matcher === '*') && hooks?.PreToolUse?.some((g) => g.matcher === 'AskUserQuestion|ExitPlanMode'), short(hi.stdout.trim() || hi.stderr));
  const si = spawnSync(process.execPath, [join(ROOT, 'scripts', 'statusline.mjs'), 'install'], { env, encoding: 'utf8' });
  const settings = readJson(settingsPath);
  check('statusline:install points the status line at statusline-tap.mjs', si.status === 0 && /statusline-tap\.mjs/.test(settings?.statusLine?.command ?? ''), short(si.stdout.trim() || si.stderr));
  // Next to the office's own hooks, one that only records what Claude Code sends.
  const hookLog = join(home.dir, 'hook-events.jsonl');
  const recorder = join(home.dir, 'record-hook.mjs');
  writeFileSync(recorder, "let s = '';\nprocess.stdin.setEncoding('utf8');\nfor await (const c of process.stdin) s += c;\nimport('node:fs').then((fs) => fs.appendFileSync(process.argv[2], s.replace(/\\n/g, ' ') + '\\n'));\n");
  for (const g of [...(settings?.hooks?.PermissionRequest ?? []), ...(settings?.hooks?.PreToolUse ?? [])]) g.hooks.push({ type: 'command', command: `"${process.execPath}" "${recorder}" "${hookLog}"`, timeout: 30 });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  const hookEvents = () => readJsonl(hookLog);
  // Onboarding done, and the API key approved (an env key is used once you say yes to it).
  writeFileSync(join(home.claudeHome, '.claude.json'), JSON.stringify({ hasCompletedOnboarding: true, lastOnboardingVersion: version, lastReleaseNotesSeen: version, theme: 'dark', customApiKeyResponses: { approved: [KEY.slice(-20)], rejected: [] } }, null, 2));

  const port = Number(process.env.PORT) || (await freePort());
  office = await startOffice({ home, port, env: { ...env, CLAUDE_BIN: CLAUDE } });
  const base = office.base;
  const call = async (path, body) => {
    const res = await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify(body) });
    let json = null;
    try {
      json = await res.json();
    } catch {
      // not JSON
    }
    return { status: res.status, json };
  };
  const me = async (id) => (await call('/api/roster')).json?.find?.((e) => e.sessionId === id);
  // A manager looking at the game, so the office holds questions for an in-game answer.
  feed = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { Origin: base } });
  feed.on('message', (d) => {
    const m = JSON.parse(String(d));
    if (m.type === 'notice') notices.push(m.text);
  });
  feed.on('error', () => {});
  const here = () => feed.readyState === WebSocket.OPEN && feed.send(JSON.stringify({ type: 'presence', visible: true, lastInputAt: Date.now(), canAnswer: true, thoughts: false }));
  await until(() => feed.readyState === WebSocket.OPEN, 5000, 50);
  here();
  presence = setInterval(here, 5000);
  const screen = (tmuxName) => {
    try {
      return home.tmux('capture-pane', '-p', '-t', `=${tmuxName}:`);
    } catch {
      return '';
    }
  };
  const TRUST = /trust (the files in )?this folder|Do you trust/i;
  const hire = async (name, permissionMode, prompt) => {
    const r = await call('/api/hire', { cwd: project, name, permissionMode, prompt });
    const sid = r.json?.sessionId;
    if (sid) hires.push(sid);
    return { r, sid, tmuxName: sid ? `office-${sid.slice(0, 8)}` : '' };
  };
  const idle = (sid) => until(async () => (await me(sid))?.state === 'idle', 45_000, 500);
  const sessionsDir = join(home.claudeHome, 'sessions');
  const registryFor = (sid) => {
    for (const f of readdirSync(sessionsDir).filter((x) => /^\d+\.json$/.test(x))) {
      const e = readJson(join(sessionsDir, f));
      if (e?.sessionId === sid) return e;
    }
    return null;
  };
  const transcriptPath = (sid) => join(home.claudeHome, 'projects', encodeCwd(project), `${sid}.jsonl`);

  // ── Hiring ────────────────────────────────────────────────────────────────────────────
  section('Hiring: tmux, the trust dialog and the terminal');
  const a = await hire('Compat Tester', 'manual', 'COMPAT:bash Leave a compat note, please.');
  check('POST /api/hire (manual mode, with a first prompt)', a.r.status === 200 && !!a.sid, `${a.r.status} ${short(a.r.json)}`);
  if (!a.sid) throw new Error('nobody was hired');
  const trust = await until(async () => {
    const e = await me(a.sid);
    return e?.state === 'needs-you' && e.waitingFor === 'Trust this folder?' ? e : null;
  }, 45_000);
  check('a new folder: the trust dialog is spotted on their screen (needs you: "Trust this folder?")', !!trust, trust ? '' : short(screen(a.tmuxName).split('\n').filter((l) => l.trim()).slice(-8).join(' | '), 400));
  // Sit at their computer: pick "Yes" with the keys the in-game terminal would send.
  const term = new WebSocket(`ws://127.0.0.1:${port}/term?id=${a.sid}&kind=claude&cols=160&rows=48`, { headers: { Origin: base } });
  let termOut = '';
  term.on('message', (d) => (termOut += d));
  term.on('error', () => {});
  await until(() => termOut.length > 0 || term.readyState > WebSocket.OPEN, 8000, 100);
  check('/term attaches to their tmux session and streams it', termOut.length > 0, term.readyState > WebSocket.OPEN ? 'closed' : '');
  for (let i = 0; i < 6; i++) {
    const cursor = screen(a.tmuxName).split('\n').findLast((l) => /^\s*❯\s+\S/.test(l)) ?? '';
    if (/\byes\b/i.test(cursor)) {
      term.send(JSON.stringify({ t: 'in', d: '\r' }));
      break;
    }
    if (!cursor) break;
    term.send(JSON.stringify({ t: 'in', d: '\x1b[B' }));
    await wait(400);
  }
  const trusted = await until(() => !TRUST.test(screen(a.tmuxName)), 15_000);
  check('keys typed through /term answer it ("Yes, I trust this folder")', !!trusted, trusted ? '' : short(screen(a.tmuxName).split('\n').filter((l) => l.trim()).slice(-6).join(' | ')));
  term.close();

  section('The session registry: ~/.claude/sessions/<pid>.json');
  // Claude Code writes the entry first and its status a moment later: wait for both.
  const reg = (await until(() => {
    const e = registryFor(a.sid);
    return typeof e?.status === 'string' ? e : null;
  }, 30_000)) ?? registryFor(a.sid);
  check('their registry entry appears, under their session id (--session-id)', !!reg, reg ? `${reg.pid}.json` : readdirSync(sessionsDir).join(', '));
  if (reg) {
    const types = { pid: 'number', sessionId: 'string', cwd: 'string', startedAt: 'number', status: 'string', statusUpdatedAt: 'number' };
    const wrong = Object.entries(types).filter(([k, t]) => typeof reg[k] !== t);
    check('pid, sessionId, cwd, startedAt, status and statusUpdatedAt', !wrong.length, wrong.map(([k, t]) => `${k}: ${typeof reg[k]}, want ${t}`).join('; ') || short(Object.fromEntries(Object.keys(types).map((k) => [k, reg[k]]))));
    check('cwd is the folder they were hired in', reg.cwd === project, reg.cwd);
    check('status is busy, idle or waiting', ['busy', 'idle', 'waiting'].includes(reg.status), reg.status);
    check('name is the one they were hired with (-n), chosen by a person', reg.name === 'Compat Tester' && reg.nameSource === 'user', `${reg.name} / ${reg.nameSource}`);
    check('kind and entrypoint', typeof reg.kind === 'string' && typeof reg.entrypoint === 'string', `${reg.kind} / ${reg.entrypoint}`, { note: true });
    check('version is this Claude Code', reg.version === version, reg.version, { note: true });
    const lstart = spawnSync('ps', ['-o', 'lstart=', '-p', String(reg.pid)], { env: { ...process.env, TZ: 'UTC' }, encoding: 'utf8' }).stdout.replace(/\s+/g, ' ').trim();
    const squashed = String(reg.procStart ?? '').replace(/\s+/g, ' ').trim();
    let ticks = '';
    try {
      const stat = readFileSync(`/proc/${reg.pid}/stat`, 'utf8');
      ticks = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
    } catch {
      // not Linux
    }
    const comm = spawnSync('ps', ['-o', 'comm=', '-p', String(reg.pid)], { encoding: 'utf8' }).stdout.trim();
    // macOS writes ps's lstart in UTC, Linux the start time in clock ticks (/proc/<pid>/stat
    // field 22): either one, matching this very process, proves to the office a pid wasn't reused.
    const format = squashed === lstart ? 'ps lstart in UTC' : ticks && squashed === ticks ? '/proc start ticks' : '';
    check(
      "procStart is this process's start time: `ps` lstart in UTC (macOS) or /proc start ticks (Linux), the office's proof a pid wasn't reused",
      !!format,
      format
        ? `${format}: ${squashed}`
        : `procStart ${JSON.stringify(reg.procStart)} vs lstart "${lstart}"${ticks ? ` and start ticks ${ticks}` : ''}: ${ticks && /^\d+$/.test(squashed) ? "the office takes it for a reused pid and won't show this session" : `the office falls back to the process name (${comm})`}`,
      { note: true },
    );
  }
  const emp = await until(async () => {
    const e = await me(a.sid);
    return reg && e?.pid === reg.pid ? e : null;
  }, 15_000);
  const seat = emp ?? (await me(a.sid));
  check('in the office: hosted (their registry pid is their tmux pane), by the name they were hired with', emp?.hosted === true && emp.displayName === 'Compat Tester', seat ? `${seat.displayName}, hosted ${seat.hosted}, pid ${seat.pid}, ${seat.state}` : 'not in the roster');

  // ── Permission prompts ─────────────────────────────────────────────────────────────────
  section('Permission prompts: the PermissionRequest hook');
  const asked = await until(async () => {
    const e = await me(a.sid);
    return e?.ask?.kind === 'permission' ? e : null;
  }, 45_000);
  check('their Bash call raises an in-game ask (hook → office-hook.mjs → /api/hook, held)', asked?.ask.title === 'Run a command?' && asked.ask.detail.includes('echo compat-ok'), asked ? `${asked.ask.title} ${asked.ask.detail.replace(/\n/g, ' ')}` : (await me(a.sid))?.state);
  const ids = asked?.ask.options.map((o) => o.id) ?? [];
  check('with Allow, Deny and Answer in their terminal', ['allow', 'deny', 'terminal'].every((x) => ids.includes(x)), ids.join(', '));
  check('and Always allow… from permission_suggestions', ids.some((x) => x.startsWith('always:')), asked?.ask.options.map((o) => o.label).join(' / '), { note: true });
  const raw = hookEvents().find((h) => h.hook_event_name === 'PermissionRequest' && h.session_id === a.sid);
  check('the payload: session_id, hook_event_name, tool_name, tool_input, cwd, permission_mode', !!raw && raw.tool_name === 'Bash' && typeof raw.tool_input?.command === 'string' && raw.cwd === project && typeof raw.permission_mode === 'string', short(raw && Object.keys(raw)));
  check('permission_suggestions is a list of permission updates', Array.isArray(raw?.permission_suggestions) && raw.permission_suggestions.every((s) => typeof s?.type === 'string'), short(raw?.permission_suggestions), { note: true });
  if (asked) {
    const ok = await call('/api/answer', { sessionId: a.sid, askId: asked.ask.id, choice: 'allow' });
    check('POST /api/answer: Allow', ok.status === 200, `${ok.status} ${short(ok.json)}`);
    const ran = await until(() => existsSync(join(project, 'compat-ok.txt')), 20_000);
    check("Claude Code takes the hook's decision: the command ran", !!ran);
    check('and its result went back to the model', !!(await until(() => resultFor(issuedId('Bash')), 15_000)));
  }
  const done = await idle(a.sid);
  check('the turn ends: registry status idle → idle in the office', !!done, (await me(a.sid))?.state);

  section('Transcripts: what the office reads from ~/.claude/projects');
  check('the transcript is in the project folder Claude Code names after the cwd', existsSync(transcriptPath(a.sid)), transcriptPath(a.sid).replace(home.home, '~'));
  // The office looks for a new session's transcript every few seconds: give it time to read this one.
  const chatterLines = async () => ((await call(`/api/session/${a.sid}/chatter?n=50`)).json ?? []).map((l) => `${l.role}: ${l.text}`);
  const lines = (await until(async () => {
    const l = await chatterLines();
    return l.some((x) => x.startsWith('assistant: Done.')) ? l : null;
  }, 15_000)) ?? (await chatterLines());
  check('chatter: their prompt', lines.some((l) => l === 'user: COMPAT:bash Leave a compat note, please.'), short(lines));
  check('chatter: the tool call, by its description', lines.some((l) => l === 'tool: Leave a compat note'), short(lines));
  check("chatter: the model's reply", lines.some((l) => l.startsWith('assistant: Done.')), short(lines));
  const now = (await until(async () => {
    const e = await me(a.sid);
    return e?.model && e.branch && e.lastPrompt ? e : null;
  }, 10_000)) ?? (await me(a.sid));
  const mainModel = mock.requests.filter((r) => r.session === a.sid && r.tools.length).at(-1)?.model;
  check('model and git branch from the transcript', now?.model === mainModel && now?.branch === 'compat-branch', `${now?.model} vs ${mainModel}; ${now?.branch}`);
  check('lastPrompt (last-prompt entries)', now?.lastPrompt === 'COMPAT:bash Leave a compat note, please.', now?.lastPrompt, { note: true });
  const fill = await until(async () => (await call('/api/stats')).json?.context?.find((c) => c.sessionId === a.sid && c.tokens === 1534), 10_000);
  check('Team Room context fill: input + cache tokens from the last reply', !!fill, short(fill ?? (await call('/api/stats')).json?.context));
  const entries = readJsonl(transcriptPath(a.sid));
  const kinds = [...new Set(entries.map((e) => e.type))];
  check('entry types', kinds.includes('user') && kinds.includes('assistant'), kinds.join(', '), { note: true });
  const turns = entries.filter((e) => e.type === 'user' || e.type === 'assistant');
  const odd = turns.filter((e) => typeof e.timestamp !== 'string' || typeof e.cwd !== 'string' || typeof e.isSidechain !== 'boolean');
  check('user and assistant entries carry timestamp, cwd and isSidechain', turns.length > 0 && !odd.length, odd.length ? short(Object.keys(odd[0])) : `${turns.length} entries`);
  check('cost-state entries (cost and lines changed)', kinds.includes('cost-state'), kinds.includes('cost-state') ? '' : "none in this run (the office reads them when they're there)", { note: true });

  section('The status line: what Claude Code pipes to statusline-tap.mjs');
  const tap = await until(() => readJson(join(home.home, '.claude-office', 'statusline.json')), 15_000);
  check('the tap saved a snapshot', !!tap?.data && typeof tap.savedAt === 'number', short(tap && Object.keys(tap.data ?? {})));
  check('model.id and context_window.context_window_size (Team Room context gauges)', typeof tap?.data?.model?.id === 'string' && typeof tap?.data?.context_window?.context_window_size === 'number', short({ model: tap?.data?.model, context_window: tap?.data?.context_window }));
  check('rate_limits (plan gauges)', !!tap?.data?.rate_limits, 'only with a claude.ai login; not checked here', { note: true });

  // ── Questions ───────────────────────────────────────────────────────────────────────────
  section('Questions: the PreToolUse hook for AskUserQuestion');
  const said = await call('/api/say', { sessionId: a.sid, text: 'COMPAT:question Ask me something.' });
  check('POST /api/say pastes into their terminal', said.status === 200, `${said.status} ${short(said.json)}`);
  const q = await until(async () => {
    const e = await me(a.sid);
    return e?.ask?.kind === 'question' ? e.ask : null;
  }, 45_000);
  check('their question shows in the game with its options', q?.questions?.[0]?.question === 'Tea or coffee?' && q.questions[0].options.map((o) => o.label).join() === 'Tea,Coffee', q ? `${q.title}: ${q.questions?.[0]?.options.map((o) => o.label).join(' / ')}` : (await me(a.sid))?.state);
  const rawQ = hookEvents().find((h) => h.hook_event_name === 'PreToolUse' && h.tool_name === 'AskUserQuestion' && h.session_id === a.sid);
  check('the payload: tool_input.questions', Array.isArray(rawQ?.tool_input?.questions), short(rawQ && Object.keys(rawQ)));
  if (q) {
    const ok = await call('/api/answer', { sessionId: a.sid, askId: q.id, choice: 'answer', answers: { 'Tea or coffee?': 'Tea' } });
    check('POST /api/answer: Tea', ok.status === 200, `${ok.status} ${short(ok.json)}`);
    const back = await until(() => resultFor(issuedId('AskUserQuestion')), 20_000);
    check('the answer reaches the model as the tool result (allow + updatedInput.answers)', !!back && /Tea/.test(back.text) && !back.isError, short(back?.text));
  }
  check('the turn ends', !!(await idle(a.sid)), (await me(a.sid))?.state);

  // ── Interns ─────────────────────────────────────────────────────────────────────────────
  section('Interns: subagents/agent-*.jsonl and .meta.json');
  await call('/api/say', { sessionId: a.sid, text: 'COMPAT:intern Get an intern on it.' });
  const busy = await until(async () => {
    const e = await me(a.sid);
    if (e?.ask?.kind === 'permission') await call('/api/answer', { sessionId: a.sid, askId: e.ask.id, choice: 'allow' });
    return e?.interns?.length ? e : null;
  }, 30_000);
  const intern = busy?.interns?.[0];
  check('a subagent at work shows up as their intern', intern?.description === 'Count the paperclips' && intern.type === 'general-purpose', short(intern ?? (await me(a.sid))?.interns));
  const subDir = join(home.claudeHome, 'projects', encodeCwd(project), a.sid, 'subagents');
  const meta = existsSync(subDir) ? readdirSync(subDir).filter((f) => f.endsWith('.meta.json')).map((f) => readJson(join(subDir, f))).find(Boolean) : undefined;
  check('its meta.json: agentType, description, toolUseId', typeof meta?.agentType === 'string' && typeof meta?.description === 'string' && typeof meta?.toolUseId === 'string', short(meta));
  const gone = await until(async () => {
    const e = await me(a.sid);
    return resultFor(issuedId('Agent') ?? issuedId('Task')) && e && !e.interns.length ? e : null;
  }, 30_000);
  check('and goes home once their report is in', !!gone, short((await me(a.sid))?.interns));
  await idle(a.sid);

  // ── Letting go and calling back ─────────────────────────────────────────────────────────
  section('Letting go and calling back: --resume');
  const fired = await call('/api/fire', { sessionId: a.sid });
  check('POST /api/fire', fired.status === 200, `${fired.status} ${short(fired.json)}`);
  check('they leave the office', !!(await until(async () => !(await me(a.sid)), 20_000)));
  const back = await call('/api/rehire', { sessionId: a.sid });
  check('POST /api/rehire finds their personnel file', back.status === 200, `${back.status} ${short(back.json)}`);
  const returned = await until(async () => {
    const e = await me(a.sid);
    return e?.hosted && e.pid > 0 && e.state === 'idle' ? e : null;
  }, 45_000);
  const seat2 = returned ?? (await me(a.sid));
  check('claude --resume brings the same session back in, at a desk in the office', !!returned, seat2 ? `${seat2.displayName}, hosted ${seat2.hosted}, pid ${seat2.pid}, ${seat2.state}` : short(screen(a.tmuxName).split('\n').filter((l) => l.trim()).slice(-4)));
  const again = await until(async () => {
    const t = ((await call(`/api/session/${a.sid}/chatter?n=50`)).json ?? []).map((l) => l.text);
    return t.includes('COMPAT:bash Leave a compat note, please.') ? t : null;
  }, 10_000);
  check('with their chatter from before', !!again, short(again ?? ((await call(`/api/session/${a.sid}/chatter?n=50`)).json ?? []).map((l) => l.text)));
  await call('/api/fire', { sessionId: a.sid });

  // ── Plan mode ───────────────────────────────────────────────────────────────────────────
  section('Plan mode: --permission-mode plan and the PreToolUse hook for ExitPlanMode');
  const b = await hire('Compat Planner', 'plan', 'COMPAT:plan Plan it out.');
  check('POST /api/hire (plan mode)', b.r.status === 200 && !!b.sid, `${b.r.status} ${short(b.r.json)}`);
  const plan = b.sid
    ? await until(async () => {
        const e = await me(b.sid);
        // Writing the plan file is plan mode's one allowed edit; allow it if it's asked about.
        if (e?.ask?.kind === 'permission') await call('/api/answer', { sessionId: b.sid, askId: e.ask.id, choice: 'allow' });
        return e?.ask?.kind === 'plan' ? e.ask : null;
      }, 45_000)
    : null;
  check('their plan shows in the game for approval, plan text and all', plan?.title === 'Approve this plan?' && plan.detail.includes('Write plan-ok.txt'), plan ? `${plan.title} ${plan.detail.replace(/\n/g, ' ')}` : short(b.sid && screen(b.tmuxName).split('\n').filter((l) => l.trim()).slice(-6)));
  const rawP = hookEvents().find((h) => h.hook_event_name === 'PreToolUse' && h.tool_name === 'ExitPlanMode' && h.session_id === b.sid);
  check('the payload: tool_input.plan, read back from the plan file', typeof rawP?.tool_input?.plan === 'string' && rawP.tool_input.plan.includes('Write plan-ok.txt'), short(rawP?.tool_input));
  if (plan) {
    const ok = await call('/api/answer', { sessionId: b.sid, askId: plan.id, choice: 'approve' });
    check('POST /api/answer: Approve plan', ok.status === 200, `${ok.status} ${short(ok.json)}`);
    const res = await until(() => resultFor(issuedId('ExitPlanMode')), 20_000);
    check('Claude Code takes the approval (allow + updatedInput): plan mode ends', !!res && !res.isError, short(res?.text));
  }
  const modes2 = b.sid ? readJsonl(transcriptPath(b.sid)).filter((e) => e.type === 'permission-mode').map((e) => e.permissionMode) : [];
  check('the transcript has it starting in plan mode', modes2[0] === 'plan', modes2.join(' → '), { note: true });
  if (b.sid) await call('/api/fire', { sessionId: b.sid });

  // ── Your own sessions ──────────────────────────────────────────────────────────────────
  section('Your own sessions: one started in a terminal of its own');
  // Started the way you would: no name, no flags, in a tmux session the office doesn't own.
  const own = 'my-terminal';
  home.tmux('new-session', '-d', '-s', own, '-x', '160', '-y', '48', '-c', project, ...Object.entries(env).filter(([k]) => /^(ANTHROPIC_|DISABLE_|CLAUDE_CODE_)/.test(k)).flatMap(([k, v]) => ['-e', `${k}=${v}`]), '--', CLAUDE, 'COMPAT:hello Please fix the flaky login test');
  const outside = await until(async () => ((await call('/api/roster')).json ?? []).find((e) => !hires.includes(e.sessionId) && e.cwd === project && e.pid > 0), 30_000);
  check('they walk into the office by themselves (registry entry, a claude process)', !!outside, outside ? `${outside.displayName}, ${outside.state}` : short(screen(own).split('\n').filter((l) => l.trim()).slice(-4)));
  check('not hosted: they work in their own terminal', outside?.hosted === false, outside ? `hosted ${outside.hosted}` : '');
  const titled = outside && (await until(async () => ((await me(outside.sessionId))?.title === TITLE ? true : null), 20_000));
  check('their title is the one Claude Code gave the session (ai-title entries)', !!titled, outside ? (await me(outside.sessionId))?.title : '');
  try {
    home.tmux('kill-session', '-t', `=${own}`);
  } catch {
    // already gone
  }
  if (outside) check('and they go home when their terminal closes', !!(await until(async () => !(await me(outside.sessionId)), 20_000)));
} catch (err) {
  check('the check ran to the end', false, err instanceof Error ? err.stack?.split('\n').slice(0, 3).join(' / ') : String(err));
} finally {
  clearInterval(presence);
  feed?.terminate();
  if (notices.length) console.log(`\nOffice notices:\n${notices.map((n) => `  ${n}`).join('\n')}`);
  const failed = results.filter((r) => r.status === 'fail');
  if (failed.length && office) console.log(`\nOffice log (last 25 lines):\n${office.log().split('\n').slice(-25).join('\n')}`);
  await office?.stop();
  api.close();
  home.cleanup();
}

// ── The input box: Say (scripts/ci/say/) ─────────────────────────────────────────────────
// Each in a process of its own: server/tmux.ts on synthetic screens, then a real Claude Code
// through an office of its own. They print their results as JSON; a crash is a failed check.
async function sayChecks(file, minutes) {
  const child = spawn(process.execPath, ['--import', 'tsx', `scripts/ci/say/${file}`, '--json'], { cwd: ROOT, env: cleanEnv({ CLAUDE_BIN: CLAUDE }), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  let err = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (err += d));
  // Past its time, it's stopped, and still reports what it found (and that it was stopped).
  let late = '';
  const limit = setTimeout(() => {
    late = `still going after ${minutes} min, so compat.mjs stopped it`;
    child.kill('SIGINT');
    setTimeout(() => child.kill('SIGKILL'), 60_000).unref();
  }, minutes * 60_000);
  const code = await new Promise((resolve) => child.on('close', resolve));
  clearTimeout(limit);
  try {
    const got = JSON.parse(out.trim().split('\n').at(-1));
    if (Array.isArray(got)) return late ? got.map((r) => (/^stopped from outside/.test(r.detail) ? { ...r, detail: late } : r)) : got;
  } catch {
    // reported below
  }
  return [{ group: `scripts/ci/say/${file}`, name: 'ran to the end', ok: false, detail: late || err.trim().split('\n').slice(-3).join(' / ') || `exit ${code}, no results` }];
}
if (process.env.COMPAT_SAY !== '0') {
  section('Say on synthetic screens: what server/tmux.ts reads off the box (scripts/ci/say/synthetic.mjs)');
  const synthetic = await sayChecks('synthetic.mjs', 2);
  for (const group of new Set(synthetic.map((r) => r.group))) {
    const rs = synthetic.filter((r) => r.group === group);
    for (const r of rs.filter((x) => !x.ok)) check(`${group}: ${r.name}`, false, r.detail, { note: r.note });
    const good = rs.filter((x) => x.ok).length;
    if (good) check(`${group}: ${good === rs.length ? 'all' : 'the other'} ${good}`, true);
  }
  for (const r of await sayChecks('live.mjs', 8)) {
    if (r.group !== area) section(r.group);
    check(r.name, r.ok, r.detail, { note: r.note });
  }
}

// ── The report ───────────────────────────────────────────────────────────────────────────
const failed = results.filter((r) => r.status === 'fail');
const report = {
  claude: { version, path: CLAUDE },
  platform: `${process.platform}-${process.arch}`,
  node: process.version,
  seconds: Math.round((Date.now() - t0) / 1000),
  results,
  notices,
  // What the pretend API was asked, for working out a failure.
  requests: mock.requests.map((r) => ({ session: r.session, model: r.model, tools: r.tools.length, prompt: short(r.prompt, 160), results: r.results.map((x) => ({ ...x, text: short(x.text, 160) })), reply: r.reply })),
};
if (opt('json')) writeFileSync(opt('json'), JSON.stringify(report, null, 2));
if (opt('markdown')) writeFileSync(opt('markdown'), markdown(report));
const notes = results.filter((r) => r.status === 'note').length;
console.log(`\n${failed.length ? `${failed.length} check(s) failed` : 'Compatible'}: ${results.length - failed.length - notes} passed, ${notes} note(s), Claude Code ${version || '?'}, ${report.seconds} s`);
process.exit(failed.length ? 1 : 0);

function markdown(report) {
  const mark = { pass: 'pass', fail: '**FAIL**', note: 'note' };
  const rows = [];
  let last = '';
  for (const r of report.results) {
    if (r.area !== last) rows.push(`| | **${r.area}** | |`);
    last = r.area;
    rows.push(`| ${mark[r.status]} | ${r.name.replace(/\|/g, '\\|')} | ${r.detail.replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`);
  }
  const failed = report.results.filter((r) => r.status === 'fail').length;
  return [
    `**${failed ? `${failed} check(s) failed` : 'All checks passed'}** against Claude Code ${report.claude.version} (${report.platform}, ${report.seconds} s, ${report.requests.length} requests to the pretend API).`,
    '',
    '| | Check | Detail |',
    '| --- | --- | --- |',
    ...rows,
    ...(report.notices.length ? ['', 'Office notices:', ...report.notices.map((n) => `- ${n}`)] : []),
    '',
  ].join('\n');
}

