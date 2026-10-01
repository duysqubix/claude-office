// Outside: lawn, path to the door, doormat, round trees, a bench, bushes, flowers, a hedge
// around the garden and soft rolling hills fading into the haze.
import * as THREE from 'three';
import { PALETTE } from '../style/palette';
import { Batch, CanvasTex, FONT_FAMILY, fitText, pickR, rng, shade } from './kit';
import { NAV_BOUNDS, OFFICE } from './layout';
import { aabb, footprint, type WorldCtx } from './ctx';
import { sparkle } from './screens';
import { sway, tallProp } from './props';

const OUT_Z = OFFICE.halfD + OFFICE.wallT;

export function buildOutdoor(ctx: WorldCtx): void {
  const b = ctx.statics;

  // Lawn.
  const lawnTex = grassTexture();
  lawnTex.wrapS = lawnTex.wrapT = THREE.RepeatWrapping;
  lawnTex.repeat.set(50, 50);
  const lawn = new THREE.Mesh(new THREE.CircleGeometry(320, 72), new THREE.MeshStandardMaterial({ map: lawnTex, roughness: 0.95, metalness: 0 }));
  lawn.name = 'lawn';
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.y = -0.02;
  lawn.receiveShadow = true;
  ctx.root.add(lawn);

  // Path from the door to the garden gate, with a doormat.
  const pathLen = NAV_BOUNDS.maxZ + 6 - OUT_Z;
  b.slab(3.5, pathLen, 0.05, 0.3, shade(PALETTE.path, -0.08), { at: [0, -0.02, OUT_Z + pathLen / 2], cast: false, finish: 'matte' });
  b.slab(3.1, pathLen - 0.3, 0.055, 0.25, PALETTE.path, { at: [0, -0.019, OUT_Z + pathLen / 2], cast: false, finish: 'matte' });
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
  const doormat = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.78), new THREE.MeshStandardMaterial({ map: mat.tex, roughness: 0.95 }));
  doormat.rotation.x = -Math.PI / 2;
  doormat.position.set(0, 0.014, OUT_Z + 0.75);
  doormat.receiveShadow = true;
  ctx.root.add(doormat);

  // Company sign: a chunky monument by the path, angled toward people walking up.
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
  const signFace = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.67), new THREE.MeshStandardMaterial({ map: signTex.tex, roughness: 0.6 }));
  signFace.position.set(0, 1.0, 0.075);
  signFace.rotation.x = -0.08;
  const sb = new Batch();
  sb.box(2.45, 0.8, 0.14, shade(PALETTE.claude, -0.1), { at: [0, 1.0, 0], rot: [-0.08, 0, 0], r: 0.07 });
  sb.box(2.7, 0.45, 0.5, '#E9DCC6', { at: [0, 0.22, -0.02], r: 0.12, finish: 'matte' });
  for (const k of [-1, 1]) sb.box(0.16, 0.5, 0.16, PALETTE.doorFrame, { at: [k * 0.85, 0.58, -0.02], r: 0.05 });
  for (let i = 0; i < 7; i++) {
    const fx = -1.15 + i * 0.38;
    sb.ball([0.17, 0.13, 0.15], shade(PALETTE.treeLeaf[1], (i % 3) * 0.03), { at: [fx, 0.5, 0.3], ws: 12, hs: 8 });
    if (i % 2 === 0) sb.ball(0.05, ['#FF7EB6', '#FFD93D', '#FFFFFF', '#FF6B6B'][i % 4], { at: [fx + 0.06, 0.62, 0.38], cast: false, ws: 8, hs: 6 });
  }
  sign.add(sb.build({ name: 'office-sign' }), signFace);
  sign.position.set(3.35, 0, OUT_Z + 1.9);
  sign.rotation.y = -0.35;
  ctx.root.add(sign);
  ctx.colliders.push(footprint(3.35, OUT_Z + 1.9, 2.8, 0.9));
  ctx.blobs.add(3.35, OUT_Z + 1.9, 3.2, 1.2, { yaw: -0.35 });

  // Trees: trunk plus a cluster of round crowns. Out-of-frustum trees still get a blob shadow.
  const trees: [number, number, number][] = [
    [-3.5, 13.0, 1.0],
    [-3.4, 23.8, 1.1],
    [3.7, 24.6, 1.0],
    [-22.4, 25.4, 1.2],
    [22.4, 25.2, 1.1],
    [-22.6, 9.2, 1.0],
    [22.5, 8.6, 1.15],
    [-22.4, -1.6, 1.05],
    [22.6, -1.8, 0.95],
    [-21.6, -12.4, 1.2],
    [21.8, -12.8, 1.1],
    [-15.2, -13.7, 1.0],
    [-7.2, -13.6, 1.15],
    [0.6, -13.9, 0.95],
    [8.0, -13.7, 1.1],
    [15.6, -13.5, 1.0],
    [-10.0, 25.8, 1.0],
    [10.4, 25.6, 1.1],
    [-17.0, 9.4, 0.9],
    [17.2, 9.0, 0.95],
  ];
  trees.forEach(([x, z, s], i) => {
    const r = rng(900 + i);
    // Each garden tree fades on its own so it can never hide the manager.
    const t = tallProp(ctx, `tree-${i}`, (tb) => tree(tb, 0, 0, s, r), { at: [x, z] });
    sway(ctx, t, 0.012, r());
    ctx.colliders.push(footprint(x, z, 0.5 * s, 0.5 * s));
    ctx.blobs.add(x, z, 3.6 * s, 3.6 * s, { shape: 'round' });
  });

  // Bench beside the path.
  const bx = 2.55;
  const bz = 17.2;
  for (let i = 0; i < 3; i++) b.box(0.13, 0.05, 1.7, PALETTE.wood, { at: [bx + (i - 1) * 0.15, 0.45, bz], r: 0.02 });
  for (let i = 0; i < 2; i++) b.box(0.05, 0.13, 1.7, PALETTE.wood, { at: [bx + 0.27, 0.62 + i * 0.17, bz], rot: [0, 0, -0.15], r: 0.02 });
  for (const s of [-1, 1]) {
    b.box(0.5, 0.42, 0.07, PALETTE.doorFrame, { at: [bx + 0.02, 0.21, bz + s * 0.7], r: 0.03 });
    b.box(0.07, 0.42, 0.07, PALETTE.doorFrame, { at: [bx + 0.29, 0.62, bz + s * 0.7], rot: [0, 0, -0.15], r: 0.03 });
  }
  ctx.colliders.push(footprint(bx + 0.05, bz, 0.7, 1.8));
  ctx.blobs.add(bx + 0.05, bz, 1.0, 2.1);

  // Bushes hugging the building, with flowers.
  const bushRows: [number, number, number, number][] = [
    [-13.6, -3.4, OUT_Z + 0.6, 0],
    [3.4, 13.6, OUT_Z + 0.6, 0],
    [-9.0, 9.0, -OUT_Z - 0.6, 0],
  ];
  const fr = rng(4242);
  for (const [x0, x1, z] of bushRows) {
    for (let x = x0; x <= x1; x += 0.95 + fr() * 0.3) bush(b, x, z, 0.45 + fr() * 0.2, fr);
    ctx.colliders.push(aabb(x0 - 0.6, x1 + 0.6, z - 0.55, z + 0.55));
    ctx.blobs.add((x0 + x1) / 2, z, x1 - x0 + 1.4, 1.5);
  }
  for (const side of [-1, 1]) {
    const x = side * (OFFICE.halfW + OFFICE.wallT + 0.6);
    for (let z = -8.5; z <= 8.5; z += 1.0 + fr() * 0.3) bush(b, x, z, 0.4 + fr() * 0.2, fr);
    ctx.colliders.push(aabb(x - 0.55, x + 0.55, -9.1, 9.1));
    ctx.blobs.add(x, 0, 1.4, 18.6);
  }

  // Hedge around the garden, with a little gate across the path.
  const { minX, maxX, minZ, maxZ } = NAV_BOUNDS;
  const hedge = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    // The hedge is outside the shadow frustum, so it skips the shadow pass entirely.
    b.box(alongX ? len : 0.9, 0.85, alongX ? 0.9 : len, PALETTE.grassDark, { at: [cx, 0.42, cz], r: 0.4, seg: 4, finish: 'matte', cast: false });
    for (let t = 0.5; t < len; t += 1.1) {
      const px = alongX ? Math.min(x0, x1) + t : cx;
      const pz = alongX ? cz : Math.min(z0, z1) + t;
      b.ball([0.55, 0.42, 0.55], shade(PALETTE.grassDark, (fr() - 0.5) * 0.06), { at: [px, 0.82, pz], ws: 14, hs: 10, finish: 'matte', cast: false });
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
  // Gate: two posts and a picket fence section.
  for (const s of [-1, 1]) b.box(0.22, 1.2, 0.22, '#FFFDF7', { at: [s * 1.9, 0.6, maxZ - 0.4], r: 0.06 });
  for (let i = 0; i < 9; i++) b.box(0.12, 0.85, 0.06, '#FFFDF7', { at: [-1.6 + i * 0.4, 0.43, maxZ - 0.4], r: 0.04 });
  for (const y of [0.3, 0.65]) b.box(3.6, 0.08, 0.05, '#FFFDF7', { at: [0, y, maxZ - 0.44], r: 0.025 });

  // Rolling hills and a ring of distant trees, softened by the fog.
  const hills = new Batch();
  const hr = rng(31337);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + hr() * 0.2;
    const d = 85 + hr() * 70;
    const rr = 22 + hr() * 26;
    hills.ball([rr, rr * (0.28 + hr() * 0.18), rr], pickR(hr, ['#8EDB6A', '#7ED957', '#9BE37A', '#76CF55']), {
      at: [Math.cos(a) * d, -rr * 0.08, Math.sin(a) * d],
      ws: 28,
      hs: 14,
      cast: false,
      finish: 'matte',
    });
  }
  for (let i = 0; i < 46; i++) {
    const a = hr() * Math.PI * 2;
    const d = 34 + hr() * 30;
    tree(hills, Math.cos(a) * d, Math.sin(a) * d, 0.9 + hr() * 0.6, hr, false);
  }
  const hillGroup = hills.build({ name: 'scenery', receive: false });
  ctx.root.add(hillGroup);
}

