// Say against a real Claude Code: POST /api/say through an office of its own (scripts/ci/office.mjs:
// its own HOME and ~/.claude, a private tmux server, a free port), with Claude Code talking to a
// pretend Anthropic API (scripts/ci/pretend-api.mjs) and prompt suggestions on, the worst case for
// telling an empty box from a draft. Messages must arrive as typed; a question, a dialog, a draft
// or a panel that takes Enter must be left alone (409). Then a few of the same in NO_COLOR, where
// only Claude Code's words tell ghost text from typing. From the probes behind PRs #79-#89.
//   CLAUDE_BIN=$(command -v claude) node --import tsx scripts/ci/say/live.mjs [--json]
// (scripts/compat.mjs runs it.) A failed check means Claude Code's input box, its dialogs or its
// panels changed in a way the office's Say (server/tmux.ts) doesn't read right any more.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import WebSocket from 'ws';
import { freePort, makeHome, startOffice, wait } from '../office.mjs';
import { blocks, lastUser, said, startPretendApi, text, typed } from '../pretend-api.mjs';

const CLAUDE = process.env.CLAUDE_BIN || spawnSync('sh', ['-c', 'command -v claude'], { encoding: 'utf8' }).stdout?.trim();
if (!CLAUDE) {
  console.error('No Claude Code to check: set CLAUDE_BIN, or put claude on your PATH.');
  process.exit(2);
}
const results = [];
let group = '';
const check = (name, ok, detail = '', { note = false } = {}) => {
  results.push({ group, name, ok: !!ok, note: !ok && note, detail: String(detail ?? '').slice(0, 400) });
  if (!process.argv.includes('--json')) console.log(`${ok ? '✔' : note ? '!' : '✘'} ${name}${detail ? `  (${String(detail).slice(0, 300)})` : ''}`);
};
const section = (name) => {
  group = name;
  if (!process.argv.includes('--json')) console.log(`\n${name}`);
};
/** Set once this process is stopped from outside (Ctrl-C, compat.mjs's time limit): every wait then gives up. */
let stopping = '';
let finished = false;
const until = async (fn, ms, every = 50) => {
  const end = Date.now() + ms;
  for (;;) {
    if (stopping) throw new Error(`stopped from outside (${stopping})`);
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) return null;
    await wait(every);
  }
};

// ── What the pretend API says, and what it heard ──────────────────────────────────────────────
// FACTS:<what> in a message makes the next reply a tool call: bash (a file only an approval
// makes), bgbash (a background task, for the footer pill), ask (a question), plan (leave plan
// mode). SLOW<ms> holds the reply that long. Anything else gets "Mock reply.", which prompt
// suggestions then offer back as a suggested reply.
/** What a person typed, for each of Claude's turns (not prompt suggestions'), in order. */
const prompts = [];
const requests = [];
let toolN = 0;
const use = (name, input) => ({ type: 'tool_use', id: `toolu_say_${++toolN}`, name, input });
/** A value that fits a JSON schema (structured outputs, such as the session title Claude Code asks for). */
function fit(schema) {
  if (schema?.type === 'object') return Object.fromEntries(Object.entries(schema.properties ?? {}).map(([k, v]) => [k, fit(v)]));
  if (schema?.type === 'array') return [];
  if (schema?.type === 'number' || schema?.type === 'integer') return 1;
  if (schema?.type === 'boolean') return true;
  return schema?.enum?.[0] ?? 'say';
}
function reply(j) {
  const has = (n) => (j?.tools ?? []).some((t) => t.name === n);
  const format = j?.output_config?.format;
  if (format?.type === 'json_schema') return { content: [text(JSON.stringify(fit(format.schema)))] };
  const words = said(j);
  requests.push(words);
  if (has('Bash') && !/SUGGESTION MODE/.test(words)) prompts.push(typed(j));
  const delay = Number(/SLOW(\d+)/.exec(words)?.[1] ?? 0);
  if (/FACTS:bgbash/.test(words) && has('Bash')) return { content: [use('Bash', { command: 'sleep 300', description: 'Wait in the background', run_in_background: true })], delay };
  if (/FACTS:bash/.test(words) && has('Bash')) return { content: [use('Bash', { command: `touch approved-${toolN + 1}.txt`, description: 'Make a file' })], delay };
  if (/FACTS:ask/.test(words) && has('AskUserQuestion'))
    return { content: [use('AskUserQuestion', { questions: [{ question: 'Tea or coffee?', header: 'Drink', multiSelect: false, options: [{ label: 'Tea', description: 'Hot and calm' }, { label: 'Coffee', description: 'Strong' }] }] })], delay };
  if (/FACTS:plan/.test(words) && has('ExitPlanMode')) return { content: [use('ExitPlanMode', {})], delay };
  if (blocks(lastUser(j)).some((b) => b?.type === 'tool_result')) return { content: [text('Done.')] };
  return { content: [text('Mock reply.')], delay };
}

