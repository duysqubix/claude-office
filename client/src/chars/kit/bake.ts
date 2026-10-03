// Draw-call baking (#57): a dressed character's parts merged into one skinned mesh.
//
// Every part keeps riding its own joint as a bone with one full weight, so springs, blinks, arm
// stretch, bouncing hair, the upright mug and the sip all still work. What used to make parts
// separate draws moves into vertex attributes (colour, roughness, metalness, rim, emissive), so
// one draw covers every part with the same texture: the geometry has one group per texture and
// the mesh draws with one material per group. Far away, the same geometry draws with a single
// material: one draw, each vertex carrying the colour of the texture it would have shown. Showing
// and hiding still works: a part's bone collapses to nothing whenever anything above it is hidden
// (mouth shapes, a mug put away).
//
// Joints scale non-uniformly (blinks, the needs-you arm stretch, squash), so the skinned normals
// take the inverse-transpose of each bone's change, not the change itself: the shading matches
// the separate parts in every pose, whatever pose the character was baked in.
import * as THREE from 'three';

export interface BakePart {
  mesh: THREE.Mesh;
  /** Casts a shadow (faces, glasses and the like don't). */
  casts: boolean;
  /**
   * A translucent part (the blush): it stays its own draw up close, so the near look leaves it
   * out; the far look has it baked opaque, pre-blended over what it sits on (`finish`).
   */
  farOnly?: boolean;
  /** Baked instead of the material's own look. */
  finish?: { color: THREE.Color; emissive: THREE.Color; roughness: number; rim: number };
}

export interface Look {
  key: string;
  map: THREE.Texture | null;
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
 * The soft-plastic fresnel rim of the characters' materials (rig.ts `plastic`), in GLSL, scaled
 * by `weight`: added to totalEmissiveRadiance right after emissivemap_fragment.
 */
export const rimTerm = (weight = '1.0'): string =>
  `{ float rimF = 1.0 - saturate(dot(normal, normalize(vViewPosition)));
  totalEmissiveRadiance += (${weight}) * (diffuseColor.rgb * 0.3 * pow(rimF, 2.6) + vec3(0.055, 0.05, 0.045) * pow(rimF, 5.0)); }`;

/** Emissive is stored as 16-bit fractions of this. */
const EMISSIVE_MAX = 8;

/**
 * The sun's shadow pass for every baked mesh: parts that didn't cast a shadow on their own (the
 * face, glasses, a lanyard) don't in the bake either; they're moved out of the shadow camera's view.
 */
const castDepth = new THREE.MeshDepthMaterial();
castDepth.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec4 aFinish;')
    .replace('#include <project_vertex>', '#include <project_vertex>\nif (aFinish.w < 0.5) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);');
};
castDepth.customProgramCacheKey = () => 'office-baked-casts';

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

/** Parts share a draw when they share a texture (and which faces show). */
function lookOf(m: THREE.MeshStandardMaterial, farOnly: boolean): Look {
  if (farOnly) return { key: 'far-only', map: null, side: m.side };
  return { key: `${m.map?.uuid ?? '-'}|${m.side}`, map: m.map, side: m.side };
}

/** Up close, the far-only group draws nothing (those parts draw themselves). */
const NOT_NEAR = new THREE.MeshBasicMaterial({ visible: false });

// ---------------------------------------------------------------------------------------
// Texture colours for the far look

/** A texture as seen from a distance: downsampled once, sampled per vertex. */
interface Texels {
  size: number;
  data: Uint8ClampedArray;
}
const FAR_TEXELS = 64;
const texelCache = new WeakMap<THREE.Texture, Texels | null>();

function texelsOf(map: THREE.Texture): Texels | null {
  const hit = texelCache.get(map);
  if (hit !== undefined) return hit;
  let t: Texels | null = null;
  const img = map.image as (CanvasImageSource & { width?: number; height?: number }) | undefined;
  try {
    const w = img?.width ?? 0;
    const h = img?.height ?? 0;
    if (img && w && h) {
      // An OffscreenCanvas reads back in a fraction of a millisecond (a page canvas's first
      // readback costs tens); then a box filter down to FAR_TEXELS square.
      const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
      const g = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
      if (g) {
        g.drawImage(img, 0, 0);
        const src = g.getImageData(0, 0, w, h).data;
        const s = FAR_TEXELS;
        const data = new Uint8ClampedArray(s * s * 4);
        for (let y = 0; y < s; y++) {
          const y0 = Math.floor((y * h) / s);
          const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * h) / s));
          for (let x = 0; x < s; x++) {
            const x0 = Math.floor((x * w) / s);
            const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * w) / s));
            let r = 0;
            let gg = 0;
            let b = 0;
            for (let yy = y0; yy < y1; yy++) {
              for (let xx = x0; xx < x1; xx++) {
                const o = (yy * w + xx) * 4;
                r += src[o];
                gg += src[o + 1];
                b += src[o + 2];
              }
            }
            const n = (y1 - y0) * (x1 - x0);
            const o = (y * s + x) * 4;
            data[o] = r / n;
            data[o + 1] = gg / n;
            data[o + 2] = b / n;
            data[o + 3] = 255;
          }
        }
        t = { size: s, data };
      }
    }
  } catch {
    t = null;
  }
  texelCache.set(map, t);
  return t;
}

