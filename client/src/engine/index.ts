import * as THREE from 'three';
import type { Engine } from '../world/types';
import { PALETTE } from '../style/palette';
import { createSky } from './sky';
import { createPost, type Post } from './post';

/** Engine plus the extras the world builder (and debug tools) use. Plain `Engine` users can ignore them. */
export interface OfficeEngine extends Engine {
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  /** Fit the sun's shadow frustum tightly around a world-space box. */
  fitShadows(box: THREE.Box3): void;
  /** Screen-space ambient occlusion (N8AO). Persists in localStorage. */
  setAO(on: boolean): void;
  readonly aoEnabled: boolean;
}

export function isOfficeEngine(engine: Engine): engine is OfficeEngine {
  return typeof (engine as Partial<OfficeEngine>).fitShadows === 'function';
}

/** Direction the sunlight comes from: high, from the south-east, so faces toward a south camera are lit. */
const SUN_FROM = new THREE.Vector3(0.42, 1.55, 0.62).normalize();
const AO_KEY = 'claude-office:ao';

export function createEngine(canvas: HTMLCanvasElement): OfficeEngine {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  // three r186 removed PCFSoftShadowMap; PCF now does a rotated Vogel-disk blur scaled by shadow.radius.
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.skyHorizon);
  scene.fog = new THREE.Fog(PALETTE.skyHorizon, 70, 250);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1200);
  camera.position.set(0, 9, 16);
  camera.lookAt(0, 0, 0);

  const hemi = new THREE.HemisphereLight('#BFE3FF', '#E8D3B0', 1.5);
  hemi.name = 'hemi';
  const ambient = new THREE.AmbientLight('#FFF6EA', 0.3);
  const sun = new THREE.DirectionalLight('#FFF1D6', 2.3);
  sun.name = 'sun';
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.025;
  sun.shadow.radius = 3.5;
  // Toy-box shadows: soft and never pitch black, the hemisphere light fills them in.
  sun.shadow.intensity = 0.8;
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

  function ensurePost(): Post | null {
    if (post) return post;
    try {
      post = createPost(renderer, scene, camera);
      post.setSize(size.w, size.h, renderer.getPixelRatio());
    } catch (err) {
      console.warn('[engine] ambient occlusion unavailable, rendering without it', err);
      aoEnabled = false;
    }
    return post;
  }

  function resize(): void {
    const inDom = canvas.clientWidth > 0 && canvas.clientHeight > 0;
    size.w = inDom ? canvas.clientWidth : window.innerWidth;
    size.h = inDom ? canvas.clientHeight : window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(size.w, size.h, !inDom);
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

  const t0 = performance.now();
  return {
    renderer,
    scene,
    camera,
    sun,
    hemi,
    fitShadows,
    get aoEnabled() {
      return aoEnabled;
    },
    setAO(on: boolean) {
      aoEnabled = on;
      try {
        localStorage.setItem(AO_KEY, on ? '1' : '0');
      } catch {
        // storage may be unavailable (private mode); the toggle still applies for this session
      }
    },
    render() {
      sky.update((performance.now() - t0) / 1000, camera);
      const p = aoEnabled ? ensurePost() : null;
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
