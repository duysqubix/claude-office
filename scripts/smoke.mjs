// Smoke test against a running dev office. It never hires or fires anyone, but it opens a
// Shell-tab shell and a hot desk's shell and closes them again, so it never runs against your
// own game (4777).
//   PORT=4778 npm run smoke
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { homedir } from 'node:os';
import WebSocket from 'ws';

const PORT = Number(process.env.PORT);
const BASE = `http://127.0.0.1:${PORT}`;
/** Your own office: never smoke-tested, since this opens real shells. */
const YOUR_GAME = 4777;
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535 || PORT === YOUR_GAME) {
  console.error(PORT === YOUR_GAME ? 'Refusing: 4777 is your own game. Smoke-test a dev office, e.g. PORT=4778 npm run smoke' : 'Set PORT to a dev office, e.g. PORT=4778 npm run smoke');
  process.exit(2);
}
let failed = 0;

function check(name, ok, detail = '') {
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed++;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const tmux = (...args) => execFileSync('tmux', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const hasSession = (name) => {
  try {
    tmux('has-session', '-t', `=${name}`);
    return true;
  } catch {
    return false;
  }
};
const sessions = () => {
  try {
    return tmux('list-sessions', '-F', '#{session_name}').split('\n').sort();
  } catch {
    return [];
  }
};
/** Running tmux sessions: id ($N, which a rename keeps) → name. */
const sessionsById = () => {
  try {
    return new Map(tmux('list-sessions', '-F', '#{session_id}:#{session_name}').split('\n').map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1)]));
  } catch {
    return new Map();
  }
};
/** A tmux format for session `name` ('' if it isn't running). */
const show = (name, format) => {
  try {
    return tmux('display-message', '-p', '-t', `=${name}:`, format);
  } catch {
    return '';
  }
};
const real = (p) => {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
};

