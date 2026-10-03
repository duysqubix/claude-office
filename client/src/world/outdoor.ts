// Outside: a mown lawn, paved apron and path to the door, doormat, the company sign, faceted
// low-poly bushes (smooth people against faceted nature), grass tufts along the edges, a bench,
// a ping-pong table, a hedge around the garden and rolling hills fading into the haze. The yard
// itself (the trail, its stops, the trees and the planting) is in yard.ts.
import * as THREE from 'three';
import { PALETTE } from '../style/palette';
import { Batch, CanvasTex, FONT_FAMILY, fitText, pickR, rng, shade } from './kit';
import { NAV_BOUNDS, OFFICE } from './layout';
import { aabb, footprint, type WorldCtx } from './ctx';
import { sparkle } from './screens';
import { staticProp, tallProp } from './props';
import { findNode } from '../models';
import { disposeGroup, disposeInstanced, instancedModel, ownCanvas, placement, swapModel, type InstancedModel } from './modelkit';
import { buildYard, type Outdoor } from './yard';

const OUT_Z = OFFICE.halfD + OFFICE.wallT;
/** Where the trail (yard.ts) crosses the main path: by the door and just inside the gate. */
const TRAIL_CROSSINGS: readonly [number, number][] = [
  [11.4, 13.0],
  [23.8, 25.3],
];

/** Placement for instanced scenery: position, turn and uniform size. */
function scenery(x: number, z: number, yaw: number, s: number): THREE.Matrix4 {
  return placement(x, 0, z, yaw).multiply(new THREE.Matrix4().makeScale(s, s, s));
}

/**
 * Draw repeated scenery (bushes, tufts, hedge tiles, far trees) as instanced catalog models.
 * The procedural `fallback` goes once every model has loaded; if any is missing it stays.
 */
async function swapScenery(ctx: WorldCtx, fallback: THREE.Object3D, sets: { id: string; at: THREE.Matrix4[]; shadows?: boolean }[]): Promise<void> {
  const loaded = await Promise.all(sets.map((set) => instancedModel(set.id, set.at, { shadows: set.shadows })));
  if (loaded.some((m, i) => !m && sets[i].at.length > 0)) {
    for (const m of loaded) if (m) disposeInstanced(m.group);
    return;
  }
  for (const m of loaded.filter((m): m is InstancedModel => m !== null)) ctx.root.add(m.group);
  disposeGroup(fallback);
}
/** Lawn texture tile size in metres (one canvas repeat). */
const LAWN_TILE = 12.8;
/** Paver texture tile size in metres. */
const PAVER_TILE = 2;

