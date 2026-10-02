// Finishing touches: the boulevard runner, a waiting corner by reception, wall art, and the
// taped-off "reserved for new hires" spots that turn into real desk pods when the office grows.
import * as THREE from 'three';
import { PALETTE } from '../style/palette';
import type { AABB } from './types';
import { Batch, CanvasTex, fitText, font, rng, shade } from './kit';
import { footprint, type WorldCtx } from './ctx';
import { hangPicture, placeOnWall, pottedPlant, staticProp, swapCouch, tallProp } from './props';
import { findNode } from '../models';
import { addModel, disposeGroup, disposeModel, swapModel } from './modelkit';
import { sparkle } from './screens';
import { OFFICE, type PodSlot } from './layout';
import D from './dimensions.json';

export function buildDecor(ctx: WorldCtx): void {
  buildRunner(ctx);
  buildWaitingCorner(ctx);
  buildWallArt(ctx);
  buildOfficeCat(ctx);
  buildButterflies(ctx);
  buildOddsAndEnds(ctx);
}

/**
 * Catalog-only life: an exit sign over the door, a fire extinguisher, a calendar and a cork board,
 * a hanging plant, bins, and the receptionist (a dog). Nothing here is needed, so a missing model
 * just leaves the spot empty.
 */
function buildOddsAndEnds(ctx: WorldCtx): void {
  const onWall = (name: string, side: 'north' | 'south' | 'east' | 'west', u: number, y: number) => {
    const g = new THREE.Group();
    g.name = name;
    placeOnWall(g, side, u, y, 0);
    ctx.root.add(g);
    return g;
  };
  void addModel(onWall('exit-sign', 'south', 0, 2.72), 'exit_sign', { fit: { w: 0.5, uniform: true }, glow: 0.6 });
  void addModel(onWall('calendar', 'north', -8.5, 1.62), 'calendar_wall', { fit: { h: 0.72, uniform: true } });
  void addModel(onWall('cork-board', 'east', 2.0, 1.6), 'cork_board', { fit: { w: 1.2, uniform: true }, tint: { Accent: '#C98F5A' } });
  void addModel(onWall('hanging-plant', 'south', 5.4, 2.2), 'plant_hanging', { tint: { Accent: '#FF9DCB' } });

  // Floor props with a collider get a simple procedural stand-in, so the collider is never invisible.
  const floor = (name: string, x: number, z: number, w: number, d: number, fill: (b: Batch) => void) => {
    ctx.colliders.push(footprint(x, z, w, d));
    ctx.blobs.add(x, z, w + 0.2, d + 0.2, { shape: 'round' });
    return staticProp(ctx, name, fill, { at: [x, z] });
  };
  void swapModel(ctx, floor('fire-extinguisher', 1.95, OFFICE.halfD - 0.25, 0.3, 0.3, (b) => buildExtinguisher(b)), 'fire_extinguisher', { yaw: Math.PI });
  void swapModel(ctx, floor('trash-bin', -8.8, -OFFICE.halfD + 0.3, 0.36, 0.36, (b) => buildBin(b, '#5CC8FF', 0.34)), 'trash_bin', { tint: { Accent: '#5CC8FF' } });
  void swapModel(ctx, floor('recycling-bin', OFFICE.halfW - 0.3, -0.9, 0.4, 0.4, (b) => buildBin(b, '#4CB860', 0.62)), 'recycling_bin', { yaw: -Math.PI / 2 });
  // The receptionist: a very good dog behind the counter (already walled in by its colliders).
  const dogSpot = new THREE.Group();
  dogSpot.name = 'reception-dog';
  dogSpot.position.set(6.95, 0, 8.95);
  ctx.root.add(dogSpot);
  void addModel(dogSpot, 'pet_dog', { yaw: (-3 * Math.PI) / 4 }).then((dog) => wag(ctx, dog, 0.9));
}

