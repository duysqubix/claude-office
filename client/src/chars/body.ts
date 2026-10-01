// The wobble. Every joint is a damped spring chasing a target pose. Behaviours (walking,
// typing, waving…) only say where things *should* be; the springs decide how they get
// there: overshooting, lagging, flopping. Root motion is watched too, so accelerating,
// stopping, turning and landing push the body around without anyone scripting it.
import * as THREE from 'three';
import { AngleSpring, Spring, angleDelta, clamp, damp } from './spring';
import { DIM, HEAD_Y, type MouthShape, type Rig } from './rig';

export interface Pose {
  lean: number; // torso pitch, + forward
  side: number; // torso roll, + toward character-right
  twist: number; // torso yaw, + toward character-left
  headPitch: number; // + nods down
  headYaw: number; // + looks left
  headRoll: number;
  armLPitch: number; // + swings forward/up
  armLRoll: number; // + raises out to the side
  armLYaw: number;
  armRPitch: number;
  armRRoll: number;
  armRYaw: number;
  armLStretch: number; // 1 = normal length; cartoon-stretches when reaching up
  armRStretch: number;
  legLPitch: number; // + forward
  legRPitch: number;
  legLRoll: number; // + outward
  legRRoll: number;
  crouch: number; // pelvis height offset (m)
  squash: number; // 1 rest, <1 squashed, >1 stretched
  hipRoll: number;
  hipTwist: number;
  brow: number; // + raised (surprised), − lowered
  worry: number; // inner brow ends up
  eyesClosed: number; // 0..1
}
export type PoseKey = keyof Pose;

const REST: Pose = {
  lean: 0,
  side: 0,
  twist: 0,
  headPitch: 0,
  headYaw: 0,
  headRoll: 0,
  armLPitch: 0.05,
  armLRoll: 0.3,
  armLYaw: 0,
  armRPitch: 0.05,
  armRRoll: 0.3,
  armRYaw: 0,
  armLStretch: 1,
  armRStretch: 1,
  legLPitch: 0,
  legRPitch: 0,
  legLRoll: 0.03,
  legRRoll: 0.03,
  crouch: 0,
  squash: 1,
  hipRoll: 0,
  hipTwist: 0,
  brow: 0,
  worry: 0,
  eyesClosed: 0,
};
const KEYS = Object.keys(REST) as PoseKey[];

/**
 * [frequency Hz, damping ratio] per channel. Big chains get one honest overshoot and settle
 * (ζ ≈ 0.4–0.5: tips on a stop, rocks back once); only small danglers ring (docs/ART-REFERENCE.md §2.4).
 */
const TUNING: Record<PoseKey, [number, number]> = {
  lean: [2.6, 0.45],
  side: [2.4, 0.45],
  twist: [3.0, 0.5],
  headPitch: [3.8, 0.4],
  headYaw: [4.5, 0.7],
  headRoll: [3.5, 0.4],
  armLPitch: [3.2, 0.38],
  armLRoll: [3.2, 0.4],
  armLYaw: [3.5, 0.45],
  armRPitch: [3.2, 0.38],
  armRRoll: [3.2, 0.4],
  armRYaw: [3.5, 0.45],
  armLStretch: [6.0, 0.35],
  armRStretch: [6.0, 0.35],
  legLPitch: [9, 0.6],
  legRPitch: [9, 0.6],
  legLRoll: [8, 0.5],
  legRRoll: [8, 0.5],
  crouch: [5.5, 0.4],
  squash: [6.5, 0.35],
  hipRoll: [4.0, 0.45],
  hipTwist: [5, 0.4],
  brow: [7, 0.45],
  worry: [6, 0.6],
  eyesClosed: [9, 0.9],
};
const DEG = Math.PI / 180;

export function zeroPose(): Pose {
  const p = { ...REST };
  for (const k of KEYS) p[k] = 0;
  return p;
}

const _v = new THREE.Vector3();
const _nv = new THREE.Vector3();
const _a = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

