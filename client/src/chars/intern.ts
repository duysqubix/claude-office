// A subagent: a mini employee in a backwards cap in their boss's colour. Walks in through
// the front door to a free station at the intern bench, hops onto the stool and types
// (or waits, swinging their legs), then hops down and walks back out when done.
// Without a bench (older worlds) they stand by their boss's desk with a tiny laptop.
import * as THREE from 'three';
import type { Intern } from '../../../shared/protocol';
import { hash32 } from '../style/palette';
import type { InternSlot, World } from '../world/types';
import { Body } from './body';
import { internLooks } from './looks';
import type { Bumpable } from './manager';
import { DIM, HEAD_Y, Rig } from './rig';
import { clamp, damp, smoothstep } from './spring';

export type InternPhase = 'entering' | 'sitting' | 'seated' | 'standing' | 'leaving' | 'gone';

/** Who an intern works for (shown on their pill and their cap). */
export interface InternBoss {
  name: string;
  shirt: string;
}

const SEAT_LIFT = 0.13;
const _v = new THREE.Vector3();

export class InternChar implements Bumpable {
  readonly rig: Rig;
  readonly body: Body;
  readonly radius = 0.26;
  /** Anchor for the name pill. */
  readonly labelAnchor = new THREE.Object3D();
  phase: InternPhase;
  data: Intern;
  private path: THREE.Vector3[] = [];
  private speed = 0;
  private opacity = 1;
  private seed: number;
  private phaseT = 0;
  private hopFrom = new THREE.Vector3();

  constructor(
    data: Intern,
    readonly boss: InternBoss,
    /** Their station at the bench, or null to stand at `spot` instead. */
    readonly slot: InternSlot | null,
    public spot: THREE.Vector3,
    private world: World,
    scene: THREE.Object3D,
    present: boolean,
  ) {
    this.data = data;
    this.seed = hash32(data.id);
    const looks = internLooks(data.id, boss.shirt);
    looks.laptop = !slot;
    this.rig = new Rig(looks);
    this.body = new Body(this.rig, slot?.yaw ?? 0);
    this.labelAnchor.position.y = DIM.pelvisY + HEAD_Y + DIM.headR + 0.25;
    this.rig.root.add(this.labelAnchor);
    scene.add(this.rig.root);
    if (present) {
      if (slot) {
        this.phase = 'seated';
        this.seatPoint(this.position);
        this.body.heading.snap(slot.yaw);
      } else {
        this.phase = 'seated';
        this.position.copy(spot).setY(0);
      }
      this.syncSlot();
    } else {
      this.phase = 'entering';
      const out = world.entrance.outside;
      this.position.set(out.x + ((this.seed % 100) / 100 - 0.5), 0, out.z);
      this.walkTo(this.target());
      this.opacity = 0;
      this.rig.setOpacity(0);
    }
  }

  get position(): THREE.Vector3 {
    return this.rig.root.position;
  }

  /** "<type> · <boss>", for the pill over their head. */
  get title(): string {
    return `${this.data.type.replace(/^.*:/, '') || 'intern'} · ${this.boss.name}`;
  }

  setData(data: Intern): void {
    const was = this.data.active;
    this.data = data;
    if (was !== data.active && this.phase === 'seated') this.syncSlot();
  }

  leave(): void {
    if (this.phase === 'leaving' || this.phase === 'gone' || this.phase === 'standing') return;
    if (this.phase === 'seated' && this.slot) {
      this.phase = 'standing';
      this.phaseT = 0;
      this.hopFrom.copy(this.position);
    } else {
      this.startLeaving();
    }
  }

  bump(dir: THREE.Vector3, strength: number): void {
    this.body.shove(dir, strength * 1.3);
  }

  dispose(): void {
    this.rig.dispose();
  }

  // -------------------------------------------------------------------------------------

  private target(): THREE.Vector3 {
    return this.slot ? this.slot.approach : this.spot;
  }

