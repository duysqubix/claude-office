// The intern desk: a scrappy bench of plywood on sawhorses, with little hand-me-down monitors
// and wobbly stools, where every subagent works. It is built from 1.6 m modules placed back to
// back (2 stations a side each), grows one module pair at a time, and when the indoor spot is
// full a second bench appears on the lawn. Catalog models (intern_bench, intern_station,
// intern_stool, intern_sign) replace the procedural pieces when they are available.
import * as THREE from 'three';
import { PALETTE } from '../style/palette';
import D from './dimensions.json';
import type { AABB, Interactable, InternSlot, ScreenState } from './types';
import { Batch, CanvasTex, ellipsize, fitText, font, G, rng, shade } from './kit';
import { INITIAL_BENCH_PAIRS, INTERN_BENCHES, type BenchSlot } from './layout';
import { Screen, type ScreenView } from './screens';
import { tallProp } from './props';
import { disposeGroup, disposeInstanced, instancedModel, placement } from './modelkit';
import { model } from '../models';
import type { WorldCtx } from './ctx';

const M = D.internBench;
const ST = D.internStation;
const SL = D.internStool;
const PLY = '#E4C493';
const SAWHORSE = '#FFC94A';
const BENCH_ACCENT = '#B48CFF';
const STOOL_SEAT = '#FF9DCB';

/** Procedural station screen rectangle (station space: origin on the desk surface, front +Z). */
const SCREEN_RECT = { x: 0, y: 0.205, z: 0.012, w: ST.screenW, h: ST.screenH };

interface Station {
  slot: InternSlot;
  screen: Screen;
  screenMesh: THREE.Mesh;
  /** Station frame: origin on the desk surface, front facing the stool. */
  frame: THREE.Matrix4;
  label: StationLabel;
}

interface Bench {
  spot: BenchSlot;
  pairs: number;
  /** Procedural parts, replaced one by one when the catalog models arrive. */
  parts: { benches: THREE.Group | null; stations: THREE.Group | null; stools: THREE.Group | null };
  models: THREE.Object3D[];
  decor: THREE.Group | null;
  collider: AABB;
  stations: Station[];
  /** Module pairs that already have a floor blob shadow. */
  blobbed: number;
  /** Bumped when the bench grows, so a model load for the old size is dropped. */
  generation: number;
}

export class InternSystem {
  private readonly benches: Bench[] = [];
  private interactable: Interactable | null = null;

  constructor(
    private readonly ctx: WorldCtx,
    private readonly slots: InternSlot[],
  ) {
    this.addBench(INTERN_BENCHES[0], INITIAL_BENCH_PAIRS);
  }

  get capacity(): number {
    return INTERN_BENCHES.reduce((n, b) => n + b.maxPairs * 4, 0);
  }

  /** Grow until at least `n` stations exist (or every bench spot is full). Returns true if anything changed. */
  ensure(n: number): boolean {
    let changed = false;
    while (this.slots.length < n) {
      const last = this.benches[this.benches.length - 1];
      if (last && last.pairs < last.spot.maxPairs) {
        this.build(last, last.pairs + 1);
      } else {
        const spot = INTERN_BENCHES[this.benches.length];
        if (!spot) break;
        this.addBench(spot, 1);
      }
      changed = true;
    }
    return changed;
  }

  update(dt: number, elapsed: number, view?: ScreenView): void {
    for (const b of this.benches) for (const s of b.stations) s.screen.update(dt, elapsed, view);
  }

  /** Ground area of every bench spot in use, at its full length (for the sun's shadow fit). */
  areas(): THREE.Box3[] {
    return this.benches.map(({ spot }) => {
      const len = spot.maxPairs * M.moduleW;
      return new THREE.Box3(new THREE.Vector3(spot.x0 - 1.0, 0, spot.z - M.d - 1.0), new THREE.Vector3(spot.x0 + len + 0.6, 1.6, spot.z + M.d + 1.0));
    });
  }

