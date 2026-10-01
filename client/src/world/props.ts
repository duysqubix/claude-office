// Furniture and fittings: reception, manager's corner, break area, whiteboard, posters, clock,
// plants and the lounge. Tall props get their own fade group; low ones go into the static batch.
import * as THREE from 'three';
import { PALETTE } from '../style/palette';
import type { OfficeStats } from './types';
import { Batch, CanvasTex, fitText, font, G, rng, shade } from './kit';
import { aabb, footprint, type WallSide, type WorldCtx } from './ctx';
import { wallFacingYaw } from './building';
import { OFFICE } from './layout';
import { sparkle } from './screens';

const WALL_FACE = OFFICE.halfD; // |z| or |x| of the inside face of the walls

export interface Props {
  setStats(stats: OfficeStats): void;
}

export function buildProps(ctx: WorldCtx): Props {
  buildReception(ctx);
  buildManagerCorner(ctx);
  buildBreakArea(ctx);
  buildLounge(ctx);
  const board = buildWhiteboard(ctx);
  buildPosters(ctx);
  buildClock(ctx);
  buildPlants(ctx);
  return { setStats: board.setStats };
}

export interface PropPlacement {
  /** Extra meshes (textured faces, glass) that belong to the prop. */
  extra?: THREE.Object3D[];
  /** Floor position of the prop's local origin; parts are then built around (0, 0, 0). */
  at?: [number, number];
  yaw?: number;
}

/** Build a fadeable prop from a batch (plus any extra meshes), place it, and register it. */
export function tallProp(ctx: WorldCtx, name: string, fill: (b: Batch) => void, place: PropPlacement = {}): THREE.Group {
  const b = new Batch();
  fill(b);
  const g = b.build({ name });
  for (const e of place.extra ?? []) g.add(e);
  if (place.at) g.position.set(place.at[0], 0, place.at[1]);
  if (place.yaw) g.rotation.y = place.yaw;
  ctx.root.add(g);
  ctx.fader.add(name, [g]);
  return g;
}

/** A plane with a canvas texture, hung on the inside of a wall and faded with its bay. */
function wallPlane(ctx: WorldCtx, side: WallSide, u: number, y: number, w: number, h: number, tex: THREE.Texture, depth = 0.06): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, metalness: 0 }));
  placeOnWall(mesh, side, u, y, depth);
  mesh.receiveShadow = true;
  ctx.root.add(mesh);
  const bay = ctx.bayAt(side, u);
  if (bay) ctx.fader.attach(bay, [mesh]);
  return mesh;
}

/** Position an object against the inside face of a wall, `depth` metres into the room. */
export function placeOnWall(obj: THREE.Object3D, side: WallSide, u: number, y: number, depth: number): void {
  const hw = OFFICE.halfW;
  const hd = OFFICE.halfD;
  switch (side) {
    case 'north':
      obj.position.set(u, y, -hd + depth);
      break;
    case 'south':
      obj.position.set(u, y, hd - depth);
      break;
    case 'east':
      obj.position.set(hw - depth, y, u);
      break;
    case 'west':
      obj.position.set(-hw + depth, y, u);
      break;
  }
  obj.rotation.y = wallFacingYaw(side);
}

// ---------------------------------------------------------------------------------------------
// Reception (just inside the door, on the right)

function buildReception(ctx: WorldCtx): void {
  const cx = 6.7;
  const cz = 8.7;
  const th0 = THREE.MathUtils.degToRad(165);
  const th1 = THREE.MathUtils.degToRad(285);
  const b = ctx.statics;
  const counterH = 1.0;
  b.add(arcSlab(1.0, 1.5, th0, th1, counterH - 0.06, 0.05), '#5CC8FF', { at: [cx, 0, cz] });
  b.add(arcSlab(0.95, 1.6, th0 - 0.03, th1 + 0.03, 0.06, 0.03), PALETTE.deskTop, { at: [cx, counterH - 0.06, cz] });
  // A stripe of the warm accent around the front.
  b.add(arcSlab(1.49, 1.585, th0 + 0.03, th1 - 0.03, 0.1, 0.02), '#FFC94A', { at: [cx, 0.62, cz], cast: false });
  b.add(arcSlab(1.49, 1.585, th0 + 0.03, th1 - 0.03, 0.05, 0.015), '#FFFDF7', { at: [cx, 0.12, cz], cast: false });
  // Bell.
  const bell = polar(cx, cz, 1.28, THREE.MathUtils.degToRad(222));
  b.puck(0.08, 0.025, '#3B4252', { at: [bell.x, counterH + 0.012, bell.z] });
  b.add(G.hemisphere(), '#FFD34E', { at: [bell.x, counterH + 0.025, bell.z], scale: [0.065, 0.06, 0.065], finish: 'gloss' });
  b.ball(0.014, '#FFD34E', { at: [bell.x, counterH + 0.09, bell.z], finish: 'gloss' });
  // Receptionist's monitor, facing into the arc.
  const mon = polar(cx, cz, 1.2, THREE.MathUtils.degToRad(250));
  b.box(0.5, 0.34, 0.05, PALETTE.monitorBezel, { at: [mon.x, counterH + 0.24, mon.z], rot: [0, -THREE.MathUtils.degToRad(250) - Math.PI / 2, 0], finish: 'gloss' });
  b.box(0.05, 0.12, 0.04, PALETTE.monitorBezel, { at: [mon.x, counterH + 0.06, mon.z], finish: 'gloss' });
  // A little pot of pens and a plant on the counter.
  const pl = polar(cx, cz, 1.25, THREE.MathUtils.degToRad(180));
  b.cyl(0.08, 0.065, 0.12, PALETTE.plantPot, { at: [pl.x, counterH + 0.06, pl.z] });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.ball([0.05, 0.09, 0.05], i % 2 ? PALETTE.plantLeaf : shade(PALETTE.plantLeaf, 0.08), { at: [pl.x + Math.cos(a) * 0.04, counterH + 0.19, pl.z + Math.sin(a) * 0.04], rot: [Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5] });
  }
  ctx.colliders.push(aabb(5.1, 5.8, 7.75, 9.2), aabb(5.7, 7.2, 7.1, 7.8), aabb(5.3, 6.1, 7.3, 8.1));
  ctx.blobs.add(5.8, 8.1, 2.4, 2.4, { shape: 'round' });

  // The "NOW HIRING!" sign on two posts behind the counter, angled toward the door.
  const yaw = Math.atan2(-0.8, 0.6);
  const sign = new CanvasTex(512, 256, (c, w, h) => {
    c.fillStyle = '#FFD23F';
    c.beginPath();
    c.roundRect(0, 0, w, h, 40);
    c.fill();
    c.strokeStyle = '#FF5A5F';
    c.lineWidth = 14;
    c.setLineDash([26, 16]);
    c.beginPath();
    c.roundRect(16, 16, w - 32, h - 32, 28);
    c.stroke();
    c.setLineDash([]);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#E63946';
    fitText(c, 'NOW HIRING!', 700, 104, w - 70);
    c.fillText('NOW HIRING!', w / 2, h / 2 - 18);
    c.fillStyle = PALETTE.ink;
    c.font = font(600, 34);
    c.fillText('ask at the desk ↓', w / 2, h / 2 + 62);
  });
  const sx = 7.35;
  const sz = 9.2;
  const signFace = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), new THREE.MeshStandardMaterial({ map: sign.tex, roughness: 0.7 }));
  signFace.position.set(0, 1.85, 0.045);
  tallProp(
    ctx,
    'hiring-sign',
    (s) => {
      s.box(1.62, 0.87, 0.07, '#FF5A5F', { at: [0, 1.85, 0], r: 0.06 });
      for (const k of [-1, 1]) s.cyl(0.04, 0.04, 1.45, '#3B4252', { at: [k * 0.62, 0.72, -0.04], seg: 14 });
      for (const k of [-1, 1]) s.puck(0.16, 0.05, '#3B4252', { at: [k * 0.62, 0.025, -0.04] });
    },
    { extra: [signFace], at: [sx, sz], yaw },
  );
  ctx.colliders.push(footprint(sx, sz, 0.9, 0.9));

  ctx.interactables.push({
    id: 'reception',
    kind: 'reception',
    position: new THREE.Vector3(5.0, 1.4, 7.0),
    radius: 1.7,
    label: 'Hire someone',
  });
}

