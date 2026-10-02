// One Claude Code session as a person at a desk.
// Phases: entering → sitting-down → seated → standing-up → leaving → gone.
// Regulars (NPC coworkers, chars/npc.ts) reuse all of this through the protected extension
// points (stoodUp, away, seatedExtra, extraPose); sessions never use 'away'.
import * as THREE from 'three';
import type { ActivityKind, Employee, EmployeeState } from '../../../shared/protocol';
import { hash32 } from '../style/palette';
import type { DeskSlot, World } from '../world/types';
import { Body, type Pose } from './body';
import { employeeLooks, type Looks } from './looks';
import { Glancer, type Bumpable } from './manager';
import { DIM, HEAD_Y, Rig } from './rig';
import { angleDelta, clamp, damp, smoothstep } from './spring';

/** 'away': up and about but coming back (a regular's coffee break); still holds the desk. */
export type Phase = 'entering' | 'sitting-down' | 'seated' | 'standing-up' | 'leaving' | 'away' | 'gone';

/** How far the chair slides out when someone gets in or out. */
export const CHAIR_OUT = 0.45;
/** Sit this far forward of the seat point (stubby arms need to reach the keyboard). */
const SEAT_FORWARD = 0.13;
/** Raise the pelvis above the cushion so the bum sits on it, not in it. */
const SEAT_LIFT = 0.13;
const WALK_SPEED = 1.65;

/** The chair at one desk. Shared by whoever sits there over time. */
export class Chair {
  slide = 0;
  target = 0;
  private rest: THREE.Vector3;
  private dirLocal: THREE.Vector3;
  /** World direction the chair slides out (away from the desk). */
  readonly dirWorld = new THREE.Vector3();

  constructor(readonly desk: DeskSlot) {
    const c = desk.chair;
    this.rest = c.position.clone();
    this.dirLocal = new THREE.Vector3(0, 0, 1).applyQuaternion(c.quaternion);
    c.updateWorldMatrix(true, false);
    const q = new THREE.Quaternion();
    c.getWorldQuaternion(q);
    this.dirWorld.set(0, 0, 1).applyQuaternion(q).setY(0);
    if (this.dirWorld.lengthSq() < 1e-6) this.dirWorld.set(-Math.sin(desk.yaw), 0, -Math.cos(desk.yaw));
    this.dirWorld.normalize();
  }

  update(dt: number): void {
    const step = 1.5 * dt;
    this.slide += clamp(this.target - this.slide, -step, step);
    this.desk.chair.position.copy(this.rest).addScaledVector(this.dirLocal, this.slide);
  }
}

export interface EmployeeHooks {
  /** A shove from the manager (for the "!" pop). */
  onBump?(e: EmployeeChar): void;
}

const _v = new THREE.Vector3();
const _seat = new THREE.Vector3();

export class EmployeeChar implements Bumpable {
  readonly rig: Rig;
  readonly body: Body;
  readonly radius = 0.36;
  /** Anchor above the head for labels (child of the root, so it doesn't jiggle). */
  readonly labelAnchor = new THREE.Object3D();
  phase: Phase;
  data: Employee;
  /** Seconds since the current state started (for celebrations, dings). */
  stateAge = 0;
  /** Where interns gather: set by the director. */
  internFocus: THREE.Vector3 | null = null;
  hooks: EmployeeHooks = {};

  protected phaseT = 0;
  private path: THREE.Vector3[] = [];
  protected speed = 0;
  private opacity = 1;
  private glance = new Glancer(0.75);
  private celebrateT = -1;
  private waveT = -1;
  private waveGoodbyeDone = false;
  private hopFrom = new THREE.Vector3();
  private hopTo = new THREE.Vector3();
  private idleStyle: number;
  private seed: number;
  private exitPush = 0;
  /** Seconds since the manager answered their question (−1 = not recently). */
  private thankT = -1;
  /** The ask that answer was for: only that one stays hidden while the roster catches up. */
  private answeredAskId: string | undefined;
  /** A short line they say out loud (shown as their bubble), and until when. */
  quipText = '';
  quipUntil = 0;

