// Catalog models (client/src/models) in the world. Every prop is built procedurally first; its
// model is swapped in when (and only if) it loads, so a missing GLB never breaks the scene.
//
// - One-off props: swapModel() replaces a placeholder group's procedural meshes with the model,
//   sized to the procedural footprint, so colliders and nav stay exactly as they were.
// - Repeated props (desk items, chairs, stools, stations, bench modules): instancedModel() draws
//   every copy as one InstancedMesh per sub-mesh, so a hundred chairs cost a few draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { catalogItem, localBox, model, paint } from '../models';
import type { WorldCtx } from './ctx';
import type { FadeItem } from './fader';
import type { Vec3 } from './kit';

/** Faces the game paints with its own canvas (planar 0..1 UVs, no AO): never merged. */
const PAINTED = new Set(['Screen', 'Board', 'Label']);

/**
 * One material for all of a merged model's static parts (one draw call). Each vertex carries its
 * source material's colour, roughness, metalness and glow, and whether it samples the model's
 * texture (AO is baked into the base colour). Vertices marked `aTint` take the instance colour,
 * so one part (e.g. a desk's `Accent` panel) is recoloured per copy.
 */
class ModelMaterial extends THREE.MeshStandardMaterial {
  constructor(params?: THREE.MeshStandardMaterialParameters) {
    super(params);
    this.vertexColors = true;
    this.roughness = 1;
    this.metalness = 1;
    this.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
attribute float aRough;
attribute float aMetal;
attribute vec3 aGlow;
attribute float aUseMap;
attribute float aTint;
varying float vRough;
varying float vMetal;
varying vec3 vGlow;
varying float vUseMap;`,
        )
        .replace(
          '#include <color_vertex>',
          `#include <color_vertex>
#ifdef USE_INSTANCING_COLOR
vColor.rgb = color * mix( vec3( 1.0 ), instanceColor.rgb, aTint );
#endif
vRough = aRough;
vMetal = aMetal;
vGlow = aGlow;
vUseMap = aUseMap;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
varying float vRough;
varying float vMetal;
varying vec3 vGlow;
varying float vUseMap;`,
        )
        .replace(
          '#include <map_fragment>',
          `#ifdef USE_MAP
diffuseColor *= mix( vec4( 1.0 ), texture2D( map, vMapUv ), vUseMap );
#endif`,
        )
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * vRough;')
        .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = metalness * vMetal;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vGlow;');
    };
  }

  customProgramCacheKey(): string {
    return 'office-model-1';
  }
}

/** A float copy of an attribute (glTF may store quantised or interleaved data). */
function floats(attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, size: number): THREE.Float32BufferAttribute {
  const out = new Float32Array(attr.count * size);
  for (let i = 0; i < attr.count; i++) for (let k = 0; k < size; k++) out[i * size + k] = attr.getComponent(i, k);
  return new THREE.Float32BufferAttribute(out, size);
}

function filled(count: number, values: number[]): THREE.Float32BufferAttribute {
  const out = new Float32Array(count * values.length);
  for (let i = 0; i < count; i++) out.set(values, i * values.length);
  return new THREE.Float32BufferAttribute(out, values.length);
}

/**
 * Merged geometry and its material are shared by every copy of a model merged with the same
 * options (see mergeKey): a hundred desks hold one desk's merged vertices, and a pod growing
 * re-uses what's already on the GPU instead of merging again. Refcounted per mesh that draws
 * them (a copy's mesh or an InstancedMesh); the last one released frees them.
 */
interface MergedPart {
  geometry: THREE.BufferGeometry;
  material: ModelMaterial;
  cast: boolean;
}
interface MergedEntry {
  /** Per owner ('' = the model's body, else a moving part's node name); null = nothing to merge there. */
  parts: Map<string, MergedPart | null>;
  refs: number;
}
const mergedCache = new Map<string, MergedEntry>();