function tree(b: Batch, x: number, z: number, s: number, r: () => number, cast = true): void {
  const h = (1.5 + r() * 0.5) * s;
  // Background trees (no shadows) are only ever seen small, so they get fewer segments.
  const ws = cast ? 22 : 12;
  const hs = cast ? 15 : 8;
  b.cyl(0.14 * s, 0.2 * s, h, PALETTE.treeTrunk, { at: [x, h / 2, z], seg: cast ? 12 : 8, cast });
  const n = 3 + Math.floor(r() * 3);
  const leaf = pickR(r, PALETTE.treeLeaf);
  b.ball(1.2 * s, leaf, { at: [x, h + 0.75 * s, z], cast, ws: ws + 4, hs: hs + 3 });
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r();
    const rad = (0.55 + r() * 0.25) * s;
    b.ball((0.7 + r() * 0.3) * s, shade(leaf, (r() - 0.5) * 0.08), {
      at: [x + Math.cos(a) * rad, h + (0.45 + r() * 0.7) * s, z + Math.sin(a) * rad],
      cast,
      ws,
      hs,
    });
  }
}

function bush(b: Batch, x: number, z: number, s: number, r: () => number): void {
  b.ball([s * 1.1, s * 0.85, s], shade(PALETTE.treeLeaf[1], (r() - 0.5) * 0.06), { at: [x, s * 0.6, z], ws: 16, hs: 12 });
  if (r() < 0.6) {
    const col = pickR(r, ['#FF7EB6', '#FFD93D', '#FFFFFF', '#FF6B6B', '#B983FF']);
    for (let i = 0; i < 4; i++) {
      const a = r() * Math.PI * 2;
      b.ball(0.07, col, { at: [x + Math.cos(a) * s * 0.7, s * (0.75 + r() * 0.5), z + Math.sin(a) * s * 0.6], cast: false, ws: 8, hs: 6 });
    }
  }
}

function grassTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = PALETTE.grass;
  ctx.fillRect(0, 0, S, S);
  const r = rng(77);
  for (let i = 0; i < 1400; i++) {
    const x = r() * S;
    const y = r() * S;
    const light = r() < 0.5;
    ctx.fillStyle = light ? 'rgba(170, 235, 120, 0.25)' : 'rgba(70, 160, 60, 0.18)';
    const rx = 1 + r() * 3;
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        if (x + ox < -6 || x + ox > S + 6 || y + oy < -6 || y + oy > S + 6) continue;
        ctx.beginPath();
        ctx.ellipse(x + ox, y + oy, rx, rx * 0.6, r() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
