// Furniture and fittings: reception, manager's corner, break area, whiteboard, posters, clock,
// plants, lounge bits. Every prop has one builder that works in its own local frame (pivot at
// the floor contact point, front facing +Z, sizes from dimensions.json), so a catalog model can
// later replace any builder's output one for one. Tall props get their own fade group; low
// ones go into the static batch.
import * as THREE from 'three';
import { PALETTE } from '../style/palette';
import type { OfficeStats } from './types';
import { Batch, CanvasTex, fitText, font, G, rng, shade } from './kit';
import { aabb, footprint, type WallSide, type WorldCtx } from './ctx';
import { wallFacingYaw } from './building';
import { OFFICE } from './layout';
import D from './dimensions.json';
import { sparkle } from './screens';
import { couch } from './decor';

const WALL_FACE = OFFICE.halfD; // |z| or |x| of the inside face of the walls
/** The whiteboard hangs left of the Team Room. */
const BOARD_X = -5.6;

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

/** A slow wobble about the object's base: plants and trees breathe a little. */
export function sway(ctx: WorldCtx, obj: THREE.Object3D, amp: number, phase: number): void {
  const p = phase * Math.PI * 2;
  const speed = 0.8 + phase * 0.5;
  ctx.tickers.push((_dt, t) => {
    obj.rotation.z = Math.sin(t * speed + p) * amp;
    obj.rotation.x = Math.sin(t * speed * 0.77 + p * 1.3) * amp * 0.6;
  });
}

// ---------------------------------------------------------------------------------------------
// Reception (just inside the door, on the right)

const RECEPTION_YAW = (-3 * Math.PI) / 4; // the visitor side faces the door and the boulevard

function buildReception(ctx: WorldCtx): void {
  const R = D.reception;
  // Arc centre in the room; the builder's pivot is the middle of the counter's footprint.
  const arcX = 6.7;
  const arcZ = 8.7;
  const mid = (R.innerR + R.outerR) / 2;
  const px = arcX + Math.sin(RECEPTION_YAW) * mid;
  const pz = arcZ + Math.cos(RECEPTION_YAW) * mid;
  ctx.statics.place(px, 0, pz, RECEPTION_YAW, () => buildReceptionDesk(ctx.statics));
  ctx.colliders.push(aabb(5.1, 5.8, 7.75, 9.2), aabb(5.7, 7.2, 7.1, 7.8), aabb(5.3, 6.1, 7.3, 8.1));
  ctx.blobs.add(5.8, 8.1, 2.4, 2.4, { shape: 'round' });

  // The "NOW HIRING!" sign on two posts behind the counter, angled toward the door.
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
  // A little emissive so the sign glows into the bloom pass.
  const signFace = new THREE.Mesh(
    new THREE.PlaneGeometry(D.hiringSign.w - 0.12, D.hiringSign.h - 0.12),
    new THREE.MeshStandardMaterial({ map: sign.tex, emissive: '#FFFFFF', emissiveMap: sign.tex, emissiveIntensity: 0.55, roughness: 0.7 }),
  );
  signFace.position.set(0, D.hiringSign.centerY, 0.045);
  tallProp(ctx, 'hiring-sign', (b) => buildHiringSignFrame(b), { extra: [signFace], at: [sx, sz], yaw: Math.atan2(-0.8, 0.6) });
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

/**
 * Curved reception counter: blue body, white top, a yellow stripe, a bell, the receptionist's
 * monitor and a little plant. Pivot at the middle of the footprint; the convex visitor side
 * faces +Z (the arc is centred behind it, on -Z).
 */
export function buildReceptionDesk(b: Batch, d = D.reception): void {
  const mid = (d.innerR + d.outerR) / 2;
  const span = THREE.MathUtils.degToRad(d.arcToDeg - d.arcFromDeg);
  const th0 = Math.PI / 2 - span / 2;
  const th1 = Math.PI / 2 + span / 2;
  const c = (r: number, th: number, y: number): [number, number, number] => [Math.cos(th) * r, y, Math.sin(th) * r - mid];
  const o = { at: [0, 0, -mid] as [number, number, number] };
  b.add(arcSlab(d.innerR, d.outerR, th0, th1, d.h - 0.06, 0.05), '#5CC8FF', { ...o, finish: 'plastic' });
  b.add(arcSlab(d.innerR - 0.05, d.outerR + 0.1, th0 - 0.03, th1 + 0.03, 0.06, 0.03), '#FBF6EC', { at: [0, d.h - 0.06, -mid], tex: 'speckle' });
  b.add(arcSlab(d.outerR - 0.01, d.outerR + 0.085, th0 + 0.03, th1 - 0.03, 0.1, 0.02), '#FFC94A', { at: [0, 0.62, -mid], cast: false });
  b.add(arcSlab(d.outerR - 0.01, d.outerR + 0.085, th0 + 0.03, th1 - 0.03, 0.05, 0.015), '#FFFDF7', { at: [0, 0.12, -mid], cast: false });
  // Bell on the visitor's side of the counter.
  const bell = Math.PI / 2 - 0.05;
  b.puck(0.08, 0.025, '#3B4252', { at: c(d.outerR - 0.22, bell, d.h + 0.012), finish: 'plastic' });
  b.add(G.hemisphere(), '#FFD34E', { at: c(d.outerR - 0.22, bell, d.h + 0.025), scale: [0.065, 0.06, 0.065], finish: 'gloss' });
  b.ball(0.014, '#FFD34E', { at: c(d.outerR - 0.22, bell, d.h + 0.09), finish: 'gloss' });
  // Receptionist's monitor, facing into the arc.
  const mon = Math.PI / 2 + 0.45;
  b.box(0.5, 0.34, 0.05, PALETTE.monitorBezel, { at: c(d.innerR + 0.2, mon, d.h + 0.24), rot: [0, -mon - Math.PI / 2, 0], finish: 'plastic' });
  b.box(0.05, 0.12, 0.04, PALETTE.monitorBezel, { at: c(d.innerR + 0.2, mon, d.h + 0.06), finish: 'plastic' });
  // A little pot plant at the far end.
  const pl = th0 + 0.12;
  const [plx, , plz] = c(mid, pl, 0);
  b.cyl(0.08, 0.065, 0.12, PALETTE.plantPot, { at: [plx, d.h + 0.06, plz] });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.ball([0.05, 0.09, 0.05], i % 2 ? PALETTE.plantLeaf : shade(PALETTE.plantLeaf, 0.08), {
      at: [plx + Math.cos(a) * 0.04, d.h + 0.19, plz + Math.sin(a) * 0.04],
      rot: [Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5],
    });
  }
}