/** Fire extinguisher stand-in: red cylinder, black hose and handle. */
export function buildExtinguisher(b: Batch): void {
  b.cyl(0.075, 0.075, 0.42, '#E63946', { at: [0, 0.21, 0], seg: 16, finish: 'gloss' });
  b.cyl(0.03, 0.04, 0.08, '#2B2D42', { at: [0, 0.46, 0], seg: 10, finish: 'plastic' });
  b.capsule(0.012, 0.18, '#2B2D42', { at: [0.07, 0.35, 0.04], rot: [0, 0, 0.4] });
}

/** Round bin stand-in of height h. */
export function buildBin(b: Batch, color: string, h: number): void {
  b.cyl(0.17, 0.14, h, color, { at: [0, h / 2, 0], seg: 20, finish: 'plastic' });
  b.torus(0.165, 0.012, shade(color, -0.1), { at: [0, h, 0], rot: [Math.PI / 2, 0, 0] });
}

/** Pets: the tail wags and the head looks around now and then. */
function wag(ctx: WorldCtx, pet: THREE.Object3D | null, phase: number): void {
  const tail = pet && findNode(pet, 'Tail');
  const head = pet && findNode(pet, 'Head');
  if (!tail || !head) return;
  ctx.tickers.push((_dt, t) => {
    tail.rotation.y = Math.sin(t * 5 + phase) * 0.45;
    head.rotation.y = Math.sin(t * 0.37 + phase) * 0.5 + Math.sin(t * 0.91 + phase * 2) * 0.15;
  });
}

/** A ginger cat asleep on the break-room couch, breathing slowly. */
function buildOfficeCat(ctx: WorldCtx): void {
  const b = new Batch();
  const fur = '#FF9F45';
  const dark = shade(fur, -0.14);
  b.ball([0.2, 0.11, 0.15], fur, { at: [0, 0.1, 0] });
  b.ball([0.09, 0.025, 0.07], dark, { at: [-0.04, 0.2, 0], cast: false });
  b.ball([0.06, 0.02, 0.06], dark, { at: [0.08, 0.19, 0], cast: false });
  // Head tucked against the body, ears up, eyes shut.
  b.ball([0.09, 0.08, 0.085], fur, { at: [0.17, 0.09, 0.07] });
  for (const s of [-1, 1]) {
    b.ball([0.022, 0.04, 0.015], dark, { at: [0.2, 0.17, 0.07 + s * 0.045], rot: [s * 0.35, 0, -0.3] });
    b.ball([0.016, 0.005, 0.006], PALETTE.eye, { at: [0.255, 0.1, 0.07 + s * 0.032], rot: [0, 0, -0.2], cast: false });
  }
  b.ball([0.012, 0.009, 0.012], '#FF8FA3', { at: [0.262, 0.075, 0.07], cast: false });
  // Tail curled around the front.
  b.torus(0.17, 0.032, fur, { at: [0, 0.05, 0], rot: [Math.PI / 2, 0, 0.6], arc: 2.4 });
  const cat = b.build({ name: 'office-cat' });
  cat.position.set(-OFFICE.halfW + 0.58, D.couch.seatH, -6.1);
  cat.rotation.y = 0.4;
  ctx.root.add(cat);
  let breathing = true;
  ctx.tickers.push((_dt, t) => {
    if (!breathing) return;
    const breath = Math.sin(t * 1.7);
    cat.scale.set(1 + breath * 0.015, 1 + breath * 0.045, 1 + breath * 0.02);
  });
  // The catalog cat stands on the couch instead, looking around and swishing its tail.
  void swapModel(ctx, cat, 'pet_cat', { fit: { h: 0.42, uniform: true }, yaw: 1.2 }).then((m) => {
    if (!m) return;
    breathing = false;
    cat.scale.set(1, 1, 1);
    wag(ctx, m, 0);
  });
}

