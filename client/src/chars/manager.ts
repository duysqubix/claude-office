// You. White shirt, red tie, coffee mug, walks around being okay at managing.
import * as THREE from 'three';
import type { World } from '../world/types';
import { Body } from './body';
import { pushOutOfBoxes, pushOutOfCircle } from './collide';
import { managerLooks } from './looks';
import { Rig } from './rig';
import { angleDelta, clamp, damp, smoothstep } from './spring';

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
  /** In a seat (or getting in or out of one): they won't step aside, so auto-walks go round them. */
  readonly atDesk?: boolean;
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
const _ahead = new THREE.Vector3();
const _look = new THREE.Vector3();

/** An auto-walk starts turning to whoever it's to this far from the end, so they arrive facing them. */
const TURN_IN = 1.8;
/** Room an auto-walk keeps past someone seated by its path, beyond touching. */
const SEAT_CLEARANCE = 0.14;

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

/** The point on segment a–b nearest `p` (XZ), into `out`. */
function nearestOn(a: THREE.Vector3, b: THREE.Vector3, p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const lx = b.x - a.x;
  const lz = b.z - a.z;
  const len2 = lx * lx + lz * lz;
  const k = len2 > 1e-9 ? clamp(((p.x - a.x) * lx + (p.z - a.z) * lz) / len2, 0, 1) : 0;
  return out.set(a.x + lx * k, 0, a.z + lz * k);
}

/**
 * Corner `a` taken as a curve: already on the next leg (toward `b`), just past its start and
 * close to its line. A corner on the far side of a desk row never counts (it's not close).
 */
function rounded(pos: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): boolean {
  const lx = b.x - a.x;
  const lz = b.z - a.z;
  const len = Math.hypot(lx, lz);
  if (len < 1e-6) return true;
  const along = ((pos.x - a.x) * lx + (pos.z - a.z) * lz) / len;
  const off = Math.abs((pos.x - a.x) * lz - (pos.z - a.z) * lx) / len;
  return along > 0 && along < len && off < 0.6;
}

export interface WalkOptions {
  onArrive?: () => void;
  /** Face this way on arrival (turning in over the last stretch). */
  faceYaw?: number;
  /** m/s, instead of walking or running by distance (a hustle). */
  speed?: number;
  /** Someone's live position: turned to over the last stretch and faced on arrival. */
  faceAt?: THREE.Vector3;
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
  /** A jump leaves the floor (sfx). */
  onJump: (() => void) | null = null;
  /** Back on the floor after a jump; `strength` ≈ 1 for a full one (sfx). Comes with a footfall too. */
  onLand: ((strength: number) => void) | null = null;

  private vy = 0;
  private height = 0;
  private grounded = true;
  private jumpWindup = -1;
  private path: THREE.Vector3[] | null = null;
  private arrive: (() => void) | null = null;
  private arriveYaw: number | null = null;
  private pathSpeed: number | null = null;
  /** Who an auto-walk is to (their live position): faced near the end and on arrival. */
  private walkFace: THREE.Vector3 | null = null;
  /** The heading an auto-walk ends on (toward walkFace, or the arrival yaw), and how far into turning to it (0..1). */
  private endYaw: number | null = null;
  private turnIn = 0;
  /** Seconds an auto-walk has been stuck near its end (someone standing on it). */
  private stalled = 0;
  /** Seconds since the last auto-walk ended (the first-person view keeps settling on them a moment). */
  private sinceWalk = Infinity;
  private faceYaw: number | null = null;
  private moveSpeed = 0;
  private run01 = 0;
  private sipT = -1;
  private sipIn = 7;
  private still = 0;
  private glance = new Glancer(0.8);
  private bumpUntil = new WeakMap<Bumpable, number>();
  /** Everyone around, as of the last update (an auto-walk plans round the seated ones). */
  private others: readonly Bumpable[] = [];

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

  /**
   * On an auto-walk, or just off one and still turning to face whoever it was to. Not once you
   * steer yourself: then the heading follows your keys (and the view), and a view chasing it
   * would spin.
   */
  get walkSettling(): boolean {
    return this.path !== null || (this.sinceWalk < 1.2 && this.faceYaw !== null);
  }

  /** The heading the body is turning to (not where it is mid-turn): what a following view aims at. */
  get facingGoal(): number {
    return this.body.heading.target;
  }

  get airborne(): boolean {
    return !this.grounded;
  }

  /** Height off the floor (jumps). */
  get hop(): number {
    return this.height;
  }

  /** Measured ground speed, m/s. */
  get speed(): number {
    return this.moveSpeed;
  }

  /** How far into a sip the mug is (0..1), for the first-person view. */
  get sipping(): number {
    return this.body.sip / 0.95;
  }