export class Body {
  /** Spring targets. Reset to rest by begin(); behaviours add to them. */
  readonly target: Pose = { ...REST };
  /** Direct additive offsets that bypass the springs (fast cycles: legs, typing, waving). */
  readonly over: Pose = zeroPose();
  readonly heading: AngleSpring;
  /** Extra height for the whole character (hops), on top of root.position. */
  hop = 0;
  /** Called on every footfall with the stride strength (0..1). */
  onStep: ((strength: number) => void) | null = null;

  private springs = {} as Record<PoseKey, Spring>;
  private hairP = new Spring(5.5, 0.22);
  private hairR = new Spring(5.5, 0.22);
  private hairS = new Spring(6.5, 0.22);
  private jigP = new Spring(4.5, 0.2);
  private jigR = new Spring(4.5, 0.2);
  /** Pelvis sway toward the stance foot (±1), flipping at each plant. */
  private sway = new Spring(2.2, 0.5);
  /** How much of a run this frame's gait is (set by locomote, 0 otherwise). */
  private runAmt = 0;
  private phase = 0;
  private stepCount = 0;
  private lastPos = new THREE.Vector3();
  private vel = new THREE.Vector3();
  private acc = new THREE.Vector3();
  private hasLast = false;
  private lastLeanVel = 0;
  private lastHeadYawVel = 0;
  private lastHeading = 0;
  private turnRate = 0;
  /** Speed that rises fast and falls slowly: drives the forward lean, so stopping can overshoot. */
  private leanSpeed = 0;
  private blinkIn = 1 + Math.random() * 3;
  private blinkT = -1;
  private doubleBlink = false;
  private mouthHold = 0;
  private mouthHoldShape: MouthShape = 'smile';
  private eyeDartX = 0;
  private eyeDartY = 0;
  private lookRelYaw = 0;
  private lookRelPitch = 0;
  private looking = false;

  constructor(
    readonly rig: Rig,
    yaw = 0,
  ) {
    // Everyone gets slightly different springs so a room never moves in lockstep.
    const jitter = (n: number) => 1 + (Math.random() * 2 - 1) * n;
    for (const k of KEYS) {
      const [f, z] = TUNING[k];
      this.springs[k] = new Spring(f * jitter(0.08), Math.max(0.05, z + (Math.random() * 2 - 1) * 0.04), REST[k]);
    }
    this.heading = new AngleSpring(3.0, 0.6, yaw);
    this.lastHeading = yaw;
    rig.root.rotation.y = yaw;
  }

  /** Start a frame: targets back to rest, overlays to zero. */
  begin(): void {
    Object.assign(this.target, REST);
    for (const k of KEYS) this.over[k] = 0;
    this.looking = false;
    this.runAmt = 0;
  }

  /** Jump every spring to its current target (for spawning straight into a pose). */
  settle(): void {
    for (const k of KEYS) this.springs[k].snap(this.target[k]);
    this.heading.snap(this.heading.target);
    this.hasLast = false;
  }

  /** Forget root velocity history (after a teleport). */
  teleported(): void {
    this.hasLast = false;
    this.vel.set(0, 0, 0);
    this.acc.set(0, 0, 0);
  }

  spring(k: PoseKey): Spring {
    return this.springs[k];
  }

  /** Hold a mouth shape for a while (surprise, shout). */
  say(shape: MouthShape, seconds: number): void {
    this.mouthHoldShape = shape;
    this.mouthHold = seconds;
  }

  // -------------------------------------------------------------------------------------
  // Behaviour helpers

