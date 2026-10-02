// The camera: third person (smooth follow, drag orbit, wheel zoom, never through walls or
// the ceiling) or first person (pointer-lock mouse look, V to toggle, wheel all the way in),
// plus eased "shots" (over the shoulder at a desk, debug close-ups) that override both.
import * as THREE from 'three';
import { clamp, damp, smoothstep } from './chars/spring';
import type { World } from './world/types';

const DEG = Math.PI / 180;
const VIEW_KEY = 'claude-office:view';
const EYE_HEIGHT = 1.2;

export type ViewMode = 'third' | 'first';

export interface CameraShot {
  position: THREE.Vector3;
  look: THREE.Vector3;
}

const _pos = new THREE.Vector3();
const _look = new THREE.Vector3();
const _pivot = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _fp = new THREE.Vector3();
const _fpLook = new THREE.Vector3();

export class CameraRig {
  /** Azimuth: the third-person camera sits at focus + (sin yaw, ·, cos yaw); you look along −(sin yaw, cos yaw). */
  yaw = 0;
  pitch = 45 * DEG;
  dist = 10;
  /** First-person look pitch (+ = down), ±80°. */
  fpPitch = 8 * DEG;
  minDist = 4;
  maxDist = 18;
  /** Ignore mouse orbit/zoom (e.g. while a panel is up). */
  locked = false;
  mode: ViewMode;
  /** Fired when the mode flips (UI shows/hides the crosshair). */
  onMode: ((mode: ViewMode) => void) | null = null;

  private sYaw = 0;
  private sPitch = 45 * DEG;
  private sDist = 10;
  /** Distance after collision (eases in fast, back out slowly). */
  private cDist = 10;
  /** Extra pitch when a wall crowds the camera: look over the manager's head instead. */
  private lift = 0;
  private fpBlend = 0;
  private focus = new THREE.Vector3();
  private focusReady = false;
  private shot: CameraShot | null = null;
  private lastShot: CameraShot | null = null;
  private blend = 0;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private ray = new THREE.Raycaster();

  constructor(
    private camera: THREE.PerspectiveCamera,
    private dom: HTMLElement,
    private world: World,
  ) {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(VIEW_KEY);
    } catch {
      // storage unavailable
    }
    this.mode = saved === 'first' ? 'first' : 'third';
    this.fpBlend = this.mode === 'first' ? 1 : 0;

    dom.addEventListener('pointerdown', (e) => {
      if (this.locked || (e.button !== 0 && e.button !== 2)) return;
      if (this.mode === 'first' && document.pointerLockElement !== dom) {
        // First person: a click grabs the mouse for looking around.
        dom.requestPointerLock?.();
        return;
      }
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointermove', (e) => {
      if (document.pointerLockElement === dom) {
        this.look(e.movementX, e.movementY, 0.0025);
        return;
      }
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.look(dx, dy, this.mode === 'first' ? 0.004 : 0.0065);
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
        if (this.mode === 'first') {
          if (e.deltaY > 0) this.setMode('third');
          return;
        }
        // Scrolling all the way in steps into first person.
        if (e.deltaY < 0 && this.dist <= this.minDist + 0.01) {
          this.setMode('first');
          return;
        }
        this.dist = clamp(this.dist * Math.exp(e.deltaY * 0.0012), this.minDist, this.maxDist);
      },
      { passive: false },
    );
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get isDragging(): boolean {
    return this.dragging;
  }

  /** 0 = third person, 1 = first person (mid-transition values in between). */
  get firstPerson(): number {
    return this.fpBlend;
  }

  /** Current third-person distance after collision (small = the manager fills the screen). */
  get distance(): number {
    return this.cDist;
  }

