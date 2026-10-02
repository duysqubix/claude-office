// The Team Room: a meeting corner at the end of the boulevard, against the north wall. A big
// wall screen shows live plan usage (ring gauges with reset countdowns), team numbers and how
// full everyone's context window is. Conference table and chairs, a flipchart, glass
// partitions either side, a sticky-note wall nearby. Catalog models replace the procedural
// pieces when available; the screen canvas is always ours.
import * as THREE from 'three';
import { PALETTE } from '../style/palette';
import D from './dimensions.json';
import type { TeamStats } from '../../../shared/protocol';
import { Batch, CanvasTex, ellipsize, fitText, font, G, shade } from './kit';
import { OFFICE, TEAM_ROOM } from './layout';
import { aabb, footprint, type WorldCtx } from './ctx';
import { glassMaterial } from './building';
import { inView, sparkle, type ScreenView } from './screens';
import type { FadeItem } from './fader';
import { disposeGroup, instancedModel, placement, swapModel } from './modelkit';
import { tallProp } from './props';

const WS = D.wallScreen;
const CT = D.conferenceTable;
const CC = D.conferenceChair;
const GP = D.glassPartition;
const WALL_Z = -OFFICE.halfD;
const CHAIR_COLORS = ['#FF7A6B', '#2EC4B6'];

export interface TeamRoom {
  setStats(stats: TeamStats): void;
  /** Per frame: repaints the wall screen when its contents changed and the camera can see it. */
  update(view?: ScreenView): void;
}

