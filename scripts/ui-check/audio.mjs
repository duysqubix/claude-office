// Sound checks (run by scripts/ui-check.mjs): the café music waits for the first gesture and
// fades in; M mutes everything and the Sound button says so; mute, Music on/off and both
// volume sliders (Help) work and survive a reload; the music dips while a chat is focused;
// evening tunes are slower and softer; no page errors; and the music costs the main thread
// next to nothing (frame times with music on vs off). Demo office only (?demo=1).
//   GAME_BASE=http://127.0.0.1:4778 node scripts/ui-check/audio.mjs
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
const errors = [];
/** CPU_THROTTLE=4 runs every page on a 4× slower CPU (like a small CI runner). */
const THROTTLE = Number(process.env.CPU_THROTTLE ?? 0);
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
    // Frame timing: when each frame ran, and how long the game's own frame took.
    const raf = window.requestAnimationFrame.bind(window);
    window.__frames = { on: false, busy: [], ts: [] };
    window.requestAnimationFrame = (cb) =>
      raf((t) => {
        const t0 = performance.now();
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
  await page.goto(`${BASE}/?demo=1&quiet=1&debug=1${hour}${query}`, { waitUntil: 'networkidle2', timeout: 30_000 });
  await page.waitForFunction(() => window.office && window.officeAudio && document.getElementById('splash')?.classList.contains('gone'), { timeout: 20_000 });
  // Once it's loaded: a throttled load takes ages to go network-idle.
  await throttle(page, THROTTLE);
  await wait(800);
  return page;
}

/** Reload, the way open() loads: unthrottled until the office is up, then slow again. */
async function reload(page) {
  await throttle(page, 1);
  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForFunction(() => window.officeAudio && document.getElementById('splash')?.classList.contains('gone'), { timeout: 20_000 });
  await throttle(page, THROTTLE);
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

/** Frame intervals and the game's per-frame JS time over `ms`, plus what the music scheduler cost. */
async function frames(page, ms) {
  const before = await state(page);
  await page.evaluate(() => Object.assign(window.__frames, { on: true, busy: [], ts: [] }));
  await wait(ms);
  const f = await page.evaluate(() => {
    window.__frames.on = false;
    return { busy: window.__frames.busy, ts: window.__frames.ts };
  });
  const after = await state(page);
  const gaps = f.ts.slice(1).map((t, i) => t - f.ts[i]).sort((a, b) => a - b);
  const q = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))] ?? NaN;
  const busy = f.busy.slice().sort((a, b) => a - b);
  const m0 = before.music;
  const m1 = after.music;
  return {
    fps: (gaps.length / ms) * 1000,
    p50: q(gaps, 0.5),
    p95: q(gaps, 0.95),
    p99: q(gaps, 0.99),
    busy: busy.reduce((a, b) => a + b, 0) / Math.max(1, busy.length),
    pumps: m1 && m0 ? m1.pumps - m0.pumps : 0,
    pumpMs: m1 && m0 ? m1.pumpMs - m0.pumpMs : 0,
    maxPump: m1?.maxPumpMs ?? 0,
    dropped: m1?.dropped ?? 0,
  };
}
const fmt = (x) => `${x.fps.toFixed(0)} fps, frame p50 ${x.p50.toFixed(1)} / p95 ${x.p95.toFixed(1)} / p99 ${x.p99.toFixed(1)} ms, game JS ${x.busy.toFixed(2)} ms`;

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
    await page.evaluate(async () => (await import('/src/ui/bus.ts')).bus.emit('sfx', { name: 'tick' }));
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
    const { bus } = await import('/src/ui/bus.ts');
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
  // One seeded office, music on and off in turns (sounds stay on), so the halves compare fairly.
  await page.close();
  page = await open('&seed=5');
  await gesture(page);
  await wait(6000);
  const runs = { on: [], off: [] };
  for (const mode of ['on', 'off', 'on', 'off']) {
    await page.evaluate((on) => window.officeAudio.setPref('music', on), mode === 'on');
    await wait(mode === 'on' ? 6000 : 2500);
    runs[mode].push(await frames(page, 5000));
  }
  await clearPrefs(page);
  const avg = (list, k) => list.reduce((a, x) => a + x[k], 0) / list.length;
  const sum = (list, k) => list.reduce((a, x) => a + x[k], 0);
  const merged = (list) => ({ fps: avg(list, 'fps'), p50: avg(list, 'p50'), p95: avg(list, 'p95'), p99: avg(list, 'p99'), busy: avg(list, 'busy') });
  const base = merged(runs.off);
  const band = merged(runs.on);
  const pumps = sum(runs.on, 'pumps');
  const pumpMs = sum(runs.on, 'pumpMs');
  const perSecond = pumpMs / 10;
  const worst = Math.max(...runs.on.map((x) => x.maxPump));
  const dropped = Math.max(...runs.on.map((x) => x.dropped));
  console.log(`  frames, music off: ${fmt(base)}`);
  console.log(`  frames, music on:  ${fmt(band)}; scheduler ${pumps} pumps, ${pumpMs.toFixed(1)} ms in 10 s (${perSecond.toFixed(2)} ms per second, ${(pumpMs / Math.max(1, pumps)).toFixed(3)} ms per pump), worst ${worst.toFixed(1)} ms`);
  check(
    'frame budget: the music adds no jank (frame p95 within 10% + 1 ms of music off)',
    band.p95 <= base.p95 * 1.1 + 1 && band.fps >= base.fps * 0.93,
    `p95 ${base.p95.toFixed(1)} → ${band.p95.toFixed(1)} ms, ${base.fps.toFixed(0)} → ${band.fps.toFixed(0)} fps, game JS ${base.busy.toFixed(2)} → ${band.busy.toFixed(2)} ms`,
  );
  // Milliseconds of main thread scale with the CPU: on a 4× slower one, 4× the budget.
  const slow = Math.max(1, THROTTLE);
  check(`frame budget: the scheduler uses under ${2 * slow} ms of main thread per second`, perSecond < 2 * slow && worst < 8 * slow, `${perSecond.toFixed(2)} ms/s, worst pump ${worst.toFixed(1)} ms${slow > 1 ? ` (CPU ${slow}× slower)` : ''}`);
  check('no late (dropped) notes', dropped === 0, `${dropped} dropped`);
  // (The last turn above was music off: back on, and the murmur comes with it.)
  await page.evaluate(() => window.officeAudio.setPref('music', true));
  await wait(1000);
  s = await state(page);
  check('the café murmur has joined under the band', s.murmur && s.playing, `murmur ${s.murmur}, playing ${s.playing}`);
  await page.close();

  // ---------------------------------------------------------------- the songwriter, by numbers
  // 300 seeded tunes (a fifth of them evening ones): tempos, registers and timing stay sane.
  const songs = await open();
  const tunes = await songs.evaluate(async () => {
    const { followUp } = await import('/src/audio/composer.ts');
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