/** Bilinear sample (clamped; glTF uvs, v down from the top) into out[o..o+2] as sRGB bytes. */
function sampleInto(t: Texels, u: number, v: number, out: Uint8Array, o: number): void {
  const s = t.size;
  const x = THREE.MathUtils.clamp(u * s - 0.5, 0, s - 1);
  const y = THREE.MathUtils.clamp(v * s - 0.5, 0, s - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, s - 1);
  const y1 = Math.min(y0 + 1, s - 1);
  const fx = x - x0;
  const fy = y - y0;
  const d = t.data;
  for (let c = 0; c < 3; c++) {
    const a = d[(y0 * s + x0) * 4 + c] * (1 - fx) + d[(y0 * s + x1) * 4 + c] * fx;
    const b = d[(y1 * s + x0) * 4 + c] * (1 - fx) + d[(y1 * s + x1) * 4 + c] * fx;
    out[o + c] = Math.round(a * (1 - fy) + b * fy);
  }
}

/**
 * Why a part with this texture can't be baked, or null if it can. Up close the baked mesh draws
 * it through channel 0's uvs (the only ones it keeps); far away its colours come from sampleInto,
 * which reads it as glTF lays it out: v down from the top (no flipY), clamped at the edges, no
 * offset, repeat or rotation. A part with any other texture stays its own draw.
 */
export function unbakeable(map: THREE.Texture): string | null {
  if (map.channel !== 0) return `uses uv channel ${map.channel}`;
  if (map.flipY) return 'is flipped (flipY)';
  if (map.wrapS !== THREE.ClampToEdgeWrapping || map.wrapT !== THREE.ClampToEdgeWrapping) return 'wraps';
  const moved = !map.matrixAutoUpdate || map.offset.x !== 0 || map.offset.y !== 0 || map.repeat.x !== 1 || map.repeat.y !== 1 || map.rotation !== 0;
  return moved ? 'has a uv transform' : null;
}

// ---------------------------------------------------------------------------------------
// Material

/**
 * The material for a baked mesh: vertex colours (stored as sRGB bytes), per-vertex roughness,
 * metalness, rim and emissive, and inverse-transpose normal skinning. `far` draws the texture
 * colour each vertex carries instead of a map.
 */
export function bakedMaterial(opts: { map: THREE.Texture | null; side: THREE.Side; far: boolean }): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, map: opts.map, side: opts.side });
  const far = opts.far;
  const srgbToLinear = (v: string) => `mix(${v} / 12.92, pow((${v} + 0.055) / 1.055, vec3(2.4)), step(0.04045, ${v}))`;
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec4 aFinish;
        attribute vec3 aEmissive;
        attribute vec4 aTexel;
        varying vec4 vFinish;
        varying vec3 vEmissiveV;
        varying vec3 vTexel;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vFinish = aFinish;
        vEmissiveV = aEmissive * ${EMISSIVE_MAX.toFixed(1)};
        vTexel = ${srgbToLinear('aTexel.rgb')};`,
      )
      .replace('#include <color_vertex>', `#include <color_vertex>\nvColor.rgb = ${srgbToLinear('vColor.rgb')};`)
      // Normals: the inverse-transpose of the bone's change (as the cofactor matrix; the length
      // doesn't matter, they're normalized per fragment). Every vertex has one bone, weight 1.
      .replace(
        '#include <skinnormal_vertex>',
        `#ifdef USE_SKINNING
        mat4 skinMatrix = bindMatrixInverse * boneMatX * bindMatrix;
        mat3 skinLinear = mat3(skinMatrix);
        mat3 skinCofactor = mat3(cross(skinLinear[1], skinLinear[2]), cross(skinLinear[2], skinLinear[0]), cross(skinLinear[0], skinLinear[1]));
        objectNormal = skinCofactor * objectNormal;
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vFinish;\nvarying vec3 vEmissiveV;\nvarying vec3 vTexel;')
      .replace('#include <color_fragment>', far ? '#include <color_fragment>\ndiffuseColor.rgb *= vTexel;' : '#include <color_fragment>')
      .replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = vEmissiveV;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vFinish.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vFinish.y;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${rimTerm('vFinish.z')}`);
  };
  m.customProgramCacheKey = () => (far ? 'office-baked-far' : 'office-baked');
  return m;
}

