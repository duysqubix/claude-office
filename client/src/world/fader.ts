// Fades tall props (plants, shelves, lamps, partitions, trees) that stand between the camera
// and the manager, so you can always see yourself. The camera never leaves the manager's side
// of a wall, so walls don't fade. Only the visible material fades: the object keeps casting
// its shadow, which stops shadows popping in and out as the camera swings around.
import * as THREE from 'three';

interface FadeMat {
  mat: THREE.Material;
  baseOpacity: number;
  baseTransparent: boolean;
  baseDepthWrite: boolean;
}

export interface FadeItem {
  name: string;
  box: THREE.Box3;
  mats: FadeMat[];
  opacity: number;
  goal: number;
}

const FADED = 0.15;
const RATE = 9;
/** Heights above the target's feet that must stay visible: feet, chest, top of the head. */
const PROBE_HEIGHTS = [0.25, 0.9, 1.5];

export class Fader {
  readonly items: FadeItem[] = [];
  private last = -1;
  private readonly ray = new THREE.Ray();
  private readonly hit = new THREE.Vector3();
  private readonly cam = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly probe = new THREE.Vector3();

  /** Register objects that fade together. Their materials are cloned so they fade independently. */
  add(name: string, objects: THREE.Object3D[], pad = 0.15): FadeItem {
    const item: FadeItem = { name, box: new THREE.Box3(), mats: [], opacity: 1, goal: 1 };
    this.attach(item, objects);
    item.box.expandByScalar(pad);
    this.items.push(item);
    return item;
  }

  /** Stop fading an item (e.g. its procedural objects were replaced by a model) and free its material clones. */
  remove(item: FadeItem): void {
    const i = this.items.indexOf(item);
    if (i >= 0) this.items.splice(i, 1);
    // A kept mesh is re-cloned from its current material by add(): hand it back un-faded.
    for (const f of item.mats) {
      f.mat.opacity = f.baseOpacity;
      f.mat.transparent = f.baseTransparent;
      f.mat.depthWrite = f.baseDepthWrite;
      f.mat.dispose();
    }
    item.mats.length = 0;
  }

  /** Add more objects to an existing fade item (their materials are cloned too). */
  attach(item: FadeItem, objects: THREE.Object3D[]): void {
    for (const obj of objects) {
      obj.updateWorldMatrix(true, true);
      item.box.expandByObject(obj);
      obj.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const own = (m: THREE.Material) => {
          const c = m.clone();
          item.mats.push({ mat: c, baseOpacity: m.opacity, baseTransparent: m.transparent, baseDepthWrite: m.depthWrite });
          return c;
        };
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material);
      });
    }
  }

  update(camera: THREE.Camera, target: THREE.Vector3): void {
    const now = performance.now();
    const dt = this.last < 0 ? 1 / 60 : Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    camera.getWorldPosition(this.cam);
    this.target.copy(target);
    const k = 1 - Math.exp(-RATE * dt);
    for (const item of this.items) {
      item.goal = this.blocks(item.box) ? FADED : 1;
      if (item.opacity === item.goal) continue;
      item.opacity += (item.goal - item.opacity) * k;
      if (Math.abs(item.opacity - item.goal) < 0.01) item.opacity = item.goal;
      apply(item);
    }
  }

  private blocks(box: THREE.Box3): boolean {
    if (box.containsPoint(this.cam)) return true;
    for (const dy of PROBE_HEIGHTS) {
      this.probe.set(this.target.x, this.target.y + dy, this.target.z);
      const len = this.probe.distanceTo(this.cam);
      if (len < 1e-3) continue;
      this.ray.origin.copy(this.cam);
      this.ray.direction.subVectors(this.probe, this.cam).divideScalar(len);
      if (this.ray.intersectBox(box, this.hit) && this.hit.distanceTo(this.cam) < len - 0.35) return true;
    }
    return false;
  }
}

function apply(item: FadeItem): void {
  const fading = item.opacity < 0.999;
  for (const f of item.mats) {
    const m = f.mat;
    const wantTransparent = fading || f.baseTransparent;
    if (m.transparent !== wantTransparent) {
      m.transparent = wantTransparent;
      m.needsUpdate = true;
    }
    m.depthWrite = fading ? false : f.baseDepthWrite;
    m.opacity = f.baseOpacity * item.opacity;
  }
}
