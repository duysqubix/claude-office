// Camera checks (run by scripts/ui-check.mjs), in the demo office (?demo=1): walking or running
// through the front door, in and out, the third-person camera glides through after the manager:
// it never drops onto him (stays a couple of metres back, never down at doormat height), he
// never dissolves, and once he's well past the door it's on his side of the wall again.
//   GAME_BASE=http://127.0.0.1:4778 node scripts/ui-check/camera.mjs
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

try {
  for (const [label, at, yaw, run] of [
    ['walking out', '0,5', 180, false],
    ['running out', '0,5', 180, true],
    ['walking in', '0,15', 0, false],
    ['running in', '0,15', 0, true],
  ]) {
    const { page, logs } = await open(`${BASE}/?demo=1&quiet=1&debug=1&regulars=off&at=${at}&yaw=${yaw}`);
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