/** The NOW HIRING board's frame and posts (the printed face is a separate textured plane). */
export function buildHiringSignFrame(b: Batch, d = D.hiringSign): void {
  b.box(d.w, d.h, 0.07, '#FF5A5F', { at: [0, d.centerY, 0], r: 0.06, finish: 'plastic' });
  for (const k of [-1, 1]) b.cyl(0.04, 0.04, d.centerY - d.h / 2 + 0.03, '#3B4252', { at: [k * 0.62, (d.centerY - d.h / 2 + 0.03) / 2, -0.04], seg: 14, finish: 'plastic' });
  for (const k of [-1, 1]) b.puck(0.16, 0.05, '#3B4252', { at: [k * 0.62, 0.025, -0.04], finish: 'plastic' });
}

// ---------------------------------------------------------------------------------------------
// Manager's corner (north-east)

function buildManagerCorner(ctx: WorldCtx): void {
  const b = ctx.statics;
  const dx = 10.8;
  const dz = -7.4;
  // Rug, then the desk with the boss's side (+Z in desk space) to the north, facing the room.
  b.puck(2.2, 0.03, '#F49AC1', { at: [dx, 0.015, dz - 0.3], cast: false, finish: 'matte', seg: 48, tex: 'carpet' });
  b.puck(1.9, 0.034, '#FFC1DA', { at: [dx, 0.017, dz - 0.3], cast: false, finish: 'matte', seg: 48, tex: 'carpet' });
  b.place(dx, 0, dz, Math.PI, () => buildManagerDesk(b));
  ctx.colliders.push(footprint(dx, dz, D.managerDesk.w, D.managerDesk.d));
  ctx.blobs.add(dx, dz, 2.6, 1.4);

  // "WORLD'S OKAYEST MANAGER" mug: printed sleeve on a separate mesh.
  const top = D.managerDesk.h;
  const mugTex = new CanvasTex(256, 96, (c, w, h) => {
    c.fillStyle = '#FFFDF8';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#E63946';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = font(700, 22);
    for (const x of [w / 4, (w * 3) / 4]) {
      c.fillText("WORLD'S OKAYEST", x, h / 2 - 14);
      c.fillText('MANAGER', x, h / 2 + 14);
    }
  });
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.12, 24, 1, true), new THREE.MeshStandardMaterial({ map: mugTex.tex, roughness: 0.45 }));
  mug.position.set(dx + 0.45, top + 0.06, dz + 0.15);
  mug.rotation.y = -Math.PI / 2;
  mug.castShadow = true;
  ctx.root.add(mug);
  b.puck(0.05, 0.01, '#FFFDF8', { at: [dx + 0.45, top + 0.005, dz + 0.15], finish: 'plastic' });
  b.cyl(0.048, 0.048, 0.005, PALETTE.coffee, { at: [dx + 0.45, top + 0.115, dz + 0.15], cast: false });
  b.torus(0.032, 0.011, '#FFFDF8', { at: [dx + 0.51, top + 0.06, dz + 0.15], finish: 'plastic' });

  // The boss chair, facing the desk.
  const chair = new Batch();
  buildBossChair(chair);
  const chairGroup = chair.build({ name: 'boss-chair' });
  chairGroup.position.set(dx, 0, dz - 0.95);
  ctx.root.add(chairGroup);

  // Bookshelf on the north wall.
  const bx = 12.2;
  const r = rng(99);
  tallProp(ctx, 'bookshelf', (s) => buildBookshelf(s, r), { at: [bx, -WALL_FACE + D.bookshelf.d / 2 + 0.02] });
  ctx.colliders.push(aabb(bx - D.bookshelf.w / 2, bx + D.bookshelf.w / 2, -WALL_FACE, -WALL_FACE + D.bookshelf.d + 0.02));

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
  tallProp(ctx, 'filing-cabinet', (s) => buildFilingCabinet(s, signYaw), { extra: [signMesh], at: [fx, fz], yaw: -Math.PI / 2 });
  ctx.colliders.push(footprint(fx, fz, D.fileCabinet.w, D.fileCabinet.d + 0.04, 1));
  ctx.blobs.add(fx - 0.05, fz, 1.0, 1.1);
  ctx.interactables.push({
    id: 'archive',
    kind: 'archive',
    position: new THREE.Vector3(fx - 1.0, 1.4, fz),
    radius: 1.6,
    label: 'Personnel Files',
  });
}

/**
 * The manager's big wooden desk. The boss sits on its +Z side; the drawer pedestals and the
 * gold trophy face visitors (-Z), so the office sees them.
 */
