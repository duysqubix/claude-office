// The character model: a hierarchy of soft parts so every joint can lag and sway on its own.
//
// root (feet at y=0, yaw)
// └─ squash (squash-and-stretch, anchored at the feet)
//    └─ pelvis
//       ├─ torso (lower spine) ── lower bean, pants
//       │  └─ chest ── upper bean, tie, lanyard
//       │     ├─ neck → head (sphere, face, hair → jiggle, hat)
//       │     └─ armL/R (shoulder) → upper arm → elbowL/R → forearm → handL/R (mitten)
//       └─ legL/R (hip) → thigh → kneeL/R → shin → footL/R (shoe)
// + blob shadow (kept on the floor)
//
// Proportions and pivots come from rig-dimensions.json, shared with the Blender character
// kit. Every part is built by one function in PROCEDURAL_KIT; pass a partial PartKit to swap
// any of them (e.g. kit GLBs) and the rest fall back to these procedural meshes.
//
// Character-left is +X (they face +Z at yaw 0).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE } from '../style/palette';
import { ditherable, setDither } from './dither';
import { dressRig } from './kit';
import type { HairStyle, Looks } from './looks';
import RD from './rig-dimensions.json';

export const DIM = {
  pelvisY: RD.pelvisY,
  chestY: RD.torso.chestPivotY,
  hipX: RD.hip.x,
  shoulderX: RD.shoulder.x,
  shoulderY: RD.shoulder.y,
  neckY: RD.head.neckY,
  headR: RD.head.r,
  /** Head centre above the neck pivot. */
  headUp: RD.head.centerAboveNeck,
  upperArm: RD.upperArm.len,
  forearm: RD.forearm.len,
  /** Shoulder to mitten centre, arm straight. */
  armLen: RD.upperArm.len + RD.forearm.len + RD.hand.offset,
  thigh: RD.thigh.len,
  shin: RD.shin.len,
  /** Hip to ankle, leg straight (the gait's pendulum length). */
  legLen: RD.thigh.len + RD.shin.len,
  /** Ankle to sole. */
  footDrop: RD.foot.below + RD.foot.size[1] / 2,
};
/** Head centre above the pelvis. */
export const HEAD_Y = DIM.neckY + DIM.headUp;
const TORSO_Z = RD.torso.scaleZ;

// ---------------------------------------------------------------------------------------
// Materials

/**
 * Soft plastic with a fresnel rim in the surface's own colour. `warm` adds a little
 * red-shifted glow that lifts shadows like subsurface scattering (for skin).
 */