export function buildTeamRoom(ctx: WorldCtx): TeamRoom {
  const { x: rx, tableZ } = TEAM_ROOM;
  const b = ctx.statics;

  // Rug in bold flat shapes: teal border, cream field, coral oval under the table.
  b.slab(4.3, 4.7, 0.022, 0.6, '#3FB8AF', { at: [rx, 0.011, tableZ - 0.3], cast: false, finish: 'matte', tex: 'carpet' });
  b.slab(3.9, 4.3, 0.026, 0.45, '#FFF1DC', { at: [rx, 0.013, tableZ - 0.3], cast: false, finish: 'matte', tex: 'carpet' });
  b.add(G.puck(1, 0.03, 0.012, 48), '#FF9A7A', { at: [rx, 0.015, tableZ - 0.1], scale: [1.25, 1, 2.1], cast: false, finish: 'matte', tex: 'carpet' });

  // ---- Wall screen ----------------------------------------------------------------------------
  const board = new TeamBoard();
  const screen = new THREE.Group();
  screen.name = 'team-screen';
  screen.position.set(rx, WS.centerY, WALL_Z);
  const sb = new Batch();
  buildWallScreen(sb);
  screen.add(sb.build({ name: 'team-screen-body' }));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(WS.w, WS.h), board.material);
  face.position.z = 0.125;
  face.userData.keep = true;
  face.name = 'team-screen-face';
  screen.add(face);
  board.attach(face);
  ctx.root.add(screen);
  // Our live canvas sits on top; the model's own blank screen is hidden.
  void swapModel(ctx, screen, 'wall_screen', { hide: ['Screen'] });

  // ---- Conference table and chairs -----------------------------------------------------------
  const tableYaw = Math.PI / 2; // long side runs toward the screen
  const table = new THREE.Group();
  table.name = 'conference-table';
  table.position.set(rx, 0, tableZ);
  table.rotation.y = tableYaw;
  const tb = new Batch();
  buildConferenceTable(tb);
  table.add(tb.build({ name: 'conference-table-body' }));
  ctx.root.add(table);
  void swapModel(ctx, table, 'conference_table', { tint: { Accent: '#3FB8AF' } });
  ctx.colliders.push(footprint(rx, tableZ, CT.w, CT.d, 1));
  ctx.blobs.add(rx, tableZ, CT.d + 0.5, CT.w + 0.5);

  // Seats from the table model's anchors (seat0–5 along the sides, seat6 at the south end).
  const anchors: [number, number][] = [
    [-0.9, 0.95],
    [0, 0.95],
    [0.9, 0.95],
    [-0.9, -0.95],
    [0, -0.95],
    [0.9, -0.95],
    [-1.85, 0],
  ];
  const placements: THREE.Matrix4[][] = [[], []];
  const chairs = new Batch();
  anchors.forEach(([lx, lz], i) => {
    // Table space → world (rotation about Y by tableYaw), then face the table centre.
    const c = Math.cos(tableYaw);
    const s = Math.sin(tableYaw);
    const x = rx + lx * c + lz * s;
    const z = tableZ - lx * s + lz * c;
    const yaw = Math.atan2(rx - x, tableZ - z);
    placements[i % 2].push(placement(x, 0, z, yaw));
    chairs.place(x, 0, z, yaw, () => buildConferenceChair(chairs, CHAIR_COLORS[i % 2]));
    ctx.colliders.push(footprint(x, z, 0.5, 0.5));
    ctx.blobs.add(x, z, 0.75, 0.75, { shape: 'round' });
  });
  const chairGroup = chairs.build({ name: 'conference-chairs' });
  ctx.root.add(chairGroup);
  void Promise.all(placements.map((p, k) => instancedModel('conference_chair', p, { tint: { Seat: CHAIR_COLORS[k] } }))).then((models) => {
    if (models.some((m) => !m)) return;
    disposeGroup(chairGroup);
    for (const m of models) ctx.root.add(m!.group);
  });

  // ---- Flipchart -------------------------------------------------------------------------------
  const fx = rx - 1.85;
  const fz = WALL_Z + 0.85;
  const flipYaw = Math.atan2(rx - fx, tableZ - fz);
  const flip = new THREE.Group();
  flip.name = 'flipchart';
  flip.position.set(fx, 0, fz);
  flip.rotation.y = flipYaw;
  const fb = new Batch();
  buildFlipchart(fb);
  flip.add(fb.build({ name: 'flipchart-body' }));
  const pad = new CanvasTex(256, 320, drawFlipchartPad);
  const padMat = new THREE.MeshStandardMaterial({ map: pad.tex, roughness: 0.8 });
  const padFace = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.82), padMat);
  padFace.position.set(0, 1.22, 0.035);
  padFace.rotation.x = -0.13;
  flip.add(padFace);
  ctx.root.add(flip);
  let flipFade = ctx.fader.add('flipchart', [flip]);
  // glTF UVs run left→right and TOP→bottom (V = 0 at the top), so the canvas must not be flipped
  // vertically and must not be mirrored: paint() sets flipY = false. (The padFace fallback goes
  // with the swap, so changing pad.tex here affects only the model.)
  void swapModel(ctx, flip, 'flipchart', { paint: { Board: padMat } }).then((m) => {
    if (!m) return;
    ctx.fader.remove(flipFade);
    flipFade = ctx.fader.add('flipchart', [flip]);
  });
  ctx.colliders.push(footprint(fx, fz, 0.75, 0.75));
  ctx.blobs.add(fx, fz, 0.9, 0.9, { shape: 'round' });

  // ---- Glass partitions either side (they fade, and the camera can't pass through them) --------
  const blockerMat = new THREE.MeshBasicMaterial({ visible: false });
  for (const side of [-1, 1]) {
    const px = rx + side * TEAM_ROOM.partitionX;
    const runs = [WALL_Z + GP.w / 2, WALL_Z + GP.w * 1.5];
    const groups: THREE.Group[] = [];
    for (const z of runs) {
      const g = new THREE.Group();
      g.name = 'glass-partition';
      g.position.set(px, 0, z);
      g.rotation.y = Math.PI / 2;
      const pb = new Batch();
      buildGlassPartition(pb);
      g.add(pb.build({ name: 'glass-partition-frame' }));
      const pane = new THREE.Mesh(new THREE.BoxGeometry(GP.w - 0.12, GP.h - 0.2, 0.02), glassMaterial());
      pane.position.y = GP.h / 2 + 0.02;
      g.add(pane);
      ctx.root.add(g);
      groups.push(g);
    }
    let item: FadeItem = ctx.fader.add(`partition-${side}`, groups);
    void Promise.all(groups.map((g) => swapModel(ctx, g, 'glass_partition', { tint: { Accent: '#3FB8AF' }, materials: { Glass: glassMaterial() } }))).then((ms) => {
      if (ms.every((m) => !m)) return;
      ctx.fader.remove(item);
      item = ctx.fader.add(`partition-${side}`, groups);
    });
    const z0 = WALL_Z;
    const z1 = WALL_Z + GP.w * 2;
    ctx.colliders.push(aabb(px - GP.t / 2, px + GP.t / 2, z0, z1));
    const blocker = new THREE.Mesh(new THREE.BoxGeometry(GP.t, GP.h, z1 - z0), blockerMat);
    blocker.position.set(px, GP.h / 2, (z0 + z1) / 2);
    blocker.visible = false;
    blocker.name = 'camera-blocker';
    ctx.root.add(blocker);
    ctx.cameraBlockers.push(blocker);
  }

  // ---- Sticky-note wall (north wall, by the manager's corner) ----------------------------------
  const sticky = new THREE.Group();
  sticky.name = 'sticky-wall';
  sticky.position.set(9.4, D.stickyWall.centerY, WALL_Z);
  const swb = new Batch();
  buildStickyWall(swb);
  sticky.add(swb.build({ name: 'sticky-wall-body' }));
  ctx.root.add(sticky);
  void swapModel(ctx, sticky, 'sticky_wall');

  // A little snake plant in the corner by the screen.
  const plant = tallProp(ctx, 'snake-plant', (pb) => buildSnakePlant(pb), { at: [rx + 1.85, WALL_Z + 0.45] });
  void swapModel(ctx, plant, 'plant_snake', { fit: { h: 0.95, uniform: true }, tint: { Accent: '#FF7A6B' } });
  ctx.colliders.push(footprint(rx + 1.85, WALL_Z + 0.45, 0.4, 0.4));

  ctx.interactables.push({
    id: 'teamboard',
    kind: 'teamboard',
    position: new THREE.Vector3(rx, 1.6, WALL_Z + 1.05),
    radius: 2.2,
    label: 'Team stats',
  });

  return { setStats: (stats) => board.set(stats), update: (view) => board.update(view) };
}