export function buildManagerDesk(b: Batch, d = D.managerDesk): void {
  const wood = PALETTE.wood;
  const top = d.h;
  b.box(d.w, 0.08, d.d, wood, { at: [0, top - 0.04, 0], r: 0.04, finish: 'wood' });
  for (const s of [-1, 1]) {
    b.box(0.5, top - 0.08, d.d - 0.14, shade(wood, -0.06), { at: [s * 0.8, (top - 0.08) / 2, 0], r: 0.04, finish: 'wood' });
    for (let i = 0; i < 3; i++) b.box(0.42, 0.17, 0.03, shade(wood, 0.05), { at: [s * 0.8, 0.13 + i * 0.2, -d.d / 2 + 0.07], r: 0.015, finish: 'wood' });
    for (let i = 0; i < 3; i++) b.capsule(0.012, 0.08, '#E8C07D', { at: [s * 0.8, 0.15 + i * 0.2, -d.d / 2 + 0.045], rot: [0, 0, Math.PI / 2], finish: 'gloss' });
  }
  b.box(1.1, 0.5, 0.04, shade(wood, -0.1), { at: [0, 0.42, d.d / 2 - 0.12], r: 0.02, finish: 'wood' });
  // Laptop (its screen faces the boss), desk lamp, a little gold trophy.
  b.box(0.42, 0.02, 0.3, '#C8D0DC', { at: [0.1, top + 0.01, 0.05], r: 0.01, finish: 'gloss' });
  // The lid hinges at the far edge and leans away from the boss.
  b.box(0.42, 0.28, 0.02, '#C8D0DC', { at: [0.1, top + 0.15, -0.11], rot: [-0.25, 0, 0], r: 0.01, finish: 'gloss' });
  b.box(0.38, 0.24, 0.005, '#7FD8FF', { at: [0.1, top + 0.15, -0.098], rot: [-0.25, 0, 0], r: 0.002, glow: 0.5, cast: false });
  b.puck(0.09, 0.03, '#3B4252', { at: [-0.8, top + 0.015, 0.25], finish: 'plastic' });
  b.cyl(0.012, 0.012, 0.36, '#3B4252', { at: [-0.8, top + 0.2, 0.25], seg: 8, finish: 'plastic' });
  b.cyl(0.05, 0.11, 0.12, '#FFC94A', { at: [-0.72, top + 0.38, 0.18], rot: [-0.5, 0, -0.4], finish: 'plastic' });
  b.ball(0.035, '#FFF1C9', { at: [-0.74, top + 0.33, 0.2], glow: 2.6, cast: false });
  b.puck(0.05, 0.02, '#E8B33C', { at: [0.75, top + 0.01, 0.25], finish: 'gloss' });
  b.cyl(0.012, 0.02, 0.08, '#E8B33C', { at: [0.75, top + 0.06, 0.25], finish: 'gloss' });
  b.add(G.hemisphere(), '#FFD34E', { at: [0.75, top + 0.16, 0.25], scale: [0.06, -0.07, 0.06], finish: 'gloss' });
}

/** The boss chair: tall, plush and red, with armrests. Faces +Z. */
export function buildBossChair(b: Batch, d = D.bossChair): void {
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.box(0.07, 0.05, 0.36, '#2B2D42', { at: [Math.sin(a) * 0.18, 0.08, Math.cos(a) * 0.18], rot: [0, a, 0], r: 0.022, finish: 'plastic' });
    b.ball(0.05, '#1F2230', { at: [Math.sin(a) * 0.34, 0.05, Math.cos(a) * 0.34], ws: 12, hs: 8, finish: 'plastic' });
  }
  b.cyl(0.035, 0.035, 0.3, PALETTE.metal, { at: [0, 0.26, 0], finish: 'plastic' });
  b.box(0.66, 0.14, 0.6, '#B23A48', { at: [0, d.seatH - 0.07, 0], r: 0.06, finish: 'cloth' });
  b.box(0.66, d.backH, 0.16, '#B23A48', { at: [0, 0.98, -0.28], rot: [-0.12, 0, 0], r: 0.07, finish: 'cloth' });
  b.box(0.5, 0.2, 0.1, shade('#B23A48', 0.1), { at: [0, 1.32, -0.31], rot: [-0.12, 0, 0], r: 0.05, finish: 'cloth' });
  for (const s of [-1, 1]) {
    b.box(0.1, 0.06, 0.48, '#2B2D42', { at: [s * 0.36, 0.68, -0.02], r: 0.03, finish: 'plastic' });
    b.box(0.05, 0.2, 0.05, '#2B2D42', { at: [s * 0.36, 0.57, -0.02], r: 0.02, finish: 'plastic' });
  }
}

/** Open-fronted bookshelf full of chunky books. Front +Z. */
export function buildBookshelf(b: Batch, r: () => number, d = D.bookshelf): void {
  const caseCol = shade(PALETTE.wood, -0.04);
  b.box(d.w, d.h, 0.05, shade(PALETTE.wood, -0.12), { at: [0, d.h / 2, -d.d / 2 + 0.025], r: 0.02, finish: 'wood' });
  for (const k of [-1, 1]) b.box(0.07, d.h, d.d, caseCol, { at: [k * (d.w / 2 - 0.035), d.h / 2, 0], r: 0.03, finish: 'wood' });
  b.box(d.w + 0.06, 0.07, d.d + 0.04, caseCol, { at: [0, d.h - 0.02, 0], r: 0.03, finish: 'wood' });
  b.box(d.w, 0.1, d.d, caseCol, { at: [0, 0.05, 0], r: 0.03, finish: 'wood' });
  const books = ['#FF7A6B', '#5CC8FF', '#FFC94A', '#6EDC9A', '#B48CFF', '#FF9DCB', '#3D7CFF'];
  for (let shelf = 0; shelf < d.shelves; shelf++) {
    const y = 0.1 + shelf * 0.44;
    if (shelf > 0) b.box(d.w - 0.12, 0.045, d.d - 0.04, shade(PALETTE.wood, 0.06), { at: [0, y, 0.01], r: 0.018, finish: 'wood' });
    let x = -d.w / 2 + 0.12;
    while (x < d.w / 2 - 0.25) {
      const bw = 0.06 + r() * 0.07;
      const bh = 0.24 + r() * 0.14;
      if (r() < 0.12) {
        x += 0.15;
        continue;
      }
      b.box(bw, bh, 0.26, books[Math.floor(r() * books.length)], { at: [x + bw / 2, y + 0.025 + bh / 2, 0.02], rot: [0, 0, r() < 0.15 ? 0.2 : 0], r: 0.012, seg: 2, cast: false });
      x += bw + 0.008;
    }
  }
}