/** The cache key for merging model `id` with these options. */
export function mergeKey(
  id: string,
  o: { tint?: Record<string, THREE.ColorRepresentation>; tinted?: readonly string[]; exclude?: readonly string[]; glow?: number; shadows?: boolean },
): string {
  const tint = Object.entries(o.tint ?? {})
    .map(([k, v]) => `${k}=${new THREE.Color(v).getHexString()}`)
    .sort()
    .join(',');
  return [id, tint, [...(o.tinted ?? [])].sort().join(','), [...(o.exclude ?? [])].sort().join(','), o.glow ?? 1, o.shadows === false ? 0 : 1].join('|');
}

/** A mesh drawing this merged geometry is gone; the last one frees the entry's geometry and materials. */
export function releaseMerged(geometry: THREE.BufferGeometry): void {
  const key = geometry.userData.mergeKey as string | undefined;
  const entry = key === undefined ? undefined : mergedCache.get(key);
  if (!entry || --entry.refs > 0) return;
  mergedCache.delete(key!);
  for (const part of entry.parts.values()) {
    part?.geometry.dispose();
    part?.material.dispose();
  }
}

/** References held per cache key (debug: compare with the meshes actually in the scene). */
export function mergedRefs(): Record<string, number> {
  return Object.fromEntries([...mergedCache.entries()].map(([k, e]) => [k, e.refs]));
}

/** How much merged geometry is cached (debug: entries, meshes drawing it, vertex bytes). */
export function mergedStats(): { entries: number; refs: number; bytes: number } {
  let refs = 0;
  let bytes = 0;
  for (const entry of mergedCache.values()) {
    refs += entry.refs;
    for (const part of entry.parts.values()) {
      if (!part) continue;
      for (const a of Object.values(part.geometry.attributes)) bytes += (a as THREE.BufferAttribute).array.byteLength;
      if (part.geometry.index) bytes += part.geometry.index.array.byteLength;
    }
  }
  return { entries: mergedCache.size, refs, bytes };
}

/**
 * Merge a model's opaque parts into as few meshes as possible, drawn with ModelMaterial: one for
 * the body, and one inside each moving part (nodes named in `parts`, so they still animate).
 * Painted faces, transparent or hidden parts and `exclude`d materials stay as they are. Vertices of
 * `tinted` materials take the instance colour when drawn instanced. With a `key` (mergeKey), the
 * result is shared with every other copy merged under that key; each merged mesh holds a reference.
 */
export function mergeModel(root: THREE.Object3D, parts: readonly string[] = [], tinted: readonly string[] = [], exclude: readonly string[] = [], glowScale = 1, key?: string): void {
  root.updateMatrixWorld(true);
  const owners = new Map<THREE.Object3D, THREE.Mesh[]>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material) || !mesh.visible) return;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (!mat.isMeshStandardMaterial || PAINTED.has(mat.name) || exclude.includes(mat.name) || mat.transparent || mat.alphaTest > 0) return;
    // A moving part that is a single mesh carries its own animation: leave it whole.
    if (parts.includes(mesh.name)) return;
    let owner: THREE.Object3D = root;
    for (let p = mesh.parent; p && p !== root; p = p.parent) {
      if (parts.includes(p.name)) {
        owner = p;
        break;
      }
    }
    owners.set(owner, [...(owners.get(owner) ?? []), mesh]);
  });
  let entry = key === undefined ? undefined : mergedCache.get(key);
  if (key !== undefined && !entry) {
    entry = { parts: new Map(), refs: 0 };
    mergedCache.set(key, entry);
  }
  for (const [owner, meshes] of owners) {
    if (meshes.length < 2) continue;
    const slot = owner === root ? '' : owner.name;
    let part = entry?.parts.get(slot);
    if (part === undefined) {
      part = buildMerged(owner, meshes, tinted, glowScale);
      if (part && key !== undefined) {
        part.geometry.userData.mergeKey = key;
        part.material.userData.mergeKey = key;
      } else if (part) {
        // Not cached: this copy owns it outright.
        part.geometry.userData.owned = true;
        part.material.userData.instanceOwned = true;
      }
      entry?.parts.set(slot, part);
    }
    if (!part) continue;
    const merged = new THREE.Mesh(part.geometry, part.material);
    merged.name = `${root.name}:merged`;
    merged.castShadow = part.cast;
    merged.receiveShadow = true;
    if (entry) entry.refs++;
    for (const m of meshes) m.removeFromParent();
    owner.add(merged);
  }
  // An entry nothing ended up drawing (nothing to merge in this model) needn't linger.
  if (key !== undefined && entry && entry.refs === 0 && [...entry.parts.values()].every((p) => !p)) mergedCache.delete(key);
}

