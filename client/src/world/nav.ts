// Grid A* over the walkable floor. Cells are blocked when their centre lies inside a collider
// grown by the agent radius; paths are then string-pulled with exact segment-vs-box tests so
// characters walk in straight lines wherever they can.
import * as THREE from 'three';
import type { AABB } from './types';

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface P2 {
  x: number;
  z: number;
}

const DIRS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

export class NavGrid {
  readonly cols: number;
  readonly rows: number;
  readonly blocked: Uint8Array;
  private readonly g: Float64Array;
  private readonly parent: Int32Array;
  private readonly seen: Uint32Array;
  private readonly closed: Uint32Array;
  private search = 0;
  /** Colliders grown by (radius - epsilon), packed as minX, maxX, minZ, maxZ. */
  private padded = new Float64Array(0);
  private raw: readonly AABB[] = [];

  constructor(
    readonly bounds: Rect,
    readonly cell: number,
    readonly radius: number,
  ) {
    this.cols = Math.round((bounds.maxX - bounds.minX) / cell);
    this.rows = Math.round((bounds.maxZ - bounds.minZ) / cell);
    const n = this.cols * this.rows;
    this.blocked = new Uint8Array(n);
    this.g = new Float64Array(n);
    this.parent = new Int32Array(n);
    this.seen = new Uint32Array(n);
    this.closed = new Uint32Array(n);
  }

  rebuild(colliders: readonly AABB[]): void {
    const { cols, rows, cell, radius: r, blocked } = this;
    const { minX, minZ } = this.bounds;
    this.raw = colliders;
    blocked.fill(0);
    for (let i = 0; i < cols; i++) {
      blocked[i] = 1;
      blocked[(rows - 1) * cols + i] = 1;
    }
    for (let j = 0; j < rows; j++) {
      blocked[j * cols] = 1;
      blocked[j * cols + cols - 1] = 1;
    }
    const pad = r - 0.01;
    this.padded = new Float64Array(colliders.length * 4);
    colliders.forEach((b, k) => {
      this.padded[k * 4] = b.minX - pad;
      this.padded[k * 4 + 1] = b.maxX + pad;
      this.padded[k * 4 + 2] = b.minZ - pad;
      this.padded[k * 4 + 3] = b.maxZ + pad;
      const i0 = Math.max(0, Math.ceil((b.minX - r - minX) / cell - 0.5));
      const i1 = Math.min(cols - 1, Math.floor((b.maxX + r - minX) / cell - 0.5));
      const j0 = Math.max(0, Math.ceil((b.minZ - r - minZ) / cell - 0.5));
      const j1 = Math.min(rows - 1, Math.floor((b.maxZ + r - minZ) / cell - 0.5));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) blocked[j * cols + i] = 1;
    });
  }

  cellAt(x: number, z: number): number {
    const i = Math.floor((x - this.bounds.minX) / this.cell);
    const j = Math.floor((z - this.bounds.minZ) / this.cell);
    if (i < 0 || j < 0 || i >= this.cols || j >= this.rows) return -1;
    return j * this.cols + i;
  }

  centerOf(c: number): P2 {
    const i = c % this.cols;
    const j = (c / this.cols) | 0;
    return { x: this.bounds.minX + (i + 0.5) * this.cell, z: this.bounds.minZ + (j + 0.5) * this.cell };
  }

  isWalkable(x: number, z: number): boolean {
    const c = this.cellAt(x, z);
    return c >= 0 && this.blocked[c] === 0;
  }

  /** True if (x, z) is inside an actual (un-grown) collider. */
  insideCollider(x: number, z: number): boolean {
    return this.raw.some((b) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ);
  }

  /** Nearest walkable cell to (x, z) within `maxDist` metres, or -1. */
  nearestFree(x: number, z: number, maxDist = 3): number {
    const c = this.cellAt(x, z);
    if (c >= 0 && this.blocked[c] === 0) return c;
    const ci = Math.floor((x - this.bounds.minX) / this.cell);
    const cj = Math.floor((z - this.bounds.minZ) / this.cell);
    const maxRing = Math.ceil(maxDist / this.cell);
    let best = -1;
    let bestD = Infinity;
    let foundRing = -1;
    for (let ring = 1; ring <= maxRing; ring++) {
      for (let dj = -ring; dj <= ring; dj++) {
        for (let di = -ring; di <= ring; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== ring) continue;
          const i = ci + di;
          const j = cj + dj;
          if (i < 0 || j < 0 || i >= this.cols || j >= this.rows) continue;
          const k = j * this.cols + i;
          if (this.blocked[k]) continue;
          const p = this.centerOf(k);
          const d = (p.x - x) ** 2 + (p.z - z) ** 2;
          if (d < bestD) {
            bestD = d;
            best = k;
          }
        }
      }
      // A closer cell can still hide one ring further out (diagonal vs straight), then stop.
      if (best >= 0) {
        if (foundRing < 0) foundRing = ring;
        else break;
      }
    }
    return best;
  }

  /** Straight walk from a to b keeps at least the agent radius from every collider. */
  clear(ax: number, az: number, bx: number, bz: number): boolean {
    const { minX, maxX, minZ, maxZ } = this.bounds;
    const m = this.cell;
    if (Math.min(ax, bx) < minX + m || Math.max(ax, bx) > maxX - m) return false;
    if (Math.min(az, bz) < minZ + m || Math.max(az, bz) > maxZ - m) return false;
    const p = this.padded;
    for (let k = 0; k < p.length; k += 4) {
      if (segmentHitsBox(ax, az, bx, bz, p[k], p[k + 1], p[k + 2], p[k + 3])) return false;
    }
    return true;
  }

  findPath(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] | null {
    const s = this.nearestFree(from.x, from.z);
    const t = this.nearestFree(to.x, to.z);
    if (s < 0 || t < 0) return null;
    const fromFree = this.cellAt(from.x, from.z) === s;
    const toFree = this.cellAt(to.x, to.z) === t;
    const sp: P2 = fromFree ? { x: from.x, z: from.z } : this.centerOf(s);
    const tp: P2 = toFree ? { x: to.x, z: to.z } : this.centerOf(t);

    let pts: P2[];
    if (s === t || this.clear(sp.x, sp.z, tp.x, tp.z)) {
      pts = [sp, tp];
    } else {
      const cells = this.astar(s, t);
      if (!cells) return null;
      const raw = cells.map((c) => this.centerOf(c));
      raw[0] = sp;
      raw[raw.length - 1] = tp;
      pts = this.smooth(raw);
    }

    const out: THREE.Vector3[] = [new THREE.Vector3(from.x, 0, from.z)];
    const push = (p: P2) => {
      const last = out[out.length - 1];
      if (Math.abs(last.x - p.x) > 1e-4 || Math.abs(last.z - p.z) > 1e-4) out.push(new THREE.Vector3(p.x, 0, p.z));
    };
    for (const p of pts) push(p);
    // A goal tucked against furniture is fine to finish on; one inside furniture is not.
    if (!toFree && !this.insideCollider(to.x, to.z)) push({ x: to.x, z: to.z });
    if (out.length === 1) out.push(new THREE.Vector3(to.x, 0, to.z));
    return out;
  }

  private astar(s: number, t: number): number[] | null {
    const gen = ++this.search;
    const { cols, rows, blocked, g, parent, seen, closed } = this;
    const tx = t % cols;
    const tz = (t / cols) | 0;
    const h = (c: number) => {
      const dx = Math.abs((c % cols) - tx);
      const dz = Math.abs(((c / cols) | 0) - tz);
      return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz);
    };
    const heap = new MinHeap();
    g[s] = 0;
    seen[s] = gen;
    parent[s] = -1;
    heap.push(s, h(s));
    while (heap.size > 0) {
      const c = heap.pop();
      if (closed[c] === gen) continue;
      closed[c] = gen;
      if (c === t) {
        const path: number[] = [];
        for (let k = c; k !== -1; k = parent[k]) path.push(k);
        return path.reverse();
      }
      const ci = c % cols;
      const cj = (c / cols) | 0;
      for (const [di, dj, cost] of DIRS) {
        const ni = ci + di;
        const nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
        const n = nj * cols + ni;
        if (blocked[n] || closed[n] === gen) continue;
        // No corner cutting: both orthogonal neighbours of a diagonal step must be free.
        if (di !== 0 && dj !== 0 && (blocked[cj * cols + ni] || blocked[nj * cols + ci])) continue;
        const ng = g[c] + cost;
        if (seen[n] !== gen || ng < g[n]) {
          seen[n] = gen;
          g[n] = ng;
          parent[n] = c;
          heap.push(n, ng + h(n));
        }
      }
    }
    return null;
  }

  /** Greedy string pulling: from each anchor, jump to the farthest point still in plain sight. */
  private smooth(p: P2[]): P2[] {
    const out = [p[0]];
    let a = 0;
    while (a < p.length - 1) {
      let b = a + 1;
      while (b + 1 < p.length && this.clear(p[a].x, p[a].z, p[b + 1].x, p[b + 1].z)) b++;
      out.push(p[b]);
      a = b;
    }
    return out;
  }
}

