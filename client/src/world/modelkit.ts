// Catalog models (client/src/models) drawn efficiently. A repeated prop (stools, stations,
// chairs, bench modules) becomes one InstancedMesh per sub-mesh, so a dozen stools cost a
// couple of draw calls. Loading is async: callers build their procedural version first and
// swap the model in when it arrives, or keep the procedural one if the catalog lacks it.
import * as THREE from 'three';
import { model } from '../models';

export interface InstancedModel {
  group: THREE.Group;
  /** Model-space bounding box of the meshes drawn with `material` (e.g. 'Screen'), or null. */
  boxOf(material: string): THREE.Box3 | null;
}

const _m = new THREE.Matrix4();

/**
 * Draw catalog model `id` at every placement (pivot at its floor-contact point, front +Z).
 * Materials named in `hide` are left out (e.g. 'Screen', replaced by our own canvas).
 */
export async function instancedModel(
  id: string,
  placements: THREE.Matrix4[],
  opts: { tint?: Record<string, THREE.ColorRepresentation>; hide?: string[]; shadows?: boolean } = {},
): Promise<InstancedModel | null> {
  if (placements.length === 0) return null;
  const root = await model(id, { tint: opts.tint, shadows: opts.shadows });
  if (!root) return null;
  root.updateMatrixWorld(true);
  const group = new THREE.Group();
  group.name = `instanced:${id}`;
  const boxes = new Map<string, THREE.Box3>();
  const hidden = new THREE.MeshBasicMaterial({ visible: false });
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld);
    for (const mat of mats) {
      const prev = boxes.get(mat.name);
      boxes.set(mat.name, prev ? prev.union(box) : box.clone());
    }
    const drawn = mats.map((m) => (opts.hide?.includes(m.name) ? hidden : m));
    if (drawn.every((m) => m === hidden)) return;
    const inst = new THREE.InstancedMesh(mesh.geometry, Array.isArray(mesh.material) ? drawn : drawn[0], placements.length);
    placements.forEach((p, i) => inst.setMatrixAt(i, _m.multiplyMatrices(p, mesh.matrixWorld)));
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = mesh.castShadow;
    inst.receiveShadow = true;
    inst.computeBoundingSphere();
    inst.computeBoundingBox();
    inst.name = `${id}:${mesh.name}`;
    group.add(inst);
  });
  return { group, boxOf: (name) => boxes.get(name) ?? null };
}

/** Placement matrix for a prop at (x, y, z) turned by yaw. */
export function placement(x: number, y: number, z: number, yaw: number): THREE.Matrix4 {
  return new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z);
}

/** Dispose the geometries and materials a procedural group owns (not shared ones). */
export function disposeGroup(group: THREE.Object3D, keepMaterials = true): void {
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    if (!keepMaterials) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => m.dispose());
  });
  group.removeFromParent();
}
