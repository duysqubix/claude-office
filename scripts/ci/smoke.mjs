// The smoke test (scripts/smoke.mjs) in an office of its own (scripts/ci/office.mjs), for CI
// and for running it anywhere without touching your office: one pretend Claude session (a
// running process, its ~/.claude/sessions entry and a transcript), one past session,
// thought bubbles off, a private tmux server and a free port. No Claude Code or login needed;
// the checks that would need them (hiring, answering, thoughts) are not part of the smoke test.
// Then it checks the office read the pretend session the way Claude Code writes it.
//   npm run build && node scripts/ci/smoke.mjs     (serves dist/; without a build it uses dev mode)
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
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
  home.cleanup();
}

console.log(failed || code ? `\nsmoke failed (smoke.mjs exit ${code}, ${failed} fixture check(s) failed)` : '\nsmoke: all good');
process.exit(failed || code ? 1 : 0);
