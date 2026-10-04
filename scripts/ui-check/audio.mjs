// Sound checks (run by scripts/ui-check.mjs): the café music waits for the first gesture and
// fades in; M mutes everything and the Sound button says so; mute, Music on/off and both
// volume sliders (Help) work and survive a reload; the music dips while a chat is focused;
// evening tunes are slower and softer; no page errors; and the music costs the main thread
// next to nothing (frame times with music on vs off). Demo office only (?demo=1).
//   GAME_BASE=http://127.0.0.1:4778 node scripts/ui-check/audio.mjs
// JANK_MS=5 adds that much main-thread work per frame while the music plays (JANK_AT=frame, the
// default: in every frame; JANK_AT=pump: inside the music's own pumps), and PUMP_MS=1 that much to
// every pump of the scheduler, to prove the two frame-budget checks still fail on real costs.
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
const errors = [];
/** CPU_THROTTLE=4 runs every page on a 4× slower CPU (like a small CI runner). */
const THROTTLE = Number(process.env.CPU_THROTTLE ?? 0);
/** Made-up jank for proving the jank check (see the top): where it goes, and how many ms a frame. */
const JANK_MS = Number(process.env.JANK_MS ?? 0);
const JANK = JANK_MS > 0 ? (process.env.JANK_AT === 'pump' ? { pump: JANK_MS } : { frame: JANK_MS }) : null;
const PUMP_MS = Number(process.env.PUMP_MS ?? 0);
/** The frame-budget office's music: a busy tune (90th percentile of notes a second), the same every run. */
const MUSIC_SEED = 358;
/** Each page's DevTools session: a throttle set through one session is only lifted through it. */
const sessions = new WeakMap();
const throttle = async (page, rate) => {
  if (THROTTLE <= 1) return;
  if (!sessions.has(page)) sessions.set(page, await page.target().createCDPSession());
  await sessions.get(page).send('Emulation.setCPUThrottlingRate', { rate });
};

