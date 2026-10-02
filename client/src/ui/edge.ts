// Off-screen faces (UX.md §2.1): people who need you but are outside the safe part of the screen
// (or behind the camera) get their portrait pinned to the screen edge, with an amber ring, a "!"
// and a notch pointing at them. Click = go to them. Markers within 60 px merge into one with a
// count; positions glide (damped) so they never jitter.
import * as THREE from 'three';
import { el, markup, type Markup } from './el';
import './theme.css';

export interface EdgeTarget {
  id: string;
  /** World-space point to aim at (their head). */
  position: THREE.Vector3;
  /** Portrait markup (faces.ts). */
  faceSvg: Markup;
  /** Needs-you: amber ring + "!". Otherwise a paper ring (e.g. whoever you're walking to). */
  urgent: boolean;
  name?: string;
  /** Hover text and accessible name. Default "Go to <name>". */
  tooltip?: string;
  /** Epoch ms they started waiting; after 3 min the disc wiggles every 10 s. */
  since?: number;
}

export interface EdgeViewport {
  width: number;
  height: number;
  /** Safe-rect insets. Defaults: left/right 24, top 184 (under the HUD counts), bottom 120 (over the prompt). Add an open panel's width to `right`. */
  inset?: Partial<{ top: number; right: number; bottom: number; left: number }>;
}

export interface EdgePlacement {
  x: number;
  y: number;
  /** Radians, screen space (0 = pointing right, y down). */
  angle: number;
}

const LATE_MS = 3 * 60_000;
const MERGE_PX = 60;
/** How far a marker reaches from its centre (theme.css .co-edge): 28 disc + 6 ring + notch, the badge, the name label. */
const MARK = { side: 44, top: 42, bottom: 92 };
const _cam = new THREE.Vector3();
const _ndc = new THREE.Vector3();

/**
 * Where an off-screen target's marker goes, or null while it's comfortably on screen.
 * Pure (no DOM); the camera's world matrices must be current.
 */
export function placeEdge(camera: THREE.Camera, viewport: EdgeViewport, position: THREE.Vector3): EdgePlacement | null {
  const ins = { top: 184, right: 24, bottom: 120, left: 24, ...viewport.inset };
  let left = ins.left;
  let top = ins.top;
  let right = viewport.width - ins.right;
  let bottom = viewport.height - ins.bottom;
  if (right - left < 80 || bottom - top < 80) {
    // The HUD insets leave no room (tiny window or a very wide panel): use 24 px margins all round.
    left = top = 24;
    right = viewport.width - 24;
    bottom = viewport.height - 24;
  }
  _cam.copy(position).applyMatrix4(camera.matrixWorldInverse);
  const behind = _cam.z > 0;
  _ndc.copy(position).project(camera);
  const sx = (_ndc.x * 0.5 + 0.5) * viewport.width;
  const sy = (-_ndc.y * 0.5 + 0.5) * viewport.height;
  const finite = Number.isFinite(sx) && Number.isFinite(sy);
  if (finite && !behind && sx >= left && sx <= right && sy >= top && sy <= bottom) return null;
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  // Direction from the screen centre (UX.md §2.1). Behind the camera the projection mirrors
  // through the screen centre, so flip it back; on the camera plane use camera space instead.
  let dx: number;
  let dy: number;
  if (!finite) {
    dx = _cam.x;
    dy = -_cam.y;
  } else {
    dx = sx - viewport.width / 2;
    dy = sy - viewport.height / 2;
    if (behind) {
      dx = -dx;
      dy = -dy;
    }
  }
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3)) {
    dx = 0;
    dy = 1;
  }
  // The marker's centre stays far enough inside the safe rect that the whole marker shows:
  // disc + ring + notch sideways, the badge above, the name label below.
  const pl = Math.min(left + MARK.side, cx);
  const pr = Math.max(right - MARK.side, cx);
  const pt = Math.min(top + MARK.top, cy);
  const pb = Math.max(bottom - MARK.bottom, cy);
  const tx = dx > 0 ? (pr - cx) / dx : dx < 0 ? (pl - cx) / dx : Infinity;
  const ty = dy > 0 ? (pb - cy) / dy : dy < 0 ? (pt - cy) / dy : Infinity;
  const t = Math.min(tx, ty);
  return { x: cx + dx * t, y: cy + dy * t, angle: Math.atan2(dy, dx) };
}

interface Marker {
  btn: HTMLButtonElement;
  aim: HTMLElement;
  disc: HTMLElement;
  badge: HTMLElement;
  name: HTMLElement;
  x: number;
  y: number;
  face: Markup | '';
  urgent: boolean | null;
  leadId: string;
}

const notch = (urgent: boolean) =>
  markup(
    `<svg viewBox="0 0 18 22" aria-hidden="true"><path d="M2.5 2.5 16 11 2.5 19.5z" fill="${urgent ? '#FFB020' : '#FFFDF7'}" stroke="#2B2D42" stroke-width="2" stroke-linejoin="round"/></svg>`,
  );

export class EdgeIndicators {
  readonly root: HTMLElement;
  private markers = new Map<string, Marker>();
  private lastT = 0;

