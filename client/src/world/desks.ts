// Desk pods: four desks (2 × 2, facing across a low divider) on a carpet, each with a chunky
// monitor, keyboard, mug, a bit of clutter, a tent-card nameplate and a wheeled office chair.
import * as THREE from 'three';
import { PALETTE } from '../style/palette';
import type { DeskSlot, ScreenState } from './types';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Batch, CanvasTex, ellipsize, fitText, font, partMatrix, pickR, rng, shade } from './kit';
import { DESK, type PodSlot } from './layout';
import { Screen, type ScreenView } from './screens';
import { aabb, type WorldCtx } from './ctx';
import type { Decor } from './decor';

const TRIM = '#FFFDF8';
const LEG = '#F1ECE4';
const MUGS = ['#FF7A6B', '#5CC8FF', '#FFC94A', '#6EDC9A', '#B48CFF', '#FFFFFF', '#FF9DCB'];

interface DeskRuntime {
  slot: DeskSlot;
  screen: Screen;
}

export class DeskSystem {
  private readonly runtimes: DeskRuntime[] = [];
  private readonly reserved = new Map<PodSlot, Decor>();
  private pods = 0;

  constructor(
    private readonly ctx: WorldCtx,
    private readonly desks: DeskSlot[],
  ) {}

  get podCount(): number {
    return this.pods;
  }

  /** Decor that occupies an empty slot until a pod moves in. */
  reserve(slot: PodSlot, decor: Decor): void {
    this.reserved.set(slot, decor);
  }

  /** Build one pod of four desks centred on `slot` (clearing any placeholder decor there). */
  addPod(slot: PodSlot): void {
    const { ctx } = this;
    const decor = this.reserved.get(slot);
    if (decor) {
      for (const o of decor.objects) ctx.root.remove(o);
      for (const c of decor.colliders) {
        const i = ctx.colliders.indexOf(c);
        if (i >= 0) ctx.colliders.splice(i, 1);
      }
      decor.dispose();
      this.reserved.delete(slot);
    }
    const podIndex = this.pods++;
    const px = slot.x;
    const pz = slot.z;
    const b = new Batch();
    const r = rng(podIndex * 7919 + 13);

    // Carpet with a darker border and a stitched inner line (a wooden deck for garden desks).
    if (slot.outdoor) {
      // Deck top sits ~1 cm above the lawn so chairs and feet stay on it.
      b.slab(4.2, 4.8, 0.05, 0.35, PALETTE.wood, { at: [px, -0.015, pz], cast: false, finish: 'matte' });
      for (let k = -5; k <= 5; k++) b.box(3.9, 0.006, 0.03, shade(PALETTE.wood, -0.08), { at: [px, 0.011, pz + k * 0.42], r: 0.003, seg: 1, cast: false, finish: 'matte' });
    } else {
      const carpet = podIndex % 2 === 0 ? PALETTE.carpet : PALETTE.carpetAlt;
      b.slab(4.2, 4.8, 0.022, 0.55, shade(carpet, -0.07), { at: [px, 0.011, pz], cast: false, finish: 'matte' });
      b.slab(3.86, 4.46, 0.026, 0.4, shade(carpet, 0.05), { at: [px, 0.013, pz], cast: false, finish: 'matte' });
      b.slab(3.74, 4.34, 0.028, 0.34, carpet, { at: [px, 0.014, pz], cast: false, finish: 'matte' });
    }

    // Low divider between the two rows, with a rounded rail on top.
    const divider = pickR(r, ['#BFE6D8', '#CFE0FF', '#FFE2B8', '#F6D0E4']);
    b.box(2.96, 0.36, 0.06, divider, { at: [px, DESK.top + 0.18, pz], r: 0.03, finish: 'matte' });
    b.box(3.02, 0.05, 0.09, TRIM, { at: [px, DESK.top + 0.37, pz], r: 0.025 });

    for (let k = 0; k < 4; k++) this.addDesk(b, px, pz, k, slot.outdoor === true);

    const group = b.build({ name: `pod-${podIndex}` });
    ctx.root.add(group);
    ctx.colliders.push(aabb(px - 1.47, px + 1.47, pz - 0.73, pz + 0.73));
    ctx.blobs.add(px, pz, 3.6, 2.0);
  }

  update(dt: number, elapsed: number, view?: ScreenView): void {
    for (const d of this.runtimes) d.screen.update(dt, elapsed, view);
  }