  constructor(
    data: Employee,
    public desk: DeskSlot,
    public chair: Chair,
    private world: World,
    scene: THREE.Object3D,
    seated: boolean,
    /** Regulars bring their own looks (no staff lanyard). */
    looks: Looks = employeeLooks(data.sessionId, data.hosted),
  ) {
    this.data = data;
    this.seed = hash32(data.sessionId);
    this.idleStyle = this.seed % 4;
    this.rig = new Rig(looks);
    this.body = new Body(this.rig, desk.yaw);
    this.labelAnchor.position.y = DIM.pelvisY + HEAD_Y + DIM.headR + 0.2;
    this.rig.root.add(this.labelAnchor);
    scene.add(this.rig.root);
    if (seated) {
      this.phase = 'seated';
      this.chair.slide = this.chair.target = 0;
      this.placeSeated();
      this.body.heading.snap(desk.yaw);
      this.body.begin();
      this.seatedPose(0, 0);
      this.body.settle();
    } else {
      this.phase = 'entering';
      const out = world.entrance.outside;
      const side = new THREE.Vector3(1, 0, 0).multiplyScalar(((this.seed % 100) / 100 - 0.5) * 1.2);
      this.rig.root.position.copy(out).add(side).setY(0);
      this.walkTo(desk.approach);
      this.opacity = 0;
      this.rig.setOpacity(0);
    }
  }

  get position(): THREE.Vector3 {
    return this.rig.root.position;
  }

  get state(): EmployeeState {
    return this.data.state;
  }

  get kind(): ActivityKind | undefined {
    return this.data.activity?.kind;
  }

  /** At their desk (or getting in/out of the chair): occupies the desk. */
  get atDesk(): boolean {
    return this.phase === 'sitting-down' || this.phase === 'seated' || this.phase === 'standing-up';
  }

  get seated(): boolean {
    return this.phase === 'seated';
  }

  /** Head position in world space (for look-ats and the camera). */
  headWorld(out = new THREE.Vector3()): THREE.Vector3 {
    this.rig.head.updateWorldMatrix(true, false);
    return this.rig.head.getWorldPosition(out);
  }

  setData(next: Employee): void {
    const prev = this.data.state;
    this.data = next;
    if (next.state !== prev) {
      this.stateAge = 0;
      if (prev === 'working' && next.state === 'idle' && this.seated) this.celebrateT = 0;
    }
  }

  /** Session ended: get up and go home. */
  leave(): void {
    if (this.phase === 'leaving' || this.phase === 'gone' || this.phase === 'standing-up') return;
    if (this.phase === 'seated' || this.phase === 'sitting-down') {
      this.setPhase('standing-up');
      this.chair.target = CHAIR_OUT;
    } else {
      this.startLeaving();
    }
  }

  /** The session came back while they were heading out. */
  comeBack(): void {
    if (this.phase !== 'leaving' && this.phase !== 'standing-up') return;
    if (this.phase === 'standing-up') {
      this.setPhase('sitting-down');
      this.phaseT = 0.75;
      return;
    }
    this.setPhase('entering');
    this.walkTo(this.desk.approach);
  }

  /** The manager walked into us. */
  bump(dir: THREE.Vector3, strength: number): void {
    this.body.shove(dir, strength);
    if (!this.quipping) {
      const lines = this.state === 'working' ? ["I'm in the zone!", 'Oof!', 'Hey, boss!'] : ['Oof!', 'Hey, boss!', 'Whoa!'];
      this.quip(lines[Math.floor(Math.random() * lines.length)], 1.8);
    }
    this.hooks.onBump?.(this);
  }

  /** Wave at someone (hello / goodbye). */
  wave(seconds = 1.4): void {
    this.waveT = 1.4 - seconds;
  }

  /** Say something short (shown in their bubble for `seconds`). */
  quip(text: string, seconds = 2.5): void {
    this.quipText = text;
    this.quipUntil = performance.now() + seconds * 1000;
  }

  get quipping(): boolean {
    return !!this.quipText && performance.now() < this.quipUntil;
  }

