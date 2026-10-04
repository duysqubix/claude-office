// Spotify on the manager's laptop (#28), run by scripts/ui-check.mjs in the demo office (?demo=1:
// a pretend Spotify, nothing leaves the page):
// - your desk says "Use your laptop"; E walks you behind your chair and the laptop springs out;
// - your playlists and Liked Songs, their songs; a song plays: now playing (cover, title, artist),
//   the café band hands over the speakers (Help: "Playing from Spotify"), the E prompt and the
//   laptop's own screen in the room say what's on; next, previous, Space to pause (the band comes
//   back), seek, and the volume is the office's music volume;
// - someone else's playlist plays without a song list; Esc and Ctrl+] stand you up, the music
//   plays on; Sign out;
// - first time: the setup steps (the redirect URI with this office's port), a bad Client ID, then
//   signed in; no Premium, and an app Spotify refuses: a kind message, and the band plays on;
// - names from Spotify are text, never markup; the demo never talks to Spotify;
// - Space plays and pauses wherever the keyboard is (a song you clicked, a playlist); Help's Music
//   off is the band's switch (Spotify plays, Music stays off); a song that won't start leaves the
//   one playing alone, with the speakers; a player that drops out and stays gone stops the song
//   here; another office tab used later takes the music; an older connect's late answer is ignored;
// - an office that doesn't answer: the laptop asks again by itself, a little later each time, and
//   stops once closed; an older ask's late answer never overrules a newer one (Try again, closing
//   the laptop, opening it twice); an office whose server is older than the page (404) says to
//   restart it, and is checked only once more;
// - the real office page: nothing of Spotify's on a normal load; turned on, Spotify's SDK runs in
//   the player frame (its own loopback origin), never in the office page, and asks the office for
//   its token over postMessage (needs the network for Spotify's SDK; skipped without).
//   GAME_BASE=http://127.0.0.1:4778 node scripts/ui-check/spotify.mjs
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const mod = await import(require.resolve('puppeteer-core'));
const puppeteer = mod.default ?? mod;
const BASE = (await import('./base.mjs')).officeBase('GAME_BASE', 'UI_KIT_BASE');
const executablePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find((p) => existsSync(p));

const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const check = (name, ok, detail = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** Requests the demo made to Spotify (there must be none). */
const outside = [];

/** A demo office page that never reports presence, hot-reloads or POSTs, and records page errors. */
async function open(query = '') {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.evaluateOnNewDocument(() => {
    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (d) {
      if (typeof d === 'string' && d.includes('"presence"')) return;
      return send.call(this, d);
    };
    window.WebSocket = new Proxy(WebSocket, {
      construct(target, args) {
        const p = args[1];
        if (p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr'))) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 };
        return Reflect.construct(target, args);
      },
    });
  });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    if (/spotify\.com|scdn\.co|spotifycdn\.com/.test(u)) {
      outside.push(u);
      return void req.abort();
    }
    if (req.method() !== 'GET' && req.method() !== 'HEAD' && u.includes('/api/')) return void req.abort();
    void req.continue();
  });
  // Daytime (the evening band is quieter, not different, but keep runs alike).
  await page.goto(`${BASE}/?demo=1&quiet=1&debug=1&seed=11&regulars=off&tips=0&hour=12${query}`, { waitUntil: 'networkidle2', timeout: 30_000 });
  await page.waitForFunction(() => window.office && window.officeAudio && document.getElementById('splash')?.classList.contains('gone'), { timeout: 20_000 });
  await wait(1200);
  return { page, logs };
}

const errors = (logs) => logs.filter((l) => l.startsWith('[pageerror]'));

async function until(page, fn, arg, ms = 8000) {
  let v;
  for (let t = 0; t < ms; t += 200) {
    v = await page.evaluate(fn, arg);
    if (v?.done) return v;
    await wait(200);
  }
  return v;
}

const pressE = (page) =>
  page.evaluate(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', key: 'e' }));
    await new Promise((r) => setTimeout(r, 50));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE', key: 'e' }));
  });

async function ctrl(page, code) {
  await page.keyboard.down('Control');
  await page.keyboard.press(code);
  await page.keyboard.up('Control');
}

/** Stand in front of the boss desk (the visitors' side), facing the laptop. */
const AT_DESK = () => {
  const o = window.office;
  const it = o.world.interactables.find((i) => i.kind === 'laptop');
  const p = it.position.clone().setY(0);
  p.z += 1.15;
  o.manager.teleport(p, Math.PI);
  o.manager.face(Math.PI);
  o.camera.yaw = 0;
};

const prompt = (page) => page.evaluate(() => (document.querySelector('.co-hud__prompt:not([hidden]) .co-prompt')?.textContent ?? '').replace(/^E/, '').trim());