  private addDesk(b: Batch, px: number, pz: number, k: number, outdoor: boolean): void {
    const index = this.desks.length;
    const r = rng(index * 104729 + 7);
    const accent = PALETTE.deskAccents[index % PALETTE.deskAccents.length];
    const row = k < 2 ? 0 : 1;
    const col = k % 2;
    const sz = row === 0 ? 1 : -1; // the sitter faces +Z (row 0, north side) or -Z (row 1)
    const front = -sz; // from the desk centre toward the sitter
    const ox = col === 0 ? -1 : 1; // outward, toward the pod's side aisle
    const X = px + (col === 0 ? -DESK.pitch / 2 : DESK.pitch / 2);
    const Zc = pz + (row === 0 ? -DESK.depth / 2 - 0.025 : DESK.depth / 2 + 0.025);
    const Zfront = Zc + front * (DESK.depth / 2);
    const Zseat = Zfront + front * DESK.seatGap;
    const rightX = -sz; // the sitter's right hand, along X
    const topY = DESK.top;

    // Desk: chunky white top with a coloured lip, rounded slab legs, accent modesty panel.
    b.box(DESK.width, 0.08, DESK.depth, PALETTE.deskTop, { at: [X, topY - 0.04, Zc], r: 0.038 });
    b.box(DESK.width - 0.04, 0.05, 0.04, accent, { at: [X, topY - 0.05, Zfront + front * 0.008], r: 0.02 });
    for (const s of [-1, 1]) b.box(0.07, topY - 0.08, DESK.depth - 0.12, LEG, { at: [X + s * (DESK.width / 2 - 0.08), (topY - 0.08) / 2, Zc], r: 0.03 });
    b.box(DESK.width - 0.24, 0.36, 0.035, accent, { at: [X, 0.4, Zc - front * (DESK.depth / 2 - 0.08)], r: 0.017, finish: 'matte' });

    // Monitor: chunky bezel, accent back cover, neck and foot.
    const Zm = Zc - front * 0.13;
    const bezel = PALETTE.monitorBezel;
    b.puck(0.12, 0.022, bezel, { at: [X, topY + 0.011, Zm - front * 0.02], finish: 'gloss' });
    b.box(0.06, 0.2, 0.04, bezel, { at: [X, topY + 0.11, Zm - front * 0.045], r: 0.02, finish: 'gloss' });
    b.box(0.7, 0.48, 0.08, bezel, { at: [X, 1.0, Zm], r: 0.05, finish: 'gloss' });
    b.box(0.48, 0.32, 0.06, accent, { at: [X, 1.0, Zm - front * 0.05], r: 0.03 });
    // A sticky note on the bezel.
    if (r() < 0.6) b.box(0.07, 0.07, 0.012, pickR(r, ['#FFE66D', '#9CF6C8', '#FFB3D1']), { at: [X + rightX * 0.31, 1.19, Zm + front * 0.045], rot: [0, 0, (r() - 0.5) * 0.4], r: 0.004, cast: false });

    const screen = new Screen(index, accent);
    const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.38), screen.material);
    screenMesh.name = `screen-${index}`;
    screenMesh.position.set(X, 1.0, Zm + front * 0.0415);
    screenMesh.rotation.y = front > 0 ? 0 : Math.PI;
    this.ctx.root.add(screenMesh);
    screen.attach(screenMesh);

    // Keyboard and mouse.
    const Zkb = Zfront - front * 0.2;
    b.box(0.42, 0.024, 0.14, '#F7F4EE', { at: [X, topY + 0.012, Zkb], r: 0.011 });
    b.box(0.38, 0.01, 0.1, '#D9E0EA', { at: [X, topY + 0.026, Zkb], r: 0.004, cast: false });
    b.ball([0.034, 0.022, 0.05], '#F7F4EE', { at: [X + rightX * 0.31, topY + 0.012, Zkb] });

    // Mug on one side, clutter on the other.
    const mugSide = r() < 0.5 ? 1 : -1;
    const mugX = X + rightX * mugSide * 0.5;
    const mugZ = Zfront - front * 0.22;
    const mug = pickR(r, MUGS);
    b.cyl(0.042, 0.038, 0.1, mug, { at: [mugX, topY + 0.05, mugZ], seg: 20 });
    b.cyl(0.034, 0.034, 0.005, PALETTE.coffee, { at: [mugX, topY + 0.098, mugZ], seg: 16, cast: false });
    b.torus(0.028, 0.009, mug, { at: [mugX + 0.045 * mugSide * rightX, topY + 0.05, mugZ], rot: [0, 0, 0] });
    this.clutter(b, r, X - rightX * mugSide * 0.48, Zc - front * 0.02, topY, mugSide, front);

    // Tent-card nameplate at the outer front corner, readable from both sides. The card body
    // goes into the pod batch; both printed faces share one mesh.
    const plate = new Nameplate(index, accent);
    const tent = new THREE.Object3D();
    tent.position.set(X + ox * 0.5, topY, Zfront - front * 0.14);
    tent.rotation.y = (front > 0 ? 0 : Math.PI) + ox * front * 0.25;
    tent.updateMatrix();
    const faces: THREE.BufferGeometry[] = [];
    for (const s of [1, -1]) {
      b.box(0.41, 0.155, 0.012, TRIM, { at: [0, 0.075, s * 0.022], rot: [-s * 0.36, 0, 0], r: 0.005, cast: false, parent: tent.matrix });
      const face = new THREE.PlaneGeometry(0.38, 0.13);
      face.applyMatrix4(partMatrix({ at: [0, 0.075, s * 0.0295], rot: [-s * 0.36, s > 0 ? 0 : Math.PI, 0] }));
      faces.push(face);
    }
    const plateMesh = new THREE.Mesh(mergeGeometries(faces, false)!, plate.material);
    plateMesh.name = `nameplate-${index}`;
    plateMesh.position.copy(tent.position);
    plateMesh.rotation.copy(tent.rotation);
    plateMesh.receiveShadow = true;
    this.ctx.root.add(plateMesh);

    // Chair (its own object: gameplay slides it along local +Z).
    const chair = buildChair(pickR(r, PALETTE.chairs));
    chair.position.set(X, 0, Zseat);
    const yaw = sz > 0 ? 0 : Math.PI;
    chair.rotation.y = yaw + Math.PI;
    chair.name = `chair-${index}`;
    this.ctx.root.add(chair);

    const seat = new THREE.Vector3(X, DESK.seatH, Zseat);
    const approach = new THREE.Vector3(X + ox * 0.75, 0, Zseat + front * 0.55);
    const internSpots = [
      new THREE.Vector3(X + ox * 0.72, 0, Zseat + front * 0.02),
      new THREE.Vector3(X + ox * 1.12, 0, Zseat - front * 0.45),
      new THREE.Vector3(X, 0, Zseat + front * 0.95),
      new THREE.Vector3(X - ox * 0.5, 0, Zseat + front * 0.9),
    ];

    const slot: DeskSlot = {
      index,
      seat,
      yaw,
      approach,
      internSpots,
      chair,
      screen: screenMesh,
      accent,
      setScreen(state: ScreenState, lines?: string[]) {
        screen.set(state, lines);
      },
      setNameplate(name: string, subtitle?: string) {
        plate.set(name, subtitle);
      },
    };
    this.desks.push(slot);
    this.runtimes.push({ slot, screen });
    this.ctx.interactables.push({
      id: `desk:${index}`,
      kind: 'desk',
      position: new THREE.Vector3(X, 1.45, Zseat),
      radius: 1.6,
      label: outdoor ? 'Garden desk' : 'Empty desk',
      deskIndex: index,
    });
  }

  private clutter(b: Batch, r: () => number, x: number, z: number, topY: number, side: number, front: number): void {
    const kind = Math.floor(r() * 5);
    switch (kind) {
      case 0: {
        // Potted succulent.
        b.cyl(0.07, 0.055, 0.1, PALETTE.plantPot, { at: [x, topY + 0.05, z] });
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + r();
          b.ball([0.045, 0.07, 0.045], i % 2 ? PALETTE.plantLeaf : shade(PALETTE.plantLeaf, 0.08), {
            at: [x + Math.cos(a) * 0.035, topY + 0.15, z + Math.sin(a) * 0.035],
            rot: [Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5],
          });
        }
        break;
      }
      case 1: {
        // Rubber duck, of course.
        const yaw = front > 0 ? 0 : Math.PI;
        b.ball([0.06, 0.05, 0.075], '#FFD93D', { at: [x, topY + 0.045, z] });
        b.ball(0.04, '#FFD93D', { at: [x, topY + 0.11, z + front * 0.03] });
        b.ball([0.022, 0.01, 0.025], '#FF9F45', { at: [x, topY + 0.105, z + front * 0.07], rot: [0, yaw, 0] });
        for (const s of [-1, 1]) b.ball(0.007, '#1E1B2E', { at: [x + s * 0.02, topY + 0.122, z + front * 0.062], cast: false });
        break;
      }
      case 2: {
        // Stack of papers.
        for (let i = 0; i < 4; i++) b.box(0.22, 0.012, 0.28, i % 2 ? '#FFFFFF' : '#F4F1EA', { at: [x + (r() - 0.5) * 0.03, topY + 0.008 + i * 0.013, z], rot: [0, (r() - 0.5) * 0.3, 0], r: 0.004, cast: i === 3 });
        break;
      }
      case 3: {
        // Pencil cup.
        b.cyl(0.045, 0.045, 0.1, pickR(r, ['#5CC8FF', '#FF7A6B', '#B48CFF']), { at: [x, topY + 0.05, z] });
        for (let i = 0; i < 3; i++) b.cyl(0.008, 0.008, 0.14, pickR(r, ['#FFC94A', '#FF5A5F', '#3D7CFF']), { at: [x + (i - 1) * 0.018, topY + 0.12, z], rot: [(r() - 0.5) * 0.4, 0, (i - 1) * 0.25], cast: false });
        break;
      }
      default: {
        // Two books.
        b.box(0.2, 0.04, 0.27, pickR(r, ['#3D7CFF', '#FF5A5F', '#2EC4B6']), { at: [x, topY + 0.02, z], r: 0.01 });
        b.box(0.18, 0.035, 0.25, pickR(r, ['#FFC93C', '#9B5DE5', '#FF9DCB']), { at: [x, topY + 0.058, z], rot: [0, side * 0.2, 0], r: 0.01 });
      }
    }
  }
}