/** A few butterflies looping around the garden flowers. */
function buildButterflies(ctx: WorldCtx): void {
  const wingGeo = new THREE.SphereGeometry(1, 12, 6);
  wingGeo.scale(0.07, 0.006, 0.05);
  wingGeo.translate(0.065, 0, 0);
  const bodyGeo = new THREE.CapsuleGeometry(0.012, 0.06, 4, 8);
  bodyGeo.rotateX(Math.PI / 2);
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#3B2A20', roughness: 0.7 });
  const homes: [number, number, string][] = [
    [-8.5, 11.8, '#FF7EB6'],
    [6.2, 12.0, '#FFD93D'],
    [11.2, 11.6, '#7FD8FF'],
    [-3.6, 15.2, '#B983FF'],
    [4.4, 18.6, '#FF9F45'],
  ];
  homes.forEach(([hx, hz, color], i) => {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, side: THREE.DoubleSide });
    const fly = new THREE.Group();
    const left = new THREE.Mesh(wingGeo, mat);
    const right = new THREE.Mesh(wingGeo, mat);
    right.rotation.y = Math.PI;
    fly.add(new THREE.Mesh(bodyGeo, bodyMat), left, right);
    fly.scale.setScalar(1.4);
    ctx.root.add(fly);
    const ph = i * 1.7;
    const prev = new THREE.Vector3();
    ctx.tickers.push((_dt, t) => {
      const x = hx + Math.sin(t * 0.55 + ph) * 1.7;
      const y = 0.95 + Math.sin(t * 1.4 + ph) * 0.3 + Math.sin(t * 7 + ph) * 0.04;
      const z = hz + Math.sin(t * 0.37 + ph * 2) * 1.2;
      prev.copy(fly.position);
      fly.position.set(x, y, z);
      const dx = x - prev.x;
      const dz = z - prev.z;
      if (dx * dx + dz * dz > 1e-8) fly.rotation.y = Math.atan2(dx, dz);
      const flap = Math.sin(t * 22 + ph) * 0.95;
      // The right wing is the left one turned around Y, so the same angle mirrors it.
      left.rotation.z = flap;
      right.rotation.z = flap;
    });
  });
}

/** A long warm rug from the door up the central boulevard to the stand-up corner. */
function buildRunner(ctx: WorldCtx): void {
  const z0 = -5.3;
  const z1 = 9.3;
  const len = z1 - z0;
  const zc = (z0 + z1) / 2;
  const b = ctx.statics;
  b.slab(2.7, len, 0.022, 0.7, '#F4A07A', { at: [0, 0.011, zc], cast: false, finish: 'matte', tex: 'carpet' });
  b.slab(2.38, len - 0.32, 0.026, 0.55, '#FFC4A0', { at: [0, 0.013, zc], cast: false, finish: 'matte', tex: 'carpet' });
  // A row of little diamonds down the middle.
  for (let z = z0 + 1.2; z < z1 - 0.9; z += 1.4) {
    b.box(0.26, 0.012, 0.26, '#FFE6D4', { at: [0, 0.03, z], rot: [0, Math.PI / 4, 0], r: 0.006, cast: false, finish: 'matte' });
  }
}

/** Couch built in a local frame: seat faces +Z, backrest at -Z. */
export function couch(b: Batch, parent: THREE.Matrix4, length: number, color: string, pillows: string[]): void {
  const o = { parent };
  b.box(length, 0.36, 0.9, shade(color, -0.06), { ...o, at: [0, 0.22, 0], r: 0.12, finish: 'cloth' });
  for (const s of [-1, 1]) b.box(0.26, 0.6, 0.92, color, { ...o, at: [s * (length / 2 - 0.13), 0.36, 0], r: 0.12, finish: 'cloth' });
  b.box(length, 0.8, 0.3, color, { ...o, at: [0, 0.5, -0.32], r: 0.13, finish: 'cloth' });
  const n = Math.max(1, Math.round((length - 0.5) / 0.9));
  const cw = (length - 0.56) / n;
  for (let i = 0; i < n; i++) {
    b.box(cw - 0.04, 0.16, 0.62, shade(color, 0.08), { ...o, at: [-length / 2 + 0.28 + cw * (i + 0.5), 0.45, 0.1], r: 0.08, finish: 'cloth' });
  }
  pillows.forEach((c, i) => {
    const x = (i - (pillows.length - 1) / 2) * (length * 0.45);
    b.box(0.38, 0.38, 0.16, c, { ...o, at: [x, 0.66, -0.12], rot: [-0.35, 0, 0], r: 0.08, finish: 'cloth' });
  });
  for (const s of [-1, 1]) for (const t of [-1, 1]) b.cyl(0.04, 0.03, 0.06, '#3B4252', { ...o, at: [s * (length / 2 - 0.15), 0.03, t * 0.35], seg: 10 });
}

