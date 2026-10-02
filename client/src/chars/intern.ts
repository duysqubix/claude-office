// A subagent: a mini employee in a backwards cap, standing by their boss's desk,
// bobbing and hammering on a tiny laptop. Walks in and out like everyone else.
import * as THREE from 'three';
import type { Intern } from '../../../shared/protocol';
import { hash32 } from '../style/palette';
import type { InternSlot, World } from '../world/types';
import { Body } from './body';
import { internLooks } from './looks';
import type { Bumpable } from './manager';
import { Rig } from './rig';
import { clamp, damp } from './spring';

export type InternPhase = 'entering' | 'present' | 'leaving' | 'gone';

const _v = new THREE.Vector3();

export class InternChar implements Bumpable {
  readonly rig: Rig;
  readonly body: Body;
  readonly radius = 0.26;
  phase: InternPhase;
  data: Intern;
  private path: THREE.Vector3[] = [];
  private speed = 0;
  private opacity = 1;
  private seed: number;

  // Takes the director's intern-bench arguments; until interns sit at the bench they keep
  // their reserved `slot` but still stand at `spot` by the boss's desk.
  constructor(
    data: Intern,
    _boss: unknown,
    readonly slot: InternSlot | null,
    public spot: THREE.Vector3,
    private world: World,
    scene: THREE.Object3D,
    present: boolean,
  ) {
    this.data = data;
    this.seed = hash32(data.id);
    this.rig = new Rig(internLooks(data.id));
    this.body = new Body(this.rig, 0);
    scene.add(this.rig.root);
    if (present) {
      this.phase = 'present';
      this.position.copy(spot).setY(0);
    } else {
      this.phase = 'entering';
      const out = world.entrance.outside;
      this.position.set(out.x + ((this.seed % 100) / 100 - 0.5), 0, out.z);
      this.walkTo(spot);
      this.opacity = 0;
      this.rig.setOpacity(0);
    }
  }

  get position(): THREE.Vector3 {
    return this.rig.root.position;
  }

  setData(next: Intern): void {
    this.data = next;
  }

  /** Move to a different spot at the desk (after the crew reshuffles). */
  moveTo(spot: THREE.Vector3): void {
    if (spot.distanceToSquared(this.spot) < 1e-4) return;
    this.spot = spot;
    if (this.phase === 'present' || this.phase === 'entering') {
      this.phase = 'entering';
      this.walkTo(spot);
    }
  }

  leave(): void {
    if (this.phase === 'leaving' || this.phase === 'gone') return;
    this.phase = 'leaving';
    this.walkTo(this.world.entrance.outside);
  }

  bump(dir: THREE.Vector3, strength: number): void {
    this.body.shove(dir, strength * 1.3);
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
    const want = 1.5;
    this.speed += (want - this.speed) * damp(5, dt);
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

  /** `boss` is the seated employee's head; `manager` the manager's head. */
  update(dt: number, t: number, boss: THREE.Vector3, manager: THREE.Vector3): void {
    if (this.phase === 'gone') return;
    const b = this.body;
    const s = this.rig.root.scale.y;
    b.begin();
    const tt = t + (this.seed % 600) / 100;
    switch (this.phase) {
      case 'entering': {
        this.opacity = Math.min(1, this.opacity + dt / 0.4);
        if (this.follow(dt)) this.phase = 'present';
        b.locomote(dt, this.speed, 0, s);
        break;
      }
      case 'present': {
        this.position.lerp(_v.copy(this.spot).setY(0), damp(4, dt));
        b.heading.setTarget(Math.atan2(boss.x - this.position.x, boss.z - this.position.z));
        b.locomote(dt, 0, 0, s);
        // Bob on the spot, typing like the deadline was yesterday.
        b.over.crouch += Math.abs(Math.sin(tt * 4.2)) * 0.03 - 0.015;
        b.over.squash += Math.sin(tt * 8.4) * 0.015;
        b.target.headPitch += 0.32;
        if (Math.sin(tt * 0.5) > 0.75) b.lookAt(boss, 0.9);
        else if (manager.distanceTo(this.position) < 3) b.lookAt(manager, 0.6);
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
    // Laptop hands, always.
    b.target.armLPitch += 0.95;
    b.target.armRPitch += 0.95;
    b.target.armLRoll -= 0.08;
    b.target.armRRoll -= 0.08;
    const typing = this.phase === 'present' ? 1 : 0.3;
    b.over.armLPitch += Math.sin(tt * 18) * 0.07 * typing;
    b.over.armRPitch += Math.sin(tt * 18 + Math.PI) * 0.07 * typing;
    this.rig.setOpacity(clamp(this.opacity, 0, 1));
    b.update(dt);
  }

  dispose(): void {
    this.rig.dispose();
  }
}