/** A demo office page that never reports presence, with rAF callbacks timed for the frame check. */
async function open(query = '') {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`[console] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  await page.evaluateOnNewDocument(() => {
    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (d) {
      if (typeof d === 'string' && d.includes('"presence"')) return;
      return send.call(this, d);
    };
    // The tree is edited live: no hot reload may restart the office halfway through a check.
    window.WebSocket = new Proxy(WebSocket, {
      construct(target, args) {
        const p = args[1];
        if (p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr'))) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 };
        return Reflect.construct(target, args);
      },
    });
    // The game's own copy of a module: Vite serves one edited since it started as path?t=…, and a
    // plain import('/src/…') would load a second copy that the game never sees.
    performance.setResourceTimingBufferSize(5000);
    window.__live = (path) => import(performance.getEntriesByType('resource').map((e) => e.name).find((n) => new URL(n).pathname === path) ?? path);
    // Frame timing: when each frame ran, and how long the game's own frame took.
    const raf = window.requestAnimationFrame.bind(window);
    window.__frames = { on: false, busy: [], ts: [] };
    window.__jank = null;
    let jankedAt = -1;
    window.requestAnimationFrame = (cb) =>
      raf((t) => {
        const t0 = performance.now();
        // JANK_AT=frame: extra work in every frame (once a frame), as if the music cost it.
        const j = window.__jank?.frame;
        if (j && t !== jankedAt) {
          jankedAt = t;
          while (performance.now() - t0 < j);
        }
        cb(t);
        const f = window.__frames;
        if (f.on) {
          f.busy.push(performance.now() - t0);
          f.ts.push(t);
        }
      });
  });
  // Daytime unless a check asks otherwise: the real clock would make an evening run differ.
  const hour = /[?&]hour=/.test(query) ? '' : '&hour=12';
  // Loaded, then ready (the splash gone): a busy machine can take a long while to go network-idle.
  const slow = Math.max(1, THROTTLE);
  await page.goto(`${BASE}/?demo=1&quiet=1&debug=1${hour}${query}`, { waitUntil: 'load', timeout: 30_000 * slow });
  await page.waitForFunction(() => window.office && window.officeAudio && document.getElementById('splash')?.classList.contains('gone'), { timeout: 30_000 * slow });
  // Once it's loaded: a throttled load takes ages to go network-idle.
  await throttle(page, THROTTLE);
  await instrument(page);
  await wait(800);
  return page;
}

/** Time every pump of the game's music player: the first (music start), and those in a frames() window. */
const instrument = (page) =>
  page.evaluate(async (extra) => {
    const { MusicPlayer } = await window.__live('/src/audio/music.ts');
    const pump = MusicPlayer.prototype.pump;
    window.__pumps = { first: null, window: null };
    let last = performance.now();
    MusicPlayer.prototype.pump = function (until) {
      const t0 = performance.now();
      // A music-off turn of the frame-budget check: no scheduling at all (the player waits, so the
      // next turn carries on in the same groove), and none of the made-up work either.
      if (window.__pumpsPaused) {
        last = t0;
        return;
      }
      // JANK_AT=pump: the same jank inside the music's own work, for the frames since the last pump.
      const j = window.__jank?.pump;
      if (j) while (performance.now() - t0 < j * Math.min(10, (t0 - last) / (1000 / 60)));
      last = t0;
      // PUMP_MS: a fixed extra cost in every pump (the scheduler check must notice).
      if (extra) while (performance.now() - t0 < extra);
      pump.call(this, until);
      const ms = performance.now() - t0;
      window.__pumps.first ??= ms;
      window.__pumps.window?.push(ms);
    };
  }, PUMP_MS);

/** Reload, the way open() loads: unthrottled until the office is up, then slow again. */
async function reload(page) {
  await throttle(page, 1);
  await page.reload({ waitUntil: 'load', timeout: 30_000 * Math.max(1, THROTTLE) });
  await page.waitForFunction(() => window.office && window.officeAudio && document.getElementById('splash')?.classList.contains('gone'), { timeout: 30_000 * Math.max(1, THROTTLE) });
  await throttle(page, THROTTLE);
  await instrument(page);
}

const state = (page) => page.evaluate(() => window.officeAudio.state());
const level = async (page) => {
  await page.evaluate(() => window.officeAudio.level());
  await wait(250);
  return page.evaluate(() => window.officeAudio.level());
};
const soundLabel = (page) => page.evaluate(() => document.querySelector('.co-hud__right button[data-co-tip^="Sound"]')?.getAttribute('aria-label') ?? null);
/** The first gesture: a key the game doesn't use (a click could land on someone and walk there). */
const gesture = async (page) => {
  await page.bringToFront();
  await page.evaluate(() => document.getElementById('scene').focus());
  await page.keyboard.press('KeyX');
  await wait(300);
};
/** M goes through the game loop, which only runs in the tab in front. */
const pressM = async (page) => {
  await page.bringToFront();
  await page.evaluate(() => document.getElementById('scene').focus());
  await page.keyboard.press('KeyM');
  await wait(250);
};
const stored = (page) =>
  page.evaluate(() => Object.fromEntries(['muted', 'music', 'music-volume', 'sfx-volume'].map((k) => [k, localStorage.getItem(`claude-office:${k}`)])));
const clearPrefs = (page) => page.evaluate(() => ['muted', 'music', 'music-volume', 'sfx-volume'].forEach((k) => localStorage.removeItem(`claude-office:${k}`)));

/** Frame intervals and the game's per-frame JS time over `ms`, plus what the music scheduler cost in that time. */
async function frames(page, ms) {
  await page.evaluate(() => {
    Object.assign(window.__frames, { on: true, busy: [], ts: [] });
    window.__pumps.window = [];
  });
  await wait(ms);
  const f = await page.evaluate(() => {
    window.__frames.on = false;
    const pumps = window.__pumps.window;
    window.__pumps.window = null;
    return { busy: window.__frames.busy, ts: window.__frames.ts, pumps };
  });
  const after = await state(page);
  const gaps = f.ts.slice(1).map((t, i) => t - f.ts[i]).sort((a, b) => a - b);
  const q = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))] ?? NaN;
  const busy = f.busy.slice().sort((a, b) => a - b);
  const pumpMs = f.pumps.reduce((a, b) => a + b, 0);
  return {
    fps: (gaps.length / ms) * 1000,
    meanFrame: f.ts.length > 1 ? (f.ts[f.ts.length - 1] - f.ts[0]) / (f.ts.length - 1) : NaN,
    p50: q(gaps, 0.5),
    p95: q(gaps, 0.95),
    p99: q(gaps, 0.99),
    busy: busy.reduce((a, b) => a + b, 0) / Math.max(1, busy.length),
    // Only this window's pumps (the player's own stats run from its start, when it composed and
    // built its first bars while the page was still settling).
    pumps: f.pumps.length,
    pumpMs,
    // What the music's own scheduling cost each frame of this window.
    musicPerFrame: pumpMs / Math.max(1, f.ts.length),
    maxPump: Math.max(0, ...f.pumps),
    dropped: after.music?.dropped ?? 0,
  };
}

try {
  // ---------------------------------------------------------------- before and after a gesture
  let page = await open();
  await clearPrefs(page);
  await wait(2500);
  let s = await state(page);
  check('no sound before the first gesture (no audio context, no music)', s.context === 'none' && !s.playing && !s.unlocked, `context ${s.context}, playing ${s.playing}`);

  await gesture(page);
  s = await state(page);
  check('the first click starts the music', s.context === 'running' && s.playing && s.unlocked, `context ${s.context}, playing ${s.playing}, tune "${s.tune}"`);
  const fade0 = s.fade;
  await wait(5500);
  s = await state(page);
  const lv = await level(page);
  check('the music fades in from silence', fade0 !== null && fade0 < 0.4 && s.fade > 0.95, `fade ${fade0?.toFixed(2)} → ${s.fade?.toFixed(2)}`);
  check('and is actually audible', lv > -70, `output ${lv.toFixed(1)} dBFS RMS`);
  const tuneMatch = /(\d+) bpm/.exec(s.tune);
  check('daytime tunes sit at 72–85 bpm', !!tuneMatch && +tuneMatch[1] >= 72 && +tuneMatch[1] <= 85 && !/night/.test(s.tune), s.tune);

  // ---------------------------------------------------------------- mute (M)
  await pressM(page);
  s = await state(page);
  check('M mutes everything at once', s.prefs.muted && s.master !== null && s.master < 0.05, `master ${s.master}`);
  check('the Sound button says sound is off', (await soundLabel(page)) === 'Sound is off (M)', await soundLabel(page));
  await wait(2200);
  s = await state(page);
  check('muted, the band stops and the audio context sleeps', !s.playing && s.context === 'suspended', `playing ${s.playing}, context ${s.context}`);
  check('mute is saved', (await stored(page)).muted === '1', JSON.stringify(await stored(page)));

  await reload(page);
  await wait(600);
  await gesture(page);
  await wait(1200);
  s = await state(page);
  check('after a reload it is still muted: no music on the first click', s.prefs.muted && !s.playing, `muted ${s.prefs.muted}, playing ${s.playing}`);
  check('and the Sound button still says off', (await soundLabel(page)) === 'Sound is off (M)', await soundLabel(page));
  await pressM(page);
  await wait(900);
  s = await state(page);
  check('M again: sound and music come back', !s.prefs.muted && s.master > 0.9 && s.playing, `master ${s.master}, playing ${s.playing}`);
  // Muted, reload, and the very first key is M (unmute): the speakers must wake for real.
  await pressM(page);
  await wait(300);
  await reload(page);
  await wait(600);
  await pressM(page);
  await wait(1500);
  s = await state(page);
  check('muted, then M as the very first key: sound and music start', !s.prefs.muted && s.context === 'running' && s.playing, `muted ${s.prefs.muted}, context ${s.context}, playing ${s.playing}`);
  // M twice in a blink (mute, unmute) never leaves the speakers asleep.
  await pressM(page);
  await wait(40);
  await pressM(page);
  await wait(2500);
  s = await state(page);
  check('M twice quickly leaves sound on and the band playing', !s.prefs.muted && s.context === 'running' && s.playing, `muted ${s.prefs.muted}, context ${s.context}, playing ${s.playing}`);

  // ---------------------------------------------------------------- Help: Music, volumes
  await page.evaluate(() => window.office.panels.open('help'));
  await wait(500);
  const help = await page.evaluate(() => {
    const root = document.querySelector('.co-panel--help .co-sound');
    return root
      ? {
          toggle: !!root.querySelector('input[type=checkbox]'),
          sliders: [...root.querySelectorAll('input[type=range]')].map((r) => r.getAttribute('aria-label')),
        }
      : null;
  });
  check('Help has Music on/off and music and sound-effect volume sliders', !!help && help.toggle && help.sliders.length === 2, JSON.stringify(help));
  if (help) {
    const setRange = (i, v) =>
      page.evaluate(
        (i, v) => {
          const r = document.querySelectorAll('.co-panel--help .co-sound input[type=range]')[i];
          r.value = String(v);
          r.dispatchEvent(new Event('input', { bubbles: true }));
        },
        i,
        v,
      );
    await setRange(0, 20);
    await setRange(1, 50);
    await wait(1500);
    // Nothing is playing through the effects bus now, and a bus nothing plays through isn't
    // processed: its gain still reads the old value. The next sound must get the new level from
    // its first moment, so play one (a tick) and read the gain it got.
    await page.evaluate(async () => (await window.__live('/src/ui/bus.ts')).bus.emit('sfx', { name: 'tick' }));
    await wait(300);
    s = await state(page);
    check('the music slider sets the music level', Math.abs(s.musicBus - 0.04) < 0.01, `music bus ${s.musicBus?.toFixed(3)} (want 0.040)`);
    check('the sound-effects slider sets the level the next effect plays at', Math.abs(s.sfxBus - 0.55 * 0.25) < 0.01, `sfx bus ${s.sfxBus?.toFixed(3)} (want 0.138)`);
    await page.evaluate(() => {
      const c = document.querySelector('.co-panel--help .co-sound input[type=checkbox]');
      c.click();
    });
    await wait(2000);
    s = await state(page);
    check('Music off stops the band (sound effects stay on)', !s.playing && !s.prefs.muted && s.prefs.music === false, `playing ${s.playing}, music ${s.prefs.music}`);
    const saved = await stored(page);
    check('music, volumes and mute are saved per browser', saved.music === '0' && saved['music-volume'] === '0.2' && saved['sfx-volume'] === '0.5' && saved.muted === '0', JSON.stringify(saved));

    await reload(page);
    await wait(600);
    await gesture(page);
    await page.evaluate(() => window.office.panels.open('help'));
    await wait(700);
    const after = await page.evaluate(() => {
      const root = document.querySelector('.co-panel--help .co-sound');
      return {
        music: root?.querySelector('input[type=checkbox]')?.checked,
        values: [...(root?.querySelectorAll('input[type=range]') ?? [])].map((r) => r.value),
        playing: window.officeAudio.state().playing,
      };
    });
    check('after a reload Help shows the saved settings, and Music stays off', after.music === false && after.values.join() === '20,50' && !after.playing, JSON.stringify(after));
    await page.evaluate(() => document.querySelector('.co-panel--help .co-sound input[type=checkbox]').click());
    await wait(800);
    s = await state(page);
    check('Music on starts the band again', s.playing && s.prefs.music, `playing ${s.playing}`);
    await page.evaluate(() => window.office.panels.close());
  }

  // ---------------------------------------------------------------- ducking under a focused chat
  await clearPrefs(page);
  await page.close();
  page = await open();
  await gesture(page);
  await wait(800);
  const ducked = await page.evaluate(async () => {
    const o = window.office;
    const who = o.store.employees.find((e) => e.hosted && e.state !== 'needs-you') ?? o.store.employees.find((e) => e.hosted);
    if (!who) return { error: 'no hosted person in the demo' };
    o.panels.openChat(who.sessionId);
    await new Promise((r) => setTimeout(r, 600));
    const input = document.querySelector('.co-panel--chat .co-chat__input');
    input?.focus();
    await new Promise((r) => setTimeout(r, 1200));
    const on = window.officeAudio.state();
    input?.blur();
    document.getElementById('scene').focus();
    await new Promise((r) => setTimeout(r, 2500));
    const off = window.officeAudio.state();
    return { focused: document.activeElement?.id, on: { ducked: on.ducked, bus: on.musicBus }, off: { ducked: off.ducked, bus: off.musicBus } };
  });
  check(
    'the music dips while a chat is focused, and comes back after',
    !ducked.error && ducked.on.ducked && ducked.on.bus < 0.2 && !ducked.off.ducked && ducked.off.bus > 0.28,
    JSON.stringify(ducked),
  );
  await page.evaluate(() => window.office.panels.close());

  // ---------------------------------------------------------------- another source takes the speakers (#28)
  const ext = await page.evaluate(async () => {
    const a = window.officeAudio;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const log = [];
    const handBack = a.handOver({ name: 'Test radio', setLevel: (l) => log.push(Math.round(l * 1000) / 1000), release: () => log.push('release') });
    await sleep(2500);
    const during = { playing: a.state().playing, by: a.nowPlaying.by, label: a.nowPlaying.label };
    a.setMuted(true);
    await sleep(100);
    a.setMuted(false);
    await sleep(100);
    handBack();
    await sleep(500);
    return { log, during, after: { playing: a.state().playing, by: a.nowPlaying.by } };
  });
  const swap = await page.evaluate(async () => {
    const a = window.officeAudio;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    // The first source hands the speakers back the moment it's asked to let go.
    let back1 = () => {};
    back1 = a.handOver({ name: 'One', setLevel() {}, release: () => back1() });
    const back2 = a.handOver({ name: 'Two', setLevel() {}, release() {} });
    await sleep(300);
    const during = { by: a.nowPlaying.by, label: a.nowPlaying.label, playing: a.state().playing };
    back2();
    await sleep(300);
    return { during, after: a.nowPlaying.by };
  });
  check('a source taking over from another one keeps the speakers (no band in between)', swap.during.by === 'external' && swap.during.label === 'Two' && !swap.during.playing && swap.after === 'band', JSON.stringify(swap));
  check(
    'another source can take the music and hand it back (#28), and hears mute as level 0',
    !ext.during.playing && ext.during.by === 'external' && ext.during.label === 'Test radio' && ext.log.includes(0) && ext.log.some((v) => typeof v === 'number' && v > 0) && ext.after.playing && ext.after.by === 'band',
    JSON.stringify(ext),
  );

  // ---------------------------------------------------------------- one tab plays
  const other = await open();
  await gesture(other);
  await wait(2500);
  const [here, there] = [await state(page), await state(other)];
  check('one office tab plays at a time: the last one clicked takes the music', !here.playing && here.yielded && there.playing, `first tab playing ${here.playing} (yielded ${here.yielded}), second ${there.playing}`);
  await gesture(page);
  await wait(2500);
  const [back, gone] = [await state(page), await state(other)];
  check('and a click in the first tab takes it back', back.playing && !gone.playing, `first ${back.playing}, second ${gone.playing}`);
  // Both muted (one tab's mute reaches the other), a key in the second, unmute there: both
  // tabs wake up, and the one used last keeps the music (they used to yield to each other).
  await pressM(page);
  await wait(800);
  await gesture(other);
  await pressM(other);
  await wait(3000);
  const [a1, b1] = [await state(page), await state(other)];
  check('two tabs unmuted together: the one used last plays, the other waits', !a1.prefs.muted && !b1.prefs.muted && b1.playing && !a1.playing, `first playing ${a1.playing}, second playing ${b1.playing}`);
  await other.close();

  // ---------------------------------------------------------------- sound effects
  // Music off (silence), then a bell over the bus: it must come out; muted, it must not.
  const fx = await page.evaluate(async () => {
    const { bus } = await window.__live('/src/ui/bus.ts');
    const a = window.officeAudio;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const level = async () => {
      a.level();
      await sleep(60);
      return Math.max(-200, a.level());
    };
    a.setPref('music', false);
    await sleep(2500);
    const quiet = await level();
    bus.emit('sfx', { name: 'bell' });
    await sleep(60);
    const bell = await level();
    a.setMuted(true);
    await sleep(300);
    bus.emit('sfx', { name: 'bell' });
    await sleep(60);
    const muted = await level();
    a.setMuted(false);
    a.setPref('music', true);
    return { quiet: Math.round(quiet), bell: Math.round(bell), muted: Math.round(muted) };
  });
  check('sound effects come out of the speakers, and M silences them', fx.bell > -60 && fx.bell > fx.quiet + 20 && fx.muted <= -150, `dBFS: silence ${fx.quiet}, bell ${fx.bell}, bell while muted ${fx.muted}`);

  // ---------------------------------------------------------------- frame-time budget
  // One seeded office playing the same busy tune every run, in its groove (past the intro's four
  // bars of keys alone), then the music on and off in twelve short turns: off is the scheduler
  // paused and the speakers suspended (no pumps, no audio thread: nothing of the music runs), on is
  // the same groove carrying on. Turns that short and close together see the same machine, however
  // its load swings (a busy CI runner, other work on the box); every music-on turn is compared with
  // the music-off turns either side of it, and the medians of those differences are what's judged.
  await page.close();
  page = await open(`&seed=5&musicseed=${MUSIC_SEED}`);
  await gesture(page);
  await wait(13_000);
  const turns = [];
  for (let i = 0; i < 12; i++) {
    const on = i % 2 === 0;
    await page.evaluate(
      async (on, jank) => {
        window.__jank = on ? jank : null;
        const ctx = window.officeAudio.ctx;
        if (on) {
          await ctx.resume();
          window.__pumpsPaused = false;
        } else {
          window.__pumpsPaused = true;
          await ctx.suspend();
        }
      },
      on,
      JANK,
    );
    await wait(500);
    turns.push({ on, ...(await frames(page, 3000)) });
  }
  await page.evaluate(async () => {
    window.__jank = null;
    await window.officeAudio.ctx.resume();
    window.__pumpsPaused = false;
  });
  await clearPrefs(page);
  const med = (a) => {
    const v = [...a].sort((x, y) => x - y);
    const m = v.length >> 1;
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  };
  const onTurns = turns.filter((t) => t.on);
  const offTurns = turns.filter((t) => !t.on);
  const offMed = (k) => med(offTurns.map((t) => t[k]));
  /** Median over the music-on turns of (that turn − the mean of the music-off turns either side). */
  const delta = (k) =>
    med(
      turns.flatMap((t, i) => {
        if (!t.on) return [];
        const next = [turns[i - 1], turns[i + 1]].filter((x) => x && !x.on);
        return [t[k] - next.reduce((a, x) => a + x[k], 0) / next.length];
      }),
    );
  // The yardstick: the game's own JS a frame, music off, on this machine at this moment. A slow or
  // busy machine (a CI runner, CPU_THROTTLE) slows the music's work just as much, so budgets in
  // shares of it hold anywhere, where fixed milliseconds swing with the machine.
  const frameJs = offMed('busy');
  const live = {
    perSecond: med(onTurns.map((t) => t.pumpMs / 3)),
    worst: Math.max(...onTurns.map((x) => x.maxPump)),
  };
  const dropped = Math.max(...onTurns.map((x) => x.dropped));
  const startPump = await page.evaluate(() => window.__pumps.first);

  // The scheduler's own cost, timed where nothing else can add to it: the real pump() on fresh
  // offline contexts (no rendering thread holding the graph, no frames between pumps), over 16 s
  // of the same tune's groove, three times; the medians count. Live pump times on a loaded machine
  // also carry its preemption, other code's garbage collection and the audio thread's lock.
  const bench = await page.evaluate(async (seed) => {
    const { MusicPlayer } = await window.__live('/src/audio/music.ts');
    const reps = [];
    for (let r = 0; r < 3; r++) {
      const ctx = new OfflineAudioContext(2, 44100 * 30, 44100);
      const p = new MusicPlayer(ctx, { seed, night: () => false, crackle: false });
      p.output.connect(ctx.destination);
      // As the speakers start it: a beat of grace for the first notes' human timing.
      p.start(0.15);
      for (let t = 0; t < 12.5; t += 0.1) p.pump(t + 0.8);
      const ms = [];
      for (let t = 12.5; t < 28.5; t += 0.1) {
        const t0 = performance.now();
        p.pump(t + 0.8);
        ms.push(performance.now() - t0);
      }
      reps.push({ perSecond: ms.reduce((a, b) => a + b, 0) / 16, worst: Math.max(...ms), notes: p.stats.scheduled });
    }
    return reps;
  }, MUSIC_SEED);
  const sched = { perSecond: med(bench.map((r) => r.perSecond)), worst: med(bench.map((r) => r.worst)) };

  console.log(`  frames, music off (median of ${offTurns.length}): ${offMed('fps').toFixed(0)} fps, frame ${offMed('meanFrame').toFixed(1)} ms mean / ${offMed('p95').toFixed(1)} ms p95, game JS ${offMed('busy').toFixed(2)} ms`);
  console.log(`  music on, median change: frame ${delta('meanFrame') >= 0 ? '+' : ''}${delta('meanFrame').toFixed(2)} ms mean / ${delta('p95') >= 0 ? '+' : ''}${delta('p95').toFixed(2)} ms p95, game JS ${delta('busy') >= 0 ? '+' : ''}${delta('busy').toFixed(2)} ms; the music's own ${med(onTurns.map((t) => t.musicPerFrame)).toFixed(3)} ms a frame${JANK ? `; made-up jank ${JSON.stringify(JANK)}` : ''}`);
  console.log(`  scheduler: ${sched.perSecond.toFixed(3)} ms per second of music (${((100 * sched.perSecond) / frameJs).toFixed(1)}% of a game frame's JS), worst pump ${sched.worst.toFixed(2)} ms (offline, median of ${bench.length}: ${bench.map((r) => r.perSecond.toFixed(3)).join(' / ')}); live ${live.perSecond.toFixed(2)} ms/s, worst ${live.worst.toFixed(1)} ms; music start's first pump ${startPump?.toFixed(1)} ms${PUMP_MS ? `; made-up ${PUMP_MS} ms a pump` : ''}`);
  // Jank is the music costing the game frames. Always judged: the music's own main-thread time a
  // frame, and the game's frame work, which the music mustn't touch. Frame times too when the game
  // holds the display's 60 Hz: below that the machine is already dropping frames, frame times
  // swing by more than any music could add, and only a gross change counts.
  const vsync = 1000 / 60;
  const keepsUp = offMed('meanFrame') <= vsync * 1.1;
  const own = med(onTurns.map((t) => t.musicPerFrame));
  const why = [];
  if (own > 0.1 * frameJs) why.push(`the music's own ${own.toFixed(2)} ms a frame > ${(0.1 * frameJs).toFixed(2)} (a tenth of the game's)`);
  const js = delta('busy');
  const jsLimit = 1 + 0.03 * frameJs;
  if (js > jsLimit) why.push(`game JS +${js.toFixed(2)} ms > ${jsLimit.toFixed(2)}`);
  const frame = delta('meanFrame');
  const frameLimit = keepsUp ? 0.05 * offMed('meanFrame') + 0.5 : 0.25 * offMed('meanFrame') + 2;
  if (frame > frameLimit) why.push(`frame +${frame.toFixed(2)} ms > ${frameLimit.toFixed(2)}`);
  const p95 = delta('p95');
  if (keepsUp && p95 > 0.1 * offMed('p95') + 1) why.push(`p95 +${p95.toFixed(2)} ms > ${(0.1 * offMed('p95') + 1).toFixed(2)}`);
  // The comparison only means something if the off turns really were music-free.
  const offPumps = offTurns.reduce((a, t) => a + t.pumps, 0);
  check('frame budget: the music-off turns are music-free (no scheduler pumps)', offPumps === 0, `${offPumps} pumps in ${offTurns.length} off turns, ${onTurns.reduce((a, t) => a + t.pumps, 0)} in ${onTurns.length} on turns`);
  check(
    `frame budget: the music adds no jank (own time, game JS${keepsUp ? ', frame times' : ''}; interleaved medians)`,
    why.length === 0,
    why.length ? why.join('; ') : `${keepsUp ? 'game keeps up at' : 'overloaded machine at'} ${offMed('fps').toFixed(0)} fps; own ${own.toFixed(3)} ms a frame, game JS ${js >= 0 ? '+' : ''}${js.toFixed(2)} ms, frame ${frame >= 0 ? '+' : ''}${frame.toFixed(2)} ms${keepsUp ? `, p95 ${p95 >= 0 ? '+' : ''}${p95.toFixed(2)} ms` : ''}`,
  );
  check(
    "frame budget: a second of music costs the scheduler under a fifth of one game frame (timed offline)",
    sched.perSecond < 0.2 * frameJs && sched.worst < frameJs,
    `${sched.perSecond.toFixed(3)} ms per second of music = ${((100 * sched.perSecond) / frameJs).toFixed(1)}% of a ${frameJs.toFixed(2)} ms game frame; worst pump ${sched.worst.toFixed(2)} ms`,
  );
  check('no late (dropped) notes', dropped === 0, `${dropped} dropped`);
  // (The speakers are back on after the last turn; the murmur plays with the band.)
  await page.evaluate(() => window.officeAudio.setPref('music', true));
  await wait(1000);
  s = await state(page);
  check('the café murmur has joined under the band', s.murmur && s.playing, `murmur ${s.murmur}, playing ${s.playing}`);
  await page.close();

  // ---------------------------------------------------------------- the songwriter, by numbers
  // 300 seeded tunes (a fifth of them evening ones): tempos, registers and timing stay sane.
  const songs = await open();
  const tunes = await songs.evaluate(async () => {
    const { followUp } = await window.__live('/src/audio/composer.ts');
    const bad = [];
    let prev = null;
    let bars = 0;
    const keys = new Set();
    for (let i = 0; i < 300; i++) {
      const night = i % 5 === 4;
      const t = followUp(prev, 4242, i, night);
      prev = t;
      keys.add(t.tonic);
      bars += t.bars.length;
      if (night ? t.bpm < 64 || t.bpm > 70 : t.bpm < 72 || t.bpm > 85) bad.push(`tune ${i}: ${t.bpm} bpm`);
      if (t.night !== night) bad.push(`tune ${i}: night ${t.night}`);
      for (const b of t.bars)
        for (const e of b.events) {
          if (!Number.isFinite(e.at) || e.at < -1 || e.at >= 4.5) bad.push(`tune ${i} bar ${b.index}: ${e.type} at ${e.at}`);
          if ('dur' in e && e.dur !== undefined && !(e.dur > 0)) bad.push(`tune ${i} bar ${b.index}: ${e.type} dur ${e.dur}`);
          if (e.type === 'keys' && (e.notes.length > 5 || e.notes.some((n) => n < 48 || n > 88))) bad.push(`tune ${i}: keys ${e.notes}`);
          if (e.type === 'bass' && (e.note < 33 || e.note > 47)) bad.push(`tune ${i}: bass ${e.note}`);
          if (e.type === 'lead' && (e.note < 62 || e.note > 90)) bad.push(`tune ${i}: lead ${e.note}`);
        }
    }
    return { bad: bad.slice(0, 5), count: bad.length, bars, keys: keys.size };
  });
  check('300 seeded tunes keep their tempos, registers and timing', tunes.count === 0, tunes.count ? `${tunes.count} problems, e.g. ${tunes.bad.join('; ')}` : `${tunes.bars} bars, ${tunes.keys} keys`);
  await songs.close();

  // ---------------------------------------------------------------- evening
  const night = await open('&hour=22');
  await gesture(night);
  await wait(500);
  s = await state(night);
  const nb = /(\d+) bpm/.exec(s.tune);
  check('after 9 pm the tunes are slower and softer (?hour=22)', s.evening && /night/.test(s.tune) && !!nb && +nb[1] < 72, s.tune);
  await night.close();

  check('no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
} catch (err) {
  check('audio checks ran to the end', false, String(err?.stack ?? err).split('\n').slice(0, 3).join(' '));
} finally {
  await browser.close();
}
