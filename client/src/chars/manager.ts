// You. White shirt, red tie, coffee mug, walks around being okay at managing.
import * as THREE from 'three';
import type { World } from '../world/types';
import { Body } from './body';
import { pushOutOfBoxes, pushOutOfCircle } from './collide';
import { managerLooks } from './looks';
import { Rig } from './rig';
import { angleDelta, clamp, damp } from './spring';

export interface MoveIntent {
  /** −1..1 strafe (right +). */
  x: number;
  /** −1..1 forward (+) / back. */
  y: number;
  run: boolean;
  jump: boolean;
}

/** Something the manager can walk into. */
export interface Bumpable {
  position: THREE.Vector3;
  radius: number;
  bump(dir: THREE.Vector3, strength: number): void;
}

export type DebugPose = 'walk' | 'run' | 'jump';

const WALK = 2.2;
const RUN = 4.5;
const GRAVITY = 15;
const JUMP_V = 4.6;
export const MANAGER_RADIUS = 0.3;

const _d = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _before = new THREE.Vector3();

/** Random glances while standing around. Shared by everyone who idles. */
export class Glancer {
  yaw = 0;
  pitch = 0;
  private next = 1 + Math.random() * 2;
  constructor(
    private range = 0.7,
    private every: [number, number] = [1.6, 4],
  ) {}
  update(dt: number): void {
    this.next -= dt;
    if (this.next > 0) return;
    this.next = this.every[0] + Math.random() * (this.every[1] - this.every[0]);
    const centre = Math.random() < 0.35;
    this.yaw = centre ? 0 : (Math.random() * 2 - 1) * this.range;
    this.pitch = centre ? 0 : (Math.random() * 2 - 1) * 0.18;
  }
}

export class Manager {
  readonly rig = new Rig(managerLooks());
  readonly body: Body;
  readonly velocity = new THREE.Vector3();
  /** Nothing moves the manager while true (sitting at a terminal, panels open). */
  frozen = false;
  /** Seconds of coffee-powered speed left. */
  coffee = 0;
  debugPose: DebugPose | null = null;
  /** Fired on every footfall (for footstep sfx). */
  onStep: ((strength: number) => void) | null = null;

  private vy = 0;
  private height = 0;
  private grounded = true;
  private jumpWindup = -1;
  private path: THREE.Vector3[] | null = null;
  private arrive: (() => void) | null = null;
  private arriveYaw: number | null = null;
  private pathSpeed: number | null = null;
  private faceYaw: number | null = null;
  private moveSpeed = 0;
  private run01 = 0;
  private sipT = -1;
  private sipIn = 7;
  private still = 0;
  private glance = new Glancer(0.8);
  private bumpUntil = new WeakMap<Bumpable, number>();

  constructor(
    private world: World,
    scene: THREE.Object3D,
  ) {
    const s = world.managerStart;
    this.rig.root.position.copy(s.position).setY(0);
    this.body = new Body(this.rig, s.yaw);
    this.body.onStep = (k) => this.onStep?.(k);
    scene.add(this.rig.root);
  }

  get position(): THREE.Vector3 {
    return this.rig.root.position;
  }

  get yaw(): number {
    return this.body.heading.value;
  }

  get autoWalking(): boolean {
    return this.path !== null;
  }

  get airborne(): boolean {
    return !this.grounded;
  }

  /** Auto-walk along a path (from world.findPath). Any movement key cancels. `speed` overrides walk/run (hustle). */
  walkPath(path: THREE.Vector3[], onArrive?: () => void, faceYaw?: number, speed?: number): void {
    this.path = path.map((p) => p.clone().setY(0));
    this.arrive = onArrive ?? null;
    this.arriveYaw = faceYaw ?? null;
    this.pathSpeed = speed ?? null;
    this.faceYaw = null;
  }

  cancelWalk(): void {
    this.path = null;
    this.arrive = null;
    this.arriveYaw = null;
    this.pathSpeed = null;
  }

