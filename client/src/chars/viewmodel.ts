// First person: your own right arm and coffee mug in the lower right of the view.
//
// It's the manager's actual arm (Rig's shoulder → elbow → wrist chain, dressed in the kit:
// shirt sleeve, mitten, the okayest-manager mug) on a two-bone IK from a shoulder just past
// the bottom-right edge of the screen, so it always reads as attached. Springs give it weight:
// it lags behind mouse look and behind the camera's starts, stops and hops, bobs in step with
// the gait (Body's cadence), drops and pumps a little at a run, and lifts the mug to the mouth
// for a sip (rim toward the face, like Body's mug).
//
// Never through walls: the arm is posed at its real size, then shrunk toward the eye. A
// uniform scale about the camera leaves the picture unchanged, and it puts every part within
// 0.25 m of the eye, closer than any wall can get (the manager's 0.3 m collision circle). So it
// depth-tests normally (the mitten wraps the handle properly) and is lit like the body.
import * as THREE from 'three';
import { applyKit } from './kit';
import { managerLooks } from './looks';
import { DIM, Rig } from './rig';
import RD from './rig-dimensions.json';
import { Spring, clamp, damp } from './spring';

/** The arm is designed for this vertical field of view and aspect, then re-fitted to the real camera. */
const REF_FOV = 45;
const REF_ASPECT = 16 / 9;
/** Shrink toward the eye: the farthest part (the far side of the mug) ends up ~0.24 m away. */
const SAFE = 0.26;
/** The manager's size (managerLooks().scale): the arm is theirs, at their size. */
const SIZE = managerLooks().scale;
const UPPER = DIM.upperArm * SIZE;
const FORE = DIM.forearm * SIZE;

// Poses in camera space at real size (metres; the camera looks down −Z, +X is right).
/** Shoulder: off the bottom-right corner of the screen. */
const SHOULDER = new THREE.Vector3(0.47, -0.35, -0.55);
/** Wrist at rest: the forearm rises from the corner and the mug sits in the lower right. */
const WRIST = new THREE.Vector3(0.38, -0.115, -0.66);
/** Mid-sip the whole arm swings in: the mug comes up to the mouth, below the middle of the view. */
const SHOULDER_SIP = new THREE.Vector3(0.33, -0.36, -0.6);
const WRIST_SIP = new THREE.Vector3(0.22, -0.1, -0.62);
/** Which way the elbow points: down, out to the right, a little back. */
const POLE = new THREE.Vector3(0.5, -0.7, 0.5).normalize();
/** Wrist cock (radians, + tips the fingers up). */
const FLEX = -0.5;
/** Horizontal screen position the wrist keeps on other aspect ratios (NDC). */
const ANCHOR_X = WRIST.x / (-WRIST.z * Math.tan((REF_FOV * Math.PI) / 360) * REF_ASPECT);

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _u = new THREE.Vector3();
const _p = new THREE.Vector3();
const _a = new THREE.Vector3();
const _f = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();
/** The mitten's centre below the wrist, and where it holds the mug from (held_mug_manager's handCentre anchor, in the mug's frame). */
const MITTEN = new THREE.Vector3(0, -RD.hand.offset, 0);
const MITTEN_FROM_GRIP = new THREE.Vector3(0, 0.03, -0.06);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

export class ViewModel {
  readonly group = new THREE.Group();
  private rig: Rig;
  /** The arm's own joints (taken out of the rig; the rest of the body is never shown). */
  private shoulder: THREE.Object3D;
  private elbow: THREE.Object3D;
  private wrist: THREE.Object3D;
  private mug: THREE.Object3D | null;

  /** Gait phase, advanced exactly like Body.locomote's (a footfall at π/2 + kπ). */
  private phase = 0;
  private walk = 0;
  private run = 0;
  private sip = 0;
  private breath = Math.random() * 10;
  /** Hand lag (metres at real size, camera space) and the mug's sway. */
  private lagX = new Spring(3.4, 0.45);
  private lagY = new Spring(3.6, 0.42);
  private lagZ = new Spring(3.0, 0.5);
  private roll = new Spring(3.2, 0.4);
  private lastQ = new THREE.Quaternion();
  private lastPos = new THREE.Vector3();
  private lastVel = new THREE.Vector3();
  private tracking = false;

  constructor(skin: string) {
    this.rig = new Rig({ ...managerLooks(), skin });
    this.shoulder = this.rig.armR;
    this.elbow = this.rig.elbowR;
    this.wrist = this.rig.handR;
    this.mug = this.rig.mug;
    this.shoulder.scale.setScalar(SIZE);
    this.group.add(this.shoulder);
    this.prepare();
    // Always the kit, so the arm matches the dressed character; the procedural arm stays until it lands.
    void applyKit(this.rig).then(() => this.prepare());
    this.group.visible = false;
  }

