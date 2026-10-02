// The building: an enclosed loft. Honey-wood floor; pale walls with a darker skirting and a
// mint band; big windows plus a clerestory strip on the east, west and south walls; a beamed
// ceiling with a skylight; a flat roof with a chunky orange parapet, skylight boxes, AC units
// and a rooftop sign; and the sliding glass entrance doors.
//
// The roof, ceiling and everything on the roof never cast shadows, so the sun still lights
// the office (the walls do, which gives soft window light near them).
import * as THREE from 'three';
import { PALETTE } from '../style/palette';
import D from './dimensions.json';
import { Batch, CanvasTex, fitText, pickR, rng, shade, type Vec3 } from './kit';
import { OFFICE } from './layout';
import { aabb, type WallSide, type WorldCtx } from './ctx';
import { sparkle } from './screens';
import { findNode } from '../models';
import { disposeGroup, disposeInstanced, instancedModel, placement, swapModel } from './modelkit';

const B = D.building;
const T = B.wallT;
const H = B.wallH;
const HW = B.halfW;
const HD = B.halfD;
const SILL = D.window.sill;
const HEAD = D.window.head;
const C_SILL = D.clerestory.sill;
const C_HEAD = D.clerestory.head;
const TRIM = '#FFF8EE';
const SKIRT = '#D9B98F';
const ROOF = '#C3CACE';
/** Pieces that meet a neighbouring bay overlap it a little, which hides the rounded seam. */
const SEAM = 0.05;

export interface Building {
  setDoorOpen(open: boolean): void;
  /** Invisible proxy boxes for the walls (door gap left open), ceiling and roof: cheap camera raycasts. */
  cameraBlockers: THREE.Object3D[];
  interior: { minX: number; maxX: number; minZ: number; maxZ: number; ceilingY: number };
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
      roughness: 0.05,
      metalness: 0,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      emissive: '#FFFFFF',
      emissiveMap: glareTexture(),
      emissiveIntensity: 0.5,
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

interface BayWindows {
  /** Main window [u0, u1] (sill to head). */
  main?: [number, number];
  /** High clerestory window [u0, u1]. */
  high?: [number, number];
}

/** One window opening, for the catalog window models. */
interface WindowSpot {
  side: WallSide;
  /** Centre along the wall, and the opening's width. */
  u: number;
  width: number;
  sill: number;
  high: boolean;
}

export function buildBuilding(ctx: WorldCtx): Building {
  const b = ctx.statics;
  const glass: THREE.BufferGeometry[] = [];
  // Window trims are their own batch: the catalog window models replace them.
  const trims = new Batch();
  const windows: WindowSpot[] = [];

  // ---- Floor -------------------------------------------------------------------------------
  const floorTex = plankTexture();
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set((HW * 2 + T * 2) / 4, (HD * 2 + T * 2) / 4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2 + T * 2, HD * 2 + T * 2), floorMaterial(floorTex));
  floor.name = 'floor';
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  ctx.root.add(floor);

