// Catalog models (Blender-built GLBs in client/public/models) for the game.
//
// The game never depends on them: every caller keeps its procedural version and swaps a
// model in when (and only if) the catalog has it. Models arrive with AO baked into the base
// colour texture and the palette colour in the material colour, so recolouring a
// `tintable` material is just setting its colour.
//
//   const chair = await model('office_chair', { tint: { Seat: '#3D7CFF' }, fit: { h: 1.0 } });
//   if (chair) group.add(chair);
//
//   await swapIn(deskGroup, 'desk', { fit: 'match' });   // replace a placeholder's visuals
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface CatalogItem {
  id: string;
  name: string;
  category: string | null;
  artist: string | null;
  priority: string | null;
  status: 'done' | 'wip' | 'planned';
  file: string | null;
  dims?: { w: number; h: number; d: number } | null;
  tintable: string[];
  anchors: Record<string, [number, number, number]>;
  nodes?: string[];
  materials?: string[];
}

/** Target size in metres. Missing axes are unconstrained; the model is scaled uniformly. */
export interface FitTarget {
  w?: number;
  h?: number;
  d?: number;
}

export interface ModelOptions {
  /** Material name → colour, for the item's `tintable` materials (or any material by name). */
  tint?: Record<string, THREE.ColorRepresentation>;
  /** Uniformly scale to fit inside this size. */
  fit?: FitTarget;
  /** Default true. */
  shadows?: boolean;
}

const loader = new GLTFLoader();
const protos = new Map<string, Promise<THREE.Object3D | null>>();
let catalogPromise: Promise<Map<string, CatalogItem>> | null = null;

/** Models that exist (status done or wip), keyed by id. Fetched once per page load. */
export function catalog(): Promise<Map<string, CatalogItem>> {
  catalogPromise ??= fetch('/models/catalog.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : { items: [] }))
    .then((c: { items: CatalogItem[] }) => new Map(c.items.filter((i) => i.file && i.status !== 'planned').map((i) => [i.id, i])))
    .catch(() => new Map<string, CatalogItem>());
  return catalogPromise;
}

export async function catalogItem(id: string): Promise<CatalogItem | undefined> {
  return (await catalog()).get(id);
}

/** A fresh instance of a catalog model, or null if it isn't built (yet) or failed to load. */
export async function model(id: string, opts: ModelOptions = {}): Promise<THREE.Group | null> {
  const item = await catalogItem(id);
  if (!item?.file) return null;
  let proto = protos.get(id);
  if (!proto) {
    proto = loader
      .loadAsync(`/${item.file}`)
      .then((gltf) => gltf.scene)
      .catch((err: Error) => {
        console.warn(`[models] ${id} failed to load: ${err.message}`);
        return null;
      });
    protos.set(id, proto);
  }
  const scene = await proto;
  if (!scene) return null;

  const root = new THREE.Group();
  root.name = `model:${id}`;
  root.userData.modelId = id;
  root.add(scene.clone(true));
  const shadows = opts.shadows ?? true;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) clampTextures(mat);
  });
  if (opts.tint) tint(root, opts.tint);
  if (opts.fit) fit(root, opts.fit);
  return root;
}

/**
 * Baked AO atlases have UV islands touching the texture border; with the exporter's default
 * REPEAT wrap, edge texels filter in the opposite side and show thin dark lines. Clamp them.
 */
export function clampTextures(mat: THREE.Material): void {
  const m = mat as THREE.MeshStandardMaterial;
  for (const tex of [m.map, m.aoMap, m.emissiveMap, m.roughnessMap, m.metalnessMap]) {
    if (!tex || (tex.wrapS === THREE.ClampToEdgeWrapping && tex.wrapT === THREE.ClampToEdgeWrapping)) continue;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
  }
}

/** Recolour materials by name on this instance only (materials are cloned on first tint). */
export function tint(root: THREE.Object3D, colors: Record<string, THREE.ColorRepresentation>): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    let changed = false;
    const next = list.map((mat) => {
      const color = colors[mat.name];
      if (color === undefined || !('color' in mat)) return mat;
      changed = true;
      const own = mat.userData.instanceOwned ? mat : mat.clone();
      own.userData.instanceOwned = true;
      (own as THREE.MeshStandardMaterial).color.set(color);
      return own;
    });
    if (changed) mesh.material = Array.isArray(mesh.material) ? next : next[0];
  });
}

