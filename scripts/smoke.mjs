// Smoke test against a running office server (read-only: never hires or fires anyone; it
// opens one Shell-tab shell and closes it again, and on a dev office one hot desk's shell).
//   npm run smoke            (expects the server on 127.0.0.1:4777, or set PORT)
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import http from 'node:http';
import { homedir } from 'node:os';
import WebSocket from 'ws';

const PORT = Number(process.env.PORT ?? 4777);
const BASE = `http://127.0.0.1:${PORT}`;
/** Your own office: the hot desk checks never open or close a shell there. */
const YOUR_GAME = 4777;
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

/** Poll `fn` every 100 ms until it's truthy or `ms` runs out; its last answer. */
async function until(fn, ms) {
  for (let t = 0; t < ms && !fn(); t += 100) await wait(100);
  return fn();
}

/**
 * Hot desks (dev offices only): your login shell in your home folder at an empty desk, named
 * for this office's port. An echo round-trips; standing up keeps it and sitting again finds
 * it; `exit` and Shut down close it; bad desks and other sites are refused. It uses desk 3, or
 * the next desk with no shell (never anyone else's), and closes whatever it opened.
 */
async function hotDesks(termClose) {
  const deskName = (n) => `office-desk${PORT}-${String(n).padStart(2, '0')}`;
  const sessions = () => {
    try {
      return tmux('list-sessions', '-F', '#{session_name}').split('\n').sort();
    } catch {
      return [];
    }
  };
  // The office's feed: every hot desk list it pushes.
  const pushes = [];
  const feed = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers: { Origin: BASE } });
  feed.on('message', (d) => {
    const m = JSON.parse(String(d));
    if (m.type === 'desks') pushes.push(m.open);
  });
  feed.on('error', () => {});
  const latest = () => pushes.at(-1);
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
  /** The tmux session this check sat down at (it had no shell before). */
  let mine = '';
  try {
    check('/ws sends the hot desks on connect', await until(() => Array.isArray(latest()), 3000), JSON.stringify(latest()));
    // Desk 3, or the next one without a shell: someone may be sitting at 3.
    while (desk <= 99 && (latest()?.includes(desk) || hasSession(deskName(desk)))) desk++;
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

    // Sit down: a login shell in your home folder, and an echo round-trips.
    mine = name;
    const a = sit(desk);
    const up = await until(() => a.out.length > 0 || a.closed, 8000);
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

    // `exit` closes it; Shut down closes a new one.
    b.type('exit\r');
    const exited = await until(() => b.closed, 6000);
    check('`exit` closes it: the terminal ends (1000) and the tmux session is gone', !!exited && b.closed.code === 1000 && !hasSession(name), JSON.stringify(b.closed));
    check(`/ws pushes desk ${desk} as free again`, await until(() => latest() && !latest().includes(desk), 3000), JSON.stringify(latest()));
    const c = sit(desk);
    await until(() => c.out.length > 0 || c.closed, 8000);
    const fresh = hasSession(name);
    const res = await shut({ desk });
    const ended = await until(() => c.closed, 5000);
    check('a new shell opens there, and Shut down (POST /api/desk/close) ends it and its terminal', fresh && res.status === 200 && json(res)?.ok === true && !hasSession(name) && !!ended && c.closed.code === 1000, `${res.status} ${res.body}; ${JSON.stringify(c.closed)}`);
    check(`/ws pushes desk ${desk} as free once more`, await until(() => latest() && !latest().includes(desk), 3000), JSON.stringify(latest()));
    const twice = await shut({ desk });
    check('shutting down a desk with no shell is fine', twice.status === 200 && json(twice)?.ok === true, String(twice.status));
  } finally {
    feed.terminate();
    // Whatever happened above, the shell this opened is closed.
    if (mine && hasSession(mine)) {
      try {
        tmux('kill-session', '-t', `=${mine}`);
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
    const had = hasSession(name);
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
    if (!had) {
      try {
        tmux('kill-session', '-t', `=${name}`);
      } catch {
        // already gone
      }
    }
  } else {
    console.log(shells ? '  (nobody to open a shell for: shell check skipped)' : '  (this office has no Shell tab: shell check skipped)');
  }

  if (PORT === YOUR_GAME) console.log('  (your game: hot desk checks skipped; run them on a dev office, e.g. PORT=4778)');
  else await hotDesks(termClose);
} catch (err) {
  check('server reachable', false, err.message);
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll good.');
process.exit(failed ? 1 : 0);
