// Smoke test against a running office server (read-only: never hires or fires anyone).
//   npm run smoke            (expects the server on 127.0.0.1:4777, or set PORT)
import http from 'node:http';
import WebSocket from 'ws';

const PORT = Number(process.env.PORT ?? 4777);
const BASE = `http://127.0.0.1:${PORT}`;
let failed = 0;

function check(name, ok, detail = '') {
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed++;
}

function request(path, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${BASE}${path}`, { method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

const json = (r) => {
  try {
    return JSON.parse(r.body);
  } catch {
    return undefined;
  }
};

try {
  const roster = await request('/api/roster');
  const employees = json(roster);
  check('GET /api/roster', roster.status === 200 && Array.isArray(employees), `${employees?.length ?? 0} employees`);
  for (const e of employees ?? []) {
    const ok = typeof e.sessionId === 'string' && typeof e.displayName === 'string' && ['starting', 'working', 'needs-you', 'idle', 'sleeping'].includes(e.state);
    check(`  ${e.displayName ?? '?'} is well-formed`, ok, `${e.state}, ${e.project}${e.hosted ? ', hosted' : ''}`);
  }

  const projects = json(await request('/api/projects'));
  check('GET /api/projects', Array.isArray(projects) && projects.length > 0, `${projects?.length ?? 0} folders`);
  const archive = json(await request('/api/archive'));
  check('GET /api/archive', Array.isArray(archive), `${archive?.length ?? 0} past sessions`);
  if (employees?.[0]) {
    const chatter = json(await request(`/api/session/${employees[0].sessionId}/chatter`));
    check('GET /api/session/:id/chatter', Array.isArray(chatter), `${chatter?.length ?? 0} lines`);
  }

  const badHost = await request('/api/roster', { headers: { Host: `evil.example:${PORT}` } });
  check('rejects a foreign Host header', badHost.status === 403, String(badHost.status));
  const crossOrigin = await request('/api/fire', {
    method: 'POST',
    headers: { Origin: 'http://evil.example', 'Content-Type': 'application/json' },
    body: '{}',
  });
  check('rejects cross-origin POST', crossOrigin.status === 403, String(crossOrigin.status));
  const form = await request('/api/hire', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'cwd=/' });
  check('rejects non-JSON POST', form.status === 415, String(form.status));

  const messages = await new Promise((resolve) => {
    const got = [];
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { Origin: BASE } });
    const done = () => {
      ws.terminate();
      resolve(got);
    };
    ws.on('message', (d) => {
      got.push(JSON.parse(String(d)));
      if (got.length >= 2) done();
    });
    ws.on('error', done);
    setTimeout(done, 3000);
  });
  check('/ws sends hello then roster', messages[0]?.type === 'hello' && messages[1]?.type === 'roster', messages.map((m) => m.type).join(', '));

  const evilWs = await new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { Origin: 'http://evil.example' } });
    ws.on('open', () => {
      ws.terminate();
      resolve('opened');
    });
    ws.on('error', () => resolve('refused'));
  });
  check('/ws refuses a foreign Origin', evilWs === 'refused', evilWs);
} catch (err) {
  check('server reachable', false, err.message);
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll good.');
process.exit(failed ? 1 : 0);
