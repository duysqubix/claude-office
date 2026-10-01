// The character model: a hierarchy of soft primitives so every part can wobble on its own.
//
// root (feet at y=0, yaw)
// └─ squash (squash-and-stretch, anchored at the feet)
//    └─ pelvis
//       ├─ torso (lean / side / twist) ── shirt bean, pants, tie, lanyard
//       │  ├─ neck → head (sphere, face, hair → jiggle)
//       │  └─ armL / armR (pivot at shoulder) → sleeve, hand
//       └─ legL / legR (pivot at hip) → leg, foot
// + blob shadow (kept on the floor)
//
// Character-left is +X (they face +Z at yaw 0).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE } from '../style/palette';
import type { Looks } from './looks';

export const DIM = {
  pelvisY: 0.42,
  hipX: 0.105,
  shoulderX: 0.215,
  shoulderY: 0.25,
  neckY: 0.34,
  headR: 0.27,
  /** Head centre above the neck pivot. */
  headUp: 0.21,
  armLen: 0.29,
  legLen: 0.345,
};
/** Head centre above the pelvis. */
export const HEAD_Y = DIM.neckY + DIM.headUp;

// ---------------------------------------------------------------------------------------
// Materials

const RIM_KEY = 'office-char-rim';

/** Soft plastic: standard material plus a gentle fresnel rim in the surface's own colour. */
function plastic(color: string, roughness = 0.72, rim = true): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
  if (rim) {
    m.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float rimF = 1.0 - saturate(dot(normal, normalize(vViewPosition)));
        totalEmissiveRadiance += diffuseColor.rgb * 0.32 * pow(rimF, 2.6) + vec3(0.05) * pow(rimF, 5.0);`,
      );
    };
    m.customProgramCacheKey = () => RIM_KEY;
  }
  return m;
}

function darken(hex: string, f: number): string {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return '#' + c.getHexString();
}

// ---------------------------------------------------------------------------------------
// Shared geometry (unit shapes scaled per use; everything generous on segments)

let shared: ReturnType<typeof makeShared> | null = null;
function makeShared() {
  return {
    sphere: new THREE.SphereGeometry(1, 40, 28),
    sphereLo: new THREE.SphereGeometry(1, 20, 14),
    head: new THREE.SphereGeometry(DIM.headR, 56, 40),
    arm: new THREE.CapsuleGeometry(0.074, 0.15, 10, 20),
    armBare: new THREE.CapsuleGeometry(0.066, 0.15, 10, 20),
    sleeve: new THREE.CapsuleGeometry(0.079, 0.05, 10, 20),
    leg: new THREE.CapsuleGeometry(0.086, 0.17, 10, 20),
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
  const r = DIM.headR + 0.0025;
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, Math.sqrt(r * r - x * x - y * y))));
  const tube = new THREE.TubeGeometry(curve, 24, 0.0068, 8);
  // Round end caps.
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

// Torso bean profile (radius, height above pelvis), shared per girth.
const TORSO_CTRL: [number, number][] = [
  [0.0, -0.155],
  [0.12, -0.142],
  [0.205, -0.095],
  [0.243, 0.0],
  [0.24, 0.1],
  [0.214, 0.21],
  [0.165, 0.31],
  [0.09, 0.385],
  [0.0, 0.41],
];
const torsoCache = new Map<number, { shirt: THREE.BufferGeometry; pants: THREE.BufferGeometry; radiusAt: (y: number) => number }>();

function torsoGeometry(girth: number) {
  const key = Math.round(girth * 100);
  let entry = torsoCache.get(key);
  if (entry) return entry;
  const curve = new THREE.SplineCurve(TORSO_CTRL.map(([r, y]) => new THREE.Vector2(r * girth, y)));
  const pts = curve.getPoints(48).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y));
  pts[0].x = 0;
  pts[pts.length - 1].x = 0;
  const shirt = new THREE.LatheGeometry(pts, 40);
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
  // Pants: the bottom of the bean, slightly proud of the shirt, with a rounded waistband lip.
  const belt = 0.015;
  const pantsPts = pts.filter((p) => p.y <= belt).map((p) => new THREE.Vector2(p.x === 0 ? 0 : p.x + 0.011, p.y - 0.004));
  const rb = radiusAt(belt);
  pantsPts.push(new THREE.Vector2(rb + 0.011, belt), new THREE.Vector2(rb + 0.005, belt + 0.007), new THREE.Vector2(rb - 0.012, belt + 0.008));
  const pants = new THREE.LatheGeometry(pantsPts, 40);
  entry = { shirt, pants, radiusAt };
  torsoCache.set(key, entry);
  return entry;
}

const hairCache = new Map<string, THREE.BufferGeometry>();
/** Sphere shell around the head: theta from the crown, phi around (front = π/2). */
function shell(r: number, thetaStart: number, thetaLen: number, phiStart = 0, phiLen = Math.PI * 2): THREE.BufferGeometry {
  const key = [r, thetaStart, thetaLen, phiStart, phiLen].map((n) => n.toFixed(3)).join('|');
  let g = hairCache.get(key);
  if (!g) {
    g = new THREE.SphereGeometry(r, 48, 24, phiStart, phiLen, thetaStart, thetaLen);
    hairCache.set(key, g);
  }
  return g;
}

function sharedGeometries(): Set<THREE.BufferGeometry> {
  const set = new Set<THREE.BufferGeometry>(hairCache.values());
  for (const t of torsoCache.values()) set.add(t.shirt).add(t.pants);
  if (shared) for (const v of Object.values(shared)) if (v instanceof THREE.BufferGeometry) set.add(v);
  return set;
}

// ---------------------------------------------------------------------------------------

export type MouthShape = 'smile' | 'open' | 'flat';

export class Rig {
  readonly root = new THREE.Group();
  readonly squash = new THREE.Group();
  readonly pelvis = new THREE.Group();
  readonly torso = new THREE.Group();
  readonly neck = new THREE.Group();
  readonly head = new THREE.Group();
  readonly hair = new THREE.Group();
  /** Pom-pom / bun: an extra-jiggly child of the hair. */
  readonly jiggle = new THREE.Group();
  readonly armL = new THREE.Group();
  readonly armR = new THREE.Group();
  readonly handL = new THREE.Group();
  readonly handR = new THREE.Group();
  /** Scaled along the arm to stretch it (hands are repositioned to match). */
  readonly armStretchL = new THREE.Group();
  readonly armStretchR = new THREE.Group();
  readonly legL = new THREE.Group();
  readonly legR = new THREE.Group();
  readonly footL = new THREE.Group();
  readonly footR = new THREE.Group();
  readonly eyeL = new THREE.Group();
  readonly eyeR = new THREE.Group();
  readonly eyes = new THREE.Group();
  readonly browL = new THREE.Group();
  readonly browR = new THREE.Group();
  readonly shadow: THREE.Mesh;
  /** Manager's coffee mug (child of the right hand), if any. */
  mug: THREE.Group | null = null;
  /** Intern's laptop (child of the pelvis), if any. */
  laptop: THREE.Group | null = null;
  hasJiggle = false;

  private mouths: Record<MouthShape, THREE.Object3D>;
  private mouth: MouthShape | null = null;
  private materials: THREE.Material[] = [];
  private casters: THREE.Mesh[] = [];
  private baseOpacity = new Map<THREE.Material, number>();
  private opacity = 1;
  private torsoRadiusAt: (y: number) => number;
  private girth: number;

  constructor(readonly looks: Looks) {
    const g = geo();
    this.girth = looks.girth;
    const skin = this.mat(plastic(looks.skin, 0.68));
    const shirt = this.mat(plastic(looks.shirt, 0.78));
    const pants = this.mat(plastic(looks.pants, 0.8));
    const shoes = this.mat(plastic(looks.shoes, 0.6));
    const eye = this.mat(plastic(PALETTE.eye, 0.22, false));
    const white = this.mat(new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    const cheek = this.mat(new THREE.MeshBasicMaterial({ color: PALETTE.cheek, transparent: true, opacity: 0.55, depthWrite: false }));
    const mouthMat = this.mat(plastic(PALETTE.mouth, 0.5, false));
    const browMat = this.mat(plastic(darken(looks.hair, 0.55), 0.7, false));

    this.root.name = 'character';
    this.root.scale.setScalar(looks.scale);
    this.root.add(this.squash);
    this.squash.add(this.pelvis);
    this.pelvis.position.y = DIM.pelvisY;
    this.pelvis.add(this.torso);

    // Blob shadow
    const blobMat = this.mat(new THREE.MeshBasicMaterial({ map: g.blobTex, transparent: true, depthWrite: false, opacity: 1 }));
    this.shadow = new THREE.Mesh(g.blob, blobMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.scale.setScalar(0.95);
    this.shadow.position.y = 0.022;
    this.shadow.renderOrder = -1;
    this.root.add(this.shadow);

    // Torso
    const t = torsoGeometry(looks.girth);
    this.torsoRadiusAt = t.radiusAt;
    const shell3 = new THREE.Group();
    shell3.scale.z = 0.85;
    this.torso.add(shell3);
    shell3.add(this.mesh(t.shirt, shirt, true));
    shell3.add(this.mesh(t.pants, pants, true));

    // Head
    this.neck.position.y = DIM.neckY;
    this.torso.add(this.neck);
    this.head.position.y = DIM.headUp;
    this.neck.add(this.head);
    this.head.add(this.mesh(g.head, skin, true));
    this.buildFace(eye, white, cheek, browMat);
    this.head.add(this.hair);
    this.buildHair(looks);
    if (looks.glasses) this.buildGlasses(this.mat(plastic(looks.glassesColor, 0.4, false)));

    // Arms (the sleeve part can stretch like a noodle; the hand rides on the end)
    for (const [arm, stretch, side] of [
      [this.armL, this.armStretchL, 1],
      [this.armR, this.armStretchR, -1],
    ] as const) {
      arm.position.set(side * DIM.shoulderX * looks.girth, DIM.shoulderY, 0);
      this.torso.add(arm);
      arm.add(stretch);
      if (looks.sleeves === 'long') {
        const a = this.mesh(g.arm, shirt, true);
        a.position.y = -0.13;
        stretch.add(a);
      } else {
        const a = this.mesh(g.armBare, skin, true);
        a.position.y = -0.13;
        stretch.add(a);
        const s = this.mesh(g.sleeve, shirt, true);
        s.position.y = -0.035;
        stretch.add(s);
      }
      const hand = side === -1 ? this.handR : this.handL;
      hand.position.y = -DIM.armLen;
      arm.add(hand);
      const h = this.mesh(g.sphere, skin, true);
      h.scale.setScalar(0.084);
      hand.add(h);
    }

    // Legs
    for (const [leg, foot, side] of [
      [this.legL, this.footL, 1],
      [this.legR, this.footR, -1],
    ] as const) {
      leg.position.set(side * DIM.hipX, 0, 0);
      this.pelvis.add(leg);
      const l = this.mesh(g.leg, pants, true);
      l.position.y = -0.17;
      leg.add(l);
      foot.position.set(0, -DIM.legLen, 0.03);
      foot.rotation.y = side * 0.12;
      leg.add(foot);
      const shoe = this.mesh(g.sphere, shoes, true);
      shoe.scale.set(0.094, 0.07, 0.135);
      shoe.position.z = 0.022;
      foot.add(shoe);
    }

    // Accessories
    if (looks.tie) this.buildTie();
    if (looks.lanyard) this.buildLanyard();
    if (looks.mug) this.mug = this.buildMug();
    if (looks.laptop) this.laptop = this.buildLaptop();

    this.mouths = this.buildMouths(mouthMat);
    this.setMouth('smile');
  }

  // -------------------------------------------------------------------------------------

  private mat<M extends THREE.Material>(m: M): M {
    this.materials.push(m);
    this.baseOpacity.set(m, m.opacity);
    return m;
  }

  private mesh(geometry: THREE.BufferGeometry, material: THREE.Material, castShadow = false): THREE.Mesh {
    const m = new THREE.Mesh(geometry, material);
    m.castShadow = castShadow;
    if (castShadow) this.casters.push(m);
    return m;
  }

  /** Torso surface z (front) at height y above the pelvis. */
  private frontZ(y: number): number {
    return this.torsoRadiusAt(y) * 0.85;
  }

  /** Put `obj` on the head sphere at face coords (x, y), `out` metres off the surface, facing outward. */
  private onHead(obj: THREE.Object3D, x: number, y: number, out = 0): THREE.Object3D {
    const r = DIM.headR;
    const z = Math.sqrt(Math.max(0, r * r - x * x - y * y));
    const n = new THREE.Vector3(x, y, z).normalize();
    obj.position.copy(n).multiplyScalar(r + out);
    obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    return obj;
  }

  private buildFace(eye: THREE.Material, white: THREE.Material, cheek: THREE.Material, brow: THREE.Material) {
    const g = geo();
    this.head.add(this.eyes);
    for (const [grp, side] of [
      [this.eyeL, 1],
      [this.eyeR, -1],
    ] as const) {
      this.onHead(grp, side * 0.088, -0.005, -0.012);
      this.eyes.add(grp);
      const e = this.mesh(g.sphere, eye);
      e.scale.set(0.045 * 0.82, 0.045 * 1.22, 0.045 * 0.5);
      grp.add(e);
      const c1 = this.mesh(g.sphereLo, white);
      c1.scale.setScalar(0.0135);
      c1.position.set(side * 0.011, 0.022, 0.018);
      grp.add(c1);
      const c2 = this.mesh(g.sphereLo, white);
      c2.scale.setScalar(0.0065);
      c2.position.set(-side * 0.01, -0.018, 0.019);
      grp.add(c2);
    }
    for (const [tilt, side] of [
      [this.browL, 1],
      [this.browR, -1],
    ] as const) {
      const holder = this.onHead(new THREE.Group(), side * 0.092, 0.094, 0.002);
      this.head.add(holder);
      holder.add(tilt);
      const b = this.mesh(g.brow, brow);
      b.rotation.z = Math.PI / 2;
      tilt.add(b);
    }
    for (const side of [1, -1]) {
      const c = this.mesh(g.sphereLo, cheek);
      c.scale.set(0.046, 0.032, 0.012);
      this.onHead(c, side * 0.158, -0.062, -0.004);
      c.renderOrder = 1;
      this.head.add(c);
    }
  }

  private buildMouths(mat: THREE.Material): Record<MouthShape, THREE.Object3D> {
    const g = geo();
    const smile = new THREE.Group();
    smile.add(this.mesh(g.smileGeo, mat));
    const open = this.onHead(new THREE.Group(), 0, -0.095, -0.006);
    const o = this.mesh(g.sphere, mat);
    o.scale.set(0.028, 0.034, 0.016);
    open.add(o);
    const flat = new THREE.Group();
    flat.add(this.mesh(g.flatGeo, mat));
    this.head.add(smile, open, flat);
    return { smile, open, flat };
  }

  private buildGlasses(frame: THREE.Material) {
    const g = geo();
    const group = new THREE.Group();
    for (const side of [1, -1]) {
      const ring = this.mesh(g.lens, frame);
      this.onHead(ring, side * 0.09, -0.004, 0.026);
      group.add(ring);
      // Temple: from the lens's outer edge back along the side of the head.
      const a = new THREE.Vector3(side * 0.152, 0.01, 0.245);
      const b = new THREE.Vector3(side * 0.262, 0.02, 0.0);
      const temple = this.mesh(g.stick, frame);
      temple.position.copy(a).add(b).multiplyScalar(0.5);
      temple.scale.set(1.1, a.distanceTo(b), 1.1);
      temple.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      group.add(temple);
    }
    const bridge = this.mesh(g.stick, frame);
    bridge.scale.set(1, 0.06, 1);
    bridge.rotation.z = Math.PI / 2;
    bridge.position.set(0, 0.012, 0.283);
    group.add(bridge);
    this.head.add(group);
  }

  private buildHair(looks: Looks) {
    const g = geo();
    const hair = this.mat(plastic(looks.hair, 0.7));
    const hat = this.mat(plastic(looks.hatColor, 0.78));
    const dark = this.mat(plastic(darken(looks.hatColor, 0.45), 0.6));
    const H = this.hair;
    const R = DIM.headR;
    const side = (m: THREE.Mesh) => {
      (m.material as THREE.Material).side = THREE.DoubleSide;
      return m;
    };
    const backHair = (from: number, len: number) => {
      const m = side(this.mesh(shell(R * 1.035, from, len, Math.PI / 2 + 1.25, Math.PI * 2 - 2.5), hair, true));
      H.add(m);
    };
    switch (looks.hairStyle) {
      case 'tuft': {
        const tufts: [number, number, number, number, number, number][] = [
          [0, 0.255, 0.035, 0.055, 0.11, 0.35],
          [0.04, 0.245, -0.005, 0.042, 0.085, -0.55],
          [-0.04, 0.245, -0.005, 0.042, 0.085, 0.55],
        ];
        for (const [x, y, z, w, h, tilt] of tufts) {
          const m = this.mesh(g.sphere, hair, true);
          m.scale.set(w, h, w);
          m.position.set(x, y, z);
          if (Math.abs(x) < 0.01) m.rotation.x = tilt;
          else m.rotation.z = tilt;
          this.jiggle.add(m);
        }
        this.jiggle.position.y = 0.0;
        H.add(this.jiggle);
        this.hasJiggle = true;
        break;
      }
      case 'bob': {
        const top = side(this.mesh(shell(R * 1.06, 0, 1.36), hair, true));
        top.rotation.x = -0.16;
        H.add(top);
        const back = side(this.mesh(shell(R * 1.075, 0.85, 1.12, Math.PI / 2 + 0.92, Math.PI * 2 - 1.84), hair, true));
        H.add(back);
        // A soft fringe swoop over the forehead.
        const fringe = this.mesh(g.sphere, hair, true);
        fringe.scale.set(0.17, 0.06, 0.09);
        fringe.position.set(0.05, 0.17, 0.19);
        fringe.rotation.set(-0.55, 0, -0.32);
        H.add(fringe);
        break;
      }
      case 'cap':
      case 'capBack': {
        backHair(1.15, 0.6);
        const dome = this.mesh(shell(R * 1.06, 0, Math.PI / 2 + 0.06), hat, true);
        side(dome);
        dome.rotation.x = -0.34;
        H.add(dome);
        const button = this.mesh(g.sphereLo, hat);
        button.scale.setScalar(0.024);
        button.position.set(0, R * 1.06 * Math.cos(0.34), -R * 1.06 * Math.sin(0.34));
        H.add(button);
        const brim = this.mesh(new THREE.CylinderGeometry(0.15, 0.158, 0.022, 36), hat, true);
        brim.scale.z = 1.12;
        if (looks.hairStyle === 'cap') {
          brim.position.set(0, 0.085, 0.31);
          brim.rotation.x = 0.26;
        } else {
          brim.position.set(0, 0.03, -0.3);
          brim.rotation.x = 0.75;
        }
        H.add(brim);
        break;
      }
      case 'beanie': {
        backHair(1.2, 0.55);
        const b = new THREE.Group();
        b.rotation.x = -0.3;
        b.position.y = 0.035;
        H.add(b);
        const dome = side(this.mesh(shell(R * 1.07, 0, Math.PI / 2 + 0.1), hat, true));
        dome.scale.y = 1.12;
        b.add(dome);
        const band = this.mesh(new THREE.TorusGeometry(R * 1.075, 0.042, 14, 56), dark, true);
        band.rotation.x = Math.PI / 2;
        band.position.y = -0.02;
        b.add(band);
        const pom = this.mesh(g.sphere, dark, true);
        pom.scale.setScalar(0.072);
        this.jiggle.add(pom);
        this.jiggle.position.y = R * 1.07 * 1.12 + 0.045;
        b.add(this.jiggle);
        this.hasJiggle = true;
        break;
      }
      case 'bun': {
        const top = side(this.mesh(shell(R * 1.045, 0, 1.3), hair, true));
        top.rotation.x = -0.36;
        H.add(top);
        backHair(1.0, 0.75);
        for (const s2 of [1, -1]) {
          const lock = this.mesh(g.sphere, hair, true);
          lock.scale.set(0.11, 0.05, 0.08);
          lock.position.set(s2 * 0.1, 0.165, 0.17);
          lock.rotation.set(-0.7, 0, s2 * 0.5);
          H.add(lock);
        }
        const bun = this.mesh(g.sphere, hair, true);
        bun.scale.setScalar(0.105);
        this.jiggle.add(bun);
        const tie = this.mesh(new THREE.TorusGeometry(0.07, 0.016, 10, 24), hat);
        tie.rotation.x = Math.PI / 2 - 0.5;
        tie.position.y = -0.075;
        this.jiggle.add(tie);
        this.jiggle.position.set(0, R * 0.98, -0.11);
        this.jiggle.rotation.x = -0.45;
        H.add(this.jiggle);
        this.hasJiggle = true;
        break;
      }
      case 'headphones': {
        const top = side(this.mesh(shell(R * 1.035, 0, 1.3), hair, true));
        top.rotation.x = -0.2;
        H.add(top);
        const band = this.mesh(new THREE.TorusGeometry(R * 1.13, 0.024, 12, 40, Math.PI), dark, true);
        band.position.y = 0.0;
        H.add(band);
        for (const s of [1, -1]) {
          const cup = this.mesh(g.sphere, hat, true);
          cup.scale.set(0.055, 0.092, 0.092);
          cup.position.set(s * R * 1.06, -0.01, 0);
          H.add(cup);
          const pad = this.mesh(g.sphere, dark);
          pad.scale.set(0.03, 0.08, 0.08);
          pad.position.set(s * R * 0.99, -0.01, 0);
          H.add(pad);
        }
        break;
      }
      case 'slick': {
        const top = side(this.mesh(shell(R * 1.045, 0, 1.4), hair, true));
        top.rotation.x = -0.24;
        H.add(top);
        backHair(1.1, 0.62);
        const quiff = this.mesh(g.sphere, hair, true);
        quiff.scale.set(0.16, 0.065, 0.11);
        quiff.position.set(0.035, 0.215, 0.12);
        quiff.rotation.set(-0.55, 0.15, -0.22);
        this.jiggle.add(quiff);
        H.add(this.jiggle);
        this.hasJiggle = true;
        break;
      }
      case 'bald':
        break;
    }
  }

  private buildTie() {
    const red = this.mat(plastic(PALETTE.managerTie, 0.55));
    const collar = this.mat(plastic('#F4F6FA', 0.8));
    const shape = new THREE.Shape();
    shape.moveTo(-0.026, 0);
    shape.lineTo(0.026, 0);
    shape.lineTo(0.05, -0.17);
    shape.lineTo(0, -0.225);
    shape.lineTo(-0.05, -0.17);
    shape.closePath();
    const blade = this.mesh(
      new THREE.ExtrudeGeometry(shape, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.007, bevelSize: 0.008, bevelSegments: 4, curveSegments: 4 }),
      red,
      true,
    );
    const yTop = 0.255;
    blade.position.set(0, yTop, this.frontZ(yTop) - 0.004);
    blade.rotation.x = -0.2;
    this.torso.add(blade);
    const knot = this.mesh(geo().sphere, red, true);
    knot.scale.set(0.036, 0.03, 0.026);
    knot.position.set(0, 0.272, this.frontZ(0.272) + 0.006);
    this.torso.add(knot);
    for (const s of [1, -1]) {
      const c = this.mesh(geo().sphere, collar, true);
      c.scale.set(0.055, 0.022, 0.035);
      c.position.set(s * 0.05, 0.29, this.frontZ(0.29) - 0.006);
      c.rotation.set(-0.3, 0, s * -0.55);
      this.torso.add(c);
    }
  }

  private buildLanyard() {
    const strap = this.mat(plastic(PALETTE.claude, 0.6));
    const card = this.mat(plastic('#FFFFFF', 0.5));
    const pts = [
      [-0.12, 0.33],
      [-0.085, 0.22],
      [-0.03, 0.15],
      [0.0, 0.135],
      [0.03, 0.15],
      [0.085, 0.22],
      [0.12, 0.33],
    ].map(([x, y]) => new THREE.Vector3(x, y, Math.sqrt(Math.max(0, this.frontZ(y) ** 2 - x * x * 0.72)) + 0.009));
    const tube = this.mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.0075, 6), strap);
    this.torso.add(tube);
    const badge = new THREE.Group();
    badge.position.set(0, 0.085, this.frontZ(0.085) + 0.016);
    badge.rotation.x = -0.06;
    const body = this.mesh(new RoundedBoxGeometry(0.078, 0.098, 0.012, 2, 0.01), card, true);
    badge.add(body);
    const stripe = this.mesh(new RoundedBoxGeometry(0.07, 0.022, 0.006, 2, 0.003), strap);
    stripe.position.set(0, 0.03, 0.006);
    badge.add(stripe);
    const photo = this.mesh(new RoundedBoxGeometry(0.026, 0.03, 0.004, 2, 0.002), this.mat(plastic(this.looks.skin, 0.6, false)));
    photo.position.set(-0.018, -0.008, 0.007);
    badge.add(photo);
    this.torso.add(badge);
  }

  private buildMug(): THREE.Group {
    const cream = this.mat(plastic('#FFF4E0', 0.45));
    const coffee = this.mat(plastic(PALETTE.coffee, 0.3, false));
    const mug = new THREE.Group();
    const body = this.mesh(new THREE.CylinderGeometry(0.058, 0.052, 0.12, 28), cream, true);
    mug.add(body);
    const top = this.mesh(new THREE.CircleGeometry(0.05, 24), coffee);
    top.rotation.x = -Math.PI / 2;
    top.position.y = 0.05;
    mug.add(top);
    const handle = this.mesh(new THREE.TorusGeometry(0.032, 0.011, 8, 18, Math.PI * 1.2), cream);
    handle.position.set(0.058, 0.004, 0);
    handle.rotation.z = -Math.PI * 0.6;
    mug.add(handle);
    const stripe = this.mesh(new THREE.CylinderGeometry(0.0595, 0.0565, 0.022, 28, 1, true), this.mat(plastic(PALETTE.managerTie, 0.6, false)));
    stripe.position.y = -0.01;
    mug.add(stripe);
    mug.position.set(0, -0.03, 0.07);
    this.handR.add(mug);
    return mug;
  }

  private buildLaptop(): THREE.Group {
    const shell = this.mat(plastic('#C8D0DC', 0.45));
    const screenMat = this.mat(new THREE.MeshBasicMaterial({ color: PALETTE.screenGlow }));
    const keys = this.mat(plastic('#3B4252', 0.7, false));
    const lap = new THREE.Group();
    const base = this.mesh(new RoundedBoxGeometry(0.34, 0.024, 0.22, 2, 0.01), shell, true);
    lap.add(base);
    const kb = this.mesh(new RoundedBoxGeometry(0.28, 0.006, 0.1, 1, 0.002), keys);
    kb.position.set(0, 0.013, -0.02);
    lap.add(kb);
    const hinge = new THREE.Group();
    hinge.position.set(0, 0.01, 0.105);
    hinge.rotation.x = 0.32;
    lap.add(hinge);
    const lid = this.mesh(new RoundedBoxGeometry(0.34, 0.22, 0.016, 2, 0.008), shell, true);
    lid.position.y = 0.11;
    hinge.add(lid);
    const screen = this.mesh(new THREE.PlaneGeometry(0.3, 0.18), screenMat);
    screen.position.set(0, 0.112, -0.0085);
    screen.rotation.y = Math.PI;
    hinge.add(screen);
    const logo = this.mesh(geo().sphereLo, this.mat(plastic(PALETTE.claude, 0.5, false)));
    logo.scale.set(0.02, 0.02, 0.004);
    logo.position.set(0, 0.11, 0.009);
    hinge.add(logo);
    lap.position.set(0, 0.16, 0.3);
    this.pelvis.add(lap);
    return lap;
  }

  // -------------------------------------------------------------------------------------

  setMouth(shape: MouthShape): void {
    if (shape === this.mouth) return;
    this.mouth = shape;
    for (const k of Object.keys(this.mouths) as MouthShape[]) this.mouths[k].visible = k === shape;
  }

  /** Fade the whole character (walk-in pop / walk-out fade). */
  setOpacity(a: number): void {
    const v = Math.max(0, Math.min(1, a));
    if (Math.abs(v - this.opacity) < 1e-3) return;
    const wasOpaque = this.opacity >= 0.999;
    this.opacity = v;
    const opaque = v >= 0.999;
    for (const m of this.materials) {
      const base = this.baseOpacity.get(m) ?? 1;
      const nativelyTransparent = base < 1 || m === (this.shadow.material as THREE.Material);
      if (!nativelyTransparent && wasOpaque !== opaque) {
        m.transparent = !opaque;
        m.depthWrite = opaque;
        m.needsUpdate = true;
      }
      m.opacity = base * v;
    }
    for (const m of this.casters) m.castShadow = opaque;
    this.root.visible = v > 0.001;
  }

  get girthScale(): number {
    return this.girth;
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