  // ---- Walls -------------------------------------------------------------------------------
  function bay(side: WallSide, u0: number, u1: number, win: BayWindows = {}): void {
    const outer = side === 'north' || side === 'south' ? HW + T : HD;
    const grow = (u: number, dir: number) => (Math.abs(u) < outer - 1e-3 ? u + dir * SEAM : u);
    const add = (ua: number, ub: number, y0: number, y1: number, thick: number, color: string, r = 0.03, finish: 'matte' | 'soft' = 'matte', into = b) => {
      if (ua === u0) ua = grow(ua, -1);
      if (ub === u1) ub = grow(ub, 1);
      const [w, h, d] = dims(side, ub - ua, y1 - y0, thick);
      into.box(w, h, d, color, { at: wallPoint(side, (ua + ub) / 2, (y0 + y1) / 2), r, finish });
    };
    const pane = (a: number, c: number, y0: number, y1: number) => {
      const [gw, gh, gd] = dims(side, c - a, y1 - y0, 0.02);
      const g = new THREE.BoxGeometry(gw, gh, gd);
      g.translate(...wallPoint(side, (a + c) / 2, (y0 + y1) / 2));
      glass.push(g);
    };
    const frame = (a: number, c: number, y0: number, y1: number, crossY: number | null) => {
      add(a - 0.08, c + 0.08, y1 - 0.02, y1 + 0.09, T + 0.08, TRIM, 0.04, 'soft', trims);
      add(a - 0.08, a + 0.02, y0, y1, T + 0.08, TRIM, 0.035, 'soft', trims);
      add(c - 0.02, c + 0.08, y0, y1, T + 0.08, TRIM, 0.035, 'soft', trims);
      add(a - 0.1, c + 0.1, y0 - 0.05, y0 + 0.06, T + 0.2, TRIM, 0.045, 'soft', trims);
      const mid = (a + c) / 2;
      add(mid - 0.035, mid + 0.035, y0, y1, 0.09, TRIM, 0.03, 'soft', trims);
      if (crossY !== null) add(a, c, crossY - 0.03, crossY + 0.03, 0.09, TRIM, 0.025, 'soft', trims);
      pane(a, c, y0, y1);
      windows.push({ side, u: mid, width: c - a, sill: y0, high: crossY === null });
    };

    const span = win.main ?? win.high;
    if (!span) {
      add(u0, u1, 0, H, T, PALETTE.wall);
    } else {
      const [w0, w1] = span;
      add(u0, w0, 0, H, T, PALETTE.wall);
      add(w1, u1, 0, H, T, PALETTE.wall);
      if (win.main) {
        add(w0, w1, 0, SILL, T, PALETTE.wall);
        frame(w0, w1, SILL, HEAD, SILL + (HEAD - SILL) * 0.55);
      }
      const below = win.main ? HEAD : 0;
      if (win.high) {
        add(w0, w1, below, C_SILL, T, PALETTE.wall);
        frame(w0, w1, C_SILL, C_HEAD, null);
        add(w0, w1, C_HEAD, H, T, PALETTE.wall);
      } else {
        add(w0, w1, below, H, T, PALETTE.wall);
      }
    }
    // Skirting board, mint band (also the window sill line) and a soft cornice at the ceiling.
    add(u0, u1, 0, B.skirtingH, T + 0.05, SKIRT, 0.02, 'soft');
    add(u0, u1, B.bandY0, B.bandY1, T + 0.06, PALETTE.wallAccent, 0.03);
    add(u0, u1, H - 0.12, H, T + 0.08, TRIM, 0.04, 'soft');
  }

  // North wall: solid at eye level (whiteboard, Team Room screen, posters), clerestory up high.
  const northEdges = [-HW - T, -9.5, -4.8, 0, 4.8, 9.5, HW + T];
  for (let i = 0; i < northEdges.length - 1; i++) {
    const u0 = northEdges[i];
    const u1 = northEdges[i + 1];
    const high: [number, number] | undefined = Math.abs((u0 + u1) / 2) > 4 ? [u0 + 0.9, u1 - 0.9] : undefined;
    bay('north', u0, u1, { high });
  }
  ctx.colliders.push(aabb(-HW - T, HW + T, -HD - T, -HD));

  // East and west walls: five bays, each with a big window and a clerestory above it.
  for (const side of ['east', 'west'] as const) {
    for (let i = 0; i < 5; i++) {
      const u0 = -HD + i * 4;
      bay(side, u0, u0 + 4, { main: [u0 + 0.9, u0 + 3.1], high: [u0 + 0.9, u0 + 3.1] });
    }
  }
  ctx.colliders.push(aabb(HW, HW + T, -HD - T, HD + T), aabb(-HW - T, -HW, -HD - T, HD + T));

  // South wall: shop-front windows either side of the door.
  const DOOR = OFFICE.doorHalf + 0.1;
  for (const edges of [
    [-HW - T, -9.6, -5.4, -DOOR],
    [DOOR, 5.4, 9.6, HW + T],
  ]) {
    for (let i = 0; i < edges.length - 1; i++) {
      const u0 = edges[i];
      const u1 = edges[i + 1];
      const inset = Math.min(0.9, (u1 - u0) * 0.22);
      // The open door panels slide into the wall next to the door: keep that stretch solid.
      const w0 = u0 === DOOR ? 3.25 : u0 + inset;
      const w1 = u1 === -DOOR ? -3.25 : u1 - inset;
      bay('south', u0, u1, { main: [w0, w1], high: [w0, w1] });
    }
  }
  ctx.colliders.push(aabb(-HW - T, -OFFICE.doorHalf, HD, HD + T), aabb(OFFICE.doorHalf, HW + T, HD, HD + T));

  // Exterior pilasters at the bay joints: a slightly deeper cream, they give the facade rhythm.
  const pilaster = (side: WallSide, u: number) => {
    const out = side === 'north' || side === 'west' ? -1 : 1;
    const [w, h, d] = dims(side, 0.42, H, 0.1);
    b.box(w, h, d, '#F3E3C8', { at: wallPoint(side, u, H / 2, out * (T / 2 + 0.05)), r: 0.04, finish: 'matte' });
  };
  for (const u of [-9.5, -4.8, 4.8, 9.5]) pilaster('north', u);
  for (const u of [-9.6, -5.4, 5.4, 9.6]) pilaster('south', u);
  for (const side of ['east', 'west'] as const) for (const u of [-6, -2, 2, 6]) pilaster(side, u);

