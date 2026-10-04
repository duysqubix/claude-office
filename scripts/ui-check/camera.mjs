// Camera checks (run by scripts/ui-check.mjs), in the demo office (?demo=1): walking or running
// through the front door, in and out, the third-person camera glides through after the manager:
// it never drops onto him (stays a couple of metres back, never down at doormat height), he
// never dissolves, and once he's well past the door it's on his side of the wall again. And in
// first person, taking over an auto-walk with a key never spins the view (it stays yours), and
// your body never flashes up: not on V from a camera crowded into him, not turning by a wall.
//   GAME_BASE=http://127.0.0.1:4778 node scripts/ui-check/camera.mjs
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
/** CPU_THROTTLE=4 runs every page on a 4× slower CPU (like a small CI runner). */
const THROTTLE = Number(process.env.CPU_THROTTLE ?? 0);

/** A demo page that never reports presence, never hot-reloads and never POSTs. */
async function open(url) {
  if (!url.includes('demo=1')) throw new Error('demo pages only');
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const logs = [];
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
    if (req.method() !== 'GET' && req.method() !== 'HEAD' && req.url().includes('/api/')) return void req.abort();
    void req.continue();
  });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 });
  await page.waitForFunction(() => window.office && document.getElementById('splash')?.classList.contains('gone'), { timeout: 30_000 });
  // Once it's loaded (a throttled page never goes network-idle).
  if (THROTTLE > 1) await (await page.target().createCDPSession()).send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  await wait(1500);
  return { page, logs };
}

