// Desk pods: four desks (2 × 2, facing across a low divider) on a carpet, each with a monitor,
// keyboard, mouse, mug, a bit of clutter, a tent-card nameplate and a wheeled office chair.
// Everything is built procedurally first. The catalog models (desk, desk_divider, monitor,
// keyboard, computer_mouse, mug, nameplate, desk clutter, office_chair) then replace it, drawn
// instanced across every pod with per-desk colours as instance colours; screens and nameplates
// stay per-desk canvases laid onto the models' own surfaces.
import * as THREE from 'three';
import { PALETTE } from '../style/palette';
import type { DeskSlot, OfficeApp, ScreenState } from './types';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Batch, CanvasTex, ellipsize, fitText, font, partMatrix, pickR, rng, shade } from './kit';
import { DESK, type PodSlot } from './layout';
import D from './dimensions.json';
import { Screen, type ScreenView } from './screens';
import { aabb, type WorldCtx } from './ctx';
import type { Decor } from './decor';
import { catalogItem } from '../models';
import { disposeGroup, disposeInstanced, instancedModel, placement, type Fit, type InstancedModel } from './modelkit';

const TRIM = '#FFFDF8';
const LEG = '#F1ECE4';
const MUGS = ['#FF7A6B', '#5CC8FF', '#FFC94A', '#6EDC9A', '#B48CFF', '#FFFFFF', '#FF9DCB'];
const DIVIDERS = ['#BFE6D8', '#CFE0FF', '#FFE2B8', '#F6D0E4'];
const TOP = D.deskTop;

/** Desk clutter from the catalog, by kind. The procedural fallback draws kind % 5. */
const CLUTTER: { id: string; fit?: Fit; tint?: readonly string[] }[] = [
  { id: 'succulent', fit: { h: 0.15, uniform: true }, tint: ['#FF9A7A', '#5CC8FF', '#FFC94A'] },
  { id: 'rubber_duck', fit: { h: 0.11, uniform: true } },
  { id: 'paper_stack' },
  { id: 'pen_cup', tint: ['#5CC8FF', '#FF7A6B', '#B48CFF'] },
  { id: 'books_stack' },
  { id: 'cactus', fit: { h: 0.2, uniform: true }, tint: ['#FF9DCB', '#FFC94A'] },
  { id: 'photo_frame', tint: ['#FF7A6B', '#2EC4B6', '#FFC94A'] },
  { id: 'lava_lamp', tint: ['#B48CFF', '#FF7A6B'] },
  { id: 'desk_fan', tint: ['#5CC8FF', '#6EDC9A'] },
  { id: 'headphones_stand', tint: ['#FF5A5F', '#3D7CFF'] },
];

/** The chair model sits inside the wrapper turned around, like the procedural chair. */
const CHAIR_TURN = new THREE.Matrix4().makeRotationY(Math.PI);

interface DeskRuntime {
  slot: DeskSlot;
  screen: Screen;
  /** Desk frame: pivot under the desk centre, local +Z toward the sitter. */
  frame: THREE.Matrix4;
  /** The desk's outer side (toward the pod's aisle) in the desk frame. */
  ox: number;
  mugSide: number;
  mug: string;
  clutter: number;
  clutterTint: string;
  chairColor: string;
  /** Procedural chair inside slot.chair, until the chair model replaces it. */
  chairBody: THREE.Object3D | null;
  plate: Nameplate;
  plateFaces: THREE.Mesh[];
  /** Chair transform last copied into the instanced chairs. */
  chairSeen: THREE.Matrix4;
}

interface PodRuntime {
  x: number;
  z: number;
  divider: string;
  /** Procedural desks, divider and desk items, until the models replace them. */
  fallback: THREE.Group | null;
}

