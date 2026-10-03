// Contract between the world (building, furniture, lighting, navigation) and the
// gameplay layer (characters, camera, UI). World code lives in client/src/world and
// client/src/engine; gameplay code lives in client/src/chars, client/src/ui and main.ts.
//
// Conventions
// - 1 unit = 1 metre. +Y is up. The floor is y = 0.
// - Yaw: rotation about +Y. A character with yaw θ faces direction (sin θ, 0, cos θ).
//   yaw 0 faces +Z (toward the entrance on the south wall).
// - All positions are world space.

import type * as THREE from 'three';
import type { TeamStats } from '../../../shared/protocol';

export interface Engine {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Render one frame (post-processing included, if any). */
  render(): void;
  /** Call on window resize. */
  resize(): void;
}

/** Axis-aligned box on the XZ plane, used for collisions. */
export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** What a desk monitor shows. */
export type ScreenState = 'off' | 'idle' | 'working' | 'alert' | 'sleeping';

/** Ordinary office work on a regular's monitor (chars/regulars.ts): never a terminal. */
export type OfficeApp = 'sheet' | 'mail' | 'slides' | 'doc' | 'chart' | 'calendar';

export interface DeskSlot {
  index: number;
  /** Seat point: where a seated character's pelvis goes (chair seat centre, y = seat height). */
  seat: THREE.Vector3;
  /** Yaw a seated character faces (toward their monitor). */
  yaw: number;
  /** Walkable floor point (y = 0) next to the chair where a character stands before sitting / after standing. */
  approach: THREE.Vector3;
  /** @deprecated Interns now work at the intern desk (World.internSlots), not around their boss's desk. */
  internSpots: THREE.Vector3[];
  /** The chair group. Gameplay slides it along its local +Z (away from the desk) by up to 0.45 m when someone sits or stands. */
  chair: THREE.Object3D;
  /** The monitor's screen mesh (UI grows the terminal bezel out of it; camera frames it for the sit-down). */
  screen: THREE.Object3D;
  /**
   * Monitor content. `lines` = real terminal text (hosted sessions) to draw small on the screen.
   * `app` (regulars, 'working' only): paint that office app instead, `lines[0]` as its title.
   */
  setScreen(state: ScreenState, lines?: string[], app?: OfficeApp): void;
  /** Desk nameplate. Pass '' to show the desk as vacant. */
  setNameplate(name: string, subtitle?: string): void;
  /** Accent colour of this desk (hex string from PALETTE.deskAccents). */
  accent: string;
}

/** One station at the long intern desk: where a subagent sits while it works. */
export interface InternSlot {
  index: number;
  /** Stool seat point (pelvis position for a 0.7-scale intern). */
  seat: THREE.Vector3;
  /** Yaw a seated intern faces (toward their little monitor). */
  yaw: number;
  /** Walkable floor point next to the stool. */
  approach: THREE.Vector3;
  /** The station's small monitor. */
  setScreen(state: ScreenState, lines?: string[]): void;
  /** Little station label: intern type and who they work for. '' = free. */
  setLabel(name: string, subtitle?: string): void;
}

export type InteractableKind = 'reception' | 'archive' | 'whiteboard' | 'coffee' | 'desk' | 'teamboard' | 'interns' | 'laptop';

export interface Interactable {
  /** Unique id: 'reception', 'archive', 'whiteboard', 'coffee', or `desk:<index>`. */
  id: string;
  kind: InteractableKind;
  /** Anchor point for the "[E] …" prompt (roughly head height above the object). */
  position: THREE.Vector3;
  /** The manager must be within this XZ distance of `position` to interact. */
  radius: number;
  /** Default prompt text, e.g. "Hire someone". Gameplay may override for desks. */
  label: string;
  deskIndex?: number;
}

/** The manager's laptop on the boss desk: Spotify (#28). Interactable `{ id: 'laptop', kind: 'laptop' }`. */
export interface Laptop {
  /** Walkable floor point (y = 0) behind the boss chair, where you stand to use it. */
  stand: THREE.Vector3;
  /** The way you face there (toward the desk). */
  yaw: number;
  /** Where its screen is (invisible, screen-sized): the camera frames it, the app grows out of it. */
  screen: THREE.Object3D;
  /** Draw on its screen (a 256 × 160 canvas). null puts the usual dashboard back. */
  paint(draw: ((ctx: CanvasRenderingContext2D, w: number, h: number) => void) | null): void;
}

export interface OfficeStats {
  staff: number;
  working: number;
  needsYou: number;
  idle: number;
  interns: number;
}

/** Where someone on their break can sit or lie down in the garden (#48). */
export type YardSeatKind = 'bench' | 'picnic' | 'blanket' | 'lounger' | 'hammock' | 'pond';

