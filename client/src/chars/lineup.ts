// Debug: `?lineup=1` puts every hair style, the manager and an intern in a row in front
// of the camera, idling (or `&pose=walk|run|jump`). For tuning looks and wobble.
import * as THREE from 'three';
import { Body } from './body';
import { employeeLooks, internLooks, managerLooks, type HairStyle, type Looks } from './looks';
import type { DebugPose } from './manager';
import { Rig } from './rig';

const STYLES: HairStyle[] = ['tuft', 'bob', 'cap', 'beanie', 'bun', 'headphones', 'bald'];

export interface Lineup {
  update(dt: number, t: number, look: THREE.Vector3): void;
  centre: THREE.Vector3;
}

export function createLineup(scene: THREE.Object3D, at: THREE.Vector3, yaw: number, pose: DebugPose | null): Lineup {
  const people: { body: Body; phase: number }[] = [];
  const looks: Looks[] = [managerLooks()];
  STYLES.forEach((style, i) => {
    const l = employeeLooks('lineup-' + i * 7919, i % 2 === 0);
    l.hairStyle = style;
    l.glasses = i === 1 || i === 5;
    looks.push(l);
  });
  looks.push(internLooks('intern-a'));
  const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const n = looks.length;
  looks.forEach((l, i) => {
    const rig = new Rig(l);
    rig.root.position.copy(at).addScaledVector(side, (i - (n - 1) / 2) * 0.82);
    scene.add(rig.root);
    const body = new Body(rig, yaw);
    people.push({ body, phase: i * 0.7 });
  });
  return {
    centre: at.clone(),
    update(dt, t, look) {
      for (const p of people) {
        const b = p.body;
        b.begin();
        if (pose === 'jump') {
          b.hop = 0.5;
          b.flail(t + p.phase, 1.2);
        } else if (pose) {
          b.locomote(dt, pose === 'run' ? 4.5 : 2.2, pose === 'run' ? 1 : 0, b.rig.root.scale.y);
        } else {
          b.idle(dt, t + p.phase);
          b.lookAt(look, 0.8);
          if (b.rig.laptop) {
            b.target.armLPitch += 0.5;
            b.target.armRPitch += 0.5;
            b.target.elbowL += 0.9;
            b.target.elbowR += 0.9;
          }
          if (b.rig.mug) {
            b.target.armRPitch += 0.35;
            b.target.armRRoll -= 0.12;
            b.target.elbowR += 0.95;
          }
        }
        b.update(dt);
      }
    },
  };
}