  /** Rug marking out the bench's spot (sized for its full length, so it grows into it). */
  private buildRug(spot: BenchSlot): void {
    const len = spot.maxPairs * M.moduleW + 0.9;
    const d = M.d * 2 + 2.5;
    // Its own batch: benches can be added after the world's static batch has been merged.
    const b = new Batch();
    const cx = spot.x0 + len / 2 - 0.45;
    if (spot.outdoor) {
      b.slab(len, d, 0.05, 0.4, PALETTE.wood, { at: [cx, -0.015, spot.z], cast: false, finish: 'wood' });
    } else {
      b.slab(len, d, 0.022, 0.6, '#9E86E8', { at: [cx, 0.011, spot.z], cast: false, finish: 'matte', tex: 'carpet' });
      b.slab(len - 0.36, d - 0.36, 0.026, 0.45, '#C9B8FF', { at: [cx, 0.013, spot.z], cast: false, finish: 'matte', tex: 'carpet' });
    }
    this.ctx.root.add(b.build({ name: 'intern-rug' }));
  }

  private addBench(spot: BenchSlot, pairs: number): void {
    const bench: Bench = {
      spot,
      pairs: 0,
      parts: { benches: null, stations: null, stools: null },
      models: [],
      decor: null,
      collider: { minX: spot.x0, maxX: spot.x0, minZ: spot.z - M.d, maxZ: spot.z + M.d },
      stations: [],
      blobbed: 0,
      generation: 0,
    };
    this.benches.push(bench);
    this.ctx.colliders.push(bench.collider);
    this.buildRug(spot);
    this.buildSign(bench);
    this.build(bench, pairs);
  }

  /** Module placements of a bench: [south-facing, north-facing] per pair. */
  private modules(spot: BenchSlot, pairs: number): THREE.Matrix4[] {
    const out: THREE.Matrix4[] = [];
    for (let p = 0; p < pairs; p++) {
      const cx = spot.x0 + M.moduleW / 2 + p * M.moduleW;
      out.push(placement(cx, 0, spot.z + M.d / 2, 0), placement(cx, 0, spot.z - M.d / 2, Math.PI));
    }
    return out;
  }

  /** (Re)build a bench at `pairs` module pairs. Existing stations keep their state. */
  private build(bench: Bench, pairs: number): void {
    const { ctx } = this;
    const { spot } = bench;
    for (const key of ['benches', 'stations', 'stools'] as const) {
      const g = bench.parts[key];
      if (g) disposeGroup(g);
      bench.parts[key] = null;
    }
    for (const m of bench.models) disposeInstanced(m);
    bench.models = [];
    if (bench.decor) disposeGroup(bench.decor);
    bench.generation++;
    bench.pairs = pairs;

    const modules = this.modules(spot, pairs);
    const benchB = new Batch();
    const stationB = new Batch();
    const stoolB = new Batch();
    const decorB = new Batch();
    const stationFrames: THREE.Matrix4[] = [];
    const stoolFrames: THREE.Matrix4[] = [];
    const _pos = new THREE.Vector3();
    const _quat = new THREE.Quaternion();
    const _scale = new THREE.Vector3();
    modules.forEach((m, mi) => {
      m.decompose(_pos, _quat, _scale);
      const yaw = yawOf(m);
      benchB.place(_pos.x, 0, _pos.z, yaw, () => buildInternModule(benchB));
      decorB.place(_pos.x, 0, _pos.z, yaw, () => buildBenchClutter(decorB, rng(900 + mi + spot.x0 * 10), mi));
      for (const sx of [-M.stationX, M.stationX]) {
        const frame = m.clone().multiply(new THREE.Matrix4().makeTranslation(sx, M.h, M.stationZ));
        stationFrames.push(frame);
        frame.decompose(_pos, _quat, _scale);
        stationB.place(_pos.x, _pos.y, _pos.z, yaw, () => buildInternStation(stationB));
        const stool = m.clone().multiply(new THREE.Matrix4().makeTranslation(sx, 0, M.stoolZ));
        stoolFrames.push(stool);
        stool.decompose(_pos, _quat, _scale);
        stoolB.place(_pos.x, 0, _pos.z, yaw, () => buildInternStool(stoolB));
      }
    });
    bench.parts.benches = benchB.build({ name: 'intern-bench' });
    bench.parts.stations = stationB.build({ name: 'intern-stations' });
    bench.parts.stools = stoolB.build({ name: 'intern-stools' });
    bench.decor = decorB.build({ name: 'intern-clutter' });
    ctx.root.add(bench.parts.benches, bench.parts.stations, bench.parts.stools, bench.decor);

    // Stations (slots) for any new positions; existing ones stay put as the bench grows east.
    for (let i = bench.stations.length; i < stationFrames.length; i++) {
      bench.stations.push(this.makeStation(stationFrames[i], stoolFrames[i]));
    }

    // Collider and interactable follow the bench's length.
    const len = pairs * M.moduleW;
    bench.collider.minX = spot.x0;
    bench.collider.maxX = spot.x0 + len;
    if (this.benches[0] === bench) {
      const pos = new THREE.Vector3(spot.x0 + len / 2, 1.2, spot.z);
      if (!this.interactable) {
        this.interactable = { id: 'interns', kind: 'interns', position: pos, radius: len / 2 + 1.0, label: 'Intern desk' };
        ctx.interactables.push(this.interactable);
      } else {
        this.interactable.position.copy(pos);
        this.interactable.radius = len / 2 + 1.0;
      }
    }
    for (; bench.blobbed < pairs; bench.blobbed++) ctx.blobs.add(spot.x0 + (bench.blobbed + 0.5) * M.moduleW, spot.z, M.moduleW + 0.2, M.d * 2 + 0.3);
    void this.swapInModels(bench, modules, stationFrames, stoolFrames);
  }

