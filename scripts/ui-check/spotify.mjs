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
// - the real office page: nothing of Spotify's on a normal load; turned on, Spotify's SDK runs in
//   the player frame (its own loopback origin), never in the office page, and asks the office for
//   its token over postMessage (needs the network for Spotify's SDK; skipped without).
//   GAME_BASE=http://127.0.0.1:4778 node scripts/ui-check/spotify.mjs
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const mod = await import(require.resolve('puppeteer-core'));
const puppeteer = mod.default ?? mod;
const BASE = process.env.GAME_BASE ?? process.env.UI_KIT_BASE ?? 'http://127.0.0.1:4777';
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
async function openLive() {
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
    const write = req.method() !== 'GET' && req.method() !== 'HEAD' && u.includes('/api/');
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
    await click(page, '.sp-row', 2);
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

    // Space (outside a control): pause; the band comes back. Space again: Spotify again.
    await page.evaluate(() => document.querySelector('.sp-screen').focus());
    await page.keyboard.press('Space');
    await wait(1500);
    m = await look(page);
    check('Space pauses: "Play" again, the row stops jiggling, the band gets the speakers back', m.store.paused === true && m.toggle === 'Play' && m.speakers.by === 'band' && m.speakers.band, JSON.stringify({ paused: m.store.paused, toggle: m.toggle, speakers: m.speakers }));
    check('…and the E prompt goes back to "Use your laptop"', m.label === 'Use your laptop', m.label);
    await page.keyboard.press('Space');
    await wait(1200);
    m = await look(page);
    check('Space again: playing, and Spotify has the speakers again', m.store.paused === false && m.speakers.by === 'external' && !m.speakers.band, JSON.stringify({ paused: m.store.paused, speakers: m.speakers }));

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
    await click(page, '.sp-row', 0);
    await wait(1500);
    const m = await look(page);
    check('no Premium: a kind message about Premium; playlists still show', /Premium/.test(m.notice) && m.rows > 0, m.notice);
    check('…nothing plays and the café band keeps the speakers', m.store.track === null && m.speakers.by === 'band', JSON.stringify({ track: m.store.track, speakers: m.speakers }));
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
} catch (err) {
  check('spotify checks ran to the end', false, err instanceof Error ? err.stack?.split('\n').slice(0, 3).join(' / ') : String(err));
} finally {
  await browser.close();
}