  setMode(mode: ViewMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === 'third') {
      this.dist = Math.max(this.dist, this.minDist + 0.5);
      if (document.pointerLockElement === this.dom) document.exitPointerLock();
    }
    try {
      localStorage.setItem(VIEW_KEY, mode);
    } catch {
      // ignore
    }
    this.onMode?.(mode);
  }

  toggleMode(): void {
    this.setMode(this.mode === 'first' ? 'third' : 'first');
  }

  /** Let go of the mouse (panels, the terminal). The next click on the canvas grabs it again. */
  releasePointer(): void {
    if (document.pointerLockElement === this.dom) document.exitPointerLock();
  }

  private look(dx: number, dy: number, k: number): void {
    this.yaw -= dx * k;
    if (this.mode === 'first') this.fpPitch = clamp(this.fpPitch + dy * k, -80 * DEG, 80 * DEG);
    else this.pitch = clamp(this.pitch + dy * k * 0.8, 20 * DEG, this.maxPitch());
  }

  /**
   * Under a ceiling the camera can't swing as high: the steepest pitch that still keeps the
   * whole zoom distance below the ceiling (so zooming out pulls back, not up into it).
   */
  private maxPitch(): number {
    const room = this.world.interior;
    if (!room || !this.world.isInside?.(this.focus)) return 70 * DEG;
    const headroom = room.ceilingY - 0.35 - this.focus.y;
    return clamp(Math.asin(clamp(headroom / Math.max(this.dist, 1), 0, 1)), 14 * DEG, 70 * DEG);
  }

  /** Indoors the default view is a lower, longer shot (the ceiling is only ~4 m up). */
  get indoorDefaults(): { pitch: number; dist: number } {
    return { pitch: 24 * DEG, dist: 7.5 };
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

  /** Where you're looking in first person (unit vector). */
  viewDir(out: THREE.Vector3): THREE.Vector3 {
    const cp = Math.cos(this.fpPitch);
    return out.set(-Math.sin(this.yaw) * cp, -Math.sin(this.fpPitch), -Math.cos(this.yaw) * cp);
  }

  /** `feet` = the manager's root (floor level); `hop` = how high they are off the floor. */
  update(dt: number, feet: THREE.Vector3, hop: number): void {
    _pivot.set(feet.x, feet.y + 1.0 + hop * 0.5, feet.z);
    if (!this.focusReady) {
      this.focus.copy(_pivot);
      this.sYaw = this.yaw;
      this.sPitch = this.pitch;
      this.sDist = this.cDist = this.dist;
      this.focusReady = true;
    }
    // Indoors, zooming in lets you look down more steeply; zooming out flattens the view.
    this.pitch = Math.min(this.pitch, this.maxPitch());
    this.focus.lerp(_pivot, damp(6.5, dt));
    this.sYaw += (this.yaw - this.sYaw) * damp(12, dt);
    this.sPitch += (this.pitch - this.sPitch) * damp(12, dt);
    this.sDist += (this.dist - this.sDist) * damp(9, dt);
    this.fpBlend = clamp(this.fpBlend + (this.mode === 'first' ? dt : -dt) / 0.25, 0, 1);

    // Third person: orbit the follow point, then pull in so walls and the ceiling never cut
    // in. If a wall would push the camera right up behind the manager, swing it up and look
    // over their head instead.
    let probe = this.collide(this.focus, this.orbitDir(this.sPitch), this.sDist);
    let bestLift = 0;
    const enough = Math.min(this.sDist, 2.0);
    if (probe < enough) {
      // The smallest swing up that gets back to a comfortable distance: up to 50° normally;
      // backed right up against a wall, keep going to a straight-down shot from under the
      // ceiling (88°: exactly 90° would leave lookAt without a sense of up).
      const steps: number[] = [];
      for (let p = this.sPitch + 8 * DEG; p <= 82 * DEG + 1e-6; p += 8 * DEG) steps.push(p);
      steps.push(88 * DEG);
      // "Cornered" is decided once, from the best we managed within 50°.
      let cornered: boolean | null = null;
      for (const p of steps) {
        if (p > 50 * DEG + 1e-6) {
          cornered ??= probe < 0.6;
          if (!cornered) break;
        }
        const d = this.collide(this.focus, this.orbitDir(p), this.sDist);
        if (d > probe + 0.3) {
          probe = d;
          bestLift = p - this.sPitch;
        }
        if (probe >= enough) break;
      }
    }
    this.lift += (bestLift - this.lift) * damp(this.lift < bestLift ? 8 : 4, dt);
    // Measure along the exact ray the camera sits on this frame (the lift eases), then pull
    // in at once (never a frame through a wall or out the door) and ease back out gently.
    const want = this.collide(this.focus, this.orbitDir(this.sPitch + this.lift), this.sDist);
    this.cDist = want < this.cDist ? want : Math.min(want, this.cDist + (want - this.cDist) * damp(2.5, dt));
    _pos.copy(_dir).multiplyScalar(this.cDist).add(this.focus);
    _look.copy(this.focus);

    // First person: eyes at 1.2 m, looking where the mouse says.
    if (this.fpBlend > 0) {
      _fp.set(feet.x, feet.y + EYE_HEIGHT + hop, feet.z);
      this.viewDir(_fpLook).add(_fp);
      const b = smoothstep(this.fpBlend);
      _pos.lerp(_fp, b);
      _look.lerp(_fpLook, b);
    }

    this.blend = clamp(this.blend + (this.shot ? dt : -dt) / 0.9, 0, 1);
    const sb = smoothstep(this.blend);
    const s = this.shot ?? this.lastShot;
    if (s && sb > 0) {
      _pos.lerp(s.position, sb);
      _look.lerp(s.look, sb);
    }
    this.camera.position.copy(_pos);
    this.camera.lookAt(_look);
  }

  /** Unit direction from the follow point to the third-person camera, into `_dir`. */
  private orbitDir(pitch: number): THREE.Vector3 {
    const cp = Math.cos(pitch);
    return _dir.set(Math.sin(this.sYaw) * cp, Math.sin(pitch), Math.cos(this.sYaw) * cp);
  }

  /**
   * How far the camera can sit from `from` along `dir` before something blocks it: a fat
   * ray (centre + 4 offsets) against the walls/ceiling, kept under the ceiling and on the
   * manager's side of the walls.
   */
  private collide(from: THREE.Vector3, dir: THREE.Vector3, dist: number): number {
    const blockers = this.world.cameraBlockers ?? [];
    let best = dist;
    if (blockers.length) {
      // Offsets stay inside the manager's 0.3 m collision circle (sideways) and go straight
      // up/down in world space, so no ray starts inside a wall even when looking overhead.
      _right.set(dir.z, 0, -dir.x);
      if (_right.lengthSq() < 1e-8) _right.set(1, 0, 0);
      _right.normalize();
      _up.set(0, 1, 0);
      const offsets: [number, number][] = [
        [0, 0],
        [0.18, 0],
        [-0.18, 0],
        [0, 0.15],
        [0, -0.15],
      ];
      this.ray.far = dist + 0.3;
      for (const [rx, uy] of offsets) {
        _origin.copy(from).addScaledVector(_right, rx).addScaledVector(_up, uy);
        this.ray.set(_origin, dir);
        const hit = this.ray.intersectObjects(blockers, true)[0];
        if (hit) best = Math.min(best, hit.distance - 0.25);
      }
    }
    const inside = this.world.isInside?.(from) ?? false;
    const room = this.world.interior;
    if (inside && room && dir.y > 1e-3) {
      // Stay a little under the ceiling.
      best = Math.min(best, (room.ceilingY - 0.3 - from.y) / dir.y);
    }
    // Right up against a wall the camera may come very close (the manager fades).
    best = Math.max(0.15, best);
    // Never end up on the other side of a wall from the manager (the doorway gap has no
    // blocker to stop the rays): bisect for the farthest point still on their side.
    if (this.world.isInside) {
      const sameSide = (d: number) => this.world.isInside(_origin.copy(dir).multiplyScalar(d).add(from)) === inside;
      if (!sameSide(best)) {
        let lo = 0.15;
        let hi = best;
        for (let i = 0; i < 12; i++) {
          const mid = (lo + hi) / 2;
          if (sameSide(mid)) lo = mid;
          else hi = mid;
        }
        best = lo;
      }
    }
    return best;
  }
}