  private makeStation(frame: THREE.Matrix4, stoolFrame: THREE.Matrix4): Station {
    const index = this.slots.length;
    const screen = new Screen(500 + index, BENCH_ACCENT, { w: 192, h: 120 });
    const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), screen.material);
    screenMesh.name = `intern-screen-${index}`;
    placeScreen(screenMesh, frame, SCREEN_RECT);
    this.ctx.root.add(screenMesh);
    screen.attach(screenMesh);

    const label = new StationLabel(index);
    // The label lies on the desk near the front edge, tilted up toward the aisle.
    label.mesh.matrixAutoUpdate = false;
    label.mesh.matrix
      .copy(frame)
      .multiply(new THREE.Matrix4().makeTranslation(0, 0.012, M.d / 2 - M.stationZ - 0.06))
      .multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2 + 0.45));
    this.ctx.root.add(label.mesh);

    const seat = new THREE.Vector3().setFromMatrixPosition(stoolFrame).setY(SL.seatH);
    const yaw = yawOf(stoolFrame) + Math.PI;
    const approach = new THREE.Vector3(0, 0, 0.55).applyMatrix4(stoolFrame).setY(0);
    const slot: InternSlot = {
      index,
      seat,
      yaw: Math.atan2(Math.sin(yaw), Math.cos(yaw)),
      approach,
      setScreen(state: ScreenState, lines?: string[]) {
        screen.set(state, lines);
      },
      setLabel(name: string, subtitle?: string) {
        label.set(name, subtitle);
      },
    };
    this.slots.push(slot);
    return { slot, screen, screenMesh, frame, label };
  }

  private buildSign(bench: Bench): void {
    const { spot } = bench;
    // Hanging banner over the bench (indoors), plus the traffic-cone sign at its west end.
    if (!spot.outdoor) {
      const tex = new CanvasTex(512, 160, (c, w, h) => {
        c.fillStyle = PALETTE.paper;
        c.beginPath();
        c.roundRect(0, 0, w, h, 36);
        c.fill();
        c.fillStyle = BENCH_ACCENT;
        c.beginPath();
        c.roundRect(10, 10, w - 20, h - 20, 28);
        c.fill();
        c.fillStyle = '#FFFDF7';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        fitText(c, 'INTERNS', 700, 96, w - 80);
        c.fillText('INTERNS', w / 2, h / 2 - 8);
        c.font = font(600, 24);
        c.fillText('the future of the company (probably)', w / 2, h - 30);
      });
      const len = spot.maxPairs * M.moduleW;
      const mat = new THREE.MeshStandardMaterial({ map: tex.tex, roughness: 0.7 });
      // Both printed faces go in through `extra`, so the fader fades them with the board.
      const faces = [1, -1].map((s) => {
        const face = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.69), mat);
        face.position.set(0, 3.0, s * 0.032);
        face.rotation.y = s > 0 ? 0 : Math.PI;
        return face;
      });
      const banner = tallProp(this.ctx, 'interns-banner', (b) => {
        b.box(2.3, 0.74, 0.06, '#FFFDF7', { at: [0, 3.0, 0], r: 0.05, cast: false });
        for (const s of [-1, 1]) b.cyl(0.008, 0.008, D.building.wallH - 3.37, '#3B4252', { at: [s * 0.9, (D.building.wallH + 3.37) / 2, 0], seg: 6, cast: false });
      }, { at: [spot.x0 + Math.min(len, INITIAL_BENCH_PAIRS * M.moduleW) / 2, spot.z], extra: faces });
      banner.userData.overhead = true;
    }
    const sx = spot.x0 - 0.55;
    const signYaw = Math.PI / 4;
    const signB = new Batch();
    signB.place(sx, 0, spot.z, signYaw, () => buildConeSign(signB));
    const sign = signB.build({ name: 'intern-sign' });
    this.ctx.root.add(sign);
    this.ctx.colliders.push({ minX: sx - 0.25, maxX: sx + 0.25, minZ: spot.z - 0.25, maxZ: spot.z + 0.25 });
    void model('intern_sign').then((m) => {
      if (!m) return;
      m.position.set(sx, 0, spot.z);
      m.rotation.y = signYaw;
      disposeGroup(sign);
      this.ctx.root.add(m);
    });
  }

  private async swapInModels(bench: Bench, modules: THREE.Matrix4[], stations: THREE.Matrix4[], stools: THREE.Matrix4[]): Promise<void> {
    const gen = bench.generation;
    const [benchM, stationM, stoolM] = await Promise.all([
      instancedModel('intern_bench', modules, { tint: { Accent: BENCH_ACCENT } }),
      instancedModel('intern_station', stations, { hide: ['Screen'] }),
      instancedModel('intern_stool', stools, { tint: { Seat: STOOL_SEAT } }),
    ]);
    if (gen !== bench.generation) return;
    const swap = (key: 'benches' | 'stations' | 'stools', m: { group: THREE.Group } | null) => {
      if (!m) return;
      const old = bench.parts[key];
      if (old) disposeGroup(old);
      bench.parts[key] = null;
      this.ctx.root.add(m.group);
      bench.models.push(m.group);
    };
    swap('benches', benchM);
    swap('stools', stoolM);
    if (stationM) {
      swap('stations', stationM);
      // Line our canvases up with the model's own screen.
      const box = stationM.boxOf('Screen');
      if (box) {
        const size = box.getSize(new THREE.Vector3());
        const rect = { x: (box.min.x + box.max.x) / 2, y: (box.min.y + box.max.y) / 2, z: box.max.z + 0.002, w: size.x, h: size.y };
        bench.stations.forEach((s) => placeScreen(s.screenMesh, s.frame, rect));
      }
    }
  }
}

