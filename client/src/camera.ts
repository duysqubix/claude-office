// Third-person follow camera: smooth follow, mouse-drag orbit, wheel zoom, and eased
// "shots" (over-the-shoulder at a desk, debug close-ups).
import * as THREE from 'three';
import { clamp, damp, smoothstep } from './chars/spring';

const DEG = Math.PI / 180;

export interface CameraShot {
  position: THREE.Vector3;
  look: THREE.Vector3;
}

const _pos = new THREE.Vector3();
const _look = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _ray = new THREE.Raycaster();
/** How far the camera stays off a wall it was pulled in front of, and under the ceiling. */
const WALL_GAP = 0.3;
const CEILING_GAP = 0.25;

export class CameraRig {
  /** Azimuth: the camera sits at focus + (sin yaw, ·, cos yaw). 0 = south of the target. */
  yaw = 0;
  pitch = 45 * DEG;
  dist = 10;
  minPitch = 20 * DEG;
  maxPitch = 70 * DEG;
  minDist = 4;
  maxDist = 18;
  /** Ignore mouse orbit/zoom (e.g. while a modal is up). */
  locked = false;
  /** Walls, ceiling and roof the camera never passes through: it pulls in in front of them. */
  blockers: THREE.Object3D[] = [];
  /** Highest the camera may go when following from `focus` (the ceiling indoors), or null outdoors. */
  ceiling: ((focus: THREE.Vector3) => number | null) | null = null;

  private sYaw = 0;
  private sPitch = 45 * DEG;
  private sDist = 10;
  /** Smoothed fraction of the follow distance left after pulling in for walls: snaps in, eases out. */
  private sReach = 1;
  private focus = new THREE.Vector3();
  private focusReady = false;
  private shot: CameraShot | null = null;
  private lastShot: CameraShot | null = null;
  private blend = 0;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;

  constructor(
    private camera: THREE.PerspectiveCamera,
    dom: HTMLElement,
  ) {
    dom.addEventListener('pointerdown', (e) => {
      if (this.locked || (e.button !== 0 && e.button !== 2)) return;
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.yaw -= dx * 0.0065;
      this.pitch = clamp(this.pitch + dy * 0.005, this.minPitch, this.maxPitch);
    });
    const end = (e: PointerEvent) => {
      this.dragging = false;
      if (dom.hasPointerCapture(e.pointerId)) dom.releasePointerCapture(e.pointerId);
    };
    dom.addEventListener('pointerup', end);
    dom.addEventListener('pointercancel', end);
    dom.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (this.locked) return;
        this.dist = clamp(this.dist * Math.exp(e.deltaY * 0.0012), this.minDist, this.maxDist);
      },
      { passive: false },
    );
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get isDragging(): boolean {
    return this.dragging;
  }

  /** Ease to a fixed shot, or back to following with null. */
  setShot(shot: CameraShot | null): void {
    if (shot) this.lastShot = shot;
    this.shot = shot;
  }

  /** Jump straight to a shot (debug close-ups, screenshots). */
  snapShot(shot: CameraShot): void {
    this.shot = this.lastShot = shot;
    this.blend = 1;
  }

  /** 1 once the camera has fully arrived at the current shot. */
  get shotBlend(): number {
    return this.shot ? this.blend : 0;
  }

  update(dt: number, follow: THREE.Vector3): void {
    if (!this.focusReady) {
      this.focus.copy(follow);
      this.sYaw = this.yaw;
      this.sPitch = this.pitch;
      this.sDist = this.dist;
      this.focusReady = true;
    }
    this.focus.lerp(follow, damp(6.5, dt));
    this.sYaw += (this.yaw - this.sYaw) * damp(12, dt);
    this.sPitch += (this.pitch - this.sPitch) * damp(12, dt);
    this.sDist += (this.dist - this.sDist) * damp(9, dt);

    const cp = Math.cos(this.sPitch);
    _pos.set(Math.sin(this.sYaw) * cp, Math.sin(this.sPitch), Math.cos(this.sYaw) * cp).multiplyScalar(this.sDist).add(this.focus);
    this.keepClear(dt);
    _look.copy(this.focus);

    this.blend = clamp(this.blend + (this.shot ? dt : -dt) / 0.9, 0, 1);
    const b = smoothstep(this.blend);
    const s = this.shot ?? this.lastShot;
    if (s && b > 0) {
      _pos.lerp(s.position, b);
      _look.lerp(s.look, b);
    }
    this.camera.position.copy(_pos);
    this.camera.lookAt(_look);
  }

  /** Keep the follow position (`_pos`) under the ceiling indoors and on the focus's side of every blocker. */
  private keepClear(dt: number): void {
    const top = this.ceiling?.(this.focus);
    if (top != null) _pos.y = Math.min(_pos.y, top - CEILING_GAP);

    _dir.subVectors(_pos, this.focus);
    const len = _dir.length();
    if (len < 1e-3) return;
    _dir.divideScalar(len);
    let reach = 1;
    if (this.blockers.length) {
      _ray.set(this.focus, _dir);
      _ray.far = len;
      const hit = _ray.intersectObjects(this.blockers, false)[0];
      if (hit) reach = clamp((hit.distance - WALL_GAP) / len, 0, 1);
    }
    this.sReach = reach < this.sReach ? reach : this.sReach + (reach - this.sReach) * damp(6, dt);
    _pos.copy(this.focus).addScaledVector(_dir, len * this.sReach);
  }
}