  /**
   * Walk/run cycle (docs/ART-REFERENCE.md §2.5): short quick steps at WL's cadence, a waddle
   * bob and a sway toward the stance foot, straight arms that swing a little at a walk and
   * pump (trailing back) at a run. The arms go through their springs, so they lag and flop.
   * `speed` m/s along the facing direction; `run` 0..1; `scale` shrinks steps for interns.
   */
  locomote(dt: number, speed: number, run: number, scale = 1): void {
    this.runAmt = run;
    const s = speed / scale;
    const move = clamp(s / 1.2, 0, 1);
    // Standing arms splay a little more than seated ones; running splays wider.
    this.target.armLRoll += 0.08 + 0.11 * run;
    this.target.armRRoll += 0.08 + 0.11 * run;
    const shuffle = s < 0.3 && Math.abs(this.turnRate) > 1.6;
    if (move < 0.02 && !shuffle) {
      // Settle the phase toward the nearest standing point so feet come together.
      this.phase += angleDelta(this.phase, Math.round(this.phase / Math.PI) * Math.PI) * damp(8, dt);
      this.sway.target = 0;
      return;
    }
    // Turning on the spot: a few little shuffle steps instead of spinning like a top.
    const cadence = shuffle ? 3 : clamp(2.8 + 0.6 * s, 3.2, 5.6);
    const stepLen = s / cadence;
    const amp = shuffle ? 12 * DEG : clamp(Math.atan(stepLen / 2 / DIM.legLen), 12 * DEG, (30 + 12 * run) * DEG) * move;
    const g = shuffle ? 0.6 : move;
    const prev = this.phase;
    this.phase += cadence * Math.PI * dt;
    const sn = Math.sin(this.phase);
    const legA = sn * amp;
    this.over.legLPitch += legA;
    this.over.legRPitch -= legA;
    // Feet stay on the floor at full stride, plus WL's waddle: lowest mid-swing.
    const stepPhase = ((((this.phase - Math.PI / 2) % Math.PI) + Math.PI) % Math.PI) / Math.PI;
    const bob = (0.03 + 0.03 * run) * g;
    this.over.crouch += -DIM.legLen * (1 - Math.cos(legA)) - bob * Math.sin(Math.PI * stepPhase) ** 2;
    this.over.hipTwist += sn * 0.1 * g;
    // Arms: ±15–18° on screen walking, ±45° running with a backward bias (springs amplify ~1.3×).
    const walkArm = 0.19 + 0.05 * clamp((s - 1.4) / 0.8, 0, 1);
    const armA = (walkArm + (0.59 - walkArm) * run) * g;
    const bias = -0.26 * run * g;
    this.target.armLPitch += -sn * armA + bias;
    this.target.armRPitch += sn * armA + bias;
    this.target.twist -= sn * 0.08 * g;
    this.target.headPitch -= 0.03 * g;
    // Keep the gaze level: the head undoes half of the torso's lean while moving.
    this.over.headPitch -= 0.5 * this.springs.lean.value * g;
    this.over.headRoll -= 0.5 * this.springs.side.value * g;
    // Footfalls: when a leg reaches full stride.
    const k = Math.floor((this.phase - Math.PI / 2) / Math.PI);
    const kPrev = Math.floor((prev - Math.PI / 2) / Math.PI);
    if (k !== kPrev) {
      this.stepCount++;
      this.sway.target = sn > 0 ? 1 : -1;
      this.springs.squash.kick(-(0.35 + 0.5 * run) * g);
      this.springs.headPitch.kick(0.3 * g);
      this.hairS.kick(-0.6 * g);
      this.onStep?.(g * (0.6 + 0.4 * run));
    }
  }

  /** Airborne flail: arms up and flapping, legs bicycling, a little stretch. */
  flail(t: number, vy: number): void {
    this.target.armLRoll += 1.9;
    this.target.armRRoll += 1.9;
    this.target.armLPitch += 0.5;
    this.target.armRPitch += 0.5;
    this.over.armLRoll += Math.sin(t * 19) * 0.35;
    this.over.armRRoll += Math.sin(t * 19 + 1.7) * 0.35;
    this.target.armLStretch += 0.25;
    this.target.armRStretch += 0.25;
    this.over.legLPitch += 0.45 + Math.sin(t * 15) * 0.35;
    this.over.legRPitch += -0.2 + Math.sin(t * 15 + Math.PI) * 0.35;
    this.target.squash += clamp(vy * 0.035, -0.08, 0.14);
    this.target.lean -= 0.08;
    this.target.headPitch -= 0.15;
    this.target.brow += 0.6;
  }