/**
 * Glowing parts are often modelled flush with what they sit on (a bulb against its shade, EXIT
 * lettering on its panel, an indicator light set into a body), and coplanar faces z-fight. Each
 * glow part is lifted off along its normals by this much per layer; a model's glow materials are
 * layered by area, largest first, so the lettering lands on top of its panel.
 */
const GLOW_LIFT = 0.0008;

function triangleArea(geo: THREE.BufferGeometry): number {
  const pos = geo.getAttribute('position');
  const idx = geo.index;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let area = 0;
  const count = idx ? idx.count : pos.count;
  for (let i = 0; i < count; i += 3) {
    const [i0, i1, i2] = idx ? [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)] : [i, i + 1, i + 2];
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1);
    c.fromBufferAttribute(pos, i2);
    area += b.sub(a).cross(c.sub(a)).length() / 2;
  }
  return area;
}

/** Glow layer per material name: 1 for the largest glowing material, 2 for the next, … (0 = no glow). */
function glowLayers(meshes: THREE.Mesh[]): Map<string, number> {
  const areas = new Map<string, number>();
  for (const mesh of meshes) {
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (mat.emissiveIntensity <= 0 || mat.emissive.getHex() === 0) continue;
    areas.set(mat.name, (areas.get(mat.name) ?? 0) + triangleArea(mesh.geometry));
  }
  const order = [...areas.entries()].sort((x, y) => y[1] - x[1]);
  return new Map(order.map(([name], i) => [name, i + 1]));
}

/** Merge `meshes` into one geometry in `owner`'s space, with its ModelMaterial (the meshes are left alone). */
function buildMerged(owner: THREE.Object3D, meshes: THREE.Mesh[], tinted: readonly string[], glowScale: number): MergedPart | null {
  const toOwner = owner.matrixWorld.clone().invert();
  const layers = glowLayers(meshes);
  const geos: THREE.BufferGeometry[] = [];
  let map: THREE.Texture | null = null;
  let side: THREE.Side = THREE.FrontSide;
  let cast = false;
  const tintedHere = new Set<string>();
  for (const mesh of meshes) {
    const mat = mesh.material as THREE.MeshStandardMaterial;
    const src = mesh.geometry;
    const position = src.getAttribute('position');
    if (!position) continue;
    const g = new THREE.BufferGeometry();
    const n = position.count;
    g.setAttribute('position', floats(position, 3));
    const normal = src.getAttribute('normal');
    if (normal) g.setAttribute('normal', floats(normal, 3));
    const uv = src.getAttribute('uv');
    g.setAttribute('uv', uv ? floats(uv, 2) : filled(n, [0, 0]));
    g.setIndex(src.index ? Array.from(src.index.array as ArrayLike<number>) : Array.from({ length: n }, (_, i) => i));
    if (!normal) g.computeVertexNormals();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toOwner, mesh.matrixWorld));
    const layer = layers.get(mat.name) ?? 0;
    if (layer > 0) {
      const p = g.getAttribute('position') as THREE.BufferAttribute;
      const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
      const lift = GLOW_LIFT * layer;
      for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + nrm.getX(i) * lift, p.getY(i) + nrm.getY(i) * lift, p.getZ(i) + nrm.getZ(i) * lift);
    }
    const glow = mat.emissive.clone().multiplyScalar(mat.emissiveIntensity * glowScale);
    // A tinted part is white here: the instance colour is its whole colour.
    const tint = tinted.includes(mat.name);
    if (tint) tintedHere.add(mat.name);
    g.setAttribute('color', filled(n, tint ? [1, 1, 1] : [mat.color.r, mat.color.g, mat.color.b]));
    g.setAttribute('aRough', filled(n, [mat.roughness]));
    g.setAttribute('aMetal', filled(n, [mat.metalness]));
    g.setAttribute('aGlow', filled(n, [glow.r, glow.g, glow.b]));
    g.setAttribute('aUseMap', filled(n, [mat.map ? 1 : 0]));
    g.setAttribute('aTint', filled(n, [tint ? 1 : 0]));
    map ??= mat.map;
    if (mat.side === THREE.DoubleSide) side = THREE.DoubleSide;
    cast ||= mesh.castShadow;
    geos.push(g);
  }
  const geometry = geos.length > 1 ? mergeGeometries(geos, false) : null;
  for (const g of geos) g.dispose();
  if (!geometry) return null;
  // Which per-copy colour (InstancedOptions.colors) its tinted vertices take.
  geometry.userData.tinted = [...tintedHere];
  return { geometry, material: new ModelMaterial({ map, side }), cast };
}