function plastic(color: string, roughness = 0.72, rim = true, opts: { warm?: boolean; vertexColors?: boolean } = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, vertexColors: !!opts.vertexColors });
  if (opts.warm) {
    const c = new THREE.Color(color);
    m.emissive.setRGB(c.r * 0.09, c.g * 0.045, c.b * 0.03);
  }
  if (rim) {
    m.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float rimF = 1.0 - saturate(dot(normal, normalize(vViewPosition)));
        totalEmissiveRadiance += diffuseColor.rgb * 0.3 * pow(rimF, 2.6) + vec3(0.055, 0.05, 0.045) * pow(rimF, 5.0);`,
      );
    };
    m.customProgramCacheKey = () => 'office-char-rim';
  }
  return m;
}

function darken(hex: string, f: number): string {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return '#' + c.getHexString();
}

/** Bake a gentle bottom-to-top shade into a geometry (multiplies the material colour). */
function shadeByHeight(g: THREE.BufferGeometry, y0: number, y1: number, lo = 0.86, hi = 1.04): THREE.BufferGeometry {
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp((pos.getY(i) - y0) / (y1 - y0), 0, 1);
    const v = lo + (hi - lo) * t * t * (3 - 2 * t);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// ---------------------------------------------------------------------------------------
// Shared geometry (unit shapes scaled per use; generous segment counts everywhere)

let shared: ReturnType<typeof makeShared> | null = null;
function makeShared() {
  const { upperArm: ua, forearm: fa, thigh: th, shin: sh } = RD;
  return {
    sphere: new THREE.SphereGeometry(1, 40, 28),
    sphereLo: new THREE.SphereGeometry(1, 20, 14),
    head: new THREE.SphereGeometry(RD.head.r, 56, 40),
    // Limb segments: capsules from the pivot down past the next joint, so bends look like noodles.
    upperArm: new THREE.CapsuleGeometry(ua.r, ua.len, 10, 22).translate(0, -ua.len / 2, 0),
    upperArmBare: new THREE.CapsuleGeometry(ua.r * 0.93, ua.len, 10, 22).translate(0, -ua.len / 2, 0),
    sleeve: new THREE.CapsuleGeometry(ua.r * 1.08, ua.len * 0.35, 10, 22).translate(0, -ua.len * 0.17, 0),
    forearm: new THREE.CapsuleGeometry(fa.r, fa.len, 10, 22).translate(0, -fa.len / 2, 0),
    thigh: new THREE.CapsuleGeometry(th.r, th.len, 10, 22).translate(0, -th.len / 2, 0),
    shin: new THREE.CapsuleGeometry(sh.r, sh.len, 10, 22).translate(0, -sh.len / 2, 0),
    smileGeo: facePath([-0.04, -0.074], [-0.022, -0.093], [0, -0.099], [0.022, -0.093], [0.04, -0.074]),
    flatGeo: facePath([-0.026, -0.094], [0, -0.096], [0.026, -0.094]),
    brow: new THREE.CapsuleGeometry(0.0115, 0.042, 6, 10),
    lens: new THREE.TorusGeometry(0.062, 0.0105, 10, 32),
    stick: new THREE.CylinderGeometry(0.008, 0.008, 1, 8),
    blob: new THREE.PlaneGeometry(1, 1),
    blobTex: makeBlobTexture(),
  };
}
function geo() {
  return (shared ??= makeShared());
}

/** A thin tube that lies on the head surface through face points (x, y). */
function facePath(...pts: [number, number][]): THREE.BufferGeometry {
  const r = RD.head.r + 0.0025;
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, Math.sqrt(r * r - x * x - y * y))));
  const tube = new THREE.TubeGeometry(curve, 24, 0.0068, 8);
  const cap = new THREE.SphereGeometry(0.0068, 10, 8);
  const ends = [curve.getPoint(0), curve.getPoint(1)].map((p) => cap.clone().translate(p.x, p.y, p.z));
  return mergeGeometries([tube.toNonIndexed(), ...ends.map((e) => e.toNonIndexed())]) ?? tube;
}

function makeBlobTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(40,34,60,0.55)');
  grad.addColorStop(0.55, 'rgba(40,34,60,0.28)');
  grad.addColorStop(1, 'rgba(40,34,60,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface TorsoGeo {
  /** Bean below the chest pivot (torso space = pelvis space). */
  lower: THREE.BufferGeometry;
  pants: THREE.BufferGeometry;
  /** Bean above the chest pivot plus a ball cap below it (chest space: y relative to the pivot). */
  upper: THREE.BufferGeometry;
  radiusAt: (y: number) => number;
}
const torsoCache = new Map<number, TorsoGeo>();

function torsoGeometry(girth: number): TorsoGeo {
  const key = Math.round(girth * 100);
  const hit = torsoCache.get(key);
  if (hit) return hit;
  const ctrl = RD.torso.profile as [number, number][];
  const curve = new THREE.SplineCurve(ctrl.map(([r, y]) => new THREE.Vector2(r * girth, y)));
  const pts = curve.getPoints(64).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y));
  pts[0].x = 0;
  pts[pts.length - 1].x = 0;
  const radiusAt = (y: number) => {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      if ((a.y - y) * (b.y - y) <= 0) {
        const t = b.y === a.y ? 0 : (y - a.y) / (b.y - a.y);
        return a.x + (b.x - a.x) * t;
      }
    }
    return 0;
  };
  const cy = RD.torso.chestPivotY;
  const rc = radiusAt(cy);
  const yTop = pts[pts.length - 1].y;
  const yBot = pts[0].y;
  // Lower bean: up to the pivot, closed with a flat-ish lid (hidden inside the chest's ball).
  const lowerPts = pts.filter((p) => p.y < cy).concat([new THREE.Vector2(rc, cy), new THREE.Vector2(0, cy)]);
  const lower = shadeByHeight(new THREE.LatheGeometry(lowerPts, 48), yBot, yTop);
  // Upper bean: a ball of radius rc centred on the pivot below it, so bending the chest
  // never opens a gap at the seam; then the profile from the pivot to the top.
  const ball: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * (Math.PI / 2);
    ball.push(new THREE.Vector2(rc * Math.sin(a), cy - rc * Math.cos(a)));
  }
  ball[0].x = 0;
  const upperPts = ball.concat(pts.filter((p) => p.y > cy)).map((p) => new THREE.Vector2(p.x, p.y - cy));
  const upper = shadeByHeight(new THREE.LatheGeometry(upperPts, 48), yBot - cy, yTop - cy);
  // Pants: the bottom of the bean, slightly proud of the shirt, with a rounded waistband lip.
  const belt = RD.torso.beltY;
  const off = RD.torso.pantsOffset;
  const pantsPts = pts.filter((p) => p.y <= belt).map((p) => new THREE.Vector2(p.x === 0 ? 0 : p.x + off, p.y - 0.004));
  const rb = radiusAt(belt);
  pantsPts.push(new THREE.Vector2(rb + off, belt), new THREE.Vector2(rb + off * 0.45, belt + 0.007), new THREE.Vector2(rb - 0.012, belt + 0.008));
  const pants = shadeByHeight(new THREE.LatheGeometry(pantsPts, 48), yBot, belt, 0.84, 1.0);
  const entry = { lower, pants, upper, radiusAt };
  torsoCache.set(key, entry);
  return entry;
}

const shellCache = new Map<string, THREE.BufferGeometry>();
/** Sphere shell around the head: theta from the crown, phi around (front = π/2). */
function shell(r: number, thetaStart: number, thetaLen: number, phiStart = 0, phiLen = Math.PI * 2): THREE.BufferGeometry {
  const key = [r, thetaStart, thetaLen, phiStart, phiLen].map((n) => n.toFixed(3)).join('|');
  let g = shellCache.get(key);
  if (!g) {
    g = new THREE.SphereGeometry(r, 48, 24, phiStart, phiLen, thetaStart, thetaLen);
    shellCache.set(key, g);
  }
  return g;
}

function sharedGeometries(): Set<THREE.BufferGeometry> {
  const set = new Set<THREE.BufferGeometry>(shellCache.values());
  for (const t of torsoCache.values()) set.add(t.lower).add(t.upper).add(t.pants);
  if (shared) for (const v of Object.values(shared)) if (v instanceof THREE.BufferGeometry) set.add(v);
  return set;
}

// ---------------------------------------------------------------------------------------
// Parts: one function per part. A kit (GLBs) can replace any of them.

export type Side = 1 | -1;
export type HairKind = 'tuft' | 'bob' | 'bun' | 'slick' | 'short' | 'back' | 'none';
export type HatKind = 'cap' | 'capBack' | 'beanie' | 'headphones';

/** What a part builder gets: the looks, the character's materials, and mesh/material registration. */
export interface PartCtx {
  looks: Looks;
  mats: {
    skin: THREE.Material;
    shirt: THREE.Material;
    /** Shirt with the baked height shade (torso only). */
    shirtBody: THREE.Material;
    pants: THREE.Material;
    pantsBody: THREE.Material;
    shoes: THREE.Material;
    hair: THREE.Material;
    hat: THREE.Material;
    hatDark: THREE.Material;
  };
  /** A mesh that belongs to this character (fades with it; casts shadows if asked). */
  mesh(geometry: THREE.BufferGeometry, material: THREE.Material, castShadow?: boolean): THREE.Mesh;
  /** Register an extra material so it fades with the character. */
  mat<M extends THREE.Material>(m: M): M;
  /** Front surface z of the torso at height y above the pelvis. */
  frontZ(y: number): number;
}

export interface PartKit {
  head(c: PartCtx): THREE.Object3D;
  torsoLower(c: PartCtx): THREE.Object3D;
  chest(c: PartCtx): THREE.Object3D;
  upperArm(c: PartCtx, side: Side): THREE.Object3D;
  forearm(c: PartCtx, side: Side): THREE.Object3D;
  hand(c: PartCtx, side: Side): THREE.Object3D;
  thigh(c: PartCtx, side: Side): THREE.Object3D;
  shin(c: PartCtx, side: Side): THREE.Object3D;
  foot(c: PartCtx, side: Side): THREE.Object3D;
  /** Hair meshes; anything that should jiggle extra goes in `jiggle` (pom-pom, bun, tuft). */
  hair(c: PartCtx, kind: HairKind, jiggle: THREE.Group): THREE.Object3D;
  hat(c: PartCtx, kind: HatKind, jiggle: THREE.Group): THREE.Object3D;
  glasses(c: PartCtx): THREE.Object3D;
  tie(c: PartCtx): THREE.Object3D;
  lanyard(c: PartCtx): THREE.Object3D;
  mug(c: PartCtx): THREE.Object3D;
  laptop(c: PartCtx): THREE.Object3D;
}

/** Hair and hat for each look. */
export function hairAndHat(style: HairStyle): { hair: HairKind; hat: HatKind | null } {
  switch (style) {
    case 'tuft':
    case 'bob':
    case 'bun':
    case 'slick':
      return { hair: style, hat: null };
    case 'cap':
    case 'capBack':
    case 'beanie':
      return { hair: 'back', hat: style };
    case 'headphones':
      return { hair: 'short', hat: 'headphones' };
    case 'bald':
      return { hair: 'none', hat: null };
  }
}

/** Put `obj` on the head sphere at face coords (x, y), `out` metres off the surface, facing outward. */
function onHead(obj: THREE.Object3D, x: number, y: number, out = 0): THREE.Object3D {
  const r = RD.head.r;
  const z = Math.sqrt(Math.max(0, r * r - x * x - y * y));
  const n = new THREE.Vector3(x, y, z).normalize();
  obj.position.copy(n).multiplyScalar(r + out);
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
  return obj;
}

const doubleSided = (m: THREE.Mesh) => {
  (m.material as THREE.Material).side = THREE.DoubleSide;
  return m;
};

export const PROCEDURAL_KIT: PartKit = {
  head: (c) => c.mesh(geo().head, c.mats.skin, true),

  torsoLower(c) {
    const t = torsoGeometry(c.looks.girth);
    const g = new THREE.Group();
    g.scale.z = TORSO_Z;
    g.add(c.mesh(t.lower, c.mats.shirtBody, true), c.mesh(t.pants, c.mats.pantsBody, true));
    return g;
  },

  chest(c) {
    const g = new THREE.Group();
    g.scale.z = TORSO_Z;
    g.add(c.mesh(torsoGeometry(c.looks.girth).upper, c.mats.shirtBody, true));
    return g;
  },

  upperArm(c) {
    const g = new THREE.Group();
    if (c.looks.sleeves === 'long') g.add(c.mesh(geo().upperArm, c.mats.shirt, true));
    else g.add(c.mesh(geo().upperArmBare, c.mats.skin, true), c.mesh(geo().sleeve, c.mats.shirt, true));
    return g;
  },

  forearm: (c) => c.mesh(geo().forearm, c.looks.sleeves === 'long' ? c.mats.shirt : c.mats.skin, true),

  hand(c) {
    // A mitten: a soft oval with a thumb nub pointing forward.
    const g = new THREE.Group();
    const [rx, ry, rz] = RD.hand.radii;
    const palm = c.mesh(geo().sphere, c.mats.skin, true);
    palm.scale.set(rx, ry, rz);
    palm.position.y = -RD.hand.offset;
    const thumb = c.mesh(geo().sphereLo, c.mats.skin, true);
    thumb.scale.setScalar(RD.hand.thumb.r);
    const [tx, ty, tz] = RD.hand.thumb.at;
    thumb.position.set(tx, -RD.hand.offset + ty, tz);
    g.add(palm, thumb);
    return g;
  },

  thigh: (c) => c.mesh(geo().thigh, c.mats.pants, true),
  shin: (c) => c.mesh(geo().shin, c.mats.pants, true),

  foot(c, side) {
    const g = new THREE.Group();
    const [w, h, l] = RD.foot.size;
    const shoe = c.mesh(geo().sphere, c.mats.shoes, true);
    shoe.scale.set(w / 2, h / 2, l / 2);
    shoe.position.set(0, -RD.foot.below, RD.foot.forward);
    g.add(shoe);
    g.rotation.y = side * THREE.MathUtils.degToRad(RD.foot.toeOutDeg);
    return g;
  },

  hair(c, kind, jiggle) {
    const H = new THREE.Group();
    const R = RD.head.r;
    const s = geo().sphere;
    const m = c.mats.hair;
    const backHair = (from: number, len: number) => H.add(doubleSided(c.mesh(shell(R * 1.035, from, len, Math.PI / 2 + 1.25, Math.PI * 2 - 2.5), m, true)));
    switch (kind) {
      case 'tuft': {
        const tufts: [number, number, number, number, number, number][] = [
          [0, 0.255, 0.035, 0.055, 0.11, 0.35],
          [0.04, 0.245, -0.005, 0.042, 0.085, -0.55],
          [-0.04, 0.245, -0.005, 0.042, 0.085, 0.55],
        ];
        for (const [x, y, z, w, h, tilt] of tufts) {
          const t = c.mesh(s, m, true);
          t.scale.set(w, h, w);
          t.position.set(x, y, z);
          if (Math.abs(x) < 0.01) t.rotation.x = tilt;
          else t.rotation.z = tilt;
          jiggle.add(t);
        }
        H.add(jiggle);
        break;
      }
      case 'bob': {
        const top = doubleSided(c.mesh(shell(R * 1.06, 0, 1.36), m, true));
        top.rotation.x = -0.16;
        H.add(top, doubleSided(c.mesh(shell(R * 1.075, 0.85, 1.12, Math.PI / 2 + 0.92, Math.PI * 2 - 1.84), m, true)));
        const fringe = c.mesh(s, m, true);
        fringe.scale.set(0.17, 0.06, 0.09);
        fringe.position.set(0.05, 0.17, 0.19);
        fringe.rotation.set(-0.55, 0, -0.32);
        H.add(fringe);
        break;
      }
      case 'bun': {
        const top = doubleSided(c.mesh(shell(R * 1.045, 0, 1.3), m, true));
        top.rotation.x = -0.36;
        H.add(top);
        backHair(1.0, 0.75);
        for (const s2 of [1, -1]) {
          const lock = c.mesh(s, m, true);
          lock.scale.set(0.11, 0.05, 0.08);
          lock.position.set(s2 * 0.1, 0.165, 0.17);
          lock.rotation.set(-0.7, 0, s2 * 0.5);
          H.add(lock);
        }
        const bun = c.mesh(s, m, true);
        bun.scale.setScalar(0.105);
        const tie = c.mesh(new THREE.TorusGeometry(0.07, 0.016, 10, 24), c.mats.hat);
        tie.rotation.x = Math.PI / 2 - 0.5;
        tie.position.y = -0.075;
        jiggle.add(bun, tie);
        jiggle.position.set(0, R * 0.98, -0.11);
        jiggle.rotation.x = -0.45;
        H.add(jiggle);
        break;
      }
      case 'slick': {
        const top = doubleSided(c.mesh(shell(R * 1.045, 0, 1.4), m, true));
        top.rotation.x = -0.24;
        H.add(top);
        backHair(1.1, 0.62);
        const quiff = c.mesh(s, m, true);
        quiff.scale.set(0.16, 0.065, 0.11);
        quiff.position.set(0.035, 0.215, 0.12);
        quiff.rotation.set(-0.55, 0.15, -0.22);
        jiggle.add(quiff);
        H.add(jiggle);
        break;
      }
      case 'short': {
        const top = doubleSided(c.mesh(shell(R * 1.035, 0, 1.3), m, true));
        top.rotation.x = -0.2;
        H.add(top);
        break;
      }
      case 'back':
        backHair(1.15, 0.6);
        break;
      case 'none':
        break;
    }
    return H;
  },

  hat(c, kind, jiggle) {
    const H = new THREE.Group();
    const R = RD.head.r;
    const s = geo().sphere;
    switch (kind) {
      case 'cap':
      case 'capBack': {
        const dome = doubleSided(c.mesh(shell(R * 1.06, 0, Math.PI / 2 + 0.06), c.mats.hat, true));
        dome.rotation.x = -0.34;
        const button = c.mesh(geo().sphereLo, c.mats.hat);
        button.scale.setScalar(0.024);
        button.position.set(0, R * 1.06 * Math.cos(0.34), -R * 1.06 * Math.sin(0.34));
        const brim = c.mesh(new THREE.CylinderGeometry(0.15, 0.158, 0.022, 36), c.mats.hat, true);
        brim.scale.z = 1.12;
        if (kind === 'cap') {
          brim.position.set(0, 0.085, 0.31);
          brim.rotation.x = 0.26;
        } else {
          brim.position.set(0, 0.03, -0.3);
          brim.rotation.x = 0.75;
        }
        H.add(dome, button, brim);
        break;
      }
      case 'beanie': {
        const b = new THREE.Group();
        b.rotation.x = -0.3;
        b.position.y = 0.035;
        const dome = doubleSided(c.mesh(shell(R * 1.07, 0, Math.PI / 2 + 0.1), c.mats.hat, true));
        dome.scale.y = 1.12;
        const band = c.mesh(new THREE.TorusGeometry(R * 1.075, 0.042, 14, 56), c.mats.hatDark, true);
        band.rotation.x = Math.PI / 2;
        band.position.y = -0.02;
        const pom = c.mesh(s, c.mats.hatDark, true);
        pom.scale.setScalar(0.072);
        jiggle.add(pom);
        jiggle.position.y = R * 1.07 * 1.12 + 0.045;
        b.add(dome, band, jiggle);
        H.add(b);
        break;
      }
      case 'headphones': {
        H.add(c.mesh(new THREE.TorusGeometry(R * 1.13, 0.024, 12, 40, Math.PI), c.mats.hatDark, true));
        for (const side of [1, -1]) {
          const cup = c.mesh(s, c.mats.hat, true);
          cup.scale.set(0.055, 0.092, 0.092);
          cup.position.set(side * R * 1.06, -0.01, 0);
          const pad = c.mesh(s, c.mats.hatDark);
          pad.scale.set(0.03, 0.08, 0.08);
          pad.position.set(side * R * 0.99, -0.01, 0);
          H.add(cup, pad);
        }
        break;
      }
    }
    return H;
  },

  glasses(c) {
    const g = geo();
    const frame = c.mat(plastic(c.looks.glassesColor, 0.4, false));
    const group = new THREE.Group();
    for (const side of [1, -1]) {
      const ring = c.mesh(g.lens, frame);
      onHead(ring, side * 0.09, -0.004, 0.026);
      const a = new THREE.Vector3(side * 0.152, 0.01, 0.245);
      const b = new THREE.Vector3(side * 0.262, 0.02, 0.0);
      const temple = c.mesh(g.stick, frame);
      temple.position.copy(a).add(b).multiplyScalar(0.5);
      temple.scale.set(1.1, a.distanceTo(b), 1.1);
      temple.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      group.add(ring, temple);
    }
    const bridge = c.mesh(g.stick, frame);
    bridge.scale.set(1, 0.06, 1);
    bridge.rotation.z = Math.PI / 2;
    bridge.position.set(0, 0.012, 0.283);
    group.add(bridge);
    return group;
  },

  tie(c) {
    // Built in pelvis space; the Rig re-parents it to the chest.
    const red = c.mat(plastic(PALETTE.managerTie, 0.55));
    const collar = c.mat(plastic('#F4F6FA', 0.8));
    const shape = new THREE.Shape();
    shape.moveTo(-0.026, 0);
    shape.lineTo(0.026, 0);
    shape.lineTo(0.05, -0.17);
    shape.lineTo(0, -0.225);
    shape.lineTo(-0.05, -0.17);
    shape.closePath();
    const g = new THREE.Group();
    const blade = c.mesh(
      new THREE.ExtrudeGeometry(shape, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.007, bevelSize: 0.008, bevelSegments: 4, curveSegments: 4 }),
      red,
      true,
    );
    const yTop = 0.255;
    blade.position.set(0, yTop, c.frontZ(yTop) - 0.004);
    blade.rotation.x = -0.2;
    const knot = c.mesh(geo().sphere, red, true);
    knot.scale.set(0.036, 0.03, 0.026);
    knot.position.set(0, 0.272, c.frontZ(0.272) + 0.006);
    g.add(blade, knot);
    for (const s of [1, -1]) {
      const col = c.mesh(geo().sphere, collar, true);
      col.scale.set(0.055, 0.022, 0.035);
      col.position.set(s * 0.05, 0.29, c.frontZ(0.29) - 0.006);
      col.rotation.set(-0.3, 0, s * -0.55);
      g.add(col);
    }
    return g;
  },

  lanyard(c) {
    // Built in pelvis space; the Rig re-parents it to the chest.
    const strap = c.mat(plastic(PALETTE.claude, 0.6));
    const card = c.mat(plastic('#FFFFFF', 0.5));
    const pts = [
      [-0.12, 0.33],
      [-0.085, 0.22],
      [-0.03, 0.15],
      [0.0, 0.135],
      [0.03, 0.15],
      [0.085, 0.22],
      [0.12, 0.33],
    ].map(([x, y]) => new THREE.Vector3(x, y, Math.sqrt(Math.max(0, c.frontZ(y) ** 2 - x * x * 0.72)) + 0.009));
    const g = new THREE.Group();
    g.add(c.mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.0075, 6), strap));
    const badge = new THREE.Group();
    const [bx, by] = RD.attach.chestBadge.at;
    badge.position.set(bx, by, c.frontZ(by) + 0.016);
    badge.rotation.x = -0.06;
    badge.add(c.mesh(new RoundedBoxGeometry(0.078, 0.098, 0.012, 2, 0.01), card, true));
    const stripe = c.mesh(new RoundedBoxGeometry(0.07, 0.022, 0.006, 2, 0.003), strap);
    stripe.position.set(0, 0.03, 0.006);
    const photo = c.mesh(new RoundedBoxGeometry(0.026, 0.03, 0.004, 2, 0.002), c.mat(plastic(c.looks.skin, 0.6, false)));
    photo.position.set(-0.018, -0.008, 0.007);
    badge.add(stripe, photo);
    g.add(badge);
    return g;
  },

  mug(c) {
    const cream = c.mat(plastic('#FFF4E0', 0.45));
    const coffee = c.mat(plastic(PALETTE.coffee, 0.3, false));
    const mug = new THREE.Group();
    mug.add(c.mesh(new THREE.CylinderGeometry(0.058, 0.052, 0.12, 28), cream, true));
    const top = c.mesh(new THREE.CircleGeometry(0.05, 24), coffee);
    top.rotation.x = -Math.PI / 2;
    top.position.y = 0.05;
    const handle = c.mesh(new THREE.TorusGeometry(0.032, 0.011, 8, 18, Math.PI * 1.2), cream);
    handle.position.set(0.058, 0.004, 0);
    handle.rotation.z = -Math.PI * 0.6;
    const stripe = c.mesh(new THREE.CylinderGeometry(0.0595, 0.0565, 0.022, 28, 1, true), c.mat(plastic(PALETTE.managerTie, 0.6, false)));
    stripe.position.y = -0.01;
    mug.add(top, handle, stripe);
    return mug;
  },

  laptop(c) {
    const body = c.mat(plastic('#C8D0DC', 0.45));
    const screenMat = c.mat(new THREE.MeshBasicMaterial({ color: PALETTE.screenGlow }));
    const keys = c.mat(plastic('#3B4252', 0.7, false));
    const lap = new THREE.Group();
    lap.add(c.mesh(new RoundedBoxGeometry(0.34, 0.024, 0.22, 2, 0.01), body, true));
    const kb = c.mesh(new RoundedBoxGeometry(0.28, 0.006, 0.1, 1, 0.002), keys);
    kb.position.set(0, 0.013, -0.02);
    const hinge = new THREE.Group();
    hinge.position.set(0, 0.01, 0.105);
    hinge.rotation.x = 0.32;
    const lid = c.mesh(new RoundedBoxGeometry(0.34, 0.22, 0.016, 2, 0.008), body, true);
    lid.position.y = 0.11;
    const screen = c.mesh(new THREE.PlaneGeometry(0.3, 0.18), screenMat);
    screen.position.set(0, 0.112, -0.0085);
    screen.rotation.y = Math.PI;
    const logo = c.mesh(geo().sphereLo, c.mat(plastic(PALETTE.claude, 0.5, false)));
    logo.scale.set(0.02, 0.02, 0.004);
    logo.position.set(0, 0.11, 0.009);
    hinge.add(lid, screen, logo);
    lap.add(kb, hinge);
    return lap;
  },
};

// ---------------------------------------------------------------------------------------

export type MouthShape = 'smile' | 'open' | 'flat';

export class Rig {
  readonly root = new THREE.Group();
  readonly squash = new THREE.Group();
  readonly pelvis = new THREE.Group();
  /** Lower spine (pivot at the pelvis). */
  readonly torso = new THREE.Group();
  /** Upper spine (pivot at chestY above the pelvis): head, arms, tie and lanyard ride on it. */
  readonly chest = new THREE.Group();
  readonly neck = new THREE.Group();
  readonly head = new THREE.Group();
  readonly hair = new THREE.Group();
  /** Pom-pom / bun / tuft / quiff: an extra-jiggly child of the hair. */
  readonly jiggle = new THREE.Group();
  /** Shoulders. */
  readonly armL = new THREE.Group();
  readonly armR = new THREE.Group();
  readonly elbowL = new THREE.Group();
  readonly elbowR = new THREE.Group();
  /** Wrists (mittens hang off these). */
  readonly handL = new THREE.Group();
  readonly handR = new THREE.Group();
  /** Hips. */
  readonly legL = new THREE.Group();
  readonly legR = new THREE.Group();
  readonly kneeL = new THREE.Group();
  readonly kneeR = new THREE.Group();
  /** Ankles. */
  readonly footL = new THREE.Group();
  readonly footR = new THREE.Group();
  readonly eyeL = new THREE.Group();
  readonly eyeR = new THREE.Group();
  readonly eyes = new THREE.Group();
  readonly browL = new THREE.Group();
  readonly browR = new THREE.Group();
  readonly shadow: THREE.Mesh;
  /** Manager's coffee mug (child of the right hand), if any. */
  mug: THREE.Object3D | null = null;
  /** Intern's laptop (child of the pelvis), if any. */
  laptop: THREE.Object3D | null = null;
  hasJiggle = false;

  private upperL = new THREE.Group();
  private upperR = new THREE.Group();
  private lowerL = new THREE.Group();
  private lowerR = new THREE.Group();
  private mouths: Record<MouthShape, THREE.Object3D>;
  private mouth: MouthShape | null = null;
  private materials: THREE.Material[] = [];
  private casters: THREE.Mesh[] = [];
  private baseOpacity = new Map<THREE.Material, number>();
  private opacity = 1;

  constructor(
    readonly looks: Looks,
    kit: Partial<PartKit> = {},
  ) {
    const K: PartKit = { ...PROCEDURAL_KIT, ...kit };
    const g = geo();
    const reg = <M extends THREE.Material>(m: M): M => {
      this.materials.push(m);
      this.baseOpacity.set(m, m.opacity);
      return ditherable(m);
    };
    const radiusAt = torsoGeometry(looks.girth).radiusAt;
    const ctx: PartCtx = {
      looks,
      mats: {
        skin: reg(plastic(looks.skin, 0.62, true, { warm: true })),
        shirt: reg(plastic(looks.shirt, 0.8)),
        shirtBody: reg(plastic(looks.shirt, 0.8, true, { vertexColors: true })),
        pants: reg(plastic(looks.pants, 0.82)),
        pantsBody: reg(plastic(looks.pants, 0.82, true, { vertexColors: true })),
        shoes: reg(plastic(looks.shoes, 0.55)),
        hair: reg(plastic(looks.hair, 0.68)),
        hat: reg(plastic(looks.hatColor, 0.78)),
        hatDark: reg(plastic(darken(looks.hatColor, 0.45), 0.6)),
      },
      mesh: (geometry, material, castShadow = false) => {
        const m = new THREE.Mesh(geometry, material);
        m.castShadow = castShadow;
        if (castShadow) this.casters.push(m);
        return m;
      },
      mat: reg,
      frontZ: (y) => radiusAt(y) * TORSO_Z,
    };
    const eye = reg(plastic(PALETTE.eye, 0.22, false));
    const white = reg(new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    const cheek = reg(new THREE.MeshBasicMaterial({ color: PALETTE.cheek, transparent: true, opacity: 0.55, depthWrite: false }));
    const mouthMat = reg(plastic(PALETTE.mouth, 0.5, false));
    const browMat = reg(plastic(darken(looks.hair, 0.55), 0.7, false));

    this.root.name = 'character';
    this.root.scale.setScalar(looks.scale);
    this.root.add(this.squash);
    this.squash.add(this.pelvis);
    this.pelvis.position.y = DIM.pelvisY;
    this.pelvis.add(this.torso);

    // Blob shadow
    const blobMat = reg(new THREE.MeshBasicMaterial({ map: g.blobTex, transparent: true, depthWrite: false, opacity: 1 }));
    this.shadow = new THREE.Mesh(g.blob, blobMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.scale.setScalar(0.95);
    this.shadow.position.y = 0.022;
    this.shadow.renderOrder = -1;
    this.root.add(this.shadow);

    // Spine
    this.torso.add(K.torsoLower(ctx));
    this.chest.position.y = DIM.chestY;
    this.torso.add(this.chest);
    this.chest.add(K.chest(ctx));

    // Head
    this.neck.position.y = DIM.neckY - DIM.chestY;
    this.chest.add(this.neck);
    this.head.position.y = DIM.headUp;
    this.neck.add(this.head);
    this.head.add(K.head(ctx));
    this.buildFace(ctx, eye, white, cheek, browMat);
    this.head.add(this.hair);
    const { hair, hat } = hairAndHat(looks.hairStyle);
    this.hair.add(K.hair(ctx, hair, this.jiggle));
    if (hat) this.hair.add(K.hat(ctx, hat, this.jiggle));
    this.hasJiggle = this.jiggle.children.length > 0;
    if (looks.glasses) this.head.add(K.glasses(ctx));

    // Arms: shoulder → upper arm → elbow → forearm → wrist → mitten
    for (const [arm, upper, elbow, lower, hand, side] of [
      [this.armL, this.upperL, this.elbowL, this.lowerL, this.handL, 1],
      [this.armR, this.upperR, this.elbowR, this.lowerR, this.handR, -1],
    ] as const) {
      arm.position.set(side * DIM.shoulderX * looks.girth, DIM.shoulderY - DIM.chestY, 0);
      this.chest.add(arm);
      arm.add(upper);
      upper.add(K.upperArm(ctx, side));
      elbow.position.y = -DIM.upperArm;
      arm.add(elbow);
      elbow.add(lower);
      lower.add(K.forearm(ctx, side));
      hand.position.y = -DIM.forearm;
      elbow.add(hand);
      hand.add(K.hand(ctx, side));
    }

    // Legs: hip → thigh → knee → shin → ankle → shoe
    for (const [leg, knee, foot, side] of [
      [this.legL, this.kneeL, this.footL, 1],
      [this.legR, this.kneeR, this.footR, -1],
    ] as const) {
      leg.position.set(side * DIM.hipX, 0, 0);
      this.pelvis.add(leg);
      leg.add(K.thigh(ctx, side));
      knee.position.y = -DIM.thigh;
      leg.add(knee);
      knee.add(K.shin(ctx, side));
      foot.position.y = -DIM.shin;
      knee.add(foot);
      foot.add(K.foot(ctx, side));
    }

    // Accessories (tie and lanyard are authored in pelvis space; they ride on the chest)
    const onChest = (o: THREE.Object3D) => {
      o.position.y -= DIM.chestY;
      this.chest.add(o);
    };
    if (looks.tie) onChest(K.tie(ctx));
    if (looks.lanyard) onChest(K.lanyard(ctx));
    if (looks.mug) {
      this.mug = K.mug(ctx);
      const [gx, gy, gz] = RD.attach.handGrip.at;
      this.mug.position.set(gx, gy - RD.hand.offset, gz);
      this.handR.add(this.mug);
    }
    if (looks.laptop) {
      this.laptop = K.laptop(ctx);
      this.laptop.position.set(0, 0.16, 0.3);
      this.pelvis.add(this.laptop);
    }

    this.mouths = this.buildMouths(ctx, mouthMat);
    this.setMouth('smile');
    // Swap in the modelled character kit when it's switched on (chars/kit; ?kit=1). It only
    // touches the rig once its parts have loaded, so this stays procedural until then.
    dressRig(this);
  }

  // -------------------------------------------------------------------------------------

  private buildFace(c: PartCtx, eye: THREE.Material, white: THREE.Material, cheek: THREE.Material, brow: THREE.Material) {
    const g = geo();
    const F = RD.face;
    this.head.add(this.eyes);
    for (const [grp, side] of [
      [this.eyeL, 1],
      [this.eyeR, -1],
    ] as const) {
      onHead(grp, side * F.eyes.x, F.eyes.y, -F.eyes.inset);
      this.eyes.add(grp);
      const e = c.mesh(g.sphere, eye);
      e.scale.set(F.eyes.radii[0], F.eyes.radii[1], F.eyes.radii[2]);
      const c1 = c.mesh(g.sphereLo, white);
      c1.scale.setScalar(0.0135);
      c1.position.set(side * 0.011, 0.022, 0.018);
      const c2 = c.mesh(g.sphereLo, white);
      c2.scale.setScalar(0.0065);
      c2.position.set(-side * 0.01, -0.018, 0.019);
      grp.add(e, c1, c2);
    }
    for (const [tilt, side] of [
      [this.browL, 1],
      [this.browR, -1],
    ] as const) {
      const holder = onHead(new THREE.Group(), side * F.brows.x, F.brows.y, 0.002);
      this.head.add(holder);
      holder.add(tilt);
      const b = c.mesh(g.brow, brow);
      b.rotation.z = Math.PI / 2;
      tilt.add(b);
    }
    for (const side of [1, -1]) {
      const ch = c.mesh(g.sphereLo, cheek);
      ch.scale.set(F.cheeks.radii[0], F.cheeks.radii[1], F.cheeks.radii[2]);
      onHead(ch, side * F.cheeks.x, F.cheeks.y, -0.004);
      ch.renderOrder = 1;
      ch.userData.cheek = true;
      this.head.add(ch);
    }
  }

  private buildMouths(c: PartCtx, mat: THREE.Material): Record<MouthShape, THREE.Object3D> {
    const g = geo();
    const smile = new THREE.Group();
    smile.add(c.mesh(g.smileGeo, mat));
    const open = onHead(new THREE.Group(), 0, -0.095, -0.006);
    const o = c.mesh(g.sphere, mat);
    o.scale.set(0.028, 0.034, 0.016);
    open.add(o);
    const flat = new THREE.Group();
    flat.add(c.mesh(g.flatGeo, mat));
    this.head.add(smile, open, flat);
    return { smile, open, flat };
  }

  // -------------------------------------------------------------------------------------

  /** Cartoon arm stretch (1 = normal): both segments lengthen, thinning a little. */
  setArmStretch(side: Side, s: number): void {
    const [upper, elbow, lower, hand] = side === 1 ? [this.upperL, this.elbowL, this.lowerL, this.handL] : [this.upperR, this.elbowR, this.lowerR, this.handR];
    const thin = 1 / Math.sqrt(s);
    upper.scale.set(thin, s, thin);
    lower.scale.set(thin, s, thin);
    elbow.position.y = -DIM.upperArm * s;
    hand.position.y = -DIM.forearm * s;
  }

  setMouth(shape: MouthShape): void {
    if (shape === this.mouth) return;
    this.mouth = shape;
    for (const k of Object.keys(this.mouths) as MouthShape[]) this.mouths[k].visible = k === shape;
  }

  /**
   * Fade the whole character (walk-in pop / walk-out fade, the camera crowding the manager).
   * Bodies dissolve as a screen-door dither (chars/dither.ts): solid pixels with depth writes,
   * so nothing behind or inside shows through; the floor blob just fades.
   */
  setOpacity(a: number): void {
    const v = Math.max(0, Math.min(1, a));
    if (Math.abs(v - this.opacity) < 1e-3) return;
    this.opacity = v;
    const opaque = v >= 0.999;
    const blob = this.shadow.material as THREE.Material;
    for (const m of this.materials) {
      if (m === blob) m.opacity = (this.baseOpacity.get(m) ?? 1) * v;
      else setDither(m, opaque ? 1 : v);
    }
    for (const m of this.casters) m.castShadow = opaque;
    this.root.visible = v > 0.001;
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const m of this.materials) m.dispose();
    const keep = sharedGeometries();
    this.root.traverse((o) => {
      const g = (o as THREE.Mesh).geometry;
      if (g && !keep.has(g)) g.dispose();
    });
  }
}