// ---------------------------------------------------------------------------------------
// Geometry

const u8 = (v: number) => Math.round(THREE.MathUtils.clamp(v, 0, 1) * 255);
const _m = new THREE.Matrix4();
const _nm = new THREE.Matrix3();
const _c = new THREE.Color();
const _e = new THREE.Color();

/**
 * Merge `parts` into one skinned mesh added to `owner` (the character's root), or null if
 * there's nothing to merge. It doesn't cast shadows yet: the caller decides (only its casting
 * parts ever do).
 */
export function bakeParts(owner: THREE.Object3D, parts: BakePart[], mats: Materials): Baked | null {
  owner.updateMatrixWorld(true);
  const toOwner = owner.matrixWorld.clone().invert();
  const boneOf = new Map<THREE.Object3D, number>();
  const joints: THREE.Object3D[] = [];
  // Looks in first-seen order, each with its parts and their bones.
  const looks: { look: Look; items: { part: BakePart; bone: number }[] }[] = [];
  const lookAt = new Map<string, number>();
  let verts = 0;
  let indices = 0;
  for (const part of parts) {
    const mat = part.mesh.material as THREE.MeshStandardMaterial;
    const look = lookOf(mat, !!part.farOnly);
    let li = lookAt.get(look.key);
    if (li === undefined) {
      li = looks.push({ look, items: [] }) - 1;
      lookAt.set(look.key, li);
    }
    const joint = part.mesh.parent!;
    let bi = boneOf.get(joint);
    if (bi === undefined) {
      bi = joints.push(joint) - 1;
      boneOf.set(joint, bi);
    }
    looks[li].items.push({ part, bone: bi });
    const g = part.mesh.geometry;
    verts += g.attributes.position.count;
    indices += g.index ? g.index.count : g.attributes.position.count;
  }
  if (!verts || joints.length > 255) return null;

  const pos = new Float32Array(verts * 3);
  const nor = new Int16Array(verts * 3);
  const uvs = new Float32Array(verts * 2);
  const col = new Uint8Array(verts * 4);
  const fin = new Uint8Array(verts * 4);
  const tex = new Uint8Array(verts * 4).fill(255);
  const emi = new Uint16Array(verts * 3);
  const si = new Uint8Array(verts * 4);
  const sw = new Uint8Array(verts * 4);
  const idx = verts > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
  const geometry = new THREE.BufferGeometry();
  let v0 = 0;
  let i0 = 0;
  looks.forEach(({ look, items }, li) => {
    const start = i0;
    for (const { part, bone } of items) {
      const mat = part.mesh.material as THREE.MeshStandardMaterial;
      let g = part.mesh.geometry;
      if (!g.attributes.normal) {
        g = g.clone();
        g.computeVertexNormals();
      }
      const P = g.attributes.position;
      const N = g.attributes.normal;
      const U = look.map || mat.map ? g.attributes.uv : undefined;
      const VC = mat.vertexColors ? g.attributes.color : undefined;
      const n = P.count;
      _m.multiplyMatrices(toOwner, part.mesh.matrixWorld);
      _nm.getNormalMatrix(_m);
      const me = _m.elements;
      const ne = _nm.elements;
      // Per part: its colour (sRGB bytes), finish and emissive.
      const f = part.finish;
      _c.copy(f ? f.color : mat.color);
      const lin = [_c.r, _c.g, _c.b];
      _c.convertLinearToSRGB();
      const cr = u8(_c.r);
      const cg = u8(_c.g);
      const cb = u8(_c.b);
      const rough = u8(f ? f.roughness : mat.roughness);
      const metal = u8(mat.metalness);
      const rim = u8(f ? f.rim : mat.userData.rim === true ? 1 : 0);
      const casts = part.casts ? 255 : 0;
      if (f) _e.copy(f.emissive);
      else _e.copy(mat.emissive).multiplyScalar(mat.emissiveIntensity ?? 1);
      const er = Math.round(THREE.MathUtils.clamp(_e.r / EMISSIVE_MAX, 0, 1) * 65535);
      const eg = Math.round(THREE.MathUtils.clamp(_e.g / EMISSIVE_MAX, 0, 1) * 65535);
      const eb = Math.round(THREE.MathUtils.clamp(_e.b / EMISSIVE_MAX, 0, 1) * 65535);
      const texels = mat.map && U ? texelsOf(mat.map) : null;
      for (let i = 0; i < n; i++) {
        const v = v0 + i;
        const x = P.getX(i);
        const y = P.getY(i);
        const z = P.getZ(i);
        pos[v * 3] = me[0] * x + me[4] * y + me[8] * z + me[12];
        pos[v * 3 + 1] = me[1] * x + me[5] * y + me[9] * z + me[13];
        pos[v * 3 + 2] = me[2] * x + me[6] * y + me[10] * z + me[14];
        const a = N.getX(i);
        const b = N.getY(i);
        const c = N.getZ(i);
        let nx = ne[0] * a + ne[3] * b + ne[6] * c;
        let ny = ne[1] * a + ne[4] * b + ne[7] * c;
        let nz = ne[2] * a + ne[5] * b + ne[8] * c;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len;
        ny /= len;
        nz /= len;
        nor[v * 3] = Math.round(nx * 32767);
        nor[v * 3 + 1] = Math.round(ny * 32767);
        nor[v * 3 + 2] = Math.round(nz * 32767);
        if (U) {
          uvs[v * 2] = U.getX(i);
          uvs[v * 2 + 1] = U.getY(i);
          if (texels) sampleInto(texels, uvs[v * 2], uvs[v * 2 + 1], tex, v * 4);
        }
        if (VC) {
          _c.setRGB(lin[0] * VC.getX(i), lin[1] * VC.getY(i), lin[2] * VC.getZ(i)).convertLinearToSRGB();
          col[v * 4] = u8(_c.r);
          col[v * 4 + 1] = u8(_c.g);
          col[v * 4 + 2] = u8(_c.b);
        } else {
          col[v * 4] = cr;
          col[v * 4 + 1] = cg;
          col[v * 4 + 2] = cb;
        }
        col[v * 4 + 3] = 255;
        fin[v * 4] = rough;
        fin[v * 4 + 1] = metal;
        fin[v * 4 + 2] = rim;
        fin[v * 4 + 3] = casts;
        emi[v * 3] = er;
        emi[v * 3 + 1] = eg;
        emi[v * 3 + 2] = eb;
        si[v * 4] = bone;
        sw[v * 4] = 255;
      }
      if (g.index) {
        const I = g.index.array;
        const ni = g.index.count;
        for (let k = 0; k < ni; k++) idx[i0 + k] = I[k] + v0;
        i0 += ni;
      } else {
        for (let k = 0; k < n; k++) idx[i0 + k] = v0 + k;
        i0 += n;
      }
      v0 += n;
      if (g !== part.mesh.geometry) g.dispose();
    }
    geometry.addGroup(start, i0 - start, li);
  });
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(nor, 3, true));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 4, true));
  geometry.setAttribute('aFinish', new THREE.BufferAttribute(fin, 4, true));
  geometry.setAttribute('aTexel', new THREE.BufferAttribute(tex, 4, true));
  geometry.setAttribute('aEmissive', new THREE.BufferAttribute(emi, 3, true));
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4, true));
  geometry.setIndex(new THREE.BufferAttribute(idx, 1));

  // The bones are live Object3Ds, one under each joint (skinning only reads their matrixWorld),
  // put on only now the merge is done: if it throws, nothing is left on the character.
  const bones: THREE.Object3D[] = joints.map((joint) => {
    const bone = new Seen(owner);
    joint.add(bone);
    return bone;
  });
  owner.updateMatrixWorld(true);
  // Their inverses come from the joints themselves: a bone under a hidden joint is collapsed right now.
  const inverses = bones.map((b) => b.parent!.matrixWorld.clone().invert());
  const skeleton = new THREE.Skeleton(bones as THREE.Bone[], inverses);
  const near = looks.map(({ look }) => (look.key === 'far-only' ? NOT_NEAR : mats.near(look)));
  const mesh = new THREE.SkinnedMesh(geometry, near);
  // The rig moves the bones far from where they were baked (waving, sitting, lying): a generous bound.
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.7, 0), 1.2);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.customDepthMaterial = castDepth;
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