/** Moving parts of a catalog model: its node names after the first (the body). */
async function movingParts(id: string): Promise<string[]> {
  return (await catalogItem(id))?.nodes?.slice(1) ?? [];
}

/**
 * Target size in metres for a model (its bounding box). Per axis by default, so the model takes
 * exactly the procedural footprint; an axis without a target scales by the mean of the others.
 * `uniform` keeps the proportions instead (the smallest ratio wins).
 */
export interface Fit {
  w?: number;
  h?: number;
  d?: number;
  uniform?: boolean;
}

/** Scale that maps a model of natural `size` onto `fit`. */
export function fitScale(size: THREE.Vector3, fit: Fit): THREE.Vector3 {
  const ratios = [fit.w !== undefined ? fit.w / size.x : NaN, fit.h !== undefined ? fit.h / size.y : NaN, fit.d !== undefined ? fit.d / size.z : NaN];
  const known = ratios.filter((r) => Number.isFinite(r) && r > 0);
  if (known.length === 0) return new THREE.Vector3(1, 1, 1);
  if (fit.uniform) {
    const s = Math.min(...known);
    return new THREE.Vector3(s, s, s);
  }
  const mean = known.reduce((a, b) => a + b, 0) / known.length;
  const [x, y, z] = ratios.map((r) => (Number.isFinite(r) && r > 0 ? r : mean));
  return new THREE.Vector3(x, y, z);
}

export interface InstancedOptions {
  tint?: Record<string, THREE.ColorRepresentation>;
  /**
   * Per-instance colours by material name (e.g. each desk's accent), one entry per placement. A
   * merged mesh takes the colours of the first tinted material it holds; a part left out of the
   * merge (e.g. translucent `Glass`) takes its own material's colours, glow included.
   */
  colors?: Record<string, readonly THREE.ColorRepresentation[]>;
  /** Materials left out (e.g. 'Screen', replaced by our own canvas). */
  hide?: string[];
  shadows?: boolean;
  /** Size every copy to this footprint (applied in model space, before each placement). */
  fit?: Fit;
  /** Uniform scale instead of a fit (e.g. derived from an anchor such as a seat height). */
  scale?: number;
  /** Extra bounding-sphere radius, for copies that move after creation (chairs). */
  pad?: number;
}

export interface InstancedModel {
  group: THREE.Group;
  /** Fitted model-space bounding box of the meshes drawn with `material` (e.g. 'Screen'), or null. */
  boxOf(material: string): THREE.Box3 | null;
  /** Geometry and fitted model-space matrix of each mesh drawn with `material` (for per-copy faces). */
  partsOf(material: string): { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }[];
  /** Move copy `i` (for props that move, like desk chairs). */
  setPlacement(i: number, placement: THREE.Matrix4): void;
}

const _m = new THREE.Matrix4();
const _c = new THREE.Color();

