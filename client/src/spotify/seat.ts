// Sitting down at your laptop (#28), the camera's half: the over-the-shoulder shot of its screen
// (as at anyone's computer, UX.md §3.3), and where that screen is on the page, for the laptop app
// to spring out of.
import * as THREE from 'three';
import type { CameraShot } from '../camera';
import type { Laptop } from '../world/types';

/** Over your right shoulder from just behind your head, looking down at the laptop's screen. */
export function laptopShot(head: THREE.Vector3, laptop: Laptop): CameraShot {
  const fwd = new THREE.Vector3(Math.sin(laptop.yaw), 0, Math.cos(laptop.yaw));
  const right = new THREE.Vector3(-Math.cos(laptop.yaw), 0, Math.sin(laptop.yaw));
  return {
    position: head.clone().addScaledVector(fwd, -0.45).addScaledVector(right, 0.3).add(new THREE.Vector3(0, 0.3, 0)),
    look: laptop.screen.getWorldPosition(new THREE.Vector3()),
  };
}

/** The laptop screen's rectangle on the page (undefined when it's off screen). */
export function screenRect(screen: THREE.Object3D, camera: THREE.Camera, canvas: HTMLCanvasElement): DOMRect | undefined {
  const box = new THREE.Box3().setFromObject(screen);
  if (box.isEmpty()) return undefined;
  const r = canvas.getBoundingClientRect();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < 8; i++) {
    const p = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(camera);
    const x = r.left + ((p.x + 1) / 2) * r.width;
    const y = r.top + ((1 - p.y) / 2) * r.height;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return new DOMRect(minX, minY, maxX - minX, maxY - minY);
}