/** The Personnel Files: a blue four-drawer cabinet with a sign on top (printed face separate). Front +Z. */
export function buildFilingCabinet(b: Batch, signYaw = 0, d = D.fileCabinet): void {
  b.box(d.w, d.h, d.d, '#5C8DFF', { at: [0, d.h / 2, 0], r: 0.05, finish: 'plastic' });
  const step = (d.h - 0.08) / d.drawers;
  for (let i = 0; i < d.drawers; i++) {
    const y = 0.2 + i * step;
    b.box(d.w - 0.1, step - 0.05, 0.04, '#7AA5FF', { at: [0, y, d.d / 2], r: 0.03, finish: 'plastic' });
    b.capsule(0.018, 0.16, '#E9EEF6', { at: [0, y + 0.05, d.d / 2 + 0.035], rot: [0, 0, Math.PI / 2], finish: 'gloss' });
    b.box(0.18, 0.07, 0.008, '#FFFDF7', { at: [0, y - 0.05, d.d / 2 + 0.023], r: 0.004, cast: false });
  }
  b.box(0.94, 0.35, 0.06, '#3B4252', { at: [0, 1.56, 0], rot: [-0.1, 0, 0], r: 0.035, parent: new THREE.Matrix4().makeRotationY(signYaw), finish: 'plastic' });
  b.box(0.06, 0.12, 0.06, '#3B4252', { at: [0, 1.36, 0], r: 0.02 });
  for (let i = 0; i < 4; i++) b.box(0.04, 0.2, 0.26, ['#FFC94A', '#FF7A6B', '#6EDC9A', '#FFFDF8'][i], { at: [-0.2 + i * 0.13, d.h - 0.07, 0.08], rot: [0, 0, (i - 1.5) * 0.12], r: 0.01, cast: false });
}

// ---------------------------------------------------------------------------------------------
// Break area (north-west)

function buildBreakArea(ctx: WorldCtx): void {
  const b = ctx.statics;
  const wz = -WALL_FACE;
  const K = D.kitchen;
  const kx = -11.55;
  const kz = wz + K.d / 2 + 0.02;
  b.place(kx, 0, kz, 0, () => buildKitchenCounter(b));
  ctx.colliders.push(aabb(kx - K.w / 2 - 0.05, kx + K.w / 2 + 0.05, wz, wz + K.d + 0.06));
  ctx.blobs.add(kx, kz + 0.05, K.w + 0.4, K.d + 0.4);

  const upper = new Batch();
  upper.place(kx, 0, wz, 0, () => buildUpperCupboards(upper));
  ctx.root.add(upper.build({ name: 'cupboards' }));

  // Coffee machine (interactable) with steam.
  const mx = -11.6;
  const mz = wz + 0.3;
  tallProp(ctx, 'coffee-machine', (s) => s.place(0, K.h, 0, 0, () => buildCoffeeMachine(s)), { at: [mx, mz] });
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
      p.position.set(mx + Math.sin(t * 2 + i) * 0.03 * k, K.h + 0.16 + k * 0.55, mz + 0.24 + Math.cos(t * 1.7 + i) * 0.02);
      p.scale.setScalar(0.025 + k * 0.05);
      (p.material as THREE.MeshBasicMaterial).opacity = Math.sin(k * Math.PI) * 0.55;
    });
  });
  ctx.interactables.push({
    id: 'coffee',
    kind: 'coffee',
    position: new THREE.Vector3(mx, 1.4, wz + 1.25),
    radius: 1.5,
    label: 'Grab a coffee',
  });

  // Fridge in the corner, water cooler by the counter.
  const F = D.fridge;
  const fx = -OFFICE.halfW + F.w / 2 + 0.01;
  const fz = wz + F.d / 2 + 0.03;
  const fr = rng(5);
  tallProp(ctx, 'fridge', (s) => buildFridge(s, fr), { at: [fx, fz] });
  ctx.colliders.push(footprint(fx, fz, F.w + 0.02, F.d + 0.06));
  ctx.blobs.add(fx, fz, 1.1, 1.1);

  const wcx = -9.35;
  const wcz = wz + 0.32;
  const jug = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 0.42, 24),
    new THREE.MeshStandardMaterial({ color: '#7FD3FF', roughness: 0.15, transparent: true, opacity: 0.7, depthWrite: false }),
  );
  jug.position.set(0, 1.2, 0);
  tallProp(ctx, 'water-cooler', (s) => buildWaterCooler(s), { extra: [jug], at: [wcx, wcz] });
  ctx.colliders.push(footprint(wcx, wcz, D.waterCooler.w + 0.04, D.waterCooler.d + 0.04));
  ctx.blobs.add(wcx, wcz, 0.7, 0.7, { shape: 'round' });

  // Couch (seat facing east), coffee table and a round rug by the west windows.
  const rx = -12.0;
  const rz = -6.6;
  b.puck(1.75, 0.03, '#FFD27F', { at: [rx, 0.015, rz], cast: false, finish: 'matte', seg: 48, tex: 'carpet' });
  b.puck(1.5, 0.034, '#FFE3A8', { at: [rx, 0.017, rz], cast: false, finish: 'matte', seg: 48, tex: 'carpet' });
  const cx = -OFFICE.halfW + D.couch.d / 2 + 0.03;
  couch(b, new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(cx, 0, rz), D.couch.w, '#FF7A6B', ['#FFD93D', '#5CC8FF']);
  ctx.colliders.push(aabb(-OFFICE.halfW, cx + D.couch.d / 2 + 0.02, rz - D.couch.w / 2 - 0.05, rz + D.couch.w / 2 + 0.05));
  ctx.blobs.add(cx, rz, 1.3, 2.7);
  const tx = -12.15;
  b.place(tx, 0, rz, 0, () => buildCoffeeTable(b));
  ctx.colliders.push(footprint(tx, rz, D.coffeeTable.r * 2, D.coffeeTable.r * 2));
  ctx.blobs.add(tx, rz, 1.2, 1.2, { shape: 'round' });
}