  // ---- Entrance ----------------------------------------------------------------------------
  const door = buildDoor(ctx, DOOR);

  // ---- Ceiling (inside) --------------------------------------------------------------------
  buildCeiling(ctx);

  // ---- Roof (outside) ----------------------------------------------------------------------
  buildRoof(ctx);

  const glassMesh = new THREE.Mesh(mergeAll(glass), glassMaterial());
  glassMesh.name = 'window-glass';
  ctx.root.add(glassMesh);
  const trimGroup = trims.build({ name: 'window-trims' });
  ctx.root.add(trimGroup);
  void swapWindows(ctx, windows, trimGroup);

  // ---- Camera blockers ---------------------------------------------------------------------
  const blockerMat = new THREE.MeshBasicMaterial({ visible: false });
  const cameraBlockers: THREE.Object3D[] = [];
  const blocker = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), blockerMat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.name = 'camera-blocker';
    m.visible = false;
    ctx.root.add(m);
    cameraBlockers.push(m);
  };
  const roofTop = H + B.roofT + B.parapetH;
  blocker(-HW - T, HW + T, 0, H, -HD - T, -HD);
  blocker(HW, HW + T, 0, H, -HD - T, HD + T);
  blocker(-HW - T, -HW, 0, H, -HD - T, HD + T);
  blocker(-HW - T, -OFFICE.doorHalf, 0, H, HD, HD + T);
  blocker(OFFICE.doorHalf, HW + T, 0, H, HD, HD + T);
  blocker(-OFFICE.doorHalf, OFFICE.doorHalf, OFFICE.doorH, H, HD, HD + T);
  // Ceiling and roof in one slab (the beams hang below it; interior.ceilingY keeps the camera under them).
  blocker(-HW - T - 0.2, HW + T + 0.2, H - B.beamDrop, roofTop, -HD - T - 0.2, HD + T + 0.2);
  ctx.cameraBlockers.push(...cameraBlockers);

  return {
    setDoorOpen: door.setOpen,
    cameraBlockers,
    interior: { minX: -HW, maxX: HW, minZ: -HD, maxZ: HD, ceilingY: B.cameraCeilingY },
  };
}

/**
 * The catalog windows (office_window, clerestory_window: origin at the sill line, centred in the
 * wall), stretched in X to each opening. Our own glare glass stays; both must load or the
 * procedural trims stay.
 */
async function swapWindows(ctx: WorldCtx, windows: WindowSpot[], trims: THREE.Object3D): Promise<void> {
  const place = (w: WindowSpot) => {
    const [x, y, z] = wallPoint(w.side, w.u, w.sill);
    const yaw = w.side === 'north' || w.side === 'south' ? 0 : -Math.PI / 2;
    return placement(x, y, z, yaw).multiply(new THREE.Matrix4().makeScale(w.width / D.window.w, 1, 1));
  };
  const [main, high] = await Promise.all([
    instancedModel('office_window', windows.filter((w) => !w.high).map(place), { hide: ['Glass'] }),
    instancedModel('clerestory_window', windows.filter((w) => w.high).map(place), { hide: ['Glass'] }),
  ]);
  if (!main || !high) {
    for (const m of [main, high]) if (m) disposeInstanced(m.group);
    return;
  }
  ctx.root.add(main.group, high.group);
  disposeGroup(trims);
}

function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  for (const g of list) {
    const ng = g.index ? g.toNonIndexed() : g;
    pos.push(...(ng.getAttribute('position').array as Float32Array));
    nor.push(...(ng.getAttribute('normal').array as Float32Array));
    uv.push(...(ng.getAttribute('uv').array as Float32Array));
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}

