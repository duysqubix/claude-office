// Building checks (run by scripts/ui-check.mjs), in the demo office (?demo=1): the building's own
// trims stay where they belong (#135). The skirting, mint band and cornices (the wall-trims mesh)
// are on the inside faces only, never out past the walls; and neither they nor the stone plinth
// outside touch a window frame (the catalog office and clerestory windows) or the door frame:
// no edge of theirs crosses one. A trim that ran on through a window, as the band once did round
// the whole building, fails here.
//   GAME_BASE=http://127.0.0.1:4778 node scripts/ui-check/building.mjs
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const mod = await import(require.resolve('puppeteer-core'));
const puppeteer = mod.default ?? mod;
const BASE = (await import('./base.mjs')).officeBase('GAME_BASE', 'UI_KIT_BASE');
const executablePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find((p) => existsSync(p));

const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const check = (name, ok, detail = '') => console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);

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
  await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForFunction(() => window.office && document.getElementById('splash')?.classList.contains('gone'), { timeout: 60_000 });
  // The catalog windows and door swap in after load.
  await page.waitForFunction(
    () => {
      const names = [];
      window.office.engine.scene.traverse((o) => names.push(o.name));
      return ['model:office_window:merged', 'model:clerestory_window:merged', 'model:sliding_door'].every((n) => names.some((m) => m.endsWith(n)));
    },
    { timeout: 60_000 },
  );
  return { page, logs };
}

/** Runs in the page: where the trims reach past the walls, and which of their edges cross a frame. */
async function measure() {
  const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('/.vite/deps/three.js'));
  const THREE = await import(url);
  const o = window.office;
  const scene = o.engine.scene;
  scene.updateMatrixWorld(true);
  const room = o.world.interior;
  // The trims sink 5 cm into the walls (TRIM_SINK in client/src/world/building.ts), no further.
  const sink = 0.05 + 0.001;
  const named = (o3d) => {
    for (let p = o3d; p; p = p.parent) if (p.name === 'model:sliding_door') return true;
    return false;
  };

  // Every window instance and the door, each as a plain double-sided mesh to raycast against.
  const both = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const frames = [];
  const proxy = (geometry, matrix, label) => {
    const mesh = new THREE.Mesh(geometry, both);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(matrix);
    mesh.matrixWorld.copy(matrix);
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    frames.push({ mesh, box: geometry.boundingBox.clone().applyMatrix4(matrix).expandByScalar(0.001), label });
  };
  scene.traverse((m) => {
    if (!m.isMesh) return;
    const win = /model:(office_window|clerestory_window):merged$/.exec(m.name);
    if (m.isInstancedMesh && win) {
      for (let i = 0; i < m.count; i++) proxy(m.geometry, new THREE.Matrix4().fromArray(m.instanceMatrix.array, i * 16).premultiply(m.matrixWorld), `${win[1]} #${i}`);
    } else if (named(m)) proxy(m.geometry, m.matrixWorld, 'sliding_door');
  });

  const ray = new THREE.Raycaster();
  const outside = [];
  const crossings = new Map();
  let tris = 0;
  const f3 = (v) => v.toArray().map((n) => +n.toFixed(2)).join(',');
  for (const [name, insideOnly] of [['wall-trims', true], ['wall-plinth', false]]) {
    const group = scene.getObjectByName(name);
    group?.traverse((m) => {
      if (!m.isMesh) return;
      const pos = m.geometry.getAttribute('position');
      const idx = m.geometry.index;
      const at = (i) => (idx ? idx.getX(i) : i);
      const world = (vi) => new THREE.Vector3().fromBufferAttribute(pos, vi).applyMatrix4(m.matrixWorld);
      const count = idx ? idx.count : pos.count;
      tris += count / 3;
      if (insideOnly) {
        for (let vi = 0; vi < pos.count; vi++) {
          const p = world(vi);
          if (p.x < room.minX - sink || p.x > room.maxX + sink || p.z < room.minZ - sink || p.z > room.maxZ + sink) outside.push(f3(p));
        }
      }
      const seen = new Set();
      for (let i = 0; i + 2 < count; i += 3) {
        for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
          const ia = at(i + a), ib = at(i + b);
          const key = Math.min(ia, ib) * 4194304 + Math.max(ia, ib);
          if (seen.has(key)) continue;
          seen.add(key);
          const A = world(ia), B = world(ib);
          const span = new THREE.Box3().setFromPoints([A, B]);
          for (const f of frames) {
            if (!f.box.intersectsBox(span)) continue;
            const len = A.distanceTo(B);
            if (len < 1e-6) continue;
            ray.set(A, B.clone().sub(A).divideScalar(len));
            ray.far = len;
            const hit = ray.intersectObject(f.mesh, false)[0];
            if (hit) {
              const k = `${name} × ${f.label}`;
              if (!crossings.has(k)) crossings.set(k, f3(hit.point));
            }
          }
        }
      }
    });
  }
  both.dispose();
  return {
    tris,
    windows: frames.filter((f) => f.label !== 'sliding_door').length,
    door: frames.some((f) => f.label === 'sliding_door'),
    outside: [...new Set(outside)],
    crossings: [...crossings.entries()].map(([k, p]) => `${k} at ${p}`),
  };
}

try {
  const { page, logs } = await open(`${BASE}/?demo=1&quiet=1&debug=1&regulars=off`);
  const r = await page.evaluate(measure);
  check('the skirting, band and cornices are a mesh of their own (wall-trims)', r.tris > 0, `${r.tris} triangles`);
  check('the catalog windows and the door are in to check against', r.windows >= 20 && r.door, `${r.windows} window instances, door ${r.door}`);
  check('the wall trims stay on the inside faces (no further out than sunk into the walls)', !r.outside.length, `${r.outside.length} points outside, e.g. ${r.outside.slice(0, 3).join(' | ')}`);
  check('no wall trim or plinth edge crosses a window frame or the door frame', !r.crossings.length, r.crossings.slice(0, 4).join('; '));
  check('no page errors', !logs.length, logs.join(' | '));
  await page.close();
} catch (err) {
  check('building checks ran to the end', false, err instanceof Error ? err.stack?.split('\n').slice(0, 3).join(' / ') : String(err));
} finally {
  await browser.close();
}
