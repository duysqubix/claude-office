// Circle-vs-AABB and circle-vs-circle on the XZ plane.
import type * as THREE from 'three';
import type { AABB } from '../world/types';

/** Push a circle at `p` (radius r) out of a box. Returns true if it touched. */
export function pushOutOfBox(p: THREE.Vector3, r: number, b: AABB): boolean {
  const cx = Math.min(Math.max(p.x, b.minX), b.maxX);
  const cz = Math.min(Math.max(p.z, b.minZ), b.maxZ);
  const dx = p.x - cx;
  const dz = p.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    p.x = cx + (dx / d) * r;
    p.z = cz + (dz / d) * r;
    return true;
  }
  // Centre inside the box: leave by the shallowest side.
  const left = p.x - b.minX;
  const right = b.maxX - p.x;
  const back = p.z - b.minZ;
  const front = b.maxZ - p.z;
  const m = Math.min(left, right, back, front);
  if (m === left) p.x = b.minX - r;
  else if (m === right) p.x = b.maxX + r;
  else if (m === back) p.z = b.minZ - r;
  else p.z = b.maxZ + r;
  return true;
}

export function pushOutOfBoxes(p: THREE.Vector3, r: number, boxes: readonly AABB[]): boolean {
  let hit = false;
  for (let pass = 0; pass < 2; pass++) {
    for (const b of boxes) {
      if (p.x + r < b.minX || p.x - r > b.maxX || p.z + r < b.minZ || p.z - r > b.maxZ) continue;
      if (pushOutOfBox(p, r, b)) hit = true;
    }
  }
  return hit;
}

/** Push `p` out of a circle at (x, z). Returns penetration depth (0 if apart). */
export function pushOutOfCircle(p: THREE.Vector3, r: number, x: number, z: number, cr: number): number {
  const dx = p.x - x;
  const dz = p.z - z;
  const min = r + cr;
  const d2 = dx * dx + dz * dz;
  if (d2 >= min * min) return 0;
  const d = Math.sqrt(d2) || 1e-4;
  const nx = d2 > 1e-10 ? dx / d : 1;
  const nz = d2 > 1e-10 ? dz / d : 0;
  p.x = x + nx * min;
  p.z = z + nz * min;
  return min - d;
}