export class DeskSystem {
  private readonly runtimes: DeskRuntime[] = [];
  private readonly pods: PodRuntime[] = [];
  private readonly reserved = new Map<PodSlot, Decor>();
  /** Instanced furniture and desk items currently shown. */
  private models: THREE.Group[] = [];
  private chairs: InstancedModel | null = null;
  /** Bumped per rebuild, so a model load for an older pod count is dropped. */
  private itemsGen = 0;
  private chairsGen = 0;
  private swapQueued = false;

  constructor(
    private readonly ctx: WorldCtx,
    private readonly desks: DeskSlot[],
  ) {}

  get podCount(): number {
    return this.pods.length;
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
    const podIndex = this.pods.length;
    const px = slot.x;
    const pz = slot.z;
    const r = rng(podIndex * 7919 + 13);

    // Carpet (a wooden deck for garden desks) stays procedural; the rest is a fallback.
    const base = new Batch();
    base.place(px, 0, pz, 0, () => {
      if (slot.outdoor) buildPodDeck(base);
      else buildPodCarpet(base, podIndex % 2 === 0 ? PALETTE.carpet : PALETTE.carpetAlt);
    });
    ctx.root.add(base.build({ name: `pod-${podIndex}-floor` }));

    const b = new Batch();
    const divider = pickR(r, DIVIDERS);
    b.place(px, 0, pz, 0, () => buildPodDivider(b, divider));
    for (let k = 0; k < 4; k++) this.addDesk(b, px, pz, k, slot.outdoor === true);
    const fallback = b.build({ name: `pod-${podIndex}` });
    ctx.root.add(fallback);
    this.pods.push({ x: px, z: pz, divider, fallback });

    ctx.colliders.push(aabb(px - 1.47, px + 1.47, pz - 0.73, pz + 0.73));
    ctx.blobs.add(px, pz, 3.6, 2.0);
    this.queueSwap();
  }

  update(dt: number, elapsed: number, view?: ScreenView): void {
    for (const d of this.runtimes) d.screen.update(dt, elapsed, view);
    // Gameplay slides the chair wrappers; the instanced chairs follow them.
    const chairs = this.chairs;
    if (!chairs) return;
    this.runtimes.forEach((d, i) => {
      const c = d.slot.chair;
      c.updateMatrix();
      if (c.matrix.equals(d.chairSeen)) return;
      d.chairSeen.copy(c.matrix);
      chairs.setPlacement(i, _m.multiplyMatrices(c.matrix, CHAIR_TURN));
    });
  }

  private queueSwap(): void {
    if (this.swapQueued) return;
    this.swapQueued = true;
    queueMicrotask(() => {
      this.swapQueued = false;
      void this.swapItems();
      void this.swapChairs();
    });
  }

  /** Desk-frame placement of a desk-top item. */
  private on(d: DeskRuntime, x: number, z: number, yaw = 0): THREE.Matrix4 {
    return d.frame.clone().multiply(placement(x, D.desk.h, z, yaw));
  }

  private nameplateAt(d: DeskRuntime): THREE.Matrix4 {
    return this.on(d, d.ox * TOP.nameplate[0], TOP.nameplate[1], d.ox * TOP.nameplateTurn);
  }

