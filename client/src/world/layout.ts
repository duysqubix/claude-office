// Where everything goes. 1 unit = 1 m, +Y up, +Z = south (the entrance), +X = east.
// Sizes come from dimensions.json (shared with the Blender pipeline); positions live here.
//
//   z=-10 ┌──────────────────────────────────────────────────────┐
//         │ break area (NW)  whiteboard [TEAM ROOM]   manager (NE) │
//         │   pod   pod     ── central boulevard ──    pod   pod   │
//         │   pod   pod                                pod   pod   │
//         │   intern bench (SW)    [door]  reception + waiting (SE)│
//   z=+10 └───────────────────[ glass doors ]────────────────────┘
//        x=-14                     x=0                          x=14
import D from './dimensions.json';

export const OFFICE = {
  halfW: D.building.halfW,
  halfD: D.building.halfD,
  wallH: D.building.wallH,
  wallT: D.building.wallT,
  /** Half-width of the entrance opening in the south wall. */
  doorHalf: D.door.w / 2,
  doorH: D.door.h,
} as const;

/** The walkable world (office + garden), bounded by a hedge. */
export const NAV_BOUNDS = { minX: -25, maxX: 25, minZ: -16, maxZ: 28 } as const;
export const NAV_CELL = 0.25;
export const AGENT_RADIUS = 0.3;

export const DESK = {
  /** Desk spacing along a pod row, and the desk-top width (a small gap between neighbours). */
  pitch: D.desk.pitch,
  width: D.desk.w,
  depth: D.desk.d,
  /** Height of the desk-top surface. */
  top: D.desk.h,
  /** Height of the chair seat cushion = seated pelvis height. */
  seatH: D.chair.seatH,
  /** Distance from the desk's front edge to the seated pelvis. */
  seatGap: D.chair.deskGap,
} as const;

export interface PodSlot {
  x: number;
  z: number;
  outdoor?: boolean;
}

/**
 * Pod centres in fill order: four pods either side of the central boulevard, the outer
 * columns next, then (when the office is full) garden desks on the lawn.
 */
export const POD_SLOTS: readonly PodSlot[] = [
  { x: -4.6, z: -2.6 },
  { x: 4.6, z: -2.6 },
  { x: -4.6, z: 2.8 },
  { x: 4.6, z: 2.8 },
  { x: -9.6, z: -2.6 },
  { x: 9.6, z: -2.6 },
  { x: -9.6, z: 2.8 },
  { x: 9.6, z: 2.8 },
  { x: -7, z: 15.2, outdoor: true },
  { x: 7, z: 15.2, outdoor: true },
  { x: -12.2, z: 15.2, outdoor: true },
  { x: 12.2, z: 15.2, outdoor: true },
  { x: -7, z: 21, outdoor: true },
  { x: 7, z: 21, outdoor: true },
  { x: -12.2, z: 21, outdoor: true },
  { x: 12.2, z: 21, outdoor: true },
  { x: -17.4, z: 15.2, outdoor: true },
  { x: 17.4, z: 15.2, outdoor: true },
  { x: -17.4, z: 21, outdoor: true },
  { x: 17.4, z: 21, outdoor: true },
  { x: -19.6, z: 2, outdoor: true },
  { x: 19.6, z: 2, outdoor: true },
  { x: -19.6, z: -5, outdoor: true },
  { x: 19.6, z: -5, outdoor: true },
];

export interface BenchSlot {
  /** West end of the bench; it grows toward +X one module pair at a time. */
  x0: number;
  /** Centre line between the two rows of stations. */
  z: number;
  /** Module pairs (2 stations a side each) this spot has room for. */
  maxPairs: number;
  outdoor?: boolean;
}

/** Intern benches in fill order: the indoor one starts with 3 module pairs (12 stations). */
export const INTERN_BENCHES: readonly BenchSlot[] = [
  { x0: -11.2, z: 7.6, maxPairs: 5 },
  { x0: -22.2, z: 8.3, maxPairs: 3, outdoor: true },
  { x0: 17.4, z: 8.3, maxPairs: 3, outdoor: true },
];
export const INITIAL_BENCH_PAIRS = 3;

/** Team Room: wall screen centred on the north wall, meeting table in front of it. */
export const TEAM_ROOM = { x: 0, tableZ: -6.9, partitionX: 2.35, partitionZ1: -6.0 } as const;

export const ENTRANCE = {
  outside: { x: 0, z: 14.4 },
  inside: { x: 0, z: 8.6 },
} as const;

export const MANAGER_START = { x: 0, z: 2.0, yaw: Math.PI } as const;