/** Annular sector (in the XZ plane, angles measured from +X toward +Z), extruded up by `h` with rounded edges. */
function arcSlab(ri: number, ro: number, th0: number, th1: number, h: number, bevel: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  // Shape space (u, v) maps to world (x, -z) after the rotation below, so angles flip sign.
  shape.absarc(0, 0, ro, -th0, -th1, true);
  shape.absarc(0, 0, ri, -th1, -th0, false);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, h - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 40,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, bevel, 0);
  return g;
}

function polar(cx: number, cz: number, r: number, th: number): { x: number; z: number } {
  return { x: cx + Math.cos(th) * r, z: cz + Math.sin(th) * r };
}

// ---------------------------------------------------------------------------------------------
// Manager's corner (north-east)

function buildManagerCorner(ctx: WorldCtx): void {
  const b = ctx.statics;
  const dx = 10.8;
  const dz = -7.4;
  const top = 0.74;
  // Rug.
  b.puck(2.2, 0.03, '#F49AC1', { at: [dx, 0.015, dz - 0.3], cast: false, finish: 'matte', seg: 48 });
  b.puck(1.9, 0.034, '#FFC1DA', { at: [dx, 0.017, dz - 0.3], cast: false, finish: 'matte', seg: 48 });
  // Big wooden desk with drawer pedestals.
  b.box(2.2, 0.08, 1.0, PALETTE.wood, { at: [dx, top - 0.04, dz], r: 0.04 });
  for (const s of [-1, 1]) {
    b.box(0.5, top - 0.08, 0.86, shade(PALETTE.wood, -0.06), { at: [dx + s * 0.8, (top - 0.08) / 2, dz], r: 0.04 });
    for (let i = 0; i < 3; i++) b.box(0.42, 0.17, 0.03, shade(PALETTE.wood, 0.05), { at: [dx + s * 0.8, 0.13 + i * 0.2, dz + 0.43], r: 0.015 });
    for (let i = 0; i < 3; i++) b.capsule(0.012, 0.08, '#E8C07D', { at: [dx + s * 0.8, 0.15 + i * 0.2, dz + 0.455], rot: [0, 0, Math.PI / 2] });
  }
  b.box(1.1, 0.5, 0.04, shade(PALETTE.wood, -0.1), { at: [dx, 0.42, dz - 0.38], r: 0.02 });
  // Laptop, lamp, "WORLD'S OKAYEST MANAGER" mug, a little gold trophy.
  b.box(0.42, 0.02, 0.3, '#C8D0DC', { at: [dx - 0.1, top + 0.01, dz - 0.05], r: 0.01, finish: 'gloss' });
  b.box(0.42, 0.28, 0.02, '#C8D0DC', { at: [dx - 0.1, top + 0.15, dz - 0.21], rot: [-0.25, 0, 0], r: 0.01, finish: 'gloss' });
  b.box(0.38, 0.24, 0.005, '#7FD8FF', { at: [dx - 0.1, top + 0.15, dz - 0.198], rot: [-0.25, 0, 0], r: 0.002, cast: false });
  b.puck(0.09, 0.03, '#3B4252', { at: [dx + 0.8, top + 0.015, dz - 0.25] });
  b.cyl(0.012, 0.012, 0.36, '#3B4252', { at: [dx + 0.8, top + 0.2, dz - 0.25], seg: 8 });
  b.cyl(0.05, 0.11, 0.12, '#FFC94A', { at: [dx + 0.72, top + 0.38, dz - 0.18], rot: [0.5, 0, 0.4] });
  b.puck(0.05, 0.02, '#E8B33C', { at: [dx - 0.75, top + 0.01, dz - 0.25], finish: 'gloss' });
  b.cyl(0.012, 0.02, 0.08, '#E8B33C', { at: [dx - 0.75, top + 0.06, dz - 0.25], finish: 'gloss' });
  b.add(G.hemisphere(), '#FFD34E', { at: [dx - 0.75, top + 0.16, dz - 0.25], scale: [0.06, -0.07, 0.06], finish: 'gloss' });
  ctx.colliders.push(footprint(dx, dz, 2.2, 1.0));
  ctx.blobs.add(dx, dz, 2.6, 1.4);

  const mugTex = new CanvasTex(256, 96, (c, w, h) => {
    c.fillStyle = '#FFFFFF';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#E63946';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = font(700, 22);
    c.fillText("WORLD'S OKAYEST", w / 4, h / 2 - 14);
    c.fillText('MANAGER', w / 4, h / 2 + 14);
    c.fillText("WORLD'S OKAYEST", (w * 3) / 4, h / 2 - 14);
    c.fillText('MANAGER', (w * 3) / 4, h / 2 + 14);
  });
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.12, 24, 1, true), new THREE.MeshStandardMaterial({ map: mugTex.tex, roughness: 0.5 }));
  mug.position.set(dx + 0.45, top + 0.06, dz + 0.15);
  mug.rotation.y = -Math.PI / 2;
  mug.castShadow = true;
  ctx.root.add(mug);
  b.puck(0.05, 0.01, '#FFFFFF', { at: [dx + 0.45, top + 0.005, dz + 0.15] });
  b.cyl(0.048, 0.048, 0.005, PALETTE.coffee, { at: [dx + 0.45, top + 0.115, dz + 0.15], cast: false });
  b.torus(0.032, 0.011, '#FFFFFF', { at: [dx + 0.51, top + 0.06, dz + 0.15], rot: [0, 0, 0] });

  // The boss chair: tall, plush and red.
  const chair = new Batch();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    chair.box(0.07, 0.05, 0.36, '#2B2D42', { at: [Math.sin(a) * 0.18, 0.08, Math.cos(a) * 0.18], rot: [0, a, 0], r: 0.022 });
    chair.ball(0.05, '#1F2230', { at: [Math.sin(a) * 0.34, 0.05, Math.cos(a) * 0.34], ws: 12, hs: 8 });
  }
  chair.cyl(0.035, 0.035, 0.3, PALETTE.metal, { at: [0, 0.26, 0], finish: 'gloss' });
  chair.box(0.66, 0.14, 0.6, '#B23A48', { at: [0, 0.46, 0], r: 0.06 });
  chair.box(0.66, 0.85, 0.16, '#B23A48', { at: [0, 0.98, 0.28], rot: [0.12, 0, 0], r: 0.07 });
  chair.box(0.5, 0.2, 0.1, shade('#B23A48', 0.1), { at: [0, 1.32, 0.31], rot: [0.12, 0, 0], r: 0.05 });
  for (const s of [-1, 1]) {
    chair.box(0.1, 0.06, 0.48, '#2B2D42', { at: [s * 0.36, 0.68, 0.02], r: 0.03 });
    chair.box(0.05, 0.2, 0.05, '#2B2D42', { at: [s * 0.36, 0.57, 0.02], r: 0.02 });
  }
  const chairGroup = chair.build({ name: 'boss-chair' });
  chairGroup.position.set(dx, 0, dz - 0.95);
  // Built with the backrest toward local +Z; turn it so the boss faces the desk (south).
  chairGroup.rotation.y = Math.PI;
  ctx.root.add(chairGroup);

  // Bookshelf on the north wall.
  const bx = 12.2;
  tallProp(ctx, 'bookshelf', (s) => {
    const w = 2.2;
    const hgt = 1.9;
    const z = -WALL_FACE + 0.22;
    const caseCol = shade(PALETTE.wood, -0.04);
    // Open-fronted case: back, sides, top and a plinth.
    s.box(w, hgt, 0.05, shade(PALETTE.wood, -0.12), { at: [bx, hgt / 2, z - 0.175], r: 0.02 });
    for (const k of [-1, 1]) s.box(0.07, hgt, 0.4, caseCol, { at: [bx + k * (w / 2 - 0.035), hgt / 2, z], r: 0.03 });
    s.box(w + 0.06, 0.07, 0.44, caseCol, { at: [bx, hgt - 0.02, z], r: 0.03 });
    s.box(w, 0.1, 0.4, caseCol, { at: [bx, 0.05, z], r: 0.03 });
    const r = rng(99);
    for (let shelf = 0; shelf < 4; shelf++) {
      const y = 0.1 + shelf * 0.44;
      if (shelf > 0) s.box(w - 0.12, 0.045, 0.36, shade(PALETTE.wood, 0.06), { at: [bx, y, z + 0.01], r: 0.018 });
      let x = bx - w / 2 + 0.12;
      while (x < bx + w / 2 - 0.25) {
        const bw = 0.06 + r() * 0.07;
        const bh = 0.24 + r() * 0.14;
        if (r() < 0.12) {
          x += 0.15;
          continue;
        }
        s.box(bw, bh, 0.26, ['#FF7A6B', '#5CC8FF', '#FFC94A', '#6EDC9A', '#B48CFF', '#FF9DCB', '#3D7CFF'][Math.floor(r() * 7)], {
          at: [x + bw / 2, y + 0.025 + bh / 2, z + 0.02],
          rot: [0, 0, r() < 0.15 ? 0.2 : 0],
          r: 0.012,
          seg: 2,
          cast: false,
        });
        x += bw + 0.008;
      }
    }
  });
  ctx.colliders.push(aabb(bx - 1.1, bx + 1.1, -WALL_FACE, -WALL_FACE + 0.42));

  // Filing cabinet: the Personnel Files (call back old sessions).
  const fx = OFFICE.halfW - 0.33;
  const fz = -5.9;
  const label = new CanvasTex(512, 160, (c, w, h) => {
    c.fillStyle = PALETTE.paper;
    c.beginPath();
    c.roundRect(0, 0, w, h, 26);
    c.fill();
    c.fillStyle = '#3D7CFF';
    c.beginPath();
    c.roundRect(0, 0, w, 34, [26, 26, 0, 0]);
    c.fill();
    c.fillStyle = PALETTE.ink;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitText(c, 'PERSONNEL FILES', 700, 62, w - 40);
    c.fillText('PERSONNEL FILES', w / 2, h / 2 + 18);
  });
  // The sign on top turns toward the middle of the room so it reads from the usual camera.
  const signYaw = 0.6;
  const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.27), new THREE.MeshStandardMaterial({ map: label.tex, roughness: 0.6 }));
  signMesh.position.set(Math.sin(signYaw) * 0.036, 1.56, Math.cos(signYaw) * 0.036);
  signMesh.rotation.set(-0.1, signYaw, 0, 'YXZ');
  tallProp(ctx, 'filing-cabinet', (s) => {
    s.box(0.78, 1.32, 0.62, '#5C8DFF', { at: [0, 0.66, 0], r: 0.05 });
    for (let i = 0; i < 4; i++) {
      const y = 0.2 + i * 0.31;
      s.box(0.68, 0.26, 0.04, '#7AA5FF', { at: [0, y, 0.31], r: 0.03 });
      s.capsule(0.018, 0.16, '#E9EEF6', { at: [0, y + 0.05, 0.345], rot: [0, 0, Math.PI / 2], finish: 'gloss' });
      s.box(0.18, 0.07, 0.008, '#FFFDF7', { at: [0, y - 0.05, 0.333], r: 0.004, cast: false });
    }
    // A sign frame on top, and folders poking out of the top drawer.
    s.box(0.94, 0.35, 0.06, '#3B4252', { at: [0, 1.56, 0], rot: [-0.1, 0, 0], r: 0.035, parent: new THREE.Matrix4().makeRotationY(signYaw) });
    s.box(0.06, 0.12, 0.06, '#3B4252', { at: [0, 1.36, 0], r: 0.02 });
    for (let i = 0; i < 4; i++) s.box(0.04, 0.2, 0.26, ['#FFC94A', '#FF7A6B', '#6EDC9A', '#FFFFFF'][i], { at: [-0.2 + i * 0.13, 1.25, 0.08], rot: [0, 0, (i - 1.5) * 0.12], r: 0.01, cast: false });
  }, { extra: [signMesh], at: [fx, fz], yaw: -Math.PI / 2 });
  ctx.colliders.push(footprint(fx, fz, 0.78, 0.66, 1));
  ctx.blobs.add(fx - 0.05, fz, 1.0, 1.1);
  ctx.interactables.push({
    id: 'archive',
    kind: 'archive',
    position: new THREE.Vector3(fx - 1.0, 1.4, fz),
    radius: 1.6,
    label: 'Personnel Files',
  });
}

