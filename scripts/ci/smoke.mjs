// The smoke test (scripts/smoke.mjs) in an office of its own (scripts/ci/office.mjs), for CI
// and for running it anywhere without touching your office: one pretend Claude session (a
// running process, its ~/.claude/sessions entry and a transcript), Claude Code's background
// sessions that must stay off the roster, sessions in other PID namespaces (Linux), one past
// session, thought bubbles off, a private tmux server and a free port. No Claude Code or login
// needed; the checks that would need them (hiring, answering, thoughts) are not part of the
// smoke test.
// Then it checks the office read the pretend session the way Claude Code writes it.
//   npm run build && node scripts/ci/smoke.mjs     (serves dist/; without a build it uses dev mode)
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { dirname, join } from 'node:path';
import { freePort, makeHome, ROOT, startOffice } from './office.mjs';

let failed = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed++;
}

const home = makeHome('office-smoke-');
const port = Number(process.env.PORT) || (await freePort());
const encodeCwd = (cwd) => cwd.replace(/[^a-zA-Z0-9]/g, '-');
const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();
const jsonl = (rows) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n';

// A pretend live session: a sleeping process with a registry entry, and a transcript in the
// shape Claude Code writes. The office only counts a registry pid that is still running and is
// the same process, which Claude Code proves with its start time (procStart, `ps` lstart in UTC).
const project = join(home.home, 'fixture-desk');
mkdirSync(project, { recursive: true });
const live = spawn('sleep', ['3600'], { stdio: 'ignore' });
const procStart = execFileSync('ps', ['-o', 'lstart=', '-p', String(live.pid)], { env: { ...process.env, TZ: 'UTC' }, encoding: 'utf8' }).trim();
const LIVE_ID = '0f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f';
const PAST_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const now = Date.now();
writeFileSync(
  join(home.claudeHome, 'sessions', `${live.pid}.json`),
  JSON.stringify({ pid: live.pid, sessionId: LIVE_ID, cwd: project, startedAt: now - 60_000, procStart, version: 'fixture', kind: 'interactive', entrypoint: 'cli', name: 'Fixture Fran', nameSource: 'user', status: 'idle', statusUpdatedAt: now - 5000, updatedAt: now - 5000 }),
);
// Claude Code's own sessions, which its daemon runs out of sight (kind "bg", from its agents
// view: ← on an empty prompt; "daemon" and "daemon-worker"), and one of a kind it may add later,
// each a live process with a registry entry in the shape 2.1 writes. The first three must never
// walk in; the new kind is shown, the way "interactive" is (server/registry.ts).
const KINDS = { bg: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e', daemon: '3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f', 'daemon-worker': '4d5e6f7a-8b9c-4d0e-9f2a-3b4c5d6e7f8a', 'fixture-new': '5e6f7a8b-9c0d-4e1f-8a3b-4c5d6e7f8a9b' };
const others = Object.entries(KINDS).map(([kind, sessionId]) => {
  const p = spawn('sleep', ['3600'], { stdio: 'ignore' });
  const start = execFileSync('ps', ['-o', 'lstart=', '-p', String(p.pid)], { env: { ...process.env, TZ: 'UTC' }, encoding: 'utf8' }).trim();
  writeFileSync(
    join(home.claudeHome, 'sessions', `${p.pid}.json`),
    JSON.stringify({ pid: p.pid, sessionId, cwd: project, startedAt: now - 30_000, procStart: start, version: 'fixture', peerProtocol: 1, kind, entrypoint: 'cli', name: sessionId.slice(0, 8), status: 'idle', statusUpdatedAt: now - 5000, updatedAt: now - 5000 }),
  );
  return p;
});
// Sessions a program drives through the Agent SDK (claude-mem's observers, say): Claude Code
// registers them as "interactive" too, with entrypoint "sdk-cli" or "sdk-ts". Never walk in.
const SDK = { 'sdk-cli': '6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d', 'sdk-ts': '7b8c9d0e-1f2a-4b3c-9d4e-5f6a7b8c9d0e' };
for (const [entrypoint, sessionId] of Object.entries(SDK)) {
  const p = spawn('sleep', ['3600'], { stdio: 'ignore' });
  const start = execFileSync('ps', ['-o', 'lstart=', '-p', String(p.pid)], { env: { ...process.env, TZ: 'UTC' }, encoding: 'utf8' }).trim();
  writeFileSync(
    join(home.claudeHome, 'sessions', `${p.pid}.json`),
    JSON.stringify({ pid: p.pid, sessionId, cwd: project, startedAt: now - 30_000, procStart: start, version: 'fixture', peerProtocol: 1, kind: 'interactive', entrypoint, name: sessionId.slice(0, 8), nameSource: 'derived', status: 'busy', statusUpdatedAt: now - 5000, updatedAt: now - 5000 }),
  );
  others.push(p);
}
// Sessions in other PID namespaces of this machine (WSL starts a new one each time it restarts),
// with pidDomain the way Claude Code writes it: "linux:<machine id>:pid:[N]". Their pids can't
// be checked, so they're shown, unless they started and were last written before the machine
// booted. Linux only: the machine id, boot time and namespace come from /etc and /proc.
const ownNs = process.platform === 'linux' ? readlinkSync('/proc/self/ns/pid') : '';
const machineId = existsSync('/etc/machine-id') ? readFileSync('/etc/machine-id', 'utf8').trim() : '';
const bootMs = process.platform === 'linux' ? Number(/^btime (\d+)$/m.exec(readFileSync('/proc/stat', 'utf8'))?.[1]) * 1000 : NaN;
const BEFORE_BOOT =
  ownNs && machineId && bootMs
    ? { gone: '6f7a8b9c-0d1e-4f2a-9b4c-5d6e7f8a9b0c', otherMachine: '7a8b9c0d-1e2f-4a3b-8c5d-6e7f8a9b0c1d', writtenSince: '8b9c0d1e-2f3a-4b4c-9d6e-7f8a9b0c1d2e' }
    : null;
if (BEFORE_BOOT) {
  const otherNs = `pid:[${Number(/\d+/.exec(ownNs)[0]) + 7}]`;
  const dayBefore = bootMs - 86_400_000;
  [
    [BEFORE_BOOT.gone, machineId, dayBefore + 60_000],
    [BEFORE_BOOT.otherMachine, 'f'.repeat(32), dayBefore + 60_000],
    [BEFORE_BOOT.writtenSince, machineId, now - 5000],
  ].forEach(([sessionId, id, updatedAt], i) => {
    const pid = 4_190_001 + i;
    writeFileSync(
      join(home.claudeHome, 'sessions', `${pid}.json`),
      JSON.stringify({ pid, sessionId, cwd: project, startedAt: dayBefore, version: 'fixture', kind: 'interactive', entrypoint: 'cli', name: sessionId.slice(0, 8), status: 'idle', statusUpdatedAt: updatedAt, updatedAt, pidDomain: `linux:${id}:${otherNs}` }),
    );
  });
}
const projectDir = join(home.claudeHome, 'projects', encodeCwd(project));
mkdirSync(projectDir, { recursive: true });
const turn = (sessionId, prompt, answer, ago) => [
  { type: 'user', sessionId, cwd: project, timestamp: iso(ago), isSidechain: false, message: { role: 'user', content: prompt } },
  {
    type: 'assistant',
    sessionId,
    cwd: project,
    timestamp: iso(ago - 2000),
    isSidechain: false,
    message: { role: 'assistant', model: 'claude-fixture-1', content: [{ type: 'text', text: answer }], usage: { input_tokens: 1200, cache_creation_input_tokens: 300, cache_read_input_tokens: 500, output_tokens: 40 } },
  },
];
writeFileSync(join(projectDir, `${LIVE_ID}.jsonl`), jsonl([...turn(LIVE_ID, 'Tidy the fixture desk', 'All tidy.', 30_000), { type: 'ai-title', sessionId: LIVE_ID, aiTitle: 'Tidy the fixture desk' }]));
// A running SDK session with a transcript: hidden, but never offered for a call-back.
writeFileSync(join(projectDir, `${SDK['sdk-cli']}.jsonl`), jsonl(turn(SDK['sdk-cli'], 'Write a memory note', 'Noted.', 60_000)));
writeFileSync(join(projectDir, `${PAST_ID}.jsonl`), jsonl(turn(PAST_ID, 'Water the office plant', 'Watered.', 86_400_000)));

// What "/" offers in the chat (#151): custom commands (a subfolder is a namespace), skills (one a
// link into ~/.agents, the way skill managers install them; one hidden from the menu), the
// project's own, and an enabled plugin's (a disabled one's never). Two links lead out of the
// folders they sit in, to files outside this home: neither is read.
const put = (path, text) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};
const outside = join(home.dir, 'outside');
put(join(outside, 'secret.md'), '---\ndescription: never shown\n---\n');
put(join(outside, 'escape', 'SKILL.md'), '---\nname: escaped\ndescription: never shown\n---\n');
put(join(home.claudeHome, 'commands', 'tidy.md'), '---\ndescription: "Tidy the desk"\nargument-hint: <where>\n---\nTidy $ARGUMENTS.\n');
put(join(home.claudeHome, 'commands', 'git', 'sync.md'), '# Sync with main\n\nPull and rebase.\n');
symlinkSync(join(outside, 'secret.md'), join(home.claudeHome, 'commands', 'leak.md'));
put(join(home.claudeHome, 'skills', 'brew', 'SKILL.md'), '---\nname: brew-tea\ndescription: >\n  Brew a pot of tea\n  for the team\n---\n# Brew\n');
put(join(home.claudeHome, 'skills', 'quiet', 'SKILL.md'), '---\nname: quiet\ndescription: model only\nuser-invocable: false\n---\n');
put(join(home.home, '.agents', 'skills', 'linked', 'SKILL.md'), '---\nname: linked\ndescription: Installed by a skill manager\n---\n');
symlinkSync(join(home.home, '.agents', 'skills', 'linked'), join(home.claudeHome, 'skills', 'linked'));
symlinkSync(join(outside, 'escape'), join(home.claudeHome, 'skills', 'escape'));
put(join(project, '.claude', 'commands', 'deploy.md'), '---\ndescription: Ship the fixture desk\n---\n');
put(join(project, '.claude', 'skills', 'ship', 'SKILL.md'), '---\nname: ship\ndescription: Project skill\n---\n');
const pluginAt = (name) => join(home.claudeHome, 'plugins', 'cache', 'shelf', name, '1.0.0');
put(join(pluginAt('kettle'), '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'kettle', version: '1.0.0', commands: ['./extra/pour.md', './extra/hush.md'] }));
put(join(pluginAt('kettle'), 'extra', 'pour.md'), '---\ndescription: Pour a cup\n---\n');
put(join(pluginAt('kettle'), 'extra', 'hush.md'), '---\nuser-invocable: false\n---\nModel only.\n');
// Hidden from "/" however the YAML says it (a comment after it, quoted), on command files too.
put(join(home.claudeHome, 'commands', 'internal.md'), '---\nuser-invocable: false\n---\nModel only.\n');
put(join(home.claudeHome, 'skills', 'hush-comment', 'SKILL.md'), '---\nname: hush-comment\nuser-invocable: false # internal only\n---\n');
put(join(home.claudeHome, 'skills', 'hush-quoted', 'SKILL.md'), "---\nname: hush-quoted\ndescription: 'Quoted' # not part of it\nuser-invocable: \"false\"\n---\n");
put(join(home.claudeHome, 'skills', 'said', 'SKILL.md'), "---\nname: said\ndescription: 'Quoted, kept' # not part of it\n---\n");
// A skill's folder inside commands/ is one command ("/release"), its other files its own.
put(join(project, '.claude', 'commands', 'release', 'SKILL.md'), '---\ndescription: Cut a release\n---\n');
put(join(project, '.claude', 'commands', 'release', 'reference.md'), '# Notes for the release skill\n');
// A .claude/ further up (a monorepo's, above packages/web): the project's too.
put(join(home.dir, '.claude', 'commands', 'upstairs.md'), '---\ndescription: From the folder above\n---\n');
put(join(pluginAt('kettle'), 'commands', 'boil.md'), '---\ndescription: Boil the water\n---\n');
put(join(pluginAt('kettle'), 'skills', 'steep', 'SKILL.md'), '---\nname: steep\ndescription: Steep for three minutes\n---\n');
put(join(pluginAt('mug'), 'commands', 'drink.md'), '---\ndescription: never shown (disabled)\n---\n');
const installed = (name) => [{ scope: 'user', installPath: pluginAt(name), version: '1.0.0' }];
put(join(home.claudeHome, 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: { 'kettle@shelf': installed('kettle'), 'mug@shelf': installed('mug') } }));
put(join(home.claudeHome, 'settings.json'), JSON.stringify({ enabledPlugins: { 'kettle@shelf': true, 'mug@shelf': false } }));

// POST JSON the way the page does (same origin: no Origin header).
const post = (path, body) =>
  new Promise((resolve) => {
    const data = JSON.stringify(body);
    const req = http.request({ host: '127.0.0.1', port, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
      let text = '';
      res.on('data', (c) => (text += c));
      res.on('end', () => resolve({ status: res.statusCode, body: (() => { try { return JSON.parse(text); } catch { return undefined; } })() }));
    });
    req.on('error', () => resolve({ status: 0 }));
    req.end(data);
  });

/** GET, with its status. */
const getWith = (path) =>
  new Promise((resolve) => {
    http.get({ host: '127.0.0.1', port, path }, (res) => {
      let text = '';
      res.on('data', (c) => (text += c));
      res.on('end', () => resolve({ status: res.statusCode, body: (() => { try { return JSON.parse(text); } catch { return undefined; } })() }));
    }).on('error', () => resolve({ status: 0 }));
  });

const api = (path) =>
  new Promise((resolve) => {
    http.get({ host: '127.0.0.1', port, path }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(undefined);
        }
      });
    }).on('error', () => resolve(undefined));
  });

