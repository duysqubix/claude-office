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
import { existsSync, mkdirSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { join } from 'node:path';
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
writeFileSync(join(projectDir, `${PAST_ID}.jsonl`), jsonl(turn(PAST_ID, 'Water the office plant', 'Watered.', 86_400_000)));

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
