// Light fittings: pendant lamps hanging from the ceiling (glowing bulbs that bloom, a warm
// pool of light on the ceiling above each) and a few floor lamps by the cosy corners. They
// are decorative: the room is lit by the sun (the roof casts no shadow) and the sky fill.
import * as THREE from 'three';
import D from './dimensions.json';
import { Batch, G } from './kit';
import { tallProp } from './props';
import { POD_SLOTS } from './layout';
import type { WorldCtx } from './ctx';

const WARM_BULB = '#FFE7B0';

/** Lamp shade: a thick lathe shell, coloured outside and softly lit inside. Origin at the rim centre. */
function shadeGeometries(r: number, h: number): [THREE.BufferGeometry, THREE.BufferGeometry] {
  const outer = G.lathe(`shadeO${r},${h}`, [
    [r, 0],
    [r * 0.97, h * 0.18],
    [r * 0.8, h * 0.62],
    [r * 0.45, h],
    [0.05, h],
  ]);
  const inner = G.lathe(`shadeI${r},${h}`, [
    [0.05, h - 0.018],
    [r * 0.43, h - 0.018],
    [r * 0.78, h * 0.6],
    [r * 0.955, h * 0.16],
    [r - 0.012, 0],
  ]);
  return [outer, inner];
}

/** A pendant lamp hanging from the ceiling at `ceilingY`. Built around the floor point under it. */
export function buildPendantLamp(b: Batch, color: string, d = D.pendantLamp, ceilingY = D.building.wallH): void {
  const shadeTop = d.bottomY + d.shadeH;
  b.cyl(0.011, 0.011, ceilingY - shadeTop, '#3B4252', { at: [0, (ceilingY + shadeTop) / 2, 0], seg: 6, cast: false });
  b.puck(0.09, 0.05, '#3B4252', { at: [0, ceilingY - 0.025, 0], cast: false });
  b.cyl(0.035, 0.045, 0.07, '#3B4252', { at: [0, shadeTop + 0.03, 0], seg: 12, cast: false });
  const [outer, inner] = shadeGeometries(d.shadeR, d.shadeH);
  b.add(outer, color, { at: [0, d.bottomY, 0], finish: 'plastic', cast: false });
  b.add(inner, '#FFF6E2', { at: [0, d.bottomY, 0], glow: 0.9, cast: false });
  b.torus(d.shadeR - 0.004, 0.016, color, { at: [0, d.bottomY, 0], rot: [Math.PI / 2, 0, 0], cast: false });
  b.ball([0.075, 0.09, 0.075], WARM_BULB, { at: [0, d.bottomY + 0.03, 0], glow: 3.2, cast: false });
}

/** A floor lamp: weighted base, slim pole, cone shade with a glowing bulb. Pivot at the floor. */
export function buildFloorLamp(b: Batch, color: string, d = D.floorLamp): void {
  b.puck(0.2, 0.05, '#3B4252', { at: [0, 0.025, 0], finish: 'plastic' });
  b.cyl(0.018, 0.018, d.h - 0.3, '#C8B07A', { at: [0, (d.h - 0.3) / 2 + 0.05, 0], seg: 10, finish: 'plastic' });
  const [outer, inner] = shadeGeometries(d.shadeR, 0.3);
  b.add(outer, color, { at: [0, d.h - 0.32, 0], finish: 'cloth' });
  b.add(inner, '#FFF6E2', { at: [0, d.h - 0.32, 0], glow: 0.8, cast: false });
  b.ball(0.06, WARM_BULB, { at: [0, d.h - 0.24, 0], glow: 3.0, cast: false });
}

export function buildLights(ctx: WorldCtx): void {
  const lamps: [number, number, string][] = [
    ...POD_SLOTS.filter((s) => !s.outdoor).map((s, i): [number, number, string] => [s.x, s.z, i % 2 ? '#FFC94A' : '#5CC8FF']),
    [0, -7.7, '#FF7A6B'],
    [0, -6.1, '#FF7A6B'],
    [-11.8, -6.9, '#6EDC9A'],
    [6.0, 7.6, '#FFC94A'],
    [10.8, -7.4, '#B48CFF'],
    [-9.6, 7.6, '#FF9DCB'],
    [-6.4, 7.6, '#FF9DCB'],
    [-3.6, 7.6, '#FF9DCB'],
    [12.6, 7.0, '#6EDC9A'],
  ];
  const pools: number[] = [];
  lamps.forEach(([x, z, color], i) => {
    tallProp(ctx, `pendant-${i}`, (b) => buildPendantLamp(b, color), { at: [x, z] }).userData.overhead = true;
    pools.push(x, z);
  });

  for (const [x, z, color] of [
    [-13.42, -8.45, '#FFD27F'],
    [13.42, 5.3, '#FF9DCB'],
    [13.45, -8.5, '#B48CFF'],
  ] as const) {
    tallProp(ctx, 'floor-lamp', (b) => buildFloorLamp(b, color), { at: [x, z] });
    ctx.colliders.push({ minX: x - 0.22, maxX: x + 0.22, minZ: z - 0.22, maxZ: z + 0.22 });
    ctx.blobs.add(x, z, 0.6, 0.6, { shape: 'round' });
  }

  ctx.root.add(ceilingPools(pools));
}

/** Warm glow on the ceiling around each lamp's mount: one additive mesh for all of them. */
function ceilingPools(xz: number[]): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g2 = c.getContext('2d')!;
  const grad = g2.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,214,150,0.55)');
  grad.addColorStop(0.35, 'rgba(255,214,150,0.22)');
  grad.addColorStop(1, 'rgba(255,214,150,0)');
  g2.fillStyle = grad;
  g2.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;

  const R = 1.4;
  const y = D.building.wallH - 0.008;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < xz.length; i += 2) {
    const base = pos.length / 3;
    const x = xz[i];
    const z = xz[i + 1];
    pos.push(x - R, y, z - R, x + R, y, z - R, x + R, y, z + R, x - R, y, z + R);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    // Faces downward (seen from below).
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  mesh.name = 'ceiling-light-pools';
  mesh.userData.overhead = true;
  mesh.renderOrder = 2;
  return mesh;
}