export interface YardSeat {
  kind: YardSeatKind;
  /** Pelvis point: y = seat height; about 0.1 sitting on the blanket or the pond's edge; lying, the pelvis joint. */
  position: THREE.Vector3;
  /** The way a seated person faces; lying down (lounger, hammock), the way their feet point. */
  yaw: number;
  /** Walkable floor point (y = 0) to walk to before sitting down, and to stand up onto. */
  approach: THREE.Vector3;
  /** 'ground' is cross-legged on the blanket or at the pond's edge. */
  pose: 'sit' | 'lie' | 'ground';
  /** The hammock's swinging bed: while lying in it, follow this object's world matrix. */
  carrier?: THREE.Object3D;
  /** Seats and stands sharing a group belong together (a bench, the picnic table, the blanket, the pond's edge). */
  group?: string;
  /** Under or beside the string lights, where the night owls sit after 21:00. */
  lit?: boolean;
}

export interface YardStand {
  /** Floor point (y = 0) just off the trail. */
  position: THREE.Vector3;
  /** The way to face: at a view, the pond, or the other stand in the group. */
  yaw: number;
  group?: string;
  lit?: boolean;
}

/** The garden's break spots (#48). */
export interface Yard {
  /**
   * The paved trail: a closed loop of walkable floor points (y = 0) about 1 m apart; the last
   * joins the first. Every step from one point to the next is clear of colliders by 0.3 m, so
   * walk it point to point, either way round.
   */
  trail: THREE.Vector3[];
  /** Width of the trail's paving (m). */
  trailWidth: number;
  seats: YardSeat[];
  stands: YardStand[];
  /** Floor point just inside the garden gate, where people out on a break come and go. */
  gate: THREE.Vector3;
}

export interface World {
  root: THREE.Group;
  /** All desks, index = position in this array. */
  desks: DeskSlot[];
  /** `outside`: where new hires appear (beyond the door). `inside`: first floor point past the door. */
  entrance: { outside: THREE.Vector3; inside: THREE.Vector3 };
  managerStart: { position: THREE.Vector3; yaw: number };
  interactables: Interactable[];
  /** Static colliders (walls, furniture). The door opening is not blocked. */
  colliders: AABB[];
  /**
   * The building is enclosed (walls + ceiling + roof). Meshes the camera must never pass
   * through: exterior and interior walls, ceiling, roof. The camera raycasts against these.
   */
  cameraBlockers: THREE.Object3D[];
  /**
   * Interior volume of the building (floor at y = 0). `ceilingY` is the highest the camera
   * should go indoors: just under the ceiling beams, below the ceiling itself.
   */
  interior: { minX: number; maxX: number; minZ: number; maxZ: number; ceilingY: number };
  /** True if a point is inside the building (used to keep the camera on the manager's side of the walls). */
  isInside(p: THREE.Vector3): boolean;
  /**
   * The front desk's receptionist spot (a permanent NPC): `seat` is the pelvis point on the
   * stool behind the counter, `yaw` faces the visitors, `approach` is the walkable floor point
   * just behind the stool to walk to before sitting.
   */
  reception: { seat: THREE.Vector3; yaw: number; approach: THREE.Vector3 };
  /** A* over the walkable floor. Returns smoothed floor points (y = 0) from `from` to `to`, or null if unreachable. */
  findPath(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] | null;
  /** Per-frame animation (door, screens, clock, plants swaying…). */
  update(dt: number, elapsed: number): void;
  /**
   * Fade tall props (plants, shelves, partitions, lamps, signs) that sit between the camera and
   * `target` (the manager). Walls never fade: the camera stays inside them (cameraBlockers).
   */
  updateOcclusion(camera: THREE.Camera, target: THREE.Vector3): void;
  /** Animate the entrance door open/closed. Gameplay keeps it open while anyone is within ~2.5 m of it. */
  setDoorOpen(open: boolean): void;
  /** Live numbers drawn on the whiteboard. */
  setStats(stats: OfficeStats): void;
  /**
   * Team Room wall display: plan usage gauges (5-hour, weekly, any extra limits) with reset
   * countdowns, team numbers, and a context-fill bar per employee. Called on every 'stats'
   * message; the world repaints it while it's in view (countdowns tick once a second).
   */
  setTeamBoard(stats: TeamStats): void;
  /** Add desks until at least `n` exist (overflow pods). Returns the new desk count. */
  ensureDesks(n: number): number;
  /**
   * The intern desk: one long bench of small computer stations (≥ 12 to start) where every
   * subagent works, wherever its boss sits. Interactable `{ id: 'interns', kind: 'interns' }`.
   */
  internSlots: InternSlot[];
  /** Add stations (extend the bench or add a second one) until at least `n` exist. Returns the count. */
  ensureInternSlots(n: number): number;
  /** The garden's break spots (#48): the trail loop, seats, stands and the gate. */
  yard: Yard;
  /** The manager's laptop (#28). */
  laptop?: Laptop;
}