  /**
   * Auto-walk along a path (from world.findPath). Any movement key cancels. The walk faces where
   * it's going, head first; near the end it turns to `faceAt` (someone's live position) or
   * `faceYaw`, so it arrives already facing them.
   */
  walkPath(path: THREE.Vector3[], opts: WalkOptions = {}): void {
    this.path = this.aroundSeated(path.map((p) => p.clone().setY(0)), opts.faceAt ?? null);
    this.arrive = opts.onArrive ?? null;
    this.arriveYaw = opts.faceYaw ?? null;
    this.pathSpeed = opts.speed ?? null;
    this.walkFace = opts.faceAt ?? null;
    this.endYaw = this.arriveYaw;
    this.turnIn = 0;
    this.stalled = 0;
    this.faceYaw = null;
  }

  cancelWalk(): void {
    this.path = null;
    this.arrive = null;
    this.arriveYaw = null;
    this.pathSpeed = null;
    this.walkFace = null;
    this.endYaw = null;
    this.turnIn = 0;
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
    this.others = others;
    body.begin();

    const hasInput = Math.abs(intent.x) + Math.abs(intent.y) > 0.01;
    if (hasInput && !this.frozen) {
      this.cancelWalk();
      this.faceYaw = null;
      this.sinceWalk = Infinity;
    }
    let run = intent.run;
    _d.set(0, 0, 0);
    if (this.frozen || this.debugPose) {
      // no steering
    } else if (this.path) {
      const path = this.path;
      // A corner is done once it's within reach, or once we're round it (steering cuts it a little).
      while (path.length && (Math.hypot(pos.x - path[0].x, pos.z - path[0].z) < (path.length > 1 ? 0.4 : 0.12) || (path.length > 1 && rounded(pos, path[0], path[1])))) {
        path.shift();
      }
      let remaining = 0;
      let prev = pos;
      for (const p of path) {
        remaining += Math.hypot(p.x - prev.x, p.z - prev.z);
        prev = p;
      }
      // Near the end but not getting closer (someone's standing there): close enough.
      this.stalled = remaining < 1 && this.moveSpeed < 0.15 ? this.stalled + dt : 0;
      if (!path.length || remaining < 0.12 || this.stalled > 0.6) {
        const done = this.arrive;
        // Already turned to them on the way in; hold it.
        if (this.endYaw !== null) this.faceYaw = this.endYaw;
        this.cancelWalk();
        done?.();
      } else {
        // Steer for a point a little way along the path, so corners are taken as curves.
        this.along(clamp(this.moveSpeed * 0.2, 0.4, 1.0), _ahead);
        _dir.set(_ahead.x - pos.x, 0, _ahead.z - pos.z);
        if (_dir.lengthSq() < 1e-8) _dir.set(path[0].x - pos.x, 0, path[0].z - pos.z);
        _dir.normalize();
        run = this.pathSpeed !== null ? this.pathSpeed > WALK : remaining > 6;
        const cruise = this.pathSpeed ?? (run ? RUN * 0.85 : WALK);
        const sp = Math.min(cruise, remaining * 2.6 + 0.5);
        _d.copy(_dir).multiplyScalar(sp);
        // Who it's to: turn to them over the last stretch (their bearing from here, while it's well defined).
        if (this.walkFace && Math.hypot(this.walkFace.x - pos.x, this.walkFace.z - pos.z) > 0.4) {
          this.endYaw = Math.atan2(this.walkFace.x - pos.x, this.walkFace.z - pos.z);
        }
        this.turnIn = this.endYaw === null ? 0 : smoothstep((TURN_IN - remaining) / (TURN_IN - 0.3));
        // Head first: eyes on the way ahead, then on them.
        this.along(clamp(this.moveSpeed * 0.2, 0.4, 1.0) + 1.6, _look).setY(1.1);
        if (this.walkFace && this.turnIn > 0) _look.lerp(_ahead.copy(this.walkFace).setY(1.0), this.turnIn);
        body.lookAt(_look, 0.55);
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
      _dir.set(o.position.x - pos.x, 0, o.position.z - pos.z).normalize();
      // On an auto-walk only walking into someone is a bump; brushing past them isn't.
      const into = this.path ? this.velocity.x * _dir.x + this.velocity.z * _dir.z : sp;
      if (into > 0.9 && t > (this.bumpUntil.get(o) ?? 0)) {
        this.bumpUntil.set(o, t + 0.9);
        o.bump(_dir, clamp(sp / RUN, 0.3, 1));
        body.shove(_dir.clone().negate(), clamp(sp / RUN, 0.2, 0.6) * 0.6);
        this.velocity.multiplyScalar(0.25);
      }
    }
    const moved = Math.hypot(pos.x - _before.x, pos.z - _before.z) / dt;
    this.moveSpeed += (moved - this.moveSpeed) * damp(14, dt);

    // Facing: where we're going; at the end of an auto-walk, turning in to whoever it's to. A
    // held facing (arrived, or sat down) wins over the last of the stopping drift.
    const vSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.faceYaw !== null) body.heading.setTarget(this.faceYaw);
    else if (vSpeed > 0.25) {
      const going = Math.atan2(this.velocity.x, this.velocity.z);
      body.heading.setTarget(this.path && this.endYaw !== null ? going + angleDelta(going, this.endYaw) * this.turnIn : going);
    } else if (this.path && this.endYaw !== null && this.turnIn > 0) body.heading.setTarget(this.endYaw);
    this.sinceWalk = this.path ? 0 : this.sinceWalk + dt;

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
        this.onJump?.();
      }
    }
    if (!this.grounded) {
      this.vy -= GRAVITY * dt;
      this.height += this.vy * dt;
      if (this.height <= 0) {
        this.height = 0;
        body.land(Math.abs(this.vy) * 0.9);
        this.onLand?.(Math.abs(this.vy) / JUMP_V);
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

    // Holding the mug out in front (elbow bent); breathing and shifting weight when still.
    body.target.armRPitch += 0.35;
    body.target.armRRoll -= 0.12;
    body.target.elbowR += 0.95;
    if (speed < 0.2 && !airborne) body.idle(dt, t);

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
      // Upper arm forward, forearm folded up: the mug arrives at the mouth.
      body.target.armRPitch += up * 0.95;
      body.target.elbowR += up * 0.7;
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

  /**
   * The floor plan doesn't know that seated people's chairs stick out into the aisle, so a path
   * can run right past (or through) them. Add a waypoint round each one it cuts past, on the
   * side that's clear of furniture: up to twice per person (a corner beside them can need a
   * second), never round `skip` (who the walk is to).
   */
  private aroundSeated(path: THREE.Vector3[], skip: THREE.Vector3 | null): THREE.Vector3[] {
    const seated = this.others.filter((o) => o.atDesk && o.position !== skip);
    const pts = [this.position.clone().setY(0), ...path];
    const done = new Map<Bumpable, number>();
    for (let n = 0; n < 8; n++) {
      // The closest cut: whoever a leg passes nearest, inside the clearance.
      let who: Bumpable | null = null;
      let leg = -1;
      let worst = Infinity;
      for (const o of seated) {
        if ((done.get(o) ?? 0) >= 2) continue;
        for (let i = 0; i + 1 < pts.length; i++) {
          nearestOn(pts[i], pts[i + 1], o.position, _ahead);
          // Right where the leg starts (we're there already): no waypoint helps.
          if (Math.hypot(_ahead.x - pts[i].x, _ahead.z - pts[i].z) < 0.01) continue;
          const d = Math.hypot(_ahead.x - o.position.x, _ahead.z - o.position.z);
          if (d < MANAGER_RADIUS + o.radius + SEAT_CLEARANCE && d < worst) {
            worst = d;
            who = o;
            leg = i;
          }
        }
      }
      if (!who) break;
      done.set(who, (done.get(who) ?? 0) + 1);
      const w = this.stepRound(pts[leg], pts[leg + 1], who);
      if (w) pts.splice(leg + 1, 0, w);
    }
    return pts.slice(1);
  }

  /** A waypoint beside `who`, clear of them, that the walk a → it → b reaches over open floor. */
  private stepRound(a: THREE.Vector3, b: THREE.Vector3, who: Bumpable): THREE.Vector3 | null {
    const p = who.position;
    nearestOn(a, b, p, _ahead);
    let nx = _ahead.x - p.x;
    let nz = _ahead.z - p.z;
    // Dead on the line: either side will do.
    if (Math.hypot(nx, nz) < 1e-3) {
      nx = a.z - b.z;
      nz = b.x - a.x;
    }
    const len = Math.hypot(nx, nz) || 1;
    // A little wider than the clearance where there's room: the walk cuts corners by up to ~0.3 m.
    const clear = MANAGER_RADIUS + who.radius + SEAT_CLEARANCE;
    for (const r of [clear + 0.2, clear + 0.05]) {
      for (const side of [1, -1]) {
        const w = new THREE.Vector3(p.x + (nx / len) * r * side, 0, p.z + (nz / len) * r * side);
        if (this.openFloor(a, w) && this.openFloor(w, b)) return w;
      }
    }
    return null;
  }

  /** Walking straight from a to b stays off the furniture. */
  private openFloor(a: THREE.Vector3, b: THREE.Vector3): boolean {
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.15));
    const r = MANAGER_RADIUS * 0.9;
    for (let k = 0; k <= steps; k++) {
      const x = a.x + ((b.x - a.x) * k) / steps;
      const z = a.z + ((b.z - a.z) * k) / steps;
      for (const c of this.world.colliders) if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) return false;
    }
    return true;
  }

  /** The point `dist` metres further along the auto-walk's path (its end, if that's closer). */
  private along(dist: number, out: THREE.Vector3): THREE.Vector3 {
    let from = this.position;
    let left = dist;
    for (const p of this.path ?? []) {
      const seg = Math.hypot(p.x - from.x, p.z - from.z);
      if (seg >= left) {
        const k = seg > 1e-6 ? left / seg : 0;
        return out.set(from.x + (p.x - from.x) * k, 0, from.z + (p.z - from.z) * k);
      }
      left -= seg;
      from = p;
    }
    return out.set(from.x, 0, from.z);
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