/** The desk's tent card. */
class Nameplate {
  readonly material: THREE.MeshStandardMaterial;
  private readonly tex: CanvasTex;
  private name = '';
  private subtitle = '';

  constructor(
    private readonly index: number,
    private readonly accent: string,
  ) {
    this.tex = new CanvasTex(256, 88, (c, w, h) => this.draw(c, w, h));
    this.material = new THREE.MeshStandardMaterial({ map: this.tex.tex, roughness: 0.6, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1 });
  }

  set(name: string, subtitle = ''): void {
    if (name === this.name && subtitle === this.subtitle) return;
    this.name = name;
    this.subtitle = subtitle;
    this.tex.redraw();
  }

  private draw(c: CanvasRenderingContext2D, w: number, h: number): void {
    c.fillStyle = PALETTE.paper;
    c.fillRect(0, 0, w, h);
    if (!this.name) {
      c.strokeStyle = '#C9CED8';
      c.setLineDash([10, 7]);
      c.lineWidth = 4;
      c.beginPath();
      c.roundRect(8, 8, w - 16, h - 16, 14);
      c.stroke();
      c.setLineDash([]);
      c.fillStyle = '#A3AAB8';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = font(700, 32);
      c.fillText('VACANT', w / 2, h / 2 - 6);
      c.font = font(500, 15);
      c.fillText(`desk ${this.index + 1}`, w / 2, h / 2 + 22);
      return;
    }
    c.fillStyle = this.accent;
    c.beginPath();
    c.roundRect(0, 0, 18, h, [0, 9, 9, 0]);
    c.fill();
    c.fillStyle = PALETTE.ink;
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    const hasSub = this.subtitle.length > 0;
    fitText(c, this.name, 700, 38, w - 40, 14);
    c.fillText(this.name, 30, hasSub ? h / 2 - 12 : h / 2 + 1);
    if (hasSub) {
      c.fillStyle = '#6B7280';
      c.font = font(500, 18);
      c.fillText(ellipsize(c, this.subtitle, w - 40), 30, h / 2 + 22);
    }
  }
}

function buildChair(color: string): THREE.Group {
  const b = new Batch();
  const base = PALETTE.chairBase;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.box(0.06, 0.045, 0.3, base, { at: [Math.sin(a) * 0.15, 0.075, Math.cos(a) * 0.15], rot: [0, a, 0], r: 0.02 });
    b.ball(0.042, '#2B2F3A', { at: [Math.sin(a) * 0.29, 0.042, Math.cos(a) * 0.29], ws: 12, hs: 8 });
  }
  b.cyl(0.03, 0.03, 0.3, PALETTE.metal, { at: [0, 0.24, 0], seg: 12, finish: 'gloss' });
  b.box(0.54, 0.11, 0.52, color, { at: [0, DESK.seatH - 0.055, 0], r: 0.055 });
  b.box(0.08, 0.28, 0.05, base, { at: [0, 0.56, 0.25], r: 0.02 });
  b.box(0.5, 0.46, 0.11, color, { at: [0, 0.83, 0.27], rot: [0.1, 0, 0], r: 0.055 });
  return b.build({ name: 'chair' });
}
