import type * as THREE from 'three';
import type { AABB, Interactable } from './types';
import type { Fader } from './fader';
import type { Blobs } from './blobs';
import type { Batch } from './kit';

export type WallSide = 'north' | 'south' | 'east' | 'west';

/** Shared state the world builders write into. */
export interface WorldCtx {
  root: THREE.Group;
  colliders: AABB[];
  interactables: Interactable[];
  fader: Fader;
  blobs: Blobs;
  /** Static furniture that never moves or fades, merged into a handful of meshes at the end. */
  statics: Batch;
  /** Per-frame animation hooks. */
  tickers: ((dt: number, elapsed: number) => void)[];
  /** Invisible proxies the camera must not pass through (walls, partitions, ceiling, roof). */
  cameraBlockers: THREE.Object3D[];
}

export function aabb(minX: number, maxX: number, minZ: number, maxZ: number): AABB {
  return { minX, maxX, minZ, maxZ };
}

/** AABB of a w × d footprint centred at (x, z), rotated by a multiple of 90°. */
export function footprint(x: number, z: number, w: number, d: number, quarterTurns = 0): AABB {
  const swap = Math.abs(quarterTurns) % 2 === 1;
  const hw = (swap ? d : w) / 2;
  const hd = (swap ? w : d) / 2;
  return { minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd };
}