/** Rotation about +Y of a matrix built from yaw-only rotations (Euler decomposition is ambiguous at π). */
function yawOf(m: THREE.Matrix4): number {
  return Math.atan2(m.elements[8], m.elements[10]);
}

function placeScreen(mesh: THREE.Mesh, frame: THREE.Matrix4, r: { x: number; y: number; z: number; w: number; h: number }): void {
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(frame).multiply(new THREE.Matrix4().compose(new THREE.Vector3(r.x, r.y, r.z), new THREE.Quaternion(), new THREE.Vector3(r.w, r.h, 1)));
  mesh.matrixWorldNeedsUpdate = true;
}

/** Little card on the bench edge: intern type and who they work for. */
class StationLabel {
  readonly mesh: THREE.Mesh;
  private readonly tex: CanvasTex;
  private name = '';
  private subtitle = '';

  constructor(private readonly index: number) {
    this.tex = new CanvasTex(256, 64, (c, w, h) => this.draw(c, w, h));
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.085), new THREE.MeshStandardMaterial({ map: this.tex.tex, roughness: 0.7 }));
    this.mesh.name = `intern-label-${index}`;
  }

  set(name: string, subtitle = ''): void {
    if (name === this.name && subtitle === this.subtitle) return;
    this.name = name;
    this.subtitle = subtitle;
    this.tex.redraw();
  }

  private draw(c: CanvasRenderingContext2D, w: number, h: number): void {
    c.fillStyle = this.name ? PALETTE.paper : '#ECE6DA';
    c.beginPath();
    c.roundRect(0, 0, w, h, 14);
    c.fill();
    c.textBaseline = 'middle';
    if (!this.name) {
      c.fillStyle = '#A3AAB8';
      c.textAlign = 'center';
      c.font = font(700, 26);
      c.fillText(`free · ${this.index + 1}`, w / 2, h / 2 + 1);
      return;
    }
    c.fillStyle = BENCH_ACCENT;
    c.fillRect(0, 0, 10, h);
    c.textAlign = 'left';
    c.fillStyle = PALETTE.ink;
    fitText(c, this.name, 700, 28, w - 30, 12);
    c.fillText(this.name, 20, this.subtitle ? 21 : h / 2 + 1);
    if (this.subtitle) {
      c.fillStyle = '#6B7280';
      c.font = font(600, 18);
      c.fillText(ellipsize(c, this.subtitle, w - 30), 20, 47);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Builders (local frame: pivot at the floor contact point, front facing +Z)

/** One 1.6 m bench module: plywood top on two sawhorses, painter's tape on the edge. */
export function buildInternModule(b: Batch, d = M): void {
  b.box(d.moduleW - 0.02, 0.05, d.d - 0.02, PLY, { at: [0, d.h - 0.025, 0], r: 0.018, finish: 'wood' });
  b.box(d.moduleW - 0.1, 0.012, 0.05, '#5CC8FF', { at: [0, d.h - 0.003, d.d / 2 - 0.04], r: 0.005, cast: false });
  for (const sx of [-d.moduleW / 2 + 0.16, d.moduleW / 2 - 0.16]) {
    b.box(0.06, 0.05, d.d - 0.08, SAWHORSE, { at: [sx, d.h - 0.075, 0], r: 0.02, finish: 'wood' });
    for (const sz of [-1, 1]) {
      for (const lean of [-1, 1]) {
        b.box(0.045, d.h - 0.08, 0.045, SAWHORSE, { at: [sx + lean * 0.07, (d.h - 0.08) / 2, sz * (d.d / 2 - 0.08)], rot: [0, 0, lean * 0.16], r: 0.015, finish: 'wood' });
      }
    }
  }
}

/** One station: a little beige monitor (screen drawn separately) and keyboard. Origin on the desk surface. */
export function buildInternStation(b: Batch, d = ST): void {
  const beige = '#E9DFC9';
  b.box(d.w, 0.25, 0.18, beige, { at: [0, 0.2, -0.08], r: 0.04, finish: 'plastic' });
  b.box(d.w - 0.08, 0.19, 0.08, shade(beige, -0.06), { at: [0, 0.2, -0.2], r: 0.03, finish: 'plastic' });
  b.box(0.12, 0.07, 0.1, shade(beige, -0.04), { at: [0, 0.04, -0.08], r: 0.02, finish: 'plastic' });
  b.box(d.screenW + 0.02, d.screenH + 0.02, 0.012, '#2E3440', { at: [SCREEN_RECT.x, SCREEN_RECT.y, 0.008], r: 0.005, cast: false });
  b.box(0.24, 0.018, 0.085, '#F4EEDF', { at: [0, 0.009, 0.15], r: 0.008, finish: 'plastic' });
  b.box(0.2, 0.006, 0.06, '#C9C1AE', { at: [0, 0.019, 0.15], r: 0.003, cast: false });
}

/** A round wobbly stool sized for a 0.7-scale intern. */
export function buildInternStool(b: Batch, d = SL): void {
  b.puck(d.r, 0.06, STOOL_SEAT, { at: [0, d.seatH - 0.03, 0], finish: 'plastic' });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.box(0.035, d.seatH - 0.05, 0.035, PLY, { at: [Math.sin(a) * 0.1, (d.seatH - 0.05) / 2, Math.cos(a) * 0.1], rot: [Math.cos(a) * 0.12, 0, -Math.sin(a) * 0.12], r: 0.012, finish: 'wood' });
  }
  b.torus(0.105, 0.012, PLY, { at: [0, 0.15, 0], rot: [Math.PI / 2, 0, 0], finish: 'wood' });
}

/** Traffic cone with a hand-lettered cardboard "INTERNS →" sign on a pole. */
export function buildConeSign(b: Batch): void {
  b.cyl(0.03, 0.17, 0.42, '#FF8A3D', { at: [0, 0.23, 0], seg: 20, finish: 'plastic' });
  b.cyl(0.11, 0.135, 0.06, '#FFFDF7', { at: [0, 0.2, 0], seg: 20, cast: false });
  b.box(0.38, 0.03, 0.38, '#FF8A3D', { at: [0, 0.015, 0], r: 0.012, finish: 'plastic' });
  b.cyl(0.015, 0.015, 0.95, '#8D6E63', { at: [0, 0.82, 0], seg: 8, finish: 'wood' });
  b.box(0.6, 0.3, 0.02, '#C9955E', { at: [0, 1.25, 0.02], rot: [0, 0, 0.06], r: 0.01, finish: 'matte' });
  b.box(0.42, 0.07, 0.006, '#3B2A20', { at: [-0.04, 1.27, 0.032], rot: [0, 0, 0.06], r: 0.003, cast: false });
  b.box(0.08, 0.05, 0.006, '#3B2A20', { at: [0.22, 1.24, 0.032], rot: [0, 0, 0.6], r: 0.003, cast: false });
}

/** Odds and ends on a bench module, between its two stations: snacks, energy drinks, a sad plant. */
function buildBenchClutter(b: Batch, r: () => number, i: number): void {
  const y = M.h;
  switch (i % 3) {
    case 0: {
      b.add(G.hemisphere(), '#5CC8FF', { at: [0, y + 0.075, -0.12], scale: [0.11, -0.075, 0.11], finish: 'plastic' });
      for (let k = 0; k < 7; k++) {
        const a = r() * Math.PI * 2;
        b.ball(0.022, ['#FFC94A', '#FF7A6B', '#6EDC9A', '#B48CFF'][k % 4], { at: [Math.cos(a) * 0.05, y + 0.07 + r() * 0.02, -0.12 + Math.sin(a) * 0.05], cast: false });
      }
      break;
    }
    case 1: {
      for (let k = 0; k < 3; k++) {
        const c = ['#6EDC9A', '#FF5A5F', '#3D7CFF'][k];
        const x = -0.07 + k * 0.07;
        b.cyl(0.028, 0.028, 0.12, c, { at: [x, y + 0.06, -0.14 + (k % 2) * 0.05], seg: 16, finish: 'gloss' });
        b.cyl(0.026, 0.026, 0.004, '#D7DDE6', { at: [x, y + 0.122, -0.14 + (k % 2) * 0.05], seg: 16, cast: false });
      }
      b.cyl(0.028, 0.028, 0.12, '#FFC94A', { at: [0.13, y + 0.028, -0.06], rot: [0, 0.5, Math.PI / 2], seg: 16, finish: 'gloss' });
      break;
    }
    default: {
      // The sad little plant: one drooping leaf, one fallen off.
      b.cyl(0.05, 0.04, 0.08, PALETTE.plantPot, { at: [0, y + 0.04, -0.12] });
      b.cyl(0.006, 0.006, 0.09, '#7A9A4A', { at: [0.01, y + 0.12, -0.12], rot: [0, 0, 0.5], seg: 6 });
      b.ball([0.035, 0.012, 0.05], '#9BBF5A', { at: [0.05, y + 0.13, -0.12], rot: [0, 0, 0.9] });
      b.ball([0.03, 0.01, 0.04], '#B5A35A', { at: [0.1, y + 0.006, -0.06], cast: false });
    }
  }
}