  /** The manager answered their question in-game: hand down, happy hop, squint, "Thanks!". */
  answered(): void {
    this.thankT = 0;
    this.answeredAskId = this.data.ask?.id;
    this.quip('Thanks!', 2.4);
  }

  /** Hand up right now (needs you, and not just answered). */
  get handUp(): boolean {
    return this.poseState === 'needs-you';
  }

  /**
   * Body-language state: right after an answer they're back to work while the roster
   * catches up. A NEW question in that moment (a follow-up permission, say) raises the hand
   * again at once.
   */
  private get poseState(): EmployeeState {
    const ask = this.data.ask;
    const catchingUp = this.thankT >= 0 && this.thankT < 2.5 && this.data.state === 'needs-you' && (!ask || ask.id === this.answeredAskId);
    return catchingUp ? 'working' : this.data.state;
  }

  // -------------------------------------------------------------------------------------

  protected setPhase(p: Phase): void {
    this.phase = p;
    this.phaseT = 0;
  }

  // Extension points for regulars (chars/npc.ts). The defaults are the session behaviour.

  /** Out of the chair and on their feet: a session heads home. */
  protected stoodUp(): void {
    this.startLeaving();
  }

  /** Every frame of the 'away' phase (sessions never get there). */
  protected away(_dt: number, _t: number, _mgrDist: number, _managerHead: THREE.Vector3): void {}

  /** Seated body language of someone who isn't a session; true replaces the session poses. */
  protected seatedExtra(_tt: number, _dt: number): boolean {
    return false;
  }

  /** Added on top of every phase's pose, just before the springs step. */
  protected extraPose(_dt: number, _t: number): void {}

  protected walkTo(target: THREE.Vector3): void {
    const from = this.position.clone().setY(0);
    const p = this.world.findPath(from, target.clone().setY(0));
    this.path = (p && p.length ? p : [target.clone()]).map((v) => v.clone().setY(0));
  }

  private startLeaving(): void {
    this.setPhase('leaving');
    this.waveGoodbyeDone = false;
    this.walkTo(this.world.entrance.outside);
  }

