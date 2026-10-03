// Crowd checks (run by scripts/ui-check.mjs), in the demo office (?demo=1, quiet=1): people
// step around each other (#30).
// - a busy minute (breaks, sessions coming and going, interns, a regular making room, the
//   boss in the doorway): no two characters overlap more than 10 cm for more than 0.3 s,
//   nobody walks in place, and the odd "Sorry!" keeps to its cooldowns;
// - a doorway jam (6 in and 6 out, at once and meeting in the doorway): no overlaps, no
//   deadlock, and everyone gets where they're going nearly as fast as with ?crowd=0 (no
//   avoidance at all: within 30% or 5 s);
// - a brush gets one "Sorry!" (and not a second one straight after);
// - cost: the crowd's share of a frame with 20+ people on their feet.
// The roster is driven straight through the director, as in desks.mjs. Times are the office's
// own (it runs behind the wall clock on a slow machine); CPU_THROTTLE=4 runs every page on a 4×
// slower CPU, like a small CI runner.
//   GAME_BASE=http://127.0.0.1:4778 node scripts/ui-check/crowd.mjs
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const mod = await import(require.resolve('puppeteer-core'));
const puppeteer = mod.default ?? mod;
const BASE = process.env.GAME_BASE ?? process.env.UI_KIT_BASE ?? 'http://127.0.0.1:4777';
const executablePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find((p) => existsSync(p));
const ONLY = process.env.CROWD_ONLY ?? '';
const THROTTLE = Number(process.env.CPU_THROTTLE ?? 0);

const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const check = (name, ok, detail = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = (logs) => logs.filter((l) => l.startsWith('[pageerror]'));

/** A demo page that never reports presence, never hot-reloads and never POSTs, with the crowd watch running. */
async function open(url) {
  if (!url.includes('demo=1')) throw new Error('demo pages only');
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
    // The tree is edited live: no hot reload may restart the office halfway through a check.
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
    if (req.method() !== 'GET' && req.method() !== 'HEAD' && req.url().includes('/api/')) return void req.abort();
    void req.continue();
  });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 });
  await page.waitForFunction(() => window.office && document.getElementById('splash')?.classList.contains('gone'), { timeout: 20_000 });
  // Once it's loaded (with request interception on, a throttled load never goes network-idle).
  if (THROTTLE > 1) await (await page.target().createCDPSession()).send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  await wait(1500);
  await page.evaluate(WATCH);
  return { page, logs };
}

/**
 * In the page, every frame: everyone who's visible (the boss, sessions, interns, regulars),
 * each pair's overlap (radius 0.3 at full size), and episodes of more than 10 cm lasting
 * over 0.3 s; legs stepping (gait) with no real ground speed for over a second; every new
 * line anyone says.
 */