// ---------------------------------------------------------------------------------------------
// Builders (local frame: pivot at the floor contact point / wall back, front facing +Z)

/** Wall screen body: chunky bezel and a soundbar. Origin at the wall, picture centre at y = 0. */
export function buildWallScreen(b: Batch, d = WS): void {
  b.box(d.bezelW, d.h + 0.16, 0.11, '#2B2F3A', { at: [0, 0.02, 0.055], r: 0.05, finish: 'plastic' });
  b.box(d.bezelW - 0.5, 0.12, 0.12, '#3B4252', { at: [0, -d.h / 2 - 0.16, 0.08], r: 0.05, finish: 'plastic' });
  b.box(0.08, 0.025, 0.01, '#4ADE80', { at: [d.bezelW / 2 - 0.2, -d.h / 2 - 0.035, 0.112], r: 0.004, glow: 1.5, cast: false });
}

/** Conference table: wooden top with a teal edge, two chunky pedestal legs and a cable hub. */
export function buildConferenceTable(b: Batch, d = CT): void {
  const top = 0.75;
  b.box(d.w, 0.07, d.d, '#D8A86C', { at: [0, top - 0.035, 0], r: 0.035, finish: 'wood' });
  b.box(d.w - 0.06, 0.04, d.d - 0.06, '#3FB8AF', { at: [0, top - 0.08, 0], r: 0.02 });
  for (const s of [-1, 1]) {
    b.box(0.16, top - 0.1, d.d - 0.5, '#3FB8AF', { at: [s * (d.w / 2 - 0.55), (top - 0.1) / 2, 0], r: 0.06 });
    b.box(0.5, 0.06, d.d - 0.3, shade('#3FB8AF', -0.08), { at: [s * (d.w / 2 - 0.55), 0.03, 0], r: 0.03 });
  }
  b.puck(0.16, 0.03, '#3B4252', { at: [0, top + 0.012, 0], finish: 'plastic' });
  b.puck(0.1, 0.012, '#7FD8FF', { at: [0, top + 0.03, 0], glow: 1.2, cast: false });
}