export function buildOutdoor(ctx: WorldCtx): Outdoor {
  const b = ctx.statics;

  // Lawn.
  const lawnTex = grassTexture();
  lawnTex.wrapS = lawnTex.wrapT = THREE.RepeatWrapping;
  lawnTex.repeat.set(640 / LAWN_TILE, 640 / LAWN_TILE);
  const lawn = new THREE.Mesh(new THREE.CircleGeometry(320, 72), new THREE.MeshStandardMaterial({ map: lawnTex, roughness: 0.95, metalness: 0 }));
  lawn.name = 'lawn';
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.y = -0.02;
  lawn.receiveShadow = true;
  ctx.root.add(lawn);

  // Paved apron around the building and the path to the garden gate.
  const pavers = paverTexture();
  const apronW = (OFFICE.halfW + OFFICE.wallT) * 2 + 1.4;
  const apronD = (OFFICE.halfD + OFFICE.wallT) * 2 + 1.4;
  b.slab(apronW + 0.2, apronD + 0.2, 0.05, 0.55, shade(PALETTE.path, -0.12), { at: [0, -0.04, 0], cast: false, finish: 'matte' });
  ctx.root.add(pavedPlane(apronW, apronD, 0.5, pavers, 0, -0.012, 0));
  const pathLen = NAV_BOUNDS.maxZ + 6 - OUT_Z;
  b.slab(3.5, pathLen, 0.05, 0.3, shade(PALETTE.path, -0.12), { at: [0, -0.04, OUT_Z + pathLen / 2], cast: false, finish: 'matte' });
  ctx.root.add(pavedPlane(3.1, pathLen - 0.3, 0.25, pavers, 0, -0.008, OUT_Z + pathLen / 2));

  const mat = new CanvasTex(512, 200, (c, w, h) => {
    c.fillStyle = '#B0764A';
    c.beginPath();
    c.roundRect(0, 0, w, h, 30);
    c.fill();
    c.strokeStyle = '#8E5A33';
    c.lineWidth = 10;
    c.beginPath();
    c.roundRect(14, 14, w - 28, h - 28, 22);
    c.stroke();
    c.fillStyle = '#FFE8C2';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitText(c, 'HELLO :)', 700, 110, w - 80);
    c.fillText('HELLO :)', w / 2, h / 2 + 6);
  });
  const doormat = ownCanvas(new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.78), new THREE.MeshStandardMaterial({ map: mat.tex, roughness: 0.95 })), mat);
  doormat.rotation.x = -Math.PI / 2;
  doormat.position.y = 0.006;
  doormat.receiveShadow = true;
  const matGroup = staticProp(ctx, 'doormat', () => {}, { extra: [doormat], at: [0, OUT_Z + 0.75] });
  void swapModel(ctx, matGroup, 'doormat');

  // Company sign: a chunky monument by the path, angled toward people walking up, just past
  // where the trail leaves the path.
  const signTex = new CanvasTex(1024, 300, (c, w, h) => {
    c.fillStyle = PALETTE.claude;
    c.beginPath();
    c.roundRect(0, 0, w, h, 110);
    c.fill();
    c.strokeStyle = 'rgba(255,253,247,0.55)';
    c.lineWidth = 12;
    c.beginPath();
    c.roundRect(22, 22, w - 44, h - 44, 90);
    c.stroke();
    sparkle(c, 150, h / 2, 82, '#FFFDF7', 0.2);
    c.fillStyle = '#FFFDF7';
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    fitText(c, 'CLAUDE', 700, 150, w - 330);
    c.fillText('CLAUDE', 270, h / 2 - 38);
    c.font = '700 84px ' + FONT_FAMILY;
    c.fillText('OFFICE', 274, h / 2 + 74);
  });
  const sign = new THREE.Group();
  const signFace = ownCanvas(
    new THREE.Mesh(
      new THREE.PlaneGeometry(2.3, 0.67),
      new THREE.MeshStandardMaterial({ map: signTex.tex, emissive: '#FFFFFF', emissiveMap: signTex.tex, emissiveIntensity: 0.25, roughness: 0.6 }),
    ),
    signTex,
  );
  signFace.position.set(0, 1.0, 0.075);
  signFace.rotation.x = -0.08;
  const sb = new Batch();
  sb.box(2.45, 0.8, 0.14, shade(PALETTE.claude, -0.1), { at: [0, 1.0, 0], rot: [-0.08, 0, 0], r: 0.07 });
  sb.box(2.7, 0.45, 0.5, '#E9DCC6', { at: [0, 0.22, -0.02], r: 0.12, finish: 'matte' });
  for (const k of [-1, 1]) sb.box(0.16, 0.5, 0.16, PALETTE.doorFrame, { at: [k * 0.85, 0.58, -0.02], r: 0.05 });
  for (let i = 0; i < 7; i++) {
    const fx = -1.15 + i * 0.38;
    sb.ball([0.17, 0.13, 0.15], shade(PALETTE.treeLeaf[1], (i % 3) * 0.03), { at: [fx, 0.5, 0.3], ws: 9, hs: 6, flat: true });
    if (i % 2 === 0) sb.ball(0.05, ['#FF7EB6', '#FFD93D', '#FFFFFF', '#FF6B6B'][i % 4], { at: [fx + 0.06, 0.62, 0.38], cast: false, ws: 8, hs: 6 });
  }
  sign.add(sb.build({ name: 'office-sign' }), signFace);
  const signZ = OUT_Z + 3.65;
  sign.position.set(3.4, 0, signZ);
  sign.rotation.y = -0.35;
  ctx.root.add(sign);
  void swapModel(ctx, sign, 'company_sign');
  ctx.colliders.push(footprint(3.4, signZ, 3.0, 1.1));
  ctx.blobs.add(3.4, signZ, 3.2, 1.2, { yaw: -0.35 });

  // Bench beside the path, and a ping-pong table out on the east lawn.
  void swapModel(ctx, staticProp(ctx, 'park-bench', (pb) => buildParkBench(pb), { at: [2.55, 17.2], yaw: -Math.PI / 2 }), 'park_bench', { fit: { w: 1.7, uniform: true } });
  ctx.colliders.push(footprint(2.6, 17.2, 0.7, 1.8));
  ctx.blobs.add(2.6, 17.2, 1.0, 2.1);
  void swapModel(ctx, staticProp(ctx, 'ping-pong', (pb) => buildPingPongTable(pb), { at: [19.4, -10.6] }), 'ping_pong_table', { fit: { w: 2.5, uniform: true } });
  ctx.colliders.push(footprint(19.4, -10.6, 2.5, 1.4));
  ctx.blobs.add(19.4, -10.6, 2.9, 1.8);

  // Street lamps along the path, a mailbox by the door and the company flag at the back.
  for (const [x, z] of [
    [-2.3, 15.0],
    [2.3, 15.0],
    [-2.3, 21.0],
    [2.3, 21.0],
  ] as const) {
    void swapModel(ctx, tallProp(ctx, 'street-lamp', (lb) => buildStreetLamp(lb), { at: [x, z] }), 'street_lamp', { glow: 0.3 });
    ctx.colliders.push(footprint(x, z, 0.4, 0.4));
    ctx.blobs.add(x, z, 0.7, 0.7, { shape: 'round' });
  }
  void swapModel(ctx, staticProp(ctx, 'mailbox', (mb) => buildMailbox(mb), { at: [-2.35, 13.45], yaw: Math.PI / 2 }), 'mailbox', { tint: { Accent: '#3D7CFF' } });
  ctx.colliders.push(footprint(-2.35, 13.45, 0.45, 0.45));
  ctx.blobs.add(-2.35, 13.45, 0.6, 0.6, { shape: 'round' });
  const flag = tallProp(ctx, 'flag-pole', (fb) => buildFlagPole(fb), { at: [-4.5, 26.0] });
  void swapModel(ctx, flag, 'flag_pole').then((m) => {
    const cloth = m && findNode(m, 'Flag');
    if (cloth) ctx.tickers.push((_dt, t) => (cloth.rotation.y = Math.sin(t * 1.7) * 0.18 + Math.sin(t * 4.1) * 0.05));
  });
  ctx.colliders.push(footprint(-4.5, 26.0, 0.7, 0.7));
  ctx.blobs.add(-4.5, 26.0, 0.9, 0.9, { shape: 'round' });

  // Bushes hugging the building, with flowers.
  // The front rows stop short of the rose arches where the trail leaves the path (yard.ts).
  const bushRows: [number, number, number][] = [
    [-13.6, -4.4, OUT_Z + 0.75],
    [4.4, 13.6, OUT_Z + 0.75],
    [-9.0, 9.0, -OUT_Z - 0.75],
  ];
  const fr = rng(4242);
  const shrubs = new Batch();
  const bushes: THREE.Matrix4[] = [];
  const bush = (x: number, z: number, size: number) => {
    const yaw = fr() * 6;
    shrubs.place(x, 0, z, yaw, () => buildBush(shrubs, size, fr));
    // The catalog bush is ~1.5 m across; ours is 2.2 × size.
    bushes.push(scenery(x, z, yaw, (size * 2.2) / 1.5));
  };
  for (const [x0, x1, z] of bushRows) {
    for (let x = x0; x <= x1; x += 0.95 + fr() * 0.3) bush(x, z, 0.45 + fr() * 0.2);
    ctx.colliders.push(aabb(x0 - 0.6, x1 + 0.6, z - 0.55, z + 0.55));
    ctx.blobs.add((x0 + x1) / 2, z, x1 - x0 + 1.4, 1.5);
  }
  for (const side of [-1, 1]) {
    const x = side * (OFFICE.halfW + OFFICE.wallT + 0.75);
    for (let z = -8.5; z <= 8.5; z += 1.0 + fr() * 0.3) bush(x, z, 0.4 + fr() * 0.2);
    ctx.colliders.push(aabb(x - 0.55, x + 0.55, -9.1, 9.1));
    ctx.blobs.add(x, 0, 1.4, 18.6);
  }
  const shrubGroup = shrubs.build({ name: 'bushes' });
  ctx.root.add(shrubGroup);
  void swapScenery(ctx, shrubGroup, [{ id: 'bush_round', at: bushes }]);

  // Grass tufts along the edges of the apron and the path (the trail brings its own along the
  // front, and none grow where it crosses the path).
  const tr = rng(777);
  const tufts: [number, number][] = [];
  for (let i = 0; i < 70; i++) {
    const t = tr();
    const side = Math.floor(tr() * 4);
    const ex = apronW / 2 + 0.2 + tr() * 0.4;
    const ez = apronD / 2 + 0.2 + tr() * 0.4;
    if (side === 0) tufts.push([-apronW / 2 + t * apronW, -ez]);
    else if (side === 1) tufts.push([ex, -apronD / 2 + t * apronD]);
    else if (side === 2) tufts.push([-ex, -apronD / 2 + t * apronD]);
  }
  for (let i = 0; i < 36; i++) {
    const s = i % 2 ? 1 : -1;
    const x = s * (1.95 + tr() * 0.35);
    const z = OUT_Z + 1.5 + tr() * (pathLen - 3);
    if (!TRAIL_CROSSINGS.some(([z0, z1]) => z > z0 && z < z1)) tufts.push([x, z]);
  }
  const grass = new Batch();
  const blades: THREE.Matrix4[] = [];
  for (const [x, z] of tufts) {
    const yaw = tr() * 6;
    grass.place(x, 0, z, yaw, () => buildGrassTuft(grass, tr));
    blades.push(scenery(x, z, yaw, 0.6 + tr() * 0.35));
  }
  const grassGroup = grass.build({ name: 'grass-tufts' });
  ctx.root.add(grassGroup);
  void swapScenery(ctx, grassGroup, [{ id: 'grass_tuft', at: blades, shadows: false }]);

  // Hedge around the garden, with a little gate across the path.
  const { minX, maxX, minZ, maxZ } = NAV_BOUNDS;
  const hedges = new Batch();
  const tiles: THREE.Matrix4[] = [];
  const hedge = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    // The hedge is outside the shadow frustum, so it skips the shadow pass entirely.
    hedges.box(alongX ? len : 0.9, 0.85, alongX ? 0.9 : len, PALETTE.grassDark, { at: [cx, 0.42, cz], r: 0.4, seg: 4, finish: 'matte', cast: false });
    for (let t = 0.5; t < len; t += 1.1) {
      const px = alongX ? Math.min(x0, x1) + t : cx;
      const pz = alongX ? cz : Math.min(z0, z1) + t;
      hedges.ball([0.55, 0.42, 0.55], shade(PALETTE.grassDark, (fr() - 0.5) * 0.08), { at: [px, 0.82, pz], rot: [0, fr() * 6, 0], ws: 8, hs: 5, finish: 'matte', cast: false, flat: true });
    }
    // Catalog hedge tiles (2 m along their X), stretched a little to fill the run exactly.
    const n = Math.max(1, Math.round(len / 2));
    const step = len / n;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) * step;
      const px = alongX ? Math.min(x0, x1) + t : cx;
      const pz = alongX ? cz : Math.min(z0, z1) + t;
      tiles.push(placement(px, 0, pz, alongX ? 0 : Math.PI / 2).multiply(new THREE.Matrix4().makeScale(step / 2.02, 0.9, 0.95)));
    }
  };
  hedge(minX, minZ + 0.4, maxX, minZ + 0.4);
  hedge(minX + 0.4, minZ, minX + 0.4, maxZ);
  hedge(maxX - 0.4, minZ, maxX - 0.4, maxZ);
  hedge(minX, maxZ - 0.4, -2.1, maxZ - 0.4);
  hedge(2.1, maxZ - 0.4, maxX, maxZ - 0.4);
  ctx.colliders.push(
    aabb(minX - 1, maxX + 1, minZ - 1, minZ + 0.85),
    aabb(minX - 1, minX + 0.85, minZ - 1, maxZ + 1),
    aabb(maxX - 0.85, maxX + 1, minZ - 1, maxZ + 1),
    aabb(minX - 1, maxX + 1, maxZ - 0.85, maxZ + 1),
  );
  // Gate: two posts and a picket fence section (two catalog fence tiles).
  for (const s of [-1, 1]) hedges.box(0.22, 1.2, 0.22, '#FFFDF7', { at: [s * 1.9, 0.6, maxZ - 0.4], r: 0.06 });
  for (let i = 0; i < 9; i++) hedges.box(0.12, 0.85, 0.06, '#FFFDF7', { at: [-1.6 + i * 0.4, 0.43, maxZ - 0.4], r: 0.04 });
  for (const y of [0.3, 0.65]) hedges.box(3.6, 0.08, 0.05, '#FFFDF7', { at: [0, y, maxZ - 0.44], r: 0.025 });
  const hedgeGroup = hedges.build({ name: 'hedge' });
  ctx.root.add(hedgeGroup);
  void swapScenery(ctx, hedgeGroup, [
    { id: 'hedge', at: tiles, shadows: false },
    { id: 'fence_picket', at: [placement(-0.96, 0, maxZ - 0.4, 0), placement(1.04, 0, maxZ - 0.4, 0)] },
  ]);

  // Rolling faceted hills and a ring of distant trees, softened by the fog.
  const hills = new Batch();
  const hr = rng(31337);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + hr() * 0.2;
    const d = 85 + hr() * 70;
    const rr = 22 + hr() * 26;
    hills.ball([rr, rr * (0.28 + hr() * 0.18), rr], pickR(hr, ['#7FD35A', '#72CB52', '#8CDB66', '#69C24D']), {
      at: [Math.cos(a) * d, -rr * 0.08, Math.sin(a) * d],
      rot: [0, hr() * 6, 0],
      ws: 16,
      hs: 8,
      cast: false,
      finish: 'matte',
      flat: true,
    });
  }
  const hillGroup = hills.build({ name: 'scenery', receive: false });
  ctx.root.add(hillGroup);
  const far = new Batch();
  const farTrees: THREE.Matrix4[][] = [[], [], []];
  for (let i = 0; i < 46; i++) {
    const a = hr() * Math.PI * 2;
    const d = 34 + hr() * 30;
    const yaw = hr() * 6;
    const size = 0.9 + hr() * 0.6;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    far.place(x, 0, z, yaw, () => buildTree(far, size, hr, false));
    farTrees[i % 3].push(scenery(x, z, yaw, size * 0.95));
  }
  const farGroup = far.build({ name: 'far-trees', receive: false });
  ctx.root.add(farGroup);
  void swapScenery(ctx, farGroup, [
    { id: 'tree_round', at: farTrees[0], shadows: false },
    { id: 'tree_pine', at: farTrees[1], shadows: false },
    { id: 'tree_blossom', at: farTrees[2], shadows: false },
  ]);

  return buildYard(ctx);
}

