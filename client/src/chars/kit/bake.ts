// Draw-call baking (#57): a dressed character's parts merged into one skinned mesh.
//
// Every part keeps riding its own joint as a bone with one full weight, so springs, blinks, arm
// stretch, bouncing hair, the upright mug and the sip all still work. What used to make parts
// separate draws moves into vertex attributes (colour, roughness, metalness, emissive), so one
// draw covers every part with the same texture and rim: the geometry has one group per such look
// and the mesh draws with one material per group. Far away, the same geometry draws with a single
// material (textures dropped): one draw. Showing and hiding still works: a part's bone collapses
// to nothing whenever anything above it is hidden (mouth shapes, a mug put away).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface BakePart {
  mesh: THREE.Mesh;
  /** Linear colour to bake instead of the material's (a translucent blush pre-blended over skin). */
  color?: THREE.Color;
}

export interface Look {
  key: string;
  map: THREE.Texture | null;
  rim: boolean;
  side: THREE.Side;
}

export interface Baked {
  /** Draws with one material per look (near), or `far` (one draw). */
  mesh: THREE.SkinnedMesh;
  near: THREE.Material[];
  far: THREE.Material;
  skeleton: THREE.Skeleton;
  geometry: THREE.BufferGeometry;
  bones: THREE.Object3D[];
}

export interface Materials {
  /** The material for one look's group, drawn up close. */
  near(look: Look): THREE.Material;
  /** The one material for the whole mesh, drawn far away. */
  far(): THREE.Material;
}

/**
 * A bone that follows its parent joint but collapses to nothing while the joint, or anything
 * above it up to the character's root, is hidden.
 */
class Seen extends THREE.Object3D {
  constructor(private readonly root: THREE.Object3D) {
    super();
  }

  override updateMatrix(): void {
    let shown = true;
    for (let o: THREE.Object3D | null = this.parent; o && o !== this.root; o = o.parent) {
      if (!o.visible) {
        shown = false;
        break;
      }
    }
    this.scale.setScalar(shown ? 1 : 0);
    super.updateMatrix();
  }
}

/** Parts share a draw when they share a texture and rim. */
function lookOf(m: THREE.MeshStandardMaterial): Look {
  const rim = m.customProgramCacheKey().includes('rim');
  return { key: [m.map?.uuid ?? '-', rim, m.side].join('|'), map: m.map, rim, side: m.side };
}

const readVec = (a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, size: number): Float32Array => {
  const out = new Float32Array(a.count * size);
  for (let i = 0; i < a.count; i++) {
    out[i * size] = a.getX(i);
    if (size > 1) out[i * size + 1] = a.getY(i);
    if (size > 2) out[i * size + 2] = a.getZ(i);
  }
  return out;
};

/**
 * Per-vertex finish for MeshStandardMaterial: roughness, metalness and emissive come from the
 * baked attributes, and the vertex colours are decoded from the sRGB bytes they're stored as.
 * `far` also darkens textured parts a touch, for the AO texture it drops.
 */