const WATCH = () => {
  const o = window.office;
  const W = (window.__crowdWatch = { frames: 0, episodes: [], worstOver: 0, inPlace: [], lines: [], walkersMax: 0, t0: performance.now() });
  const open = new Map();
  const moved = new Map();
  const said = new Map();
  const nameOf = (c) => (c === o.manager ? 'boss' : (c.name ?? c.data?.displayName ?? `intern ${c.data?.id?.slice(0, 6)}`));
  const r = (c) => 0.3 * (c.rig?.root.scale.y ?? 1);
  const visible = (c) => c.phase !== 'gone' && (c.opacity ?? 1) > 0.3;
  const walking = (c) => c.phase === 'entering' || c.phase === 'leaving' || (c.phase === 'away' && c.step === 'walk');
  const close = (k, ep, now) => {
    open.delete(k);
    const dur = (now - ep.t0) / 1000;
    if (dur > 0.3) W.episodes.push({ pair: k, dur: +dur.toFixed(2), max: +ep.max.toFixed(2), phases: ep.phases, at: ep.at, t: +((ep.t0 - W.t0) / 1000).toFixed(1) });
  };
  const tick = () => {
    const now = performance.now();
    const ppl = [o.manager];
    for (const e of o.director.list()) if (visible(e)) ppl.push(e);
    for (const i of o.director.interns()) if (visible(i)) ppl.push(i);
    for (const g of o.regulars.list()) if (visible(g)) ppl.push(g);
    W.walkersMax = Math.max(W.walkersMax, ppl.filter(walking).length);
    for (let a = 0; a < ppl.length; a++) {
      for (let b = a + 1; b < ppl.length; b++) {
        const A = ppl[a];
        const B = ppl[b];
        const over = r(A) + r(B) - Math.hypot(A.position.x - B.position.x, A.position.z - B.position.z);
        const k = `${nameOf(A)} + ${nameOf(B)}`;
        let ep = open.get(k);
        if (over > 0.1) {
          if (!ep) open.set(k, (ep = { t0: now, max: 0, phases: `${A.phase}${A.step ? '/' + A.step : ''} + ${B.phase}${B.step ? '/' + B.step : ''}`, at: [+A.position.x.toFixed(1), +A.position.z.toFixed(1)] }));
          ep.max = Math.max(ep.max, over);
          W.worstOver = Math.max(W.worstOver, over);
          ep.seen = now;
        } else if (ep) {
          close(k, ep, now);
        }
      }
    }
    // Someone faded out (or left) mid-overlap: that episode is over too.
    for (const [k, ep] of open) if (ep.seen !== now) close(k, ep, now);
    // Still overlapping now: count it if it's already too long.
    W.openLong = [...open.entries()].filter(([, ep]) => now - ep.t0 > 300).map(([k, ep]) => ({ pair: k, dur: +((now - ep.t0) / 1000).toFixed(2), max: +ep.max.toFixed(2), phases: ep.phases, at: ep.at }));
    for (const c of ppl) {
      if (c === o.manager) continue;
      // Ground speed over the last ~0.25 s against the legs' gait.
      let m = moved.get(c);
      if (!m) moved.set(c, (m = { x: c.position.x, z: c.position.z, t: now, ground: 1, since: 0 }));
      if (now - m.t > 250) {
        m.ground = Math.hypot(c.position.x - m.x, c.position.z - m.z) / ((now - m.t) / 1000);
        m.x = c.position.x;
        m.z = c.position.z;
        m.t = now;
      }
      const gait = c.gait ?? c.speed ?? 0;
      if (walking(c) && gait > 0.6 && m.ground < 0.15) {
        if (!m.since) m.since = now;
        if (now - m.since > 1000 && !m.logged) {
          m.logged = true;
          W.inPlace.push({ who: nameOf(c), phase: c.phase, gait: +gait.toFixed(2), at: [+c.position.x.toFixed(1), +c.position.z.toFixed(1)], t: +((now - W.t0) / 1000).toFixed(1) });
        }
      } else {
        m.since = 0;
        m.logged = false;
      }
      // Lines: every new quip (text + start time).
      const q = c.quipText;
      if (q && c.quipUntil > now && said.get(c) !== c.quipUntil) {
        said.set(c, c.quipUntil);
        W.lines.push({ who: nameOf(c), text: q, t: +((now - W.t0) / 1000).toFixed(1) });
      }
    }
    W.frames++;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const SORRY = /sorry|pardon|'scuse|whoops|oops/i;

const result = (page) =>
  page.evaluate(() => {
    const W = window.__crowdWatch;
    const t = (performance.now() - W.t0) / 1000;
    return { seconds: +t.toFixed(1), frames: W.frames, fps: +(W.frames / t).toFixed(1), episodes: [...W.episodes, ...(W.openLong ?? [])], worstOver: +W.worstOver.toFixed(2), inPlace: W.inPlace, lines: W.lines, walkersMax: W.walkersMax };
  });

const brief = (eps) => eps.slice(0, 4).map((e) => `${e.pair} ${e.max * 100 | 0}cm ${e.dur}s [${e.phases}] @${e.at} t=${e.t}`).join(' | ');

/**
 * In the page: `n` seated sessions clock out and `n` newcomers walk in, `delay` seconds later
 * (0: all at once; about 5 s: the two streams meet in the doorway). Resolves when everyone's
 * done (or after `ms`), with times from the first sync.
 */
const JAM = async ([n, ms, delay = 0]) => {
  const o = window.office;
  const sleep = (x) => new Promise((r) => setTimeout(r, x));
  const roster = o.store.employees.map((e) => ({ ...e }));
  const leavers = o.director.list().filter((e) => e.seated).slice(0, n);
  const out = new Set(leavers.map((e) => e.data.sessionId));
  const tpl = roster.find((e) => !out.has(e.sessionId)) ?? roster[0];
  const newcomers = Array.from({ length: n }, (_, i) => ({ ...tpl, sessionId: `crowd-new-${i}`, displayName: `Newbie ${i + 1}`, interns: [], ask: undefined }));
  // Newcomers get desks nobody is at (so nobody waits for a leaver's chair: the timing is the walking).
  const used = new Set(o.director.list().map((e) => e.desk.index));
  const free = o.world.desks.map((_, i) => i).filter((i) => !used.has(i));
  newcomers.forEach((e, i) => free[i] !== undefined && o.director.desks.set(e.sessionId, free[i]));
  // The office's own seconds (on a slow machine they run behind the wall clock).
  const c0 = o.crowd.clock;
  const now = () => o.crowd.clock - c0;
  const w0 = performance.now();
  const stay = roster.filter((e) => !out.has(e.sessionId));
  o.director.sync(delay ? stay : [...stay, ...newcomers]);
  let late = delay > 0;
  const done = new Map();
  while (now() < ms / 1000 && performance.now() - w0 < ms * 6 && done.size < n * 2) {
    if (late && now() >= delay) {
      late = false;
      o.director.sync([...stay, ...newcomers]);
    }
    for (const e of leavers) if (!done.has(e) && (e.phase === 'gone' || !o.director.employees.has(e.data.sessionId))) done.set(e, now());
    for (const s of newcomers) {
      const e = o.director.employees.get(s.sessionId);
      if (e && e.seated && !done.has(e)) done.set(e, now());
    }
    await sleep(100);
  }
  const times = [...done.values()];
  return { leavers: leavers.length, done: done.size, lastOut: +Math.max(0, ...[...done].filter(([e]) => out.has(e.data.sessionId)).map(([, t]) => t)).toFixed(1), lastIn: +Math.max(0, ...[...done].filter(([e]) => !out.has(e.data.sessionId)).map(([, t]) => t)).toFixed(1), last: +Math.max(0, ...times).toFixed(1) };
};

/** In the page: one busy minute of comings and goings (deterministic for a given seed). */
const BUSY = async (seconds) => {
  const o = window.office;
  const sleep = (x) => new Promise((r) => setTimeout(r, x));
  let s = 12345;
  const rand = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const reg = o.regulars;
  // The boss stands just inside the door, in everyone's way.
  o.manager.position.set(0.7, 0, 7.4);
  const base = o.store.employees.map((e) => ({ ...e }));
  let roster = base.map((e) => ({ ...e }));
  const tpl = base[0];
  const internTpl = base.flatMap((e) => e.interns ?? [])[0] ?? { id: 'x', type: 'Explore', description: 'Looking around', active: true };
  let made = 0;
  const newcomer = () => ({ ...tpl, sessionId: `busy-${made}`, displayName: `Visitor ${++made}`, interns: [], ask: undefined });
  const sync = () => o.director.sync(roster);
  const seatedIds = () => o.director.list().filter((e) => e.seated).map((e) => e.data.sessionId);
  const sendHome = (k) => {
    const ids = seatedIds().filter((id) => !roster.find((e) => e.sessionId === id)?.interns?.length).slice(0, k);
    roster = roster.filter((e) => !ids.includes(e.sessionId));
    sync();
  };
  const arrive = (k) => {
    for (let i = 0; i < k; i++) roster.push(newcomer());
    sync();
  };
  const breaks = () => {
    const seated = reg.crew().filter((r) => r.seated && !r.plan && r !== reg.receptionist);
    if (seated.length) reg.startBreak(seated[Math.floor(rand() * seated.length)]);
  };
  // On the office's own clock.
  const c0 = o.crowd.clock;
  const at = async (x) => {
    while (o.crowd.clock - c0 < x) await sleep(50);
  };
  const plan = [
    [0, () => breaks()],
    [1.2, () => breaks()],
    [2, () => sendHome(3)],
    [2.6, () => breaks()],
    [4, () => breaks()],
    [5, () => arrive(3)],
    [12, () => {
      // Interns for someone who's in.
      const host = roster.find((e) => seatedIds().includes(e.sessionId));
      if (host) host.interns = [0, 1, 2].map((i) => ({ ...internTpl, id: `busy-intern-${i}`, active: true }));
      sync();
    }],
    [18, () => sendHome(2)],
    [22, () => arrive(3)],
    [30, () => arrive(2)],
    [38, () => {
      for (const e of roster) if (e.interns?.some((i) => i.id.startsWith('busy-intern'))) e.interns = [];
      sync();
    }],
    [45, () => sendHome(3)],
    [50, () => arrive(2)],
  ];
  for (let x = 6; x < seconds; x += 3) plan.push([x, () => breaks()]);
  plan.sort((a, b) => a[0] - b[0]);
  for (const [x, fn] of plan) {
    if (x > seconds) break;
    await at(x);
    fn();
  }
  await at(seconds);
  return { made, sessions: o.director.list().length, regulars: reg.list().length };
};

/** In the page: let `secs` of the office's own time go by. */
const SIM_WAIT = async (secs) => {
  const o = window.office;
  const c0 = o.crowd.clock;
  while (o.crowd.clock - c0 < secs) await new Promise((r) => setTimeout(r, 50));
};

/** In the page: everyone still on their way somewhere, and for how long. */
const STILL_GOING = () => {
  const o = window.office;
  const going = [];
  for (const c of [...o.director.list(), ...o.director.interns(), ...o.regulars.list()]) {
    const walking = c.phase === 'entering' || c.phase === 'leaving' || (c.phase === 'away' && c.step === 'walk');
    if (walking) going.push({ who: c.name ?? c.data?.displayName ?? c.data?.id, phase: c.phase, at: [+c.position.x.toFixed(1), +c.position.z.toFixed(1)], for: +(c.phaseT ?? 0).toFixed(1) });
  }
  return going;
};

try {
  // ------------------------------------------------------------------ doorway jam: 6 in, 6 out
  if (!ONLY || ONLY.includes('jam')) {
    const runJam = async (crowdOn, delay) => {
      const { page, logs } = await open(`${BASE}/?demo=1&quiet=1&debug=1&seed=11&regulars=off${crowdOn ? '' : '&crowd=0'}`);
      const jam = await page.evaluate(JAM, [6, 45_000, delay]);
      const res = await result(page);
      await page.close();
      return { jam, res, logs };
    };
    for (const [delay, label] of [[0, 'jam (all at once)'], [5, 'jam (meeting in the doorway)']]) {
      const off = await runJam(false, delay);
      const on = await runJam(true, delay);
      const { jam, res } = on;
      check(`${label}: 6 in and 6 out, everyone got where they were going`, jam.done === 12, JSON.stringify(jam));
      check(`${label}: nobody overlapped more than 10 cm for more than 0.3 s`, res.episodes.length === 0, `${res.episodes.length} episodes, worst ${res.worstOver * 100 | 0} cm; ${brief(res.episodes)}`);
      check(`${label}: nobody walked in place`, res.inPlace.length === 0, JSON.stringify(res.inPlace.slice(0, 4)));
      // A dozen people through one door, giving way to the ones going home: about a fifth slower, never stuck.
      const slack = Math.max(off.jam.last * 1.3, off.jam.last + 5);
      check(`${label}: on time (within 30% or 5 s of no avoidance at all)`, jam.done === 12 && jam.last <= slack, `last one done at ${jam.last} s, ${off.jam.last} s with ?crowd=0 (in ${jam.lastIn} / out ${jam.lastOut} vs ${off.jam.lastIn} / ${off.jam.lastOut})`);
      console.log(`      ${label} with ?crowd=0: ${off.res.episodes.length} overlap episodes, worst ${off.res.worstOver * 100 | 0} cm, ${off.res.inPlace.length} walking in place; with the crowd: ${res.episodes.length}, ${res.worstOver * 100 | 0} cm, ${res.inPlace.length}; ${res.fps} fps`);
      check(`${label}: no page errors`, !errors(off.logs).length && !errors(on.logs).length, [...errors(off.logs), ...errors(on.logs)].join(' | '));
    }
  }

  // ------------------------------------------------------------------ a busy minute
  if (!ONLY || ONLY.includes('busy')) {
    const { page, logs } = await open(`${BASE}/?demo=1&quiet=1&debug=1&seed=11&regulars=lively`);
    const busy = await page.evaluate(BUSY, 60);
    // Time for the last arrivals to sit down and the last leavers to get out (regulars go on
    // taking breaks, so someone may always be on the way somewhere: just never for too long).
    await page.evaluate(SIM_WAIT, 15);
    const going = await page.evaluate(STILL_GOING);
    const res = await result(page);
    const sorry = res.lines.filter((l) => SORRY.test(l.text));
    const repeat = sorry.filter((l, i) => sorry.slice(0, i).some((m) => m.who === l.who && l.t - m.t < 12));
    console.log(`      busy minute: ${busy.made} visitors, up to ${res.walkersMax} on their feet at once, ${res.fps} fps; ${sorry.length} sorries, ${res.lines.filter((l) => /after you|go ahead|you first/i.test(l.text)).length} after-yous`);
    check('busy minute: nobody overlapped more than 10 cm for more than 0.3 s', res.episodes.length === 0, `${res.episodes.length} episodes, worst ${res.worstOver * 100 | 0} cm; ${brief(res.episodes)}`);
    check('busy minute: nobody walked in place', res.inPlace.length === 0, JSON.stringify(res.inPlace.slice(0, 4)));
    check('busy minute: nobody is still on their way after 30 s (no one stuck or lost)', !going.some((g) => g.for > 30), JSON.stringify(going.slice(0, 6)));
    check('busy minute: "Sorry!" keeps to its cooldowns (no one twice in 12 s, at most 1 every 2.5 s)', !repeat.length && sorry.every((l, i) => i === 0 || l.t - sorry[i - 1].t >= 2.4), JSON.stringify(sorry.slice(0, 8)));
    check('busy minute: no page errors', !errors(logs).length, errors(logs).join(' | '));
    await page.close();
  }

  // ------------------------------------------------------------------ a brush gets a "Sorry!"
  if (!ONLY || ONLY.includes('brush')) {
    const { page, logs } = await open(`${BASE}/?demo=1&quiet=1&debug=1&seed=11&regulars=lively`);
    const out = await page.evaluate(async () => {
      const o = window.office;
      const sleep = (x) => new Promise((r) => setTimeout(r, x));
      const reg = o.regulars;
      const crowd = o.crowd;
      // Office seconds (a slow machine's frames run behind the wall clock).
      const simSleep = async (secs) => {
        const c0 = crowd.clock;
        while (crowd.clock - c0 < secs) await sleep(30);
      };
      // A regular off on a break, who (as if caught in a jam) is pushing through rather than
      // stepping aside, walks straight into the boss.
      const a = reg.crew().find((r) => r.seated && !r.plan && r !== reg.receptionist);
      if (!a || !crowd) return { error: 'need a seated regular and the crowd' };
      reg.startBreak(a);
      for (let i = 0; i < 300 && !(a.phase === 'away' && a.step === 'walk' && a.groundSpeed > 0.9 && a.path.length); i++) await sleep(50);
      const brush = async () => {
        crowd.memos.get(a).pushUntil = crowd.clock + 3;
        a.quipUntil = 0;
        const p = a.path[0];
        const d = Math.hypot(p.x - a.position.x, p.z - a.position.z) || 1;
        const V = a.position.constructor;
        o.manager.teleport(new V(a.position.x + ((p.x - a.position.x) / d) * 1.1, 0, a.position.z + ((p.z - a.position.z) / d) * 1.1), 0);
        await simSleep(0.9);
      };
      const lines = () => window.__crowdWatch.lines.filter((l) => l.who === a.name && /sorry|pardon|'scuse|whoops|oops/i.test(l.text));
      await brush();
      const first = lines();
      await simSleep(1.2);
      await brush();
      const second = lines().slice(first.length);
      return { who: a.name, first, second };
    });
    check('brush: walking into someone gets a "Sorry!" (to the boss: "…, boss!")', out.first?.length === 1 && /boss/i.test(out.first[0].text), JSON.stringify(out));
    check('brush: and not a second one straight after (cooldown)', out.first?.length === 1 && out.second?.length === 0, JSON.stringify(out.second));
    check('brush: no page errors', !errors(logs).length, errors(logs).join(' | '));
    await page.close();
  }

  // ------------------------------------------------------------------ cost with 20+ people walking
  if (!ONLY || ONLY.includes('cost')) {
    const { page, logs } = await open(`${BASE}/?demo=1&quiet=1&debug=1&seed=11&regulars=off`);
    const cost = await page.evaluate(async () => {
      const o = window.office;
      const sleep = (x) => new Promise((r) => setTimeout(r, x));
      if (!o.crowd) return { error: 'no crowd' };
      o.world.ensureDesks(24);
      await sleep(300);
      // Everyone walks: 14 regulars come in, 6 sessions go home and 6 newcomers arrive.
      for (let i = 0; i < 14; i++) o.regulars.spawn(false);
      const roster = o.store.employees.map((e) => ({ ...e }));
      const leaving = new Set(o.director.list().filter((e) => e.seated).slice(0, 6).map((e) => e.data.sessionId));
      o.director.sync([...roster.filter((e) => !leaving.has(e.sessionId)), ...Array.from({ length: 6 }, (_, i) => ({ ...roster[0], sessionId: `cost-${i}`, displayName: `Cost ${i}`, interns: [], ask: undefined }))]);
      await sleep(2500);
      const walkers = [...o.director.list(), ...o.director.interns(), ...o.regulars.list()].filter((c) => c.phase === 'entering' || c.phase === 'leaving').length;
      const head = o.manager.rig.head.getWorldPosition(o.manager.position.clone());
      let t = 1000;
      const frame = (withCrowd) => {
        t += 1 / 60;
        const c0 = performance.now();
        if (withCrowd) o.crowd.begin(1 / 60, o.manager, o.director.list(), o.director.interns(), o.regulars.list(), o.world.colliders);
        const c1 = performance.now();
        o.director.update(1 / 60, t, o.manager.position, head);
        o.regulars.update(1 / 60, t, o.manager.position, head);
        const c2 = performance.now();
        if (withCrowd) o.crowd.settle();
        const c3 = performance.now();
        return { crowd: c1 - c0 + (c3 - c2), all: c3 - c0 };
      };
      // The crowd's own work (begin + settle) and the steering inside everyone's update.
      const runs = { on: [], off: [], crowd: [] };
      const was = o.crowd.enabled;
      for (let k = 0; k < 5; k++) {
        o.crowd.enabled = true;
        let crowd = 0;
        let all = 0;
        for (let i = 0; i < 60; i++) {
          const f = frame(true);
          crowd += f.crowd;
          all += f.all;
        }
        runs.on.push(all / 60);
        runs.crowd.push(crowd / 60);
        o.crowd.enabled = false;
        all = 0;
        for (let i = 0; i < 60; i++) all += frame(false).all;
        runs.off.push(all / 60);
        await sleep(30);
      }
      o.crowd.enabled = was;
      const med = (a) => +[...a].sort((x, y) => x - y)[Math.floor(a.length / 2)].toFixed(3);
      return { walkers, people: o.director.list().length + o.regulars.list().length + o.director.interns().length, onMs: med(runs.on), offMs: med(runs.off), crowdMs: med(runs.crowd) };
    });
    const extra = cost.onMs - cost.offMs;
    console.log(`      cost: ${cost.walkers} walking, ${cost.people} in the office; update ${cost.offMs} ms without the crowd, ${cost.onMs} ms with it (begin + settle ${cost.crowdMs} ms)`);
    check('cost: 20+ people walking at once', cost.walkers >= 20, JSON.stringify(cost));
    // (0.5 ms on a dev Mac, where the office's own update takes about 0.2 ms; scaled up on a slower machine.)
    const budget = 0.5 * Math.max(1, cost.offMs / 0.2);
    check('cost: the crowd adds under 0.5 ms a frame with 20+ walking', !cost.error && extra < budget, `+${extra.toFixed(3)} ms (budget ${budget.toFixed(2)} ms here)`);
    check('cost: no page errors', !errors(logs).length, errors(logs).join(' | '));
    await page.close();
  }
} finally {
  await browser.close();
}