// ---------------------------------------------------------------------------------------------
// Builders (local frame: pivot at the floor contact point, front facing +Z)

/** Faceted low-poly tree: tapered trunk and a clump of flat-shaded crowns. */
export function buildTree(b: Batch, s: number, r: () => number, cast = true): void {
  const h = (1.5 + r() * 0.5) * s;
  b.cyl(0.13 * s, 0.21 * s, h, PALETTE.treeTrunk, { at: [0, h / 2, 0], seg: 7, cast, flat: true, finish: 'wood' });
  const n = 3 + Math.floor(r() * 3);
  const leaf = pickR(r, PALETTE.treeLeaf);
  b.ball(1.2 * s, leaf, { at: [0, h + 0.75 * s, 0], rot: [r(), r() * 6, r()], cast, ws: 9, hs: 6, flat: true, finish: 'matte' });
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r();
    const rad = (0.55 + r() * 0.25) * s;
    b.ball((0.7 + r() * 0.3) * s, shade(leaf, (r() - 0.5) * 0.1), {
      at: [Math.cos(a) * rad, h + (0.45 + r() * 0.7) * s, Math.sin(a) * rad],
      rot: [r(), r() * 6, r()],
      cast,
      ws: 8,
      hs: 5,
      flat: true,
      finish: 'matte',
    });
  }
}