// ---------------------------------------------------------------------------------------------
// Break area (north-west)

function buildBreakArea(ctx: WorldCtx): void {
  const b = ctx.statics;
  const wz = -WALL_FACE;
  // Kitchen counter along the north wall.
  const x0 = -13.15;
  const x1 = -9.95;
  const depth = 0.62;
  const h = 0.92;
  const cz = wz + depth / 2 + 0.02;
  b.box(x1 - x0, h - 0.06, depth - 0.04, '#8FE0C8', { at: [(x0 + x1) / 2, (h - 0.06) / 2, cz], r: 0.04 });
  b.box(x1 - x0 + 0.06, 0.06, depth + 0.04, PALETTE.wood, { at: [(x0 + x1) / 2, h - 0.03, cz + 0.02], r: 0.03 });
  for (let i = 0; i < 4; i++) {
    const x = x0 + 0.42 + i * 0.8;
    b.box(0.72, h - 0.24, 0.03, '#B6EEDD', { at: [x, (h - 0.06) / 2, cz + depth / 2 - 0.01], r: 0.025 });
    b.capsule(0.014, 0.1, '#FFFDF7', { at: [x + 0.25, h - 0.24, cz + depth / 2 + 0.015], finish: 'gloss' });
  }
  ctx.colliders.push(aabb(x0 - 0.05, x1 + 0.05, wz, wz + depth + 0.06));
  ctx.blobs.add((x0 + x1) / 2, cz + 0.05, x1 - x0 + 0.4, depth + 0.4);

  // Upper cupboards on the wall.
  const bay = ctx.bayAt('north', -11.5);
  const upper = new Batch();
  for (let i = 0; i < 3; i++) {
    const x = x0 + 0.55 + i * 1.05;
    upper.box(0.98, 0.62, 0.34, '#FFFDF7', { at: [x, 1.95, wz + 0.19], r: 0.04 });
    upper.capsule(0.013, 0.09, '#8FE0C8', { at: [x + 0.32, 1.76, wz + 0.37], finish: 'gloss' });
  }
  const upperGroup = upper.build({ name: 'cupboards' });
  ctx.root.add(upperGroup);
  if (bay) ctx.fader.attach(bay, [upperGroup]);

  // Coffee machine (interactable) with a mug and steam.
  const mx = -11.6;
  const mz = wz + 0.3;
  tallProp(ctx, 'coffee-machine', (s) => {
    s.box(0.44, 0.56, 0.4, '#E2504C', { at: [mx, h + 0.28, mz], r: 0.07 });
    s.box(0.36, 0.14, 0.36, '#3B4252', { at: [mx, h + 0.63, mz], r: 0.05 });
    s.box(0.3, 0.2, 0.06, '#3B4252', { at: [mx, h + 0.22, mz + 0.2], r: 0.03 });
    s.box(0.12, 0.05, 0.08, '#C8D0DC', { at: [mx, h + 0.38, mz + 0.22], r: 0.02, finish: 'gloss' });
    s.box(0.26, 0.025, 0.14, '#C8D0DC', { at: [mx, h + 0.0125, mz + 0.24], r: 0.01, finish: 'gloss' });
    for (let i = 0; i < 3; i++) s.ball(0.025, ['#6EDC9A', '#FFC94A', '#FFFFFF'][i], { at: [mx - 0.1 + i * 0.1, h + 0.5, mz + 0.205], scale: [1, 1, 0.5], cast: false });
    s.cyl(0.045, 0.04, 0.09, '#FFFFFF', { at: [mx, h + 0.07, mz + 0.24] });
    s.torus(0.03, 0.01, '#FFFFFF', { at: [mx + 0.05, h + 0.07, mz + 0.24] });
  });
  // Steam: a few soft puffs looping upward.
  const steamMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.5, depthWrite: false });
  const puffs: THREE.Mesh[] = [];
  const puffGeo = new THREE.SphereGeometry(1, 12, 8);
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Mesh(puffGeo, steamMat.clone());
    p.renderOrder = 2;
    ctx.root.add(p);
    puffs.push(p);
  }
  ctx.tickers.push((_dt, t) => {
    puffs.forEach((p, i) => {
      const k = (t * 0.45 + i / puffs.length) % 1;
      p.position.set(mx + Math.sin(t * 2 + i) * 0.03 * k, h + 0.16 + k * 0.55, mz + 0.24 + Math.cos(t * 1.7 + i) * 0.02);
      p.scale.setScalar(0.025 + k * 0.05);
      (p.material as THREE.MeshBasicMaterial).opacity = Math.sin(k * Math.PI) * 0.55;
    });
  });

  // Fridge in the corner.
  tallProp(ctx, 'fridge', (s) => {
    const fx = -OFFICE.halfW + 0.38;
    const fz = wz + 0.38;
    s.box(0.74, 1.86, 0.7, '#9AD9FF', { at: [fx, 0.93, fz], r: 0.09 });
    s.box(0.68, 0.02, 0.02, '#7CC3EE', { at: [fx, 1.22, fz + 0.355], r: 0.008, cast: false });
    s.capsule(0.022, 0.32, '#FFFDF7', { at: [fx + 0.27, 1.45, fz + 0.37], finish: 'gloss' });
    s.capsule(0.022, 0.5, '#FFFDF7', { at: [fx + 0.27, 0.75, fz + 0.37], finish: 'gloss' });
    const r = rng(5);
    for (let i = 0; i < 5; i++) s.ball(0.035, ['#FF5A5F', '#FFC93C', '#6EDC9A', '#B48CFF', '#FF9DCB'][i], { at: [fx - 0.2 + r() * 0.3, 0.9 + r() * 0.8, fz + 0.36], scale: [1, 1, 0.45], cast: false });
  });
  ctx.colliders.push(aabb(-OFFICE.halfW, -OFFICE.halfW + 0.76, wz, wz + 0.76));
  ctx.blobs.add(-OFFICE.halfW + 0.38, wz + 0.4, 1.1, 1.1);

  // Water cooler.
  const wcx = -9.35;
  const wcz = wz + 0.32;
  const jug = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 0.42, 24),
    new THREE.MeshStandardMaterial({ color: '#7FD3FF', roughness: 0.15, transparent: true, opacity: 0.7, depthWrite: false }),
  );
  jug.position.set(wcx, 1.2, wcz);
  tallProp(ctx, 'water-cooler', (s) => {
    s.box(0.4, 0.98, 0.4, '#FFFDF7', { at: [wcx, 0.49, wcz], r: 0.06 });
    s.box(0.24, 0.2, 0.04, '#DDE6F3', { at: [wcx, 0.8, wcz + 0.2], r: 0.02 });
    s.ball(0.03, '#3D7CFF', { at: [wcx - 0.06, 0.84, wcz + 0.22], cast: false });
    s.ball(0.03, '#FF5A5F', { at: [wcx + 0.06, 0.84, wcz + 0.22], cast: false });
    s.puck(0.17, 0.06, '#7FD3FF', { at: [wcx, 1.42, wcz] });
  }, { extra: [jug] });
  ctx.colliders.push(footprint(wcx, wcz, 0.44, 0.44));
  ctx.blobs.add(wcx, wcz, 0.7, 0.7, { shape: 'round' });

  ctx.interactables.push({
    id: 'coffee',
    kind: 'coffee',
    position: new THREE.Vector3(mx, 1.4, wz + 1.25),
    radius: 1.5,
    label: 'Grab a coffee',
  });

  // Couch, coffee table and a round rug by the west windows.
  const rx = -12.0;
  const rz = -6.6;
  b.puck(1.75, 0.03, '#FFD27F', { at: [rx, 0.015, rz], cast: false, finish: 'matte', seg: 48 });
  b.puck(1.5, 0.034, '#FFE3A8', { at: [rx, 0.017, rz], cast: false, finish: 'matte', seg: 48 });
  const cx = -OFFICE.halfW + 0.48;
  const couch = '#FF7A6B';
  b.box(0.9, 0.36, 2.3, shade(couch, -0.06), { at: [cx, 0.22, rz], r: 0.12 });
  for (const s of [-1, 1]) b.box(0.92, 0.6, 0.26, couch, { at: [cx, 0.36, rz + s * 1.1], r: 0.12 });
  b.box(0.3, 0.8, 2.3, couch, { at: [cx - 0.32, 0.5, rz], r: 0.13 });
  for (const s of [-1, 1]) b.box(0.62, 0.16, 0.95, shade(couch, 0.08), { at: [cx + 0.1, 0.45, rz + s * 0.49], r: 0.08 });
  b.box(0.16, 0.38, 0.38, '#FFD93D', { at: [cx - 0.08, 0.66, rz - 0.5], rot: [0, 0, -0.35], r: 0.08 });
  b.box(0.16, 0.38, 0.38, '#5CC8FF', { at: [cx - 0.08, 0.66, rz + 0.55], rot: [0, 0, -0.35], r: 0.08 });
  for (const s of [-1, 1]) for (const t of [-1, 1]) b.cyl(0.04, 0.03, 0.06, '#3B4252', { at: [cx + s * 0.35, 0.03, rz + t * 1.05], seg: 10 });
  ctx.colliders.push(aabb(-OFFICE.halfW, cx + 0.47, rz - 1.25, rz + 1.25));
  ctx.blobs.add(cx, rz, 1.3, 2.7);
  // Coffee table.
  const tx = -12.15;
  b.puck(0.5, 0.07, PALETTE.wood, { at: [tx, 0.4, rz] });
  b.cyl(0.07, 0.1, 0.36, shade(PALETTE.wood, -0.1), { at: [tx, 0.18, rz] });
  b.puck(0.25, 0.04, shade(PALETTE.wood, -0.1), { at: [tx, 0.02, rz] });
  b.cyl(0.04, 0.035, 0.08, '#5CC8FF', { at: [tx + 0.15, 0.475, rz - 0.1] });
  b.box(0.22, 0.02, 0.3, '#FF9DCB', { at: [tx - 0.12, 0.445, rz + 0.08], rot: [0, 0.4, 0], r: 0.008 });
  ctx.colliders.push(footprint(tx, rz, 1.0, 1.0));
  ctx.blobs.add(tx, rz, 1.2, 1.2, { shape: 'round' });
}