/** The laptop app and the speakers, as the manager sees and hears them. */
const look = (page) =>
  page.evaluate(() => {
    const o = window.office;
    const m = document.querySelector('.sp-modal');
    const s = o.laptop.store.state;
    const a = window.officeAudio;
    const text = (sel) => (m?.querySelector(sel)?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const lap = o.world.laptop;
    return {
      open: !!m && !m.classList.contains('out'),
      phase: m?.querySelector('.sp-screen')?.dataset.phase ?? null,
      seated: document.body.classList.contains('seated'),
      lists: [...(m?.querySelectorAll('.sp-list .sp-list__name') ?? [])].map((n) => n.textContent),
      current: m?.querySelector('.sp-list[aria-current="true"] .sp-list__name')?.textContent ?? null,
      rows: m?.querySelectorAll('.sp-row').length ?? 0,
      nowRow: m?.querySelector('.sp-row.is-now .sp-row__name')?.textContent ?? null,
      nowName: text('.sp-now__name'),
      nowArtist: text('.sp-now__artist'),
      nowCover: !!m?.querySelector('.sp-now__art img'),
      toggle: m?.querySelector('.sp-round--play')?.getAttribute('aria-label') ?? null,
      times: [...(m?.querySelectorAll('.sp-time') ?? [])].map((t) => t.textContent),
      notice: m?.querySelector('.sp-notice:not([hidden])') ? text('.sp-notice') : '',
      note: m?.querySelector('.sp-note:not([hidden])') ? text('.sp-note') : '',
      store: { paused: s.now?.paused ?? null, track: s.now?.track?.name ?? null, positionMs: s.now?.positionMs ?? 0, device: s.device },
      speakers: { by: a.nowPlaying.by, label: a.nowPlaying.label, band: a.state().playing, volume: a.prefs.musicVolume, ducked: a.state().ducked },
      label: o.world.interactables.find((i) => i.kind === 'laptop')?.label,
      stand: lap ? +Math.hypot(o.manager.position.x - lap.stand.x, o.manager.position.z - lap.stand.z).toFixed(2) : null,
    };
  });

const click = (page, sel, i = 0) => page.evaluate((sel, i) => document.querySelectorAll(sel)[i]?.click(), sel, i);

/**
 * The real office page (no demo): it never reports presence or hot-reloads, and its only write
 * is asking the office where the player frame is. Requests to Spotify go through, recorded with
 * the frame that made them.
 */
async function openLive({ failFirstSdk = false, older = null } = {}) {
  let failed = false;
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const logs = [];
  const spotify = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.evaluateOnNewDocument(() => {
    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (d) {
      if (typeof d === 'string' && d.includes('"presence"')) return;
      return send.call(this, d);
    };
    window.WebSocket = new Proxy(WebSocket, {
      construct(target, args) {
        const p = args[1];
        if (p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr'))) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 };
        return Reflect.construct(target, args);
      },
    });
  });
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    // A frame's own page loads into it: who asked is the frame around it.
    const from = req.isNavigationRequest() ? req.frame()?.parentFrame()?.url() : req.frame()?.url();
    if (/spotify\.com|scdn\.co|spotifycdn\.com/.test(u)) spotify.push({ url: u, from: from ?? '' });
    // The first load of Spotify's SDK script fails, as on a flaky connection.
    if (failFirstSdk && !failed && u.startsWith('https://sdk.scdn.co/spotify-player.js')) {
      failed = true;
      return void req.abort();
    }
    const write = req.method() !== 'GET' && req.method() !== 'HEAD' && u.includes('/api/');
    // An office older than this page: no such call (404), as its server answered before the update.
    if (older && req.method() === 'POST' && new URL(u).pathname === '/api/spotify/status') {
      older.calls++;
      if (older.on) return void req.respond({ status: 404, contentType: 'application/json; charset=utf-8', body: JSON.stringify({ ok: false, error: 'Not found' }) });
    }
    if (write && new URL(u).pathname !== '/api/spotify/status') return void req.abort();
    void req.continue();
  });
  await page.goto(`${BASE}/?seed=11&regulars=off&tips=0&hour=12&debug=1`, { waitUntil: 'networkidle2', timeout: 30_000 });
  await page.waitForFunction(() => document.getElementById('splash')?.classList.contains('gone'), { timeout: 30_000 });
  await wait(2500);
  return { page, logs, spotify };
}