/** Faceted round bush, sometimes in flower. */
export function buildBush(b: Batch, s: number, r: () => number): void {
  b.ball([s * 1.1, s * 0.85, s], shade(PALETTE.treeLeaf[1], (r() - 0.5) * 0.08), { at: [0, s * 0.6, 0], ws: 9, hs: 6, flat: true, finish: 'matte' });
  if (r() < 0.6) {
    const col = pickR(r, ['#FF7EB6', '#FFD93D', '#FFFDF7', '#FF6B6B', '#B983FF']);
    for (let i = 0; i < 5; i++) {
      const a = r() * Math.PI * 2;
      b.ball(0.07, col, { at: [Math.cos(a) * s * 0.75, s * (0.75 + r() * 0.5), Math.sin(a) * s * 0.65], cast: false, ws: 6, hs: 4, flat: true });
    }
  }
}

/** A tuft of 3–5 grass blades, dark at the root and light at the tip. */
export function buildGrassTuft(b: Batch, r: () => number): void {
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r();
    const h = 0.15 + r() * 0.15;
    const lean = 0.2 + r() * 0.35;
    b.cyl(0.0, 0.022, h, i % 2 ? '#5FBF45' : '#7ED957', {
      at: [Math.cos(a) * 0.04, h / 2, Math.sin(a) * 0.04],
      rot: [Math.sin(a) * lean, 0, -Math.cos(a) * lean],
      seg: 3,
      cast: false,
      flat: true,
      finish: 'matte',
    });
  }
}

