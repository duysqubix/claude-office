// Yard checks (run by scripts/ui-check.mjs), in the demo office (?demo=1): people on their
// break out in the garden (#48).
// - how many: about 10 lively, 5 some, none off (and Off sends them out by the gate), two or
//   three night owls after 9 pm, only at the lit spots;
// - every seat, stand and point of the trail can be walked to from the gate and the door;
// - never staff: not in the roster, the store or the HUD, never at an office desk;
// - E has a word from them; a regular sometimes takes their coffee outside and goes back in;
// - a busy yard: nobody overlaps, nobody walks in place, nobody stuck, and home by the gate;
// - cost: from the office the yard crowd is all but free (out of view, out of the scene);
//   with all of them in view, within 1.5 ms a frame of an empty yard (both scaled to the machine).
// Waits are on the office's own clock (on a slow machine it runs behind the wall clock);
// CPU_THROTTLE=4 runs every page on a 4× slower CPU, like a small CI runner.
//   GAME_BASE=http://127.0.0.1:4778 node scripts/ui-check/yard.mjs
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const mod = await import(require.resolve('puppeteer-core'));
const puppeteer = mod.default ?? mod;
const BASE = process.env.GAME_BASE ?? process.env.UI_KIT_BASE ?? 'http://127.0.0.1:4777';
const executablePath = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
]
  .filter(Boolean)
  .find((p) => existsSync(p));
