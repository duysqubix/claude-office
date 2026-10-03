// Spotify sign-in checks (#28): server/spotify.ts against a pretend Spotify accounts service on
// localhost. No network, no Spotify account, no office. It walks the PKCE sign-in (the S256
// challenge must match the verifier), checks the state is single-use and runs out, that the
// tokens land in an owner-only file, that a refresh without a new refresh token keeps the old
// one, that refreshes never run twice at once, and that a revoked sign-in signs you out. With a
// pretend fetch: a failing Spotify is asked once, not hammered (and a 429's Retry-After heeded);
// a save on its way reaches the disk before shutdown, and a cut-short one leaves no copy; signing
// out during a refresh hands out no token. Then two real offices (a throwaway HOME, ports of
// their own, never yours): each keeps its own sign-in.
//   node --import tsx scripts/spotify-auth.mjs
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SpotifyLink } from '../server/spotify.ts';
import { freePort, makeHome, startOffice } from './ci/office.mjs';

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed++;
};

// ---------------------------------------------------------------------------------- pretend Spotify
const CLIENT = '0123456789abcdef0123456789abcdef';
const spotify = {
  /** code → { challenge, redirect, client } from the pretend /authorize. */
  codes: new Map(),
  refresh: new Set(),
  calls: [],
  /** Next refresh: also hand out a new refresh token. */
  rotate: false,
  /** Next refreshes are slow (ms), to catch two at once. */
  delay: 0,
  serial: 0,
  authorize(url) {
    const q = new URL(url).searchParams;
    const code = `code-${++this.serial}`;
    this.codes.set(code, { challenge: q.get('code_challenge'), redirect: q.get('redirect_uri'), client: q.get('client_id') });
    return { code, state: q.get('state') };
  },
};
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', async () => {
    const form = new URLSearchParams(body);
    spotify.calls.push(Object.fromEntries(form));
    const send = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(value));
    };
    if (req.method !== 'POST' || req.url !== '/api/token' || !String(req.headers['content-type']).includes('application/x-www-form-urlencoded')) return send(400, { error: 'invalid_request' });
    if (form.get('grant_type') === 'authorization_code') {
      const c = spotify.codes.get(form.get('code'));
      spotify.codes.delete(form.get('code'));
      const s256 = createHash('sha256').update(form.get('code_verifier') ?? '').digest('base64url');
      if (!c || c.challenge !== s256 || c.redirect !== form.get('redirect_uri') || c.client !== form.get('client_id')) return send(400, { error: 'invalid_grant', error_description: 'Invalid authorization code' });
      const refresh = `R${++spotify.serial}`;
      spotify.refresh.add(refresh);
      return send(200, { access_token: `A${spotify.serial}`, token_type: 'Bearer', expires_in: 3600, refresh_token: refresh, scope: 'streaming user-read-email' });
    }
    if (form.get('grant_type') === 'refresh_token') {
      if (spotify.delay) await new Promise((r) => setTimeout(r, spotify.delay));
      if (!spotify.refresh.has(form.get('refresh_token')) || form.get('client_id') !== CLIENT) return send(400, { error: 'invalid_grant', error_description: 'Refresh token revoked' });
      const out = { access_token: `A${++spotify.serial}`, token_type: 'Bearer', expires_in: 3600, scope: 'streaming user-read-email' };
      if (spotify.rotate) {
        spotify.refresh.delete(form.get('refresh_token'));
        out.refresh_token = `R${++spotify.serial}`;
        spotify.refresh.add(out.refresh_token);
        spotify.rotate = false;
      }
      return send(200, out);
    }
    send(400, { error: 'unsupported_grant_type' });
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ACCOUNTS = `http://127.0.0.1:${server.address().port}`;

/** A ServerResponse stand-in for /callback's page. */
const pageRes = () => {
  const r = { status: 0, headers: {}, body: '' };
  r.writeHead = (status, headers) => Object.assign(r, { status, headers: { ...r.headers, ...headers } });
  r.end = (b) => (r.body = String(b ?? ''));
  r.setHeader = (k, v) => (r.headers[k] = v);
  return r;
};