/** Meeting chair: four-star base, plump seat, rounded shell back. Faces +Z. */
export function buildConferenceChair(b: Batch, color: string, d = CC): void {
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    b.box(0.05, 0.04, 0.3, '#3B4252', { at: [Math.sin(a) * 0.15, 0.06, Math.cos(a) * 0.15], rot: [0, a, 0], r: 0.018, finish: 'plastic' });
    b.ball(0.035, '#2B2F3A', { at: [Math.sin(a) * 0.28, 0.035, Math.cos(a) * 0.28] });
  }
  b.cyl(0.028, 0.028, d.seatH - 0.15, '#C8D0DC', { at: [0, (d.seatH - 0.15) / 2 + 0.08, 0], seg: 12, finish: 'plastic' });
  b.box(0.5, 0.1, 0.48, color, { at: [0, d.seatH - 0.05, 0.02], r: 0.05, finish: 'cloth' });
  b.box(0.48, 0.42, 0.08, color, { at: [0, d.seatH + 0.25, -0.24], rot: [-0.12, 0, 0], r: 0.04, finish: 'cloth' });
  b.box(0.52, 0.48, 0.05, shade(color, -0.12), { at: [0, d.seatH + 0.24, -0.29], rot: [-0.12, 0, 0], r: 0.025, finish: 'plastic' });
}

/** Flipchart easel (the pad is a separate textured plane). Faces +Z. */
export function buildFlipchart(b: Batch): void {
  const wood = '#C98F5A';
  for (const s of [-1, 1]) b.box(0.05, 1.7, 0.05, wood, { at: [s * 0.3, 0.85, 0.12], rot: [0.13, 0, s * -0.06], r: 0.02, finish: 'wood' });
  b.box(0.05, 1.6, 0.05, wood, { at: [0, 0.8, -0.28], rot: [-0.3, 0, 0], r: 0.02, finish: 'wood' });
  b.box(0.72, 0.9, 0.04, '#E8E2D5', { at: [0, 1.22, 0.01], rot: [-0.13, 0, 0], r: 0.02 });
  b.box(0.76, 0.06, 0.08, '#3B4252', { at: [0, 1.66, 0.07], rot: [-0.13, 0, 0], r: 0.02, finish: 'plastic' });
  b.box(0.7, 0.04, 0.08, wood, { at: [0, 0.76, 0.12], r: 0.015, finish: 'wood' });
  b.capsule(0.012, 0.09, '#E63946', { at: [-0.12, 0.8, 0.14], rot: [0, 0, Math.PI / 2], cast: false });
  b.capsule(0.012, 0.09, '#3D7CFF', { at: [0.08, 0.8, 0.14], rot: [0, 0, Math.PI / 2], cast: false });
}

/** A 2 m glass partition module's frame (the glass is a separate pane). Faces +Z. */
export function buildGlassPartition(b: Batch, d = GP): void {
  const frame = '#F4F1EA';
  b.box(d.w, 0.08, d.t, frame, { at: [0, 0.04, 0], r: 0.03, finish: 'plastic' });
  b.box(d.w, 0.06, d.t, frame, { at: [0, d.h - 0.03, 0], r: 0.025, finish: 'plastic' });
  for (const s of [-1, 1]) b.box(0.06, d.h, d.t, frame, { at: [s * (d.w / 2 - 0.03), d.h / 2, 0], r: 0.025, finish: 'plastic' });
  b.box(d.w - 0.12, 0.22, 0.03, '#BFEFEA', { at: [0, 1.15, 0], r: 0.01, finish: 'gloss', cast: false });
  b.box(d.w - 0.1, 0.04, d.t + 0.02, '#3FB8AF', { at: [0, 0.1, 0], r: 0.015 });
}

/** Cork board with rows of sticky notes. Origin at the wall, board centre at y = 0. */
export function buildStickyWall(b: Batch, d = D.stickyWall): void {
  b.box(d.w, d.h, 0.03, '#D4A373', { at: [0, 0, 0.02], r: 0.012, finish: 'matte' });
  b.box(d.w + 0.06, 0.05, 0.05, '#8D6E63', { at: [0, d.h / 2, 0.03], r: 0.02, finish: 'wood' });
  b.box(d.w + 0.06, 0.05, 0.05, '#8D6E63', { at: [0, -d.h / 2, 0.03], r: 0.02, finish: 'wood' });
  for (const s of [-1, 1]) b.box(0.05, d.h, 0.05, '#8D6E63', { at: [s * (d.w / 2 + 0.01), 0, 0.03], r: 0.02, finish: 'wood' });
  const notes = ['#FFE66D', '#9CF6C8', '#FFB3D1', '#A0D2FF', '#FFC48A'];
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 3 + (col % 2); row++) {
      const x = -d.w / 2 + 0.32 + col * 0.62 + ((row * 7) % 3) * 0.04;
      const y = d.h / 2 - 0.22 - row * 0.27;
      b.box(0.16, 0.16, 0.008, notes[(col * 3 + row) % notes.length], { at: [x, y, 0.04], rot: [0, 0, ((row + col) % 3) * 0.06 - 0.06], r: 0.004, cast: false });
    }
  }
  for (const x of [-0.31, 0.31]) b.box(0.02, d.h - 0.1, 0.012, '#8D6E63', { at: [x, 0, 0.037], r: 0.004, cast: false });
}

