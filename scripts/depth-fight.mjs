// Depth-fight meter: which catalog models shimmer as the camera moves. For every pair of
// same-facing surfaces in a model closer than 4 mm (a decal on its panel, a rail flush with a
// post), it draws just those two, behind everything else in the office as occluders, through
// the game's own camera and 24-bit depth buffer: from 2 to 22 m away, at three angles and three
// eye heights, a few cm apart, in both draw orders. It reports the share of the front surface
// the back one wins; 0% means no shimmer. One instance of each model is measured, with its
// animated parts held still in their time-0 pose.
//   npm run depth-fight -- <model id|all> [url] [--quick] [--json]
// url defaults to the dev office on :4778 (dev builds expose the scene with debug=1); --quick
// uses fewer viewpoints (the default for `all`). Never reports presence. Prints; writes nothing.
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const [target, base = 'http://127.0.0.1:4778'] = args.filter((a) => !a.startsWith('--'));
if (!target) {
  console.error('usage: npm run depth-fight -- <model id|all> [url] [--quick] [--json]');
  process.exit(1);
}
const url = new URL(base);
// :4777 is the user's own game: never point a scripted browser at it.
if (url.port === '4777') {
  console.error('depth-fight: refusing :4777 (the user\'s game); use the dev office on :4778');
  process.exit(1);
}
for (const [k, v] of Object.entries({ demo: '1', debug: '1', regulars: 'off', quiet: '1' })) url.searchParams.set(k, v);

const quick = flags.has('--quick') || target === 'all';
const plan = quick
  ? { dists: [3, 10, 18], angles: [0, 45], steps: 3, stepLen: 0.05 }
  : { dists: [2, 4, 7, 10, 14, 18, 22], angles: [0, 30, 55], steps: 6, stepLen: 0.04 };
/** Surfaces closer than this (m) are measured; overlaps under MIN_AREA (m²) are bevel slivers. */
const TOL = 0.004;
const MIN_AREA = 1e-4;
/** A pair shimmers when the back surface wins more than this share of the front one somewhere. */
const FIGHT = 0.02;

const executablePath = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!executablePath) {
  console.error('No Chrome found. Set CHROME_PATH.');
  process.exit(1);
}

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  protocolTimeout: 3_600_000,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1280,800'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  // Never report presence: a headless tab must not make the office hold real sessions'
  // permission prompts for an in-game answer nobody will give.
  await page.evaluateOnNewDocument(() => {
    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (d) {
      if (typeof d === 'string' && d.includes('"presence"')) return;
      return send.call(this, d);
    };
  });
  await page.goto(url.href, { waitUntil: 'networkidle2', timeout: 30000 });
  // Catalog models swap in after load: wait until no new ones arrive for 3 s.
  let last = -1;
  for (let still = 0, t = 0; still < 3 && t < 40; t++) {
    await new Promise((r) => setTimeout(r, 1000));
    const n = await page.evaluate(() => {
      let c = 0;
      window.office?.engine.scene.traverse((o) => (c += /^model:|:merged$/.test(o.name) ? 1 : 0));
      return window.office ? c : -1;
    });
    still = n === last && n > 0 ? still + 1 : 0;
    last = n;
  }
  if (last < 0) throw new Error('window.office is missing: run against a dev build (debug=1)');
  // Hold animated parts (a waving flag, a swinging hammock, a dog's tail) still in their time-0
  // pose while measuring: caught mid-motion, they'd give different pairs on every run.
  await page.evaluate(() => {
    const { world } = window.office;
    world.update(0, 0);
    world.update = () => {};
  });

  const ids =
    target === 'all'
      ? await page.evaluate(() => {
          const found = new Set();
          window.office.engine.scene.traverse((o) => {
            const m = /^model:([a-z0-9_]+)$/.exec(o.name) ?? (o.isInstancedMesh ? /model:([a-z0-9_]+):merged$/.exec(o.name) : null);
            if (m) found.add(m[1]);
          });
          return [...found].sort();
        })
      : [target];

  const results = [];
  for (const id of ids) {
    const r = await page.evaluate(measure, { id, plan, tol: TOL, minArea: MIN_AREA }).catch((err) => ({ id, groups: [], error: `failed: ${err.message}` }));
    results.push(r);
    if (!flags.has('--json')) report(r);
  }
  if (flags.has('--json')) console.log(JSON.stringify(results, null, 1));
  else if (ids.length > 1) {
    const bad = results.filter((r) => r.groups.some((g) => g.worst > FIGHT));
    console.log(`\n${results.length} models, ${bad.length} shimmer${bad.length ? ': ' + bad.map((r) => r.id).join(', ') : ''}`);
  }
} finally {
  await browser.close();
}

