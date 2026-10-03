// Lava lamp wax: soft blobs that rise from a warm puddle, stretch, merge, split, linger under
// the cap and sink back, glowing in each lamp's own colour inside its glass.
//
// One InstancedMesh draws every lamp's wax. Its geometry is only a cylinder just inside the
// glass; the fragment shader marches a smooth union of blobs in the lamp's own space and draws
// the wax where the ray meets it. The motion is a function of time alone, so the CPU sets one
// uniform per frame, and only when the lamps are drawn at all (frustum culling); the GPU only
// marches the pixels a lamp covers.
//
// The wax is opaque and writes its real depth, and it keeps 2.5 mm clear of the glass, which is
// translucent and never writes depth: the glass always draws over it, with no surfaces close
// enough to fight over a pixel.
import * as THREE from 'three';
import { catalogItem } from '../models';
import type { InstancedModel } from './modelkit';

type Vec3 = [number, number, number];

/** Gap between the wax and the glass (m): small enough not to show, far more than depth precision. */
const MARGIN = 0.0015;
/** Every motion repeats exactly over this many seconds, so the clock can wrap without a jump. */
const LOOP = 7200;
/** Rise-and-sink cycles per LOOP for each blob (about 19 to 28 s each), and their sizes (m). */
const CYCLES = [300, 340, 260, 380];
const RADII = [0.0135, 0.0115, 0.016, 0.0105];

/** The lamp's glass from its sidecar: the inside wall as (radius, height) pairs, bottom to top. */
let glass: { bottom: number; top: number; wall: THREE.Vector2[] } | null = null;
void catalogItem('lava_lamp').then((item) => {
  const a = item?.anchors as Record<string, Vec3> | undefined;
  const wall = Object.entries(a ?? {})
    .filter(([k]) => k.startsWith('glass_wall_'))
    .map(([, v]) => new THREE.Vector2(Math.hypot(v[0], v[2]), v[1]))
    .sort((p, q) => p.y - q.y);
  if (a?.glass_bottom && a.glass_top && wall.length >= 2) glass = { bottom: a.glass_bottom[1], top: a.glass_top[1], wall };
});