/** Draw catalog model `id` at every placement (pivot at its floor-contact point, front +Z). */
export async function instancedModel(id: string, placements: THREE.Matrix4[], opts: InstancedOptions = {}): Promise<InstancedModel | null> {
  if (placements.length === 0) return null;
  const [root, moving] = await Promise.all([model(id, { tint: opts.tint, shadows: opts.shadows }), movingParts(id)]);
  if (!root) return null;
  const tinted = Object.keys(opts.colors ?? {});
  // Each merged mesh's reference passes to the InstancedMesh drawn from it (the root is dropped).
  mergeModel(root, moving, tinted, opts.hide, 1, mergeKey(id, { tint: opts.tint, tinted, exclude: opts.hide, shadows: opts.shadows }));
  const scale = opts.fit ? fitScale(localBox(root).getSize(new THREE.Vector3()), opts.fit) : new THREE.Vector3(1, 1, 1).multiplyScalar(opts.scale ?? 1);
  root.scale.copy(scale);
  root.updateMatrixWorld(true);
  const group = new THREE.Group();
  group.name = `instanced:${id}`;
  const boxes = new Map<string, THREE.Box3>();
  const parts = new Map<string, { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }[]>();
  const drawn: { inst: THREE.InstancedMesh; local: THREE.Matrix4 }[] = [];
  const hidden = new THREE.MeshBasicMaterial({ visible: false });
  hidden.userData.instanceOwned = true;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const local = mesh.matrixWorld.clone();
    const box = mesh.geometry.boundingBox!.clone().applyMatrix4(local);
    for (const mat of mats) {
      const prev = boxes.get(mat.name);
      boxes.set(mat.name, prev ? prev.union(box) : box.clone());
      parts.set(mat.name, [...(parts.get(mat.name) ?? []), { geometry: mesh.geometry, matrix: local }]);
    }
    const shown = mats.map((m) => (opts.hide?.includes(m.name) ? hidden : m));
    if (shown.every((m) => m === hidden)) {
      releaseMerged(mesh.geometry);
      return;
    }
    const inst = new THREE.InstancedMesh(mesh.geometry, Array.isArray(mesh.material) ? shown : shown[0], placements.length);
    placements.forEach((p, i) => inst.setMatrixAt(i, _m.multiplyMatrices(p, local)));
    const merged = mesh.material instanceof ModelMaterial;
    const tintedHere = (mesh.geometry.userData.tinted as string[] | undefined) ?? [];
    const perCopy = merged ? tintedHere.map((name) => opts.colors?.[name]).find((c) => c) : !Array.isArray(mesh.material) ? opts.colors?.[mesh.material.name] : undefined;
    if (perCopy && merged) {
      // ModelMaterial applies the copy's colour to the vertices marked aTint only.
      placements.forEach((_, i) => inst.setColorAt(i, _c.set(perCopy[i] ?? 0xffffff)));
    } else if (perCopy) {
      // The copy's colour multiplies the (white) material colour, like a per-desk tint.
      const own = mesh.material as THREE.MeshStandardMaterial;
      const white = own.clone();
      white.userData.instanceOwned = true;
      white.color.set(0xffffff);
      if (white.emissive.getHex() !== 0) {
        // Its glow takes the copy's colour too, at the model's own glow brightness.
        const e = white.emissive;
        const l = e.r * 0.2126 + e.g * 0.7152 + e.b * 0.0722;
        e.setRGB(l, l, l);
        white.onBeforeCompile = (shader) => {
          shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance *= vColor.rgb;');
        };
        white.customProgramCacheKey = () => 'office-copy-glow-1';
      }
      inst.material = white;
      placements.forEach((_, i) => inst.setColorAt(i, _c.set(perCopy[i] ?? 0xffffff)));
    }
    inst.castShadow = mesh.castShadow;
    inst.receiveShadow = opts.shadows !== false;
    inst.computeBoundingSphere();
    inst.computeBoundingBox();
    if (opts.pad && inst.boundingSphere) inst.boundingSphere.radius += opts.pad;
    inst.name = `${id}:${mesh.name}`;
    group.add(inst);
    drawn.push({ inst, local });
  });
  return {
    group,
    boxOf: (name) => boxes.get(name) ?? null,
    partsOf: (name) => parts.get(name) ?? [],
    setPlacement(i, p) {
      for (const { inst, local } of drawn) {
        inst.setMatrixAt(i, _m.multiplyMatrices(p, local));
        inst.instanceMatrix.needsUpdate = true;
      }
    },
  };
}