/** Park bench: three wooden slats, a sloped back, dark iron ends. Faces +Z. */
export function buildParkBench(b: Batch): void {
  for (let i = 0; i < 3; i++) b.box(1.7, 0.05, 0.13, PALETTE.wood, { at: [0, 0.45, (i - 1) * 0.15], r: 0.02, finish: 'wood' });
  for (let i = 0; i < 2; i++) b.box(1.7, 0.13, 0.05, PALETTE.wood, { at: [0, 0.62 + i * 0.17, -0.27], rot: [-0.15, 0, 0], r: 0.02, finish: 'wood' });
  for (const s of [-1, 1]) {
    b.box(0.07, 0.42, 0.5, PALETTE.doorFrame, { at: [s * 0.7, 0.21, -0.02], r: 0.03 });
    b.box(0.07, 0.42, 0.07, PALETTE.doorFrame, { at: [s * 0.7, 0.62, -0.29], rot: [-0.15, 0, 0], r: 0.03 });
  }
}

/** Street lamp: a dark post with a glowing globe. */
export function buildStreetLamp(b: Batch): void {
  b.puck(0.2, 0.12, PALETTE.doorFrame, { at: [0, 0.06, 0], finish: 'plastic' });
  b.cyl(0.05, 0.07, 2.9, PALETTE.doorFrame, { at: [0, 1.5, 0], seg: 12, finish: 'plastic' });
  b.ball(0.2, '#FFF4D6', { at: [0, 3.1, 0], glow: 1.4 });
}