const ONLY = process.env.YARD_ONLY ?? '';
const THROTTLE = Number(process.env.CPU_THROTTLE ?? 0);

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const check = (name, ok, detail = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = (logs) => logs.filter((l) => l.startsWith('[pageerror]'));

/** A demo page that never reports presence, never hot-reloads and never POSTs. */
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
    window.WebSocket = new Proxy(WebSocket, {
      construct(target, args) {
        const p = args[1];
        if (p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr')))
          return {
            addEventListener() {},
            removeEventListener() {},
            send() {},
            close() {},
            readyState: 0,
          };
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
  const yard = await page.evaluate(() => !!window.office.world.yard);
  await wait(1500);
  return { page, logs, yard };
}

/** In the page: who's out in the yard and what they're up to. */
const YARD = () => {
  const o = window.office;
  const y = o.regulars.yard;
  return {
    want: y.want,
    night: y.night,
    visitors: o.regulars.visitors().map((v) => ({
      name: v.name,
      phase: v.phase,
      kind: v.activity?.kind ?? null,
      lit: v.activity?.kind === 'seat' ? !!v.activity.seat.lit : v.activity?.kind === 'stand' ? !!v.activity.stand.lit : null,
      desk: v.desk.index,
      at: [+v.position.x.toFixed(1), +v.position.z.toFixed(1)],
    })),
    crew: o.regulars.crew().length,
  };
};

try {
  // ------------------------------------------------------------------ lively, by day: one office for most of it
  if (!ONLY || /count|nav|chat|busy/.test(ONLY)) {
    const { page, logs, yard } = await open(`${BASE}/?demo=1&quiet=1&debug=1&seed=11&regulars=lively&hour=14`);
    check('the world has a yard (world.yard)', yard);
    await wait(2500);
    const y = await page.evaluate(YARD);
    check(
      'lively by day: about 10 in the yard (target 10, 7 already out there)',
      y.want === 10 && y.visitors.length >= 6 && y.visitors.length <= 10,
      JSON.stringify({ want: y.want, here: y.visitors.length }),
    );
    check(
      'they never sit at an office desk (seats are their own)',
      y.visitors.every((v) => v.desk < 0),
      JSON.stringify(y.visitors.filter((v) => v.desk >= 0)),
    );
    const staff = await page.evaluate(() => {
      const o = window.office;
      const names = new Set(o.regulars.visitors().map((v) => v.name));
      return {
        roster: o.director.list().filter((e) => names.has(e.data.displayName)).length,
        store: o.store.employees.filter((e) => names.has(e.displayName)).length,
        hud: document.querySelector('.co-hud')?.textContent?.includes([...names][0] ?? '###') ?? false,
      };
    });
    check('never staff: not in the roster, the store or the HUD', !staff.roster && !staff.store && !staff.hud, JSON.stringify(staff));

    // Every spot can be walked to.
    const nav = await page.evaluate(() => {
      const o = window.office;
      const w = o.world;
      const gate = o.regulars.yard.gate;
      const door = w.entrance.outside.clone().setY(0);
      const reach = (from, p) => {
        const path = w.findPath(from.clone().setY(0), p.clone().setY(0));
        return !!path && path.length > 0 && path[path.length - 1].distanceTo(p.clone().setY(0)) < 0.4;
      };
      const y = w.yard;
      const points = [...y.trail.map((p, i) => [`trail ${i}`, p]), ...y.seats.map((s, i) => [`seat ${i} (${s.kind})`, s.approach]), ...y.stands.map((s, i) => [`stand ${i}`, s.position])];
      const bad = points.filter(([, p]) => !gate || !reach(gate, p) || !reach(door, p)).map(([n]) => n);
      return { gate: !!gate, points: points.length, bad };
    });
    check('the gate is there', nav.gate);
    check('every trail point, seat and stand can be walked to from the gate and from the door', nav.gate && !nav.bad.length, `${nav.points} spots; unreachable: ${nav.bad.slice(0, 6).join(', ')}`);

    // E, and a coffee outside.
    const e = await page.evaluate(async () => {
      const o = window.office;
      const sleep = (x) => new Promise((r) => setTimeout(r, x));
      const v = o.regulars.visitors().find((x) => x.settled) ?? o.regulars.visitors()[0];
      if (!v) return { error: 'nobody out there' };
      const posts = [];
      const fetch0 = window.fetch;
      window.fetch = (...a) => (posts.push(String(a[0])), fetch0(...a));
      o.regulars.chat(v);
      await sleep(200);
      window.fetch = fetch0;
      return {
        name: v.name,
        said: v.quipping ? v.quipText : '',
        panel: o.panels.openId ?? null,
        posts: posts.filter((u) => u.includes('/api/')),
      };
    });
    check('E near someone in the yard: a line from them, no panel, nothing sent', !!e.said && !e.panel && !e.posts?.length, JSON.stringify(e));
    const out = await page.evaluate(async () => {
      const o = window.office;
      const reg = o.regulars;
      const sleep = (x) => new Promise((r) => setTimeout(r, x));
      // A regular at their desk takes their coffee outside (the crew does it about 3 times in 10).
      const r = reg.crew().find((c) => c.seated && !c.plan && c !== reg.receptionist);
      if (!r) return { error: 'no seated regular' };
      const rand = reg.rand;
      reg.rand = () => 0.01;
      const started = reg.startBreak(r);
      reg.rand = rand;
      const stand = r.hangSpot;
      const outside = !!stand && reg.yard.stands.includes(stand);
      let wasOut = false;
      const c0 = reg.clock;
      while (!(wasOut && r.seated) && reg.clock - c0 < 150) {
        if (r.hanging) wasOut = true;
        await sleep(250);
      }
      return { name: r.name, started, outside, wasOut, back: r.seated };
    });
    check('a regular sometimes takes their coffee outside to a yard stand', out.started && out.outside && out.wasOut, JSON.stringify(out));
    check('…and goes back in to their desk after', out.back, JSON.stringify(out));

    // A busy yard.
    const busy = await page.evaluate(async () => {
      const o = window.office;
      const sleep = (x) => new Promise((r) => setTimeout(r, x));
      // The boss walks the trail too (teleported along it, so there's someone to step round).
      const trail = o.world.yard.trail;
      const W = { over: [], inPlace: [], worst: 0, pairs: new Set() };
      const open = new Map();
      const moved = new Map();
      const r = (c) => 0.3 * (c.rig?.root.scale.y ?? 1);
      let k = 0;
      const t0 = performance.now();
      const tick = () => {
        const now = performance.now();
        const ppl = [o.manager, ...o.regulars.visitors().filter((v) => v.phase !== 'gone' && v.opacity > 0.3)];
        for (let a = 0; a < ppl.length; a++)
          for (let b = a + 1; b < ppl.length; b++) {
            const A = ppl[a];
            const B = ppl[b];
            // Two people on one blanket or bench sit closer than walkers pass: only count anyone on their feet.
            if (A.atDesk && B.atDesk) continue;
            const over = r(A) + r(B) - Math.hypot(A.position.x - B.position.x, A.position.z - B.position.z);
            const key = `${A.name ?? 'boss'} + ${B.name}`;
            if (over > 0.1) {
              if (!open.has(key)) open.set(key, now);
              W.worst = Math.max(W.worst, over);
              if (now - open.get(key) > 300 && !W.over.includes(key)) W.over.push(key);
            } else open.delete(key);
          }
        for (const v of o.regulars.visitors()) {
          if (v.buddy && v.talking && v.quipping) W.pairs.add([v.name, v.buddy.name].sort().join(' & '));
          let m = moved.get(v);
          if (!m)
            moved.set(
              v,
              (m = {
                x: v.position.x,
                z: v.position.z,
                t: now,
                ground: 1,
                since: 0,
              }),
            );
          if (now - m.t > 250) {
            m.ground = Math.hypot(v.position.x - m.x, v.position.z - m.z) / ((now - m.t) / 1000);
            m.x = v.position.x;
            m.z = v.position.z;
            m.t = now;
          }
          if ((v.phase === 'entering' || v.awayWalking) && v.gait > 0.6 && m.ground < 0.15) {
            m.since ||= now;
            if (now - m.since > 1000 && !W.inPlace.includes(v.name)) W.inPlace.push(v.name);
          } else m.since = 0;
        }
        if (now - t0 < 400_000 && !W.stop) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      const c0 = o.regulars.clock;
      for (let s = 0; s < 40; s++) {
        if (s % 4 === 0 && trail.length) o.manager.teleport(trail[(k += 5) % trail.length].clone(), 0);
        // Keep things moving: anyone sitting a while gets up for something else.
        if (s % 5 === 0) for (const v of o.regulars.visitors()) if (v.settled && Math.random() < 0.4) v.done = true;
        while (o.regulars.clock - c0 < s + 1) await sleep(50);
      }
      W.stop = true;
      const long = o.regulars
        .visitors()
        .filter((v) => (v.phase === 'entering' || v.awayWalking || v.phase === 'leaving') && v.phaseT > 40)
        .map((v) => [v.name, v.phase, v.phaseT.toFixed(0)]);
      return {
        over: W.over,
        worst: +W.worst.toFixed(2),
        inPlace: W.inPlace,
        long,
        here: o.regulars.visitors().length,
        chats: [...W.pairs],
      };
    });
    check('busy yard: nobody overlaps more than 10 cm for more than 0.3 s', !busy.over.length, `${busy.over.slice(0, 4).join(' | ')} worst ${(busy.worst * 100) | 0} cm`);
    check('busy yard: nobody walks in place', !busy.inPlace.length, busy.inPlace.join(', '));
    check('busy yard: nobody stuck on their way somewhere (40 s+)', !busy.long.length, JSON.stringify(busy.long));
    check('busy yard: neighbours get chatting (side by side, at a table, on the move)', busy.chats.length > 0, busy.chats.slice(0, 4).join(', '));

    // Off: everyone heads out by the gate.
    const off = await page.evaluate(async () => {
      const o = window.office;
      const sleep = (x) => new Promise((r) => setTimeout(r, x));
      const gate = o.regulars.yard.gate;
      o.regulars.setDensity('off');
      const ends = new Map();
      const c0 = o.regulars.clock;
      while (o.regulars.visitors().length && o.regulars.clock - c0 < 60) {
        for (const v of o.regulars.visitors()) if (v.phase === 'leaving' && v.path.length) ends.set(v.name, v.path[v.path.length - 1].distanceTo(gate));
        await sleep(250);
      }
      return {
        left: o.regulars.visitors().length,
        viaGate: [...ends.values()].every((d) => d < 1.5),
        checked: ends.size,
      };
    });
    check('Off: they all go home, out by the gate', off.left === 0 && off.viaGate && off.checked > 0, JSON.stringify(off));
    check('lively: no page errors', !errors(logs).length, errors(logs).join(' | '));
    await page.close();
  }

  // ------------------------------------------------------------------ some, and the night owls
  if (!ONLY || ONLY.includes('count')) {
    const some = await open(`${BASE}/?demo=1&quiet=1&debug=1&seed=11&regulars=some&hour=14`);
    await wait(2500);
    const ys = await some.page.evaluate(YARD);
    check(
      'some by day: about 5 in the yard (target 5, 4 already out there)',
      ys.want === 5 && ys.visitors.length >= 3 && ys.visitors.length <= 5,
      JSON.stringify({ want: ys.want, here: ys.visitors.length }),
    );
    check('some: no page errors', !errors(some.logs).length, errors(some.logs).join(' | '));
    await some.page.close();
    const night = await open(`${BASE}/?demo=1&quiet=1&debug=1&seed=11&regulars=lively&hour=22`);
    await wait(4000);
    const yn = await night.page.evaluate(YARD);
    check('after 9 pm: two or three night owls, at most', yn.night && yn.want <= 3 && yn.visitors.length <= 3 && yn.visitors.length >= 1, JSON.stringify({ want: yn.want, here: yn.visitors.length }));
    check(
      'night owls stay under the lights (lit seats and stands only, no strolls)',
      yn.visitors.every((v) => v.lit === true),
      JSON.stringify(yn.visitors),
    );
    check('night: no page errors', !errors(night.logs).length, errors(night.logs).join(' | '));
    await night.page.close();
  }

  // ------------------------------------------------------------------ cost
  if (!ONLY || ONLY.includes('cost')) {
    const { page, logs } = await open(`${BASE}/?demo=1&quiet=1&debug=1&seed=11&regulars=lively&hour=14`);
    await wait(3000);
    const cost = await page.evaluate(async () => {
      const o = window.office;
      const e = o.engine;
      const gl = e.renderer.getContext();
      const px = new Uint8Array(4);
      const sleep = (x) => new Promise((r) => setTimeout(r, x));
      const head = o.manager.rig.head.getWorldPosition(o.manager.position.clone());
      // Everyone the yard wants, right now (the rest would trickle in).
      const y = o.regulars.yard;
      for (let i = 0; i < 10 && o.regulars.visitors().length < y.want; i++) y.spawn(true);
      await sleep(800);
      let t = 1000;
      const frame = () => {
        t += 1 / 60;
        o.crowd.begin(1 / 60, o.manager, o.director.list(), o.director.interns(), o.regulars.list(), o.world.colliders);
        o.director.update(1 / 60, t, o.manager.position, head);
        o.regulars.update(1 / 60, t, o.manager.position, head);
        o.crowd.settle();
        o.world.update(1 / 60, t);
        e.render();
      };
      const run = (n) => {
        e.render();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const t0 = performance.now();
        for (let i = 0; i < n; i++) frame();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        return (performance.now() - t0) / n;
      };
      const med = (a) => [...a].sort((p, q) => p - q)[Math.floor(a.length / 2)];
      const V = o.manager.position.constructor;
      const vis = o.regulars.visitors();
      const scene = o.engine.scene;
      // Two views: the usual one from the office floor (the yard mostly out of sight), and one up
      // over the yard with all of them in view. With and without the crowd, taking turns (the
      // machine's speed drifts over a run, so one after the other would mislead).
      const views = {
        office: { position: new V(0, 3.6, 9.6), look: new V(0, 0.2, -3.5) },
        yard: { position: new V(0, 14, 34), look: new V(0, 0, 19) },
      };
      const out = { here: vis.length };
      for (const [name, shot] of Object.entries(views)) {
        o.camera.snapShot(shot);
        o.camera.update(0, o.manager.position, 0);
        const on = [];
        const off = [];
        for (let k = 0; k < 7; k++) {
          on.push(run(24));
          const saved = y.visits;
          y.visits = [];
          for (const v of vis) scene.remove(v.rig.root);
          off.push(run(24));
          for (const v of vis) scene.add(v.rig.root);
          y.visits = saved;
        }
        out[name] = +med(on).toFixed(2);
        out[name + 'Empty'] = +med(off).toFixed(2);
      }
      return out;
    });
    console.log(`      cost: ${cost.here} in the yard; from the office ${cost.office} ms a frame (${cost.officeEmpty} without them), over the yard ${cost.yard} ms (${cost.yardEmpty} without them)`);
    // (0.5 ms and 1 ms on a dev Mac, whose frames here take about 5 ms; scaled up on a slower machine.)
    const scale = Math.max(1, cost.officeEmpty / 5);
    check(
      'cost: from the office, the yard crowd costs under 0.5 ms a frame',
      cost.here >= 8 && cost.office - cost.officeEmpty < 0.5 * scale,
      `+${(cost.office - cost.officeEmpty).toFixed(2)} ms with ${cost.here} (budget ${(0.5 * scale).toFixed(2)} ms here)`,
    );
    // All ten in view: 1 ms was #48's guide; the call is ten as long as 60 fps holds, so 1.5 ms.
    check(
      'cost: looking over the yard at all of them, within 1.5 ms a frame of an empty yard',
      cost.here >= 8 && cost.yard - cost.yardEmpty < 1.5 * scale,
      `+${(cost.yard - cost.yardEmpty).toFixed(2)} ms with ${cost.here} (budget ${(1.5 * scale).toFixed(2)} ms here)`,
    );
    check('cost: no page errors', !errors(logs).length, errors(logs).join(' | '));
    await page.close();
  }
} finally {
  await browser.close();
}