/** Placement matrix for a prop at (x, y, z) turned by yaw. */
export function placement(x: number, y: number, z: number, yaw: number): THREE.Matrix4 {
  return new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z);
}

export interface SwapOptions {
  tint?: Record<string, THREE.ColorRepresentation>;
  /** Size to the procedural footprint (see Fit). */
  fit?: Fit;
  /** Scale instead of a fit: uniform, or per axis (e.g. a desk whose top must land at a height). */
  scale?: number | Vec3;
  /** Live canvases for the model's painted faces ('Board', 'Label'), applied with paint(). */
  paint?: Record<string, THREE.MeshStandardMaterial>;
  /** Our own materials for parts the merge leaves alone, by name (e.g. 'Glass' → the glare glass). */
  materials?: Record<string, THREE.Material>;
  /** Materials hidden (e.g. a surface we draw ourselves). */
  hide?: string[];
  /** Materials kept out of the merge as their own meshes, to restyle or animate them (see `materials`). */
  separate?: string[];
  shadows?: boolean;
  /** Where the model's pivot sits in the placeholder, and its turn (default: origin, facing +Z). */
  at?: Vec3;
  yaw?: number;
  /** Multiplies the model's own glow (e.g. a street lamp in daylight). */
  glow?: number;
  /** Several copies instead of one (e.g. two bookshelves side by side); `mirror` flips one in X. */
  copies?: { at?: Vec3; yaw?: number; mirror?: boolean }[];
}

/** Load, merge, size and pose one copy of a model (null if it isn't available). */
async function prepared(id: string, opts: SwapOptions & { mirror?: boolean }): Promise<THREE.Group | null> {
  const [m, moving] = await Promise.all([model(id, { tint: opts.tint, shadows: opts.shadows }), movingParts(id)]);
  if (!m) return null;
  for (const name of opts.hide ?? []) hideMaterial(m, name);
  const exclude = [...(opts.hide ?? []), ...(opts.separate ?? [])];
  mergeModel(m, moving, [], exclude, opts.glow, mergeKey(id, { tint: opts.tint, exclude, glow: opts.glow, shadows: opts.shadows }));
  if (opts.fit) m.scale.copy(fitScale(localBox(m).getSize(new THREE.Vector3()), opts.fit));
  else if (typeof opts.scale === 'number') m.scale.setScalar(opts.scale);
  else if (opts.scale) m.scale.set(...opts.scale);
  if (opts.mirror) m.scale.x *= -1;
  if (opts.at) m.position.set(...opts.at);
  if (opts.yaw) m.rotation.y = opts.yaw;
  for (const [name, mat] of Object.entries(opts.paint ?? {})) paint(m, name, mat);
  if (opts.materials) {
    const swaps = opts.materials;
    m.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && !Array.isArray(mesh.material) && swaps[mesh.material.name]) mesh.material = swaps[mesh.material.name];
    });
  }
  return m;
}

/** Add catalog model `id` to `parent` (e.g. a bell on a counter). Returns it, or null if unavailable. */
export async function addModel(parent: THREE.Object3D, id: string, opts: SwapOptions = {}): Promise<THREE.Group | null> {
  const m = await prepared(id, opts);
  if (m) parent.add(m);
  return m;
}

/** A catalog anchor (model space, unscaled), or null. */
export async function anchorOf(id: string, name: string): Promise<THREE.Vector3 | null> {
  const a = (await catalogItem(id))?.anchors[name];
  return a ? new THREE.Vector3(...a) : null;
}

