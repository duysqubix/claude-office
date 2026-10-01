// The building shell: honey-wood floor, cream walls with a mint wainscot and an orange cap,
// windows on the east/west/south walls, and the sliding glass entrance doors.
import * as THREE from 'three';
import { PALETTE } from '../style/palette';
import { Batch, shade, type Finish, type Vec3 } from './kit';
import { OFFICE } from './layout';
import { aabb, type WallSide, type WorldCtx } from './ctx';
import type { FadeItem } from './fader';

const T = OFFICE.wallT;
const H = OFFICE.wallH;
const HW = OFFICE.halfW;
const HD = OFFICE.halfD;
const SILL = 0.95;
const HEAD = 2.12;
const TRIM = '#FFFDF8';
const SEAM = 0.05;

interface Bay {
  side: WallSide;
  u0: number;
  u1: number;
  item: FadeItem;
}

export interface Building {
  bayAt(side: WallSide, u: number): FadeItem | undefined;
  setDoorOpen(open: boolean): void;
}

/** World position of a point on a wall: `u` along the wall, `v` across it (+ = +Z / +X). */
export function wallPoint(side: WallSide, u: number, y: number, v = 0): Vec3 {
  switch (side) {
    case 'north':
      return [u, y, -HD - T / 2 + v];
    case 'south':
      return [u, y, HD + T / 2 + v];
    case 'east':
      return [HW + T / 2 + v, y, u];
    case 'west':
      return [-HW - T / 2 + v, y, u];
  }
}

/** +1 or -1: which way `v` points into the room. */
export function inwardSign(side: WallSide): number {
  return side === 'north' || side === 'west' ? 1 : -1;
}

/** Yaw of something hung on the inside face of a wall, facing into the room. */
export function wallFacingYaw(side: WallSide): number {
  switch (side) {
    case 'north':
      return 0;
    case 'south':
      return Math.PI;
    case 'east':
      return -Math.PI / 2;
    case 'west':
      return Math.PI / 2;
  }
}

function dims(side: WallSide, len: number, h: number, thick: number): Vec3 {
  return side === 'north' || side === 'south' ? [len, h, thick] : [thick, h, len];
}

let glassMat: THREE.MeshStandardMaterial | null = null;
export function glassMaterial(): THREE.MeshStandardMaterial {
  if (!glassMat) {
    glassMat = new THREE.MeshStandardMaterial({
      color: PALETTE.glass,
      roughness: 0.08,
      metalness: 0,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      emissive: '#FFFFFF',
      emissiveMap: glareTexture(),
      emissiveIntensity: 0.55,
    });
    glassMat.name = 'glass';
  }
  return glassMat;
}