const dir = mkdtempSync(join(tmpdir(), 'office-spotify-'));
const file = join(dir, 'nested', 'spotify.json');
let clock = Date.now();
const make = (opts = {}) => new SpotifyLink({ port: 4799, file, accounts: ACCOUNTS, now: () => clock, ...opts });
const link = make();
const call = (l, action, body = {}) => l.api(action, body);
const callback = async (l, query) => {
  const res = pageRes();
  await l.callback(new URL(`http://127.0.0.1:4799/callback?${query}`), res);
  return res;
};
/** Sign in through the pretend Spotify: the state and the code it sends back. */
const signIn = async (l) => {
  const r = await call(l, 'login', { clientId: CLIENT });
  return { url: r.body.url, ...spotify.authorize(r.body.url) };
};

try {
  // ---------------------------------------------------------------------------- before signing in
  let r = await call(link, 'status');
  check('status before any sign-in: not connected, no Client ID, the redirect URI on 127.0.0.1 with this port', r.status === 200 && r.body.connected === false && r.body.clientId === null && r.body.redirectUri === 'http://127.0.0.1:4799/callback', JSON.stringify(r.body));
  r = await call(link, 'token');
  check('token before signing in: 409, not connected', r.status === 409 && r.body.ok === false && r.body.connected === false, JSON.stringify(r));
  const bad = [];
  for (const clientId of [undefined, '', 'abc', 'x'.repeat(32), `${CLIENT}0`, `${CLIENT} extra`, 42, [CLIENT]]) {
    const b = await call(link, 'login', { clientId });
    if (b.status !== 400) bad.push(`${JSON.stringify(clientId)} → ${b.status}`);
  }
  check('login refuses anything but a 32-character hex Client ID (400)', !bad.length, bad.join(', ') || '8 refused');
  r = await call(link, 'nope');
  check('an unknown action is 404', r.status === 404, String(r.status));

  // ---------------------------------------------------------------------------- the sign-in URL
  const first = await signIn(link);
  const u = new URL(first.url);
  const q = u.searchParams;
  check(
    'login: Spotify’s /authorize with response_type=code, this client, the redirect URI, S256 and a challenge',
    u.origin === ACCOUNTS && u.pathname === '/authorize' && q.get('response_type') === 'code' && q.get('client_id') === CLIENT && q.get('redirect_uri') === 'http://127.0.0.1:4799/callback' && q.get('code_challenge_method') === 'S256' && /^[A-Za-z0-9_-]{43}$/.test(q.get('code_challenge') ?? ''),
    first.url,
  );
  check('login: an unguessable state (≥ 32 url-safe characters)', /^[A-Za-z0-9_-]{32,}$/.test(q.get('state') ?? ''), q.get('state'));
  const scopes = new Set((q.get('scope') ?? '').split(' '));
  check('login: asks for streaming, playback control, playlists and Liked Songs', ['streaming', 'user-read-email', 'user-read-private', 'user-modify-playback-state', 'user-read-playback-state', 'playlist-read-private', 'playlist-read-collaborative', 'user-library-read'].every((s) => scopes.has(s)), q.get('scope'));
  const again = await signIn(link);
  check('every sign-in gets its own state and challenge', again.state !== first.state && new URL(again.url).searchParams.get('code_challenge') !== q.get('code_challenge'));
  r = await call(link, 'status');
  check('starting a sign-in changes nothing the office says until it works', r.body.clientId === null && r.body.connected === false, JSON.stringify(r.body));

  // ---------------------------------------------------------------------------- /callback: state
  let page = await callback(link, `code=${first.code}&state=not-the-state`);
  check('callback with an unknown state: 400, nothing exchanged', page.status === 400 && spotify.calls.length === 0, `${page.status}, ${spotify.calls.length} token calls`);
  page = await callback(link, `code=${first.code}`);
  check('callback with no state: 400', page.status === 400, String(page.status));
  page = await callback(link, `error=access_denied&state=${again.state}`);
  check('callback with error=access_denied: 400 page, nothing exchanged', page.status === 400 && /said no/.test(page.body) && spotify.calls.length === 0, String(page.status));
  page = await callback(link, `code=${again.code}&state=${again.state}`);
  check('…and that state is used up: the same state again is refused', page.status === 400 && spotify.calls.length === 0, String(page.status));

  // A code made for another sign-in's challenge: Spotify refuses it (the verifier doesn't match).
  const third = await signIn(link);
  page = await callback(link, `code=${first.code}&state=${third.state}`);
  check('a code from another sign-in fails the PKCE check at Spotify: 502 page, not connected', page.status === 502 && (await call(link, 'status')).body.connected === false && /Invalid authorization code/.test(page.body), `${page.status}`);

  // ---------------------------------------------------------------------------- /callback: success
  spotify.calls.length = 0;
  const good = await signIn(link);
  page = await callback(link, `code=${good.code}&state=${good.state}`);
  const exchange = spotify.calls[0] ?? {};
  check(
    'callback with the right state: one token exchange, with the code, the redirect URI, the client and the verifier (no secret)',
    page.status === 200 && spotify.calls.length === 1 && exchange.grant_type === 'authorization_code' && exchange.code === good.code && exchange.redirect_uri === 'http://127.0.0.1:4799/callback' && exchange.client_id === CLIENT && /^[A-Za-z0-9_-]{43,128}$/.test(exchange.code_verifier) && !('client_secret' in exchange),
    JSON.stringify({ status: page.status, exchange }),
  );
  const csp = page.headers['Content-Security-Policy'] ?? '';
  const inline = [...page.body.matchAll(/<script>([^<]*)<\/script>/g)].map((m) => m[1]);
  const hash = inline[0] ? `'sha256-${createHash('sha256').update(inline[0]).digest('base64')}'` : 'none';
  const scriptSrc = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src'));
  check("the page: no-store, CSP default-src 'none', and its one script allowed by hash only", page.headers['Cache-Control'] === 'no-store' && csp.includes("default-src 'none'") && inline.length === 1 && scriptSrc === `script-src ${hash}`, csp);
  r = await call(link, 'status');
  check('now connected, with that Client ID', r.body.connected === true && r.body.clientId === CLIENT, JSON.stringify(r.body));
  const saved = JSON.parse(readFileSync(file, 'utf8'));
  const mode = statSync(file).mode & 0o777;
  const dirMode = statSync(join(dir, 'nested')).mode & 0o777;
  check('tokens saved in an owner-only file (0600) in an owner-only folder (0700)', mode === 0o600 && dirMode === 0o700 && saved.refreshToken && saved.clientId === CLIENT, `file ${mode.toString(8)}, folder ${dirMode.toString(8)}`);
  page = await callback(link, `code=${good.code}&state=${good.state}`);
  check('the same callback again (a reload, a replay) is refused: the state was used', page.status === 400 && spotify.calls.length === 1, String(page.status));

  // ---------------------------------------------------------------------------- tokens
  r = await call(link, 'token');
  const firstAccess = r.body.accessToken;
  check('token: the access token from the sign-in, with its expiry; no refresh token in the reply', r.status === 200 && firstAccess === `A${spotify.serial}` && r.body.expiresAt > clock && !JSON.stringify(r.body).includes(saved.refreshToken) && spotify.calls.length === 1, JSON.stringify(r.body));
  r = await call(link, 'token', { refresh: true });
  check('refresh: true on a brand-new token: the same one (no refresh within 30 s)', r.body.accessToken === firstAccess && spotify.calls.length === 1, `${spotify.calls.length} token calls`);
  clock += 31_000;
  r = await call(link, 'token', { refresh: true });
  check('refresh: true once it is 30 s old: a new one', r.status === 200 && r.body.accessToken !== firstAccess && spotify.calls.length === 2 && spotify.calls[1].grant_type === 'refresh_token' && spotify.calls[1].client_id === CLIENT, `${spotify.calls.length} token calls`);
  check('a refresh with no new refresh token keeps the old one', JSON.parse(readFileSync(file, 'utf8')).refreshToken === saved.refreshToken);

  clock += 3600_000 - 30_000;
  spotify.delay = 150;
  const n0 = spotify.calls.length;
  const many = await Promise.all([call(link, 'token'), call(link, 'token'), call(link, 'token')]);
  spotify.delay = 0;
  check('a token within a minute of expiry is refreshed, once for three callers at once', many.every((m) => m.status === 200 && m.body.accessToken === many[0].body.accessToken) && spotify.calls.length === n0 + 1, `${spotify.calls.length - n0} refreshes`);

  spotify.rotate = true;
  clock += 3600_000;
  r = await call(link, 'token');
  const rotated = JSON.parse(readFileSync(file, 'utf8')).refreshToken;
  check('a refresh that brings a new refresh token keeps the new one', r.status === 200 && rotated !== saved.refreshToken && spotify.refresh.has(rotated), rotated);

  // A second office process (or a restart) reads the same file.
  const reborn = make();
  r = await call(reborn, 'token');
  check('after a restart: still signed in, from the file', r.status === 200 && r.body.accessToken, JSON.stringify(r.body).slice(0, 80));

  // Unreachable Spotify: an error, and the sign-in is kept.
  const offline = make({ accounts: 'http://127.0.0.1:9' });
  clock += 3600_000;
  r = await call(offline, 'token');
  check('Spotify unreachable: 502, still signed in', r.status === 502 && (await call(offline, 'status')).body.connected === true, JSON.stringify(r.body));

  // Revoked at Spotify: signed out, Client ID kept.
  spotify.refresh.clear();
  r = await call(link, 'token');
  const after = JSON.parse(readFileSync(file, 'utf8'));
  check('a revoked refresh token signs you out (401, connected: false); the Client ID stays', r.status === 401 && r.body.connected === false && !after.refreshToken && !after.accessToken && after.clientId === CLIENT, JSON.stringify({ r: r.body, after }));
  r = await call(link, 'status');
  check('…status says so, with the Client ID for the form', r.body.connected === false && r.body.clientId === CLIENT, JSON.stringify(r.body));

  // Sign in again, then sign out.
  const back = await signIn(link);
  page = await callback(link, `code=${back.code}&state=${back.state}`);
  r = await call(link, 'logout');
  const out = JSON.parse(readFileSync(file, 'utf8'));
  check('sign in again, then logout: tokens gone, Client ID kept', page.status === 200 && r.body.ok === true && !out.refreshToken && out.clientId === CLIENT && (await call(link, 'token')).status === 409, JSON.stringify(out));

  // States run out after ten minutes.
  const stale = await signIn(link);
  clock += 10 * 60_000 + 1000;
  page = await callback(link, `code=${stale.code}&state=${stale.state}`);
  check('a sign-in that comes back after ten minutes is refused', page.status === 400, String(page.status));

  // Only the newest four sign-ins wait.
  const waiting = [];
  for (let i = 0; i < 5; i++) waiting.push(await signIn(link));
  page = await callback(link, `code=${waiting[0].code}&state=${waiting[0].state}`);
  const newest = await callback(link, `code=${waiting[4].code}&state=${waiting[4].state}`);
  check('five sign-ins started: the oldest is dropped, the newest works', page.status === 400 && newest.status === 200, `${page.status}, ${newest.status}`);

  // Spotify's wording on the page is text, never markup.
  const evil = await signIn(link);
  page = await callback(link, `error=${encodeURIComponent('<script>alert(1)</script>')}&state=${evil.state}`);
  check('an error from Spotify is shown as text (escaped), never as markup', page.status === 400 && !page.body.includes('<script>alert') && page.body.includes('&lt;script&gt;'), page.body.match(/<p>.*<\/p>/)?.[0]);

  // A hand-made file with loose permissions is tightened on load; junk is ignored.
  const loose = join(dir, 'loose.json');
  writeFileSync(loose, JSON.stringify({ clientId: CLIENT, refreshToken: 'R-loose' }), { mode: 0o644 });
  const l2 = make({ file: loose });
  r = await call(l2, 'status');
  check('an existing file is read, and made owner-only', r.body.connected === true && (statSync(loose).mode & 0o777) === 0o600, (statSync(loose).mode & 0o777).toString(8));
  const junk = join(dir, 'junk.json');
  writeFileSync(junk, '{"clientId": "nope", "refreshToken": 1');
  r = await call(make({ file: junk }), 'status');
  check('a broken file counts as not signed in', r.body.connected === false && r.body.clientId === null, JSON.stringify(r.body));

  // ---------------------------------------------------------------------------- Spotify failing; saving; signing out
  // A pretend fetch (so each call to Spotify is counted) and a scratch sign-in file each.
  const fake = (answer) => {
    const f = async (url, init) => {
      f.calls++;
      return answer(f.calls, String(url), init);
    };
    f.calls = 0;
    return f;
  };
  const reply = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  /** Wait for `cond` (a state, not a time): the probes below never race the code they test. */
  const waitFor = async (cond, ms = 5000) => {
    for (const t0 = performance.now(); !cond(); await sleep(1)) if (performance.now() - t0 > ms) throw new Error(`waited ${ms} ms for ${cond}`);
  };
  let n = 0;
  /** A link signed in from a scratch file: its access token runs out `inMs` from now (on our clock). */
  const scratch = (fetch, inMs) => {
    const f = join(dir, `probe-${++n}.json`);
    writeFileSync(f, JSON.stringify({ clientId: CLIENT, refreshToken: 'R-probe', accessToken: 'A-probe', expiresAt: clock + inMs }), { mode: 0o600 });
    return { link: make({ file: f, fetch }), file: f };
  };
  const tokens = (f) => JSON.parse(readFileSync(f, 'utf8'));

  // L2: Spotify's token endpoint is down (a 503). Nobody hammers it.
  {
    const down = fake(() => reply(503, { error: 'server_error', error_description: 'Service unavailable' }));
    const { link: near } = scratch(down, 30_000);
    const asks = [];
    for (let i = 0; i < 5; i++) asks.push(await call(near, 'token'));
    check('Spotify down, the token near its end: five asks make one call to Spotify, and get the token that still lasts', down.calls === 1 && asks.every((a) => a.status === 200 && a.body.accessToken === 'A-probe'), `${down.calls} call(s); ${asks.map((a) => a.status).join(' ')}`);
    const gone = fake(() => reply(503, { error: 'server_error' }));
    const { link: late } = scratch(gone, -1000);
    const fails = [];
    for (let i = 0; i < 5; i++) fails.push(await call(late, 'token'));
    const quiet = gone.calls;
    clock += 10_001;
    await call(late, 'token');
    check('Spotify down, the token run out: five asks make one call (each says why), and it asks again after 10 s', quiet === 1 && fails.every((a) => a.status >= 500 && /Spotify said/.test(a.body.error)) && gone.calls === 2, `${quiet} call(s), then ${gone.calls}; ${fails.map((a) => a.status).join(' ')}`);
    const slow = fake(() => reply(429, { error: 'too_many_requests' }, { 'Retry-After': '30' }));
    const { link: busy } = scratch(slow, -1000);
    await call(busy, 'token');
    clock += 20_000;
    await call(busy, 'token');
    const within = slow.calls;
    clock += 11_000;
    await call(busy, 'token');
    check('a 429 with Retry-After: 30 is heeded: no call for 30 s, then one', within === 1 && slow.calls === 2, `${within} call(s) in 20 s, ${slow.calls} after 31 s`);
    const back = fake((k) => (k === 1 ? reply(503, { error: 'server_error' }) : reply(200, { access_token: 'A-back', expires_in: 3600 })));
    const { link: mend } = scratch(back, -1000);
    await call(mend, 'token');
    clock += 10_001;
    const ok = await call(mend, 'token');
    const again = await call(mend, 'token');
    check('…and once Spotify answers again, the new token, and no more waiting', ok.status === 200 && ok.body.accessToken === 'A-back' && again.body.accessToken === 'A-back' && back.calls === 2, `${ok.status} ${ok.body.accessToken}, ${back.calls} calls`);
  }

  // L3: the sign-in settles on disk before the office stops; a cut-short save leaves nothing behind.
  {
    const { link: saving } = scratch(fake(() => reply(503, {})), 3600_000);
    saving.writing = sleep(300);
    let t0 = performance.now();
    await saving.flush(1000);
    const waited = performance.now() - t0;
    saving.writing = new Promise(() => {});
    t0 = performance.now();
    await saving.flush(150);
    const capped = performance.now() - t0;
    check('flush() waits for a save on its way (300 ms) and gives up at its cap (150 ms)', waited >= 280 && waited < 1500 && capped >= 140 && capped < 1000, `${Math.round(waited)} ms, ${Math.round(capped)} ms`);
    // A token asked for just as the office stops (its sign-in still being read): flush() waits for
    // the refresh it starts and the save that makes. Called at once, with no sleep in between.
    const rot = fake(() => reply(200, { access_token: 'A-rot', expires_in: 3600, refresh_token: 'R-rot' }));
    const { link: turning, file: turned } = scratch(rot, -1000);
    const asked = call(turning, 'token');
    await turning.flush();
    const onDisk = tokens(turned).refreshToken;
    const got = await asked;
    check('…a token asked for as the office stops: the refresh token Spotify just replaced is on disk once flush() returns', onDisk === 'R-rot' && got.body.accessToken === 'A-rot', `${onDisk}, ${got.body.accessToken}`);
    // A refresh still out at Spotify when the office stops: flush() waits for the answer, and its save.
    let answerLate;
    const late = fake(() => new Promise((r) => (answerLate = r)));
    const { link: pending, file: pendingFile } = scratch(late, -1000);
    const asked2 = call(pending, 'token');
    await waitFor(() => late.calls === 1);
    const flushed = pending.flush(1000);
    answerLate(reply(200, { access_token: 'A-late2', expires_in: 3600, refresh_token: 'R-late' }));
    await flushed;
    const onDisk2 = tokens(pendingFile).refreshToken;
    await asked2;
    check('…a refresh still waiting on Spotify when the office stops: flush() waits for its answer and its save', onDisk2 === 'R-late', onDisk2);
    // …and a Spotify that never answers never holds a shutdown past the cap.
    const never = fake(() => new Promise(() => {}));
    const { link: stuck } = scratch(never, -1000);
    void call(stuck, 'token');
    await waitFor(() => never.calls === 1);
    t0 = performance.now();
    await stuck.flush(150);
    const held = performance.now() - t0;
    check('…and a Spotify that never answers holds a shutdown no longer than the cap', held >= 140 && held < 1000, `${Math.round(held)} ms`);
    const left = join(dir, 'left');
    mkdirSync(left);
    const mine = join(left, 'spotify-4799.json');
    writeFileSync(mine, JSON.stringify({ clientId: CLIENT, refreshToken: 'R-mine' }), { mode: 0o600 });
    for (const f of ['spotify-4799.json.12345.tmp', 'spotify-4799.json.bak', 'spotify-4798.json.777.tmp', 'notes.tmp']) writeFileSync(join(left, f), '{"refreshToken":"R-old"}', { mode: 0o600 });
    await call(make({ file: mine }), 'status');
    const after = ['spotify-4799.json.12345.tmp', 'spotify-4799.json.bak', 'spotify-4798.json.777.tmp', 'notes.tmp'].map((f) => existsSync(join(left, f)));
    check('a save cut short (its .<pid>.tmp copy) is removed when the office starts; nothing else is', JSON.stringify(after) === '[false,true,true,true]', JSON.stringify(after));
  }

  // L4: signing out while a refresh is on its way.
  {
    let answer;
    const held = fake(() => new Promise((r) => (answer = r)));
    const { link: out1, file: f1 } = scratch(held, -1000);
    const asked = call(out1, 'token');
    // The refresh is out at Spotify.
    await waitFor(() => held.calls === 1);
    await call(out1, 'logout');
    answer(reply(200, { access_token: 'A-late', expires_in: 3600 }));
    const r1 = await asked;
    check('signing out while Spotify answers a refresh: no token, and "You signed out" (not Spotify)', r1.status === 401 && !r1.body.accessToken && /^You signed out/.test(r1.body.error) && !tokens(f1).accessToken, JSON.stringify({ status: r1.status, error: r1.body.error, file: tokens(f1) }));
    const quick = fake(() => reply(200, { access_token: 'A-saved', expires_in: 3600 }));
    const { link: out2, file: f2 } = scratch(quick, -1000);
    await call(out2, 'status');
    // The disk is slow right now: the refresh is still saving when you sign out.
    out2.writing = sleep(200);
    const asked2 = call(out2, 'token');
    // Spotify has answered and the refresh is saving (the sign-in in memory is the new one).
    await waitFor(() => out2.saved?.accessToken === 'A-saved');
    await call(out2, 'logout');
    const r2 = await asked2;
    check('signing out while the refresh is being saved: that token isn’t handed out, and the file ends signed out', r2.status === 401 && !r2.body.accessToken && /^You signed out/.test(r2.body.error) && !tokens(f2).accessToken && !tokens(f2).refreshToken, JSON.stringify({ status: r2.status, error: r2.body.error, file: tokens(f2) }));
  }

  // ---------------------------------------------------------------------------- one sign-in per office
  // Two offices on one machine (the same HOME, two ports): office A is signed in, office B isn't.
  // B sees no sign-in, and B signing out leaves A's file alone. Nothing here talks to Spotify:
  // A's access token is fresh, so asking for it never refreshes.
  const home = makeHome('office-spotify-two-');
  const offices = [];
  try {
    const [pa, pb] = [await freePort(), await freePort()];
    const signedIn = { clientId: CLIENT, refreshToken: 'R-office-a', accessToken: 'A-office-a', expiresAt: Date.now() + 3600_000 };
    const fileA = join(home.home, '.claude-office', `spotify-${pa}.json`);
    mkdirSync(join(home.home, '.claude-office'), { recursive: true, mode: 0o700 });
    writeFileSync(fileA, JSON.stringify(signedIn), { mode: 0o600 });
    offices.push(await startOffice({ home, port: pa }), await startOffice({ home, port: pb }));
    const post = (port, action) =>
      fetch(`http://127.0.0.1:${port}/api/spotify/${action}`, { method: 'POST', headers: { Origin: `http://127.0.0.1:${port}`, 'Content-Type': 'application/json' }, body: '{}' }).then(async (res) => ({ status: res.status, body: await res.json() }));
    const a = await post(pa, 'status');
    const b = await post(pb, 'status');
    check('two offices: the one signed in sees its sign-in; the other (another port) sees none', a.body.connected === true && a.body.clientId === CLIENT && b.body.connected === false && b.body.clientId === null, JSON.stringify({ a: a.body.connected, b: b.body.connected }));
    const out = await post(pb, 'logout');
    const kept = JSON.parse(readFileSync(fileA, 'utf8'));
    const still = await post(pa, 'token');
    check(
      "the other office signing out leaves the first one's sign-in alone: its file, its 0600, its token",
      out.status === 200 && kept.refreshToken === 'R-office-a' && (statSync(fileA).mode & 0o777) === 0o600 && still.status === 200 && still.body.accessToken === 'A-office-a',
      JSON.stringify({ logout: out.status, kept: kept.refreshToken, token: still.status }),
    );
    check('no office keeps a sign-in in a file without its port', !existsSync(join(home.home, '.claude-office', 'spotify.json')));
  } finally {
    // With nothing being saved, an office still stops promptly.
    const t0 = Date.now();
    for (const o of offices) await o.stop();
    if (offices.length === 2) check('two offices stop promptly (nothing being saved)', Date.now() - t0 < 4000, `${Date.now() - t0} ms`);
    home.cleanup();
  }
} catch (err) {
  check('spotify auth checks ran to the end', false, String(err?.stack ?? err).split('\n').slice(0, 3).join(' / '));
} finally {
  server.close();
  rmSync(dir, { recursive: true, force: true });
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll good.');
process.exit(failed ? 1 : 0);