function report(r) {
  if (r.error) return console.log(`${r.id.padEnd(22)} ${r.error}`);
  const seen = r.groups.filter((g) => g.worst !== null);
  const bad = seen.filter((g) => g.worst > FIGHT);
  const byD = new Map();
  for (const g of seen) for (const [d, f] of Object.entries(g.byDist)) byD.set(+d, Math.max(byD.get(+d) ?? 0, f));
  const dists = [...byD.entries()].sort((a, b) => a[0] - b[0]).map(([d, f]) => `${d} m ${(f * 100).toFixed(1)}%`).join(' · ');
  const hidden = r.groups.length - seen.length;
  console.log(
    `${r.id.padEnd(22)} ${bad.length ? 'SHIMMERS' : 'clean   '} ${seen.length} close pair${seen.length === 1 ? '' : 's'} in view` +
      (hidden ? `, ${hidden} hidden` : '') +
      (dists ? `; worst by distance: ${dists}` : ''),
  );
  for (const g of bad) {
    const where = Object.entries(g.byDist).filter(([, f]) => f > FIGHT).map(([d]) => d).join(', ');
    console.log(
      `   ${g.gapMm} mm apart, ${g.areaCm2} cm² overlap: back wins up to ${(g.worst * 100).toFixed(0)}% at ${where} m` +
        `  (${g.front} over ${g.back}, at ${g.centre.join(', ')})`,
    );
  }
}