// ---------------------------------------------------------------------------------------------
// Lounge (south-west): ping-pong table, bean bags, vending machine

function buildLounge(ctx: WorldCtx): void {
  const b = ctx.statics;
  const px = -7.6;
  const pz = 7.3;
  const top = 0.72;
  b.box(2.5, 0.06, 1.4, '#2E9BD6', { at: [px, top - 0.03, pz], r: 0.03 });
  b.box(2.5, 0.004, 0.03, '#FFFFFF', { at: [px, top + 0.001, pz], r: 0.001, cast: false });
  b.box(0.03, 0.004, 1.4, '#FFFFFF', { at: [px, top + 0.001, pz], r: 0.001, cast: false });
  b.box(0.03, 0.16, 1.5, '#FFFDF7', { at: [px, top + 0.08, pz], r: 0.012 });
  for (const s of [-1, 1]) for (const t of [-1, 1]) b.box(0.07, top - 0.06, 0.07, '#3B4252', { at: [px + s * 1.05, (top - 0.06) / 2, pz + t * 0.55], r: 0.02 });
  b.ball(0.02, '#FFFFFF', { at: [px + 0.6, top + 0.15, pz - 0.2] });
  for (const s of [-1, 1]) {
    b.puck(0.08, 0.015, '#FF5A5F', { at: [px + s * 0.95, top + 0.008, pz + s * 0.3], rot: [0, 0, 0] });
    b.capsule(0.014, 0.06, PALETTE.wood, { at: [px + s * 1.07, top + 0.015, pz + s * 0.3], rot: [0, 0, Math.PI / 2] });
  }
  ctx.colliders.push(footprint(px, pz, 2.5, 1.4));
  ctx.blobs.add(px, pz, 2.9, 1.8);

  // Bean bags.
  const bags: [number, number, string][] = [
    [-11.3, 8.4, '#B48CFF'],
    [-11.8, 6.7, '#FFC94A'],
    [-4.4, 8.6, '#6EDC9A'],
  ];
  for (const [x, z, c] of bags) {
    b.ball([0.42, 0.3, 0.42], c, { at: [x, 0.26, z] });
    b.ball([0.3, 0.2, 0.3], shade(c, 0.06), { at: [x + 0.05, 0.46, z + 0.05] });
    ctx.colliders.push(footprint(x, z, 0.8, 0.8));
    ctx.blobs.add(x, z, 1.1, 1.1, { shape: 'round' });
  }

  // Vending machine against the west wall.
  const vx = -OFFICE.halfW + 0.42;
  const vz = 6.0;
  tallProp(ctx, 'vending', (s) => {
    s.box(0.95, 1.9, 0.8, '#FF5A5F', { at: [0, 0.95, 0], r: 0.08 });
    s.box(0.62, 1.3, 0.05, '#BFE9FF', { at: [-0.1, 1.15, 0.39], r: 0.04, finish: 'gloss' });
    const r = rng(77);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        s.box(0.1, 0.16, 0.06, ['#FFC94A', '#6EDC9A', '#B48CFF', '#5CC8FF', '#FF9DCB'][Math.floor(r() * 5)], {
          at: [-0.32 + col * 0.15, 0.68 + row * 0.3, 0.38],
          r: 0.02,
          cast: false,
        });
      }
    }
    s.box(0.18, 0.5, 0.05, '#3B4252', { at: [0.33, 1.2, 0.39], r: 0.03 });
    s.box(0.5, 0.16, 0.05, '#3B4252', { at: [-0.1, 0.3, 0.39], r: 0.03 });
  }, { at: [vx, vz], yaw: Math.PI / 2 });
  ctx.colliders.push(footprint(vx, vz, 0.95, 0.84, 1));
  ctx.blobs.add(vx + 0.05, vz, 1.1, 1.2);
}

