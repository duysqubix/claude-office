import * as THREE from 'three';
import type { Engine } from '../world/types';
import { PALETTE } from '../style/palette';
import { createSky } from './sky';
import { createPost, type Post } from './post';
import { GRAPHICS, onGraphics, readGraphics, type GraphicsPreset } from './graphics';

/** Engine plus the extras the world builder (and debug tools) use. Plain `Engine` users can ignore them. */
export interface OfficeEngine extends Engine {
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  /** Fit the sun's shadow frustum tightly around a world-space box. */
  fitShadows(box: THREE.Box3): void;
  /** Screen-space ambient occlusion (N8AO). Persists in localStorage. Bloom, grade and SMAA stay on either way. */
  setAO(on: boolean): void;
  readonly aoEnabled: boolean;
  /** The graphics preset in use (engine/graphics.ts); the Help panel switches it live. */
  readonly graphics: GraphicsPreset;
}

export function isOfficeEngine(engine: Engine): engine is OfficeEngine {
  return typeof (engine as Partial<OfficeEngine>).fitShadows === 'function';
}

/**
 * Direction the sunlight comes from (art brief §3.2): 55° up, 40° east of the default camera
 * axis, so faces toward the usual south-facing camera are lit and shadows fall diagonally.
 */
const SUN_FROM = new THREE.Vector3(Math.sin(0.7) * Math.cos(0.96), Math.sin(0.96), Math.cos(0.7) * Math.cos(0.96)).normalize();
const AO_KEY = 'claude-office:ao';

export function createEngine(canvas: HTMLCanvasElement): OfficeEngine {
  // No MSAA backbuffer: the scene renders into the composer's targets and SMAA (post.ts) does
  // the anti-aliasing, so a multisampled canvas would only cost memory and a resolve per frame.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  let preset = readGraphics();
  let gfx = GRAPHICS[preset];
  const pixelRatio = () => Math.min(window.devicePixelRatio || 1, gfx.maxPixelRatio);
  renderer.setPixelRatio(pixelRatio());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  // three r186 removed PCFSoftShadowMap; PCF now does a rotated Vogel-disk blur scaled by shadow.radius.
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.skyDayHorizon);
  scene.fog = new THREE.Fog(PALETTE.skyDayHorizon, 60, 220);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1200);
  camera.position.set(0, 9, 16);
  camera.lookAt(0, 0, 0);

  // Warm sun + cool sky fill: lit floors ~2.5× brighter than shadowed ones, so shadows sit at
  // about 60 % brightness and stay saturated (never grey).
  const hemi = new THREE.HemisphereLight('#CFE6FF', '#EED7B0', 1.35);
  hemi.name = 'hemi';
  const ambient = new THREE.AmbientLight('#FFF6EA', 0.12);
  const sun = new THREE.DirectionalLight('#FFF1D6', 2.8);
  sun.name = 'sun';
  sun.castShadow = gfx.shadowMap > 0;
  sun.shadow.mapSize.setScalar(gfx.shadowMap || 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.025;
  sun.shadow.radius = 3.5;
  // Toy-box shadows: soft and never pitch black, the hemisphere light fills them in.
  sun.shadow.intensity = 0.85;
  scene.add(hemi, ambient, sun, sun.target);

  const sky = createSky();
  scene.add(sky.group);

  function fitShadows(box: THREE.Box3): void {
    const center = box.getCenter(new THREE.Vector3());
    sun.target.position.copy(center);
    sun.position.copy(center).addScaledVector(SUN_FROM, 60);
    sun.updateMatrixWorld();
    sun.target.updateMatrixWorld();
    const cam = sun.shadow.camera;
    cam.position.copy(sun.position);
    cam.lookAt(center);
    cam.updateMatrixWorld(true);
    const inv = cam.matrixWorldInverse;
    const min = new THREE.Vector3(Infinity, Infinity, Infinity);
    const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    const v = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
      v.applyMatrix4(inv);
      min.min(v);
      max.max(v);
    }
    cam.left = min.x;
    cam.right = max.x;
    cam.bottom = min.y;
    cam.top = max.y;
    cam.near = Math.max(0.5, -max.z - 5);
    cam.far = -min.z + 5;
    cam.updateProjectionMatrix();
    sun.shadow.needsUpdate = true;
  }
  fitShadows(new THREE.Box3(new THREE.Vector3(-17, 0, -13), new THREE.Vector3(17, 4, 14)));

  const size = { w: 1, h: 1 };
  let post: Post | null = null;
  let aoEnabled = readAOPref();

  let postFailed = false;
  function ensurePost(): Post | null {
    if (post || postFailed || !gfx.post) return post;
    try {
      post = createPost(renderer, scene, camera, aoEnabled, gfx);
      post.setSize(size.w, size.h, renderer.getPixelRatio());
    } catch (err) {
      console.warn('[engine] post-processing unavailable, rendering without it', err);
      postFailed = true;
    }
    return post;
  }

  // The canvas fills its container through CSS, so its drawing-buffer size (which grows with
  // the pixel ratio) can never feed back into its layout size.
  if (!canvas.style.width) canvas.style.width = '100%';
  if (!canvas.style.height) canvas.style.height = '100%';
  function resize(): void {
    size.w = Math.max(1, canvas.clientWidth || window.innerWidth);
    size.h = Math.max(1, canvas.clientHeight || window.innerHeight);
    renderer.setPixelRatio(pixelRatio());
    renderer.setSize(size.w, size.h, false);
    camera.aspect = size.w / size.h;
    camera.updateProjectionMatrix();
    post?.setSize(size.w, size.h, renderer.getPixelRatio());
  }
  resize();
  // Also follow the canvas's own CSS size (stylesheets can land after the engine is created).
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => {
      if (canvas.clientWidth !== size.w || canvas.clientHeight !== size.h) resize();
    }).observe(canvas);
  }

  /** Switch preset live: the pixel ratio, the sun's shadow map and a rebuilt post pipeline. */
  function applyGraphics(next: GraphicsPreset): void {
    if (next === preset) return;
    const was = gfx;
    preset = next;
    gfx = GRAPHICS[next];
    if (gfx.shadowMap !== was.shadowMap) {
      // Turning shadows on or off changes every lit material's program; three recompiles them on
      // the next frame (a one-off hitch, only when the preset changes).
      sun.castShadow = gfx.shadowMap > 0;
      if (gfx.shadowMap > 0) sun.shadow.mapSize.setScalar(gfx.shadowMap);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
      sun.shadow.needsUpdate = true;
    }
    post?.dispose();
    post = null;
    postFailed = false;
    resize();
  }
  onGraphics(applyGraphics);

  const t0 = performance.now();
  return {
    renderer,
    scene,
    camera,
    sun,
    hemi,
    fitShadows,
    get aoEnabled() {
      return aoEnabled && gfx.ao !== 'off';
    },
    get graphics() {
      return preset;
    },
    setAO(on: boolean) {
      aoEnabled = on;
      post?.setAO(on);
      try {
        localStorage.setItem(AO_KEY, on ? '1' : '0');
      } catch {
        // storage may be unavailable (private mode); the toggle still applies for this session
      }
    },
    render() {
      sky.update((performance.now() - t0) / 1000, camera);
      const p = ensurePost();
      if (p) p.render();
      else renderer.render(scene, camera);
    },
    resize,
  };
}

function readAOPref(): boolean {
  const param = new URLSearchParams(location.search).get('ao');
  if (param === '0' || param === '1') return param === '1';
  try {
    const v = localStorage.getItem(AO_KEY);
    if (v === '0' || v === '1') return v === '1';
  } catch {
    // ignore
  }
  return true;
}