function buildDoor(ctx: WorldCtx, half: number) {
  const zc = HD + T / 2;
  const frame = ctx.statics;
  const dark = PALETTE.doorFrame;
  const DH = OFFICE.doorH;
  // Wall above the door up to the ceiling, with the same band and cornice as its neighbours.
  frame.box(half * 2, H - DH, T, PALETTE.wall, { at: [0, (H + DH) / 2, zc], r: 0.03, finish: 'matte' });
  frame.box(half * 2, 0.12, T + 0.08, TRIM, { at: [0, H - 0.06, zc], r: 0.04 });
  // Chunky dark frame: two posts and a header, and a threshold strip on the floor. Frame and
  // panels share a group centred in the doorway, like the catalog sliding_door that replaces them.
  const door = new THREE.Group();
  door.name = 'door';
  door.position.set(0, 0, zc);
  ctx.root.add(door);
  const df = new Batch();
  for (const s of [-1, 1]) df.box(D.door.frameW, DH + 0.12, T + 0.14, dark, { at: [s * (OFFICE.doorHalf + 0.04), (DH + 0.12) / 2, 0], r: 0.05 });
  df.box(half * 2 + 0.12, 0.16, T + 0.14, dark, { at: [0, DH + 0.06, 0], r: 0.05 });
  df.box(OFFICE.doorHalf * 2, 0.02, T + 0.1, shade(dark, 0.25), { at: [0, 0.008, 0], r: 0.008, cast: false });
  door.add(df.build({ name: 'door-frame' }));

  const panelW = OFFICE.doorHalf + 0.03;
  const panelH = DH - 0.02;
  let panels: THREE.Object3D[] = [];
  let rest = [-panelW / 2, panelW / 2];
  for (const s of [-1, 1]) {
    const p = new Batch();
    const rail = 0.07;
    p.box(panelW, rail, D.door.panelT, dark, { at: [0, panelH - rail / 2, 0], r: 0.03 });
    p.box(panelW, rail * 1.6, D.door.panelT, dark, { at: [0, rail * 0.8, 0], r: 0.03 });
    p.box(rail, panelH, D.door.panelT, dark, { at: [(-panelW / 2 + rail / 2) * -s, panelH / 2, 0], r: 0.03 });
    p.box(rail, panelH, D.door.panelT, dark, { at: [(panelW / 2 - rail / 2) * -s, panelH / 2, 0], r: 0.03 });
    p.box(0.05, 0.7, 0.1, PALETTE.metal, { at: [(panelW / 2 - 0.18) * -s, 1.05, 0], r: 0.025, finish: 'plastic' });
    const g = p.build({ name: 'door-panel' });
    const pane = new THREE.Mesh(new THREE.BoxGeometry(panelW - rail * 2, panelH - rail * 2.6, 0.02), glassMaterial());
    pane.position.set(0, panelH / 2 + rail * 0.3, 0);
    g.add(pane);
    g.position.set(s * (panelW / 2), 0, s * 0.03);
    door.add(g);
    panels.push(g);
  }
  // The catalog door's panels are nodes DoorL / DoorR (pivot at each panel's bottom centre).
  void swapModel(ctx, door, 'sliding_door', { materials: { Glass: glassMaterial() } }).then((m) => {
    const l = m && findNode(m, 'DoorL');
    const r = m && findNode(m, 'DoorR');
    if (!l || !r) return;
    panels = [l, r];
    rest = [l.position.x, r.position.x];
    l.position.x = rest[0] - ease(open) * D.door.travel;
    r.position.x = rest[1] + ease(open) * D.door.travel;
  });

  // A rounded canopy over the entrance, in the company orange, with a soft underside light.
  const cp = D.canopy;
  const canopyZ = HD + T + cp.depth / 2 - 0.05;
  frame.slab(cp.w, cp.depth, cp.t, 0.4, PALETTE.claude, { at: [0, cp.y + cp.t / 2, canopyZ], finish: 'plastic' });
  frame.slab(cp.w - 0.24, cp.depth - 0.2, 0.05, 0.3, '#FFF1D6', { at: [0, cp.y - 0.02, canopyZ - 0.05], glow: 0.6, cast: false });
  for (const s of [-1, 1]) frame.box(0.08, 0.5, 0.08, PALETTE.doorFrame, { at: [s * (cp.w / 2 - 0.3), cp.y + 0.4, HD + T + 0.55], rot: [-0.85, 0, 0], r: 0.03 });

  let open = 0;
  let goal = 0;
  const ease = (t: number) => t * t * (3 - 2 * t);
  ctx.tickers.push((dt) => {
    if (open === goal) return;
    open += (goal - open) * (1 - Math.exp(-dt * 7));
    if (Math.abs(goal - open) < 0.002) open = goal;
    const e = ease(open);
    panels.forEach((g, i) => {
      g.position.x = rest[i] + (i === 0 ? -1 : 1) * e * D.door.travel;
    });
  });
  return {
    setOpen(o: boolean) {
      goal = o ? 1 : 0;
    },
  };
}