function buildWaitingCorner(ctx: WorldCtx): void {
  const x = OFFICE.halfW - 0.48;
  const z = 7.0;
  const sofa = staticProp(ctx, 'waiting-couch', (b) => couch(b, new THREE.Matrix4(), 2.0, '#2EC4B6', ['#FFC94A', '#FF9DCB']), { at: [x, z], yaw: -Math.PI / 2 });
  void swapCouch(ctx, sofa, 2.0, '#2EC4B6');
  ctx.colliders.push(footprint(x, z, 2.1, 0.95, 1));
  ctx.blobs.add(x, z, 1.3, 2.4);
  // Low table with magazines and a tiny plant.
  const tx = x - 1.15;
  const table = staticProp(ctx, 'waiting-table', (b) => {
    b.puck(0.42, 0.06, PALETTE.wood, { at: [0, 0.38, 0] });
    b.cyl(0.06, 0.09, 0.34, shade(PALETTE.wood, -0.1), { at: [0, 0.18, 0] });
    b.puck(0.2, 0.035, shade(PALETTE.wood, -0.1), { at: [0, 0.018, 0] });
    b.box(0.22, 0.015, 0.3, '#5CC8FF', { at: [-0.08, 0.42, 0.05], rot: [0, 0.3, 0], r: 0.006 });
    b.box(0.22, 0.015, 0.3, '#FF7A6B', { at: [-0.05, 0.435, -0.02], rot: [0, -0.2, 0], r: 0.006 });
    b.cyl(0.06, 0.05, 0.08, PALETTE.plantPot, { at: [0.18, 0.45, -0.12] });
    b.ball([0.07, 0.09, 0.07], PALETTE.plantLeaf, { at: [0.18, 0.55, -0.12] });
  }, { at: [tx, z] });
  void swapModel(ctx, table, 'coffee_table', { fit: { w: 0.86, uniform: true }, yaw: Math.PI / 2 }).then((m) => {
    if (!m) return;
    const top = 0.42 * m.scale.y;
    void addModel(table, 'succulent', { at: [0.05, top, -0.22], fit: { h: 0.14, uniform: true }, tint: { Accent: '#FF9A7A' } });
    void addModel(table, 'coffee_cup', { at: [-0.06, top, 0.12], tint: { Accent: '#5CC8FF' } });
  });
  ctx.colliders.push(footprint(tx, z, 0.86, 0.86));
  ctx.blobs.add(tx, z, 1.0, 1.0, { shape: 'round' });
}