let office;
let code = 1;
try {
  const prod = existsSync(join(ROOT, 'dist', 'client', 'index.html'));
  office = await startOffice({ home, port, dev: !prod });
  console.log(`office on :${port} (${prod ? 'production build' : 'dev mode'}), HOME=${home.home}\n`);

  // The office polls once a second: let it read the pretend session before the smoke test looks.
  let me;
  for (let t = 0; t < 10_000 && !me?.title; t += 250) {
    me = (await api('/api/roster'))?.find?.((e) => e.sessionId === LIVE_ID);
    await new Promise((r) => setTimeout(r, 250));
  }

  const smoke = spawnSync(process.execPath, [join(ROOT, 'scripts', 'smoke.mjs')], { cwd: ROOT, env: { ...home.env, PORT: String(port) }, stdio: 'inherit' });
  code = smoke.status ?? 1;

  console.log('\nThe pretend session, as the office read it:');
  check('registry entry → an employee, by the name they were given', me?.displayName === 'Fixture Fran' && me?.name === 'Fixture Fran', JSON.stringify(me?.displayName));
  check('status idle, just now → idle (not asleep yet)', me?.state === 'idle', me?.state);
  check('not hosted (they work in their own terminal)', me?.hosted === false && me?.pid === live.pid, `hosted=${me?.hosted}, pid=${me?.pid}`);
  const roster = await api('/api/roster');
  const walkedIn = (kind) => roster?.some?.((e) => e.sessionId === KINDS[kind]);
  const seen = JSON.stringify(roster?.map?.((e) => `${e.displayName} (${e.kind})`));
  check("Claude Code's background sessions (kind bg, daemon, daemon-worker) → nobody walks in", Array.isArray(roster) && !walkedIn('bg') && !walkedIn('daemon') && !walkedIn('daemon-worker'), seen);
  check('a kind Claude Code adds later → shown, like interactive', walkedIn('fixture-new'), seen);
  check('Agent SDK sessions (entrypoint sdk-cli, sdk-ts: a plugin\'s helpers) → nobody walks in', Array.isArray(roster) && !roster.some((e) => Object.values(SDK).includes(e.sessionId)), seen);
  const sdkPast = (await api('/api/archive'))?.find?.((s) => s.sessionId === SDK['sdk-cli']);
  const sdkCall = await post('/api/rehire', { sessionId: SDK['sdk-cli'] });
  check('…and while running: not in the archive, and a call-back is refused (409)', !sdkPast && sdkCall.status === 409, JSON.stringify({ inArchive: !!sdkPast, status: sdkCall.status }));
  if (BEFORE_BOOT) {
    const shown = (sessionId) => roster?.find?.((e) => e.sessionId === sessionId);
    check('another PID namespace on this machine, started and last written before boot → gone', Array.isArray(roster) && !shown(BEFORE_BOOT.gone), seen);
    check("…with another machine id (a container's own) → shown, its pid unchecked", !!shown(BEFORE_BOOT.otherMachine)?.otherPidNamespace, seen);
    check('…written since boot (a stepped clock can move boot later) → shown, its pid unchecked', !!shown(BEFORE_BOOT.writtenSince)?.otherPidNamespace, seen);
  }
  check('ai-title → their title; the folder → their project', me?.title === 'Tidy the fixture desk' && me?.project === 'fixture-desk', `${me?.title} / ${me?.project}`);
  check('last assistant text and model from the transcript', me?.lastText === 'All tidy.' && me?.model === 'claude-fixture-1', `${me?.lastText} / ${me?.model}`);
  const chatter = await api(`/api/session/${LIVE_ID}/chatter`);
  check('chatter: their prompt, then the answer', chatter?.map?.((l) => `${l.role}:${l.text}`).join(' | ') === 'user:Tidy the fixture desk | assistant:All tidy.', JSON.stringify(chatter?.map?.((l) => l.text)));
  const archive = await api('/api/archive');
  const past = archive?.find?.((s) => s.sessionId === PAST_ID);
  const here = archive?.find?.((s) => s.sessionId === LIVE_ID);
  check('archive: the past session (titled from its first prompt) and the live one marked live', past?.title === 'Water the office plant' && past?.live === false && here?.live === true, JSON.stringify({ past: past?.title, live: here?.live }));
  // Rename: a name of your own wins over Claude Code's, is saved, and can be cleared.
  const renamed = await post('/api/rename', { sessionId: LIVE_ID, name: 'Teapot Tess' });
  const after = (await api('/api/roster'))?.find?.((e) => e.sessionId === LIVE_ID);
  const saved = (() => { try { return readFileSync(join(home.home, '.claude-office', 'names', LIVE_ID), 'utf8').trim(); } catch { return undefined; } })();
  check('rename → their new name on the roster, saved in ~/.claude-office/names/<session id>', renamed.status === 200 && after?.displayName === 'Teapot Tess' && saved === 'Teapot Tess', JSON.stringify({ status: renamed.status, name: after?.displayName, saved }));
  const bad = await post('/api/rename', { sessionId: LIVE_ID, name: '<script>' });
  const nobody = await post('/api/rename', { sessionId: PAST_ID, name: 'Ghost' });
  check('rename refuses a bad name (400) and someone not in the office (404)', bad.status === 400 && nobody.status === 404, JSON.stringify([bad.status, nobody.status]));
  const cleared = await post('/api/rename', { sessionId: LIVE_ID, name: '' });
  const back = (await api('/api/roster'))?.find?.((e) => e.sessionId === LIVE_ID);
  check('an empty rename gives them their usual name back', cleared.status === 200 && back?.displayName === 'Fixture Fran', JSON.stringify({ status: cleared.status, name: back?.displayName }));
  const cmds = await getWith(`/api/session/${LIVE_ID}/commands`);
  const byName = new Map((Array.isArray(cmds.body) ? cmds.body : []).map((c) => [c.name, c]));
  const has = (name, source, kind, description) => {
    const c = byName.get(name);
    return c?.source === source && c?.kind === kind && (description === undefined || c?.description === description);
  };
  const names = JSON.stringify([...byName.keys()].filter((n) => !['clear', 'compact', 'help', 'model', 'cost', 'context', 'memory', 'review', 'init', 'resume', 'rename', 'agents', 'mcp', 'permissions', 'status', 'config', 'add-dir', 'bug', 'doctor', 'exit', 'hooks', 'login', 'logout', 'pr-comments', 'release-notes', 'terminal-setup', 'vim'].includes(n)));
  check('commands: the built-ins, with descriptions', cmds.status === 200 && has('clear', 'built-in', 'command') && !!byName.get('compact')?.description && has('vim', 'built-in', 'command'), `${cmds.status} ${byName.size} listed`);
  check('…your commands, a subfolder as a namespace, described by frontmatter or the first line', has('tidy', 'user', 'command', 'Tidy the desk') && has('git:sync', 'user', 'command', 'Sync with main'), names);
  check('…your skills by their frontmatter name (one a link into ~/.agents); user-invocable: false left out', has('brew-tea', 'user', 'skill', 'Brew a pot of tea for the team') && has('linked', 'user', 'skill') && !byName.has('quiet'), names);
  check("…the project's own command and skill", has('deploy', 'project', 'command', 'Ship the fixture desk') && has('ship', 'project', 'skill'), names);
  check("…an enabled plugin's as plugin:name; a disabled plugin's never", has('kettle:boil', 'plugin', 'command', 'Boil the water') && byName.get('kettle:steep')?.plugin === 'kettle' && has('kettle:steep', 'plugin', 'skill') && !byName.has('mug:drink'), names);
  check("…a .claude/ in a folder above theirs counts as the project's", has('upstairs', 'project', 'command', 'From the folder above'), names);
  check('…a skill folder in commands/ is one command; its other files are not commands', has('release', 'project', 'skill', 'Cut a release') && !byName.has('release:reference') && !byName.has('release:SKILL'), names);
  check('…user-invocable: false hides commands too (yours and a plugin manifest\'s), with a comment or quotes', !byName.has('internal') && !byName.has('kettle:hush') && has('kettle:pour', 'plugin', 'command', 'Pour a cup') && !byName.has('hush-comment') && !byName.has('hush-quoted') && has('said', 'user', 'skill', 'Quoted, kept'), names);
  check('…links leading out of their folders are never followed', !byName.has('leak') && !byName.has('escaped') && !byName.has('escape') && !JSON.stringify(cmds.body ?? '').includes('never shown'), names);
  const [badId, notHere] = await Promise.all([getWith('/api/session/not-a-session/commands'), getWith(`/api/session/${PAST_ID}/commands`)]);
  check('commands: a bad id gets 400, someone not in the office 404', badId.status === 400 && notHere.status === 404, JSON.stringify([badId.status, notHere.status]));
  const stats = await api('/api/stats');
  const fill = stats?.context?.find?.((c) => c.sessionId === LIVE_ID);
  check('Team Room: context fill counts input + cache tokens', fill?.tokens === 2000, JSON.stringify(fill));
} catch (err) {
  check('the office started', false, err.message);
} finally {
  await office?.stop();
  live.kill();
  for (const p of others) p.kill();
  home.cleanup();
}

console.log(failed || code ? `\nsmoke failed (smoke.mjs exit ${code}, ${failed} fixture check(s) failed)` : '\nsmoke: all good');
process.exit(failed || code ? 1 : 0);