  /**
   * A footfall (optional, from Manager.onStep): pulls the bob onto the real gait (footfalls at
   * π/2 + kπ, as in Body.locomote) without a visible jump, and adds a little jolt. Ignored
   * while the arm isn't on screen: its springs don't run then, so jolts would pile up.
   */
  step(strength: number): void {
    if (!this.tracking) return;
    const fall = Math.round((this.phase - Math.PI / 2) / Math.PI) * Math.PI + Math.PI / 2;
    this.phase += (fall - this.phase) * 0.6;
    this.lagY.kick(-0.1 * strength);
  }

  /** `speed` m/s for the step bob, `sip` 0..1 lifts the mug toward your mouth, `visible` 0..1 slides it in. */
  update(dt: number, speed: number, sip: number, visible: number): void {
    this.group.visible = visible > 0.02;
    const cam = this.group.parent as THREE.PerspectiveCamera | null;
    if (!this.group.visible || !cam || dt <= 0) {
      this.tracking = false;
      return;
    }
    this.fit(cam);
    this.feel(dt, cam);

    // Gait (Body.locomote): one step per π of phase, at the same cadence the legs use.
    const s = speed / SIZE;
    const moving = clamp(s / 1.2, 0, 1);
    if (moving < 0.02) this.phase += (Math.round(this.phase / Math.PI) * Math.PI - this.phase) * damp(8, dt);
    else this.phase += clamp(2.8 + 0.6 * s, 3.2, 5.6) * Math.PI * dt;
    this.walk += (moving - this.walk) * damp(6, dt);
    this.run += (clamp((speed - 2.6) / 1.6, 0, 1) - this.run) * damp(6, dt);
    this.sip += (clamp(sip, 0, 1) - this.sip) * damp(10, dt);
    this.breath += dt;

    const sn = Math.sin(this.phase);
    const dip = Math.cos(2 * this.phase); // −1 at each footfall
    const walk = this.walk * (1 - this.run);
    const run = this.run * this.walk;
    const k = this.sip * this.sip * (3 - 2 * this.sip);
    _w.lerpVectors(WRIST, WRIST_SIP, k);
    _w.x += this.lagX.value + sn * (0.007 * walk + 0.012 * run);
    _w.y += this.lagY.value + dip * (0.006 * walk + 0.014 * run) - 0.055 * run + Math.sin(this.breath * 1.4) * 0.002 * (1 - this.walk);
    _w.z += this.lagZ.value + sn * 0.03 * run + 0.03 * run;
    // Slide in from below when entering first person (the whole arm, shoulder too).
    const drop = (1 - visible) * 0.3;
    _w.y -= drop;
    _v.lerpVectors(SHOULDER, SHOULDER_SIP, k);
    _v.y -= drop + 0.02 * run;
    this.solve(_v, _w);

    this.hand(FLEX + 0.2 * k);
    if (this.mug) this.holdMug(k, sn * (0.05 * walk + 0.12 * run));
  }

  // -------------------------------------------------------------------------------------

  /** Keep the arm the same size and screen position for any field of view and aspect ratio. */
  private fit(cam: THREE.PerspectiveCamera): void {
    const tanV = Math.tan((cam.fov * Math.PI) / 360);
    // Seen through a different field of view, scaling x and y draws it as the reference would;
    // wider views shrink it a little more toward the eye so it stays clear of walls (and of
    // the near plane, up to about 75°).
    const s = tanV / Math.tan((REF_FOV * Math.PI) / 360);
    const safe = SAFE / Math.sqrt(Math.max(1, s));
    this.group.scale.set(safe * s, safe * s, safe);
    // Wider or narrower screens: turn the arm so the wrist keeps its place relative to the right edge.
    const yaw = Math.atan(ANCHOR_X * cam.aspect * tanV) - Math.atan(ANCHOR_X * REF_ASPECT * tanV);
    this.group.rotation.set(0, -yaw, 0);
  }