export function perVertexFinish(m: THREE.MeshStandardMaterial, far = false): void {
  const prev = m.onBeforeCompile;
  const key = m.customProgramCacheKey();
  m.onBeforeCompile = (shader, renderer) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aFinish;\nattribute vec3 aEmissive;\nvarying vec4 vFinish;\nvarying vec3 vEmissiveV;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFinish = aFinish;\nvEmissiveV = aEmissive;')
      .replace('#include <color_vertex>', '#include <color_vertex>\nvColor.rgb = mix(vColor.rgb / 12.92, pow((vColor.rgb + 0.055) / 1.055, vec3(2.4)), step(0.04045, vColor.rgb));');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vFinish;\nvarying vec3 vEmissiveV;')
      .replace('vec3 totalEmissiveRadiance = emissive;', `vec3 totalEmissiveRadiance = vEmissiveV;${far ? '\ndiffuseColor.rgb *= 1.0 - 0.15 * vFinish.z;' : ''}`)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = ${far ? 'max(vFinish.x, 0.5)' : 'vFinish.x'};`)
      .replace('#include <metalnessmap_fragment>', `float metalnessFactor = ${far ? '0.0' : 'vFinish.y'};`);
    prev.call(m, shader, renderer);
  };
  m.customProgramCacheKey = () => key + (far ? '|finish-far' : '|finish');
}

/**
 * Merge `parts` into one skinned mesh added to `owner` (the character's root), or null if
 * there's nothing to merge.
 */
export function bakeParts(owner: THREE.Object3D, parts: BakePart[], mats: Materials): Baked | null {
  owner.updateMatrixWorld(true);
  const toOwner = owner.matrixWorld.clone().invert();
  const boneOf = new Map<THREE.Object3D, number>();
  const bones: THREE.Object3D[] = [];
  const groups = new Map<string, { look: Look; geos: THREE.BufferGeometry[] }>();
  let cast = false;
  const c = new THREE.Color();
  const sc = new THREE.Color();
  const u8 = (v: number) => Math.round(THREE.MathUtils.clamp(v, 0, 1) * 255);
  for (const { mesh, color } of parts) {
    const mat = mesh.material as THREE.MeshStandardMaterial;
    const look = lookOf(mat);
    const joint = mesh.parent!;
    let bi = boneOf.get(joint);
    if (bi === undefined) {
      const bone = new Seen(owner);
      joint.add(bone);
      bi = bones.push(bone) - 1;
      boneOf.set(joint, bi);
    }
    const src = mesh.geometry;
    const pos = src.getAttribute('position');
    const n = pos.count;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(readVec(pos, 3), 3));
    const nor = src.getAttribute('normal');
    if (nor) g.setAttribute('normal', new THREE.BufferAttribute(readVec(nor, 3), 3));
    // Every part carries uvs (zeros when untextured) so all looks share one vertex layout.
    const uv = mat.map ? src.getAttribute('uv') : undefined;
    g.setAttribute('uv', uv ? new THREE.BufferAttribute(readVec(uv, 2), 2) : new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    g.setIndex(src.index ? Array.from(src.index.array as ArrayLike<number>) : Array.from({ length: n }, (_, i) => i));
    if (!nor) g.computeVertexNormals();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toOwner, mesh.matrixWorld));
    c.copy(color ?? mat.color);
    const vc = mat.vertexColors ? src.getAttribute('color') : undefined;
    const e = mat.emissive.clone().multiplyScalar(mat.emissiveIntensity ?? 1);
    // Colours as sRGB bytes (no banding in the darks); finish: roughness, metalness, textured.
    const cols = new Uint8Array(n * 4);
    const finish = new Uint8Array(n * 4);
    const emis = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      sc.setRGB(c.r * (vc ? vc.getX(i) : 1), c.g * (vc ? vc.getY(i) : 1), c.b * (vc ? vc.getZ(i) : 1)).convertLinearToSRGB();
      cols[i * 4] = u8(sc.r);
      cols[i * 4 + 1] = u8(sc.g);
      cols[i * 4 + 2] = u8(sc.b);
      cols[i * 4 + 3] = 255;
      finish[i * 4] = u8(mat.roughness);
      finish[i * 4 + 1] = u8(mat.metalness);
      finish[i * 4 + 2] = mat.map ? 255 : 0;
      emis[i * 3] = e.r;
      emis[i * 3 + 1] = e.g;
      emis[i * 3 + 2] = e.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 4, true));
    g.setAttribute('aFinish', new THREE.BufferAttribute(finish, 4, true));
    g.setAttribute('aEmissive', new THREE.BufferAttribute(emis, 3));
    const si = new Uint8Array(n * 4);
    const sw = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) {
      si[i * 4] = bi;
      sw[i * 4] = 255;
    }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4, true));
    let grp = groups.get(look.key);
    if (!grp) groups.set(look.key, (grp = { look, geos: [] }));
    grp.geos.push(g);
    cast ||= mesh.castShadow;
  }
  if (!groups.size) return null;

  // One group per look, in order, so the near materials line up with geometry.groups.
  const looks: Look[] = [];
  const perLook: THREE.BufferGeometry[] = [];
  for (const { look, geos } of groups.values()) {
    const merged = mergeGeometries(geos, false);
    for (const p of geos) p.dispose();
    if (!merged) continue;
    looks.push(look);
    perLook.push(merged);
  }
  const geometry = perLook.length ? mergeGeometries(perLook, true) : null;
  for (const p of perLook) p.dispose();
  if (!geometry) {
    for (const bone of bones) bone.removeFromParent();
    return null;
  }

  owner.updateMatrixWorld(true);
  // The bones are live Object3Ds (skinning only reads their matrixWorld). Their inverses come
  // from the joints themselves: a bone under a hidden joint is collapsed right now.
  const inverses = bones.map((b) => b.parent!.matrixWorld.clone().invert());
  const skeleton = new THREE.Skeleton(bones as THREE.Bone[], inverses);
  const near = looks.map((l) => mats.near(l));
  const mesh = new THREE.SkinnedMesh(geometry, near);
  // The rig moves the bones far from where they were baked (waving, sitting, lying): a generous bound.
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.7, 0), 1.2);
  mesh.castShadow = cast;
  mesh.receiveShadow = false;
  owner.add(mesh);
  mesh.updateMatrixWorld(true);
  mesh.bind(skeleton, mesh.matrixWorld);
  return { mesh, near, far: mats.far(), skeleton, geometry, bones };
}

/** Near (one draw per look) or far (one draw). */
export function setFar(b: Baked, far: boolean): void {
  b.mesh.material = far ? b.far : b.near;
}

export function disposeBaked(b: Baked): void {
  b.mesh.removeFromParent();
  b.geometry.dispose();
  for (const bone of b.bones) bone.removeFromParent();
  b.skeleton.dispose();
}