/**
 * Replace a placeholder's procedural meshes with catalog model `id`. Children flagged
 * `userData.keep` stay; the placeholder keeps its transform, colliders and interactables, and its
 * fade registration (`userData.fade`, set by tallProp) moves over to the model. Returns the model,
 * or null if it isn't available (then nothing changes).
 */
export async function swapModel(ctx: WorldCtx, group: THREE.Object3D, id: string, opts: SwapOptions = {}): Promise<THREE.Group | null> {
  const copies = await Promise.all((opts.copies ?? [{}]).map((c) => prepared(id, { ...opts, ...c })));
  // Gone while the model loaded (e.g. a reserved spot a pod moved into): drop the copies.
  if (copies.some((m) => !m) || group.userData.disposed) {
    for (const m of copies) if (m) disposeModel(m);
    return null;
  }
  for (const child of [...group.children]) {
    if (child.userData.keep) continue;
    if (child.userData.modelId) disposeModel(child);
    else {
      // Printed faces own their canvas and material (see ownCanvas).
      child.traverse((o) => (o.userData.dispose as (() => void) | undefined)?.());
      disposeGroup(child);
    }
  }
  const models = copies as THREE.Group[];
  group.add(...models);
  const m = models[0];
  const fade = group.userData.fade as FadeItem | undefined;
  if (fade) {
    ctx.fader.remove(fade);
    group.userData.fade = ctx.fader.add(fade.name, [group]);
  }
  return m;
}

/**
 * Mark a procedural face as owning its canvas texture and material, so swapModel releases them
 * when a model replaces the prop. (Don't mark a face whose canvas moves onto the model via paint.)
 */
export function ownCanvas(mesh: THREE.Mesh, tex: { dispose(): void }): THREE.Mesh {
  mesh.userData.dispose = () => {
    (mesh.material as THREE.Material).dispose();
    tex.dispose();
  };
  return mesh;
}

/** Hide every mesh drawn with material `name` (multi-material meshes get an invisible slot). */
export function hideMaterial(root: THREE.Object3D, name: string): void {
  let hidden: THREE.Material | null = null;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (!Array.isArray(mesh.material)) {
      if (mesh.material.name === name) mesh.visible = false;
      return;
    }
    if (!mesh.material.some((m) => m.name === name)) return;
    hidden ??= new THREE.MeshBasicMaterial({ visible: false });
    mesh.material = mesh.material.map((m) => (m.name === name ? hidden! : m));
  });
}

/** Let go of a model mesh's geometry: shared merged geometry is released, a copy's own is disposed. */
function dropGeometry(geometry: THREE.BufferGeometry): void {
  if (geometry.userData.mergeKey !== undefined) releaseMerged(geometry);
  else if (geometry.userData.owned) geometry.dispose();
}

/**
 * Remove an instancedModel() group and release what it holds: the instance buffers, its own
 * materials, and its references to shared merged geometry. Other geometry and materials belong to
 * the model cache.
 */
export function disposeInstanced(group: THREE.Object3D): void {
  group.traverse((o) => {
    const inst = o as THREE.InstancedMesh;
    if (!inst.isInstancedMesh) return;
    for (const m of Array.isArray(inst.material) ? inst.material : [inst.material]) if (m.userData.instanceOwned) m.dispose();
    dropGeometry(inst.geometry);
    inst.dispose();
  });
  group.removeFromParent();
}

/** Remove a swapped-in model, releasing only what this copy holds (merged geometry references, tinted materials). */
export function disposeModel(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    dropGeometry(mesh.geometry);
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) if (m.userData.instanceOwned) m.dispose();
  });
  root.removeFromParent();
}

/** Dispose the geometries (and optionally materials) a procedural group owns. Never call it on a model. */
export function disposeGroup(group: THREE.Object3D, keepMaterials = true): void {
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    if (!keepMaterials) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => m.dispose());
    // An instanced part frees its instance buffers too.
    if ((mesh as THREE.InstancedMesh).isInstancedMesh) (mesh as THREE.InstancedMesh).dispose();
  });
  group.removeFromParent();
}