/** Hold W (and Shift to run) for `ms`, sampling the camera every animation frame. */
async function cross(page, ms, run) {
  await page.evaluate(() => {
    const o = window.office;
    const W = (window.__cam = { samples: [], go: true });
    const tick = () => {
      if (!W.go) return;
      const c = o.engine.camera.position;
      const m = o.manager.position;
      W.samples.push({ dist: o.camera.distance, y: c.y, shown: o.manager.rig.root.visible, camIn: o.world.isInside?.(c) ?? null, manIn: o.world.isInside?.(m.clone().setY(1)) ?? null, z: m.z });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  if (run) await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  await wait(ms);
  await page.keyboard.up('KeyW');
  if (run) await page.keyboard.up('ShiftLeft');
  await wait(600);
  return page.evaluate(() => {
    window.__cam.go = false;
    const s = window.__cam.samples;
    const crossed = s.some((x) => x.manIn === true) && s.some((x) => x.manIn === false);
    const end = s[s.length - 1];
    return {
      frames: s.length,
      crossed,
      minDist: +Math.min(...s.map((x) => x.dist)).toFixed(2),
      minY: +Math.min(...s.map((x) => x.y)).toFixed(2),
      hidden: s.filter((x) => !x.shown).length,
      endSameSide: end.camIn === end.manIn,
      endZ: +end.z.toFixed(1),
    };
  });
}

/**
 * First person: how far the view turns (summed every frame, so a full spin counts) while `key`
 * is held for 1 s, straight away or after starting an auto-walk across the office.
 */
async function turnWhileHeld(page, key, afterWalk) {
  await page.evaluate((afterWalk) => {
    const o = window.office;
    o.panels.close();
    o.manager.cancelWalk();
    o.manager.teleport(window.__start.clone(), 0);
    o.camera.yaw = Math.PI;
    if (afterWalk) {
      const far = o.director.list().filter((e) => e.seated).sort((a, b) => b.position.distanceTo(o.manager.position) - a.position.distanceTo(o.manager.position))[0];
      o.panels.deps.actions.walkTo(far.data.sessionId);
    }
  }, afterWalk);
  await wait(afterWalk ? 600 : 300);
  await page.evaluate(() => {
    const c = window.office.camera;
    const W = (window.__turn = { total: 0, last: c.yaw, go: true });
    const tick = () => {
      if (!W.go) return;
      let d = (c.yaw - W.last) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      W.total += Math.abs(d);
      W.last = c.yaw;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.keyboard.down(key);
  await wait(1000);
  await page.keyboard.up(key);
  await wait(400);
  return page.evaluate(() => {
    window.__turn.go = false;
    return Math.round((window.__turn.total * 180) / Math.PI);
  });
}

/**
 * Back to a wall with the camera swung into it (it crowds in and he dissolves), then V, then in
 * first person the view swung from the wall to the room and back (the camera behind you crowds
 * in and clears). Counts the frames that draw his body on the way in and in first person.
 */
async function bodyIntoFirstPerson(page) {
  await page.evaluate(async () => {
    const o = window.office;
    const p = o.manager.position.clone();
    let x = 0;
    while (x < 40 && o.world.isInside(p.set(x, 1, 0))) x += 0.05;
    o.manager.teleport(p.set(x - 0.35, 0, 0), -Math.PI / 2);
    o.camera.yaw = -Math.PI / 2;
    await new Promise((r) => setTimeout(r, 1500));
    const W = (window.__body = { s: [], go: true, phase: 'in' });
    const tick = () => {
      if (!W.go) return;
      W.s.push({ phase: W.phase, fp: o.camera.firstPerson, shown: o.manager.rig.root.visible, dist: o.camera.distance });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const crowded = await page.evaluate(async () => {
    const o = window.office;
    o.camera.yaw = Math.PI / 2;
    const t0 = performance.now();
    while (performance.now() - t0 < 1500) {
      await new Promise((r) => requestAnimationFrame(r));
      if (o.camera.distance < 1.05 && !o.manager.rig.root.visible) return true;
    }
    return false;
  });
  await page.keyboard.press('KeyV');
  await wait(900);
  await page.evaluate(async () => {
    const o = window.office;
    window.__body.phase = 'turn';
    const t0 = performance.now();
    await new Promise((done) => {
      const swing = () => {
        const t = (performance.now() - t0) / 3000;
        if (t >= 1) return done();
        o.camera.yaw = Math.PI / 2 - Math.PI * Math.sin(Math.PI * t);
        requestAnimationFrame(swing);
      };
      requestAnimationFrame(swing);
    });
  });
  return page.evaluate((crowded) => {
    window.__body.go = false;
    const s = window.__body.s;
    const turn = s.filter((x) => x.phase === 'turn');
    return {
      crowded,
      goingIn: s.filter((x) => x.phase === 'in' && x.fp > 0 && x.fp < 0.5 && x.shown).length,
      inFirst: s.filter((x) => x.phase === 'in' && x.fp >= 0.5 && x.shown).length,
      turning: turn.filter((x) => x.fp >= 0.5 && x.shown).length,
      turnDist: [Math.min(...turn.map((x) => x.dist)), Math.max(...turn.map((x) => x.dist))].map((d) => +d.toFixed(2)),
    };
  }, crowded);
}

try {
  {
    const { page, logs } = await open(`${BASE}/?demo=1&quiet=1&debug=1&regulars=off&view=third`);
    await page.mouse.move(640, 400);
    const r = await bodyIntoFirstPerson(page);
    check('V from a camera crowded into him: he never shows on the way into first person', r.crowded && r.goingIn === 0 && r.inFirst === 0, JSON.stringify(r));
    check('first person by a wall: turning (the camera behind you crowds in and clears) never draws him', r.turnDist[0] < 1.05 && r.turnDist[1] > 1.25 && r.turning === 0, JSON.stringify(r));
    check('no page errors (body in first person)', !logs.length, logs.join(' | '));
    await page.close();
  }
  {
    const { page, logs } = await open(`${BASE}/?demo=1&quiet=1&debug=1&regulars=off&view=first`);
    await page.evaluate(() => (window.__start = window.office.manager.position.clone()));
    await page.mouse.move(640, 400);
    for (const key of ['KeyD', 'KeyS']) {
      const plain = await turnWhileHeld(page, key, false);
      const takeover = await turnWhileHeld(page, key, true);
      check(`first person: ${key.slice(3)} mid auto-walk turns the view no more than ${key.slice(3)} alone (no spin)`, takeover <= plain + 20, `${takeover}° vs ${plain}°`);
    }
    check('no page errors (first-person takeover)', !logs.length, logs.join(' | '));
    await page.close();
  }
  for (const [label, at, yaw, run] of [
    ['walking out', '0,5', 180, false],
    ['running out', '0,5', 180, true],
    ['walking in', '0,15', 0, false],
    ['running in', '0,15', 0, true],
  ]) {
    const { page, logs } = await open(`${BASE}/?demo=1&quiet=1&debug=1&regulars=off&view=third&at=${at}&yaw=${yaw}`);
    await page.mouse.move(640, 400);
    const r = await cross(page, run ? 3200 : 4600, run);
    check(`${label} through the front door: the camera glides after him, never down onto him`, r.crossed && r.minDist >= 1.6 && r.minY >= 1.4 && r.hidden === 0, JSON.stringify(r));
    check(`${label}: once he's well past the door, the camera is on his side of the wall`, r.endSameSide, JSON.stringify({ endZ: r.endZ, endSameSide: r.endSameSide }));
    check(`no page errors (${label})`, !logs.length, logs.join(' | '));
    await page.close();
  }
} catch (err) {
  check('camera checks ran to the end', false, err instanceof Error ? err.stack?.split('\n').slice(0, 3).join(' / ') : String(err));
} finally {
  await browser.close();
}