/** The offices open now: closed at the end, or with this process when it's stopped from outside. */
const opened = [];
const closeAll = async () => {
  for (const { home, office } of opened.splice(0)) {
    await office?.stop();
    home.cleanup();
  }
};
// Stopped from outside, the checks give up at their next wait, close their offices and report
// what they found; if no wait comes, this closes up anyway.
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    stopping = signal;
    setTimeout(() => closeAll().finally(finish), 20_000).unref();
  });

/** An office of its own whose hires talk to `api`, Claude Code's theme set before each hire. */
async function openOffice(api, extraEnv = {}) {
  if (stopping) throw new Error(`stopped from outside (${stopping})`);
  const home = makeHome('office-say-');
  const opening = { home, office: null };
  opened.push(opening);
  const KEY = 'sk-ant-api03-say-0123456789abcdef0123456789';
  const env = {
    ...home.env,
    ANTHROPIC_BASE_URL: api.base,
    ANTHROPIC_API_KEY: KEY,
    DISABLE_AUTOUPDATER: '1',
    DISABLE_TELEMETRY: '1',
    DISABLE_ERROR_REPORTING: '1',
    CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL: '1',
    CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION: '1',
    ...extraEnv,
  };
  const version = (spawnSync(CLAUDE, ['--version'], { env, encoding: 'utf8' }).stdout ?? '').trim().split(' ')[0];
  const config = join(home.claudeHome, '.claude.json');
  const setTheme = (theme) => {
    let c = {};
    try {
      c = JSON.parse(readFileSync(config, 'utf8'));
    } catch {
      // the first write
    }
    writeFileSync(config, JSON.stringify({ ...c, hasCompletedOnboarding: true, lastOnboardingVersion: version, lastReleaseNotesSeen: version, theme, customApiKeyResponses: { approved: [KEY.slice(-20)], rejected: [] } }));
  };
  setTheme('dark');
  const office = (opening.office = await startOffice({ home, port: await freePort(), env: { ...env, CLAUDE_BIN: CLAUDE } }));
  const base = office.base;
  const call = async (path, body) => {
    const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify(body) });
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  const raw = (t, attrs = false) => {
    try {
      return home.tmux('capture-pane', '-p', ...(attrs ? ['-e'] : []), '-t', `=${t}:`);
    } catch {
      return '';
    }
  };
  const tail = (t, k = 4) => raw(t).split('\n').filter((l) => l.trim()).slice(-k).join(' | ').replace(/─{6,}/g, '──').slice(0, 300);
  const reg = (sid) => {
    const dir = join(home.claudeHome, 'sessions');
    for (const f of readdirSync(dir).filter((x) => /^\d+\.json$/.test(x))) {
      try {
        const e = JSON.parse(readFileSync(join(dir, f), 'utf8'));
        if (e.sessionId === sid) return e;
      } catch {
        // being rewritten
      }
    }
    return null;
  };
  /** The kind of every session in this home's registry: its <pid>.json files only, never the *.key ones. */
  const kinds = () =>
    readdirSync(join(home.claudeHome, 'sessions'))
      .filter((f) => /^\d+\.json$/.test(f))
      .map((f) => {
        try {
          return JSON.parse(readFileSync(join(home.claudeHome, 'sessions', f), 'utf8')).kind ?? '(none)';
        } catch {
          return '(being written)';
        }
      });
  const roster = async () => (await (await fetch(`${base}/api/roster`)).json()) ?? [];
  const keys = (t, ...k) => home.tmux('send-keys', '-t', `=${t}:`, ...k);
  const typeIn = (t, s) => home.tmux('send-keys', '-t', `=${t}:`, '-l', s);
  const paste = (t, s) => {
    home.tmux('set-buffer', '-b', 'say', s);
    home.tmux('paste-buffer', '-p', '-d', '-b', 'say', '-t', `=${t}:`);
  };
  /** The box line (the prompt glyph right under the last rule): as drawn, and with its attributes. */
  const boxLine = (t) => {
    const rows = raw(t, true).split('\n');
    const plain = rows.map((r) => r.replace(/\x1b\[[\d;:]*[A-Za-z]/g, '').replace(/\u00a0/g, ' '));
    const i = plain.findLastIndex((l, k) => k > 0 && /^[❯!]/.test(l) && /─{8,}/.test(plain[k - 1]));
    return i < 0 ? null : { plain: plain[i].trimEnd(), attrs: rows[i] };
  };
  const boxEmpty = (t) => {
    const b = boxLine(t);
    return !!b && (b.plain === '❯' || /^(\x1b\[[\d;]*m)*❯[ \u00a0](\x1b\[[\d;]*m)*\x1b\[7m/.test(b.attrs));
  };
  const clear = async (t) => {
    for (let k = 0; k < 3 && !boxEmpty(t); k++) {
      keys(t, 'End');
      home.tmux('send-keys', '-t', `=${t}:`, '-N', '400', 'BSpace');
      await wait(400);
    }
    return boxEmpty(t);
  };
  const idle = (sid) => until(() => reg(sid)?.status === 'idle', 30_000);
  const TRUST = /trust (the files in )?this folder|Do you trust/i;
  const trust = async (t) => {
    for (let i = 0; i < 6 && TRUST.test(raw(t)); i++) {
      const cursor = raw(t).split('\n').findLast((l) => /^\s*❯\s+\S/.test(l)) ?? '';
      keys(t, /\byes\b/i.test(cursor) ? 'Enter' : 'Down');
      await wait(500);
    }
  };
  async function hire(name, { permissionMode = 'manual', trusted = true } = {}) {
    const project = join(home.home, name.toLowerCase().replace(/\W+/g, '-'));
    mkdirSync(project, { recursive: true });
    const r = await call('/api/hire', { cwd: project, name, permissionMode });
    const sid = r.json?.sessionId;
    if (!sid) throw new Error(`hire failed: ${r.status} ${JSON.stringify(r.json)}`);
    const who = { sid, t: `office-${sid.slice(0, 8)}`, project };
    await until(() => TRUST.test(raw(who.t)), 45_000, 200);
    if (trusted) {
      await trust(who.t);
      // Every check waits for this, so without it there's nothing to check.
      if (!(await idle(sid))) throw new Error(`${name} never went idle in Claude Code's session registry: ${tail(who.t)}`);
      await until(() => boxLine(who.t), 10_000);
      await wait(1000);
    }
    return who;
  }
  const say = async (who, words) => {
    const t0 = Date.now();
    const r = await call('/api/say', { sessionId: who.sid, text: words });
    return { ...r, ms: Date.now() - t0, error: r.json?.error ?? '' };
  };
  /** Wait for a suggested reply in their box; Claude Code doesn't always offer one after the first turn, so give it another. */
  const suggestion = async (who, again) => {
    const shown = () => until(() => boxLine(who.t)?.plain.includes('Mock reply.'), 8000);
    if (await shown()) return true;
    await say(who, again);
    await got(again);
    await idle(who.sid);
    return !!(await shown());
  };
  const fire = async (who) => {
    await call('/api/fire', { sessionId: who.sid });
    await until(() => !raw(who.t), 10_000, 200);
    await wait(1500);
  };
  const attach = async (who, cols, rows) => {
    const ws = new WebSocket(`ws://127.0.0.1:${office.port}/term?id=${who.sid}&kind=claude&cols=${cols}&rows=${rows}`, { headers: { Origin: base } });
    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    await wait(1500);
    return ws;
  };
  return { home, office, version, setTheme, raw, tail, kinds, roster, keys, typeIn, paste, boxLine, clear, idle, trust, hire, say, suggestion, fire, attach };
}

/** The space say() adds after a last :word, @word or \ (so Enter sends rather than picks from a menu), which Claude Code drops. */
const SPACED = /(^|\s)[:@]\S*$|\\$/;
/**
 * Whether Claude got exactly `words`, as the whole of a turn: nothing picked from a menu, no
 * ghost text taken along, nothing left out. Only the space say() adds after a last :word, @word
 * or \ may come too.
 */
const got = async (words, ms = 8000) => !!(await until(() => prompts.some((p) => p === words || (SPACED.test(words) && p === `${words} `)), ms));
/** The last thing Claude got, for a check's detail. */
const lastGot = () => (prompts.length ? JSON.stringify(prompts.at(-1)).slice(0, 160) : 'nothing yet');
const PERMISSION = /Esc to cancel · Tab to amend/;
const approved = (dir) => readdirSync(dir).filter((f) => f.startsWith('approved-'));

const api = await startPretendApi(reply);
try {
  const o = await openOffice(api);
  const { raw, tail, kinds, roster, keys, typeIn, paste, boxLine, clear, idle, trust, hire, say, fire, attach } = o;
  const names = (es) => es.map((e) => `${e.displayName} (${e.kind})`).join(', ') || 'nobody';
  const dismiss = async (t, re) => {
    for (let k = 0; k < 4 && re.test(raw(t)); k++) {
      keys(t, 'Escape');
      await until(() => !re.test(raw(t)), 3000);
    }
  };

  section(`Say into Claude Code ${o.version}: the box`);
  const A = await hire('Say Tester', { trusted: false });
  await wait(500);
  const s0 = await say(A, 'hello during the trust dialog');
  check('the trust dialog is up: 409, nothing typed', s0.status === 409 && !raw(A.t).includes('hello during'), `${s0.status} ${s0.error}`);
  await trust(A.t);
  await idle(A.sid);
  await until(() => boxLine(A.t), 10_000);
  await wait(1000);
  const placeholder = boxLine(A.t)?.plain;
  const s1 = await say(A, 'hello there');
  check('the first message, over the "Try …" placeholder: 200, Claude gets it', s1.status === 200 && (await got('hello there')), `${s1.status} ${s1.error}; the box was: ${placeholder}; Claude got ${lastGot()}`);
  await idle(A.sid);
  // Prompt suggestions offer the pretend API's "Mock reply." back as ghost text.
  const suggested = await o.suggestion(A, 'one more, for a suggestion');
  const box = boxLine(A.t)?.plain;
  const s2 = await say(A, 'second message');
  check(`the next${suggested ? ', over a suggested reply' : ''}: 200, Claude gets it`, s2.status === 200 && (await got('second message')), `${s2.status} ${s2.error}; the box was: ${box}; Claude got ${lastGot()}`);
  if (!suggested) check('Claude Code offers a suggested reply to Say over', false, `none after two turns; the box: ${box}`, { note: true });
  await idle(A.sid);
  await wait(600);
  typeIn(A.t, 'half-typed note');
  await wait(400);
  const s3 = await say(A, 'over the top');
  await wait(300);
  check('a draft typed at their computer: 409 "unsent text", their box untouched', s3.status === 409 && /unsent text/.test(s3.error) && boxLine(A.t)?.plain === '❯ half-typed note', `${s3.status} ${s3.error}; box: ${boxLine(A.t)?.plain}`);
  await clear(A.t);
  const long = Array.from({ length: 40 }, (_, i) => `line ${i + 1} of a long message`).join('\n');
  const s4 = await say(A, long);
  check('a 40-line message: 200, all 40 lines arrive', s4.status === 200 && (await got(long)), `${s4.status} ${s4.error}; Claude got ${lastGot()}`);
  await idle(A.sid);
  await clear(A.t);
  typeIn(A.t, '!');
  await wait(500);
  const s5 = await say(A, 'are you there');
  await wait(300);
  check('shell mode left on, nothing after the "!": 409 "unsent text", box untouched', s5.status === 409 && /unsent text/.test(s5.error) && boxLine(A.t)?.plain === '!', `${s5.status} ${s5.error}; box: ${boxLine(A.t)?.plain}`);
  await clear(A.t);
  const s6 = await say(A, '!echo bang-$((6*7))');
  check('"!echo bang-$((6*7))": 200, runs in shell mode', s6.status === 200 && !!(await until(() => /bang-42/.test(raw(A.t)), 8000)), `${s6.status} ${s6.error}`);
  await idle(A.sid);
  await clear(A.t);
  writeFileSync(join(A.project, 'README.md'), '# hi\n');
  writeFileSync(join(A.project, 'READING.md'), '# also\n');
  for (const words of ['great job :tada', 'please read @READ', '# remember the milk', 'ends with a backslash \\']) {
    await idle(A.sid);
    await clear(A.t);
    const r = await say(A, words);
    check(`${JSON.stringify(words)}: 200, arrives as typed (no menu pick)`, r.status === 200 && (await got(words)), `${r.status} ${r.error} (${r.ms} ms); Claude got ${lastGot()}; box now: ${tail(A.t, 3)}`);
  }
  await idle(A.sid);
  await clear(A.t);
  const before = requests.length;
  const rc = await say(A, '/compact');
  check('"/compact": 200, and Claude Code compacts', rc.status === 200 && !!(await until(() => requests.slice(before).some((w) => /summar/i.test(w)), 15_000)), `${rc.status} ${rc.error}`);
  await idle(A.sid);
  await clear(A.t);
  paste(A.t, 'SLOW2500 tell me something');
  await wait(250);
  keys(A.t, 'Enter');
  await wait(600);
  const q = await say(A, 'queued while you work');
  check('while Claude works: 200 (queued), and it arrives after', q.status === 200 && (await got('queued while you work', 15_000)), `${q.status} ${q.error} (${q.ms} ms); Claude got ${lastGot()}; ${tail(A.t, 4)}`);
  await idle(A.sid);
  await clear(A.t);

  section('Say never answers a question');
  paste(A.t, 'FACTS:bash please');
  await wait(250);
  keys(A.t, 'Enter');
  await until(() => PERMISSION.test(raw(A.t)), 20_000);
  await wait(300);
  for (const words of ['1. Yes', 'yes go ahead']) {
    const r = await say(A, words);
    await wait(1200);
    check(`a permission prompt is up, Say ${JSON.stringify(words)}: 409 "question open", unanswered`, r.status === 409 && /question open/.test(r.error) && PERMISSION.test(raw(A.t)) && !approved(A.project).length, `${r.status} ${r.error}`);
  }
  // The same, by the screen alone (what say() checks right before Enter): server/tmux.ts in this
  // process, pointed at this office's tmux server.
  process.env.TMUX_TMPDIR = o.home.env.TMUX_TMPDIR;
  for (const k of ['TMUX', 'TMUX_PANE']) delete process.env[k];
  const { dialogOnScreen } = await import('../../../server/tmux.ts');
  // Pinned down the way the office acts on its hires: `$<id>@<server pid>/<name>`.
  const at = `${o.home.tmux('display-message', '-p', '-t', `=${A.t}:`, '#{session_id}@#{pid}')}/${A.t}`;
  check('the screen alone: the prompt hides the box (dialogOnScreen)', (await dialogOnScreen(at, '')) && (await dialogOnScreen(at, '1. Yes')), at);
  await dismiss(A.t, PERMISSION);
  await idle(A.sid);
  await clear(A.t);
  check('the screen alone, idle: the box is there (dialogOnScreen)', !(await dialogOnScreen(at, '')), tail(A.t, 4));
  const outcomes = [];
  for (const delay of [60, 100, 140, 180, 220, 260]) {
    await clear(A.t);
    paste(A.t, `SLOW${delay} FACTS:bash race`);
    await wait(250);
    keys(A.t, 'Enter');
    await wait(40);
    const r = await say(A, `race text ${delay}`);
    await until(() => PERMISSION.test(raw(A.t)), 10_000);
    await wait(300);
    const now = approved(A.project).length;
    await dismiss(A.t, PERMISSION);
    await idle(A.sid);
    await wait(600);
    const kind = r.status === 200 ? 'sent' : /question open/.test(r.error) ? 'not-pasted' : /just as you spoke/.test(r.error) ? 'not-sent' : `other: ${r.error}`;
    outcomes.push({ delay, kind, now, box: boxLine(A.t)?.plain ?? '(no box)' });
  }
  const summary = outcomes.map((x) => `${x.delay} ms: ${x.kind}`).join(', ');
  check('a prompt coming up between paste and Enter: never approved (6 rounds)', outcomes.every((x) => !x.now) && !approved(A.project).length, summary);
  const caught = outcomes.filter((x) => x.kind === 'not-sent');
  if (caught.length) check('…and when caught between paste and Enter, the text waits in their box', caught.every((x) => x.box.includes(`race text ${x.delay}`)), caught.map((x) => x.box).join(' / '));
  else check('…a round caught it between paste and Enter', false, `timing on this machine: ${summary}`, { note: true });
  await clear(A.t);
  paste(A.t, 'FACTS:ask');
  await wait(250);
  keys(A.t, 'Enter');
  await until(() => /Tea or coffee/.test(raw(A.t)), 20_000);
  await wait(400);
  const a = await say(A, '1. use tea');
  await wait(1200);
  check('a question is up, Say "1. use tea": 409, still asking', a.status === 409 && /Tea or coffee/.test(raw(A.t)), `${a.status} ${a.error}`);
  await dismiss(A.t, /Tea or coffee/);
  await fire(A);
  const B = await hire('Planner', { permissionMode: 'plan' });
  paste(B.t, 'FACTS:plan');
  await wait(250);
  keys(B.t, 'Enter');
  const planUp = await until(() => /Exit plan mode\?|Would you like to proceed/.test(raw(B.t)), 20_000);
  await wait(400);
  const p = await say(B, '1. Yes');
  await wait(1200);
  check('a plan approval is up, Say "1. Yes": 409, still asking', !!planUp && p.status === 409 && /Exit plan mode\?|Would you like to proceed/.test(raw(B.t)), `${p.status} ${p.error}; ${tail(B.t, 3)}`);
  keys(B.t, 'Escape');
  await fire(B);

  section('Say with panels and narrow panes');
  const W = await hire('A Very Long Name For The Office');
  for (const [cols, rows] of [
    [40, 12],
    [24, 8],
  ]) {
    const ws = await attach(W, cols, rows);
    const r = await say(W, `narrow ${cols}`);
    check(`their terminal ${cols}×${rows} (the top rule is only their name, or less): 200`, r.status === 200 && (await got(`narrow ${cols}`)), `${r.status} ${r.error}; Claude got ${lastGot()}`);
    await idle(W.sid);
    ws.close();
    await wait(1200);
  }
  await fire(W);
  const Q = await hire('Panel Tester');
  typeIn(Q.t, '?');
  await wait(700);
  const help = /for shortcuts|shift \+ tab/.test(raw(Q.t));
  const h = await say(Q, 'while the shortcuts show');
  check('the "?" shortcuts help showing: 200', help && h.status === 200 && (await got('while the shortcuts show')), `${h.status} ${h.error}; Claude got ${lastGot()}`);
  await idle(Q.sid);
  paste(Q.t, 'FACTS:bgbash');
  await wait(250);
  keys(Q.t, 'Enter');
  await until(() => PERMISSION.test(raw(Q.t)), 20_000);
  await wait(400);
  keys(Q.t, 'Enter');
  await idle(Q.sid);
  await wait(1200);
  keys(Q.t, 'Down');
  await wait(800);
  const pill = /Enter to view tasks/.test(raw(Q.t));
  const b = await say(Q, 'while the pill is focused');
  await wait(500);
  check('the background-tasks pill focused ("Enter to view tasks"): 409, quickly, nothing typed', pill && b.status === 409 && /isn't at the prompt/.test(b.error) && b.ms < 1500 && !raw(Q.t).includes('while the pill'), `${b.status} ${b.error} (${b.ms} ms); ${tail(Q.t, 2)}`);
  keys(Q.t, 'Up');
  await wait(700);
  const up = await say(Q, 'after Up');
  check('…back in the box (Up): 200', up.status === 200 && (await got('after Up')), `${up.status} ${up.error}; Claude got ${lastGot()}`);
  await idle(Q.sid);
  keys(Q.t, 'Left');
  await wait(900);
  const agents = /describe a task for a new session|enter to return/.test(raw(Q.t));
  const g = await say(Q, 'into the agents view');
  await wait(3000);
  check('the agents view (Left): 409, nothing typed, no task started with it', agents && g.status === 409 && /isn't at the prompt/.test(g.error) && !requests.some((w) => w.includes('into the agents view')) && !raw(Q.t).includes('into the agents view'), `${g.status} ${g.error}`);
  // Opening it starts Claude Code's daemon, whose sessions register too (kind "bg"): none of them
  // may walk in (#105). A kind the office doesn't know yet would, and fail here.
  const opened = kinds();
  const strangers = (await roster()).filter((e) => e.sessionId !== Q.sid);
  check("…and the background sessions it starts don't walk in", !strangers.length, `registry: ${opened.join(', ')}; strangers: ${names(strangers)}`);
  if (!opened.some((k) => k !== 'interactive')) check('…Claude Code started a background session for the office to keep out', false, `registry: ${opened.join(', ')}`, { note: true });
  keys(Q.t, 'Escape');
  await wait(800);
  await clear(Q.t);
  keys(Q.t, 'C-o');
  await wait(900);
  const transcript = /Showing detailed transcript/.test(raw(Q.t));
  const v = await say(Q, 'during the transcript');
  check('the transcript view (ctrl+o): 409', transcript && v.status === 409 && /isn't at the prompt/.test(v.error), `${v.status} ${v.error}`);
  keys(Q.t, 'C-o');
  await fire(Q);
  // Let go, they leave; Claude Code's background session from their agents view stays running.
  await until(async () => !(await roster()).some((e) => e.sessionId === Q.sid), 10_000, 250);
  let stayed = [];
  for (let k = 0; k < 6 && !stayed.length; k++) {
    await wait(500);
    stayed = await roster();
  }
  check('…and once they are let go, nobody is left on the roster', !stayed.length, `left: ${names(stayed)}; registry: ${kinds().join(', ') || 'empty'}`);

  section("Say over each theme's placeholder");
  for (const theme of ['light', 'dark-daltonized', 'light-daltonized', 'dark-ansi', 'light-ansi']) {
    o.setTheme(theme);
    const who = await hire(`Theme ${theme}`);
    const shown = tail(who.t, 3);
    const r = await say(who, `first words, ${theme}`);
    check(`${theme}: the first message, over the "Try …" placeholder: 200`, r.status === 200 && (await got(`first words, ${theme}`)), `${r.status} ${r.error}; box was: ${shown}; Claude got ${lastGot()}`);
    await fire(who);
  }

  // Each in a hire of its own, and last: a tmux older than 3.4 draws some emoji narrower than
  // Claude Code does (and Unicode 15's not at all), and what's drawn on that screen afterwards can
  // land in the wrong cells.
  section('Say in emoji, accents and CJK');
  for (const [i, words] of ['thanks ❤️ 👍🏽 café 日本語 👨‍👩‍👧', 'new ones 🫨 🪿 🫠'].entries()) {
    const U = await hire(`Unicode Tester ${i + 1}`);
    const r = await say(U, words);
    check(`${JSON.stringify(words)}: 200, arrives as typed`, r.status === 200 && (await got(words)), `${r.status} ${r.error} (${r.ms} ms); Claude got ${lastGot()}; box now: ${tail(U.t, 3)}`);
    await fire(U);
  }
} catch (err) {
  if (!stopping) check('ran to the end', false, String(err?.stack ?? err).split('\n').slice(0, 3).join(' / '));
} finally {
  await closeAll();
}

// NO_COLOR: no dim, no colours, so Claude Code's own words tell its ghost text from typing.
try {
  const m = await openOffice(api, { NO_COLOR: '1' });
  const { tail, typeIn, boxLine, clear, idle, hire, say, fire, attach } = m;
  section(`Say into Claude Code ${m.version} with NO_COLOR`);
  const who = await hire('Mono Tester');
  const r1 = await say(who, 'first words, no colour');
  check('the first message, over a plain "Try …": 200', r1.status === 200 && (await got('first words, no colour')), `${r1.status} ${r1.error}; Claude got ${lastGot()}`);
  await idle(who.sid);
  const suggested = await m.suggestion(who, 'one more, no colour');
  const box = boxLine(who.t)?.plain;
  const r2 = await say(who, 'second words');
  check(`the next${suggested ? ', over a plain suggested reply' : ''}: 200`, r2.status === 200 && (await got('second words')), `${r2.status} ${r2.error}; the box was: ${box}; Claude got ${lastGot()}`);
  if (!suggested) check('Claude Code offers a suggested reply to Say over', false, `none after two turns; the box: ${box}`, { note: true });
  await idle(who.sid);
  m.home.tmux('set-option', '-g', 'focus-events', 'on');
  const ws = await attach(who, 120, 30);
  ws.send(JSON.stringify({ t: 'in', d: '\x1b[O' }));
  await wait(600);
  ws.close();
  await wait(1500);
  const r3 = await say(who, 'unfocused words');
  check('their terminal unfocused (no cursor drawn): 200', r3.status === 200 && (await got('unfocused words')), `${r3.status} ${r3.error}; Claude got ${lastGot()}; ${tail(who.t, 3)}`);
  await idle(who.sid);
  typeIn(who.t, 'half-typed note');
  await wait(500);
  const r4 = await say(who, 'over the top');
  check('a draft typed at their computer: 409 "unsent text", box untouched', r4.status === 409 && /unsent text/.test(r4.error) && boxLine(who.t)?.plain === '❯ half-typed note', `${r4.status} ${r4.error}; box: ${boxLine(who.t)?.plain}`);
  await clear(who.t);
  const three = 'line one of three\nline two of three\nline three of three';
  const r5 = await say(who, three);
  check('a 3-line message: 200, all 3 lines arrive', r5.status === 200 && (await got(three)), `${r5.status} ${r5.error}; Claude got ${lastGot()}`);
  await fire(who);
} catch (err) {
  if (!stopping) check('ran to the end (NO_COLOR)', false, String(err?.stack ?? err).split('\n').slice(0, 3).join(' / '));
} finally {
  await closeAll();
  api.close();
}

finish();

/** Report what was found (as JSON with --json, for scripts/compat.mjs) and exit: 1 if a check failed. */
function finish() {
  if (finished) return;
  finished = true;
  if (stopping) check('ran to the end', false, `stopped from outside (${stopping})`);
  const failed = results.filter((r) => !r.ok && !r.note).length;
  if (process.argv.includes('--json')) process.stdout.write(`${JSON.stringify(results)}\n`, () => process.exit(failed ? 1 : 0));
  else {
    const notes = results.filter((r) => r.note).length;
    console.log(failed ? `\n${failed} of ${results.length} failed` : `\nAll good: ${results.length - notes} passed${notes ? `, ${notes} note(s)` : ''}.`);
    process.exit(failed ? 1 : 0);
  }
}