/** Warm ceiling, rounded wooden beams and a skylight strip over the boulevard. */
function buildCeiling(ctx: WorldCtx): void {
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(HW * 2, HD * 2),
    new THREE.MeshStandardMaterial({ color: '#FFF4E4', roughness: 0.95, metalness: 0 }),
  );
  ceiling.name = 'ceiling';
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = H;
  ceiling.userData.overhead = true;
  ctx.root.add(ceiling);

  const c = new Batch();
  const beamY = H - B.beamDrop / 2;
  for (let x = -HW + 2; x <= HW - 2 + 1e-6; x += B.beamSpacing) {
    if (Math.abs(x) < 1) continue;
    c.box(B.beamW, B.beamDrop, HD * 2, '#E9C894', { at: [x, beamY, 0], r: 0.06, finish: 'wood', cast: false });
  }
  for (let z = -HD + 5; z <= HD - 5 + 1e-6; z += 5) c.box(HW * 2, B.beamDrop * 0.6, 0.22, '#E9C894', { at: [0, H - B.beamDrop * 0.3, z], r: 0.05, finish: 'wood', cast: false });
  // Skylight frame (the glowing "sky" panel sits just under the ceiling).
  const sw = D.skylight.w;
  const sd = D.skylight.d;
  for (const s of [-1, 1]) {
    c.box(sw + 0.3, 0.16, 0.15, TRIM, { at: [0, H - 0.08, (s * (sd + 0.15)) / 2], r: 0.05, cast: false });
    c.box(0.15, 0.16, sd, TRIM, { at: [(s * (sw + 0.15)) / 2, H - 0.08, 0], r: 0.05, cast: false });
  }
  const g = c.build({ name: 'ceiling-beams' });
  g.traverse((o) => (o.castShadow = false));
  g.userData.overhead = true;
  ctx.root.add(g);

  const skyTex = new CanvasTex(64, 256, (cx, w, h) => {
    const grad = cx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#9FD8FF');
    grad.addColorStop(0.5, '#D8F1FF');
    grad.addColorStop(1, '#9FD8FF');
    cx.fillStyle = grad;
    cx.fillRect(0, 0, w, h);
    cx.strokeStyle = 'rgba(255,255,255,0.9)';
    cx.lineWidth = 3;
    for (let y = h / 4; y < h; y += h / 4) {
      cx.beginPath();
      cx.moveTo(0, y);
      cx.lineTo(w, y);
      cx.stroke();
    }
  });
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(sw, sd), new THREE.MeshBasicMaterial({ map: skyTex.tex, color: new THREE.Color(1.15, 1.15, 1.15) }));
  sky.rotation.x = Math.PI / 2;
  sky.position.y = H - 0.012;
  sky.name = 'skylight';
  sky.userData.overhead = true;
  ctx.root.add(sky);
}

