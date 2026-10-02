// Cutting holes in kit meshes at load time, for fixes the GLB can't wait for.
import * as THREE from 'three';

const component = (a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number, c: number): number =>
  c === 0 ? a.getX(i) : c === 1 ? a.getY(i) : c === 2 ? a.getZ(i) : a.getW(i);

/**
 * A copy of `geometry` with everything where `field(x, y, z) > 0` (object space) cut away.
 * Triangles that straddle the boundary are clipped along it, with every attribute
 * interpolated on the cut edges, so the edge follows the field's zero contour rather than the
 * triangulation. Single-material geometry only (groups are dropped).
 */
export function cutAway(geometry: THREE.BufferGeometry, field: (x: number, y: number, z: number) => number): THREE.BufferGeometry {
  const src = geometry.index ? geometry.toNonIndexed() : geometry;
  const names = Object.keys(src.attributes);
  const attrs = names.map((n) => src.getAttribute(n));
  const out: number[][] = names.map(() => []);
  const pos = src.getAttribute('position');
  /** Append the point at `t` along the edge from vertex i to vertex j. */
  const emit = ([i, j, t]: readonly [number, number, number]) => {
    attrs.forEach((a, k) => {
      for (let c = 0; c < a.itemSize; c++) {
        const vi = component(a, i, c);
        out[k].push(vi + (component(a, j, c) - vi) * t);
      }
    });
  };
  const f = [0, 0, 0];
  const poly: [number, number, number][] = [];
  for (let v = 0; v + 2 < pos.count; v += 3) {
    for (let e = 0; e < 3; e++) f[e] = field(pos.getX(v + e), pos.getY(v + e), pos.getZ(v + e));
    // Clip the triangle to the kept side (Sutherland–Hodgman against one boundary).
    poly.length = 0;
    for (let e = 0; e < 3; e++) {
      const n = (e + 1) % 3;
      if (f[e] <= 0) poly.push([v + e, v + e, 0]);
      if (f[e] <= 0 !== f[n] <= 0) poly.push([v + e, v + n, f[e] / (f[e] - f[n])]);
    }
    for (let k = 1; k + 1 < poly.length; k++) {
      emit(poly[0]);
      emit(poly[k]);
      emit(poly[k + 1]);
    }
  }
  const cut = new THREE.BufferGeometry();
  names.forEach((n, k) => cut.setAttribute(n, new THREE.Float32BufferAttribute(out[k], attrs[k].itemSize)));
  // Interpolated normals come out a little short: back to unit length.
  const normal = cut.getAttribute('normal');
  if (normal) {
    const v = new THREE.Vector3();
    for (let i = 0; i < normal.count; i++) {
      v.fromBufferAttribute(normal, i).normalize();
      normal.setXYZ(i, v.x, v.y, v.z);
    }
  }
  cut.computeBoundingBox();
  cut.computeBoundingSphere();
  if (src !== geometry) src.dispose();
  return cut;
}