/** Snake plant: upright striped leaves in a cream pot. */
export function buildSnakePlant(b: Batch): void {
  b.cyl(0.15, 0.12, 0.3, '#F4ECDC', { at: [0, 0.15, 0], seg: 20, finish: 'plastic' });
  // Soil top 2 mm above the pot's top cap (0.30): coplanar faces z-fought.
  b.puck(0.13, 0.012, PALETTE.coffee, { at: [0, 0.296, 0], cast: false });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const h = 0.45 + (i % 3) * 0.12;
    b.ball([0.035, h / 2, 0.01], i % 2 ? '#3E8E4E' : '#5DAA5E', {
      at: [Math.cos(a) * 0.05, 0.3 + h / 2, Math.sin(a) * 0.05],
      rot: [Math.sin(a) * 0.15, -a, Math.cos(a) * 0.12],
    });
  }
}

function drawFlipchartPad(c: CanvasRenderingContext2D, w: number, h: number): void {
  c.fillStyle = '#FFFEFA';
  c.fillRect(0, 0, w, h);
  c.fillStyle = '#3D7CFF';
  c.font = font(700, 30);
  c.textAlign = 'center';
  c.fillText('Q4 GOALS', w / 2, 46);
  c.textAlign = 'left';
  c.font = font(600, 20);
  ['ship more', 'fewer bugs', 'less yak shaving', 'nap pods?'].forEach((t, i) => {
    c.fillStyle = i === 3 ? '#E63946' : '#2B2D42';
    c.fillText('• ' + t, 28, 96 + i * 34);
  });
  c.strokeStyle = '#2EC4B6';
  c.lineWidth = 5;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(30, 290);
  c.lineTo(90, 262);
  c.lineTo(140, 272);
  c.lineTo(220, 222);
  c.stroke();
  sparkle(c, 214, 70, 18, '#D97757', 0.3);
}

// ---------------------------------------------------------------------------------------------
// The live board (1280 × 720 canvas)

const GOOD = '#4ADE80';
const WARN = '#FFB020';
const BAD = '#FF5A5F';
/**
 * Screen brightness. White text stays under the bloom threshold (engine/post.ts), so the board
 * reads crisp instead of haloing; the dark background keeps it looking like a lit screen.
 */
const BOARD_HDR = 1.0;

function pctColor(p: number): string {
  return p >= 85 ? BAD : p >= 60 ? WARN : GOOD;
}

