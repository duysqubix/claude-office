// Where everything goes. 1 unit = 1 m, +Y up, +Z = south (the entrance), +X = east.
//
//   z=-10 ┌──────────────────────────────────────────────────────┐
//         │ break area (NW)        whiteboard        manager (NE) │
//         │   pod   pod     ── central boulevard ──    pod   pod   │
//         │   pod   pod                                pod   pod   │
//         │   lounge (SW)          [door]       reception (SE)    │
//   z=+10 └───────────────────[ glass doors ]────────────────────┘
//        x=-14                     x=0                          x=14

export const OFFICE = {
  halfW: 14,
  halfD: 10,
  wallH: 2.6,
  wallT: 0.3,
  /** Half-width of the entrance opening in the south wall. */
  doorHalf: 1.5,
  doorH: 2.25,
} as const;

/** The walkable world (office + garden), bounded by a hedge. */
export const NAV_BOUNDS = { minX: -25, maxX: 25, minZ: -16, maxZ: 28 } as const;
export const NAV_CELL = 0.25;
export const AGENT_RADIUS = 0.3;

export const DESK = {
  /** Desk spacing along a pod row, and the desk-top width (a small gap between neighbours). */
  pitch: 1.5,
  width: 1.44,
  depth: 0.7,
  /** Height of the desk-top surface. */
  top: 0.7,
  /** Height of the chair seat cushion = seated pelvis height. */
  seatH: 0.45,
  /** Distance from the desk's front edge to the seated pelvis. */
  seatGap: 0.48,
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

export const ENTRANCE = {
  outside: { x: 0, z: 14.4 },
  inside: { x: 0, z: 8.6 },
} as const;

export const MANAGER_START = { x: 0, z: 2.0, yaw: Math.PI } as const;
