// Mabel, the receptionist: a permanent regular (chars/npc.ts) behind the front desk. There from
// page load, never displaced, no shifts and no breaks: types, takes calls on the headset, sips
// tea, waves at everyone who comes in or goes out of the front door and looks up when the boss
// comes over. Not a Claude session: never in the roster, HUD, toasts, Q or any server request.
// The crew (chars/regulars.ts) decides who she waves at and what she says.
import * as THREE from 'three';
import type { DeskSlot, World } from '../world/types';
import type { Chair } from './employee';
import { kitReport } from './kit';
import { receptionistLooks } from './looks';
import { RegularChar, pulse, type RegularProfile, type TaskRow } from './npc';
import { clamp } from './spring';

export const RECEPTIONIST: RegularProfile = { id: 'regular:mabel', name: 'Mabel', dept: 'Front desk' };

/** Mostly typing and calls, a cup of tea now and then. ('phone' is a headset call here.) */
const TASKS: readonly TaskRow[] = [
  ['type', 32, 8, 18],
  ['phone', 22, 8, 16],
  ['read', 10, 5, 12],
  ['mouse', 10, 5, 12],
  ['notes', 8, 5, 10],
  ['sip', 9, 6, 9],
  ['idle', 6, 4, 8],
];

/** She looks up at the boss from this far away. */
const LOOK_UP = 5.5;

export class ReceptionistChar extends RegularChar {
  /** The boss's head (the crew sets it each frame). */
  boss: THREE.Vector3 | null = null;
  private readonly boom: THREE.Group;
  private readonly boomMat: THREE.MeshStandardMaterial;

  constructor(slot: DeskSlot, chair: Chair, world: World, scene: THREE.Object3D, seated: boolean, rand: () => number) {
    super(RECEPTIONIST, slot, chair, world, scene, seated, rand, ['calendar', 'mail', 'sheet'], { looks: receptionistLooks(), tasks: TASKS });
    // The headset's mic: a little boom from the left ear cup round to the mouth (head space).
    this.boomMat = new THREE.MeshStandardMaterial({ color: '#2B2D42', roughness: 0.5 });
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.29, -0.05, 0.05),
      new THREE.Vector3(0.25, -0.11, 0.17),
      new THREE.Vector3(0.16, -0.135, 0.25),
      new THREE.Vector3(0.085, -0.125, 0.278),
    ]);
    const mic = new THREE.Mesh(new THREE.SphereGeometry(0.024, 14, 10), this.boomMat);
    mic.position.copy(curve.getPoint(1));
    this.boom = new THREE.Group();
    this.boom.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.011, 8), this.boomMat), mic);
    // On the hair group, so it bobs with the headphones.
    this.rig.hair.add(this.boom);
  }

  override dispose(): void {
    this.boom.removeFromParent();
    this.boom.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.boomMat.dispose();
    super.dispose();
  }

  protected override extraPose(dt: number, t: number): void {
    super.extraPose(dt, t);
    // The mic fades with her, and steps aside if the kit puts a headset with its own mic on.
    const fade = (this.rig.shadow.material as THREE.Material).opacity;
    this.boom.visible = fade > 0.001 && kitReport(this.rig)?.plan.hat !== 'headset_mic';
    if (this.boomMat.opacity !== fade) {
      this.boomMat.transparent = fade < 0.999;
      this.boomMat.opacity = fade;
    }
    // Looks up when the boss comes over.
    if (this.boss && this.seated) {
      const d = Math.hypot(this.boss.x - this.position.x, this.boss.z - this.position.z);
      if (d < LOOK_UP) this.body.lookAt(this.boss, 0.9 * clamp((LOOK_UP - d) / 1.5, 0, 1));
    }
  }

  /** A call on the headset: a tap on the ear cup to pick up (and hang up), then talking hands-free. */
  protected override phonePose(tt: number): void {
    const b = this.body;
    const T = b.target;
    const O = b.over;
    const t = this.taskT;
    const end = this.taskFor;
    const tap = pulse(t, 0, 0.7) + pulse(t, end - 0.7, end);
    T.armLPitch += 2.1 * tap;
    T.armLRoll += 0.3 * tap;
    T.elbowL += 1.4 * tap;
    T.headRoll -= 0.15 * tap;
    this.handsOnDesk(T, 'LR', 1 - tap);
    if (t > 0.6 && t < end - 0.6) {
      if (Math.sin(tt * 0.85) > -0.2) {
        // Talking, the right hand joining in.
        b.say(Math.sin(tt * 10.5) > -0.1 ? 'open' : 'smile', 0.1);
        O.armRRoll += Math.sin(tt * 2.2) * 0.1;
        O.elbowR += Math.max(0, Math.sin(tt * 3.1)) * 0.25;
        O.headPitch += Math.sin(tt * 4.4) * 0.03;
        T.brow += 0.25;
      } else {
        // Listening: nods.
        O.headPitch += Math.max(0, Math.sin(tt * 2.3)) * 0.12;
        T.headRoll += 0.08;
      }
    }
    // A little swivel in the chair while she talks.
    b.heading.setTarget(this.desk.yaw + Math.sin(tt * 0.4) * 0.22);
  }
}