  /** Replace every pod's procedural desks, dividers and desk items with instanced models. */
  private async swapItems(): Promise<void> {
    const gen = ++this.itemsGen;
    const desks = [...this.runtimes];
    const pods = [...this.pods];
    const accents = desks.map((d) => d.slot.accent);
    const [desk, divider, monitor, keyboard, mouse, mug, plate, ...clutter] = await Promise.all([
      instancedModel('desk', desks.map((d) => d.frame), { fit: { w: D.desk.w, h: D.desk.h, d: D.desk.d }, colors: { Accent: accents } }),
      instancedModel(
        'desk_divider',
        pods.flatMap((p) => [placement(p.x - DESK.pitch / 2, D.desk.h, p.z, 0), placement(p.x + DESK.pitch / 2, D.desk.h, p.z, 0)]),
        { fit: { w: D.desk.w }, colors: { Accent: pods.flatMap((p) => [p.divider, p.divider]) } },
      ),
      instancedModel('monitor', desks.map((d) => this.on(d, 0, TOP.monitorZ)), { hide: ['Screen'] }),
      instancedModel('keyboard', desks.map((d) => this.on(d, TOP.keyboard[0], TOP.keyboard[1]))),
      instancedModel('computer_mouse', desks.map((d) => this.on(d, TOP.mouse[0], TOP.mouse[1])), { colors: { Accent: accents } }),
      instancedModel('mug', desks.map((d) => this.on(d, d.mugSide * TOP.mug[0], TOP.mug[1], d.mugSide > 0 ? 0.5 : Math.PI - 0.5)), { colors: { Accent: desks.map((d) => d.mug) } }),
      instancedModel('nameplate', desks.map((d) => this.nameplateAt(d)), { fit: { w: TOP.nameplateW, uniform: true }, hide: ['Label'], colors: { Accent: accents } }),
      ...CLUTTER.map((c, k) => {
        const on = desks.filter((d) => d.clutter === k);
        const colors = c.tint ? { Accent: on.map((d) => d.clutterTint) } : undefined;
        return instancedModel(c.id, on.map((d) => this.on(d, -d.mugSide * TOP.clutter[0], TOP.clutter[1], (d.mugSide * 0.4) + d.ox * 0.2)), { fit: c.fit, colors });
      }),
    ]);
    const core = [desk, divider, monitor, keyboard, mouse, mug, plate];
    const loaded = [...core, ...clutter].filter((m): m is InstancedModel => m !== null);
    // Clutter counts too: the procedural fallback that goes holds every desk's clutter.
    const missing = core.some((m) => !m) || clutter.some((m, k) => !m && desks.some((d) => d.clutter === k));
    if (gen !== this.itemsGen || missing) {
      for (const m of loaded) disposeInstanced(m.group);
      if (gen === this.itemsGen) warnOnce('desk models missing: keeping the procedural desks');
      return;
    }
    for (const g of this.models) disposeInstanced(g);
    this.models = loaded.map((m) => m.group);
    for (const g of this.models) this.ctx.root.add(g);
    for (const p of pods) {
      if (p.fallback) disposeGroup(p.fallback);
      p.fallback = null;
    }

    // Screens onto the monitor model's own screen (the canvas plane is sized to it).
    const box = monitor!.boxOf('Screen');
    if (box) {
      const size = box.getSize(new THREE.Vector3());
      const centre = box.getCenter(new THREE.Vector3());
      const onScreen = new THREE.Matrix4().makeTranslation(centre.x, centre.y, box.max.z + 0.002).multiply(new THREE.Matrix4().makeScale(size.x / D.monitor.screenW, size.y / D.monitor.screenH, 1));
      for (const d of desks) this.on(d, 0, TOP.monitorZ).multiply(onScreen).decompose(d.slot.screen.position, d.slot.screen.quaternion, d.slot.screen.scale);
    }
    // Nameplates: the model's own printed faces, front and back, each desk with its canvas.
    const labels = plate!.partsOf('Label');
    for (const d of desks) {
      for (const f of d.plateFaces) {
        f.removeFromParent();
        if (!f.userData.modelGeometry) f.geometry.dispose();
      }
      d.plateFaces = labels.map((part) => {
        const face = new THREE.Mesh(part.geometry, d.plate.material);
        face.userData.modelGeometry = true;
        face.name = `nameplate-${d.slot.index}`;
        face.receiveShadow = true;
        this.nameplateAt(d).multiply(part.matrix).decompose(face.position, face.quaternion, face.scale);
        this.ctx.root.add(face);
        return face;
      });
      d.plate.useModelFaces();
    }
  }