/** Kitchen counter: mint cupboards under a wooden top. Front +Z. */
export function buildKitchenCounter(b: Batch, d = D.kitchen): void {
  b.box(d.w, d.h - 0.06, d.d - 0.04, '#8FE0C8', { at: [0, (d.h - 0.06) / 2, -0.02], r: 0.04, finish: 'plastic' });
  b.box(d.w + 0.06, 0.06, d.d + 0.04, PALETTE.wood, { at: [0, d.h - 0.03, 0], r: 0.03, finish: 'wood' });
  const doors = 4;
  const dw = d.w / doors;
  for (let i = 0; i < doors; i++) {
    const x = -d.w / 2 + dw * (i + 0.5);
    b.box(dw - 0.08, d.h - 0.24, 0.03, '#B6EEDD', { at: [x, (d.h - 0.06) / 2, d.d / 2 - 0.03], r: 0.025, finish: 'plastic' });
    b.capsule(0.014, 0.1, '#FFFDF7', { at: [x + dw * 0.31, d.h - 0.24, d.d / 2 - 0.005], finish: 'gloss' });
  }
}

/** Three white wall cupboards, hung above the counter. Origin at the wall, under the middle one. */
export function buildUpperCupboards(b: Batch): void {
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 1.05;
    b.box(0.98, 0.62, 0.34, '#FFFDF7', { at: [x, 1.95, 0.19], r: 0.04, finish: 'plastic' });
    b.capsule(0.013, 0.09, '#8FE0C8', { at: [x + 0.32, 1.76, 0.37], finish: 'gloss' });
  }
}

/** Red espresso machine with a mug under the spout. Pivot on the counter top. Front +Z. */
export function buildCoffeeMachine(b: Batch, d = D.coffeeMachine): void {
  b.box(d.w, d.h - 0.14, d.d, '#E2504C', { at: [0, (d.h - 0.14) / 2, 0], r: 0.07, finish: 'plastic' });
  b.box(d.w - 0.08, 0.14, d.d - 0.04, '#3B4252', { at: [0, d.h - 0.07, 0], r: 0.05, finish: 'plastic' });
  b.box(0.3, 0.2, 0.06, '#3B4252', { at: [0, 0.22, d.d / 2], r: 0.03, finish: 'plastic' });
  b.box(0.12, 0.05, 0.08, '#C8D0DC', { at: [0, 0.38, d.d / 2 + 0.02], r: 0.02, finish: 'gloss' });
  b.box(0.26, 0.025, 0.14, '#C8D0DC', { at: [0, 0.0125, d.d / 2 + 0.04], r: 0.01, finish: 'gloss' });
  // Status lights: the green one glows.
  for (let i = 0; i < 3; i++) b.ball(0.025, ['#6EDC9A', '#FFC94A', '#FFFDF7'][i], { at: [-0.1 + i * 0.1, 0.5, d.d / 2 + 0.005], scale: [1, 1, 0.5], glow: i === 0 ? 2.2 : 0, cast: false });
  b.cyl(0.045, 0.04, 0.09, '#FFFDF8', { at: [0, 0.07, d.d / 2 + 0.04], finish: 'plastic' });
  b.torus(0.03, 0.01, '#FFFDF8', { at: [0.05, 0.07, d.d / 2 + 0.04], finish: 'plastic' });
}

/** Retro pastel-blue fridge with chrome handles and a few magnets. Front +Z. */
export function buildFridge(b: Batch, r: () => number, d = D.fridge): void {
  b.box(d.w, d.h, d.d, '#9AD9FF', { at: [0, d.h / 2, 0], r: 0.09, finish: 'plastic' });
  b.box(d.w - 0.06, 0.02, 0.02, '#7CC3EE', { at: [0, d.h * 0.66, d.d / 2], r: 0.008, cast: false });
  b.capsule(0.022, 0.32, '#FFFDF7', { at: [d.w / 2 - 0.1, d.h * 0.78, d.d / 2 + 0.02], finish: 'gloss' });
  b.capsule(0.022, 0.5, '#FFFDF7', { at: [d.w / 2 - 0.1, d.h * 0.4, d.d / 2 + 0.02], finish: 'gloss' });
  for (let i = 0; i < 5; i++) b.ball(0.035, ['#FF5A5F', '#FFC93C', '#6EDC9A', '#B48CFF', '#FF9DCB'][i], { at: [-0.2 + r() * 0.3, 0.9 + r() * 0.8, d.d / 2 + 0.01], scale: [1, 1, 0.45], cast: false });
}

/** Water cooler cabinet (the blue jug is a separate translucent mesh). Front +Z. */
export function buildWaterCooler(b: Batch, d = D.waterCooler): void {
  b.box(d.w, 0.98, d.d, '#FFFDF7', { at: [0, 0.49, 0], r: 0.06, finish: 'plastic' });
  b.box(0.24, 0.2, 0.04, '#DDE6F3', { at: [0, 0.8, d.d / 2], r: 0.02 });
  b.ball(0.03, '#3D7CFF', { at: [-0.06, 0.84, d.d / 2 + 0.02], cast: false, finish: 'gloss' });
  b.ball(0.03, '#FF5A5F', { at: [0.06, 0.84, d.d / 2 + 0.02], cast: false, finish: 'gloss' });
  b.puck(0.17, 0.06, '#7FD3FF', { at: [0, 1.42, 0], finish: 'gloss' });
}

/** Round wooden coffee table with magazines and a cup. */
export function buildCoffeeTable(b: Batch, d = D.coffeeTable): void {
  b.puck(d.r, 0.07, PALETTE.wood, { at: [0, d.h - 0.035, 0], finish: 'wood' });
  b.cyl(0.07, 0.1, d.h - 0.07, shade(PALETTE.wood, -0.1), { at: [0, (d.h - 0.07) / 2, 0], finish: 'wood' });
  b.puck(0.25, 0.04, shade(PALETTE.wood, -0.1), { at: [0, 0.02, 0], finish: 'wood' });
  b.cyl(0.04, 0.035, 0.08, '#5CC8FF', { at: [0.15, d.h + 0.04, -0.1], finish: 'plastic' });
  b.box(0.22, 0.02, 0.3, '#FF9DCB', { at: [-0.12, d.h + 0.01, 0.08], rot: [0, 0.4, 0], r: 0.008 });
}

// ---------------------------------------------------------------------------------------------
// Lounge bits: bean bags by the break rug, the vending machine, a coat rack and a printer