try {
  // ------------------------------------------------------------------ signed in: walk over, play, pause, stand up
  {
    const { page, logs } = await open();
    // Record what the laptop's screen in the room is asked to draw.
    await page.evaluate(() => {
      const lap = window.office.world.laptop;
      const paint = lap.paint;
      window.__painted = [];
      lap.paint = (draw) => {
        window.__painted.push(draw ? 'spotify' : 'dashboard');
        window.__draw = draw;
        paint(draw);
      };
    });
    await page.evaluate(AT_DESK);
    await wait(500);
    const said = await prompt(page);
    check('your desk says "Use your laptop"', said === 'Use your laptop', said);
    // The first gesture: the café band starts.
    await page.evaluate(() => document.getElementById('scene').focus());
    await page.keyboard.press('KeyX');
    await wait(1500);
    const before = await look(page);
    check('setup: the café band is playing before the laptop opens', before.speakers.band && before.speakers.by === 'band', JSON.stringify(before.speakers));
    await pressE(page);
    await until(page, () => ({ done: !!document.querySelector('.sp-modal .sp-list') }), null, 15_000);
    await wait(700);
    let m = await look(page);
    check('E: you walk behind your chair and the laptop springs out, seated', m.open && m.seated && m.stand < 0.4, JSON.stringify({ open: m.open, seated: m.seated, stand: m.stand }));
    check('your playlists, Liked Songs first and on screen', m.lists[0] === 'Liked Songs' && m.lists.length === 6 && m.current === 'Liked Songs' && m.rows === 24, JSON.stringify({ lists: m.lists, current: m.current, rows: m.rows }));
    check('nothing plays yet: "Pick a song", and the band keeps the speakers', m.nowName === 'Pick a song' && m.speakers.by === 'band', JSON.stringify({ now: m.nowName, speakers: m.speakers }));
    check('focus inside the laptop never ducks the music', !m.speakers.ducked, JSON.stringify(m.speakers));

    const song = await page.evaluate(() => document.querySelectorAll('.sp-row .sp-row__name')[2]?.textContent);
    // A real click: the song's row keeps the keyboard, as it does for you.
    await (await page.$$('.sp-row'))[2].click();
    m = await until(page, () => ({ done: window.office.laptop.store.state.now?.paused === false }), null, 6000).then(() => look(page));
    check('a song plays: now playing shows its title, artist and cover; its row is marked', m.nowName === song && m.nowArtist.length > 0 && m.nowCover && m.nowRow === song && m.toggle === 'Pause', JSON.stringify({ song, now: m.nowName, artist: m.nowArtist, row: m.nowRow, toggle: m.toggle }));
    await wait(2500);
    m = await look(page);
    check('Spotify has the speakers: the café band stopped', m.speakers.by === 'external' && m.speakers.label === 'Spotify' && !m.speakers.band, JSON.stringify(m.speakers));
    check('the E prompt at your desk says what’s playing', m.label === `Spotify: ${song}`, m.label);
    check('the song’s clock runs', m.times[0] !== '0:00' && m.times[1] !== '0:00', JSON.stringify(m.times));
    const painted = await page.evaluate(() => {
      const draw = window.__draw;
      if (!draw) return null;
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 160;
      const ctx = c.getContext('2d');
      draw(ctx, 256, 160);
      const [r, g, b] = ctx.getImageData(4, 4, 1, 1).data;
      return { calls: window.__painted.slice(-3), green: g > 150 && r < 80 && b < 120 };
    });
    check('the laptop’s screen in the room shows now playing (the green band)', !!painted && painted.calls.includes('spotify') && painted.green, JSON.stringify(painted));

    await click(page, '.sp-round[aria-label="Next"]');
    await wait(700);
    const afterNext = await look(page);
    await click(page, '.sp-round[aria-label="Previous"]');
    await wait(700);
    const afterPrev = await look(page);
    check('next and previous', afterNext.nowName !== song && afterNext.nowName.length > 0 && afterPrev.nowName === song, `${song} → ${afterNext.nowName} → ${afterPrev.nowName}`);

    // Space with the keyboard still on the song you clicked: pause (never that song again from the
    // top); the band comes back. Space again: Spotify again.
    const onRow = await page.evaluate(() => {
      const s = window.office.laptop.store.state.now;
      return { row: document.activeElement?.classList.contains('sp-row') ?? false, at: s.positionMs + (s.paused ? 0 : performance.now() - s.at) };
    });
    await page.keyboard.press('Space');
    await wait(1500);
    m = await look(page);
    const kept = await page.evaluate(() => window.office.laptop.store.state.now?.positionMs ?? 0);
    check('Space on the song you just clicked pauses it (it doesn’t start again)', onRow.row && m.store.paused === true && m.store.track === song && kept >= onRow.at - 500, JSON.stringify({ focusOnRow: onRow.row, before: Math.round(onRow.at), after: Math.round(kept), paused: m.store.paused, track: m.store.track }));
    check('Space pauses: "Play" again, the row stops jiggling, the band gets the speakers back', m.store.paused === true && m.toggle === 'Play' && m.speakers.by === 'band' && m.speakers.band, JSON.stringify({ paused: m.store.paused, toggle: m.toggle, speakers: m.speakers }));
    check('…and the E prompt goes back to "Use your laptop"', m.label === 'Use your laptop', m.label);
    await page.keyboard.press('Space');
    await wait(1200);
    m = await look(page);
    check('Space again: playing, and Spotify has the speakers again', m.store.paused === false && m.speakers.by === 'external' && !m.speakers.band, JSON.stringify({ paused: m.store.paused, speakers: m.speakers }));
    // Enter still presses the button it's on: a song row plays that song.
    const fifth = await page.evaluate(() => {
      const b = document.querySelectorAll('.sp-row')[4];
      b.focus();
      return b.querySelector('.sp-row__name').textContent;
    });
    await page.keyboard.press('Enter');
    await until(page, (name) => ({ done: window.office.laptop.store.state.now?.track?.name === name && !window.office.laptop.store.state.now.paused }), fifth, 5000);
    m = await look(page);
    check('Enter on a song still plays that song', m.store.track === fifth && m.store.paused === false, JSON.stringify({ want: fifth, track: m.store.track }));

    // Help says so.
    const help = await page.evaluate(async () => {
      window.office.panels.open('help');
      await new Promise((r) => setTimeout(r, 500));
      const t = document.querySelector('.co-panel--help .co-sound__note')?.textContent ?? '';
      window.office.panels.close();
      return t;
    });
    check('Help says "Playing from Spotify"', /Playing from Spotify/.test(help), help);

    // Seek to the middle; the volume is the office's music volume.
    const seek = await page.evaluate(async () => {
      const bar = document.querySelector('.sp-seek');
      const r = bar.getBoundingClientRect();
      bar.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
      await new Promise((res) => setTimeout(res, 300));
      const s = window.office.laptop.store.state.now;
      return s ? s.positionMs / s.durationMs : null;
    });
    check('a click on the seek bar jumps there', seek !== null && Math.abs(seek - 0.5) < 0.05, String(seek));
    await page.evaluate(() => {
      const v = document.querySelector('.sp-volume');
      v.value = '30';
      v.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await wait(300);
    m = await look(page);
    check('the volume slider is the office’s music volume', Math.abs(m.speakers.volume - 0.3) < 0.001, String(m.speakers.volume));

    // Someone else's playlist: no song list, but it plays.
    const jazz = m.lists.indexOf('Coffee Shop Jazz');
    await click(page, '.sp-list', jazz);
    await wait(700);
    m = await look(page);
    check('someone else’s playlist: no songs listed, a note says it plays all the same', m.current === 'Coffee Shop Jazz' && m.rows === 0 && /plays all the same/.test(m.note), JSON.stringify({ current: m.current, rows: m.rows, note: m.note }));
    await click(page, '.sp-playlist');
    await wait(900);
    m = await look(page);
    check('…and Play plays it', m.store.paused === false && m.store.track && m.speakers.by === 'external', JSON.stringify(m.store));

    // Stand up: Esc. The music plays on.
    await page.keyboard.press('Escape');
    await wait(900);
    m = await look(page);
    check('Esc stands you up; the music plays on', !m.open && !m.seated && m.store.paused === false && m.speakers.by === 'external', JSON.stringify({ open: m.open, seated: m.seated, paused: m.store.paused, by: m.speakers.by }));
    const moved = await page.evaluate(async () => {
      const o = window.office;
      const p0 = o.manager.position.clone();
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w' }));
      await new Promise((r) => setTimeout(r, 400));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w' }));
      return +Math.hypot(o.manager.position.x - p0.x, o.manager.position.z - p0.z).toFixed(2);
    });
    check('…and you can walk again', moved > 0.2, `${moved} m`);

    // Sit again, Ctrl+] stands you up too.
    await page.evaluate(AT_DESK);
    await wait(400);
    await pressE(page);
    await until(page, () => ({ done: !!document.querySelector('.sp-modal .sp-list') }), null, 15_000);
    await wait(500);
    m = await look(page);
    check('sitting down again: still signed in, still playing', m.open && m.lists.length === 6 && m.store.paused === false, JSON.stringify({ open: m.open, lists: m.lists.length, paused: m.store.paused }));
    const onList = await page.evaluate(() => document.activeElement?.classList.contains('sp-list') ?? false);
    await page.keyboard.press('Space');
    await wait(900);
    const sat = await look(page);
    await page.keyboard.press('Space');
    await wait(900);
    m = await look(page);
    check('sat down again (the keyboard on a playlist): Space pauses, and plays again', onList && sat.store.paused === true && sat.current === m.current && m.store.paused === false, JSON.stringify({ onList, paused: sat.store.paused, then: m.store.paused, playlist: [sat.current, m.current] }));
    await ctrl(page, 'BracketRight');
    await wait(900);
    m = await look(page);
    check('Ctrl+] stands you up', !m.open && !m.seated, JSON.stringify({ open: m.open, seated: m.seated }));

    // Sign out: setup steps, and the band gets the speakers back.
    await page.evaluate(AT_DESK);
    await wait(400);
    await pressE(page);
    await until(page, () => ({ done: !!document.querySelector('.sp-modal .sp-list') }), null, 15_000);
    await page.evaluate(() => [...document.querySelectorAll('.sp-top button')].find((b) => b.textContent.trim() === 'Sign out')?.click());
    await until(page, () => ({ done: document.querySelector('.sp-screen')?.dataset.phase === 'setup' }), null, 5000);
    await wait(1500);
    m = await look(page);
    check('Sign out: the setup steps, and the band gets the speakers back', m.phase === 'setup' && m.speakers.by === 'band' && m.speakers.band, JSON.stringify({ phase: m.phase, speakers: m.speakers }));
    check('no page errors (signed in)', !errors(logs).length, errors(logs).join(' | '));
    await page.close();
  }

  // ------------------------------------------------------------------ first time: the setup steps
  {
    const { page, logs } = await open('&spotify=new&laptop=1');
    await until(page, () => ({ done: document.querySelector('.sp-screen')?.dataset.phase === 'setup' }), null, 8000);
    const setup = await page.evaluate(() => {
      const m = document.querySelector('.sp-modal');
      const link = m.querySelector('a[href^="https://developer.spotify.com"]');
      return {
        steps: [...m.querySelectorAll('.sp-step b')].map((b) => b.textContent),
        uri: m.querySelector('.sp-uri')?.textContent,
        link: link ? { target: link.getAttribute('target'), rel: link.getAttribute('rel') } : null,
        focus: document.activeElement?.classList.contains('sp-client') ?? false,
      };
    });
    const port = new URL(BASE).port || '80';
    check('first time: five steps, the redirect URI on 127.0.0.1 with this office’s port', setup.steps.length === 5 && setup.uri === `http://127.0.0.1:${port}/callback`, JSON.stringify(setup));
    check('the dashboard link opens a new tab without a handle on the office', setup.link?.target === '_blank' && /noopener/.test(setup.link?.rel ?? ''), JSON.stringify(setup.link));
    check('the Client ID field has the keyboard', setup.focus);
    await page.keyboard.type('not-a-client-id');
    await page.keyboard.press('Enter');
    await wait(400);
    const bad = await page.evaluate(() => ({ error: document.querySelector('.sp-error')?.textContent ?? '', phase: document.querySelector('.sp-screen')?.dataset.phase }));
    check('a bad Client ID: a clear message, still on the steps', bad.phase === 'setup' && /32 letters and numbers/.test(bad.error), JSON.stringify(bad));
    await page.evaluate(() => {
      const f = document.querySelector('.sp-client');
      f.value = '';
    });
    await page.focus('.sp-client');
    await page.keyboard.type('0123456789abcdef0123456789ABCDEF');
    await page.evaluate(() => document.querySelector('.sp-signin').click());
    const waiting = await until(page, () => ({ done: document.querySelector('.sp-screen')?.dataset.phase === 'waiting' }), null, 3000);
    check('Sign in: waiting for you at Spotify', !!waiting?.done);
    const ready = await until(page, () => ({ done: document.querySelectorAll('.sp-modal .sp-list').length === 6 }), null, 8000);
    check('…then signed in: your playlists', !!ready?.done);
    check('no page errors (first time)', !errors(logs).length, errors(logs).join(' | '));
    await page.close();
  }

  // ------------------------------------------------------------------ no Premium; an app Spotify refuses
  {
    const { page, logs } = await open('&spotify=free&laptop=1');
    await page.evaluate(() => document.getElementById('scene').focus());
    await page.keyboard.press('KeyX');
    await until(page, () => ({ done: !!document.querySelector('.sp-notice:not([hidden])') }), null, 8000);
    // The band's whole fade-in (its gain reads 1 for a moment before the ramp starts).
    await wait(6000);
    // Click two songs, and listen: the café band never stops, never fades, never changes tune.
    const band = await page.evaluate(async () => {
      const a = window.officeAudio;
      const tune = () => a.state().tune;
      const before = tune();
      const seen = [];
      const t0 = performance.now();
      for (const [at, click] of [[0, 0], [50, -1], [600, 3], [700, -1], [1500, -1], [3000, -1]]) {
        await new Promise((r) => setTimeout(r, Math.max(0, at - (performance.now() - t0))));
        if (click >= 0) document.querySelectorAll('.sp-row')[click].click();
        else seen.push({ band: a.state().playing, fade: Math.round((a.state().fade ?? 0) * 100) / 100, by: a.nowPlaying.by, same: tune() === before });
      }
      return seen;
    });
    const m = await look(page);
    check('no Premium: a kind message about Premium; playlists still show', /Premium/.test(m.notice) && m.rows > 0, m.notice);
    check('…nothing plays and the café band keeps the speakers', m.store.track === null && m.speakers.by === 'band', JSON.stringify({ track: m.store.track, speakers: m.speakers }));
    check('…clicking songs never interrupts the band (no fade, no new tune)', band.every((b) => b.band && b.by === 'band' && b.same && b.fade > 0.9), JSON.stringify(band));
    check('no page errors (no Premium)', !errors(logs).length, errors(logs).join(' | '));
    await page.close();
  }
  {
    const { page, logs } = await open('&spotify=refused&laptop=1');
    await until(page, () => ({ done: !!document.querySelector('.sp-notice:not([hidden])') }), null, 8000);
    const m = await look(page);
    check('an app Spotify refuses: a kind message pointing at User Management', /User Management/.test(m.notice), m.notice);
    check('no page errors (refused)', !errors(logs).length, errors(logs).join(' | '));
    await page.close();
  }

  // ------------------------------------------------------------------ names from Spotify are text
  {
    const { page, logs } = await open();
    const evil = '<img src=x onerror="window.__pwned=1"><b>Bold</b>';
    await page.evaluate((evil) => {
      const svc = window.office.laptop.store.service;
      const playlists = svc.playlists.bind(svc);
      const tracks = svc.tracks.bind(svc);
      svc.me = async () => ({ id: 'you', name: evil });
      svc.playlists = async (me) => (await playlists(me)).map((p, i) => (i === 1 ? { ...p, name: evil, owner: evil } : p));
      svc.tracks = async (list) => {
        const page = await tracks(list);
        return { ...page, tracks: page.tracks.map((t, i) => (i === 0 ? { ...t, name: evil, artists: evil } : t)) };
      };
      // What the player says is playing, too.
      const store = window.office.laptop.store;
      const onState = store.onState.bind(store);
      store.onState = (st) => onState(st?.track ? { ...st, track: { ...st.track, name: evil, artists: evil } } : st);
    }, evil);
    await page.evaluate(AT_DESK);
    await wait(400);
    await pressE(page);
    await until(page, () => ({ done: document.querySelectorAll('.sp-modal .sp-row').length > 0 }), null, 15_000);
    await click(page, '.sp-row', 0);
    await wait(1200);
    const r = await page.evaluate((evil) => {
      const m = document.querySelector('.sp-modal');
      return {
        list: m.querySelectorAll('.sp-list .sp-list__name')[1]?.textContent === evil,
        row: m.querySelector('.sp-row .sp-row__name')?.textContent === evil,
        now: m.querySelector('.sp-now__name')?.textContent === evil,
        who: m.querySelector('.sp-top__who')?.textContent === `Hi, ${evil}`,
        markup: m.querySelectorAll('img[src="x"]').length + [...m.querySelectorAll('b')].filter((b) => b.textContent === 'Bold').length,
        pwned: window.__pwned === 1,
        label: window.office.world.interactables.find((i) => i.kind === 'laptop')?.label,
      };
    }, evil);
    check('names from Spotify show as text everywhere (lists, songs, now playing, greeting), never as markup', r.list && r.row && r.now && r.who && r.markup === 0 && !r.pwned, JSON.stringify(r));
    await page.keyboard.press('Escape');
    await wait(500);
    const said = await prompt(page);
    const hud = await page.evaluate(() => document.querySelectorAll('.co-hud__prompt img, .co-hud__prompt b').length);
    check('…the E prompt too', said.startsWith('Spotify: <img') && hud === 0 && !(await page.evaluate(() => window.__pwned === 1)), said);
    check('no page errors (names)', !errors(logs).length, errors(logs).join(' | '));
    await page.close();
  }

  // ------------------------------------------------------------------ Help's Music off is the band's switch
  {
    const { page, logs } = await open();
    await page.evaluate(() => document.getElementById('scene').focus());
    await page.keyboard.press('KeyX');
    await wait(800);
    await page.evaluate(() => window.officeAudio.setPref('music', false));
    await wait(2000);
    await page.evaluate(() => {
      const p = window.office.laptop.store.service.player;
      const set = p.setVolume.bind(p);
      window.__levels = [];
      p.setVolume = (v) => {
        window.__levels.push(v);
        set(v);
      };
    });
    await page.evaluate(AT_DESK);
    await wait(400);
    await pressE(page);
    await until(page, () => ({ done: document.querySelectorAll('.sp-modal .sp-row').length > 0 }), null, 15_000);
    await click(page, '.sp-row', 1);
    await until(page, () => ({ done: window.office.laptop.store.state.now?.paused === false }), null, 6000);
    await wait(800);
    const on = await page.evaluate(() => ({ by: window.officeAudio.nowPlaying.by, level: window.__levels.at(-1), music: window.officeAudio.prefs.music, saved: localStorage.getItem('claude-office:music') }));
    check('Music off in Help: a song still plays (Spotify has the speakers, at the music volume), and Music stays off', on.by === 'external' && on.level > 0 && on.music === false && on.saved === '0', JSON.stringify(on));
    await click(page, '.sp-round--play');
    await wait(3000);
    const off = await page.evaluate(() => ({ paused: window.office.laptop.store.state.now?.paused, by: window.officeAudio.nowPlaying.by, band: window.officeAudio.state().playing, music: window.officeAudio.prefs.music, saved: localStorage.getItem('claude-office:music') }));
    check('…pause it: the band stays off, and so does Music (saved off)', off.paused === true && off.by === 'none' && !off.band && off.music === false && off.saved === '0', JSON.stringify(off));
    // Music on, play, then switch Music off in Help: Spotify stops too.
    await page.evaluate(() => window.officeAudio.setPref('music', true));
    await click(page, '.sp-round--play');
    await until(page, () => ({ done: window.office.laptop.store.state.now?.paused === false && window.officeAudio.nowPlaying.by === 'external' }), null, 6000);
    await page.evaluate(() => window.officeAudio.setPref('music', false));
    await wait(1200);
    const stopped = await page.evaluate(() => ({ paused: window.office.laptop.store.state.now?.paused, by: window.officeAudio.nowPlaying.by }));
    check('…and switching Music off while Spotify plays pauses it', stopped.paused === true && stopped.by === 'none', JSON.stringify(stopped));
    await page.evaluate(() => localStorage.removeItem('claude-office:music'));
    check('no page errors (Music off)', !errors(logs).length, errors(logs).join(' | '));
    await page.close();
  }

  // ------------------------------------------------------------------ a play that fails; the player dropping out
  {
    const { page, logs } = await open('&laptop=1');
    await page.evaluate(() => document.getElementById('scene').focus());
    await page.keyboard.press('KeyX');
    await until(page, () => ({ done: document.querySelectorAll('.sp-modal .sp-row').length > 0 }), null, 15_000);
    await click(page, '.sp-row', 2);
    await until(page, () => ({ done: window.office.laptop.store.state.now?.paused === false && window.officeAudio.nowPlaying.by === 'external' }), null, 6000);
    const playing = await page.evaluate(() => window.office.laptop.store.state.now.track.name);
    // Spotify refuses the next song (a 502, say): the one playing plays on, with the speakers.
    await page.evaluate(() => {
      const p = window.office.laptop.store.service.player;
      const real = p.play.bind(p);
      let once = true;
      p.play = (what) => {
        if (!once) return real(what);
        once = false;
        return Promise.reject(new Error('Spotify said 502'));
      };
    });
    await click(page, '.sp-row', 5);
    await wait(1500);
    let m = await look(page);
    await wait(5500);
    const later = await look(page);
    check(
      'a song that won’t start: the one playing plays on and keeps the speakers, and the laptop says why',
      m.store.track === playing && m.store.paused === false && m.speakers.by === 'external' && /502/.test(m.notice) && later.store.paused === false && later.speakers.by === 'external' && !later.speakers.band,
      JSON.stringify({ track: m.store.track, paused: m.store.paused, by: m.speakers.by, notice: m.notice, later: { paused: later.store.paused, by: later.speakers.by } }),
    );
    // The player drops out (Spotify's not_ready) and comes back soon: the song plays on.
    await page.evaluate(() => window.office.laptop.store.service.player.events.gone());
    await wait(1000);
    await page.evaluate(() => window.office.laptop.store.service.player.events.ready());
    await wait(4500);
    m = await look(page);
    check('the player drops out and is back within a moment: the song plays on', m.store.paused === false && m.speakers.by === 'external' && m.store.device === 'ready', JSON.stringify({ paused: m.store.paused, by: m.speakers.by, device: m.store.device }));
    // …and when it stays gone: the song has stopped here, and the band gets the speakers back.
    await page.evaluate(() => window.office.laptop.store.service.player.events.gone());
    await wait(4800);
    m = await look(page);
    check('…and when it stays gone: paused on the laptop, the band back, the prompt back to "Use your laptop"', m.store.paused === true && m.toggle === 'Play' && m.speakers.by === 'band' && m.label === 'Use your laptop', JSON.stringify({ paused: m.store.paused, toggle: m.toggle, by: m.speakers.by, label: m.label }));
    check('no page errors (failures)', !errors(logs).length, errors(logs).join(' | '));
    await page.close();
  }

  // ------------------------------------------------------------------ two office tabs: one plays
  {
    const A = await open('&laptop=1');
    await A.page.evaluate(() => document.getElementById('scene').focus());
    await A.page.keyboard.press('KeyX');
    await until(A.page, () => ({ done: document.querySelectorAll('.sp-modal .sp-row').length > 0 }), null, 15_000);
    await click(A.page, '.sp-row', 2);
    await until(A.page, () => ({ done: window.officeAudio.nowPlaying.by === 'external' }), null, 6000);
    const B = await open();
    await B.page.bringToFront();
    await B.page.evaluate(() => document.getElementById('scene').focus());
    await B.page.keyboard.press('KeyX');
    await wait(3000);
    const a = await look(A.page);
    const b = await B.page.evaluate(() => ({ band: window.officeAudio.state().playing, by: window.officeAudio.nowPlaying.by }));
    check('two office tabs: using the other one pauses Spotify here, and the other tab’s band plays', a.store.paused === true && a.speakers.by !== 'external' && b.band && b.by === 'band', JSON.stringify({ A: { paused: a.store.paused, by: a.speakers.by }, B: b }));
    check('no page errors (two tabs)', !errors(A.logs).length && !errors(B.logs).length, [...errors(A.logs), ...errors(B.logs)].join(' | '));
    await A.page.close();
    await B.page.close();
  }

  // ------------------------------------------------------------------ an old connect's late answer
  {
    const { page, logs } = await open();
    // Two connects in a row (Spotify refused the first one's token, so it connects again): the
    // first one's late "no" and its late events must not undo the second one.
    const r = await page.evaluate(async () => {
      const store = window.office.laptop.store;
      const p = store.service.player;
      const calls = [];
      p.connect = (events) => new Promise((resolve) => calls.push({ resolve, events }));
      store.connect();
      store.onProblem('auth', 'refused');
      calls[1].events.ready();
      calls[1].resolve(true);
      await new Promise((res) => setTimeout(res, 20));
      calls[0].resolve(false);
      calls[0].events.problem('premium', 'late');
      calls[0].events.gone();
      await new Promise((res) => setTimeout(res, 50));
      return { connects: calls.length, device: store.state.device, notice: store.state.notice, broken: store.broken };
    });
    check('a second connect wins: the first one’s late answer and events change nothing', r.connects === 2 && r.device === 'ready' && r.notice === null && r.broken === null, JSON.stringify(r));
    check('no page errors (connects)', !errors(logs).length, errors(logs).join(' | '));
    await page.close();
  }

  // ------------------------------------------------------------------ #104: a sign-out while songs load
  {
    const { page, logs } = await open('&laptop=1');
    await until(page, () => ({ done: document.querySelectorAll('.sp-modal .sp-list').length === 6 && document.querySelectorAll('.sp-modal .sp-row').length > 0 }), null, 15_000);
    const r = await page.evaluate(async () => {
      const store = window.office.laptop.store;
      const svc = store.service;
      const real = svc.tracks.bind(svc);
      let calls = 0;
      let release = null;
      // The next song list is held until we say so (it answers after you've signed out).
      svc.tracks = (list) => {
        calls++;
        if (release) return real(list);
        return new Promise((res) => (release = () => res(real(list))));
      };
      const focus = store.state.playlists.find((p) => p.name === 'Deep Focus Desk');
      const loading = store.select(focus.id);
      await store.signOut();
      release();
      await loading;
      await new Promise((res) => setTimeout(res, 100));
      const out = { cached: store.cache.size, tracks: store.state.tracks?.tracks.length ?? null, phase: store.state.phase };
      // Signed in again (another account, say): that playlist's songs come fresh, not the old account's.
      await store.signIn('0123456789abcdef0123456789abcdef', null);
      for (const t0 = performance.now(); !(store.state.phase === 'ready' && store.state.playlists) && performance.now() - t0 < 10_000; ) await new Promise((res) => setTimeout(res, 100));
      const before = calls;
      await store.select(focus.id);
      return { ...out, refetched: calls > before, again: store.state.phase };
    });
    check('#104: songs that answer after you sign out are dropped; signed in again, they come fresh (not the old account’s)', r.cached === 0 && r.tracks === null && r.phase === 'setup' && r.refetched && r.again === 'ready', JSON.stringify(r));
    check('no page errors (#104 sign-out)', !errors(logs).length, errors(logs).join(' | '));
    await page.close();
  }

  // ------------------------------------------------------------------ #104: Spotify refuses the token mid-song, and the player can't come back
  {
    const { page, logs } = await open('&laptop=1');
    await page.evaluate(() => document.getElementById('scene').focus());
    await page.keyboard.press('KeyX');
    await until(page, () => ({ done: document.querySelectorAll('.sp-modal .sp-row').length > 0 }), null, 15_000);
    await click(page, '.sp-row', 2);
    await until(page, () => ({ done: window.office.laptop.store.state.now?.paused === false && window.officeAudio.nowPlaying.by === 'external' }), null, 6000);
    const r = await page.evaluate(async () => {
      const store = window.office.laptop.store;
      // Connecting again with a fresh token fails.
      store.service.player.connect = async () => false;
      store.onProblem('auth', 'token refused');
      await new Promise((res) => setTimeout(res, 2500));
      const a = window.officeAudio;
      return {
        playing: !!store.state.now?.track && !store.state.now.paused,
        by: a.nowPlaying.by,
        band: a.state().playing,
        toggle: document.querySelector('.sp-round--play')?.getAttribute('aria-label'),
        label: window.office.world.interactables.find((i) => i.kind === 'laptop')?.label,
      };
    });
    check('#104: the token refused mid-song and no player after: the laptop stops saying it plays, and the café band has the speakers back', !r.playing && r.by === 'band' && r.band && r.toggle === 'Play' && r.label === 'Use your laptop', JSON.stringify(r));
    check('no page errors (#104 auth)', !errors(logs).length, errors(logs).join(' | '));
    await page.close();
  }

  // ------------------------------------------------------------------ #130: the office doesn't answer once
  {
    const { page, logs } = await open();
    // The next status call fails, as when the office is restarting.
    await page.evaluate(() => {
      const svc = window.office.laptop.store.service;
      const real = svc.status.bind(svc);
      window.__statusCalls = 0;
      window.__failStatus = 1;
      svc.status = () => {
        window.__statusCalls++;
        if (window.__failStatus > 0) {
          window.__failStatus--;
          return Promise.reject(new Error('Can’t reach the office'));
        }
        return real();
      };
    });
    await page.evaluate(AT_DESK);
    await wait(400);
    await pressE(page);
    const down = await until(page, () => ({ done: document.querySelector('.sp-screen')?.dataset.phase === 'offline', text: document.querySelector('.sp-view')?.textContent ?? '' }), null, 15_000);
    const tryAgain = await page.evaluate(() => [...document.querySelectorAll('.sp-modal button')].some((b) => b.textContent.trim() === 'Try again'));
    const t0 = Date.now();
    const back = await until(page, () => ({ done: document.querySelector('.sp-screen')?.dataset.phase === 'ready' && document.querySelectorAll('.sp-modal .sp-list').length === 6 }), null, 12_000);
    const took = Date.now() - t0;
    check(
      '#130: the office doesn’t answer once: "isn’t answering" (Try again still there), then the laptop carries on by itself, with no click',
      !!down?.done && /isn’t answering/.test(down.text) && tryAgain && !!back?.done && took < 6000,
      JSON.stringify({ offline: !!down?.done, tryAgain, recovered: !!back?.done, took, calls: await page.evaluate(() => window.__statusCalls) }),
    );
    check('no page errors (#130)', !errors(logs).length, errors(logs).join(' | '));
    await page.close();
  }

  // ------------------------------------------------------------------ #130: asking again by itself, and late answers
  {
    const { page, logs } = await open();
    // Every status call waits for the check to answer it: ok (the demo office's own answer), setup
    // (the office isn't signed in) or down. Each call keeps when it was asked and answered.
    await page.evaluate(() => {
      const svc = window.office.laptop.store.service;
      const real = svc.status.bind(svc);
      window.__asks = [];
      svc.status = () =>
        new Promise((resolve, reject) => {
          const ask = { at: performance.now(), answered: 0 };
          const done = (fn) => () => ((ask.answered = performance.now()), fn());
          ask.ok = done(() => real().then(resolve, reject));
          ask.setup = done(() => real().then((s) => resolve({ ...s, connected: false }), reject));
          ask.down = done(() => reject(new Error('Can’t reach the office')));
          window.__asks.push(ask);
        });
    });
    const asked = (n) => until(page, (n) => ({ done: window.__asks.length >= n }), n, 15_000);
    const answer = (i, how) => page.evaluate((i, how) => window.__asks[i]?.[how](), i, how);
    const state = () =>
      page.evaluate(() => {
        const s = window.office.laptop.store.state;
        return { phase: s.phase, asking: s.asking, lists: document.querySelectorAll('.sp-modal .sp-list').length, asks: window.__asks.length };
      });
    const sit = async () => {
      await page.evaluate(AT_DESK);
      await wait(400);
      await pressE(page);
    };
    const stand = async () => {
      await page.keyboard.press('Escape');
      await wait(900);
    };
    const tryAgain = () => page.evaluate(() => [...document.querySelectorAll('.sp-modal button')].find((b) => b.textContent.trim() === 'Try again')?.click());

    // The office doesn't answer: the laptop asks again after 2 s, then 3.2 s.
    await sit();
    await asked(1);
    await answer(0, 'down');
    await asked(2);
    await answer(1, 'down');
    await asked(3);
    const gaps = await page.evaluate(() => [1, 2].map((i) => Math.round(window.__asks[i].at - window.__asks[i - 1].answered)));
    check('#130: the laptop asks again after about 2 s, then about 3.2 s (a little longer each time)', gaps[0] >= 1900 && gaps[0] <= 2500 && gaps[1] >= 3100 && gaps[1] <= 3800, `${gaps.join(' ms, ')} ms`);

    // Try again while the laptop's own ask is out, and Try again fails; then the older ask answers.
    await tryAgain();
    await asked(4);
    await answer(3, 'down');
    await answer(2, 'ok');
    await wait(500);
    const a = await state();
    check('…Try again fails while the laptop’s own ask is still out: that older ask’s late answer doesn’t overrule it, and the laptop keeps asking', a.phase === 'offline' && a.asking, JSON.stringify(a));

    // Closed while a retry is out: whatever it hears, nothing starts behind the shut laptop, and nothing more is asked.
    await asked(5);
    await stand();
    await answer(4, 'ok');
    await wait(6000);
    const b = await state();
    check('…closed while a retry is out: its answer starts nothing, and nothing more is asked (6 s)', b.phase === 'offline' && b.asks === 5, JSON.stringify(b));

    // Not signed in. Opened, closed and opened again before the office answers: the first fails late.
    await sit();
    await asked(6);
    await stand();
    await sit();
    await asked(7);
    await answer(5, 'down');
    await wait(300);
    await answer(6, 'setup');
    const setup = await until(page, () => ({ done: document.querySelector('.sp-screen')?.dataset.phase === 'setup', error: document.querySelector('.sp-modal .sp-error')?.textContent ?? '' }), null, 8000);
    check('…opened twice, not signed in, the first open fails late: the setup steps, without "can’t reach the office"', !!setup?.done && setup.error === '', JSON.stringify(setup));

    // Signed in. Opened twice again: the newer open shows your library, then the older one fails late.
    await stand();
    await sit();
    await asked(8);
    await stand();
    await sit();
    await asked(9);
    await answer(8, 'ok');
    const back = await until(page, () => ({ done: document.querySelector('.sp-screen')?.dataset.phase === 'ready' && document.querySelectorAll('.sp-modal .sp-list').length === 6 }), null, 12_000);
    await answer(7, 'down');
    await wait(500);
    const c = await state();
    check('…opened twice, signed in: the newer open carries on to your library, and the older one’s late failure doesn’t knock it off', !!back?.done && c.phase === 'ready' && c.lists === 6 && c.asks === 9, JSON.stringify(c));
    check('no page errors (#130 late answers)', !errors(logs).length, errors(logs).join(' | '));
    await page.close();
  }

  check('the demo office never talked to Spotify', outside.length === 0, outside.slice(0, 3).join(', '));

  // ------------------------------------------------------------------ the player frame (the real office page)
  {
    const { page, logs, spotify } = await openLive();
    const before = await page.evaluate(() => ({ sdk: typeof window.Spotify, frames: document.querySelectorAll('iframe').length }));
    check('a normal page load: nothing from Spotify, no Spotify in the page, no frame', spotify.length === 0 && before.sdk === 'undefined' && before.frames === 0, JSON.stringify({ requests: spotify.slice(0, 2), ...before }));
    // Turn the player on as the laptop does once you're signed in: the frame, its glue, the SDK in it.
    const on = await page.evaluate(async () => {
      const { FramePlayer } = await import('/src/spotify/frame.ts');
      const st = await (await fetch('/api/spotify/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
      const asked = [];
      const events = [];
      const player = new FramePlayer({
        origin: () => st.player,
        // Not a real token: Spotify refuses it, which is all this needs.
        token: async (refresh) => (asked.push(refresh), 'not-a-real-token'),
        play: async () => {},
        state: (raw) => raw,
      });
      window.__frame = { player, asked, events, origin: st.player };
      const connected = await Promise.race([
        player
          .connect({ ready: () => events.push('ready'), gone: () => events.push('gone'), state: () => events.push('state'), problem: (k) => events.push(`problem:${k}`) })
          .then((ok) => `connect ${ok}`, (e) => `error ${e.message}`),
        new Promise((r) => setTimeout(() => r('still connecting'), 25_000)),
      ]);
      const f = document.querySelector('iframe.sp-player-frame');
      return { connected, origin: st.player, src: f?.getAttribute('src') ?? null, allow: f?.getAttribute('allow') ?? null, sandbox: f?.getAttribute('sandbox') ?? null };
    });
    const frame = page.frames().find((f) => on.origin && f.url().startsWith(`${on.origin}/player`));
    const inFrame = frame ? await frame.evaluate(() => ({ player: typeof window.Spotify?.Player, sdkFrames: [...document.querySelectorAll('iframe')].map((i) => new URL(i.src).origin) })).catch((e) => ({ error: e.message })) : null;
    const after = await page.evaluate(() => ({ sdk: typeof window.Spotify, asked: window.__frame.asked.length, events: window.__frame.events }));
    const sdkLoaded = spotify.some((r) => r.url.startsWith('https://sdk.scdn.co/spotify-player.js'));
    if (!sdkLoaded && /error/.test(on.connected)) console.log(`  (Spotify's SDK didn't load, no network?: the frame checks are skipped: ${on.connected})`);
    else {
      check(
        'turned on: a frame from the player origin (encrypted-media and autoplay; sandboxed to scripts and its own origin) that knows who we are',
        !!on.origin && on.src === `${on.origin}/player#${encodeURIComponent(new URL(BASE).origin)}` && on.allow === 'encrypted-media; autoplay' && on.sandbox === 'allow-scripts allow-same-origin',
        JSON.stringify(on),
      );
      check('Spotify.Player starts inside the frame (and the SDK’s own frame inside that), never in the office page', inFrame?.player === 'function' && inFrame.sdkFrames.includes('https://sdk.scdn.co') && after.sdk === 'undefined', JSON.stringify({ inFrame, office: after.sdk }));
      const offPage = spotify.filter((r) => r.url.includes('sdk.scdn.co') && !r.from.startsWith(on.origin) && !r.from.startsWith('https://sdk.scdn.co'));
      check('Spotify’s SDK came only into the frame', sdkLoaded && !offPage.length, offPage.map((r) => `${r.url} from ${r.from}`).join(', ') || `${spotify.length} requests`);
      check('the SDK asked the office for a token over postMessage', after.asked > 0, JSON.stringify(after));
      const blocked = logs.filter((l) => /CSP blocked/.test(l));
      check('nothing the frame did was blocked by its CSP', !blocked.length, blocked.slice(0, 3).join(' | '));
      await page.evaluate(() => window.__frame.player.disconnect());
      await wait(600);
      const gone = await page.evaluate(() => document.querySelectorAll('iframe.sp-player-frame').length);
      check('turned off: the frame goes', gone === 0, String(gone));
    }
    check('no page errors (the player frame)', !errors(logs).length, errors(logs).join(' | '));
    await page.close();
  }

  // ------------------------------------------------------------------ #104: Spotify's SDK fails to load once
  {
    const { page, logs, spotify } = await openLive({ failFirstSdk: true });
    const r = await page.evaluate(async () => {
      const { FramePlayer } = await import('/src/spotify/frame.ts');
      const st = await (await fetch('/api/spotify/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
      const asked = [];
      const player = new FramePlayer({ origin: () => st.player, token: async (refresh) => (asked.push(refresh), 'not-a-real-token'), play: async () => {}, state: (raw) => raw });
      const events = { ready() {}, gone() {}, state() {}, problem() {} };
      const attempt = () =>
        Promise.race([player.connect(events).then((ok) => `connect ${ok}`, (e) => `error ${e.message}`), new Promise((res) => setTimeout(() => res('still connecting'), 20_000))]);
      const first = await attempt();
      await new Promise((res) => setTimeout(res, 500));
      // The next Play connects again.
      const second = await attempt();
      const frames = document.querySelectorAll('iframe.sp-player-frame').length;
      player.disconnect();
      return { first, second, asked: asked.length, frames };
    });
    const loads = spotify.filter((q) => q.url.startsWith('https://sdk.scdn.co/spotify-player.js')).length;
    // A retry that fails to load the SDK too means no network here: nothing to say about the frame.
    if (/didn’t load/.test(r.second)) console.log(`  (Spotify's SDK didn't load on the retry either, no network?: the #104 frame check is skipped: ${JSON.stringify(r)})`);
    else check('#104: Spotify’s SDK fails to load once: the next connect makes a fresh frame, the SDK loads and asks for its token', /error/.test(r.first) && !/still connecting|error/.test(r.second) && r.asked > 0 && r.frames === 1, JSON.stringify({ ...r, loads }));
    check('no page errors (#104 frame)', !errors(logs).length, errors(logs).join(' | '));
    await page.close();
  }
  // ------------------------------------------------------------------ #130: an office whose server is older than this page
  {
    const older = { on: true, calls: 0 };
    const { page, logs } = await openLive({ older });
    await page.evaluate(AT_DESK);
    await wait(400);
    await pressE(page);
    const off = await until(
      page,
      () => ({
        done: document.querySelector('.sp-screen')?.dataset.phase === 'offline',
        text: (document.querySelector('.sp-view')?.textContent ?? '').replace(/\s+/g, ' '),
        asking: [...document.querySelectorAll('.sp-view p')].some((p) => !p.hidden && /keeps asking/.test(p.textContent)),
      }),
      null,
      15_000,
    );
    // One quiet re-check (2 s), then nothing more on its own.
    await wait(7000);
    const after = await page.evaluate(() => ({
      text: (document.querySelector('.sp-view')?.textContent ?? '').replace(/\s+/g, ' '),
      asking: [...document.querySelectorAll('.sp-view p')].some((p) => !p.hidden && /keeps asking/.test(p.textContent)),
      tryAgain: [...document.querySelectorAll('.sp-modal button')].some((b) => b.textContent.trim() === 'Try again'),
    }));
    const calls = older.calls;
    check(
      '#130: a 404 from the office says its server is older than this page (restart, then Try again), never that it keeps asking, re-checks once, then stops',
      !!off?.done && !off.asking && /older than this page/.test(after.text) && /npm start/.test(after.text) && after.tryAgain && !after.asking && calls === 2,
      JSON.stringify({ offline: !!off?.done, calls, askingAtFirst: off?.asking, asking: after.asking, text: after.text.slice(0, 160) }),
    );
    // The office restarted with the new server: Try again, and on to the setup steps.
    older.on = false;
    await page.evaluate(() => [...document.querySelectorAll('.sp-modal button')].find((b) => b.textContent.trim() === 'Try again')?.click());
    const setup = await until(page, () => ({ done: document.querySelector('.sp-screen')?.dataset.phase === 'setup' }), null, 8000);
    check('…restarted, Try again carries on to the setup steps', !!setup?.done, String(!!setup?.done));
    check('no page errors (#130 older office)', !errors(logs).length, errors(logs).join(' | '));
    await page.close();
  }
} catch (err) {
  check('spotify checks ran to the end', false, err instanceof Error ? err.stack?.split('\n').slice(0, 3).join(' / ') : String(err));
} finally {
  await browser.close();
}