  /** Replace the procedural chairs with one instanced office_chair per desk (seat at DESK.seatH). */
  private async swapChairs(): Promise<void> {
    const gen = ++this.chairsGen;
    const desks = [...this.runtimes];
    const seatY = (await catalogItem('office_chair'))?.anchors.seat?.[1];
    const placements = desks.map((d) => {
      d.slot.chair.updateMatrix();
      d.chairSeen.copy(d.slot.chair.matrix);
      return d.slot.chair.matrix.clone().multiply(CHAIR_TURN);
    });
    const chairs = await instancedModel('office_chair', placements, {
      scale: seatY ? DESK.seatH / seatY : 1,
      colors: { Seat: desks.map((d) => d.chairColor) },
      pad: D.chair.slide + 0.3,
    });
    if (!chairs) return;
    if (gen !== this.chairsGen) {
      disposeInstanced(chairs.group);
      return;
    }
    if (this.chairs) disposeInstanced(this.chairs.group);
    this.chairs = chairs;
    this.ctx.root.add(chairs.group);
    for (const d of desks) {
      if (d.chairBody) disposeGroup(d.chairBody);
      d.chairBody = null;
    }
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
    const Zseat = Zc + front * (DESK.depth / 2 + DESK.seatGap);
    // Desk frame: local +Z points toward the sitter; x mirrors with it.
    const deskYaw = front > 0 ? 0 : Math.PI;
    const oxLocal = ox * front;
    const frame = new THREE.Matrix4().makeRotationY(deskYaw).setPosition(X, 0, Zc);

    const mugSide = r() < 0.5 ? 1 : -1;
    const sticky = r() < 0.6 ? pickR(r, ['#FFE66D', '#9CF6C8', '#FFB3D1']) : null;
    const mug = pickR(r, MUGS);
    const pick = rng(index * 7907 + 3);
    const clutter = Math.floor(pick() * CLUTTER.length);
    const clutterTint = pickR(pick, CLUTTER[clutter].tint ?? ['#FFFFFF']);
    b.place(X, 0, Zc, deskYaw, () => {
      buildDesk(b, accent);
      b.place(0, D.desk.h, -D.monitor.setBack, 0, () => buildMonitor(b, accent, sticky, (r() - 0.5) * 0.4));
      b.place(0, D.desk.h, D.desk.d / 2 - 0.2, 0, () => buildKeyboard(b));
      b.place(0.31, D.desk.h, D.desk.d / 2 - 0.2, 0, () => buildMouse(b));
      b.place(mugSide * 0.5, D.desk.h, D.desk.d / 2 - 0.22, 0, () => buildMug(b, mug, mugSide));
      b.place(-mugSide * 0.48, D.desk.h, -0.02, 0, () => buildDeskClutter(b, r, mugSide, clutter % 5));
      b.place(oxLocal * 0.5, D.desk.h, D.desk.d / 2 - 0.14, oxLocal * 0.25, () => buildNameplateCard(b));
    });

    const screen = new Screen(index, accent);
    const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(D.monitor.screenW, D.monitor.screenH), screen.material);
    screenMesh.name = `screen-${index}`;
    frame
      .clone()
      .multiply(new THREE.Matrix4().makeTranslation(0, D.monitor.centerY, -D.monitor.setBack + D.monitor.d / 2 + 0.0015))
      .decompose(screenMesh.position, screenMesh.quaternion, screenMesh.scale);
    this.ctx.root.add(screenMesh);
    screen.attach(screenMesh);

    // Both printed faces of the tent card share one mesh, placed like the card body above.
    const plate = new Nameplate(index, accent);
    const faces: THREE.BufferGeometry[] = [];
    for (const s of [1, -1]) {
      const face = new THREE.PlaneGeometry(D.nameplate.w - 0.03, D.nameplate.h - 0.025);
      face.applyMatrix4(partMatrix({ at: [0, D.nameplate.h / 2, s * 0.0295], rot: [-s * 0.36, s > 0 ? 0 : Math.PI, 0] }));
      faces.push(face);
    }
    const plateMesh = new THREE.Mesh(mergeGeometries(faces, false)!, plate.material);
    plateMesh.name = `nameplate-${index}`;
    frame
      .clone()
      .multiply(new THREE.Matrix4().makeRotationY(oxLocal * 0.25).setPosition(oxLocal * 0.5, D.desk.h, D.desk.d / 2 - 0.14))
      .decompose(plateMesh.position, plateMesh.quaternion, plateMesh.scale);
    plateMesh.receiveShadow = true;
    this.ctx.root.add(plateMesh);