/** Mailbox on a wooden post, flag up. Faces +Z. */
export function buildMailbox(b: Batch): void {
  b.box(0.1, 1.0, 0.1, PALETTE.wood, { at: [0, 0.5, 0], r: 0.02, finish: 'wood' });
  b.box(0.24, 0.24, 0.48, '#3D7CFF', { at: [0, 1.12, 0], r: 0.1, finish: 'plastic' });
  b.box(0.03, 0.2, 0.08, '#FF5A5F', { at: [0.14, 1.2, -0.1], r: 0.01 });
}

/** Flag pole with the company flag. */
export function buildFlagPole(b: Batch): void {
  b.puck(0.3, 0.2, '#E9DCC6', { at: [0, 0.1, 0], finish: 'matte' });
  b.cyl(0.04, 0.05, 4.9, '#E9EEF6', { at: [0, 2.6, 0], seg: 12, finish: 'gloss' });
  b.box(1.2, 0.75, 0.02, PALETTE.claude, { at: [0.62, 4.55, 0], r: 0.01, finish: 'cloth' });
}

/** Ping-pong table with net, paddles and a ball. Long axis along X. */
export function buildPingPongTable(b: Batch): void {
  const top = 0.72;
  b.box(2.5, 0.06, 1.4, '#2E9BD6', { at: [0, top - 0.03, 0], r: 0.03, finish: 'plastic' });
  b.box(2.5, 0.004, 0.03, '#FFFDF7', { at: [0, top + 0.001, 0], r: 0.001, cast: false });
  b.box(0.03, 0.004, 1.4, '#FFFDF7', { at: [0, top + 0.001, 0], r: 0.001, cast: false });
  b.box(0.03, 0.16, 1.5, '#FFFDF7', { at: [0, top + 0.08, 0], r: 0.012 });
  for (const s of [-1, 1]) for (const t of [-1, 1]) b.box(0.07, top - 0.06, 0.07, '#3B4252', { at: [s * 1.05, (top - 0.06) / 2, t * 0.55], r: 0.02 });
  b.ball(0.02, '#FFFDF7', { at: [0.6, top + 0.15, -0.2] });
  for (const s of [-1, 1]) {
    b.puck(0.08, 0.015, '#FF5A5F', { at: [s * 0.95, top + 0.008, s * 0.3] });
    b.capsule(0.014, 0.06, PALETTE.wood, { at: [s * 1.07, top + 0.015, s * 0.3], rot: [0, 0, Math.PI / 2] });
  }
}