function request(path, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${BASE}${path}`, { method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
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

/** Poll `fn` every 100 ms until it's truthy or `ms` runs out; its last answer. */
async function until(fn, ms) {
  for (let t = 0; t < ms && !fn(); t += 100) await wait(100);
  return fn();
}

/**
 * Spotify on the laptop (#28): the office's sign-in calls, the page Spotify sends you back to,
 * and the player frame. Every call is a JSON POST from our own origin; /callback refuses a state
 * it didn't hand out, and each state works once. The player frame (where Spotify's SDK runs) is
 * its own origin: it serves only its page and glue, to its own Host, and the office refuses
 * requests from it. It never signs anyone out and never saves anything: a sign-in it starts only
 * lives in the office's memory, and its own callback uses it up. With a production build, the
 * office's CSP frames only the player frame and runs no Spotify script.
 */
async function spotify() {
  const post = (action, body = {}, headers = {}) =>
    request(`/api/spotify/${action}`, { method: 'POST', headers: { Origin: BASE, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const status = await post('status');
  const s = json(status);
  check('POST /api/spotify/status: the redirect URI is 127.0.0.1 with this port', status.status === 200 && s?.ok === true && s.redirectUri === `http://127.0.0.1:${PORT}/callback` && typeof s.connected === 'boolean', JSON.stringify(s));

  // The token endpoint: only a JSON POST from our own origin and host gets anywhere.
  const gates = [
    ['GET', await request('/api/spotify/token'), 404],
    ['a foreign Origin', await post('token', {}, { Origin: 'http://evil.example' }), 403],
    ['a foreign Host', await post('token', {}, { Host: `evil.example:${PORT}` }), 403],
    ['a form post', await request('/api/spotify/token', { method: 'POST', headers: { Origin: BASE, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'refresh=true' }), 415],
  ];
  const leaky = gates.filter(([, r, want]) => r.status !== want || /accessToken|refresh_?token/i.test(r.body));
  check('POST /api/spotify/token refuses GET (404), a foreign Origin or Host (403) and a form (415), and says nothing', !leaky.length, leaky.map(([what, r]) => `${what} → ${r.status}`).join(', ') || gates.map(([what, r]) => `${what} ${r.status}`).join(', '));
  if (!s?.connected) {
    const t = await post('token');
    check('POST /api/spotify/token while not signed in: 409, connected false', t.status === 409 && json(t)?.connected === false, `${t.status} ${t.body}`);
  } else console.log('  (this office is signed in to Spotify: the not-signed-in token check is skipped)');
  const badId = await post('login', { clientId: 'nope' });
  check('POST /api/spotify/login refuses a malformed Client ID (400)', badId.status === 400, String(badId.status));
  const unknown = await post('nope');
  check('POST /api/spotify/<unknown> is 404', unknown.status === 404, String(unknown.status));

  // /callback: no state, someone else's state, a foreign Host.
  const cb = (query, headers = {}) => request(`/callback${query}`, { headers });
  const none = await cb('');
  const csp = none.headers?.['content-security-policy'] ?? '';
  check("GET /callback without a state: 400, a page with CSP default-src 'none' and no-store", none.status === 400 && /<html/.test(none.body) && csp.startsWith("default-src 'none'") && none.headers?.['cache-control'] === 'no-store', `${none.status}; ${csp}`);
  const forged = await cb(`?code=forged&state=${randomUUID()}`);
  check('GET /callback with a state the office never handed out: 400, nothing exchanged', forged.status === 400 && /run out/.test(forged.body), String(forged.status));
  const login = await post('login', { clientId: '0123456789abcdef0123456789abcdef' });
  const url = json(login)?.url ? new URL(json(login).url) : null;
  const q = url?.searchParams;
  check(
    'POST /api/spotify/login: Spotify’s /authorize, PKCE S256, this redirect URI and a fresh state',
    login.status === 200 && url?.origin === 'https://accounts.spotify.com' && url.pathname === '/authorize' && q.get('code_challenge_method') === 'S256' && q.get('redirect_uri') === `http://127.0.0.1:${PORT}/callback` && (q.get('state') ?? '').length >= 32,
    url ? `${url.origin}${url.pathname} state ${q.get('state')?.length} chars` : login.body,
  );
  const state = q?.get('state') ?? '';
  const otherHost = await cb(`?error=access_denied&state=${state}`, { Host: `evil.example:${PORT}` });
  check('GET /callback with a foreign Host: 403', otherHost.status === 403, String(otherHost.status));
  // Saying no at Spotify uses the state up without exchanging anything (nothing is saved).
  const no = await cb(`?error=access_denied&state=${state}`);
  const again = await cb(`?error=access_denied&state=${state}`);
  check('GET /callback with the right state: handled once, then that state is refused', no.status === 400 && /said no/.test(no.body) && again.status === 400 && /run out/.test(again.body), `${no.status}, then ${again.status}`);
  const after = json(await post('status'));
  check('…and the office says the same as before (nothing saved)', after?.connected === s?.connected && after?.clientId === s?.clientId, JSON.stringify(after));

  // The player frame: its own loopback origin, only its page and glue, only to its own Host.
  const frame = s?.player ?? '';
  const fu = frame ? new URL(frame) : null;
  check('the player frame has an origin of its own: 127.0.0.1, another port', !!fu && fu.protocol === 'http:' && fu.hostname === '127.0.0.1' && fu.port !== String(PORT) && fu.port !== '4777' && fu.pathname === '/', frame);
  if (!fu) return;
  const at = (path, { method = 'GET', headers = {} } = {}) =>
    new Promise((resolve) => {
      const req = http.request(`${frame}${path}`, { method, headers }, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
      });
      req.on('error', (e) => resolve({ status: 0, headers: {}, body: e.message }));
      req.end();
    });
  const fpage = await at('/player');
  const fcsp = Object.fromEntries((fpage.headers['content-security-policy'] ?? '').split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v.join(' ')]));
  check(
    "the frame's page: CSP default-src 'none', scripts only its own and Spotify's SDK, frames only the SDK's, framed only by the office",
    fpage.status === 200 &&
      fcsp['default-src'] === "'none'" &&
      fcsp['script-src'] === "'self' https://sdk.scdn.co" &&
      fcsp['frame-src'] === 'https://sdk.scdn.co' &&
      fcsp['frame-ancestors'] === `http://127.0.0.1:${PORT} http://localhost:${PORT}` &&
      !fcsp['connect-src'] &&
      /<script src="\/player\.js"><\/script>/.test(fpage.body) &&
      !/<script>/.test(fpage.body),
    fpage.headers['content-security-policy'],
  );
  const glue = await at('/player.js');
  check('…and its glue script', glue.status === 200 && /javascript/.test(glue.headers['content-type'] ?? '') && /postMessage\(msg, parentOrigin\)/.test(glue.body), `${glue.status} ${glue.headers['content-type']}`);
  const frameGates = [
    ['/', await at('/'), 404],
    ['/api/roster', await at('/api/roster'), 404],
    ['/player/../server/index.ts', await at('/player/../server/index.ts'), 404],
    ['a foreign Host', await at('/player', { headers: { Host: `evil.example:${fu.port}` } }), 403],
    ['localhost', await at('/player', { headers: { Host: `localhost:${fu.port}` } }), 403],
    ['POST', await at('/player', { method: 'POST' }), 405],
  ];
  const open = frameGates.filter(([, r, want]) => r.status !== want);
  check('the frame serves nothing else (404), to no other Host (403), and no writes (405)', !open.length, open.map(([what, r]) => `${what} → ${r.status}`).join(', ') || frameGates.map(([what, r]) => `${what} ${r.status}`).join(', '));

  // The office refuses the frame's origin: no hiring, no terminals, no roster feed.
  const hire = await request('/api/hire', { method: 'POST', headers: { Origin: frame, 'Content-Type': 'application/json' }, body: JSON.stringify({ cwd: '/' }) });
  const fromFrame = (path) =>
    new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}${path}`, { headers: { Origin: frame } });
      ws.on('open', () => {
        ws.terminate();
        resolve('opened');
      });
      ws.on('error', () => resolve('refused'));
    });
  const term = await fromFrame('/term?kind=desk&desk=3&cols=80&rows=24');
  const feed = await fromFrame('/ws');
  const token = await post('token', {}, { Origin: frame });
  check('the office refuses the frame’s origin: /api/hire 403, /term and /ws refused, no token', hire.status === 403 && term === 'refused' && feed === 'refused' && token.status === 403, `hire ${hire.status}, term ${term}, ws ${feed}, token ${token.status}`);
  const cookies = [...(status.headers['set-cookie'] ?? []), ...((await request('/')).headers['set-cookie'] ?? [])];
  check('the office sets no cookies (127.0.0.1 shares cookies across ports)', !cookies.length, cookies.join('; '));

  // A production office: frames only the player frame, runs no Spotify script.
  const page = await request('/');
  const prod = page.headers?.['content-security-policy'] ?? '';
  if (!prod.includes('default-src')) {
    console.log('  (dev office: the production CSP check is skipped)');
    return;
  }
  const dir = Object.fromEntries(prod.split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));
  const loose = prod.split(/[\s;]+/).filter((t) => t.includes('*') || t === "'unsafe-eval'" || t === 'https:' || t === 'http:');
  check(
    'production CSP: frames only the player frame; Spotify’s Web API and cover art hosts; no Spotify script, no wildcards or eval',
    dir['frame-src']?.join(' ') === frame && dir['script-src']?.join(' ') === "'self'" && !prod.includes('scdn.co/') && !prod.includes('sdk.scdn.co') && dir['connect-src']?.includes('https://api.spotify.com') && dir['img-src']?.includes('https://i.scdn.co') && !loose.length,
    prod,
  );
}
/**
 * Hot desks: your login shell in your home folder at an empty desk, named for this office's
 * port. An echo round-trips; standing up keeps it and sitting again finds it; `exit` and Shut
 * down close it; bad desks and other sites are refused. It uses desk 3, or the next desk with
 * no shell. Others share a dev office, so it checks the desk is still free right before each
 * sit, and only ever types into, exits, shuts down or cleans up a shell it started itself.
 */
async function hotDesks(termClose) {
  const deskName = (n) => `office-desk${PORT}-${String(n).padStart(2, '0')}`;
  // The office's feed: every hot desk list it pushes.
  const pushes = [];
  const feed = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { Origin: BASE } });
  feed.on('message', (d) => {
    const m = JSON.parse(String(d));
    if (m.type === 'desks') pushes.push(m.open);
  });
  feed.on('error', () => {});
  const latest = () => pushes.at(-1);
  /** No shell at desk `n` right now: not hot, and no tmux session. */
  const free = (n) => !latest()?.includes(n) && !hasSession(deskName(n));
  /** The shell at `name` is the one a sit-down at `since` (epoch s) started, not someone else's; if not, says why. */
  const startedHere = (name, since) => {
    if (!hasSession(name)) {
      check(`desk ${desk}: your shell opens`, false, 'no tmux session');
      return false;
    }
    if (Number(show(name, '#{session_created}')) >= since) return true;
    console.log(`  (someone else sat down at desk ${desk} first: the rest of the hot desk checks are skipped)`);
    return false;
  };
  /** Sit at `desk` the way the game does: its output so far, and how it closed. */
  const sit = (desk) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/term?kind=desk&desk=${desk}&cols=100&rows=30`, { headers: { Origin: BASE } });
    const t = { ws, out: '', closed: null, type: (d) => ws.send(JSON.stringify({ t: 'in', d })) };
    ws.on('message', (d) => (t.out += String(d)));
    ws.on('close', (code, reason) => (t.closed = { code, reason: String(reason) }));
    ws.on('error', () => {});
    return t;
  };
  const shut = (body, origin = BASE) => request('/api/desk/close', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let desk = 3;
  /** The shell this check started (its session and pane pid): the only one it ever cleans up. */
  let mine = null;
  try {
    check('/ws sends the hot desks on connect', await until(() => Array.isArray(latest()), 3000), JSON.stringify(latest()));
    // Desk 3, or the next one without a shell: someone may be sitting at 3.
    while (desk <= 99 && !free(desk)) desk++;
    if (desk > 99) {
      console.log('  (every desk has a shell: hot desk checks skipped)');
      return;
    }
    const name = deskName(desk);

    // Refused: anything but a whole number 0 to 99, other sites, and other hosts.
    const before = sessions().join();
    const queries = ['kind=desk', 'kind=desk&desk=', ...['-1', '100', '3.5', '03', '+3', '%2B3', '%203', '1e1', '0x3', 'three'].map((v) => `kind=desk&desk=${v}`)];
    const wrong = [];
    for (const q of queries) {
      const r = await termClose(q);
      if (r.code !== 1008) wrong.push(`${q} → ${r.code}`);
    }
    check('/term?kind=desk refuses anything but a whole number 0 to 99 (1008) and opens nothing', !wrong.length && sessions().join() === before, wrong.join(', ') || `${queries.length} refused`);
    const stranger = (headers) =>
      new Promise((resolve) => {
        const ws = new WebSocket(`ws://127.0.0.1:${PORT}/term?kind=desk&desk=${desk}`, { headers });
        ws.on('open', () => {
          ws.terminate();
          resolve('opened');
        });
        ws.on('error', () => resolve('refused'));
      });
    const otherSite = await stranger({ Origin: 'http://evil.example' });
    const otherHost = await stranger({ Origin: BASE, Host: `evil.example:${PORT}` });
    check('/term?kind=desk refuses a foreign Origin and a foreign Host', otherSite === 'refused' && otherHost === 'refused' && !hasSession(name), `${otherSite}, ${otherHost}`);
    const bodies = [{}, { desk: '3' }, { desk: -1 }, { desk: 100 }, { desk: 2.5 }, { desk: null }, { desk: true }, { desk: [3] }, { desk: 1e21 }];
    const wrongClose = [];
    for (const b of bodies) {
      const r = await shut(b);
      if (r.status !== 400) wrongClose.push(`${JSON.stringify(b)} → ${r.status}`);
    }
    check('POST /api/desk/close refuses anything but a whole number 0 to 99 (400)', !wrongClose.length, wrongClose.join(', ') || `${bodies.length} refused`);
    const crossClose = await shut({ desk }, 'http://evil.example');
    check('POST /api/desk/close refuses a foreign Origin', crossClose.status === 403, String(crossClose.status));

    // Sit down: a login shell in your home folder, and an echo round-trips. Only at a desk that's
    // still free, and only in a shell this sit started.
    if (!free(desk)) {
      console.log(`  (desk ${desk} was taken meanwhile: the rest of the hot desk checks are skipped)`);
      return;
    }
    const sat = Math.floor(Date.now() / 1000);
    const a = sit(desk);
    const up = await until(() => a.out.length > 0 || a.closed, 8000);
    if (!startedHere(name, sat)) {
      a.ws.close(1000, 'stood up');
      return;
    }
    mine = { name, pid: show(name, '#{pane_pid}') };
    await wait(600);
    const marker = randomUUID().slice(0, 8);
    a.type(`echo $((6*7))-${marker}\r`);
    const echoed = await until(() => a.out.includes(`42-${marker}`), 8000);
    const shown = a.out.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\s+/g, ' ').slice(-80);
    check(`desk ${desk}: your shell opens and an echo round-trips`, !!up && echoed, a.closed ? `closed ${a.closed.code} ${a.closed.reason}` : echoed ? `echo $((6*7))-${marker} → 42-${marker}` : shown);
    check(`its tmux session is ${name} (this office's port is in the name)`, hasSession(name));
    let at = '';
    let pid = '';
    let env = [];
    try {
      at = tmux('display-message', '-p', '-t', `=${name}:`, '#{pane_current_path}');
      pid = tmux('display-message', '-p', '-t', `=${name}:`, '#{pane_pid}');
      env = tmux('show-environment', '-t', `=${name}:`).split('\n');
    } catch {
      // not running
    }
    const stamped = ['CLAUDE_OFFICE=1', `CLAUDE_OFFICE_PORT=${PORT}`, `CLAUDE_OFFICE_DESK=${desk}`].every((v) => env.includes(v));
    check('in your home folder, stamped CLAUDE_OFFICE, CLAUDE_OFFICE_PORT and CLAUDE_OFFICE_DESK', !!at && real(at) === real(homedir()) && stamped, at || 'no session');
    check(`/ws pushes desk ${desk} as hot`, await until(() => latest()?.includes(desk), 3000), JSON.stringify(latest()));

    // Stand up and sit down again: the same shell, still showing what you did.
    a.ws.close(1000, 'stood up');
    await until(() => a.closed, 3000);
    await wait(300);
    check('standing up leaves the shell running', hasSession(name) && !!latest()?.includes(desk));
    const b = sit(desk);
    const back = await until(() => b.out.includes(`42-${marker}`), 6000);
    let pidAgain = '';
    try {
      pidAgain = tmux('display-message', '-p', '-t', `=${name}:`, '#{pane_pid}');
    } catch {
      // not running
    }
    check('sitting down again: the same shell, output and all', back && !!pid && pid === pidAgain, `pane pid ${pid} → ${pidAgain}`);
    if (pidAgain !== mine.pid) {
      b.ws.close(1000, 'stood up');
      return;
    }

    // `exit` closes it; Shut down closes a new one (again only at a free desk, and only its own).
    b.type('exit\r');
    const exited = await until(() => b.closed, 6000);
    check('`exit` closes it: the terminal ends (1000) and the tmux session is gone', !!exited && b.closed.code === 1000 && !hasSession(name), JSON.stringify(b.closed));
    check(`/ws pushes desk ${desk} as free again`, await until(() => latest() && !latest().includes(desk), 3000), JSON.stringify(latest()));
    if (!free(desk)) {
      console.log(`  (desk ${desk} was taken meanwhile: the rest of the hot desk checks are skipped)`);
      return;
    }
    const satAgain = Math.floor(Date.now() / 1000);
    const c = sit(desk);
    await until(() => c.out.length > 0 || c.closed, 8000);
    if (!startedHere(name, satAgain)) {
      c.ws.close(1000, 'stood up');
      return;
    }
    mine = { name, pid: show(name, '#{pane_pid}') };
    const fresh = hasSession(name);
    const res = await shut({ desk });
    const ended = await until(() => c.closed, 5000);
    check('a new shell opens there, and Shut down (POST /api/desk/close) ends it and its terminal', fresh && res.status === 200 && json(res)?.ok === true && !hasSession(name) && !!ended && c.closed.code === 1000, `${res.status} ${res.body}; ${JSON.stringify(c.closed)}`);
    check(`/ws pushes desk ${desk} as free once more`, await until(() => latest() && !latest().includes(desk), 3000), JSON.stringify(latest()));
    // Someone may have sat down there meanwhile, and Shut down would end their shell.
    if (!free(desk)) {
      console.log(`  (desk ${desk} was taken meanwhile: the empty-desk Shut down check is skipped)`);
      return;
    }
    const twice = await shut({ desk });
    check('shutting down a desk with no shell is fine', twice.status === 200 && json(twice)?.ok === true, String(twice.status));
  } finally {
    feed.terminate();
    // Whatever happened above, the shell this started is closed, and never one started since.
    if (mine?.pid && show(mine.name, '#{pane_pid}') === mine.pid) {
      try {
        tmux('kill-session', '-t', `=${mine.name}`);
      } catch {
        // closed meanwhile
      }
    }
  }
}

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

  // A request target no URL can hold (`//a:99999`): 400, and as a WebSocket upgrade the socket is
  // dropped. The upgrade is only sent once the GET says this office has that fix: before 1.1 it
  // took the office down.
  const raw = (head) =>
    new Promise((resolve) => {
      const s = net.connect(PORT, '127.0.0.1', () => s.write(head));
      let data = '';
      const done = () => resolve(data.split('\r\n')[0]);
      s.on('data', (d) => (data += d));
      s.on('close', done);
      s.on('error', done);
      setTimeout(() => s.destroy(), 3000);
    });
  const badGet = await raw(`GET //a:99999 HTTP/1.1\r\nHost: 127.0.0.1:${PORT}\r\nConnection: close\r\n\r\n`);
  const badUpgrade = /^HTTP\/1\.1 400/.test(badGet)
    ? await raw(`GET //a:99999 HTTP/1.1\r\nHost: 127.0.0.1:${PORT}\r\nOrigin: ${BASE}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`)
    : 'not sent';
  const stillUp = (await request('/api/roster').catch(() => ({ status: 0 }))).status;
  check('a request target no URL can hold: 400, an upgrade is dropped, and the office stays up', /^HTTP\/1\.1 400/.test(badGet) && badUpgrade === '' && stillUp === 200, `GET → ${badGet || 'nothing'}; upgrade → ${badUpgrade || 'dropped'}; roster ${stillUp}`);

  const messages = await new Promise((resolve) => {
    const got = [];
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { Origin: BASE } });
    const done = () => {
      ws.terminate();
      resolve(got);
    };
    ws.on('message', (d) => {
      got.push(JSON.parse(String(d)));
      if (got.some((m) => m.type === 'roster')) done();
    });
    ws.on('error', done);
    setTimeout(done, 3000);
  });
  // Up to the roster (stats can come in on the same read). An office with hot desks sends them
  // between the two, before the roster, which seats the regulars.
  const order = messages
    .slice(0, messages.findIndex((m) => m.type === 'roster') + 1)
    .map((m) => m.type)
    .join(', ');
  check('/ws sends hello then roster', order === 'hello, roster' || order === 'hello, desks, roster', messages.map((m) => m.type).join(', '));

  const evilWs = await new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { Origin: 'http://evil.example' } });
    ws.on('open', () => {
      ws.terminate();
      resolve('opened');
    });
    ws.on('error', () => resolve('refused'));
  });
  check('/ws refuses a foreign Origin', evilWs === 'refused', evilWs);

  // /term: bad ids and kinds are refused (1008). These never attach to anyone's Claude session.
  const termClose = (query) =>
    new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}/term?${query}`, { headers: { Origin: BASE } });
      const t = setTimeout(() => {
        ws.terminate();
        resolve({ code: 'timeout', reason: '' });
      }, 4000);
      ws.on('close', (code, reason) => {
        clearTimeout(t);
        resolve({ code, reason: String(reason) });
      });
      ws.on('error', () => {});
    });
  const badId = await termClose('id=not-a-session&kind=shell');
  check('/term refuses a bad session id', badId.code === 1008, `${badId.code} ${badId.reason}`);
  const badKind = await termClose(`id=${randomUUID()}&kind=root`);
  const shells = badKind.code === 1008 && /kind/i.test(badKind.reason);
  check('/term refuses an unknown terminal kind', shells, `${badKind.code} ${badKind.reason}`);
  const stranger = await termClose(`id=${randomUUID()}&kind=shell`);
  check('/term refuses a shell for someone not in the office', stranger.code === 1008, `${stranger.code} ${stranger.reason}`);

  // Only this office's hires are hosted (let go, interrupted, talked to, sat with here): someone
  // in another office's hire, or in a hire from before the port stamp, is in their own terminal
  // here. Read-only: the roster against each hire's tmux stamp.
  const stampedPort = (name) => {
    try {
      return tmux('show-environment', '-t', `=${name}:`).split('\n').find((l) => l.startsWith('CLAUDE_OFFICE_PORT='))?.slice(19) ?? '';
    } catch {
      return null; // closed meanwhile
    }
  };
  let hirePanes = [];
  try {
    // Colon-separated like server/tmux.ts listHosted: tmux 3.3/3.4 print a tab in -F as "_".
    hirePanes = tmux('list-panes', '-a', '-F', '#{session_name}:#{pane_pid}')
      .split('\n')
      .map((l) => l.split(':'))
      .filter(([name]) => /^office-[0-9a-f]{8}$/i.test(name));
  } catch {
    // no tmux server
  }
  const portOf = new Map(hirePanes.map(([name, pid]) => [Number(pid), stampedPort(name)]));
  const hosted = (employees ?? []).filter((e) => e.hosted);
  const notOurs = hosted.filter((e) => {
    // Still starting (no pid yet): their tmux session is named for them.
    const port = e.pid ? portOf.get(e.pid) : stampedPort(`office-${e.sessionId.slice(0, 8)}`);
    return port != null && port !== String(PORT);
  });
  const others = [...portOf.values()].filter((p) => p != null && p !== String(PORT)).length;
  check('everyone hosted here was hired by this office (their tmux port stamp)', !notOurs.length, notOurs.map((e) => e.displayName).join(', ') || `${hosted.length} hosted, ${others} other offices' hire(s) left alone`);
  // And they're marked, so this office never offers to bring them in.
  const unmarked = (employees ?? []).filter((e) => {
    const port = portOf.get(e.pid);
    return !e.hosted && port != null && port !== String(PORT) && !e.otherOffice;
  });
  check("everyone in another office's hire is marked otherOffice", !unmarked.length, unmarked.map((e) => e.displayName).join(', ') || `${(employees ?? []).filter((e) => e.otherOffice).length} marked`);
  const nobody = randomUUID();
  const notHere = [];
  for (const path of ['/api/fire', '/api/interrupt', '/api/say']) {
    const r = await request(path, { method: 'POST', headers: { Origin: BASE, 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: nobody, text: 'hello' }) });
    if (r.status !== 400) notHere.push(`${path} → ${r.status}`);
  }
  const sitWith = await termClose(`id=${nobody}&kind=claude`);
  if (sitWith.code !== 1008 || !/not an office session/i.test(sitWith.reason)) notHere.push(`/term?kind=claude → ${sitWith.code} ${sitWith.reason}`);
  check('fire, interrupt, say and /term?kind=claude refuse someone this office never hired (400, 1008 Not an office session)', !notHere.length, notHere.join(', '));

  // The Shell tab: someone's shell opens in their folder. An external session first, so an
  // office without shells (it ignores kind) never attaches to anyone's Claude; never anyone in
  // an office's hire; and a shell this check started is closed again afterwards.
  const who = shells ? (employees ?? []).find((e) => !e.hosted && e.cwd && !portOf.has(e.pid)) ?? (employees ?? []).find((e) => e.cwd && !portOf.has(e.pid)) : undefined;
  if (who) {
    const name = `office-${who.sessionId.slice(0, 8)}-sh${PORT}`;
    const before = sessionsById();
    const opened = await new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}/term?id=${who.sessionId}&kind=shell&cols=100&rows=30`, { headers: { Origin: BASE } });
      let settled = false;
      const done = (v) => {
        if (settled) return;
        settled = true;
        ws.terminate();
        resolve(v);
      };
      // The first output means the shell is up; give it a moment to settle in its folder.
      ws.once('message', () => setTimeout(() => done({ ok: true }), 600));
      ws.on('close', (code, reason) => done({ ok: false, why: `${code} ${reason}` }));
      ws.on('error', () => {});
      setTimeout(() => done({ ok: false, why: 'no output in 5 s' }), 5000);
    });
    let at = '';
    try {
      at = tmux('display-message', '-p', '-t', `=${name}:`, '#{pane_current_path}');
    } catch {
      // not running
    }
    check(`a shell opens in ${who.displayName}'s folder, in ${name} (this office's port is in the name)`, opened.ok && !!at && real(at) === real(who.cwd), `${opened.why ?? 'opened'}; ${at || 'no session'} vs ${who.cwd}`);
    // Close what this check opened, whatever the office named it: a session that wasn't running
    // before (by tmux id, so an older shell the office renamed isn't new), is this person's
    // shell, and carries this office's stamp. Never one it found.
    for (const [id, s] of sessionsById()) {
      if (before.has(id) || !s.startsWith(`office-${who.sessionId.slice(0, 8)}-sh`) || stampedPort(s) !== String(PORT)) continue;
      try {
        tmux('kill-session', '-t', id);
      } catch {
        // already gone
      }
    }
  } else {
    console.log(shells ? '  (nobody to open a shell for: shell check skipped)' : '  (this office has no Shell tab: shell check skipped)');
  }

  await spotify();
  await hotDesks(termClose);
} catch (err) {
  check('server reachable', false, err.message);
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll good.');
process.exit(failed ? 1 : 0);