  private seatPoint(out: THREE.Vector3): THREE.Vector3 {
    const s = this.rig.root.scale.y;
    const slot = this.slot!;
    return out.copy(slot.seat).setY(slot.seat.y + SEAT_LIFT * s - DIM.pelvisY * s);
  }

  private syncSlot(): void {
    if (!this.slot) return;
    const seated = this.phase === 'seated' || this.phase === 'sitting';
    this.slot.setScreen(seated ? (this.data.active ? 'working' : 'idle') : 'off');
    this.slot.setLabel(this.data.type.replace(/^.*:/, '') || 'intern', `for ${this.boss.name}`);
  }

  private startLeaving(): void {
    this.phase = 'leaving';
    this.phaseT = 0;
    if (this.slot) {
      this.slot.setScreen('off');
      this.slot.setLabel('');
    }
    this.walkTo(this.world.entrance.outside);
  }

  private walkTo(target: THREE.Vector3): void {
    const p = this.world.findPath(this.position.clone().setY(0), target.clone().setY(0));
    this.path = (p && p.length ? p : [target.clone()]).map((v) => v.clone().setY(0));
  }

  private follow(dt: number): boolean {
    const pos = this.position;
    while (this.path.length && Math.hypot(this.path[0].x - pos.x, this.path[0].z - pos.z) < (this.path.length > 1 ? 0.3 : 0.05)) {
      this.path.shift();
    }
    if (!this.path.length) {
      this.speed += (0 - this.speed) * damp(10, dt);
      return true;
    }
    this.speed += (1.5 - this.speed) * damp(5, dt);
    const tgt = this.path[0];
    _v.set(tgt.x - pos.x, 0, tgt.z - pos.z);
    const d = _v.length();
    if (d > 1e-4) {
      _v.multiplyScalar(1 / d);
      pos.addScaledVector(_v, Math.min(d, this.speed * dt));
      this.body.heading.setTarget(Math.atan2(_v.x, _v.z));
    }
    return false;
  }

  /** `boss` is the boss's head; `manager` the manager's head. */
  update(dt: number, t: number, boss: THREE.Vector3, manager: THREE.Vector3): void {
    if (this.phase === 'gone') return;
    const b = this.body;
    const s = this.rig.root.scale.y;
    b.begin();
    b.hop = 0;
    this.phaseT += dt;
    const tt = t + (this.seed % 600) / 100;
    switch (this.phase) {
      case 'entering': {
        this.opacity = Math.min(1, this.opacity + dt / 0.4);
        if (this.follow(dt)) {
          this.phase = this.slot ? 'sitting' : 'seated';
          this.phaseT = 0;
          this.hopFrom.copy(this.position);
          this.syncSlot();
        }
        b.locomote(dt, this.speed, 0, s);
        break;
      }
      case 'sitting': {
        // A quick hop onto the stool.
        const u = clamp(this.phaseT / 0.35, 0, 1);
        b.heading.setTarget(this.slot!.yaw);
        this.position.lerpVectors(this.hopFrom, this.seatPoint(_v), smoothstep(u));
        b.hop = Math.sin(Math.PI * u) * 0.12;
        b.target.legLPitch += 1.45 * smoothstep(u);
        b.target.legRPitch += 1.45 * smoothstep(u);
        b.target.kneeL += 1.4 * smoothstep(u);
        b.target.kneeR += 1.4 * smoothstep(u);
        if (u >= 1) {
          this.phase = 'seated';
          b.land(2);
          this.syncSlot();
        }
        break;
      }
      case 'seated': {
        if (this.slot) {
          this.seatPoint(this.position);
          b.heading.setTarget(this.slot.yaw);
          this.seatedPose(tt);
        } else {
          this.position.lerp(_v.copy(this.spot).setY(0), damp(4, dt));
          b.heading.setTarget(Math.atan2(boss.x - this.position.x, boss.z - this.position.z));
          b.locomote(dt, 0, 0, s);
          b.idle(dt, t);
          this.standingPose(tt);
        }
        if (Math.sin(tt * 0.5) > 0.8) b.lookAt(boss, 0.7);
        else if (manager.distanceTo(this.position) < 3) b.lookAt(manager, 0.6);
        break;
      }
      case 'standing': {
        const u = clamp(this.phaseT / 0.35, 0, 1);
        this.position.lerpVectors(this.hopFrom, _v.copy(this.slot!.approach).setY(0), smoothstep(u));
        b.hop = Math.sin(Math.PI * u) * 0.12;
        b.target.legLPitch += 1.45 * (1 - smoothstep(u));
        b.target.legRPitch += 1.45 * (1 - smoothstep(u));
        b.target.kneeL += 1.4 * (1 - smoothstep(u));
        b.target.kneeR += 1.4 * (1 - smoothstep(u));
        if (u >= 1) {
          b.land(2);
          this.startLeaving();
        }
        break;
      }
      case 'leaving': {
        const done = this.follow(dt);
        b.locomote(dt, this.speed, 0, s);
        if (done) this.opacity -= dt / 0.4;
        if (this.opacity <= 0) {
          this.phase = 'gone';
          this.rig.setOpacity(0);
          return;
        }
        break;
      }
    }
    // Laptop interns carry it in front of them while walking.
    if ((this.phase === 'entering' || this.phase === 'leaving') && !this.slot) this.standingPose(tt, 0.3);
    this.rig.setOpacity(clamp(this.opacity, 0, 1));
    b.update(dt);
  }