/** Two soft diagonal highlights, so panes read as glass even with nothing behind them. */
function glareTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#1A1A1A';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#FFFFFF';
  ctx.globalAlpha = 0.85;
  for (const [x, w] of [
    [18, 26],
    [58, 10],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x, 128);
    ctx.lineTo(x + w, 128);
    ctx.lineTo(x + w + 70, 0);
    ctx.lineTo(x + 70, 0);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildBuilding(ctx: WorldCtx): Building {
  const bays: Bay[] = [];

  // ---- Floor -------------------------------------------------------------------------------
  const floorTex = plankTexture();
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set((HW * 2 + T * 2) / 4, (HD * 2 + T * 2) / 4);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(HW * 2 + T * 2, HD * 2 + T * 2),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.8, metalness: 0 }),
  );
  floor.name = 'floor';
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  ctx.root.add(floor);
  // A pale paving strip around the outside of the building.
  ctx.statics.slab(HW * 2 + T * 2 + 1.4, HD * 2 + T * 2 + 1.4, 0.06, 0.5, '#EFE4D2', { at: [0, -0.033, 0], cast: false, finish: 'matte' });

  // ---- Walls -------------------------------------------------------------------------------
  function bay(side: WallSide, u0: number, u1: number, win?: [number, number]): void {
    const b = new Batch();
    // Pieces that meet a neighbouring bay overlap it a little, which hides the rounded seam.
    const outer = side === 'north' || side === 'south' ? HW + T : HD;
    const grow = (u: number, dir: number) => (Math.abs(u) < outer - 1e-3 ? u + dir * SEAM : u);
    const add = (ua: number, ub: number, y0: number, y1: number, thick: number, color: string, r = 0.03, finish: Finish = 'soft') => {
      if (ua === u0) ua = grow(ua, -1);
      if (ub === u1) ub = grow(ub, 1);
      const [w, h, d] = dims(side, ub - ua, y1 - y0, thick);
      b.box(w, h, d, color, { at: wallPoint(side, (ua + ub) / 2, (y0 + y1) / 2), r, finish });
    };
    let glass: THREE.Mesh | null = null;
    if (!win) {
      add(u0, u1, 0, H, T, PALETTE.wall);
    } else {
      const [w0, w1] = win;
      add(u0, w0, 0, H, T, PALETTE.wall);
      add(w1, u1, 0, H, T, PALETTE.wall);
      add(w0, w1, 0, SILL, T, PALETTE.wall);
      add(w0, w1, HEAD, H, T, PALETTE.wall);
      // Chunky white frame with a cross mullion.
      add(w0 - 0.08, w1 + 0.08, HEAD - 0.02, HEAD + 0.09, T + 0.08, TRIM, 0.04);
      add(w0 - 0.08, w0 + 0.02, SILL, HEAD, T + 0.08, TRIM, 0.035);
      add(w1 - 0.02, w1 + 0.08, SILL, HEAD, T + 0.08, TRIM, 0.035);
      add(w0 - 0.1, w1 + 0.1, SILL - 0.05, SILL + 0.06, T + 0.2, TRIM, 0.045);
      const mid = (w0 + w1) / 2;
      add(mid - 0.035, mid + 0.035, SILL, HEAD, 0.09, TRIM, 0.03);
      add(w0, w1, 1.6 - 0.03, 1.6 + 0.03, 0.09, TRIM, 0.025);
      const [gw, gh, gd] = dims(side, w1 - w0, HEAD - SILL, 0.02);
      glass = new THREE.Mesh(new THREE.BoxGeometry(gw, gh, gd), glassMaterial());
      glass.position.set(...wallPoint(side, mid, (SILL + HEAD) / 2));
      glass.name = 'window-glass';
    }
    add(u0, u1, 0, SILL, T + 0.05, PALETTE.wallAccent, 0.025);
    add(u0, u1, SILL - 0.03, SILL + 0.045, T + 0.1, TRIM, 0.03);
    add(u0, u1, H - 0.03, H + 0.1, T + 0.14, PALETTE.wallTrim, 0.06);
    const group = b.build({ name: `wall-${side}` });
    if (glass) group.add(glass);
    ctx.root.add(group);
    bays.push({ side, u0, u1, item: ctx.fader.add(`wall-${side}-${u0.toFixed(1)}`, [group]) });
  }

  // North wall: solid (whiteboard, posters, kitchen and bookshelf hang here).
  const northEdges = [-HW - T, -9.5, -4.8, 0, 4.8, 9.5, HW + T];
  for (let i = 0; i < northEdges.length - 1; i++) bay('north', northEdges[i], northEdges[i + 1]);
  ctx.colliders.push(aabb(-HW - T, HW + T, -HD - T, -HD));

  // East and west walls: five bays with a big window each.
  for (const side of ['east', 'west'] as const) {
    for (let i = 0; i < 5; i++) {
      const u0 = -HD + i * 4;
      bay(side, u0, u0 + 4, [u0 + 0.9, u0 + 3.1]);
    }
  }
  ctx.colliders.push(aabb(HW, HW + T, -HD - T, HD + T), aabb(-HW - T, -HW, -HD - T, HD + T));

  // South wall: shop-front windows either side of the door.
  const D = OFFICE.doorHalf + 0.1;
  const southWest = [-HW - T, -9.6, -5.4, -D];
  const southEast = [D, 5.4, 9.6, HW + T];
  for (const edges of [southWest, southEast]) {
    for (let i = 0; i < edges.length - 1; i++) {
      const u0 = edges[i];
      const u1 = edges[i + 1];
      const inset = Math.min(0.9, (u1 - u0) * 0.22);
      // The open door panels slide into the wall next to the door: keep that stretch solid.
      const w0 = u0 === D ? 3.25 : u0 + inset;
      const w1 = u1 === -D ? -3.25 : u1 - inset;
      bay('south', u0, u1, [w0, w1]);
    }
  }
  ctx.colliders.push(aabb(-HW - T, -OFFICE.doorHalf, HD, HD + T), aabb(OFFICE.doorHalf, HW + T, HD, HD + T));

  // ---- Entrance ----------------------------------------------------------------------------
  const door = buildDoor(ctx, D);
  bays.push({ side: 'south', u0: -D, u1: D, item: door.item });

  return {
    bayAt(side, u) {
      return bays.find((b) => b.side === side && u >= b.u0 && u <= b.u1)?.item;
    },
    setDoorOpen: door.setOpen,
  };
}