  constructor(
    container: HTMLElement,
    private onGo: (id: string) => void,
  ) {
    this.root = el('div', { class: 'co-edges', attrs: { role: 'group', 'aria-label': 'People who need you, off screen' } });
    container.append(this.root);
  }

  /** Call every frame (or whenever the camera or targets move). Targets are ordered by priority: the first wins a merge. */
  update(camera: THREE.Camera, viewport: EdgeViewport, targets: readonly EdgeTarget[], now = performance.now()): void {
    const dt = this.lastT ? Math.min(0.1, (now - this.lastT) / 1000) : 0;
    this.lastT = now;
    const ease = dt > 0 ? 1 - Math.exp(-12 * dt) : 1;

    // Place, then merge greedily in priority order.
    const clusters: { lead: EdgeTarget; at: EdgePlacement; count: number }[] = [];
    for (const t of targets) {
      const at = placeEdge(camera, viewport, t.position);
      if (!at) continue;
      const near = clusters.find((c) => Math.hypot(c.at.x - at.x, c.at.y - at.y) < MERGE_PX);
      if (near) near.count++;
      else clusters.push({ lead: t, at, count: 1 });
    }

    const keep = new Set<string>();
    const wallNow = Date.now();
    for (const c of clusters) {
      const id = c.lead.id;
      keep.add(id);
      let m = this.markers.get(id);
      if (!m) {
        m = this.create(c.lead, c.at);
        this.markers.set(id, m);
      } else {
        m.x += (c.at.x - m.x) * ease;
        m.y += (c.at.y - m.y) * ease;
      }
      this.paint(m, c.lead, c.at, c.count, wallNow);
    }
    for (const [id, m] of this.markers) {
      if (keep.has(id)) continue;
      const hadFocus = m.btn === document.activeElement;
      m.btn.remove();
      this.markers.delete(id);
      // Don't drop keyboard focus on the floor: move it to another marker if there is one.
      if (hadFocus) this.markers.values().next().value?.btn.focus({ preventScroll: true });
    }
  }

  dispose(): void {
    this.root.remove();
    this.markers.clear();
  }

  private create(t: EdgeTarget, at: EdgePlacement): Marker {
    const aim = el('span', { class: 'co-edge__aim' });
    const disc = el('span', { class: 'co-edge__disc' });
    const badge = el('span', { class: 'co-edge__badge', attrs: { 'aria-hidden': 'true' } });
    const name = el('span', { class: 'co-edge__name', attrs: { 'aria-hidden': 'true' } });
    const btn = el(
      'button',
      { class: 'co-edge', attrs: { type: 'button' } },
      el('span', { class: 'co-edge__bob' }, el('span', { class: 'co-edge__float' }, aim, disc, badge)),
      name,
    );
    const m: Marker = { btn, aim, disc, badge, name, x: at.x, y: at.y, face: '', urgent: null, leadId: t.id };
    btn.addEventListener('click', () => this.onGo(m.leadId));
    this.root.append(btn);
    return m;
  }

  private paint(m: Marker, t: EdgeTarget, at: EdgePlacement, count: number, wallNow: number): void {
    m.leadId = t.id;
    m.btn.style.transform = `translate(${m.x.toFixed(1)}px, ${m.y.toFixed(1)}px)`;
    m.aim.style.setProperty('--a', `${((at.angle * 180) / Math.PI).toFixed(1)}deg`);
    if (m.face !== t.faceSvg) {
      m.face = t.faceSvg;
      m.disc.innerHTML = t.faceSvg;
    }
    if (m.urgent !== t.urgent) {
      m.urgent = t.urgent;
      m.aim.innerHTML = notch(t.urgent);
    }
    m.btn.classList.toggle('co-edge--calm', !t.urgent);
    m.btn.classList.toggle('is-late', t.urgent && t.since !== undefined && wallNow - t.since > LATE_MS);
    const label = (t.tooltip ?? `Go to ${t.name ?? 'them'}`) + (count > 1 ? ` (and ${count - 1} more waiting)` : '');
    if (m.btn.getAttribute('aria-label') !== label) {
      m.btn.setAttribute('aria-label', label);
      m.btn.title = label;
    }
    const badgeText = count > 1 ? String(count) : t.urgent ? '!' : '';
    if (m.badge.textContent !== badgeText) m.badge.textContent = badgeText;
    m.badge.hidden = !badgeText;
    m.badge.classList.toggle('co-edge__badge--count', count > 1);
    const nameText = t.name ?? '';
    if (m.name.textContent !== nameText) m.name.textContent = nameText;
    m.name.hidden = !nameText;
  }
}

/**
 * The shape the gameplay layer asked for: create once, then call `updateEdgeIndicators` every
 * frame with the camera, the viewport (and safe insets) and the people to point at.
 */
export function createEdgeIndicators(container: HTMLElement, onGo: (id: string) => void) {
  const ind = new EdgeIndicators(container, onGo);
  return {
    root: ind.root,
    updateEdgeIndicators: (camera: THREE.Camera, viewport: EdgeViewport, targets: readonly EdgeTarget[]) =>
      ind.update(camera, viewport, targets),
    dispose: () => ind.dispose(),
  };
}