  /** The camera's turning, starts, stops and hops push the hand around (it lags, then catches up). */
  private feel(dt: number, cam: THREE.PerspectiveCamera): void {
    cam.updateWorldMatrix(true, false);
    cam.getWorldQuaternion(_q);
    cam.getWorldPosition(_p);
    if (!this.tracking) {
      this.lastQ.copy(_q);
      this.lastPos.copy(_p);
      this.lastVel.set(0, 0, 0);
      this.tracking = true;
    }
    // Look: the turn since last frame, in the camera's own axes.
    _e.setFromQuaternion(_q2.copy(this.lastQ).invert().multiply(_q), 'YXZ');
    const yawRate = clamp(_e.y / dt, -12, 12);
    const pitchRate = clamp(_e.x / dt, -12, 12);
    // Motion: velocity and acceleration in camera space.
    _v.copy(_p).sub(this.lastPos).divideScalar(dt).applyQuaternion(_q2.copy(_q).invert());
    _a.copy(_v).sub(this.lastVel).divideScalar(dt);
    _a.clampLength(0, 40);
    this.lastQ.copy(_q);
    this.lastPos.copy(_p);
    this.lastVel.copy(_v);

    this.lagX.target = clamp(yawRate * 0.012, -0.05, 0.05);
    this.lagY.target = clamp(-pitchRate * 0.01, -0.04, 0.04);
    this.lagX.kick(-_a.x * dt * 0.012);
    this.lagY.kick(-_a.y * dt * 0.01);
    this.lagZ.kick(-_a.z * dt * 0.012);
    this.lagZ.target = 0;
    this.roll.target = clamp(yawRate * 0.05, -0.25, 0.25);
    for (const sp of [this.lagX, this.lagY, this.lagZ, this.roll]) sp.update(dt);
  }

  /** Two-bone IK: shoulder at `s`, wrist at `w` (camera space, real size), elbow toward POLE. */
  private solve(s: THREE.Vector3, w: THREE.Vector3): void {
    this.shoulder.position.copy(s);
    _u.copy(w).sub(s);
    const d = clamp(_u.length(), Math.abs(UPPER - FORE) + 1e-4, (UPPER + FORE) * 0.999);
    _u.normalize();
    const cosA = clamp((UPPER * UPPER + d * d - FORE * FORE) / (2 * UPPER * d), -1, 1);
    _p.copy(POLE).addScaledVector(_u, -POLE.dot(_u));
    if (_p.lengthSq() < 1e-8) _p.set(0, -1, 0);
    _p.normalize();
    // Upper arm toward the elbow, forearm from the elbow to the wrist.
    _a.copy(_u).multiplyScalar(cosA).addScaledVector(_p, Math.sqrt(1 - cosA * cosA));
    _f.copy(_u).multiplyScalar(d).addScaledVector(_a, -UPPER).normalize();
    // Arm frame: the limb hangs down its own −Y and the elbow folds toward +Z.
    _y.copy(_a).negate();
    _z.copy(_f).addScaledVector(_a, -_f.dot(_a));
    if (_z.lengthSq() < 1e-8) _z.copy(_p).negate();
    _z.normalize();
    _x.crossVectors(_y, _z);
    this.shoulder.quaternion.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
    this.elbow.rotation.set(-Math.acos(clamp(_a.dot(_f), -1, 1)), 0, 0);
  }

  /**
   * The mitten carries on along the forearm with its thumb up (fingers through the mug's
   * handle), then cocks at the wrist by `flex` (+ tips the fingers up).
   */
  private hand(flex: number): void {
    _y.copy(_f).negate();
    _z.copy(Y_AXIS).addScaledVector(_f, -_f.y);
    if (_z.lengthSq() < 1e-8) _z.set(0, 0, 1);
    _z.normalize();
    _x.crossVectors(_y, _z);
    _q.setFromRotationMatrix(_m.makeBasis(_x, _y, _z)).multiply(_q3.setFromAxisAngle(X_AXIS, -flex));
    // Local to the elbow: (shoulder · elbow)⁻¹ · hand.
    _q2.copy(this.shoulder.quaternion).multiply(this.elbow.quaternion).invert();
    this.wrist.quaternion.copy(_q2.multiply(_q));
  }

  /**
   * The mug stays upright in the view, cup to the left of the hand, swaying with the arm.
   * Sipping tips its rim toward you, the same way round as Body's mug. Its origin is the grip
   * on the handle (held_mug_manager).
   */
  private holdMug(sip: number, sway: number): void {
    const mug = this.mug!;
    // The mug's parent (the wrist) relative to this group: shoulder · elbow · wrist.
    _q.copy(this.shoulder.quaternion).multiply(this.elbow.quaternion).multiply(this.wrist.quaternion);
    _q2.setFromAxisAngle(Y_AXIS, -Math.PI / 2 + 0.3 + 0.45 * sip);
    _q2.premultiply(_q3.setFromAxisAngle(X_AXIS, 0.8 * sip + this.lagZ.value * 2));
    _q2.premultiply(_q3.setFromAxisAngle(Z_AXIS, this.roll.value + sway));
    mug.quaternion.copy(_q.invert().multiply(_q2));
    // The mitten wraps the handle the way the mug was modelled to be held, however the hand is turned.
    mug.position.copy(MITTEN).sub(_v.copy(MITTEN_FROM_GRIP).applyQuaternion(mug.quaternion));
  }

  /** No shadows from the shrunken arm onto the world, and never culled at the edge of the view. */
  private prepare(): void {
    this.shoulder.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
    });
  }
}