    // Chair: its wrapper's local +Z points away from the desk (gameplay slides it along that);
    // the chair itself is built facing +Z, so it sits turned around inside the wrapper.
    // The chair's seat wears the desk's accent, like the drawers, mouse pad and nameplate.
    const chair = new THREE.Group();
    const chairColor = accent;
    const cb = new Batch();
    buildChair(cb, chairColor);
    const chairBody = cb.build({ name: 'chair-body' });
    chairBody.rotation.y = Math.PI;
    chair.add(chairBody);
    const yaw = sz > 0 ? 0 : Math.PI;
    chair.position.set(X, 0, Zseat);
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
      setScreen(state: ScreenState, lines?: string[], app?: OfficeApp) {
        screen.set(state, lines, app);
      },
      setNameplate(name: string, subtitle?: string) {
        plate.set(name, subtitle);
      },
    };
    this.desks.push(slot);
    this.runtimes.push({
      slot,
      screen,
      frame,
      ox: oxLocal,
      mugSide,
      mug,
      clutter,
      clutterTint,
      chairColor,
      chairBody,
      plate,
      plateFaces: [plateMesh],
      chairSeen: new THREE.Matrix4(),
    });
    this.ctx.interactables.push({
      id: `desk:${index}`,
      kind: 'desk',
      position: new THREE.Vector3(X, 1.45, Zseat),
      radius: 1.6,
      label: outdoor ? 'Garden desk' : 'Empty desk',
      deskIndex: index,
    });
  }
}

const _m = new THREE.Matrix4();

const warned = new Set<string>();
function warnOnce(message: string): void {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(`[world] ${message}`);
}

// ---------------------------------------------------------------------------------------------
// Builders (local frame: pivot at the floor or desk-surface contact point, front facing +Z)

/** Pod carpet: darker border, a lighter stitched line, then the field. Centred on the pod. */
export function buildPodCarpet(b: Batch, color: string, d = D.pod): void {
  b.slab(d.carpetW, d.carpetD, 0.022, 0.55, shade(color, -0.07), { at: [0, 0.011, 0], cast: false, finish: 'matte', tex: 'carpet' });
  b.slab(d.carpetW - 0.34, d.carpetD - 0.34, 0.026, 0.4, shade(color, 0.05), { at: [0, 0.013, 0], cast: false, finish: 'matte', tex: 'carpet' });
  b.slab(d.carpetW - 0.46, d.carpetD - 0.46, 0.028, 0.34, color, { at: [0, 0.014, 0], cast: false, finish: 'matte', tex: 'carpet' });
}

/** Garden pod deck: wooden boards a centimetre above the lawn. */
export function buildPodDeck(b: Batch, d = D.pod): void {
  b.slab(d.carpetW, d.carpetD, 0.05, 0.35, PALETTE.wood, { at: [0, -0.015, 0], cast: false, finish: 'wood' });
  for (let k = -5; k <= 5; k++) b.box(d.carpetW - 0.3, 0.006, 0.03, shade(PALETTE.wood, -0.08), { at: [0, 0.011, k * 0.42], r: 0.003, seg: 1, cast: false, finish: 'matte' });
}

/** Low fabric divider between the two rows of a pod, with a rounded rail. Runs along X. */
export function buildPodDivider(b: Batch, color: string, d = D.divider): void {
  const len = D.desk.pitch * 2 - 0.04;
  b.box(len, d.h, d.t, color, { at: [0, D.desk.h + d.h / 2, 0], r: 0.03, finish: 'cloth' });
  b.box(len + 0.06, 0.05, d.t + 0.03, TRIM, { at: [0, D.desk.h + d.h + 0.01, 0], r: 0.025 });
}