/** Flat roof with a chunky rounded parapet, skylight boxes, AC units and a rooftop sign. */
function buildRoof(ctx: WorldCtx): void {
  const r = new Batch();
  const top = H + B.roofT;
  const ow = HW + T + 0.12;
  const od = HD + T + 0.12;
  r.box(ow * 2, B.roofT, od * 2, ROOF, { at: [0, H + B.roofT / 2 + 0.02, 0], r: 0.08, finish: 'matte', tex: 'speckle' });
  // Membrane seams and a darker gutter inside the parapet, so the big flat roof reads as a
  // surface from the street rather than a grey void.
  for (let z = -od + 2.4; z < od - 1.5; z += 2.6) {
    r.box(ow * 2 - 1.1, 0.014, 0.06, shade(ROOF, -0.045), { at: [0, top + 0.027, z], r: 0.007, cast: false, finish: 'matte' });
  }
  const gw = 0.34;
  const gutter = shade(ROOF, -0.07);
  for (const s of [-1, 1]) {
    r.box(ow * 2 - B.parapetT * 2, 0.014, gw, gutter, { at: [0, top + 0.027, s * (od - B.parapetT - gw / 2)], r: 0.007, cast: false, finish: 'matte' });
    r.box(gw, 0.014, od * 2 - B.parapetT * 2 - gw * 2, gutter, { at: [s * (ow - B.parapetT - gw / 2), top + 0.027, 0], r: 0.007, cast: false, finish: 'matte' });
  }
  // A walkway of lighter tiles across the roof, and a row of chunky solar panels.
  r.slab(1.2, od * 2 - 1.2, 0.04, 0.2, '#D5DEE3', { at: [-5.5, top + 0.02, 0], cast: false, finish: 'matte' });
  // Panels tilt up toward the south (the sun side), so they face the front of the building.
  for (let i = 0; i < 4; i++) {
    for (const z of [-6.8, -4.6]) {
      const x = 2.6 + i * 1.75;
      r.box(1.66, 0.08, 1.76, '#E8ECF2', { at: [x, top + 0.42, z], rot: [0.32, 0, 0], r: 0.04, finish: 'plastic' });
      r.box(1.56, 0.04, 1.66, '#2F5FC9', { at: [x, top + 0.465, z + 0.015], rot: [0.32, 0, 0], r: 0.02, finish: 'gloss' });
      for (let k = -1; k <= 1; k++) r.box(1.5, 0.012, 0.02, '#8CB4FF', { at: [x, top + 0.49 + k * 0.17, z + 0.02 - k * 0.5], rot: [0.32, 0, 0], r: 0.006, cast: false });
      r.box(0.08, 0.5, 0.08, '#8A96A6', { at: [x, top + 0.25, z - 0.55], r: 0.03 });
      r.box(0.08, 0.2, 0.08, '#8A96A6', { at: [x, top + 0.1, z + 0.55], r: 0.03 });
    }
  }
  // Parapet: an orange rounded trim all the way round.
  const pt = B.parapetT;
  const ph = B.parapetH;
  r.box(ow * 2, ph, pt, PALETTE.wallTrim, { at: [0, top + ph / 2, -od + pt / 2], r: 0.14 });
  r.box(ow * 2, ph, pt, PALETTE.wallTrim, { at: [0, top + ph / 2, od - pt / 2], r: 0.14 });
  r.box(pt, ph, od * 2 - pt * 2 + 0.2, PALETTE.wallTrim, { at: [-ow + pt / 2, top + ph / 2, 0], r: 0.14 });
  r.box(pt, ph, od * 2 - pt * 2 + 0.2, PALETTE.wallTrim, { at: [ow - pt / 2, top + ph / 2, 0], r: 0.14 });
  // Skylight lantern over the boulevard.
  const sw = D.skylight.w;
  const sd = D.skylight.d;
  r.box(sw + 0.4, 0.3, sd + 0.4, TRIM, { at: [0, top + 0.15, 0], r: 0.1 });
  r.box(sw, 0.1, sd, '#9FD8FF', { at: [0, top + 0.32, 0], r: 0.05, finish: 'gloss' });
  for (let z = -sd / 2 + sd / 4; z < sd / 2; z += sd / 4) r.box(sw + 0.1, 0.06, 0.08, TRIM, { at: [0, top + 0.36, z], r: 0.03 });
  // AC units with round fan grilles.
  for (const [x, z] of [
    [-8.5, -5.5],
    [9.0, 4.5],
  ] as const) {
    r.box(1.5, 0.8, 1.1, '#DDE3EA', { at: [x, top + 0.4, z], r: 0.12, finish: 'plastic' });
    r.puck(0.42, 0.06, '#9AA6B5', { at: [x, top + 0.82, z] });
    r.puck(0.12, 0.08, '#6B7686', { at: [x, top + 0.84, z] });
    for (let i = 0; i < 4; i++) r.box(0.75, 0.02, 0.06, '#6B7686', { at: [x, top + 0.86, z], rot: [0, (i * Math.PI) / 4, 0], r: 0.01, cast: false });
  }
  // Rooftop vents.
  for (const [x, z] of [
    [-4, 6],
    [5.5, -6.5],
    [-11, 3],
  ] as const) {
    r.cyl(0.14, 0.16, 0.5, '#C8D0DC', { at: [x, top + 0.25, z], seg: 16, finish: 'plastic' });
    r.add(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#AEB8C6', { at: [x, top + 0.5, z], scale: [0.22, 0.14, 0.22], finish: 'plastic' });
  }
  // Stair hut in the north-west corner, and planters either side of the rooftop sign.
  r.place(-11.4, top + 0.02, -7.4, 0, () => buildRoofHut(r));
  const pr = rng(31);
  for (const x of [-3.6, 3.6]) r.place(x, top + 0.02, od - B.parapetT - 0.62, 0, () => buildRoofPlanter(r, pr));
  const roof = r.build({ name: 'roof', receive: true });
  roof.traverse((o) => (o.castShadow = false));
  roof.userData.overhead = true;
  ctx.root.add(roof);

  // Rooftop sign above the door, facing the path.
  const signTex = new CanvasTex(1024, 256, (c, w, h) => {
    c.fillStyle = PALETTE.claude;
    c.beginPath();
    c.roundRect(0, 0, w, h, 110);
    c.fill();
    c.strokeStyle = 'rgba(255,253,247,0.6)';
    c.lineWidth = 12;
    c.beginPath();
    c.roundRect(20, 20, w - 40, h - 40, 92);
    c.stroke();
    sparkle(c, 140, h / 2, 74, '#FFFDF7', 0.2);
    c.fillStyle = '#FFFDF7';
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    fitText(c, 'CLAUDE OFFICE', 700, 140, w - 300);
    c.fillText('CLAUDE OFFICE', 250, h / 2 + 8);
  });
  const sign = new THREE.Group();
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(4.2, 1.05),
    new THREE.MeshStandardMaterial({ map: signTex.tex, emissive: '#FFFFFF', emissiveMap: signTex.tex, emissiveIntensity: 0.35, roughness: 0.6 }),
  );
  face.position.set(0, 0.95, 0.075);
  const sb = new Batch();
  sb.box(4.35, 1.2, 0.12, shade(PALETTE.claude, -0.12), { at: [0, 0.95, 0], r: 0.1 });
  for (const s of [-1, 1]) sb.box(0.12, 0.5, 0.12, PALETTE.doorFrame, { at: [s * 1.5, 0.2, -0.05], r: 0.04 });
  sign.add(sb.build({ name: 'roof-sign' }), face);
  sign.position.set(0, top, HD + T - 0.35);
  sign.traverse((o) => (o.castShadow = false));
  sign.userData.overhead = true;
  ctx.root.add(sign);
}

