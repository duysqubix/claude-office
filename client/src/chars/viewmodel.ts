// First person: your own hand and coffee mug in the lower right of the view, bobbing as
// you walk. Drawn on top of the world so it never pokes into walls.
import * as THREE from 'three';
import { PALETTE } from '../style/palette';
import { damp } from './spring';

function mat(color: string, roughness = 0.6): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, depthTest: false, depthWrite: false });
}

export class ViewModel {
  readonly group = new THREE.Group();
  private rest = new THREE.Vector3(0.36, -0.25, -0.78);
  private phase = 0;
  private bob = 0;
  private sip = 0;

  constructor(skin: string) {
    const parts: [THREE.BufferGeometry, THREE.Material, THREE.Vector3, THREE.Euler, THREE.Vector3?][] = [];
    const sleeve = mat(PALETTE.managerShirt, 0.8);
    const hand = mat(skin, 0.6);
    const cream = mat('#FFF4E0', 0.45);
    const stripe = mat(PALETTE.managerTie, 0.6);
    const coffee = mat(PALETTE.coffee, 0.3);
    // Arm reaching in from the bottom right, mitten round the mug, mug on top.
    parts.push([new THREE.CapsuleGeometry(0.06, 0.22, 8, 16), sleeve, new THREE.Vector3(0.09, -0.16, 0.12), new THREE.Euler(-0.9, 0, -0.5)]);
    parts.push([new THREE.SphereGeometry(1, 24, 16), hand, new THREE.Vector3(0.01, -0.035, 0.01), new THREE.Euler(0, 0, 0), new THREE.Vector3(0.07, 0.08, 0.06)]);
    parts.push([new THREE.SphereGeometry(1, 16, 12), hand, new THREE.Vector3(-0.045, -0.005, 0.035), new THREE.Euler(0, 0, 0), new THREE.Vector3(0.03, 0.03, 0.03)]);
    parts.push([new THREE.CylinderGeometry(0.058, 0.052, 0.12, 28), cream, new THREE.Vector3(-0.02, 0.05, -0.03), new THREE.Euler(0, 0, 0)]);
    parts.push([new THREE.CylinderGeometry(0.0595, 0.0565, 0.022, 28, 1, true), stripe, new THREE.Vector3(-0.02, 0.04, -0.03), new THREE.Euler(0, 0, 0)]);
    parts.push([new THREE.CircleGeometry(0.05, 24), coffee, new THREE.Vector3(-0.02, 0.1, -0.03), new THREE.Euler(-Math.PI / 2, 0, 0)]);
    parts.push([new THREE.TorusGeometry(0.032, 0.011, 8, 18, Math.PI * 1.2), cream, new THREE.Vector3(0.038, 0.054, -0.03), new THREE.Euler(0, 0, -Math.PI * 0.6)]);
    parts.forEach(([g, m, at, rot, scale], i) => {
      const mesh = new THREE.Mesh(g, m);
      mesh.position.copy(at);
      mesh.rotation.copy(rot);
      if (scale) mesh.scale.copy(scale);
      mesh.renderOrder = 1000 + i;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    });
    this.group.position.copy(this.rest);
    this.group.rotation.set(0, -0.35, 0);
    this.group.scale.setScalar(0.8);
    this.group.visible = false;
  }

  /** `speed` m/s for the step bob, `sip` 0..1 lifts the mug toward your mouth, `visible` 0..1 slides it in. */
  update(dt: number, speed: number, sip: number, visible: number): void {
    this.group.visible = visible > 0.02;
    if (!this.group.visible) return;
    const moving = Math.min(1, speed / 2.2);
    this.phase += dt * (3 + speed * 2.2);
    this.bob += (moving - this.bob) * damp(6, dt);
    this.sip += (sip - this.sip) * damp(8, dt);
    const g = this.group;
    g.position.set(
      this.rest.x + Math.sin(this.phase) * 0.012 * this.bob - this.sip * 0.22,
      this.rest.y - Math.abs(Math.cos(this.phase)) * 0.016 * this.bob + this.sip * 0.17 - (1 - visible) * 0.35,
      this.rest.z + this.sip * 0.12,
    );
    g.rotation.set(this.sip * 0.9, -0.35 + this.sip * 0.3, Math.sin(this.phase) * 0.02 * this.bob + this.sip * 0.25);
  }
}