/** Runs in the page: find the close layer pairs of one model instance and measure each. */
async function measure({ id, plan, tol, minArea }) {
  const office = window.office;
  const { scene, renderer } = office.engine;
  const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('/.vite/deps/three.js'));
  const THREE = await import(url);
  scene.updateMatrixWorld(true);
  const shown = (o) => {
    for (let p = o; p; p = p.parent) if (!p.visible) return false;
    return true;
  };
  const short = (o) => o.name.replace(/^model:/, '').replace(new RegExp(`^${id}:`), '') || o.type;

  // One instance: the first visible model:<id> root, or instance 0 of an instanced model.
  let root = null;
  scene.traverse((o) => {
    if (!root && o.name === `model:${id}` && shown(o)) root = o;
  });
  const parts = [];
  if (root) root.traverse((o) => o.isMesh && !o.isSkinnedMesh && shown(o) && parts.push({ mesh: o, inst: -1 }));
  else scene.traverse((o) => o.isInstancedMesh && o.count > 0 && shown(o) && o.name.endsWith(`model:${id}:merged`) && parts.push({ mesh: o, inst: 0 }));
  if (!parts.length) return { id, groups: [], error: 'not in the office' };

  // Every triangle, with its world plane; materials that never draw are skipped.
  const tris = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  parts.forEach((p, pi) => {
    const { mesh } = p;
    p.matrix = mesh.matrixWorld.clone();
    if (p.inst >= 0) p.matrix.multiply(new THREE.Matrix4().fromArray(mesh.instanceMatrix.array, p.inst * 16));
    const g = mesh.geometry;
    const pos = g.getAttribute('position');
    const idx = g.index;
    const count = idx ? idx.count : pos.count;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const groups = g.groups.length ? g.groups : [{ start: 0, count, materialIndex: 0 }];
    for (const gr of groups) {
      const mat = mats[Array.isArray(mesh.material) ? (gr.materialIndex ?? 0) : 0];
      if (!mat || !mat.visible || mat.colorWrite === false) continue;
      const writesDepth = !mat.transparent || mat.depthWrite;
      for (let i = gr.start; i + 2 < Math.min(count, gr.start + gr.count); i += 3) {
        const v = idx ? [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)] : [i, i + 1, i + 2];
        a.fromBufferAttribute(pos, v[0]).applyMatrix4(p.matrix);
        b.fromBufferAttribute(pos, v[1]).applyMatrix4(p.matrix);
        c.fromBufferAttribute(pos, v[2]).applyMatrix4(p.matrix);
        const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
        const area = n.length() / 2;
        if (area < 1e-10) continue;
        n.normalize();
        tris.push({ pi, i, v, n, d: n.dot(a), A: a.clone(), B: b.clone(), C: c.clone(), area, writesDepth });
      }
    }
  });

  // Same-facing pairs within tol whose outlines overlap, grouped by (front plane, back plane).
  const axis = (n) => (Math.abs(n.x) >= Math.abs(n.y) && Math.abs(n.x) >= Math.abs(n.z) ? 0 : Math.abs(n.y) >= Math.abs(n.z) ? 1 : 2);
  const flat = (p, ax) => (ax === 0 ? [p.y, p.z] : ax === 1 ? [p.z, p.x] : [p.x, p.y]);
  const area2 = (poly) => poly.reduce((s, [x0, y0], k) => s + x0 * poly[(k + 1) % poly.length][1] - poly[(k + 1) % poly.length][0] * y0, 0) / 2;
  const clip = (subject, clipper) => {
    let out = subject;
    if (area2(clipper) < 0) clipper = clipper.slice().reverse();
    for (let k = 0; k < clipper.length && out.length; k++) {
      const [ax, ay] = clipper[k];
      const [bx, by] = clipper[(k + 1) % clipper.length];
      const inside = (p) => (bx - ax) * (p[1] - ay) - (by - ay) * (p[0] - ax) >= -1e-12;
      const cut = (p, q) => {
        const den = (p[0] - q[0]) * (ay - by) - (p[1] - q[1]) * (ax - bx);
        if (Math.abs(den) < 1e-15) return p;
        const t = ((p[0] - ax) * (ay - by) - (p[1] - ay) * (ax - bx)) / den;
        return [p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])];
      };
      const input = out;
      out = [];
      input.forEach((p, j) => {
        const q = input[(j + 1) % input.length];
        if (inside(p)) {
          out.push(p);
          if (!inside(q)) out.push(cut(p, q));
        } else if (inside(q)) out.push(cut(p, q));
      });
    }
    return out;
  };
  const buckets = new Map();
  tris.forEach((t, k) => {
    const q = [Math.round(t.n.x * 20), Math.round(t.n.y * 20), Math.round(t.n.z * 20)];
    const key = q.join(',');
    if (!buckets.has(key)) buckets.set(key, { q, list: [] });
    buckets.get(key).list.push(k);
  });
  // Plane offsets from the model's own centre: faces up to 1.8° apart drift less over its size
  // than over the distance to the world origin, so the sort window below stays tight.
  const mid = new THREE.Box3();
  for (const t of tris) mid.expandByPoint(t.A);
  const c0 = mid.getCenter(new THREE.Vector3());
  for (const t of tris) t.dl = t.n.dot(t.A.clone().sub(c0));
  // The sort window. Two faces that count as parallel (normals within PARALLEL, so |n1 - n2| is
  // at most √(2(1 - PARALLEL)) ≈ 0.032) and lie within tol where they overlap have offsets at most
  // tol + 0.032 × (that spot's distance from c0) apart, so the window grows with the model's
  // reach: a fixed 10 cm missed such pairs more than ~3 m out, on models over ~6 m wide.
  const PARALLEL = 0.9995;
  let reach = 0;
  for (const t of tris) reach = Math.max(reach, t.A.distanceTo(c0), t.B.distanceTo(c0), t.C.distanceTo(c0));
  const span = tol + Math.sqrt(2 * (1 - PARALLEL)) * reach * 1.01;
  // Where the overlap's centre lies on a triangle's plane (the axis `ax` coordinate dropped).
  const lift = (t, ax, u, v) => {
    const { n } = t;
    const d = n.dot(t.A);
    if (ax === 0) return new THREE.Vector3((d - n.y * u - n.z * v) / n.x, u, v);
    if (ax === 1) return new THREE.Vector3(v, (d - n.z * u - n.x * v) / n.y, u);
    return new THREE.Vector3(u, v, (d - n.x * u - n.y * v) / n.z);
  };
  const groups = new Map();
  const consider = (lower, upper) => {
    if (lower.n.dot(upper.n) < PARALLEL || (!lower.writesDepth && !upper.writesDepth)) return;
    const ax = axis(lower.n);
    const poly = clip([lower.A, lower.B, lower.C].map((p) => flat(p, ax)), [upper.A, upper.B, upper.C].map((p) => flat(p, ax)));
    if (poly.length < 3) return;
    const ov = Math.abs(area2(poly));
    if (ov < 1e-8) return;
    // How far apart they are where they overlap: nearly parallel faces can cross, so their
    // offsets from any one origin don't say which is in front, or by how much.
    const u = poly.reduce((s, p) => s + p[0], 0) / poly.length;
    const v = poly.reduce((s, p) => s + p[1], 0) / poly.length;
    const sep = lower.n.dot(lift(upper, ax, u, v).sub(lift(lower, ax, u, v)));
    if (Math.abs(sep) > tol) return;
    const [front, back] = sep >= 0 ? [upper, lower] : [lower, upper];
    const key = `${front.pi}:${front.d.toFixed(4)}|${back.pi}:${back.d.toFixed(4)}`;
    let gr = groups.get(key);
    if (!gr) groups.set(key, (gr = { front: new Map(), back: new Map(), gap: 0, overlap: 0, normal: back.n.clone(), opaque: front.writesDepth && back.writesDepth }));
    gr.front.set(`${front.pi}:${front.i}`, front);
    gr.back.set(`${back.pi}:${back.i}`, back);
    gr.overlap += ov;
    gr.gap = Math.max(gr.gap, Math.abs(sep));
  };
  for (const { list } of buckets.values()) list.sort((x, y) => tris[x].dl - tris[y].dl);
  for (const [key, { q, list }] of buckets) {
    for (let x = 0; x < list.length; x++)
      for (let y = x + 1; y < list.length && tris[list[y]].dl - tris[list[x]].dl <= span; y++) consider(tris[list[x]], tris[list[y]]);
    // Parallel faces can still round into neighbouring buckets (their normals' components
    // differ by under one 1/20 step), so each neighbour bucket is compared once as well.
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          const near = `${q[0] + dx},${q[1] + dy},${q[2] + dz}`;
          const other = near > key && buckets.get(near)?.list;
          if (!other) continue;
          let lo = 0;
          for (const x of list) {
            const a = tris[x];
            while (lo < other.length && tris[other[lo]].dl < a.dl - span) lo++;
            for (let y = lo; y < other.length && tris[other[y]].dl <= a.dl + span; y++) consider(a, tris[other[y]]);
          }
        }
  }

  // Occluders: everything opaque in the office except the pair itself (its model's other parts
  // stay, drawn from a copy of their geometry without the pair's triangles). People are left
  // out (they move), and so is anything see-through.
  const nonOccluders = [];
  scene.traverse((o) => {
    if (!o.visible) return;
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    if (o.isSkinnedMesh || o.isPoints || o.isLine || o.isSprite || mats.some((m) => m.transparent || !m.depthWrite)) nonOccluders.push(o);
  });
  const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false });
  const red = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const green = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const W = size.x, H = size.y;
  const rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true });
  const cam = office.engine.camera.clone();
  const pairScene = new THREE.Scene();
  const interior = office.world.interior;
  const inRoom = (p) => p.x > interior.minX + 0.2 && p.x < interior.maxX - 0.2 && p.z > interior.minZ + 0.2 && p.z < interior.maxZ - 0.2;
  const nearBuilding = (p) => p.x > interior.minX - 0.6 && p.x < interior.maxX + 0.6 && p.z > interior.minZ - 0.6 && p.z < interior.maxZ + 0.6;
  // The walkable world (NAV_BOUNDS in client/src/world/layout.ts).
  const world = { minX: -25, maxX: 25, minZ: -16, maxZ: 28 };

  const subset = (map) => {
    const byPart = new Map();
    for (const t of map.values()) (byPart.get(t.pi) ?? byPart.set(t.pi, []).get(t.pi)).push(t);
    return [...byPart.entries()].map(([pi, list]) => {
      list.sort((x, y) => x.i - y.i);
      const src = parts[pi].mesh.geometry.getAttribute('position');
      const arr = new Float32Array(list.length * 9);
      list.forEach((t, k) => t.v.forEach((v, j) => arr.set([src.getX(v), src.getY(v), src.getZ(v)], k * 9 + j * 3)));
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      const m = new THREE.Mesh(g);
      m.matrixAutoUpdate = false;
      m.matrix.copy(parts[pi].matrix);
      m.matrixWorld.copy(parts[pi].matrix);
      m.frustumCulled = false;
      return m;
    });
  };
  const withoutPair = (gr) => {
    // Each part's geometry minus the pair's triangles, to swap in while drawing occluders.
    const drop = new Map();
    for (const t of [...gr.front.values(), ...gr.back.values()]) (drop.get(t.pi) ?? drop.set(t.pi, new Set()).get(t.pi)).add(t.i);
    return [...drop.entries()].map(([pi, gone]) => {
      const g = parts[pi].mesh.geometry;
      const idx = g.index;
      const count = idx ? idx.count : g.getAttribute('position').count;
      const keep = [];
      for (let i = 0; i + 2 < count; i += 3) if (!gone.has(i)) keep.push(...(idx ? [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)] : [i, i + 1, i + 2]));
      const rest = new THREE.BufferGeometry();
      for (const [name, attr] of Object.entries(g.attributes)) rest.setAttribute(name, attr);
      rest.setIndex(keep);
      if (Array.isArray(parts[pi].mesh.material)) rest.addGroup(0, keep.length, 0);
      return { mesh: parts[pi].mesh, rest };
    });
  };

  const saved = {
    target: renderer.getRenderTarget(),
    clear: renderer.getClearColor(new THREE.Color()),
    alpha: renderer.getClearAlpha(),
    autoClear: renderer.autoClear,
    shadows: renderer.shadowMap.autoUpdate,
    background: scene.background,
    fog: scene.fog,
  };
  const out = [];
  try {
    renderer.autoClear = false;
    // The sun's shadow map would otherwise be redrawn for every occluder pass.
    renderer.shadowMap.autoUpdate = false;
    renderer.setClearColor(0x000000, 1);
    for (const gr of groups.values()) {
      if (gr.overlap < minArea) continue;
      const front = subset(gr.front);
      const back = subset(gr.back);
      front.forEach((m) => (m.material = red));
      back.forEach((m) => (m.material = green));
      const swaps = withoutPair(gr);
      const centre = new THREE.Vector3();
      let wsum = 0;
      for (const t of gr.front.values()) {
        centre.addScaledVector(t.A.clone().add(t.B).add(t.C).divideScalar(3), t.area);
        wsum += t.area;
      }
      centre.divideScalar(wsum);
      // Screen rectangle to read back: the pair's bounding box, projected.
      const box = new THREE.Box3();
      for (const t of [...gr.front.values(), ...gr.back.values()]) box.expandByPoint(t.A).expandByPoint(t.B).expandByPoint(t.C);
      // A see-through layer always draws after the opaque one; two opaque layers either way round.
      const frontOpaque = gr.front.values().next().value.writesDepth;
      const orders = gr.opaque ? [[...back, ...front], [...front, ...back]] : [frontOpaque ? [...front, ...back] : [...back, ...front]];
      const indoors = office.world.isInside(centre);
      const heights = indoors ? [1.2, 2.4, 3.6] : [1.2, 3.6, 7.0];
      const level = new THREE.Vector3(gr.normal.x, 0, gr.normal.z);
      if (level.lengthSq() < 1e-6) level.set(0, 0, 1);
      level.normalize();

      const occlude = () => {
        renderer.setRenderTarget(rt);
        renderer.clear(true, true, true);
        nonOccluders.forEach((o) => (o.visible = false));
        swaps.forEach((s) => ([s.rest, s.mesh.geometry] = [s.mesh.geometry, s.rest]));
        scene.overrideMaterial = depthOnly;
        scene.background = null;
        scene.fog = null;
        try {
          renderer.render(scene, cam);
        } finally {
          scene.overrideMaterial = null;
          scene.background = saved.background;
          scene.fog = saved.fog;
          swaps.forEach((s) => ([s.rest, s.mesh.geometry] = [s.mesh.geometry, s.rest]));
          nonOccluders.forEach((o) => (o.visible = true));
        }
      };
      const draw = (list) => {
        pairScene.clear();
        list.forEach((m, k) => {
          m.renderOrder = k;
          pairScene.add(m);
        });
        renderer.render(pairScene, cam);
      };
      const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => new THREE.Vector3(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z));
      const rect = () => {
        // A corner level with or behind the camera doesn't project: read the whole frame.
        if (corners.some((p) => p.clone().applyMatrix4(cam.matrixWorldInverse).z > -cam.near)) return [0, 0, W, H];
        let x0 = W, y0 = H, x1 = 0, y1 = 0;
        for (const p of corners) {
          const s = p.clone().project(cam);
          x0 = Math.min(x0, ((s.x + 1) / 2) * W);
          x1 = Math.max(x1, ((s.x + 1) / 2) * W);
          y0 = Math.min(y0, ((s.y + 1) / 2) * H);
          y1 = Math.max(y1, ((s.y + 1) / 2) * H);
        }
        x0 = Math.max(0, Math.floor(x0) - 2);
        y0 = Math.max(0, Math.floor(y0) - 2);
        x1 = Math.min(W, Math.ceil(x1) + 2);
        y1 = Math.min(H, Math.ceil(y1) + 2);
        return x1 > x0 && y1 > y0 ? [x0, y0, x1 - x0, y1 - y0] : null;
      };
      const reds = (r) => {
        const buf = new Uint8Array(r[2] * r[3] * 4);
        renderer.readRenderTargetPixels(rt, r[0], r[1], r[2], r[3], buf);
        let n = 0;
        for (let k = 0; k < buf.length; k += 4) if (buf[k] > 128 && buf[k + 1] < 64) n++;
        return n;
      };

      const byDist = {};
      for (const d of plan.dists)
        for (const deg of plan.angles)
          for (const h of heights) {
            const dir = level.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), (deg * Math.PI) / 180);
            const side = new THREE.Vector3(dir.z, 0, -dir.x);
            for (let k = 0; k < plan.steps; k++) {
              const p = centre.clone().addScaledVector(dir, d).addScaledVector(side, k * plan.stepLen);
              p.y = h;
              if (indoors ? !inRoom(p) : nearBuilding(p) || p.x < world.minX || p.x > world.maxX || p.z < world.minZ || p.z > world.maxZ) continue;
              cam.position.copy(p);
              cam.lookAt(centre);
              cam.updateMatrixWorld(true);
              const r = rect();
              if (!r) continue;
              occlude();
              draw(front);
              const cover = reds(r);
              if (cover < 20) continue;
              let worst = 0;
              for (const list of orders) {
                occlude();
                draw(list);
                worst = Math.max(worst, (cover - reds(r)) / cover);
              }
              byDist[d] = Math.max(byDist[d] ?? 0, +worst.toFixed(4));
            }
          }
      const seen = Object.values(byDist);
      const fp = [...gr.front.values()][0];
      const bp = [...gr.back.values()][0];
      out.push({
        front: short(parts[fp.pi].mesh),
        back: short(parts[bp.pi].mesh),
        gapMm: +(gr.gap * 1000).toFixed(2),
        areaCm2: +(gr.overlap * 1e4).toFixed(1),
        centre: centre.toArray().map((v) => +v.toFixed(2)),
        worst: seen.length ? Math.max(...seen) : null,
        byDist,
      });
      [...front, ...back].forEach((m) => m.geometry.dispose());
      // The copies share the model's attributes: let go of them first, or disposing a copy
      // would free the model's own vertex buffers too.
      for (const s of swaps) {
        for (const name of Object.keys(s.rest.attributes)) s.rest.deleteAttribute(name);
        s.rest.dispose();
      }
    }
  } finally {
    renderer.setRenderTarget(saved.target);
    renderer.setClearColor(saved.clear, saved.alpha);
    renderer.autoClear = saved.autoClear;
    renderer.shadowMap.autoUpdate = saved.shadows;
    rt.dispose();
    [depthOnly, red, green].forEach((m) => m.dispose());
  }
  return { id, groups: out };
}