  /** At the bench: typing away, or leaning back swinging their legs while they wait. */
  private seatedPose(tt: number): void {
    const b = this.body;
    const T = b.target;
    const O = b.over;
    T.legLPitch += 1.45;
    T.legRPitch += 1.45;
    T.kneeL += 1.4;
    T.kneeR += 1.4;
    // Short legs swinging off the stool.
    O.kneeL += Math.sin(tt * 2.4) * 0.16;
    O.kneeR += Math.sin(tt * 2.4 + 1.9) * 0.16;
    if (this.data.active) {
      T.lean += 0.15;
      T.armLPitch += 1.0;
      T.armRPitch += 1.0;
      T.armLRoll -= 0.06;
      T.armRRoll -= 0.06;
      T.elbowL += 0.8;
      T.elbowR += 0.8;
      T.headPitch += 0.12;
      O.elbowL += Math.sin(tt * 18) * 0.1;
      O.elbowR += Math.sin(tt * 18 + Math.PI) * 0.1;
      O.squash += Math.sin(tt * 9) * 0.012;
      b.say('flat', 0.1);
    } else {
      // Waiting: leaning back, arms folded, looking around.
      T.lean -= 0.15;
      T.armLPitch += 0.5;
      T.armRPitch += 0.5;
      T.armLRoll -= 0.3;
      T.armRRoll -= 0.3;
      T.armLYaw += 0.35;
      T.armRYaw += 0.35;
      T.elbowL += 1.65;
      T.elbowR += 1.75;
      T.headYaw += Math.sin(tt * 0.7) * 0.5;
      O.squash += Math.sin(tt * 1.6) * 0.012;
    }
  }

  /** Standing (no bench): bobbing and hammering on the tiny laptop. */
  private standingPose(tt: number, typing = 1): void {
    const b = this.body;
    b.target.armLPitch += 0.5;
    b.target.armRPitch += 0.5;
    b.target.armLRoll -= 0.08;
    b.target.armRRoll -= 0.08;
    b.target.elbowL += 0.9;
    b.target.elbowR += 0.9;
    if (this.phase !== 'seated') return;
    b.over.crouch += Math.abs(Math.sin(tt * 4.2)) * 0.03 - 0.015;
    b.target.headPitch += 0.32;
    b.over.elbowL += Math.sin(tt * 18) * 0.1 * typing;
    b.over.elbowR += Math.sin(tt * 18 + Math.PI) * 0.1 * typing;
  }
}