function buildWallArt(ctx: WorldCtx): void {
  // South wall, facing into the room (you see these when you turn around).
  hangPicture(ctx, {
    side: 'south',
    u: -9.6,
    y: 1.65,
    w: 0.86,
    h: 1.2,
    px: [400, 560],
    draw: (c, w, h) => {
      c.fillStyle = '#9BE15D';
      c.fillRect(0, 0, w, h);
      // A tiny intern in a backwards cap.
      c.fillStyle = '#FFDDBB';
      c.beginPath();
      c.arc(w / 2, 190, 78, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#3D7CFF';
      c.beginPath();
      c.arc(w / 2, 168, 80, Math.PI * 1.02, Math.PI * 1.98);
      c.fill();
      c.fillRect(w / 2 + 50, 150, 80, 20);
      c.fillStyle = '#1E1B2E';
      for (const s of [-1, 1]) {
        c.beginPath();
        c.ellipse(w / 2 + s * 26, 200, 9, 13, 0, 0, Math.PI * 2);
        c.fill();
      }
      c.strokeStyle = '#5A2A2A';
      c.lineWidth = 6;
      c.beginPath();
      c.arc(w / 2, 222, 18, 0.15 * Math.PI, 0.85 * Math.PI);
      c.stroke();
      c.fillStyle = PALETTE.ink;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      fitText(c, 'Be kind to', 700, 62, w - 50);
      c.fillText('Be kind to', w / 2, 360);
      c.fillStyle = '#FFFDF7';
      fitText(c, 'your interns', 700, 66, w - 40);
      c.fillText('your interns', w / 2, 430);
    },
  });
  hangPicture(ctx, {
    side: 'south',
    u: -5.45,
    y: 1.65,
    w: 0.86,
    h: 1.2,
    px: [400, 560],
    draw: (c, w, h) => {
      c.fillStyle = '#FF9F45';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#FFFDF7';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      fitText(c, 'Context window', 700, 58, w - 50);
      c.fillText('Context window', w / 2, 110);
      // Progress bar, nearly full.
      c.fillStyle = 'rgba(255,255,255,0.45)';
      c.beginPath();
      c.roundRect(50, 200, w - 100, 64, 32);
      c.fill();
      c.fillStyle = '#E63946';
      c.beginPath();
      c.roundRect(58, 208, (w - 116) * 0.87, 48, 24);
      c.fill();
      c.fillStyle = PALETTE.ink;
      c.font = font(700, 110);
      c.fillText('87%', w / 2, 360);
      c.font = font(600, 40);
      c.fillText('…time to /compact', w / 2, 462);
    },
  });
  hangPicture(ctx, {
    side: 'south',
    u: 9.6,
    y: 1.65,
    w: 0.86,
    h: 1.2,
    px: [400, 560],
    draw: (c, w, h) => {
      c.fillStyle = '#5CC8FF';
      c.fillRect(0, 0, w, h);
      // Laptop doodle with a big tick.
      c.fillStyle = '#FFFDF7';
      c.beginPath();
      c.roundRect(w / 2 - 110, 90, 220, 140, 16);
      c.fill();
      c.beginPath();
      c.roundRect(w / 2 - 140, 232, 280, 26, 13);
      c.fill();
      c.strokeStyle = '#22A855';
      c.lineWidth = 18;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(w / 2 - 44, 160);
      c.lineTo(w / 2 - 10, 194);
      c.lineTo(w / 2 + 52, 124);
      c.stroke();
      c.fillStyle = PALETTE.ink;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      fitText(c, 'It works on', 700, 62, w - 50);
      c.fillText('It works on', w / 2, 360);
      c.fillStyle = '#FFFDF7';
      fitText(c, 'my machine', 700, 66, w - 40);
      c.fillText('my machine', w / 2, 432);
    },
  });

  // Employee of the month (west wall) and the org chart (east wall), between the windows.
  const star = hangPicture(ctx, {
    side: 'west',
    u: -2.0,
    y: 1.62,
    w: 0.8,
    h: 1.0,
    px: [400, 500],
    frame: '#E8B33C',
    border: 0.06,
    draw: (c, w, h) => {
      c.fillStyle = '#FFF4D6';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#FFE08A';
      c.beginPath();
      c.arc(w / 2, 200, 120, 0, Math.PI * 2);
      c.fill();
      sparkle(c, w / 2, 200, 96, PALETTE.claude, 0.1);
      c.fillStyle = PALETTE.ink;
      c.beginPath();
      c.arc(w / 2 - 22, 190, 9, 0, Math.PI * 2);
      c.arc(w / 2 + 22, 190, 9, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = PALETTE.ink;
      c.lineWidth = 6;
      c.beginPath();
      c.arc(w / 2, 206, 18, 0.15 * Math.PI, 0.85 * Math.PI);
      c.stroke();
      c.fillStyle = '#B7791F';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      fitText(c, 'EMPLOYEE', 700, 58, w - 60);
      c.fillText('EMPLOYEE', w / 2, 370);
      fitText(c, 'OF THE MONTH', 700, 46, w - 60);
      c.fillText('OF THE MONTH', w / 2, 425);
    },
  });
  // The catalog frame prints its own title; its Label gets the portrait.
  const portrait = new CanvasTex(256, 304, (c, w, h) => {
    c.fillStyle = '#FFF4D6';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#FFE08A';
    c.beginPath();
    c.arc(w / 2, h / 2, 104, 0, Math.PI * 2);
    c.fill();
    sparkle(c, w / 2, h / 2, 86, PALETTE.claude, 0.1);
    c.fillStyle = PALETTE.ink;
    c.beginPath();
    c.arc(w / 2 - 20, h / 2 - 8, 8, 0, Math.PI * 2);
    c.arc(w / 2 + 20, h / 2 - 8, 8, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = PALETTE.ink;
    c.lineWidth = 6;
    c.beginPath();
    c.arc(w / 2, h / 2 + 6, 16, 0.15 * Math.PI, 0.85 * Math.PI);
    c.stroke();
  });
  void swapModel(ctx, star, 'employee_of_month', { fit: { h: 1.12, uniform: true }, paint: { Label: new THREE.MeshStandardMaterial({ map: portrait.tex, roughness: 0.6 }) } });
  hangPicture(ctx, {
    side: 'east',
    u: -2.0,
    y: 1.62,
    w: 1.0,
    h: 0.8,
    px: [500, 400],
    draw: (c, w, h) => {
      c.fillStyle = '#FFFDF7';
      c.fillRect(0, 0, w, h);
      c.fillStyle = PALETTE.ink;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = font(700, 40);
      c.fillText('ORG CHART', w / 2, 44);
      c.strokeStyle = PALETTE.ink;
      c.lineWidth = 6;
      c.beginPath();
      c.moveTo(w / 2, 150);
      c.lineTo(w / 2, 200);
      c.moveTo(80, 200);
      c.lineTo(w - 80, 200);
      for (const x of [80, w / 2, w - 80]) {
        c.moveTo(x, 200);
        c.lineTo(x, 240);
      }
      c.stroke();
      c.fillStyle = '#E63946';
      c.beginPath();
      c.roundRect(w / 2 - 80, 84, 160, 66, 18);
      c.fill();
      c.fillStyle = '#FFFDF7';
      c.font = font(700, 34);
      c.fillText('YOU', w / 2, 118);
      [80, w / 2, w - 80].forEach((x, i) => {
        c.fillStyle = ['#FFC94A', '#5CC8FF', '#6EDC9A'][i];
        c.beginPath();
        c.roundRect(x - 62, 240, 124, 60, 16);
        c.fill();
        sparkle(c, x, 270, 20, PALETTE.claude, i);
      });
      c.fillStyle = '#6B7280';
      c.font = font(600, 28);
      c.fillText('(it is Claudes all the way down)', w / 2, 350);
    },
  });
}

export interface Decor {
  objects: THREE.Object3D[];
  colliders: AABB[];
  dispose(): void;
}

/** Floor tape, moving boxes and a sign on an empty pod slot. Removed when a pod moves in. */
export function buildReservedSpot(ctx: WorldCtx, slot: PodSlot, seed: number): Decor {
  const b = new Batch();
  const r = rng(seed);
  const { x, z } = slot;
  const tape = '#FFC93C';
  const hw = 1.95;
  const hd = 2.25;
  for (let t = -hw + 0.2; t <= hw - 0.2 + 1e-6; t += 0.45) {
    for (const s of [-1, 1]) b.box(0.28, 0.012, 0.08, tape, { at: [x + t, 0.007, z + s * hd], r: 0.005, seg: 1, cast: false, finish: 'matte' });
  }
  for (let t = -hd + 0.2; t <= hd - 0.2 + 1e-6; t += 0.45) {
    for (const s of [-1, 1]) b.box(0.08, 0.012, 0.28, tape, { at: [x + s * hw, 0.007, z + t], r: 0.005, seg: 1, cast: false, finish: 'matte' });
  }
  // Moving boxes: new desks are on the way.
  const card = '#D9A066';
  const boxes: [number, number, number, number, number, number, number][] = [
    [-0.55, 0, 0.1, 0.66, 0.5, 0.52, 0.15],
    [-0.5, 0.5, 0.12, 0.52, 0.4, 0.44, -0.2],
    [0.2, 0, -0.42, 0.58, 0.42, 0.5, 0.45],
  ];
  // The moving boxes and the plant are their own groups: catalog models replace them.
  const crates = staticProp(ctx, 'moving-boxes', (cb) => {
    for (const [bx, by, bz, w, h, d, yaw] of boxes) {
      const shadeAmt = (r() - 0.5) * 0.06;
      cb.box(w, h, d, shade(card, shadeAmt), { at: [bx, by + h / 2, bz], rot: [0, yaw, 0], r: 0.03, finish: 'matte' });
      cb.box(w + 0.004, 0.012, 0.12, '#F3D19C', { at: [bx, by + h + 0.002, bz], rot: [0, yaw, 0], r: 0.005, cast: false, finish: 'matte' });
    }
  }, { at: [x, z] });
  // The catalog box is open on top, so the second one sits beside the first rather than on it.
  void swapModel(ctx, crates, 'cardboard_box', { copies: [{ at: [-0.55, 0, 0.1], yaw: 0.15 }, { at: [-0.62, 0, 0.72], yaw: -0.5 }, { at: [0.2, 0, -0.42], yaw: 0.45 }] });
  const pr = rng(seed + 1);
  const plant = tallProp(ctx, 'reserved-plant', (pb) => pottedPlant(pb, 0, 0, 0.85, pr), { at: [x + 1.05, z + 0.8] });
  void swapModel(ctx, plant, 'plant_pot', { fit: { h: 1.1, uniform: true } });

  // Sandwich-board sign facing the boulevard side of the room.
  const signTex = new CanvasTex(320, 400, (c, w, h) => {
    c.fillStyle = PALETTE.paper;
    c.beginPath();
    c.roundRect(0, 0, w, h, 26);
    c.fill();
    c.fillStyle = PALETTE.claude;
    c.beginPath();
    c.roundRect(0, 0, w, 110, [26, 26, 0, 0]);
    c.fill();
    c.fillStyle = '#FFFDF7';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitText(c, 'RESERVED', 700, 64, w - 40);
    c.fillText('RESERVED', w / 2, 58);
    c.fillStyle = PALETTE.ink;
    fitText(c, 'for new hires', 700, 44, w - 40);
    c.fillText('for new hires', w / 2, 170);
    c.font = font(600, 30);
    c.fillStyle = '#6B7280';
    c.fillText('desks arriving', w / 2, 232);
    c.fillText('as you grow!', w / 2, 270);
    sparkle(c, w / 2, 340, 34, PALETTE.claude, 0.3);
  });
  const sx = x + 0.15;
  const sz = z + 1.25;
  const yaw = x < 0 ? 0.35 : -0.35;
  const frame = new THREE.Matrix4().compose(new THREE.Vector3(sx, 0, sz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(1, 1, 1));
  for (const s of [1, -1]) b.box(0.56, 0.74, 0.03, '#FFFDF7', { at: [0, 0.37, s * 0.1], rot: [-s * 0.27, 0, 0], r: 0.015, parent: frame });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.625), new THREE.MeshStandardMaterial({ map: signTex.tex, roughness: 0.7 }));
  face.position.set(0, 0.37, 0.118);
  face.rotation.x = -0.27;
  const faceGroup = new THREE.Group();
  faceGroup.position.set(sx, 0, sz);
  faceGroup.rotation.y = yaw;
  faceGroup.add(face);

  const group = b.build({ name: 'reserved-spot' });
  ctx.root.add(group, faceGroup);
  const colliders = [footprint(x - 0.2, z - 0.1, 1.6, 1.3), footprint(x + 1.05, z + 0.8, 0.55, 0.55), footprint(sx, sz, 0.66, 0.45)];
  ctx.colliders.push(...colliders);
  return {
    objects: [group, faceGroup, crates, plant],
    colliders,
    dispose() {
      group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      for (const g of [crates, plant]) {
        // A model still loading for this spot is dropped when it arrives (see swapModel).
        g.userData.disposed = true;
        if (g.userData.fade) ctx.fader.remove(g.userData.fade);
        delete g.userData.fade;
        for (const child of [...g.children]) {
          if (child.userData.modelId) disposeModel(child);
          else disposeGroup(child);
        }
      }
      face.geometry.dispose();
      (face.material as THREE.MeshStandardMaterial).dispose();
      signTex.dispose();
    },
  };
}