function duration(ms: number): string {
  if (ms <= 0) return 'now';
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  const hours = Math.floor(m / 60);
  if (hours < 48) return `${hours}h ${m % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function clock(now: number): string {
  const d = new Date(now);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

/** The wall screen is big and readable from across the office; past this it doesn't repaint. */
const BOARD_DISTANCE = 24;

class TeamBoard {
  readonly material: THREE.MeshBasicMaterial;
  private readonly tex: CanvasTex;
  private stats: TeamStats | null = null;
  private mesh: THREE.Mesh | null = null;
  /** New stats arrived since the last paint. */
  private stale = false;
  /** The clock-driven text on the canvas now (clock, "updated … ago", countdowns). */
  private shownTimes = '';
  private lastSecond = -1;

  constructor() {
    this.tex = new CanvasTex(1280, 720, (c, w, h) => this.draw(c, w, h), 8);
    this.material = new THREE.MeshBasicMaterial({ map: this.tex.tex, color: new THREE.Color(BOARD_HDR, BOARD_HDR, BOARD_HDR) });
  }

  attach(mesh: THREE.Mesh): void {
    this.mesh = mesh;
    mesh.geometry.computeBoundingSphere();
  }

  set(stats: TeamStats): void {
    this.stats = stats;
    this.stale = true;
  }

  /**
   * Repaint (re-uploading 1280×720 with mipmaps) only when new stats arrived or a clock-driven
   * text moved on (checked once a second), and only while the camera can see the screen.
   */
  update(view?: ScreenView): void {
    const now = Date.now();
    const second = Math.floor(now / 1000);
    if (!this.stale && second === this.lastSecond) return;
    this.lastSecond = second;
    const times = this.timeTexts(now);
    if (!this.stale && times === this.shownTimes) return;
    if (view && this.mesh && !inView(this.mesh, view, BOARD_DISTANCE)) return;
    this.stale = false;
    this.tex.redraw();
  }

  /** Everything on the board that changes with the clock alone, as one comparable string. */
  private timeTexts(now: number): string {
    const s = this.stats;
    const parts = [clock(now)];
    if (s?.plan.updatedAt) parts.push(ago(now - s.plan.updatedAt));
    for (const lim of s?.plan.limits.slice(0, 3) ?? []) parts.push(lim.resetsAt ? duration(lim.resetsAt - now) : '');
    return parts.join('|');
  }

  private draw(c: CanvasRenderingContext2D, w: number, h: number): void {
    const bg = c.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#1C2546');
    bg.addColorStop(1, '#2A3563');
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,0.035)';
    for (let y = 18; y < h; y += 36) for (let x = 18; x < w; x += 36) c.fillRect(x, y, 3, 3);

    // Header.
    sparkle(c, 58, 52, 26, PALETTE.claude, 0.2);
    c.fillStyle = '#FFFDF7';
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    c.font = font(700, 44);
    c.fillText('Team Room', 98, 54);
    const now = Date.now();
    this.shownTimes = this.timeTexts(now);
    c.textAlign = 'right';
    c.font = font(700, 40);
    c.fillText(clock(now), w - 40, 50);
    const s = this.stats;
    if (s?.plan.updatedAt) {
      c.fillStyle = 'rgba(255,253,247,0.55)';
      c.font = font(500, 20);
      c.fillText(`plan updated ${ago(now - s.plan.updatedAt)}`, w - 40, 86);
    }

    this.drawLimits(c, s, now);
    this.drawContext(c, s);
    this.drawTeam(c, s, w);
  }

  private panel(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, title: string): void {
    c.fillStyle = 'rgba(255,255,255,0.06)';
    c.beginPath();
    c.roundRect(x, y, w, h, 26);
    c.fill();
    c.fillStyle = 'rgba(255,253,247,0.7)';
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.font = font(600, 22);
    c.fillText(title, x + 24, y + 30);
  }

  private drawLimits(c: CanvasRenderingContext2D, s: TeamStats | null, now: number): void {
    const x0 = 40;
    const y0 = 110;
    const pw = 640;
    const ph = 340;
    this.panel(c, x0, y0, pw, ph, 'Plan usage');
    const limits = s?.plan.limits ?? [];
    if (!s || s.plan.updatedAt === null || limits.length === 0) {
      c.fillStyle = 'rgba(255,253,247,0.75)';
      c.textAlign = 'center';
      c.font = font(600, 28);
      c.fillText('Plan usage: waiting for a', x0 + pw / 2, y0 + ph / 2 - 6);
      c.fillText('Claude session to report', x0 + pw / 2, y0 + ph / 2 + 30);
      return;
    }
    const shown = limits.slice(0, 3);
    const slotW = pw / shown.length;
    shown.forEach((lim, i) => {
      const cx = x0 + slotW * (i + 0.5);
      const cy = y0 + 160;
      const r = Math.min(86, slotW * 0.36);
      const pct = Math.max(0, Math.min(100, lim.usedPct));
      const col = pctColor(pct);
      c.lineCap = 'round';
      c.lineWidth = 24;
      c.strokeStyle = 'rgba(255,255,255,0.12)';
      c.beginPath();
      c.arc(cx, cy, r, 0, Math.PI * 2);
      c.stroke();
      c.strokeStyle = col;
      c.beginPath();
      c.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * pct) / 100);
      c.stroke();
      c.fillStyle = '#FFFDF7';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = font(700, 44);
      c.fillText(`${Math.round(pct)}%`, cx, cy + 2);
      c.font = font(700, 26);
      c.fillStyle = col;
      fitText(c, lim.label, 700, 26, slotW - 20, 14);
      c.fillText(lim.label, cx, cy + r + 40);
      c.fillStyle = 'rgba(255,253,247,0.6)';
      c.font = font(500, 19);
      c.fillText(lim.resetsAt ? `resets in ${duration(lim.resetsAt - now)}` : ' ', cx, cy + r + 70);
    });
  }

  private drawContext(c: CanvasRenderingContext2D, s: TeamStats | null): void {
    const x0 = 700;
    const y0 = 110;
    const pw = 540;
    const ph = 340;
    this.panel(c, x0, y0, pw, ph, 'Context windows');
    const rows = [...(s?.context ?? [])].sort((a, b) => b.pct - a.pct);
    if (rows.length === 0) {
      c.fillStyle = 'rgba(255,253,247,0.55)';
      c.textAlign = 'center';
      c.font = font(500, 24);
      c.fillText('nobody at their desk yet', x0 + pw / 2, y0 + ph / 2 + 10);
      return;
    }
    const shown = rows.slice(0, 8);
    const rowH = 34;
    shown.forEach((row, i) => {
      const y = y0 + 72 + i * rowH;
      const pct = Math.max(0, Math.min(100, row.pct));
      c.textBaseline = 'middle';
      c.textAlign = 'left';
      c.fillStyle = '#FFFDF7';
      c.font = font(600, 21);
      c.fillText(ellipsize(c, row.displayName, 128), x0 + 24, y);
      const bx = x0 + 160;
      const bw = pw - 160 - 90;
      c.fillStyle = 'rgba(255,255,255,0.12)';
      c.beginPath();
      c.roundRect(bx, y - 9, bw, 18, 9);
      c.fill();
      c.fillStyle = pctColor(pct);
      c.beginPath();
      c.roundRect(bx, y - 9, Math.max(18, (bw * pct) / 100), 18, 9);
      c.fill();
      c.textAlign = 'right';
      c.fillStyle = 'rgba(255,253,247,0.85)';
      c.font = font(700, 21);
      c.fillText(`${Math.round(pct)}%`, x0 + pw - 24, y);
    });
    if (rows.length > shown.length) {
      c.textAlign = 'center';
      c.fillStyle = 'rgba(255,253,247,0.5)';
      c.font = font(500, 18);
      c.fillText(`+${rows.length - shown.length} more`, x0 + pw / 2, y0 + ph - 18);
    }
  }

  private drawTeam(c: CanvasRenderingContext2D, s: TeamStats | null, w: number): void {
    const t = s?.team;
    const tiles: [string, string, string][] = [
      ['Staff', t ? String(t.staff) : '–', '#FFFDF7'],
      ['Working', t ? String(t.working) : '–', GOOD],
      ['Need you', t ? String(t.needsYou) : '–', WARN],
      ['Interns', t ? String(t.interns) : '–', '#C3A6FF'],
      ['Commits today', t ? String(t.commitsToday) : '–', '#7FD8FF'],
      ['Lines', t ? `+${compact(t.linesAdded)} / −${compact(t.linesRemoved)}` : '–', '#FFD166'],
      ['Session costs', t ? `$${t.costUSD.toFixed(2)}` : '–', '#FF9DCB'],
    ];
    const y0 = 474;
    const gap = 14;
    const tw = (w - 80 - gap * (tiles.length - 1)) / tiles.length;
    tiles.forEach(([label, value, color], i) => {
      const x = 40 + i * (tw + gap);
      c.fillStyle = 'rgba(255,255,255,0.07)';
      c.beginPath();
      c.roundRect(x, y0, tw, 206, 24);
      c.fill();
      c.fillStyle = color;
      c.beginPath();
      c.arc(x + tw / 2, y0 + 40, 10, 0, Math.PI * 2);
      c.fill();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillStyle = '#FFFDF7';
      fitText(c, value, 700, 52, tw - 20, 18);
      c.fillText(value, x + tw / 2, y0 + 112);
      c.fillStyle = 'rgba(255,253,247,0.62)';
      fitText(c, label, 600, 21, tw - 16, 12);
      c.fillText(label, x + tw / 2, y0 + 168);
    });
  }
}

function compact(n: number): string {
  return n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