  /** Seated pelvis target for the current chair slide. */
  private seatPoint(out: THREE.Vector3): THREE.Vector3 {
    const s = this.rig.root.scale.y;
    const yaw = this.desk.yaw;
    return out
      .copy(this.desk.seat)
      .add(_v.set(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(SEAT_FORWARD))
      .addScaledVector(this.chair.dirWorld, this.chair.slide)
      .setY(this.desk.seat.y + SEAT_LIFT * s - DIM.pelvisY * s);
  }

  private placeSeated(): void {
    this.seatPoint(this.position);
  }

  /** Follow the path; returns true when arrived. */
  protected followPath(dt: number): boolean {
    const pos = this.position;
    while (this.path.length && Math.hypot(this.path[0].x - pos.x, this.path[0].z - pos.z) < (this.path.length > 1 ? 0.35 : 0.06)) {
      this.path.shift();
    }
    if (!this.path.length) {
      this.speed += (0 - this.speed) * damp(10, dt);
      return true;
    }
    let remaining = 0;
    let prev: THREE.Vector3 = pos;
    for (const p of this.path) {
      remaining += Math.hypot(p.x - prev.x, p.z - prev.z);
      prev = p;
    }
    const want = Math.min(WALK_SPEED * this.rig.looks.pace, remaining * 2.4 + 0.35);
    this.speed += (want - this.speed) * damp(5, dt);
    const tgt = this.path[0];
    _v.set(tgt.x - pos.x, 0, tgt.z - pos.z);
    const d = _v.length();
    const step = Math.min(d, this.speed * dt);
    if (d > 1e-4) {
      _v.multiplyScalar(1 / d);
      pos.addScaledVector(_v, step);
      this.body.heading.setTarget(Math.atan2(_v.x, _v.z));
    }
    return false;
  }

  // -------------------------------------------------------------------------------------

  update(dt: number, t: number, manager: THREE.Vector3, managerHead: THREE.Vector3): void {
    if (this.phase === 'gone') return;
    this.phaseT += dt;
    this.stateAge += dt;
    const body = this.body;
    body.begin();
    body.hop = 0;
    const s = this.rig.root.scale.y;
    const mgrDist = Math.hypot(manager.x - this.position.x, manager.z - this.position.z);

    switch (this.phase) {
      case 'entering': {
        this.opacity = Math.min(1, this.opacity + dt / 0.5);
        const arrived = this.followPath(dt);
        body.locomote(dt, this.speed, 0, s);
        if (mgrDist < 4) body.lookAt(managerHead, 0.8);
        if (arrived) {
          this.setPhase('sitting-down');
          this.chair.target = CHAIR_OUT;
          this.hopFrom.copy(this.position);
        }
        break;
      }
      case 'sitting-down':
        this.sittingDown(dt, t);
        break;
      case 'seated':
        this.placeSeated();
        body.heading.setTarget(this.desk.yaw);
        this.seatedPose(t, dt);
        this.lookAtManager(managerHead, mgrDist);
        break;
      case 'standing-up':
        this.standingUp(dt, t);
        break;
      case 'away':
        this.away(dt, t, mgrDist, managerHead);
        break;
      case 'leaving': {
        const arrived = this.followPath(dt);
        body.locomote(dt, this.speed, 0, s);
        const door = this.doorPoint();
        if (!this.waveGoodbyeDone && Math.hypot(door.x - this.position.x, door.z - this.position.z) < 1.6) {
          this.waveGoodbyeDone = true;
          this.wave(1.2);
        }
        if (mgrDist < 4) body.lookAt(managerHead, 0.6);
        if (arrived) {
          // Keep strolling away while fading out.
          this.exitPush += dt;
          const h = body.heading.value;
          this.position.x += Math.sin(h) * 1.2 * dt;
          this.position.z += Math.cos(h) * 1.2 * dt;
          body.locomote(dt, 1.2, 0, s);
          this.opacity -= dt / 0.7;
          if (this.opacity <= 0) {
            this.setPhase('gone');
            this.rig.setOpacity(0);
            return;
          }
        }
        break;
      }
    }

    this.extraPose(dt, t);
    this.waveOverlay(dt, t, managerHead, mgrDist);
    this.rig.setOpacity(this.opacity);
    body.update(dt);
    this.chair.update(dt);
    // Labels float a little above wherever the head actually is (slumped sleepers included).
    this.rig.root.worldToLocal(this.headWorld(_seat));
    _seat.y += DIM.headR + 0.22;
    this.labelAnchor.position.lerp(_seat, damp(8, dt));
  }

  private doorPoint(): THREE.Vector3 {
    const { inside, outside } = this.world.entrance;
    return _seat.copy(outside).sub(inside).setY(0).normalize().multiplyScalar(1.4).add(inside);
  }

  private sittingDown(dt: number, t: number): void {
    const body = this.body;
    const T = this.phaseT;
    body.heading.setTarget(this.desk.yaw);
    if (T < 0.32) {
      // Chair slides out; turn to the desk, a little crouch to get ready.
      this.hopFrom.copy(this.position);
      const u = smoothstep(T / 0.32);
      body.target.crouch -= 0.06 * u;
      body.target.kneeL += 0.35 * u;
      body.target.kneeR += 0.35 * u;
      body.target.armLRoll += 0.3;
      body.target.armRRoll += 0.3;
    } else if (T < 0.78) {
      // Hop into the slid-out chair, legs folding up to sit.
      const u = (T - 0.32) / 0.46;
      if (T - dt < 0.32) body.spring('squash').kick(2.5);
      this.seatPoint(this.hopTo);
      this.position.lerpVectors(this.hopFrom, this.hopTo, smoothstep(u));
      body.hop = Math.sin(Math.PI * u) * 0.28;
      this.sitLegs(smoothstep(u));
      body.flail(t, (0.5 - u) * 4);
      if (T + dt >= 0.78) body.land(3);
    } else {
      // Scoot in with the chair.
      if (this.chair.target !== 0) this.chair.target = 0;
      this.placeSeated();
      this.seatedPose(t, dt);
      if (this.chair.slide <= 0.001) {
        this.setPhase('seated');
        this.wave(1.4);
      }
    }
  }

  private standingUp(dt: number, t: number): void {
    const body = this.body;
    const T = this.phaseT;
    body.heading.setTarget(this.desk.yaw);
    if (this.chair.slide < CHAIR_OUT - 0.001 && T < 1.2) {
      this.placeSeated();
      this.seatedPose(t, dt);
      this.hopFrom.copy(this.position);
      this.phaseT = 0;
      return;
    }
    const u = clamp(T / 0.42, 0, 1);
    this.position.lerpVectors(this.hopFrom, _seat.copy(this.desk.approach).setY(0), smoothstep(u));
    body.hop = Math.sin(Math.PI * u) * 0.24;
    this.sitLegs(1 - smoothstep(u));
    body.target.armLRoll += 0.6 * (1 - u);
    body.target.armRRoll += 0.6 * (1 - u);
    if (u >= 1) {
      body.land(2.5);
      this.chair.target = 0;
      this.stoodUp();
    }
  }

  /** Thighs forward, knees bent so the shins hang (`k` 0 = standing, 1 = sitting). */
  private sitLegs(k: number): void {
    const T = this.body.target;
    T.legLPitch += 1.45 * k;
    T.legRPitch += 1.45 * k;
    T.kneeL += 1.4 * k;
    T.kneeR += 1.4 * k;
    T.legLRoll += 0.1 * k;
    T.legRRoll += 0.1 * k;
  }

  private lookAtManager(managerHead: THREE.Vector3, dist: number): void {
    const st = this.state;
    if (st === 'sleeping') return;
    const range = st === 'needs-you' ? 12 : 4;
    if (dist > range) return;
    const w = st === 'working' ? 0.55 : 1;
    this.body.lookAt(managerHead, w * clamp((range - dist) / 1.2, 0, 1));
  }

  /** Wave hello/goodbye overlay (from the elbow); works seated or walking. */
  private waveOverlay(dt: number, t: number, managerHead: THREE.Vector3, dist: number): void {
    if (this.waveT < 0) return;
    this.waveT += dt;
    const k = Math.sin(clamp(this.waveT / 1.4, 0, 1) * Math.PI);
    const b = this.body;
    b.target.armRRoll += 2.0 * k;
    b.target.armRPitch += 0.25 * k;
    b.target.elbowR += 0.35 * k;
    b.over.elbowR += Math.sin(t * 11) * 0.42 * k;
    b.over.armRRoll += Math.sin(t * 11 + 0.6) * 0.1 * k;
    if (dist < 9) b.lookAt(managerHead, 0.7 * k);
    if (this.waveT >= 1.4) this.waveT = -1;
  }

  /** The body language of a seated session. Nothing is ever perfectly still. */
  private seatedPose(t: number, dt: number): void {
    const b = this.body;
    const T = b.target;
    const O = b.over;
    const ph = (this.seed % 628) / 100;
    const tt = t + ph;
    this.sitLegs(1);
    // Feet dangle like a pendulum (0.8–1.2 Hz), with the odd kick.
    const dangleHz = 0.8 + ((this.seed >> 8) % 40) / 100;
    const kick = Math.max(0, Math.sin(tt * 0.9)) ** 12 * 0.25;
    O.kneeL += Math.sin(tt * Math.PI * 2 * dangleHz) * 0.1 + kick;
    O.kneeR += Math.sin(tt * Math.PI * 2 * dangleHz + 2.1) * 0.1;
    // Slow breathing.
    O.squash += Math.sin(tt * 1.6) * 0.012;

    const st = this.poseState;
    if (this.thankT >= 0) {
      // Answered: a happy little hop in the seat with a squint, then back to it.
      this.thankT += dt;
      const k = Math.max(0, 1 - this.thankT / 0.9);
      O.crouch += Math.sin(Math.min(1, this.thankT / 0.45) * Math.PI) * 0.08;
      T.eyesClosed += 0.5 * k;
      T.headPitch -= 0.15 * k;
      if (this.thankT > 3) this.thankT = -1;
    }
    if (this.celebrateT >= 0) {
      // Done! Both arms up in a big stretch.
      this.celebrateT += dt;
      const k = Math.sin(clamp(this.celebrateT / 1.8, 0, 1) * Math.PI);
      T.armLRoll += 2.2 * k;
      T.armRRoll += 2.2 * k;
      T.armLPitch += 0.35 * k;
      T.armRPitch += 0.35 * k;
      T.elbowL -= 0.15 * k;
      T.elbowR -= 0.15 * k;
      T.armLStretch += 0.3 * k;
      T.armRStretch += 0.3 * k;
      T.lean -= 0.22 * k;
      T.headPitch -= 0.35 * k;
      T.squash += 0.09 * k;
      T.eyesClosed += 0.85 * k;
      O.armLRoll += Math.sin(tt * 6) * 0.08 * k;
      O.armRRoll -= Math.sin(tt * 6) * 0.08 * k;
      if (this.celebrateT >= 1.8) this.celebrateT = -1;
      if (k > 0.3) return;
    }
    if (this.seatedExtra(tt, dt)) return;

    switch (st) {
      case 'needs-you': {
        // Arm straight up, waving from the elbow, bouncing in the seat. Unmissable.
        T.armRRoll += 2.25;
        T.armRPitch += 0.15;
        T.armRStretch += 0.7;
        T.elbowR += 0.25;
        O.elbowR += Math.sin(tt * 9.5) * 0.45;
        O.armRRoll += Math.sin(tt * 9.5 + 0.8) * 0.12;
        this.handsOnDesk(T, 'L');
        O.crouch += Math.abs(Math.sin(tt * 4.6)) * 0.045;
        O.squash += Math.abs(Math.sin(tt * 4.6)) * 0.03;
        T.lean -= 0.04;
        T.side -= 0.2;
        T.headRoll -= 0.14;
        T.worry += 0.9;
        T.brow += 0.5;
        T.headYaw += Math.sin(tt * 1.3) * 0.45;
        T.headPitch -= 0.1;
        b.say('open', 0.1);
        break;
      }
      case 'sleeping': {
        // Head down on folded arms, slow deep breaths.
        T.lean += 0.62;
        T.headPitch += 0.28;
        T.headRoll += 0.38;
        T.armLPitch += 1.2;
        T.armRPitch += 1.2;
        T.armLRoll -= 0.35;
        T.armRRoll -= 0.35;
        T.armLYaw += 0.3;
        T.armRYaw += 0.3;
        T.elbowL += 1.25;
        T.elbowR += 1.25;
        T.eyesClosed += 1;
        O.lean += Math.sin(tt * 1.25) * 0.035;
        O.squash += Math.sin(tt * 1.25) * 0.03;
        O.kneeL *= 0.3;
        O.kneeR *= 0.3;
        break;
      }
      case 'idle': {
        this.glance.update(dt);
        T.lean -= 0.22;
        // Every so often: a big lazy yawn-and-stretch.
        const yawnT = (tt + this.idleStyle * 4) % 15;
        const yawn = yawnT < 2.6 ? Math.sin((yawnT / 2.6) * Math.PI) : 0;
        if (yawn > 0) {
          T.armLRoll += 2.0 * yawn;
          T.armRRoll += 2.0 * yawn;
          T.armLStretch += 0.25 * yawn;
          T.armRStretch += 0.25 * yawn;
          T.lean -= 0.12 * yawn;
          T.headPitch -= 0.3 * yawn;
          T.squash += 0.06 * yawn;
          T.eyesClosed += 0.8 * yawn;
          if (yawn > 0.4) b.say('open', 0.1);
        }
        const rest = 1 - yawn;
        if (this.idleStyle === 0) {
          // Slumped back, arms dangling over the armrests.
          T.armLRoll += 0.42 * rest;
          T.armRRoll += 0.42 * rest;
          T.armLPitch -= 0.25 * rest;
          T.armRPitch -= 0.25 * rest;
          O.armLRoll += Math.sin(tt * 1.7) * 0.07;
          O.armRRoll += Math.sin(tt * 1.7 + 2) * 0.07;
          T.lean -= 0.08;
        } else if (this.idleStyle === 1) {
          // Arms folded across the belly.
          this.foldArms(T, rest);
        } else if (this.idleStyle === 2) {
          // Hands behind the head, leaning way back.
          T.armLRoll += 1.25 * rest;
          T.armRRoll += 1.25 * rest;
          T.armLPitch += 1.0 * rest;
          T.armRPitch += 1.0 * rest;
          T.elbowL += 2.0 * rest;
          T.elbowR += 2.0 * rest;
          T.lean -= 0.1;
          T.headPitch -= 0.1;
        } else {
          // Hands resting on the desk, drumming fingers.
          this.handsOnDesk(T, 'LR', rest);
          O.elbowR += Math.max(0, Math.sin(tt * 9)) * 0.06 * rest;
        }
        // A lazy swivel and swinging feet.
        b.heading.setTarget(this.desk.yaw + Math.sin(tt * 0.45) * 0.28);
        O.kneeL += Math.sin(tt * 2.1) * 0.12;
        O.kneeR += Math.sin(tt * 2.1 + 1.6) * 0.12;
        T.headYaw += this.glance.yaw;
        T.headPitch += this.glance.pitch - 0.05;
        break;
      }
      case 'starting': {
        this.handsOnDesk(T, 'LR');
        T.headYaw += Math.sin(tt * 0.8) * 0.65;
        T.brow += 0.4;
        break;
      }
      case 'working':
      default:
        this.workingPose(tt, this.kind ?? 'thinking');
        break;
    }
  }

  /** Forearms resting on the desk edge. */
  protected handsOnDesk(T: Pose, which: 'L' | 'R' | 'LR', k = 1): void {
    if (which.includes('L')) {
      T.armLPitch += 0.85 * k;
      T.elbowL += 0.85 * k;
    }
    if (which.includes('R')) {
      T.armRPitch += 0.85 * k;
      T.elbowR += 0.85 * k;
    }
  }

  /** Arms crossed over the belly. */
  protected foldArms(T: Pose, k = 1): void {
    T.armLPitch += 0.5 * k;
    T.armRPitch += 0.5 * k;
    T.armLRoll -= 0.3 * k;
    T.armRRoll -= 0.3 * k;
    T.armLYaw += 0.35 * k;
    T.armRYaw += 0.35 * k;
    T.elbowL += 1.65 * k;
    T.elbowR += 1.75 * k;
  }

  private workingPose(tt: number, kind: ActivityKind): void {
    const b = this.body;
    const T = b.target;
    const O = b.over;
    const typing = (speed: number, amt: number) => {
      T.lean += 0.14;
      T.armLPitch += 1.0;
      T.armRPitch += 1.0;
      T.armLRoll -= 0.06;
      T.armRRoll -= 0.06;
      T.elbowL += 0.8;
      T.elbowR += 0.8;
      T.headPitch += 0.08;
      // Little bursts with pauses, like real typing; shoulders bob with it.
      const burst = Math.sin(tt * 0.9) > -0.6 ? 1 : 0.15;
      O.elbowL += Math.sin(tt * speed) * amt * burst;
      O.elbowR += Math.sin(tt * speed + Math.PI) * amt * burst;
      O.armLRoll += Math.sin(tt * speed * 0.7) * 0.03 * burst;
      O.side += Math.sin(tt * speed * 0.5) * 0.012 * burst;
      O.headPitch += Math.sin(tt * speed * 0.5) * 0.012 * burst;
      if (burst > 0.5 && Math.sin(tt * 0.31) > 0) b.say('flat', 0.1);
    };
    switch (kind) {
      case 'typing':
        typing(19, 0.12);
        T.brow += 0.15;
        break;
      case 'reading':
        // Leaning in, nose to the screen, scrolling now and then.
        T.lean += 0.34;
        T.headPitch += 0.16;
        this.handsOnDesk(T, 'LR');
        T.armLRoll -= 0.2;
        O.headYaw += Math.sin(tt * 1.7) * 0.11;
        O.elbowR += Math.max(0, Math.sin(tt * 2.4)) * 0.08;
        T.brow -= 0.3;
        b.say('flat', 0.1);
        break;
      case 'running': {
        // Type the command, lean back with arms folded and watch it go.
        const cyc = tt % 7;
        if (cyc < 2.4) typing(17, 0.1);
        else {
          T.lean -= 0.2;
          this.foldArms(T);
          T.headPitch -= 0.04;
          O.headPitch += Math.sin(tt * 3) * 0.02;
          T.brow += 0.35;
        }
        break;
      }
      case 'browsing':
        // Hand on the mouse, scroll scroll scroll.
        T.lean += 0.12;
        T.armRPitch += 0.95;
        T.armRRoll += 0.22;
        T.elbowR += 0.8;
        this.handsOnDesk(T, 'L');
        T.armLRoll -= 0.15;
        O.elbowR += (Math.sin(tt * 6.5) > 0.55 ? 1 : 0) * 0.08;
        O.headRoll += Math.sin(tt * 0.9) * 0.08;
        T.brow += 0.2;
        break;
      case 'thinking':
        // Hand on chin, eyes up, other arm across the belly.
        T.armRPitch += 0.9;
        T.armRRoll -= 0.32;
        T.armRYaw += 0.35;
        T.elbowR += 1.95;
        T.armLPitch += 0.5;
        T.armLRoll -= 0.3;
        T.armLYaw += 0.35;
        T.elbowL += 1.6;
        T.headRoll += 0.16;
        T.headPitch -= 0.14;
        T.headYaw += Math.sin(tt * 0.6) * 0.18;
        T.lean += 0.02;
        T.brow += 0.25;
        O.elbowR += Math.sin(tt * 2.2) * 0.04;
        b.say(Math.sin(tt * 0.5) > 0.6 ? 'open' : 'flat', 0.1);
        break;
      case 'delegating': {
        // Turn toward the interns and point, arm straight, jabbing for emphasis.
        let rel = 0.9;
        if (this.internFocus) {
          const yawTo = Math.atan2(this.internFocus.x - this.position.x, this.internFocus.z - this.position.z);
          rel = clamp(angleDelta(this.body.heading.value, yawTo), -1.4, 1.4);
        }
        T.twist += rel * 0.45;
        T.headYaw += rel * 0.55;
        const jab = Math.pow(Math.max(0, Math.sin(tt * 2.6)), 3);
        const reach = 0.25 + Math.min(Math.abs(rel), 1.2) * 0.45;
        if (rel > 0) {
          T.armLPitch += 1.5;
          T.armLRoll += reach;
          T.elbowL -= 0.15;
          O.elbowL += (1 - jab) * 0.25;
          this.handsOnDesk(T, 'R');
        } else {
          T.armRPitch += 1.5;
          T.armRRoll += reach;
          T.elbowR -= 0.15;
          O.elbowR += (1 - jab) * 0.25;
          this.handsOnDesk(T, 'L');
        }
        T.brow += 0.3;
        if (Math.sin(tt * 1.7) > 0.4) b.say('open', 0.1);
        break;
      }
      case 'asking':
      case 'planning':
        // Scribbling on a pad.
        T.lean += 0.22;
        T.headPitch += 0.3;
        T.armRPitch += 0.85;
        T.elbowR += 0.95;
        this.handsOnDesk(T, 'L');
        T.armLRoll -= 0.25;
        O.elbowR += Math.sin(tt * 15) * 0.07;
        O.armRRoll += Math.cos(tt * 15) * 0.05;
        O.headYaw += Math.sin(tt * 0.7) * 0.06;
        b.say('flat', 0.1);
        break;
      default:
        typing(11, 0.08);
        break;
    }
  }

  /** Remove from the scene. */
  dispose(): void {
    this.rig.dispose();
  }
}

/** XZ distance. */
export function distXZ(a: THREE.Vector3, b: THREE.Vector3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