  /** Turn to face a heading and hold it (until moving again). */
  face(yaw: number | null): void {
    this.faceYaw = yaw;
  }

  teleport(p: THREE.Vector3, yaw: number): void {
    this.position.set(p.x, 0, p.z);
    this.body.heading.snap(yaw);
    this.velocity.set(0, 0, 0);
    this.body.teleported();
  }

  /** Take a sip (and, from the office machine, a boost). */
  sip(boost = false): void {
    if (this.sipT < 0) this.sipT = 0;
    if (boost) this.coffee = 25;
  }

  update(dt: number, t: number, intent: MoveIntent, camYaw: number, others: readonly Bumpable[]): void {
    if (dt <= 0) return;
    const body = this.body;
    const pos = this.position;
    body.begin();

    const hasInput = Math.abs(intent.x) + Math.abs(intent.y) > 0.01;
    if (hasInput && !this.frozen) {
      this.cancelWalk();
      this.faceYaw = null;
    }
    let run = intent.run;
    _d.set(0, 0, 0);
    if (this.frozen || this.debugPose) {
      // no steering
    } else if (this.path) {
      while (this.path.length && Math.hypot(pos.x - this.path[0].x, pos.z - this.path[0].z) < (this.path.length > 1 ? 0.4 : 0.12)) {
        this.path.shift();
      }
      if (!this.path.length) {
        const done = this.arrive;
        if (this.arriveYaw !== null) this.faceYaw = this.arriveYaw;
        this.cancelWalk();
        done?.();
      } else {
        let remaining = 0;
        let prev = pos;
        for (const p of this.path) {
          remaining += Math.hypot(p.x - prev.x, p.z - prev.z);
          prev = p;
        }
        const tgt = this.path[0];
        _dir.set(tgt.x - pos.x, 0, tgt.z - pos.z).normalize();
        run = this.pathSpeed !== null ? this.pathSpeed > WALK : remaining > 6;
        const cruise = this.pathSpeed ?? (run ? RUN * 0.85 : WALK);
        const sp = Math.min(cruise, remaining * 2.6 + 0.5);
        _d.copy(_dir).multiplyScalar(sp);
      }
    } else if (hasInput) {
      const fx = -Math.sin(camYaw);
      const fz = -Math.cos(camYaw);
      const rx = Math.cos(camYaw);
      const rz = -Math.sin(camYaw);
      let mx = fx * intent.y + rx * intent.x;
      let mz = fz * intent.y + rz * intent.x;
      const len = Math.hypot(mx, mz);
      if (len > 1) {
        mx /= len;
        mz /= len;
      }
      const sp = (run ? RUN : WALK) * (this.coffee > 0 ? 1.3 : 1);
      _d.set(mx * sp, 0, mz * sp);
    }

    // Accelerate toward the wish velocity (sluggish in the air, snappy stops on the ground).
    const stopping = _d.lengthSq() < 0.01;
    const k = damp(this.grounded ? (stopping ? 14 : 9) : 2.2, dt);
    this.velocity.x += (_d.x - this.velocity.x) * k;
    this.velocity.z += (_d.z - this.velocity.z) * k;

    _before.copy(pos);
    pos.x += this.velocity.x * dt;
    pos.z += this.velocity.z * dt;
    pushOutOfBoxes(pos, MANAGER_RADIUS, this.world.colliders);
    for (const o of others) {
      const pen = pushOutOfCircle(pos, MANAGER_RADIUS, o.position.x, o.position.z, o.radius);
      if (pen <= 0) continue;
      const sp = Math.hypot(this.velocity.x, this.velocity.z);
      if (sp > 0.9 && t > (this.bumpUntil.get(o) ?? 0)) {
        this.bumpUntil.set(o, t + 0.9);
        _dir.set(o.position.x - pos.x, 0, o.position.z - pos.z).normalize();
        o.bump(_dir, clamp(sp / RUN, 0.3, 1));
        body.shove(_dir.clone().negate(), clamp(sp / RUN, 0.2, 0.6) * 0.6);
        this.velocity.multiplyScalar(0.25);
      }
    }
    const moved = Math.hypot(pos.x - _before.x, pos.z - _before.z) / dt;
    this.moveSpeed += (moved - this.moveSpeed) * damp(14, dt);

    // Facing.
    const vSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (vSpeed > 0.25) body.heading.setTarget(Math.atan2(this.velocity.x, this.velocity.z));
    else if (this.faceYaw !== null) body.heading.setTarget(this.faceYaw);

    // Jump: a quick squash wind-up, then launch.
    if (intent.jump && this.grounded && this.jumpWindup < 0 && !this.frozen) {
      this.jumpWindup = 0;
      body.spring('squash').kick(-2.6);
      body.spring('crouch').kick(-0.8);
    }
    if (this.jumpWindup >= 0) {
      this.jumpWindup += dt;
      body.target.squash -= 0.25;
      if (this.jumpWindup >= 0.075) {
        this.jumpWindup = -1;
        this.vy = JUMP_V;
        this.grounded = false;
        body.spring('squash').kick(4.2);
        body.spring('armLRoll').kick(9);
        body.spring('armRRoll').kick(9);
      }
    }
    if (!this.grounded) {
      this.vy -= GRAVITY * dt;
      this.height += this.vy * dt;
      if (this.height <= 0) {
        this.height = 0;
        body.land(Math.abs(this.vy) * 0.9);
        this.onStep?.(1);
        this.vy = 0;
        this.grounded = true;
      }
    }

    // Animation.
    let speed = this.grounded ? this.moveSpeed : 0;
    let airborne = !this.grounded;
    let vy = this.vy;
    if (this.debugPose === 'walk') speed = WALK;
    if (this.debugPose === 'run') speed = RUN;
    if (this.debugPose === 'jump') {
      airborne = true;
      vy = 1.2;
      this.height = 0.55;
    }
    body.hop = this.height;
    const runTarget = clamp((speed - 2.6) / 1.6, 0, 1);
    this.run01 += (runTarget - this.run01) * damp(6, dt);
    if (airborne) body.flail(t, vy);
    else body.locomote(dt, speed, this.run01, this.rig.root.scale.y);

    // Holding the mug out in front; breathing.
    body.target.armRPitch += 0.7;
    body.target.armRRoll -= 0.12;
    body.over.squash += Math.sin(t * 2.3) * 0.01;

    this.still = speed < 0.2 && !airborne ? this.still + dt : 0;
    if (this.still > 1.5 && this.sipT < 0) {
      this.glance.update(dt);
      body.target.headYaw += this.glance.yaw;
      body.target.headPitch += this.glance.pitch;
      this.sipIn -= dt;
      if (this.sipIn <= 0) {
        this.sipIn = 8 + Math.random() * 8;
        this.sipT = 0;
      }
    }
    if (this.sipT >= 0) {
      this.sipT += dt;
      const up = this.sipT < 0.35 ? this.sipT / 0.35 : this.sipT < 1.1 ? 1 : Math.max(0, 1 - (this.sipT - 1.1) / 0.35);
      body.target.armRPitch += up * 1.55;
      body.target.armRRoll -= up * 0.38;
      body.target.armRYaw += up * 0.3;
      body.target.headPitch -= up * 0.22;
      body.sip = up * 0.95;
      if (this.sipT > 1.5) this.sipT = -1;
    } else {
      body.sip = 0;
    }
    if (this.coffee > 0) this.coffee -= dt;

    body.update(dt);
  }

  /** XZ distance from the manager to a point. */
  distanceTo(p: THREE.Vector3): number {
    return Math.hypot(p.x - this.position.x, p.z - this.position.z);
  }

  /** True while the manager is turned (mostly) toward `yaw`. */
  facing(yaw: number, tolerance = 0.5): boolean {
    return Math.abs(angleDelta(this.yaw, yaw)) < tolerance;
  }
}