// ---------------------------------------------------------------------------------------------
// Whiteboard with live stats

interface BoardState {
  staff: number;
  working: number;
  needsYou: number;
  idle: number;
  interns: number;
}

function buildWhiteboard(ctx: WorldCtx): { setStats(s: OfficeStats): void } {
  const stats: BoardState = { staff: 0, working: 0, needsYou: 0, idle: 0, interns: 0 };
  const W = 3.3;
  const Hh = 1.5;
  const y = 1.58;
  const tex = new CanvasTex(1024, 466, (c, w, h) => drawBoard(c, w, h, stats));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.1, Hh - 0.1), new THREE.MeshStandardMaterial({ map: tex.tex, roughness: 0.35 }));
  placeOnWall(face, 'north', 0, y, 0.085);
  face.receiveShadow = true;
  ctx.root.add(face);
  const frame = new Batch();
  frame.box(W, Hh, 0.06, '#C8D0DC', { at: [0, y, -WALL_FACE + 0.05], r: 0.04, finish: 'gloss' });
  frame.box(W - 0.6, 0.05, 0.12, '#C8D0DC', { at: [0, y - Hh / 2 - 0.01, -WALL_FACE + 0.1], r: 0.02, finish: 'gloss' });
  ['#3D7CFF', '#E63946', '#2EC4B6'].forEach((c, i) => frame.capsule(0.014, 0.1, c, { at: [-0.4 + i * 0.16, y - Hh / 2 + 0.03, -WALL_FACE + 0.12], rot: [0, 0, Math.PI / 2], cast: false }));
  const frameGroup = frame.build({ name: 'whiteboard-frame' });
  ctx.root.add(frameGroup);
  const bay = ctx.bayAt('north', 0);
  if (bay) ctx.fader.attach(bay, [face, frameGroup]);

  // Standup corner in front of the board: a big round rug.
  ctx.statics.puck(2.0, 0.03, '#BDE8D6', { at: [0, 0.015, -7.3], cast: false, finish: 'matte', seg: 56 });
  ctx.statics.puck(1.75, 0.034, '#D7F3E6', { at: [0, 0.017, -7.3], cast: false, finish: 'matte', seg: 56 });

  ctx.interactables.push({
    id: 'whiteboard',
    kind: 'whiteboard',
    position: new THREE.Vector3(0, 1.6, -WALL_FACE + 1.1),
    radius: 2.2,
    label: 'Check the roster',
  });

  let lastMinute = -1;
  ctx.tickers.push(() => {
    const m = new Date().getMinutes();
    if (m !== lastMinute) {
      lastMinute = m;
      tex.redraw();
    }
  });

  return {
    setStats(s) {
      if (s.staff === stats.staff && s.working === stats.working && s.needsYou === stats.needsYou && s.idle === stats.idle && s.interns === stats.interns) return;
      Object.assign(stats, { staff: s.staff, working: s.working, needsYou: s.needsYou, idle: s.idle, interns: s.interns });
      tex.redraw();
    },
  };
}