  /** Turn head (and a bit of torso) toward a world point. Eyes lead. */
  lookAt(point: THREE.Vector3, weight = 1): void {
    const root = this.rig.root;
    const s = root.scale.y;
    _v.copy(point).sub(root.position);
    _v.y -= (DIM.pelvisY + HEAD_Y) * s + this.hop;
    const yawTo = Math.atan2(_v.x, _v.z);
    const rel = clamp(angleDelta(this.heading.value, yawTo), -1.5, 1.5);
    const horiz = Math.hypot(_v.x, _v.z);
    const pitch = clamp(Math.atan2(-_v.y, Math.max(horiz, 0.01)), -0.6, 0.7);
    this.target.headYaw += rel * 0.68 * weight;
    this.target.twist += rel * 0.28 * weight;
    this.target.headPitch += pitch * 0.75 * weight;
    this.lookRelYaw = rel * weight;
    this.lookRelPitch = pitch * weight;
    this.looking = true;
  }

  /** A shove: `dir` world-space push direction (unit-ish), strength ~0..1. */
  shove(dir: THREE.Vector3, strength: number): void {
    const h = this.heading.value;
    const fwd = dir.x * Math.sin(h) + dir.z * Math.cos(h);
    const right = -dir.x * Math.cos(h) + dir.z * Math.sin(h);
    this.springs.lean.kick(fwd * 5.5 * strength);
    this.springs.side.kick(right * 5.5 * strength);
    this.springs.headPitch.kick(-fwd * 4 * strength);
    this.springs.headRoll.kick(-right * 5 * strength);
    this.springs.squash.kick(-1.4 * strength);
    this.springs.armLRoll.kick(7 * strength);
    this.springs.armRRoll.kick(7 * strength);
    this.springs.brow.kick(8 * strength);
    this.hairP.kick(-fwd * 6 * strength);
    this.hairR.kick(right * 6 * strength);
    this.jigP.kick(-fwd * 9 * strength);
    this.jigR.kick(right * 9 * strength);
    this.say('open', 0.7);
  }

  /** Landing / hop impact. */
  land(impact: number): void {
    const k = clamp(impact, 0, 8);
    this.springs.squash.kick(-1.35 * k);
    this.springs.crouch.kick(-0.25 * k);
    this.springs.lean.kick(0.45 * k);
    this.springs.headPitch.kick(0.8 * k);
    this.springs.armLRoll.kick(-0.6 * k);
    this.springs.armRRoll.kick(-0.6 * k);
    this.hairS.kick(-1.2 * k);
    this.hairP.kick(0.6 * k);
    this.jigP.kick(1.4 * k);
  }

  // -------------------------------------------------------------------------------------