/** Scale uniformly so the object fits inside `target` (only the given axes constrain it). */
export function fit(root: THREE.Object3D, target: FitTarget): void {
  root.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  const ratios = [
    target.w !== undefined && size.x > 0 ? target.w / size.x : Infinity,
    target.h !== undefined && size.y > 0 ? target.h / size.y : Infinity,
    target.d !== undefined && size.z > 0 ? target.d / size.z : Infinity,
  ];
  const s = Math.min(...ratios);
  if (Number.isFinite(s) && s > 0) root.scale.multiplyScalar(s);
}

/** Bounding box of `root`'s meshes in root's own space (rotation/position of root ignored). */
export function localBox(root: THREE.Object3D): THREE.Box3 {
  root.updateMatrixWorld(true);
  const toLocal = root.matrixWorld.clone().invert();
  const box = new THREE.Box3();
  const m = new THREE.Matrix4();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    box.union(mesh.geometry.boundingBox!.clone().applyMatrix4(m.multiplyMatrices(toLocal, mesh.matrixWorld)));
  });
  return box;
}

/** First material with this name (e.g. 'Screen', 'Board', 'Label'), for swapping in canvas textures. */
export function findMaterial(root: THREE.Object3D, name: string): THREE.MeshStandardMaterial | null {
  let found: THREE.MeshStandardMaterial | null = null;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (found || !mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    found = (list.find((m) => m.name === name) as THREE.MeshStandardMaterial | undefined) ?? null;
  });
  return found;
}

/**
 * Put a texture (usually a live CanvasTexture) on a model's swappable surface: every mesh
 * using the material named `materialName` ('Screen', 'Board', 'Label') gets `material`.
 * Blender/glTF UVs run top-to-bottom (V = 0 at the top), so the texture must not be
 * flipped like a texture on three's own geometry would be; this sets flipY = false.
 * A small polygon offset keeps the painted surface from z-fighting with its frame.
 * Returns how many meshes were painted.
 */
export function paint(root: THREE.Object3D, materialName: string, material: THREE.MeshStandardMaterial): number {
  if (material.map) {
    material.map.flipY = false;
    material.map.needsUpdate = true;
  }
  material.polygonOffset = true;
  material.polygonOffsetFactor = -1;
  material.polygonOffsetUnits = -1;
  let painted = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (Array.isArray(mesh.material)) {
      if (!mesh.material.some((m) => m.name === materialName)) return;
      mesh.material = mesh.material.map((m) => (m.name === materialName ? material : m));
    } else if (mesh.material.name === materialName) {
      mesh.material = material;
    } else return;
    painted++;
  });
  return painted;
}

/** Named animated node from the GLB (e.g. 'DoorL', 'HourHand', 'Drawer1'). */
export function findNode(root: THREE.Object3D, name: string): THREE.Object3D | null {
  return root.getObjectByName(name) ?? null;
}

/**
 * Replace a procedural placeholder's visuals with a catalog model, keeping the placeholder
 * itself (its transform, colliders and any references the game holds to it). Children
 * flagged `userData.keep` stay. `fit: 'match'` sizes the model to the placeholder's
 * current bounding box. Returns the model, or null if it isn't available (nothing changes).
 */
export async function swapIn(
  placeholder: THREE.Object3D,
  id: string,
  opts: Omit<ModelOptions, 'fit'> & { fit?: FitTarget | 'match' } = {},
): Promise<THREE.Group | null> {
  let target: FitTarget | undefined;
  if (opts.fit === 'match') {
    const size = localBox(placeholder).getSize(new THREE.Vector3());
    target = { w: size.x, h: size.y, d: size.z };
  } else {
    target = opts.fit;
  }
  const m = await model(id, { ...opts, fit: target });
  if (!m) return null;
  for (const child of [...placeholder.children]) if (!child.userData.keep) placeholder.remove(child);
  placeholder.add(m);
  return m;
}