/** Desk: chunky white top with a coloured lip at the front, slab legs, accent modesty panel at the back. */
export function buildDesk(b: Batch, accent: string, d = D.desk): void {
  b.box(d.w, d.topT, d.d, '#FBF6EC', { at: [0, d.h - d.topT / 2, 0], r: 0.038, tex: 'speckle' });
  b.box(d.w - 0.04, 0.05, 0.04, accent, { at: [0, d.h - 0.05, d.d / 2 + 0.008], r: 0.02 });
  for (const s of [-1, 1]) b.box(d.legT, d.h - d.topT, d.d - 0.12, LEG, { at: [s * (d.w / 2 - 0.08), (d.h - d.topT) / 2, 0], r: 0.03 });
  b.box(d.w - 0.24, 0.36, 0.035, accent, { at: [0, 0.4, -(d.d / 2 - 0.08)], r: 0.017, finish: 'matte' });
}

/** Chunky monitor standing on the desk: foot, neck, bezel and a coloured back. The screen faces +Z (drawn separately). */
export function buildMonitor(b: Batch, accent: string, sticky: string | null = null, stickyTilt = 0, d = D.monitor): void {
  const bezel = PALETTE.monitorBezel;
  const cy = d.centerY - D.desk.h;
  b.puck(0.12, 0.022, bezel, { at: [0, 0.011, -0.02], finish: 'plastic' });
  b.box(0.06, d.standH, 0.04, bezel, { at: [0, d.standH / 2 + 0.01, -0.045], r: 0.02, finish: 'plastic' });
  b.box(d.w, d.h, d.d, bezel, { at: [0, cy, 0], r: 0.05, finish: 'plastic' });
  b.box(0.48, 0.32, 0.06, accent, { at: [0, cy, -0.05], r: 0.03, finish: 'plastic' });
  if (sticky) b.box(0.07, 0.07, 0.012, sticky, { at: [0.31, cy + 0.19, d.d / 2 + 0.005], rot: [0, 0, stickyTilt], r: 0.004, cast: false });
}

export function buildKeyboard(b: Batch, d = D.keyboard): void {
  b.box(d.w, d.h, d.d, '#F7F4EE', { at: [0, d.h / 2, 0], r: 0.011, finish: 'plastic' });
  b.box(d.w - 0.04, 0.01, d.d - 0.04, '#D9E0EA', { at: [0, d.h + 0.002, 0], r: 0.004, cast: false });
}

export function buildMouse(b: Batch, d = D.mouse): void {
  b.ball([d.w / 2, d.h / 2, d.d / 2], '#F7F4EE', { at: [0, d.h / 4, 0], finish: 'plastic' });
}

/** Mug with coffee; the handle points to +X (side = 1) or -X (side = -1). */
export function buildMug(b: Batch, color: string, side = 1, d = D.mug): void {
  b.cyl(d.r, d.r - 0.004, d.h, color, { at: [0, d.h / 2, 0], seg: 20, finish: 'plastic' });
  b.cyl(d.r - 0.008, d.r - 0.008, 0.005, PALETTE.coffee, { at: [0, d.h - 0.002, 0], seg: 16, cast: false });
  b.torus(0.028, 0.009, color, { at: [side * (d.r + 0.003), d.h / 2, 0], finish: 'plastic' });
}

/** The tent card's body: two leaning boards (the printed faces are a separate mesh). */
export function buildNameplateCard(b: Batch, d = D.nameplate): void {
  for (const s of [1, -1]) b.box(d.w, d.h, 0.012, TRIM, { at: [0, d.h / 2 - 0.0025, s * 0.022], rot: [-s * 0.36, 0, 0], r: 0.005, cast: false });
}