/** Rooftop stair hut: a cream box with an orange cap, a teal door and a satellite dish. Faces +Z. */
export function buildRoofHut(b: Batch): void {
  const d = D.roofHut;
  const front = d.d / 2;
  const doorX = 0.35;
  b.box(d.w, d.h, d.d, PALETTE.wall, { at: [0, d.h / 2, 0], r: 0.1, finish: 'soft' });
  b.box(d.w + 0.26, 0.18, d.d + 0.26, PALETTE.wallTrim, { at: [0, d.h + 0.06, 0], r: 0.08 });
  b.box(d.w + 0.02, 0.12, d.d + 0.02, PALETTE.wallAccent, { at: [0, 0.06, 0], r: 0.04 });
  // Door: trim frame, teal panel, porthole, knob, and a warm lamp over it.
  b.box(d.doorW + 0.16, d.doorH + 0.08, 0.06, TRIM, { at: [doorX, (d.doorH + 0.08) / 2, front + 0.01], r: 0.03 });
  b.box(d.doorW, d.doorH, 0.08, '#4FB3A9', { at: [doorX, d.doorH / 2, front + 0.02], r: 0.04, finish: 'plastic' });
  b.torus(0.16, 0.035, TRIM, { at: [doorX, d.doorH * 0.72, front + 0.065] });
  b.cyl(0.15, 0.15, 0.03, PALETTE.glass, { at: [doorX, d.doorH * 0.72, front + 0.06], rot: [Math.PI / 2, 0, 0], seg: 24, finish: 'gloss' });
  b.ball(0.05, '#F6D365', { at: [doorX + d.doorW / 2 - 0.14, d.doorH * 0.48, front + 0.08], finish: 'gloss' });
  b.box(0.24, 0.13, 0.14, '#FFE9B0', { at: [doorX, d.doorH + 0.2, front + 0.07], r: 0.05, glow: 1.4 });
  // Satellite dish on the cap, tilted up toward the street.
  const tilt = 0.75;
  const n = new THREE.Vector3(0, Math.cos(tilt), Math.sin(tilt));
  const c = new THREE.Vector3(-0.55, d.h + 0.58, -0.25);
  b.cyl(0.035, 0.035, 0.42, '#8A96A6', { at: [c.x, d.h + 0.32, c.z], seg: 10 });
  b.cyl(0.38, 0.09, 0.1, '#EEF1F5', { at: [c.x, c.y, c.z], rot: [tilt, 0, 0], seg: 28, finish: 'plastic' });
  b.cyl(0.015, 0.015, 0.36, '#8A96A6', { at: [c.x + n.x * 0.2, c.y + n.y * 0.2, c.z + n.z * 0.2], rot: [tilt, 0, 0], seg: 8, cast: false });
  b.ball(0.05, PALETTE.wallTrim, { at: [c.x + n.x * 0.4, c.y + n.y * 0.4, c.z + n.z * 0.4] });
}