function buildLounge(ctx: WorldCtx): void {
  const b = ctx.statics;
  for (const [x, z, c] of [
    [-10.55, -5.95, '#B48CFF'],
    [-10.75, -7.45, '#FFC94A'],
  ] as const) {
    b.place(x, 0, z, 0, () => buildBeanBag(b, c));
    ctx.colliders.push(footprint(x, z, 0.8, 0.8));
    ctx.blobs.add(x, z, 1.1, 1.1, { shape: 'round' });
  }

  const vx = -OFFICE.halfW + D.vending.d / 2 + 0.02;
  const vz = 6.0;
  const vr = rng(77);
  tallProp(ctx, 'vending', (s) => buildVendingMachine(s, vr), { at: [vx, vz], yaw: Math.PI / 2 });
  ctx.colliders.push(footprint(vx, vz, D.vending.w, D.vending.d + 0.04, 1));
  ctx.blobs.add(vx + 0.05, vz, 1.1, 1.2);

  // Coat rack just inside the door, west side (clear of the intern bench at its longest).
  const cx = -2.95;
  const cz = OFFICE.halfD - 0.5;
  tallProp(ctx, 'coat-rack', (s) => buildCoatRack(s), { at: [cx, cz] });
  ctx.colliders.push(footprint(cx, cz, 0.5, 0.5));
  ctx.blobs.add(cx, cz, 0.7, 0.7, { shape: 'round' });

  // A big friendly printer against the east wall, between the windows.
  const px = OFFICE.halfW - 0.4;
  const pz = -2.0;
  tallProp(ctx, 'printer', (s) => buildPrinter(s), { at: [px, pz], yaw: -Math.PI / 2 });
  ctx.colliders.push(footprint(px, pz, 0.95, 0.72, 1));
  ctx.blobs.add(px, pz, 1.0, 1.2);
}

/** Squashy bean bag with a dimple. */
export function buildBeanBag(b: Batch, color: string): void {
  b.ball([0.42, 0.3, 0.42], color, { at: [0, 0.26, 0], finish: 'cloth' });
  b.ball([0.3, 0.2, 0.3], shade(color, 0.06), { at: [0.05, 0.46, 0.05], finish: 'cloth' });
}

/** Red vending machine: glass front with rows of snacks, coin panel, pickup slot. Front +Z. */
export function buildVendingMachine(b: Batch, r: () => number, d = D.vending): void {
  b.box(d.w, d.h, d.d, '#FF5A5F', { at: [0, d.h / 2, 0], r: 0.08, finish: 'plastic' });
  b.box(0.62, 1.3, 0.05, '#BFE9FF', { at: [-0.1, 1.15, d.d / 2 - 0.01], r: 0.04, finish: 'gloss' });
  const snacks = ['#FFC94A', '#6EDC9A', '#B48CFF', '#5CC8FF', '#FF9DCB'];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      b.box(0.1, 0.16, 0.06, snacks[Math.floor(r() * snacks.length)], { at: [-0.32 + col * 0.15, 0.68 + row * 0.3, d.d / 2 - 0.02], r: 0.02, cast: false });
    }
  }
  b.box(0.18, 0.5, 0.05, '#3B4252', { at: [0.33, 1.2, d.d / 2 - 0.01], r: 0.03, finish: 'plastic' });
  b.ball(0.02, '#6EDC9A', { at: [0.33, 1.36, d.d / 2 + 0.02], glow: 2.2, cast: false });
  b.box(0.5, 0.16, 0.05, '#3B4252', { at: [-0.1, 0.3, d.d / 2 - 0.01], r: 0.03, finish: 'plastic' });
}

/** Wooden coat rack with a puffy coat and a scarf. */
export function buildCoatRack(b: Batch): void {
  const wood = '#B07A4A';
  b.cyl(0.03, 0.035, 1.75, wood, { at: [0, 0.875, 0], seg: 10, finish: 'wood' });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.box(0.04, 0.04, 0.34, wood, { at: [Math.sin(a) * 0.13, 0.04, Math.cos(a) * 0.13], rot: [0, a, 0], r: 0.015, finish: 'wood' });
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    b.capsule(0.018, 0.12, wood, { at: [Math.sin(a) * 0.08, 1.62, Math.cos(a) * 0.08], rot: [Math.cos(a) * 0.9, 0, -Math.sin(a) * 0.9], finish: 'wood' });
  }
  b.ball(0.06, wood, { at: [0, 1.78, 0], finish: 'wood' });
  // Puffy coat and a striped scarf.
  b.ball([0.2, 0.36, 0.12], '#3D7CFF', { at: [0.12, 1.25, 0.08], rot: [0, 0, 0.12], finish: 'cloth' });
  b.ball([0.08, 0.06, 0.08], '#3D7CFF', { at: [0.1, 1.57, 0.08], finish: 'cloth' });
  b.capsule(0.035, 0.5, '#FF7A6B', { at: [-0.1, 1.33, -0.06], rot: [0.1, 0, -0.08], finish: 'cloth' });
}

