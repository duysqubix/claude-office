import * as THREE from 'three';
import { PALETTE } from '../style/palette';
import { model } from '../models';

/** Gradient sky dome plus a handful of puffy clouds drifting slowly across it. */
export interface Sky {
  group: THREE.Group;
  update(time: number, camera: THREE.Camera): void;
}

interface Cloud {
  x: number;
  y: number;
  z: number;
  speed: number;
  /** Rough width in metres (the catalog cloud is scaled to it). */
  size: number;
  yaw: number;
  puffs: { x: number; y: number; z: number; sx: number; sy: number; sz: number }[];
}

/** Catalog clouds (smooth, white): each cluster becomes one of them, sized to the cluster. */
const CLOUD_IDS = ['cloud_a', 'cloud_b', 'cloud_c'];

const DRIFT_SPAN = 520;

export function createSky(): Sky {
  const group = new THREE.Group();
  group.name = 'sky';

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(480, 48, 24),
    new THREE.ShaderMaterial({
      uniforms: {
        top: { value: new THREE.Color(PALETTE.skyDayTop) },
        horizon: { value: new THREE.Color(PALETTE.skyDayHorizon) },
        ground: { value: new THREE.Color('#BFE6C8') },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 top;
        uniform vec3 horizon;
        uniform vec3 ground;
        varying vec3 vDir;
        void main() {
          float h = normalize(vDir).y;
          vec3 c = h >= 0.0
            ? mix(horizon, top, pow(smoothstep(0.0, 0.85, h), 0.75))
            : mix(horizon, ground, smoothstep(0.0, -0.2, h));
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    }),
  );
  dome.name = 'sky-dome';
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  group.add(dome);

  // Clouds: one instanced mesh of squashed spheres, regrouped into clusters every frame.
  const rand = mulberry32(7);
  const clouds: Cloud[] = [];
  for (let i = 0; i < 11; i++) {
    const ang = (i / 11) * Math.PI * 2 + rand() * 0.4;
    const dist = 110 + rand() * 150;
    const size = 5 + rand() * 6;
    const puffs: Cloud['puffs'] = [];
    const n = 4 + Math.floor(rand() * 4);
    for (let p = 0; p < n; p++) {
      const t = n === 1 ? 0 : p / (n - 1) - 0.5;
      const r = size * (0.55 + rand() * 0.45) * (1 - Math.abs(t) * 0.6);
      puffs.push({
        x: t * size * 2.6 + (rand() - 0.5) * size * 0.4,
        y: r * 0.35 + rand() * size * 0.15,
        z: (rand() - 0.5) * size * 0.8,
        sx: r,
        sy: r * 0.78,
        sz: r * 0.9,
      });
    }
    // A flat-bottomed base so the cluster reads as one cloud.
    puffs.push({ x: 0, y: size * 0.1, z: 0, sx: size * 1.7, sy: size * 0.45, sz: size * 0.9 });
    clouds.push({
      x: Math.cos(ang) * dist,
      y: 48 + rand() * 40,
      z: Math.sin(ang) * dist,
      speed: 1.2 + rand() * 1.6,
      size: size * 3.2,
      yaw: rand() * Math.PI * 2,
      puffs,
    });
  }
  const count = clouds.reduce((n, c) => n + c.puffs.length, 0);
  const cloudMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 24, 16),
    new THREE.MeshStandardMaterial({
      color: PALETTE.cloudTint,
      emissive: '#EAF6FF',
      emissiveIntensity: 0.5,
      roughness: 1,
      metalness: 0,
      fog: false,
    }),
    count,
  );
  cloudMesh.name = 'clouds';
  cloudMesh.frustumCulled = false;
  group.add(cloudMesh);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  /** The catalog clouds, once loaded: one instanced mesh per cloud shape. */
  let shapes: { mesh: THREE.InstancedMesh; clouds: Cloud[]; width: number }[] | null = null;

  /** Drift along +X and wrap, so the sky slowly changes without ever emptying. */
  const driftX = (c: Cloud, time: number) => ((((c.x + time * c.speed + DRIFT_SPAN / 2) % DRIFT_SPAN) + DRIFT_SPAN) % DRIFT_SPAN) - DRIFT_SPAN / 2;

  function layoutClouds(time: number): void {
    if (shapes) {
      for (const shape of shapes) {
        shape.clouds.forEach((c, i) => {
          const k = c.size / shape.width;
          m.compose(p.set(driftX(c, time), c.y, c.z), q.setFromAxisAngle(up, c.yaw), s.set(k, k, k));
          shape.mesh.setMatrixAt(i, m);
        });
        shape.mesh.instanceMatrix.needsUpdate = true;
      }
      return;
    }
    let k = 0;
    q.identity();
    for (const c of clouds) {
      const x = driftX(c, time);
      for (const puff of c.puffs) {
        p.set(x + puff.x, c.y + puff.y, c.z + puff.z);
        s.set(puff.sx, puff.sy, puff.sz);
        m.compose(p, q, s);
        cloudMesh.setMatrixAt(k++, m);
      }
    }
    cloudMesh.instanceMatrix.needsUpdate = true;
  }
  layoutClouds(0);

  // Swap the puff clusters for the catalog clouds (same glowing white material, no fog).
  void Promise.all(CLOUD_IDS.map((id) => model(id, { shadows: false }))).then((roots) => {
    const geos = roots.map((root) => {
      let geo: THREE.BufferGeometry | null = null;
      root?.traverse((o) => {
        if (!geo && (o as THREE.Mesh).isMesh) geo = (o as THREE.Mesh).geometry;
      });
      return geo as THREE.BufferGeometry | null;
    });
    if (geos.some((g) => !g)) return;
    shapes = geos.map((geo, i) => {
      const own = clouds.filter((_, k) => k % CLOUD_IDS.length === i);
      geo!.computeBoundingBox();
      const mesh = new THREE.InstancedMesh(geo!, cloudMesh.material, own.length);
      mesh.name = `clouds:${CLOUD_IDS[i]}`;
      mesh.frustumCulled = false;
      group.add(mesh);
      return { mesh, clouds: own, width: geo!.boundingBox!.max.x - geo!.boundingBox!.min.x };
    });
    group.remove(cloudMesh);
    cloudMesh.geometry.dispose();
    cloudMesh.dispose();
  });

  return {
    group,
    update(time, camera) {
      // The dome rides with the camera so it is never clipped; clouds stay in world space.
      dome.position.copy(camera.position);
      layoutClouds(time);
    },
  };
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