/** Rooftop planter: a wooden trough of faceted bushes in flower. Long along X, faces +Z. */
export function buildRoofPlanter(b: Batch, r: () => number): void {
  const d = D.roofPlanter;
  b.box(d.w, d.h, d.d, PALETTE.wood, { at: [0, d.h / 2, 0], r: 0.05, finish: 'wood' });
  for (const z of [-1, 1]) b.box(d.w - 0.12, 0.018, 0.012, shade(PALETTE.wood, -0.14), { at: [0, d.h * 0.52, z * (d.d / 2 + 0.002)], cast: false });
  b.box(d.w - 0.1, 0.04, d.d - 0.1, '#6B4A33', { at: [0, d.h - 0.015, 0], r: 0.015, cast: false, finish: 'matte' });
  const n = 4;
  for (let i = 0; i < n; i++) {
    const x = -d.w / 2 + 0.3 + (i * (d.w - 0.6)) / (n - 1);
    const s = 0.24 + r() * 0.08;
    const leaf = shade(PALETTE.treeLeaf[i % PALETTE.treeLeaf.length], (r() - 0.5) * 0.08);
    b.ball([s * 1.15, s * 0.9, s], leaf, { at: [x, d.h + s * 0.5, (r() - 0.5) * 0.08], rot: [r(), r() * 6, r()], ws: 8, hs: 5, flat: true, finish: 'matte' });
    const bloom = pickR(r, ['#FF7EB6', '#FFD93D', '#FFFDF7', '#FF6B6B', '#B983FF']);
    for (let k = 0; k < 4; k++) {
      const a = r() * Math.PI * 2;
      b.ball(0.05, bloom, { at: [x + Math.cos(a) * s * 0.75, d.h + s * (0.65 + r() * 0.45), Math.sin(a) * s * 0.55], cast: false, ws: 6, hs: 4, flat: true });
    }
  }
}

/** Floor material: the plank texture, plus a ±3 % world-space tint at ~4 m scale that hides repeats. */
function floorMaterial(map: THREE.Texture): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ map, roughness: 0.62, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFloorXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvFloorXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec2 vFloorXZ;
float floorHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float floorNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(floorHash(i), floorHash(i + vec2(1, 0)), f.x), mix(floorHash(i + vec2(0, 1)), floorHash(i + vec2(1, 1)), f.x), f.y);
}`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
\tdiffuseColor.rgb *= 0.97 + 0.06 * floorNoise(vFloorXZ * 0.25 + 3.7);`,
      );
  };
  m.customProgramCacheKey = () => 'office-floor';
  return m;
}

/**
 * 4 × 4 m of honey planks (1024² → 256 px/m): staggered 0.2 m boards, 1.2–2.4 m long, each
 * with its own tint (±5 % value, a hair of hue), soft 2 px seams and a few warped grain lines.
 */
function plankTexture(): THREE.CanvasTexture {
  const S = 1024;
  const rows = 20;
  const ph = S / rows;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const base = new THREE.Color(PALETTE.floorWood);
  const alt = new THREE.Color(PALETTE.floorWoodAlt);
  const seam = base.clone().lerp(alt, 0.5).multiplyScalar(0.88);
  ctx.fillStyle = '#' + seam.getHexString();
  ctx.fillRect(0, 0, S, S);
  let seed = 12345;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let r = 0; r < rows; r++) {
    let x = -rand() * S * 0.5;
    while (x < S) {
      const len = (0.3 + rand() * 0.3) * S;
      const col = base.clone().lerp(alt, rand() * 0.8);
      const hsl = { h: 0, s: 0, l: 0 };
      col.getHSL(hsl, THREE.SRGBColorSpace);
      col.setHSL(hsl.h + (rand() - 0.5) * 0.016, hsl.s, hsl.l * (0.95 + rand() * 0.1), THREE.SRGBColorSpace);
      const fill = '#' + col.getHexString();
      const dark = '#' + col.clone().multiplyScalar(0.93).getHexString();
      const y0 = r * ph;
      for (const off of [0, -S, S]) {
        const x0 = x + off;
        if (x0 > S || x0 + len < 0) continue;
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.roundRect(x0 + 1, y0 + 1, len - 2, ph - 2, 4);
        ctx.fill();
        // Soft bevel: a faint lighter top edge and darker bottom edge.
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(x0 + 3, y0 + 2, len - 6, 3);
        ctx.fillStyle = 'rgba(90,55,25,0.05)';
        ctx.fillRect(x0 + 3, y0 + ph - 5, len - 6, 3);
        // 4–6 sine-warped grain streaks at low contrast.
        const n = 4 + Math.floor(rand() * 3);
        for (let k = 0; k < n; k++) {
          const gy = y0 + 6 + rand() * (ph - 12);
          const amp = 1.5 + rand() * 3;
          const freq = 0.004 + rand() * 0.01;
          const phase = rand() * 6.28;
          ctx.strokeStyle = k % 2 ? dark : 'rgba(255,240,215,0.10)';
          ctx.globalAlpha = 0.45;
          ctx.lineWidth = 1 + rand() * 1.2;
          ctx.beginPath();
          for (let t = 6; t <= len - 6; t += 12) {
            const yy = gy + Math.sin(t * freq * 6.28 + phase) * amp;
            if (t === 6) ctx.moveTo(x0 + t, yy);
            else ctx.lineTo(x0 + t, yy);
          }
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
      x += len;
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  return tex;
}