const vertexShader = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vEye;
  varying vec3 vView;
  varying vec3 vTint;
  varying float vSeed;
  varying float vScale;
  void main() {
    mat4 lamp = modelMatrix * instanceMatrix;
    vec4 view = viewMatrix * lamp * vec4(position, 1.0);
    vLocal = position;
    vEye = (inverse(lamp) * vec4(cameraPosition, 1.0)).xyz;
    vView = view.xyz;
    vTint = instanceColor;
    // Where the lamp stands picks its own rhythm, so neighbours never move in step.
    vSeed = fract(sin(dot(lamp[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
    vScale = length(lamp[0].xyz);
    gl_Position = projectionMatrix * view;
  }
`;

const fragmentShader = /* glsl */ `
  // three declares it for the vertex stage only; the wax's own depth needs it here too.
  uniform mat4 projectionMatrix;
  uniform float uTime;
  uniform vec2 uWall[8];
  uniform int uWalls;
  uniform vec2 uSpan;
  uniform float uRmax;
  varying vec3 vLocal;
  varying vec3 vEye;
  varying vec3 vView;
  varying vec3 vTint;
  varying float vSeed;
  varying float vScale;

  const float MARGIN = ${MARGIN};
  const float TAU = 6.28318530718;
  const float LOOP = ${LOOP.toFixed(1)};
  const float K = 0.012;
  const vec4 CYCLES = vec4(${CYCLES.map((c) => c.toFixed(1)).join(', ')});
  const vec4 RADII = vec4(${RADII.join(', ')});

  vec3 blobAt[4];
  vec3 blobSize[4];
  vec3 poolSize;

  /** Inside radius of the glass at height y (straight lines between the sidecar's points). */
  float wallR(float y) {
    float r = uWall[0].x;
    for (int i = 1; i < 8; i++) {
      if (i >= uWalls) break;
      vec2 a = uWall[i - 1];
      vec2 b = uWall[i];
      if (y >= a.y) r = mix(a.x, b.x, clamp((y - a.y) / max(b.y - a.y, 1e-5), 0.0, 1.0));
    }
    return r;
  }

  float ellipsoid(vec3 p, vec3 r) {
    float k0 = length(p / r);
    float k1 = length(p / (r * r));
    return k0 * (k0 - 1.0) / k1;
  }

  float smin(float a, float b, float k) {
    float h = max(k - abs(a - b), 0.0) / k;
    return min(a, b) - h * h * k * 0.25;
  }

  /** A soft-edged intersection: it only ever takes away, so the wax stays inside its bounds. */
  float smax(float a, float b, float k) {
    return -smin(-a, -b, k);
  }

  /** How fast smoothstep(a, b, u) changes at u. */
  float dsmooth(float a, float b, float u) {
    float x = clamp((u - a) / (b - a), 0.0, 1.0);
    return 6.0 * x * (1.0 - x) / (b - a);
  }

  /** Where every blob is now: up out of the puddle, a pause under the cap, back down again. */
  void place(float seed) {
    float y0 = uSpan.x;
    float y1 = uSpan.y;
    poolSize = vec3(0.06, 0.0105 + 0.0018 * sin(uTime * TAU * 150.0 / LOOP + seed * TAU), 0.06);
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      float u = fract(uTime * CYCLES[i] / LOOP + fi * 0.27 + seed);
      float h = smoothstep(0.04, 0.42, u) - smoothstep(0.55, 0.96, u);
      float r = RADII[i] * (0.9 + 0.2 * fract(seed * 7.0 + fi * 0.37));
      float y = mix(y0 + r * 0.2, y1 - r * 1.1, h);
      // Stretched tall while it moves, round again when it rests (the same volume either way).
      // Still in the puddle it stays round: wax domes up first and only stretches once it's free.
      float s = clamp((dsmooth(0.04, 0.42, u) + dsmooth(0.55, 0.96, u)) * 0.15, 0.0, 0.6) * smoothstep(0.02, 0.3, h);
      float room = max(wallR(y) - MARGIN - r, 0.0) * 0.45;
      float x = room * sin(TAU * (u * 2.0 + fi * 0.31 + seed));
      float z = room * cos(TAU * (u * 1.5 + fi * 0.17 + seed * 1.3));
      blobAt[i] = vec3(x, y, z);
      blobSize[i] = vec3(r / sqrt(1.0 + s), r * (1.0 + s), r / sqrt(1.0 + s));
    }
  }

  float map(vec3 p) {
    float d = ellipsoid(p - vec3(0.0, uSpan.x + 0.002, 0.0), poolSize);
    for (int i = 0; i < 4; i++) d = smin(d, ellipsoid(p - blobAt[i], blobSize[i]), K);
    // Only ever inside the glass, clear of it all round, with a rounded edge where it presses
    // against it (the puddle's rim, a blob squeezed into the neck under the cap).
    float wall = length(p.xz) - (wallR(p.y) - MARGIN);
    float span = max(uSpan.x - p.y, p.y - uSpan.y);
    return smax(d, max(wall, span), 0.005);
  }

  vec3 normalAt(vec3 p) {
    const vec2 k = vec2(1.0, -1.0);
    // Wide enough to round over the tight crease where a blob leaves the puddle (a narrow one
    // flips the normal there into a thin dark line), still well under a blob's size.
    const float e = 0.0009;
    return normalize(k.xyy * map(p + k.xyy * e) + k.yyx * map(p + k.yyx * e) + k.yxy * map(p + k.yxy * e) + k.xxx * map(p + k.xxx * e));
  }

  void main() {
    place(vSeed);
    vec3 rd = normalize(vLocal - vEye);
    vec3 p = vLocal;
    float t = 0.0;
    float d = 1.0;
    float rr = uRmax * uRmax * 1.02;
    // Close enough is about a pixel's width at that distance (more never shows, less only costs).
    float eye = length(vLocal - vEye);
    float eps = 0.0002;
    // The ray that came nearest to the wax without touching it, for rays that run out of steps
    // skimming a crease (where the puddle meets a blob): those count as a hit, never a hole.
    float nearest = 1.0;
    float tNearest = 0.0;
    bool left = false;
    for (int i = 0; i < 64; i++) {
      d = map(p);
      eps = max(0.0002, (eye + t) * 0.0007);
      if (d < eps) break;
      if (d < nearest) {
        nearest = d;
        tNearest = t;
      }
      t += max(d * 0.85, 0.0003);
      p = vLocal + rd * t;
      if (t > 0.25 || p.y < uSpan.x - 0.001 || p.y > uSpan.y + 0.001 || dot(p.xz, p.xz) > rr) {
        left = true;
        break;
      }
    }
    if (d >= eps) {
      // Out through the glass: a miss. Out of steps while still inside: it was skimming the wax.
      if (left || nearest > eps * 3.0) discard;
      t = tNearest;
      p = vLocal + rd * t;
    }

    vec3 n = normalAt(p);
    float facing = clamp(dot(n, -rd), 0.0, 1.0);
    // Lit from the bulb below: hottest low down, on the undersides and where it faces you;
    // deeper at the edges, so each blob reads round even from across the room.
    float heat = 1.0 - smoothstep(uSpan.x, uSpan.y, p.y);
    float under = clamp(0.5 - 0.5 * n.y, 0.0, 1.0);
    vec3 deep = vTint * 0.35;
    vec3 glow = vTint * (1.25 + 0.55 * heat + 0.35 * under) + vec3(0.12, 0.07, 0.02) * heat;
    vec3 col = mix(deep, glow, 0.25 + 0.75 * facing);
    col += vTint * pow(1.0 - facing, 3.0) * 0.3;
    // A soft gloss from the room light above.
    col += vec3(0.22) * pow(max(dot(n, normalize(vec3(0.3, 1.0, 0.2) - rd)), 0.0), 40.0);
    // It glows, but stays under the bloom threshold (post.ts, by luminance) even with the
    // glass's own glow on top: no halo, just the wax.
    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
    gl_FragColor = vec4(col * min(1.0, 0.9 / max(lum, 1e-4)), 1.0);

    // The depth of the wax itself, not of the cylinder around it.
    vec4 clip = projectionMatrix * vec4(vView + normalize(vView) * (t * vScale), 1.0);
    gl_FragDepth = clip.z / clip.w * 0.5 + 0.5;
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * The wax for the lamps `lamps` draws (instancedModel('lava_lamp')), one per copy, coloured
 * `tints` (in copy order). Null when there are no lamps or the model has no glass to fill.
 * Remove it with disposeInstanced, like the lamps.
 */
export function lavaWax(lamps: InstancedModel | null | undefined, tints: readonly string[]): THREE.Group | null {
  const glassMesh = lamps?.group.children.find((c): c is THREE.InstancedMesh => (c as THREE.InstancedMesh).isInstancedMesh && ((c as THREE.InstancedMesh).material as THREE.Material).name === 'Glass');
  const local = lamps?.partsOf('Glass')[0]?.matrix;
  if (!glassMesh || !local || !glass) return null;
  const y0 = glass.bottom + 0.003;
  const y1 = glass.top - 0.004;
  const wall = glass.wall.slice(0, 8);
  const rMax = Math.max(...wall.map((w) => w.x)) - MARGIN / 2;

  const geometry = new THREE.CylinderGeometry(rMax, rMax, y1 - y0 + 0.001, 28, 1, false).translate(0, (y0 + y1) / 2, 0);
  geometry.userData.owned = true;
  const material = new THREE.ShaderMaterial({
    name: 'LavaWax',
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uWall: { value: Array.from({ length: 8 }, (_, i) => wall[Math.min(i, wall.length - 1)].clone()) },
      uWalls: { value: wall.length },
      uSpan: { value: new THREE.Vector2(y0, y1) },
      uRmax: { value: rMax },
    },
  });
  material.userData.instanceOwned = true;

  // Each copy's glass is drawn at placement × (its node in the model); the wax wants the
  // placement in the model's own (fitted) space, where the sidecar's anchors are.
  const nodeScale = new THREE.Vector3();
  local.decompose(new THREE.Vector3(), new THREE.Quaternion(), nodeScale);
  const toLamp = local.clone().invert().multiply(new THREE.Matrix4().makeScale(nodeScale.x, nodeScale.y, nodeScale.z));
  const wax = new THREE.InstancedMesh(geometry, material, glassMesh.count);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  for (let i = 0; i < glassMesh.count; i++) {
    glassMesh.getMatrixAt(i, m);
    wax.setMatrixAt(i, m.multiply(toLamp));
    wax.setColorAt(i, c.set(tints[i] ?? '#FF7A6B'));
  }
  wax.castShadow = false;
  wax.receiveShadow = false;
  wax.computeBoundingSphere();
  wax.name = 'lava_lamp:wax';
  // The clock moves only while the wax is drawn: off screen, nothing runs.
  wax.onBeforeRender = () => {
    material.uniforms.uTime.value = (performance.now() / 1000) % LOOP;
  };
  const group = new THREE.Group();
  group.name = 'lava-wax';
  group.add(wax);
  return group;
}