/** A bit of desk clutter: succulent, rubber duck, papers, pencil cup or books (random kind by default). Faces +Z. */
export function buildDeskClutter(b: Batch, r: () => number, side: number, kind = Math.floor(r() * 5)): void {
  switch (kind) {
    case 0: {
      b.cyl(0.07, 0.055, 0.1, PALETTE.plantPot, { at: [0, 0.05, 0] });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + r();
        b.ball([0.045, 0.07, 0.045], i % 2 ? PALETTE.plantLeaf : shade(PALETTE.plantLeaf, 0.08), {
          at: [Math.cos(a) * 0.035, 0.15, Math.sin(a) * 0.035],
          rot: [Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5],
        });
      }
      break;
    }
    case 1: {
      // Rubber duck, of course.
      b.ball([0.06, 0.05, 0.075], '#FFD93D', { at: [0, 0.045, 0], finish: 'plastic' });
      b.ball(0.04, '#FFD93D', { at: [0, 0.11, 0.03], finish: 'plastic' });
      b.ball([0.022, 0.01, 0.025], '#FF9F45', { at: [0, 0.105, 0.07], finish: 'plastic' });
      for (const s of [-1, 1]) b.ball(0.007, '#1E1B2E', { at: [s * 0.02, 0.122, 0.062], cast: false });
      break;
    }
    case 2: {
      for (let i = 0; i < 4; i++) b.box(0.22, 0.012, 0.28, i % 2 ? '#FFFDF8' : '#F4F1EA', { at: [(r() - 0.5) * 0.03, 0.008 + i * 0.013, 0], rot: [0, (r() - 0.5) * 0.3, 0], r: 0.004, cast: i === 3 });
      break;
    }
    case 3: {
      b.cyl(0.045, 0.045, 0.1, pickR(r, ['#5CC8FF', '#FF7A6B', '#B48CFF']), { at: [0, 0.05, 0], finish: 'plastic' });
      for (let i = 0; i < 3; i++) b.cyl(0.008, 0.008, 0.14, pickR(r, ['#FFC94A', '#FF5A5F', '#3D7CFF']), { at: [(i - 1) * 0.018, 0.12, 0], rot: [(r() - 0.5) * 0.4, 0, (i - 1) * 0.25], cast: false });
      break;
    }
    default: {
      b.box(0.2, 0.04, 0.27, pickR(r, ['#3D7CFF', '#FF5A5F', '#2EC4B6']), { at: [0, 0.02, 0], r: 0.01 });
      b.box(0.18, 0.035, 0.25, pickR(r, ['#FFC93C', '#9B5DE5', '#FF9DCB']), { at: [0, 0.058, 0], rot: [0, side * 0.2, 0], r: 0.01 });
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

  /** The canvas now lies on the nameplate model's Label faces: glTF UVs run top to bottom. */
  useModelFaces(): void {
    if (!this.tex.tex.flipY) return;
    this.tex.tex.flipY = false;
    this.tex.tex.needsUpdate = true;
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

/** Wheeled office chair facing +Z: five-star base, gas lift, plump seat, rounded backrest. */
export function buildChair(b: Batch, color: string, d = D.chair): void {
  const base = PALETTE.chairBase;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.box(0.06, 0.045, 0.3, base, { at: [Math.sin(a) * 0.15, 0.075, Math.cos(a) * 0.15], rot: [0, a, 0], r: 0.02, finish: 'plastic' });
    b.ball(0.042, '#2B2F3A', { at: [Math.sin(a) * (d.baseR - 0.01), 0.042, Math.cos(a) * (d.baseR - 0.01)], ws: 12, hs: 8, finish: 'plastic' });
  }
  b.cyl(0.03, 0.03, 0.3, PALETTE.metal, { at: [0, 0.24, 0], seg: 12, finish: 'plastic' });
  b.box(d.seatW, d.seatT, d.seatD, color, { at: [0, d.seatH - d.seatT / 2, 0], r: 0.055, finish: 'plastic' });
  b.box(0.08, 0.28, 0.05, base, { at: [0, 0.56, -0.25], r: 0.02, finish: 'plastic' });
  b.box(d.backW, d.backH, 0.11, color, { at: [0, d.backY, -0.27], rot: [-0.1, 0, 0], r: 0.055, finish: 'plastic' });
}