function buildDoor(ctx: WorldCtx, D: number) {
  const zc = HD + T / 2;
  const frame = new Batch();
  const dark = PALETTE.doorFrame;
  const DH = OFFICE.doorH;
  // Wall above the door, with the same cap as its neighbours.
  frame.box(D * 2, H - DH, T, PALETTE.wall, { at: [0, (H + DH) / 2, zc], r: 0.03 });
  frame.box(D * 2, 0.13, T + 0.14, PALETTE.wallTrim, { at: [0, H + 0.035, zc], r: 0.06 });
  // Chunky dark frame: two posts and a header.
  for (const s of [-1, 1]) frame.box(0.16, DH + 0.12, T + 0.14, dark, { at: [s * (OFFICE.doorHalf + 0.04), (DH + 0.12) / 2, zc], r: 0.05 });
  frame.box(D * 2 + 0.12, 0.16, T + 0.14, dark, { at: [0, DH + 0.06, zc], r: 0.05 });
  // Threshold strip on the floor.
  frame.box(OFFICE.doorHalf * 2, 0.02, T + 0.1, shade(dark, 0.25), { at: [0, 0.008, zc], r: 0.008, cast: false });
  const frameGroup = frame.build({ name: 'door-frame' });
  ctx.root.add(frameGroup);

  const panelW = OFFICE.doorHalf + 0.03;
  const panelH = DH - 0.02;
  const panels: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const p = new Batch();
    const rail = 0.07;
    p.box(panelW, rail, 0.07, dark, { at: [0, panelH - rail / 2, 0], r: 0.03 });
    p.box(panelW, rail * 1.6, 0.07, dark, { at: [0, rail * 0.8, 0], r: 0.03 });
    p.box(rail, panelH, 0.07, dark, { at: [(-panelW / 2 + rail / 2) * -s, panelH / 2, 0], r: 0.03 });
    p.box(rail, panelH, 0.07, dark, { at: [(panelW / 2 - rail / 2) * -s, panelH / 2, 0], r: 0.03 });
    // Push bar.
    p.box(0.05, 0.7, 0.1, PALETTE.metal, { at: [(panelW / 2 - 0.18) * -s, 1.05, 0], r: 0.025, finish: 'gloss' });
    const g = p.build({ name: 'door-panel' });
    const glass = new THREE.Mesh(new THREE.BoxGeometry(panelW - rail * 2, panelH - rail * 2.6, 0.02), glassMaterial());
    glass.position.set(0, panelH / 2 + rail * 0.3, 0);
    g.add(glass);
    g.position.set(s * (panelW / 2), 0, zc + s * 0.03);
    ctx.root.add(g);
    panels.push(g);
  }

  const item = ctx.fader.add('door', [frameGroup, ...panels]);
  let open = 0;
  let goal = 0;
  ctx.tickers.push((dt) => {
    if (open === goal) return;
    open += (goal - open) * (1 - Math.exp(-dt * 7));
    if (Math.abs(goal - open) < 0.002) open = goal;
    const e = open * open * (3 - 2 * open);
    panels.forEach((g, i) => {
      const s = i === 0 ? -1 : 1;
      g.position.x = s * (panelW / 2 + e * (panelW - 0.06));
    });
  });
  return {
    item,
    setOpen(o: boolean) {
      goal = o ? 1 : 0;
    },
  };
}

/** 4 × 4 m of staggered honey planks, tiling in both directions. */
function plankTexture(): THREE.CanvasTexture {
  const S = 1024;
  const rows = 12;
  const ph = S / rows;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#D3A066';
  ctx.fillRect(0, 0, S, S);
  let seed = 12345;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const base = new THREE.Color(PALETTE.floorWood);
  const alt = new THREE.Color(PALETTE.floorWoodAlt);
  for (let r = 0; r < rows; r++) {
    let x = -rand() * S * 0.5;
    while (x < S) {
      const len = (0.45 + rand() * 0.4) * S;
      const col = base.clone().lerp(alt, rand() * 0.9);
      const hsl = { h: 0, s: 0, l: 0 };
      col.getHSL(hsl);
      col.setHSL(hsl.h, hsl.s * 1.05, hsl.l + (rand() - 0.5) * 0.035);
      ctx.fillStyle = '#' + col.getHexString();
      for (const off of [0, -S, S]) {
        ctx.beginPath();
        ctx.roundRect(x + off + 2, r * ph + 2, len - 4, ph - 4, 10);
        ctx.fill();
      }
      // A couple of faint grain streaks.
      ctx.strokeStyle = 'rgba(150, 95, 45, 0.07)';
      ctx.lineWidth = 1.5;
      for (let k = 0; k < 2; k++) {
        const gy = r * ph + 8 + rand() * (ph - 16);
        for (const off of [0, -S, S]) {
          ctx.beginPath();
          ctx.moveTo(x + off + 10, gy);
          ctx.bezierCurveTo(x + off + len * 0.3, gy + 3, x + off + len * 0.6, gy - 3, x + off + len - 10, gy);
          ctx.stroke();
        }
      }
      x += len;
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
