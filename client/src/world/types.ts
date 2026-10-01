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
  /** Monitor content. `lines` = real terminal text (hosted sessions) to draw small on the screen. */
  setScreen(state: ScreenState, lines?: string[]): void;
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

export type InteractableKind = 'reception' | 'archive' | 'whiteboard' | 'coffee' | 'desk' | 'teamboard' | 'interns';

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

export interface OfficeStats {
  staff: number;
  working: number;
  needsYou: number;
  idle: number;
  interns: number;
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
  /** Interior volume of the building (floor at y = 0). */
  interior: { minX: number; maxX: number; minZ: number; maxZ: number; ceilingY: number };
  /** True if a point is inside the building (used to keep the camera on the manager's side of the walls). */
  isInside(p: THREE.Vector3): boolean;
  /** A* over the walkable floor. Returns smoothed floor points (y = 0) from `from` to `to`, or null if unreachable. */
  findPath(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] | null;
  /** Per-frame animation (door, screens, clock, plants swaying…). */
  update(dt: number, elapsed: number): void;
  /** Fade walls and tall props that sit between the camera and `target` (the manager). */
  updateOcclusion(camera: THREE.Camera, target: THREE.Vector3): void;
  /** Animate the entrance door open/closed. Gameplay keeps it open while anyone is within ~2.5 m of it. */
  setDoorOpen(open: boolean): void;
  /** Live numbers drawn on the whiteboard. */
  setStats(stats: OfficeStats): void;
  /**
   * Team Room wall display: plan usage gauges (5-hour, weekly, any extra limits) with reset
   * countdowns, team numbers, and a context-fill bar per employee. Called on every 'stats'
   * message; the world redraws it (and ticks the countdowns once a second).
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
}