// ---------------------------------------------------------------------------------------------
// Textures

/** A flat rounded-rectangle mesh at height y with world-scaled paver UVs. */
function pavedPlane(w: number, d: number, corner: number, tex: THREE.Texture, x: number, y: number, z: number): THREE.Mesh {
  const shape = new THREE.Shape();
  const hw = w / 2;
  const hd = d / 2;
  const r = Math.min(corner, hw, hd);
  shape.moveTo(-hw + r, -hd);
  shape.lineTo(hw - r, -hd);
  shape.absarc(hw - r, -hd + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(hw, hd - r);
  shape.absarc(hw - r, hd - r, r, 0, Math.PI / 2, false);
  shape.lineTo(-hw + r, hd);
  shape.absarc(-hw + r, hd - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(-hw, -hd + r);
  shape.absarc(-hw + r, -hd + r, r, Math.PI, Math.PI * 1.5, false);
  const g = new THREE.ShapeGeometry(shape, 8);
  const pos = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + x) / PAVER_TILE, (pos.getY(i) - z) / PAVER_TILE);
  g.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0 }));
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  mesh.name = 'pavers';
  return mesh;
}

/** 2 × 2 m of chunky pavers in a running bond, each with its own tint and a soft bevel. */
function paverTexture(): THREE.CanvasTexture {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const base = new THREE.Color(PALETTE.path);
  ctx.fillStyle = '#' + base.clone().multiplyScalar(0.84).getHexString();
  ctx.fillRect(0, 0, S, S);
  const r = rng(2024);
  const rows = 8;
  const rh = S / rows;
  const bw = S / 4;
  for (let row = 0; row < rows; row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let k = -1; k < 5; k++) {
      const x = k * bw + off;
      const col = base.clone();
      const hsl = { h: 0, s: 0, l: 0 };
      col.getHSL(hsl, THREE.SRGBColorSpace);
      col.setHSL(hsl.h + (r() - 0.5) * 0.02, hsl.s * (0.9 + r() * 0.2), hsl.l * (0.94 + r() * 0.08), THREE.SRGBColorSpace);
      ctx.fillStyle = '#' + col.getHexString();
      ctx.beginPath();
      ctx.roundRect(x + 3, row * rh + 3, bw - 6, rh - 6, 9);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(x + 8, row * rh + 5, bw - 16, 3);
      ctx.fillStyle = 'rgba(80,60,30,0.06)';
      ctx.fillRect(x + 8, row * rh + rh - 9, bw - 16, 3);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 16;
  return tex;
}

/** Periodic smooth value noise on an n × n lattice, sampled at (u, v) in [0, 1). */
function periodicNoise(n: number, seed: number): (u: number, v: number) => number {
  const r = rng(seed);
  const grid = Array.from({ length: n * n }, () => r());
  const at = (i: number, j: number) => grid[((j % n) + n) % n * n + (((i % n) + n) % n)];
  return (u, v) => {
    const x = u * n;
    const y = v * n;
    const i = Math.floor(x);
    const j = Math.floor(y);
    let fx = x - i;
    let fy = y - j;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * fx;
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fx;
    return a + (b - a) * fy;
  };
}

/**
 * One 12.8 m lawn tile: two octaves of soft value noise (±6 % over ~1–3 m), gentle mowing
 * stripes 1.6 m wide, and a sprinkle of lighter blade flecks.
 */
function grassTexture(): THREE.CanvasTexture {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(S, S);
  const base = new THREE.Color(PALETTE.grass);
  const br = base.r;
  const bg = base.g;
  const bb = base.b;
  const n1 = periodicNoise(5, 11);
  const n2 = periodicNoise(13, 29);
  const stripes = LAWN_TILE / 1.6;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const v = y / S;
      const n = (n1(u, v) - 0.5) * 0.12 + (n2(u, v) - 0.5) * 0.07;
      const stripe = Math.sin(u * Math.PI * 2 * stripes) > 0 ? 0.022 : -0.022;
      const k = 1 + n + stripe;
      const i = (y * S + x) * 4;
      // Work in linear light, then back to sRGB bytes.
      img.data[i] = Math.round(linearToSrgb(br * k) * 255);
      img.data[i + 1] = Math.round(linearToSrgb(bg * k) * 255);
      img.data[i + 2] = Math.round(linearToSrgb(bb * k) * 255);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const r = rng(77);
  for (let i = 0; i < 900; i++) {
    const x = r() * S;
    const y = r() * S;
    ctx.fillStyle = r() < 0.6 ? 'rgba(190, 245, 140, 0.22)' : 'rgba(60, 140, 50, 0.16)';
    ctx.beginPath();
    ctx.ellipse(x, y, 1 + r() * 2, 0.6 + r(), r() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  return tex;
}

function linearToSrgb(v: number): number {
  const c = Math.min(1, Math.max(0, v));
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}