function segmentHitsBox(ax: number, az: number, bx: number, bz: number, x0: number, x1: number, z0: number, z1: number): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dz = bz - az;
  if (Math.abs(dx) < 1e-12) {
    if (ax <= x0 || ax >= x1) return false;
  } else {
    let u = (x0 - ax) / dx;
    let v = (x1 - ax) / dx;
    if (u > v) [u, v] = [v, u];
    if (u > t0) t0 = u;
    if (v < t1) t1 = v;
    if (t0 >= t1) return false;
  }
  if (Math.abs(dz) < 1e-12) {
    if (az <= z0 || az >= z1) return false;
  } else {
    let u = (z0 - az) / dz;
    let v = (z1 - az) / dz;
    if (u > v) [u, v] = [v, u];
    if (u > t0) t0 = u;
    if (v < t1) t1 = v;
    if (t0 >= t1) return false;
  }
  return true;
}

class MinHeap {
  private nodes: number[] = [];
  private keys: number[] = [];

  get size(): number {
    return this.nodes.length;
  }

  push(node: number, key: number): void {
    const { nodes, keys } = this;
    let i = nodes.length;
    nodes.push(node);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      nodes[i] = nodes[p];
      keys[i] = keys[p];
      i = p;
    }
    nodes[i] = node;
    keys[i] = key;
  }

  pop(): number {
    const { nodes, keys } = this;
    const top = nodes[0];
    const lastNode = nodes.pop()!;
    const lastKey = keys.pop()!;
    const n = nodes.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && keys[r] < keys[l] ? r : l;
        if (keys[c] >= lastKey) break;
        nodes[i] = nodes[c];
        keys[i] = keys[c];
        i = c;
      }
      nodes[i] = lastNode;
      keys[i] = lastKey;
    }
    return top;
  }
}
