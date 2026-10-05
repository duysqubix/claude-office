// The smoke test (scripts/smoke.mjs) in an office of its own (scripts/ci/office.mjs), for CI
// and for running it anywhere without touching your office: one pretend Claude session (a
// running process, its ~/.claude/sessions entry and a transcript), Claude Code's background
// sessions that must stay off the roster, sessions in other PID namespaces and leftovers to
// clear (Linux), one past session, thought bubbles off, a private tmux server and a free port.
// No Claude Code or login needed; the checks that would need them (hiring, answering,
// thoughts) are not part of the smoke test.
// Then it checks the office read the pretend session the way Claude Code writes it.
//   npm run build && node scripts/ci/smoke.mjs     (serves dist/; without a build it uses dev mode)
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, readFileSync, readlinkSync, utimesSync, writeFileSync } from 'node:fs';
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
// At startup the office also deletes the registry files Claude Code can't have cleaned up
// (pruneRegistry in server/registry.ts): PRUNE lists the files it must delete and must keep.
// Files touched within the hour are never judged, so the ones to judge are aged past that.
const PRUNE = { gone: [], kept: [] };
if (BEFORE_BOOT) {
  const sessions = join(home.claudeHome, 'sessions');
  const otherNs = `pid:[${Number(/\d+/.exec(ownNs)[0]) + 7}]`;
  const dayBefore = bootMs - 86_400_000;
  const hoursAgo = now - 2 * 3_600_000;
  const age = (f, ms) => utimesSync(join(sessions, f), ms / 1000, ms / 1000);
  // Start ticks far past this boot's uptime: off WSL, "before boot" also needs these, which no
  // clock step can fake.
  const TICKS_PAST = '99999999999';
  [
    [BEFORE_BOOT.gone, machineId, dayBefore + 60_000],
    [BEFORE_BOOT.otherMachine, 'f'.repeat(32), dayBefore + 60_000],
    [BEFORE_BOOT.writtenSince, machineId, now - 5000],
  ].forEach(([sessionId, id, updatedAt], i) => {
    const pid = 4_190_001 + i;
    writeFileSync(
      join(sessions, `${pid}.json`),
      JSON.stringify({ pid, sessionId, cwd: project, startedAt: dayBefore, procStart: TICKS_PAST, version: 'fixture', kind: 'interactive', entrypoint: 'cli', name: sessionId.slice(0, 8), status: 'idle', statusUpdatedAt: updatedAt, updatedAt, pidDomain: `linux:${id}:${otherNs}` }),
    );
    age(`${pid}.json`, Math.min(updatedAt, hoursAgo));
  });
  // Shapes the pruner must never judge, however old: a namespace written some other way, and no
  // pidDomain at all (an older Claude Code, which could be on another machine).
  for (const [pid, pidDomain] of [[4_190_007, `linux:${machineId}:pid:${Number(/\d+/.exec(ownNs)[0]) + 7}`], [4_190_008, undefined]]) {
    writeFileSync(
      join(sessions, `${pid}.json`),
      JSON.stringify({ pid, sessionId: `ad1e2f3a-4b5c-4d6e-9f70-00000${pid}`, cwd: project, startedAt: dayBefore, procStart: TICKS_PAST, version: 'fixture', kind: 'interactive', entrypoint: 'cli', name: `shape-${pid}`, status: 'idle', statusUpdatedAt: dayBefore, updatedAt: dayBefore, pidDomain }),
    );
    age(`${pid}.json`, dayBefore);
    PRUNE.kept.push(`${pid}.json`);
  }
  // Keys go by their pid: the gone session's, the live one's (kept), and one with no session at all.
  const key = (pid, hex) => `${pid}.${hex.repeat(32)}.key`;
  for (const [f, ms] of [[key(4_190_001, 'ab'), dayBefore], [key(live.pid, 'cd'), hoursAgo], [key(4_190_006, 'ef'), dayBefore]]) {
    writeFileSync(join(sessions, f), 'fixture');
    age(f, ms);
  }
  age(`${live.pid}.json`, hoursAgo);
  // A file an unclean shutdown zero-filled, from before boot.
  writeFileSync(join(sessions, '4190005.json'), Buffer.alloc(300));
  age('4190005.json', dayBefore);
  // Sessions in this namespace whose process has ended: one untouched for two hours (gone) and
  // one touched just now (kept: too new to judge).
  for (const [n, ms] of [[0, hoursAgo], [1, now]]) {
    const p = spawn('sleep', ['3600'], { stdio: 'ignore' });
    const stat = readFileSync(`/proc/${p.pid}/stat`, 'utf8');
    const ticks = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
    p.kill();
    await once(p, 'exit');
    writeFileSync(
      join(sessions, `${p.pid}.json`),
      JSON.stringify({ pid: p.pid, sessionId: `9c0d1e2f-3a4b-4c5d-8e7f-00000000000${n}`, cwd: project, startedAt: ms - 60_000, procStart: ticks, version: 'fixture', kind: 'interactive', entrypoint: 'cli', name: `ended-${n}`, status: 'idle', statusUpdatedAt: ms, updatedAt: ms, pidDomain: `linux:${machineId}:${ownNs}` }),
    );
    age(`${p.pid}.json`, ms);
    (n === 0 ? PRUNE.gone : PRUNE.kept).push(`${p.pid}.json`);
  }
  // A key with no entry goes only in a WSL distro (there "before boot" needs no start ticks).
  const onWsl = ['WSLInterop', 'WSLInterop-late'].some((n) => existsSync(`/proc/sys/fs/binfmt_misc/${n}`)) && !existsSync('/.dockerenv') && !existsSync('/run/.containerenv');
  PRUNE.gone.push('4190001.json', key(4_190_001, 'ab'), '4190005.json');
  (onWsl ? PRUNE.gone : PRUNE.kept).push(key(4_190_006, 'ef'));
  PRUNE.kept.push(`${live.pid}.json`, key(live.pid, 'cd'), '4190002.json', '4190003.json');
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
  if (BEFORE_BOOT) {
    const shown = (sessionId) => roster?.find?.((e) => e.sessionId === sessionId);
    check('another PID namespace on this machine, started and last written before boot → gone', Array.isArray(roster) && !shown(BEFORE_BOOT.gone), seen);
    check("…with another machine id (a container's own) → shown, its pid unchecked", !!shown(BEFORE_BOOT.otherMachine)?.otherPidNamespace, seen);
    check('…written since boot (a stepped clock can move boot later) → shown, its pid unchecked', !!shown(BEFORE_BOOT.writtenSince)?.otherPidNamespace, seen);
    const present = (f) => existsSync(join(home.claudeHome, 'sessions', f));
    for (let t = 0; t < 5000 && PRUNE.gone.some(present); t += 250) await new Promise((r) => setTimeout(r, 250));
    check('registry leftovers → deleted: from before boot, an ended process, zero-filled, and their keys', PRUNE.gone.every((f) => !present(f)), PRUNE.gone.filter(present).join(', ') || `${PRUNE.gone.length} deleted`);
    check('…but not a live session or its key, another machine id, one written since boot, one touched within the hour, or a shape it doesn\'t know', PRUNE.kept.every(present), PRUNE.kept.filter((f) => !present(f)).join(', ') || `${PRUNE.kept.length} kept`);
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