function drawBoard(c: CanvasRenderingContext2D, w: number, h: number, s: BoardState): void {
  c.fillStyle = '#FDFEFF';
  c.fillRect(0, 0, w, h);
  // Faint ghosts of old marker.
  c.strokeStyle = 'rgba(120,140,170,0.07)';
  c.lineWidth = 10;
  c.beginPath();
  c.moveTo(620, 360);
  c.bezierCurveTo(700, 300, 820, 420, 960, 330);
  c.stroke();

  c.textBaseline = 'alphabetic';
  c.textAlign = 'left';
  c.fillStyle = '#3D7CFF';
  c.font = font(700, 54);
  c.fillText('Office today', 44, 82);
  c.strokeStyle = '#3D7CFF';
  c.lineWidth = 5;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(44, 98);
  c.quadraticCurveTo(220, 108, 380, 94);
  c.stroke();

  const rows: [string, number, string][] = [
    ['Staff', s.staff, '#2B2D42'],
    ['Working', s.working, '#22A855'],
    ['Needs you', s.needsYou, '#E8890C'],
    ['Idle', s.idle, '#3B82F6'],
    ['Interns', s.interns, '#8B5CF6'],
  ];
  rows.forEach(([label, n, color], i) => {
    const y = 158 + i * 60;
    c.fillStyle = color;
    c.beginPath();
    c.arc(62, y - 14, 12, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#2B2D42';
    c.font = font(600, 38);
    c.fillText(label, 92, y);
    c.fillStyle = color;
    c.font = font(700, 46);
    c.textAlign = 'right';
    c.fillText(String(n), 470, y + 2);
    c.textAlign = 'left';
  });

  // Doodle: a smiling sparkle with a speech bubble.
  sparkle(c, 700, 210, 70, '#D97757', 0.2);
  c.fillStyle = '#2B2D42';
  c.beginPath();
  c.arc(686, 202, 6, 0, Math.PI * 2);
  c.arc(714, 202, 6, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = '#2B2D42';
  c.lineWidth = 4;
  c.beginPath();
  c.arc(700, 214, 12, 0.15 * Math.PI, 0.85 * Math.PI);
  c.stroke();
  c.strokeStyle = '#E63946';
  c.lineWidth = 5;
  c.beginPath();
  c.roundRect(790, 90, 190, 86, 30);
  c.stroke();
  c.beginPath();
  c.moveTo(810, 170);
  c.lineTo(780, 200);
  c.lineTo(840, 175);
  c.stroke();
  c.fillStyle = '#E63946';
  c.font = font(700, 40);
  c.textAlign = 'center';
  c.fillText('ship it!', 885, 146);

  // A wobbly chart that only goes up.
  c.strokeStyle = '#2EC4B6';
  c.lineWidth = 6;
  c.beginPath();
  c.moveTo(600, 420);
  c.lineTo(660, 390);
  c.lineTo(710, 400);
  c.lineTo(780, 340);
  c.lineTo(840, 350);
  c.lineTo(930, 290);
  c.stroke();
  c.beginPath();
  c.moveTo(930, 290);
  c.lineTo(905, 292);
  c.moveTo(930, 290);
  c.lineTo(922, 313);
  c.stroke();

  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  c.fillStyle = '#6B7280';
  c.font = font(600, 30);
  c.textAlign = 'right';
  c.fillText(`${now.toLocaleDateString(undefined, { weekday: 'long' })} · ${hh}:${mm}`, w - 40, h - 30);
  c.textAlign = 'left';
  c.fillText('days since last merge conflict: 0', 44, h - 30);
}

// ---------------------------------------------------------------------------------------------
// Posters and clock

function buildPosters(ctx: WorldCtx): void {
  const posters: { u: number; side: WallSide; y: number; draw: (c: CanvasRenderingContext2D, w: number, h: number) => void }[] = [
    {
      u: -4.2,
      side: 'north',
      y: 1.65,
      draw: (c, w, h) => {
        c.fillStyle = '#FFC94A';
        c.fillRect(0, 0, w, h);
        // Rocket.
        c.save();
        c.translate(w / 2, h * 0.42);
        c.rotate(-0.5);
        c.fillStyle = '#FFFDF7';
        c.beginPath();
        c.ellipse(0, 0, 52, 120, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#E63946';
        c.beginPath();
        c.moveTo(-50, 50);
        c.lineTo(-90, 120);
        c.lineTo(-30, 100);
        c.fill();
        c.beginPath();
        c.moveTo(50, 50);
        c.lineTo(90, 120);
        c.lineTo(30, 100);
        c.fill();
        c.fillStyle = '#5CC8FF';
        c.beginPath();
        c.arc(0, -30, 26, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#FF9F45';
        c.beginPath();
        c.moveTo(-28, 115);
        c.quadraticCurveTo(0, 210, 28, 115);
        c.fill();
        c.restore();
        c.fillStyle = '#2B2D42';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        fitText(c, 'SHIP IT', 700, 130, w - 50);
        c.fillText('SHIP IT', w / 2, h * 0.84);
      },
    },
    {
      u: 4.2,
      side: 'north',
      y: 1.65,
      draw: (c, w, h) => {
        c.fillStyle = '#2EC4B6';
        c.fillRect(0, 0, w, h);
        c.fillStyle = '#FFFDF7';
        c.beginPath();
        c.roundRect(w / 2 - 110, 90, 220, 170, 30);
        c.fill();
        c.fillStyle = '#2EC4B6';
        for (let i = 0; i < 4; i++) {
          c.beginPath();
          c.roundRect(w / 2 - 80, 120 + i * 34, 160 - (i % 2) * 50, 16, 8);
          c.fill();
        }
        c.fillStyle = '#FFE66D';
        c.font = font(700, 120);
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('↓', w / 2, 330);
        c.fillStyle = '#FFFDF7';
        fitText(c, 'Have you tried', 700, 62, w - 60);
        c.fillText('Have you tried', w / 2, h * 0.72);
        c.fillStyle = '#2B2D42';
        fitText(c, '/compact?', 700, 92, w - 60);
        c.fillText('/compact?', w / 2, h * 0.86);
      },
    },
    {
      u: 7.4,
      side: 'north',
      y: 1.65,
      draw: (c, w, h) => {
        c.fillStyle = '#B48CFF';
        c.fillRect(0, 0, w, h);
        // A little git graph.
        c.strokeStyle = '#FFFDF7';
        c.lineWidth = 12;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(w / 2 - 70, 70);
        c.lineTo(w / 2 - 70, 330);
        c.moveTo(w / 2 - 70, 140);
        c.quadraticCurveTo(w / 2 + 60, 150, w / 2 + 60, 230);
        c.lineTo(w / 2 + 60, 250);
        c.quadraticCurveTo(w / 2 + 60, 300, w / 2 - 70, 310);
        c.stroke();
        for (const [x, y, col] of [
          [w / 2 - 70, 80, '#FFC94A'],
          [w / 2 - 70, 200, '#FFC94A'],
          [w / 2 + 60, 230, '#FF7A6B'],
          [w / 2 - 70, 320, '#6EDC9A'],
        ] as const) {
          c.fillStyle = col;
          c.beginPath();
          c.arc(x, y, 22, 0, Math.PI * 2);
          c.fill();
        }
        c.fillStyle = '#FFFDF7';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        const lines = ['Tokens are', 'temporary,', 'commits are', 'forever'];
        lines.forEach((l, i) => {
          c.fillStyle = i < 2 ? '#FFFDF7' : '#2B2D42';
          fitText(c, l, 700, 66, w - 60);
          c.fillText(l, w / 2, 430 + i * 68);
        });
      },
    },
  ];
  for (const p of posters) hangPicture(ctx, { side: p.side, u: p.u, y: p.y, w: 0.86, h: 0.86 * (700 / 400), px: [400, 700], draw: p.draw });
}

export interface PictureSpec {
  side: WallSide;
  u: number;
  y: number;
  /** Picture size in metres (the frame adds a border around it). */
  w: number;
  h: number;
  /** Canvas size in pixels. */
  px: [number, number];
  draw: (c: CanvasRenderingContext2D, w: number, h: number) => void;
  frame?: string;
  border?: number;
}

/** Hang a framed canvas picture on the inside of a wall; it fades with its wall bay. */
export function hangPicture(ctx: WorldCtx, p: PictureSpec): void {
  const tex = new CanvasTex(p.px[0], p.px[1], p.draw);
  const border = p.border ?? 0.04;
  const frame = new Batch();
  const pos = new THREE.Object3D();
  placeOnWall(pos, p.side, p.u, p.y, 0.04);
  frame.box(p.w + border * 2, p.h + border * 2, 0.04, p.frame ?? '#FFFDF7', {
    at: [pos.position.x, pos.position.y, pos.position.z],
    rot: [0, pos.rotation.y, 0],
    r: Math.min(0.025, border * 0.6),
  });
  const fg = frame.build({ name: 'picture-frame' });
  ctx.root.add(fg);
  wallPlane(ctx, p.side, p.u, p.y, p.w, p.h, tex.tex, 0.065);
  const bay = ctx.bayAt(p.side, p.u);
  if (bay) ctx.fader.attach(bay, [fg]);
}

function buildClock(ctx: WorldCtx): void {
  const u = -7.4;
  const y = 1.75;
  const R = 0.34;
  const faceTex = new CanvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#FFFDF7';
    c.beginPath();
    c.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#2B2D42';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = font(700, 34);
    for (let i = 1; i <= 12; i++) {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      if (i % 3 === 0) c.fillText(String(i), w / 2 + Math.cos(a) * 92, h / 2 + Math.sin(a) * 92 + 2);
      else {
        c.beginPath();
        c.arc(w / 2 + Math.cos(a) * 96, h / 2 + Math.sin(a) * 96, 6, 0, Math.PI * 2);
        c.fill();
      }
    }
  });
  const group = new THREE.Group();
  placeOnWall(group, 'north', u, y, 0.06);
  const b = new Batch();
  b.add(G.puck(R + 0.05, 0.08), '#FF7A6B', { rot: [Math.PI / 2, 0, 0] });
  const rim = b.build({ name: 'clock-rim' });
  group.add(rim);
  const face = new THREE.Mesh(new THREE.CircleGeometry(R, 48), new THREE.MeshStandardMaterial({ map: faceTex.tex, roughness: 0.5 }));
  face.position.z = 0.042;
  group.add(face);
  const hand = (len: number, w: number, color: string, z: number) => {
    const pivot = new THREE.Group();
    const m = new THREE.Mesh(G.rbox(w, len, 0.012, w / 2.2, 2), new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
    m.position.y = len / 2 - 0.03;
    pivot.add(m);
    pivot.position.z = z;
    group.add(pivot);
    return pivot;
  };
  const hourHand = hand(R * 0.55, 0.035, '#2B2D42', 0.055);
  const minuteHand = hand(R * 0.8, 0.026, '#2B2D42', 0.065);
  const secondHand = hand(R * 0.85, 0.01, '#E63946', 0.075);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 8), new THREE.MeshStandardMaterial({ color: '#E63946', roughness: 0.5 }));
  cap.position.z = 0.08;
  group.add(cap);
  ctx.root.add(group);
  const bay = ctx.bayAt('north', u);
  if (bay) ctx.fader.attach(bay, [group]);
  ctx.tickers.push(() => {
    const now = new Date();
    const s = now.getSeconds() + now.getMilliseconds() / 1000;
    const m = now.getMinutes() + s / 60;
    const hr = (now.getHours() % 12) + m / 60;
    // Clock hands turn clockwise as seen from the front (negative about +Z).
    secondHand.rotation.z = -(Math.floor(s) / 60) * Math.PI * 2;
    minuteHand.rotation.z = -(m / 60) * Math.PI * 2;
    hourHand.rotation.z = -(hr / 12) * Math.PI * 2;
  });
}

// ---------------------------------------------------------------------------------------------
// Plants

function buildPlants(ctx: WorldCtx): void {
  const spots: [number, number, number][] = [
    [-2.25, -WALL_FACE + 0.45, 1.25],
    [2.25, -WALL_FACE + 0.45, 1.1],
    [-2.35, WALL_FACE - 0.45, 1.0],
    [2.35, WALL_FACE - 0.45, 1.0],
    [-OFFICE.halfW + 0.5, WALL_FACE - 0.5, 1.3],
    [OFFICE.halfW - 0.5, WALL_FACE - 0.5, 1.25],
    [-OFFICE.halfW + 0.5, -4.4, 1.15],
    [OFFICE.halfW - 0.5, -4.4, 1.2],
    [8.2, -WALL_FACE + 0.45, 1.1],
  ];
  spots.forEach(([x, z, s], i) => {
    const r = rng(300 + i);
    // Built around the origin and placed, so the gentle sway pivots on the pot's base.
    const plant = tallProp(ctx, `plant-${i}`, (b) => pottedPlant(b, 0, 0, s, r), { at: [x, z] });
    sway(ctx, plant, 0.022, r());
    ctx.colliders.push(footprint(x, z, 0.62 * s, 0.62 * s));
    ctx.blobs.add(x, z, 0.9 * s, 0.9 * s, { shape: 'round' });
  });
}

/** A slow wobble about the object's base: plants and trees breathe a little. */
export function sway(ctx: WorldCtx, obj: THREE.Object3D, amp: number, phase: number): void {
  const p = phase * Math.PI * 2;
  const speed = 0.8 + phase * 0.5;
  ctx.tickers.push((_dt, t) => {
    obj.rotation.z = Math.sin(t * speed + p) * amp;
    obj.rotation.x = Math.sin(t * speed * 0.77 + p * 1.3) * amp * 0.6;
  });
}

export function pottedPlant(b: Batch, x: number, z: number, s: number, r: () => number): void {
  b.add(G.lathe('pot', [[0, 0], [0.2, 0], [0.24, 0.04], [0.26, 0.38], [0.29, 0.4], [0.29, 0.44], [0.24, 0.45], [0, 0.42]]), PALETTE.plantPot, { at: [x, 0, z], scale: s });
  b.puck(0.235 * s, 0.03 * s, PALETTE.coffee, { at: [x, 0.42 * s, z], cast: false });
  b.cyl(0.025 * s, 0.035 * s, 0.6 * s, '#7A5A3A', { at: [x, 0.7 * s, z], seg: 8 });
  const leaves = 9;
  for (let i = 0; i < leaves; i++) {
    const a = (i / leaves) * Math.PI * 2 + r() * 0.6;
    const tilt = 0.5 + r() * 0.6;
    const yy = (0.75 + r() * 0.45) * s;
    const rad = (0.14 + r() * 0.12) * s;
    b.ball([0.13 * s, 0.07 * s, 0.26 * s], i % 3 === 0 ? shade(PALETTE.plantLeaf, 0.08) : i % 3 === 1 ? PALETTE.plantLeaf : shade(PALETTE.plantLeaf, -0.06), {
      at: [x + Math.cos(a) * rad, yy, z + Math.sin(a) * rad],
      rot: [tilt * Math.sin(a) * -1, -a + Math.PI / 2, 0],
    });
  }
  b.ball([0.16 * s, 0.2 * s, 0.16 * s], PALETTE.plantLeaf, { at: [x, 1.2 * s, z] });
}