  /** Step springs, feel root motion, write the rig. Call once per frame after behaviours. */
  update(dt: number): void {
    if (dt <= 0) return;
    const rig = this.rig;
    const root = rig.root;

    // Root motion → inertia.
    if (this.hasLast) {
      _v.copy(root.position).sub(this.lastPos).divideScalar(dt);
      _nv.copy(this.vel).lerp(_v, damp(40, dt));
      _a.copy(_nv).sub(this.vel).divideScalar(dt);
      this.acc.lerp(_a, damp(32, dt));
      this.vel.copy(_nv);
    }
    this.lastPos.copy(root.position);
    this.hasLast = true;
    const h = this.heading.value;
    const aFwd = clamp(this.acc.x * Math.sin(h) + this.acc.z * Math.cos(h), -30, 30);
    const aRight = clamp(-this.acc.x * Math.cos(h) + this.acc.z * Math.sin(h), -30, 30);
    const aUp = clamp(this.acc.y, -60, 60);
    const speed = Math.hypot(this.vel.x, this.vel.z);

    // Heading spring and lean into turns.
    this.heading.update(dt);
    const yawNow = this.heading.value;
    const tr = angleDelta(this.lastHeading, yawNow) / dt;
    this.lastHeading = yawNow;
    this.turnRate += (tr - this.turnRate) * damp(12, dt);
    // Bank into turns (≤ 10°) and lean with speed (3.5° per m/s, ≤ 8° walking, ≤ 14° running).
    this.target.side += clamp(-this.turnRate * speed * 0.045, -10 * DEG, 10 * DEG);
    this.leanSpeed += (speed - this.leanSpeed) * damp(speed > this.leanSpeed ? 6 : 2.2, dt);
    this.target.lean += clamp(this.leanSpeed * 3.5 * DEG, 0, (8 + 6 * this.runAmt) * DEG);

    // Inertia. Braking throws the top half forward much harder than starting pulls it back,
    // which is what makes stopping look like a jelly in a lunchbox.
    const S = this.springs;
    const leanGain = aFwd < 0 ? 3.2 : 1.2;
    S.lean.kick(-aFwd * dt * leanGain);
    S.side.kick(-aRight * dt * 1.4);
    S.armLPitch.kick(-aFwd * dt * 4.5);
    S.armRPitch.kick(-aFwd * dt * 4.5);
    S.armLRoll.kick((Math.abs(aFwd) * 0.5 - aRight) * dt * 1.2);
    S.armRRoll.kick((Math.abs(aFwd) * 0.5 + aRight) * dt * 1.2);
    S.headPitch.kick(-aFwd * dt * (aFwd < 0 ? 2.6 : 1.3));
    S.headRoll.kick(aRight * dt * 0.9);
    if (aFwd < -4) S.squash.kick(aFwd * dt * 0.12);
    this.hairP.kick(-aFwd * dt * 3);
    this.hairR.kick(aRight * dt * 3);
    this.hairS.kick(-aUp * dt * 0.05);
    this.jigP.kick(-aFwd * dt * 5);
    this.jigR.kick(aRight * dt * 5);

    for (const k of KEYS) {
      const sp = S[k];
      sp.target = this.target[k];
      sp.update(dt);
    }
    // Head lags the torso: when the torso snaps forward the head tips back, then catches up.
    const leanVel = S.lean.velocity;
    S.headPitch.kick(-(leanVel - this.lastLeanVel) * 0.3);
    this.hairP.kick(-(leanVel - this.lastLeanVel) * 0.8);
    this.lastLeanVel = leanVel;
    const headYawVel = S.headYaw.velocity;
    this.hairR.kick((headYawVel - this.lastHeadYawVel) * 0.18);
    this.jigR.kick((headYawVel - this.lastHeadYawVel) * 0.35);
    this.lastHeadYawVel = headYawVel;
    this.hairP.target = 0;
    this.hairR.target = 0;
    this.hairS.target = 0;
    this.hairP.update(dt);
    this.hairR.update(dt);
    this.hairS.update(dt);
    this.jigP.target = this.hairP.value * 1.5;
    this.jigR.target = this.hairR.value * 1.5;
    this.jigP.update(dt);
    this.jigR.update(dt);

    const P = (k: PoseKey) => S[k].value + this.over[k];

    // Write the rig.
    root.rotation.y = yawNow;
    const sq = clamp(P('squash'), 0.6, 1.45);
    const wide = 1 / Math.sqrt(sq);
    rig.squash.scale.set(wide, sq, wide);
    rig.squash.position.y = this.hop / root.scale.y;
    this.sway.update(dt);
    const swayAmt = this.sway.value * (1 + 0.4 * this.runAmt);
    rig.pelvis.position.set(swayAmt * 0.025, DIM.pelvisY + P('crouch'), 0);
    rig.pelvis.rotation.set(0, P('hipTwist'), P('hipRoll') - swayAmt * 3 * DEG);
    rig.torso.rotation.set(P('lean'), P('twist'), P('side'));
    rig.neck.rotation.set(P('headPitch'), P('headYaw'), P('headRoll'), 'YXZ');
    rig.armL.rotation.set(-P('armLPitch'), P('armLYaw'), P('armLRoll'));
    rig.armR.rotation.set(-P('armRPitch'), -P('armRYaw'), -P('armRRoll'));
    const stL = clamp(P('armLStretch'), 0.7, 2.2);
    const stR = clamp(P('armRStretch'), 0.7, 2.2);
    rig.armStretchL.scale.set(1 / Math.sqrt(stL), stL, 1 / Math.sqrt(stL));
    rig.armStretchR.scale.set(1 / Math.sqrt(stR), stR, 1 / Math.sqrt(stR));
    rig.handL.position.y = -DIM.armLen * stL;
    rig.handR.position.y = -DIM.armLen * stR;
    const lp = P('legLPitch');
    const rp = P('legRPitch');
    rig.legL.rotation.set(-lp, 0, P('legLRoll'));
    rig.legR.rotation.set(-rp, 0, -P('legRRoll'));
    rig.footL.rotation.x = clamp(lp, -0.6, 0.6) * 0.45;
    rig.footR.rotation.x = clamp(rp, -0.6, 0.6) * 0.45;

    // Hair and the extra-jiggly bits.
    rig.hair.rotation.set(this.hairP.value * 0.5, 0, this.hairR.value * 0.5);
    rig.hair.scale.set(1 - this.hairS.value * 0.3, 1 + this.hairS.value, 1 - this.hairS.value * 0.3);
    if (rig.hasJiggle) rig.jiggle.rotation.set(this.jigP.value * 0.9, 0, this.jigR.value * 0.9);

    // Face: brows, eyes (blink, look, sleep), mouth.
    const brow = P('brow');
    const worry = P('worry');
    rig.browL.position.y = brow * 0.018;
    rig.browR.position.y = brow * 0.018;
    rig.browL.rotation.z = -worry * 0.45;
    rig.browR.rotation.z = worry * 0.45;
    let open = 1;
    this.blinkIn -= dt;
    if (this.blinkT < 0 && this.blinkIn <= 0) {
      this.blinkT = 0;
      this.doubleBlink = Math.random() < 0.2;
    }
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const dur = 0.14;
      const local = this.blinkT % dur;
      open = 1 - Math.sin((local / dur) * Math.PI) * 0.92;
      if (this.blinkT >= (this.doubleBlink ? dur * 2 : dur)) {
        this.blinkT = -1;
        this.blinkIn = 2 + Math.random() * 4;
      }
    }
    const closed = clamp(P('eyesClosed'), 0, 1);
    open = Math.min(open, 1 - closed * 0.9);
    rig.eyeL.scale.y = open;
    rig.eyeR.scale.y = open;
    // Eyes dart ahead of the head toward what we're looking at.
    const dartX = this.looking ? clamp((this.lookRelYaw - S.headYaw.value) * 0.05, -0.022, 0.022) : 0;
    const dartY = this.looking ? clamp(-(this.lookRelPitch - S.headPitch.value) * 0.04, -0.015, 0.015) : 0;
    this.eyeDartX += (dartX - this.eyeDartX) * damp(14, dt);
    this.eyeDartY += (dartY - this.eyeDartY) * damp(14, dt);
    rig.eyes.position.set(this.eyeDartX, this.eyeDartY, 0);

    if (this.mouthHold > 0) {
      this.mouthHold -= dt;
      rig.setMouth(this.mouthHoldShape);
    } else {
      rig.setMouth(closed > 0.5 ? 'open' : 'smile');
    }

    // Blob shadow stays on the floor and shrinks as we rise.
    const s = root.scale.y;
    const height = root.position.y + this.hop;
    rig.shadow.position.y = (-height + 0.022) / s;
    const fade = 1 - clamp(Math.max(0, height - 0.12) * 0.9, 0, 0.6);
    rig.shadow.scale.setScalar(0.95 * fade);

    // A held mug stays upright whatever the arm is doing (unless we're sipping).
    if (rig.mug) {
      root.updateMatrixWorld(true);
      rig.mug.parent!.getWorldQuaternion(_q);
      _q2.setFromAxisAngle(_up, yawNow);
      rig.mug.quaternion.copy(_q.invert().multiply(_q2));
      rig.mug.rotateX(this.sip);
    }
  }

  /** Mug tilt toward the mouth (radians), set by the manager while sipping. */
  sip = 0;
}