/** Big friendly printer/copier with a paper tray. Front +Z. */
export function buildPrinter(b: Batch): void {
  b.box(0.92, 0.82, 0.66, '#F1EEE6', { at: [0, 0.41, 0], r: 0.07, finish: 'plastic' });
  b.box(0.86, 0.14, 0.6, '#DCD7CB', { at: [0, 0.9, 0], r: 0.05, finish: 'plastic' });
  for (let i = 0; i < 2; i++) b.box(0.8, 0.2, 0.03, '#E7E2D6', { at: [0, 0.18 + i * 0.25, 0.33], r: 0.03, finish: 'plastic' });
  b.box(0.3, 0.08, 0.2, '#3B4252', { at: [0.22, 0.99, 0.2], rot: [-0.3, 0, 0], r: 0.03, finish: 'plastic' });
  b.box(0.18, 0.05, 0.005, '#7FD8FF', { at: [0.22, 1.0, 0.31], rot: [-0.3, 0, 0], r: 0.004, glow: 1.4, cast: false });
  b.ball(0.025, '#6EDC9A', { at: [0.36, 1.02, 0.29], glow: 2.0, cast: false });
  b.box(0.34, 0.03, 0.26, '#FFFDF8', { at: [-0.62, 0.74, 0], rot: [0, 0, 0.12], r: 0.01 });
  b.box(0.3, 0.02, 0.24, '#FFFDF8', { at: [-0.6, 0.77, 0], rot: [0, 0, 0.12], r: 0.008, cast: false });
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
  const W = D.whiteboard;
  const tex = new CanvasTex(1024, 466, (c, w, h) => drawBoard(c, w, h, stats));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W.w - 0.1, W.h - 0.1), new THREE.MeshStandardMaterial({ map: tex.tex, roughness: 0.35 }));
  placeOnWall(face, 'north', BOARD_X, W.centerY, 0.085);
  face.receiveShadow = true;
  ctx.root.add(face);
  const frame = new Batch();
  frame.place(BOARD_X, W.centerY, -WALL_FACE, 0, () => buildWhiteboardFrame(frame));
  ctx.root.add(frame.build({ name: 'whiteboard-frame' }));

  ctx.interactables.push({
    id: 'whiteboard',
    kind: 'whiteboard',
    position: new THREE.Vector3(BOARD_X, 1.6, -WALL_FACE + 1.1),
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

/** Whiteboard frame and marker tray. Origin at the wall, board centre at y = 0. */
export function buildWhiteboardFrame(b: Batch, d = D.whiteboard): void {
  b.box(d.w, d.h, 0.06, '#C8D0DC', { at: [0, 0, 0.05], r: 0.04, finish: 'plastic' });
  b.box(d.w - 0.6, 0.05, 0.12, '#C8D0DC', { at: [0, -d.h / 2 - 0.01, 0.1], r: 0.02, finish: 'plastic' });
  ['#3D7CFF', '#E63946', '#2EC4B6'].forEach((c, i) => b.capsule(0.014, 0.1, c, { at: [-0.4 + i * 0.16, -d.h / 2 + 0.03, 0.12], rot: [0, 0, Math.PI / 2], cast: false }));
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
    ['Free', s.idle, '#3B82F6'],
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

  // A squiggly chart that only goes up.
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
// Posters, pictures and the clock

function buildPosters(ctx: WorldCtx): void {
  const P = D.poster;
  const posters: { u: number; draw: (c: CanvasRenderingContext2D, w: number, h: number) => void }[] = [
    {
      u: 4.4,
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
      u: 5.75,
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
      u: 7.1,
      draw: (c, w) => {
        c.fillStyle = '#B48CFF';
        c.fillRect(0, 0, w, 700);
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
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        ['Tokens are', 'temporary,', 'commits are', 'forever'].forEach((l, i) => {
          c.fillStyle = i < 2 ? '#FFFDF7' : '#2B2D42';
          fitText(c, l, 700, 66, w - 60);
          c.fillText(l, w / 2, 430 + i * 68);
        });
      },
    },
  ];
  for (const p of posters) hangPicture(ctx, { side: 'north', u: p.u, y: P.centerY - 0.1, w: P.w, h: P.h, px: [400, 700], draw: p.draw });
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

/** Hang a framed canvas picture on the inside of a wall. */
export function hangPicture(ctx: WorldCtx, p: PictureSpec): void {
  const tex = new CanvasTex(p.px[0], p.px[1], p.draw);
  const border = p.border ?? 0.04;
  const frame = new Batch();
  const pos = new THREE.Object3D();
  placeOnWall(pos, p.side, p.u, p.y, 0);
  frame.place(pos.position.x, p.y, pos.position.z, pos.rotation.y, () => buildPictureFrame(frame, p.w, p.h, border, p.frame ?? '#FFFDF7'));
  ctx.root.add(frame.build({ name: 'picture-frame' }));
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.h), new THREE.MeshStandardMaterial({ map: tex.tex, roughness: 0.75, metalness: 0 }));
  placeOnWall(mesh, p.side, p.u, p.y, 0.065);
  mesh.receiveShadow = true;
  ctx.root.add(mesh);
}

/** Picture frame (the picture is a separate plane). Origin at the wall, picture centre at y = 0. */
export function buildPictureFrame(b: Batch, w: number, h: number, border: number, color: string): void {
  b.box(w + border * 2, h + border * 2, 0.04, color, { at: [0, 0, 0.04], r: Math.min(0.025, border * 0.6), finish: 'plastic' });
}

function buildClock(ctx: WorldCtx): void {
  // High above the whiteboard, where the Team Room lamps don't hang in front of it.
  const R = D.clock.r;
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
  placeOnWall(group, 'north', BOARD_X, D.clock.centerY, 0.06);
  const b = new Batch();
  buildClockRim(b);
  group.add(b.build({ name: 'clock-rim' }));
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

/** The clock's chunky red rim (face and hands are separate). Origin at the wall-side centre, front +Z. */
export function buildClockRim(b: Batch, d = D.clock): void {
  b.add(G.puck(d.r + 0.05, 0.08), '#FF7A6B', { rot: [Math.PI / 2, 0, 0], finish: 'plastic' });
}

// ---------------------------------------------------------------------------------------------
// Plants: three kinds (leafy pot, fern, palm) dotted around the room

type PlantKind = 'leafy' | 'fern' | 'palm';

function buildPlants(ctx: WorldCtx): void {
  const spots: [number, number, number, PlantKind][] = [
    [-3.05, -WALL_FACE + 0.45, 1.2, 'palm'],
    [3.05, -WALL_FACE + 0.45, 1.1, 'leafy'],
    [-2.35, WALL_FACE - 0.45, 1.0, 'fern'],
    [2.35, WALL_FACE - 0.45, 1.0, 'fern'],
    [-OFFICE.halfW + 0.5, WALL_FACE - 0.5, 1.3, 'palm'],
    [OFFICE.halfW - 0.5, WALL_FACE - 0.5, 1.25, 'leafy'],
    [-OFFICE.halfW + 0.5, -4.4, 1.15, 'leafy'],
    [OFFICE.halfW - 0.5, -4.4, 1.2, 'palm'],
    [8.0, -WALL_FACE + 0.45, 1.0, 'fern'],
  ];
  spots.forEach(([x, z, s, kind], i) => {
    const r = rng(300 + i);
    const plant = tallProp(ctx, `plant-${i}`, (b) => buildPlant(b, kind, s, r), { at: [x, z], yaw: r() * 6 });
    sway(ctx, plant, kind === 'palm' ? 0.03 : 0.02, r());
    ctx.colliders.push(footprint(x, z, 0.62 * s, 0.62 * s));
    ctx.blobs.add(x, z, 0.9 * s, 0.9 * s, { shape: 'round' });
  });
}

export function buildPlant(b: Batch, kind: PlantKind, s: number, r: () => number): void {
  if (kind === 'fern') buildFern(b, s, r);
  else if (kind === 'palm') buildPalm(b, s, r);
  else buildPottedPlant(b, s, r);
}

function terracottaPot(b: Batch, s: number, color: string = PALETTE.plantPot): void {
  // The rim folds into an inner wall and a flat floor at 0.40, so the soil (0.41–0.434) sits
  // inside the pot without crossing any pot surface (a sloped inner floor used to cut through
  // the soil disc and z-fight with it).
  b.add(G.lathe('pot-well', [[0, 0], [0.2, 0], [0.24, 0.04], [0.26, 0.38], [0.29, 0.4], [0.29, 0.44], [0.24, 0.45], [0.232, 0.4], [0, 0.4]]), color, { scale: s, finish: 'matte' });
  b.puck(0.226 * s, 0.024 * s, PALETTE.coffee, { at: [0, 0.422 * s, 0], cast: false, finish: 'matte' });
}

/** Leafy pot plant (rubber-plant-ish): big glossy leaves on a stem. Size scales with `s` (pot ≈ 0.45 m at s = 1). */
export function buildPottedPlant(b: Batch, s: number, r: () => number): void {
  terracottaPot(b, s);
  b.cyl(0.025 * s, 0.035 * s, 0.6 * s, '#7A5A3A', { at: [0, 0.7 * s, 0], seg: 8 });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + r() * 0.6;
    const tilt = 0.5 + r() * 0.6;
    const yy = (0.75 + r() * 0.45) * s;
    const rad = (0.14 + r() * 0.12) * s;
    b.ball([0.13 * s, 0.07 * s, 0.26 * s], i % 3 === 0 ? shade(PALETTE.plantLeaf, 0.08) : i % 3 === 1 ? PALETTE.plantLeaf : shade(PALETTE.plantLeaf, -0.06), {
      at: [Math.cos(a) * rad, yy, Math.sin(a) * rad],
      rot: [-tilt * Math.sin(a), -a + Math.PI / 2, 0],
      finish: 'plastic',
    });
  }
  b.ball([0.16 * s, 0.2 * s, 0.16 * s], PALETTE.plantLeaf, { at: [0, 1.2 * s, 0], finish: 'plastic' });
}

/** Fern: a low mound of arching fronds in a cream pot. */
export function buildFern(b: Batch, s: number, r: () => number): void {
  b.add(G.lathe('fernpot', [[0, 0], [0.18, 0], [0.22, 0.05], [0.24, 0.3], [0.26, 0.32], [0, 0.31]]), '#F4ECDC', { scale: s, finish: 'plastic' });
  b.puck(0.22 * s, 0.02 * s, PALETTE.coffee, { at: [0, 0.31 * s, 0], cast: false });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + r() * 0.3;
    const out = 0.22 + r() * 0.12;
    for (let k = 0; k < 3; k++) {
      const t = (k + 1) / 3;
      b.ball([0.05 * s, 0.025 * s, 0.13 * s], k % 2 ? '#4FB85F' : '#62C96E', {
        at: [Math.cos(a) * out * t * s, (0.34 + 0.22 * Math.sin(t * Math.PI * 0.8)) * s, Math.sin(a) * out * t * s],
        rot: [0, -a + Math.PI / 2, (t - 0.5) * 0.9],
        finish: 'plastic',
      });
    }
  }
}

/** Indoor palm: three slim canes in a woven basket, crowned with arching fronds. */
export function buildPalm(b: Batch, s: number, r: () => number): void {
  b.cyl(0.24 * s, 0.2 * s, 0.38 * s, '#C9955E', { at: [0, 0.19 * s, 0], seg: 18, finish: 'wood' });
  for (const y of [0.1, 0.22, 0.34]) b.torus(0.225 * s, 0.012 * s, '#A87745', { at: [0, y * s, 0], rot: [Math.PI / 2, 0, 0], finish: 'wood' });
  b.puck(0.21 * s, 0.02 * s, PALETTE.coffee, { at: [0, 0.37 * s, 0], cast: false });
  for (let c = 0; c < 3; c++) {
    const ca = (c / 3) * Math.PI * 2;
    const h = (0.85 + c * 0.18) * s;
    const cx = Math.cos(ca) * 0.06 * s;
    const cz = Math.sin(ca) * 0.06 * s;
    b.cyl(0.018 * s, 0.024 * s, h, '#8A6B3E', { at: [cx, 0.37 * s + h / 2, cz], seg: 7 });
    for (let f = 0; f < 5; f++) {
      const fa = (f / 5) * Math.PI * 2 + r();
      for (let k = 1; k <= 3; k++) {
        const t = k / 3;
        b.ball([0.035 * s, 0.015 * s, 0.11 * s], k % 2 ? '#3FA855' : '#56BE67', {
          at: [cx + Math.cos(fa) * 0.16 * t * s, 0.37 * s + h - 0.12 * t * t * s + 0.04 * s, cz + Math.sin(fa) * 0.16 * t * s],
          rot: [0, -fa + Math.PI / 2, -0.4 - t * 0.6],
          finish: 'plastic',
        });
      }
    }
  }
}

/** Kept for callers that place a leafy pot plant directly in world space. */
export function pottedPlant(b: Batch, x: number, z: number, s: number, r: () => number): void {
  b.place(x, 0, z, 0, () => buildPottedPlant(b, s, r));
}
