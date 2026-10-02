// Monitor contents (SPEC §6.3), painted into a small canvas. Repaints only when the state
// changes or an animated state's frame is due (staggered per screen), and only while the
// screen is near the camera, in view and facing it.
import * as THREE from 'three';
import { PALETTE } from '../style/palette';
import type { ScreenState } from './types';
import { FONT_FAMILY, MONO_FAMILY, rng } from './kit';

/** Design space: every screen paints in 256 × 160 units, scaled to its canvas. */
const W = 256;
const H = 160;
const CODE_COLORS = ['#7FD8FF', '#FF9DCB', '#FFD166', '#8BE9A8', '#C3A6FF', '#FF9F7A', '#DDE6F3'];
/** Seconds between repaints per animated state. */
const FRAME: Record<ScreenState, number> = { off: Infinity, idle: 0.25, working: 0.22, alert: 0.12, sleeping: 0.3 };
/** Screens farther than this from the camera don't repaint. */
const PAINT_DISTANCE = 16;

/** Camera information for the per-frame visibility test (built once per frame by the world). */
export interface ScreenView {
  camera: THREE.Vector3;
  frustum: THREE.Frustum;
}

const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _toCam = new THREE.Vector3();
const _sphere = new THREE.Sphere();

/**
 * Whether a screen-like plane (geometry facing its local +Z, bounding sphere computed) is within
 * `maxDistance` of the camera, facing it and inside the view frustum.
 */
export function inView(mesh: THREE.Mesh, view: ScreenView, maxDistance = PAINT_DISTANCE): boolean {
  mesh.getWorldPosition(_p);
  if (_p.distanceToSquared(view.camera) > maxDistance * maxDistance) return false;
  _n.set(0, 0, 1).transformDirection(mesh.matrixWorld);
  if (_n.dot(_toCam.subVectors(view.camera, _p)) <= 0) return false;
  _sphere.copy(mesh.geometry.boundingSphere!).applyMatrix4(mesh.matrixWorld);
  return view.frustum.intersectsSphere(_sphere);
}

interface CodeLine {
  indent: number;
  tokens: { w: number; c: string }[];
}

export class Screen {
  readonly material: THREE.MeshBasicMaterial;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly tex: THREE.CanvasTexture;
  private readonly rand: () => number;
  private readonly phase: number;
  private state: ScreenState = 'off';
  private lines: string[] | undefined;
  private code: CodeLine[] = [];
  private typed = 0;
  private timer = 0;
  private dirty = true;
  private mesh: THREE.Mesh | null = null;
  /** Brightness multiplier: above 1 the screen glows into the bloom pass. */
  private readonly hdr: number;

  constructor(
    seed: number,
    private readonly accent: string,
    px: { w: number; h: number } = { w: W, h: H },
    hdr = 1.35,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = px.w;
    this.canvas.height = px.h;
    this.ctx = this.canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.hdr = hdr;
    this.material = new THREE.MeshBasicMaterial({ map: this.tex, color: new THREE.Color(hdr, hdr, hdr) });
    this.rand = rng(seed * 31 + 7);
    this.phase = this.rand() * 100;
    for (let i = 0; i < 9; i++) this.code.push(this.randomLine());
    this.paint(0);
  }

  /** The mesh showing this screen, for the visibility test. */
  attach(mesh: THREE.Mesh): void {
    this.mesh = mesh;
    mesh.geometry.computeBoundingSphere();
  }

  private seen(view: ScreenView): boolean {
    return !this.mesh || inView(this.mesh, view);
  }

  set(state: ScreenState, lines?: string[]): void {
    const next = lines && lines.length ? lines.slice(-14) : undefined;
    if (state === this.state && sameLines(next, this.lines)) return;
    this.state = state;
    this.lines = next;
    this.dirty = true;
  }

  update(dt: number, elapsed: number, view?: ScreenView): void {
    if (this.state === 'alert') {
      const p = this.hdr * (0.84 + 0.16 * Math.sin(elapsed * 7));
      this.material.color.setRGB(p, p, p);
    } else if (this.material.color.r !== this.hdr) {
      this.material.color.setRGB(this.hdr, this.hdr, this.hdr);
    }
    this.timer += dt;
    const frame = this.lines && this.state === 'working' ? 0.5 : FRAME[this.state];
    if ((this.dirty || this.timer >= frame) && (!view || this.seen(view))) {
      this.timer = this.dirty ? this.rand() * Math.min(frame, 0.3) : 0;
      this.dirty = false;
      this.paint(elapsed);
    }
  }

  private paint(t: number): void {
    const ctx = this.ctx;
    ctx.setTransform(this.canvas.width / W, 0, 0, this.canvas.height / H, 0, 0);
    ctx.save();
    switch (this.state) {
      case 'off':
        this.paintOff(ctx);
        break;
      case 'idle':
        this.paintIdle(ctx, t);
        break;
      case 'working':
        if (this.lines) this.paintLines(ctx, this.lines, t);
        else this.paintCode(ctx, t);
        break;
      case 'alert':
        this.paintAlert(ctx, t);
        break;
      case 'sleeping':
        this.paintSleeping(ctx, t);
        break;
    }
    ctx.restore();
    // Soft glass glare across every state.
    const g = ctx.createLinearGradient(0, 0, W * 0.8, H);
    g.addColorStop(0, 'rgba(255,255,255,0.10)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.02)');
    g.addColorStop(0.36, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    this.tex.needsUpdate = true;
  }

  private paintOff(ctx: CanvasRenderingContext2D): void {
    // Not a black hole: a soft slate gradient with a tiny standby light.
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#3A4660');
    g.addColorStop(1, PALETTE.screenOff);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(127, 216, 255, 0.55)';
    ctx.beginPath();
    ctx.arc(W - 14, H - 12, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  private paintIdle(ctx: CanvasRenderingContext2D, t: number): void {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#2B3D6B');
    g.addColorStop(1, mixHex('#2B3D6B', this.accent, 0.45));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // A few drifting bubbles.
    for (let i = 0; i < 6; i++) {
      const bx = ((i * 53 + t * (8 + i * 3) + this.phase * 10) % (W + 40)) - 20;
      const by = H * 0.2 + ((i * 37) % (H * 0.6)) + Math.sin(t * 0.8 + i) * 8;
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.beginPath();
      ctx.arc(bx, by, 4 + (i % 3) * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    const x = W / 2 + Math.sin(t * 0.55 + this.phase) * 70;
    const y = H / 2 + Math.sin(t * 0.83 + this.phase * 1.7) * 34;
    sparkle(ctx, x, y, 22, PALETTE.claude, t * 0.4);
  }

  private paintCode(ctx: CanvasRenderingContext2D, t: number): void {
    ctx.fillStyle = '#1E2433';
    ctx.fillRect(0, 0, W, H);
    chrome(ctx, this.accent);
    // Type a little more of the last line; when it is done, start a new one.
    const last = this.code[this.code.length - 1];
    this.typed += 1 + Math.floor(this.rand() * 2);
    if (this.typed > last.tokens.length) {
      this.code.push(this.randomLine());
      if (this.code.length > 9) this.code.shift();
      this.typed = 0;
    }
    const lh = 14;
    const top = 30;
    ctx.font = `600 9px ${MONO_FAMILY}`;
    this.code.forEach((line, i) => {
      const y = top + i * lh;
      ctx.fillStyle = 'rgba(221,230,243,0.28)';
      ctx.fillText(String(40 + i + Math.floor(t / 3) % 50), 6, y + 4);
      let x = 26 + line.indent * 14;
      const isLast = i === this.code.length - 1;
      const count = isLast ? Math.min(this.typed, line.tokens.length) : line.tokens.length;
      for (let k = 0; k < count; k++) {
        const tok = line.tokens[k];
        ctx.fillStyle = tok.c;
        ctx.beginPath();
        ctx.roundRect(x, y - 4, tok.w, 7, 3.5);
        ctx.fill();
        x += tok.w + 5;
      }
      if (isLast && Math.floor(t * 3) % 2 === 0) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(x, y - 5, 6, 10);
      }
    });
  }

  private paintLines(ctx: CanvasRenderingContext2D, lines: string[], t: number): void {
    ctx.fillStyle = '#1B2130';
    ctx.fillRect(0, 0, W, H);
    chrome(ctx, this.accent);
    const lh = 10.5;
    const shown = lines.slice(-12);
    ctx.font = `500 8.5px ${MONO_FAMILY}`;
    ctx.fillStyle = '#E6EDF7';
    shown.forEach((line, i) => {
      ctx.fillText(line.slice(0, 48), 6, 30 + i * lh);
    });
    if (Math.floor(t * 2) % 2 === 0) {
      const lastLine = shown[shown.length - 1] ?? '';
      const x = 6 + Math.min(48, lastLine.length) * ctx.measureText('M').width;
      ctx.fillStyle = PALETTE.stateWorking;
      ctx.fillRect(x + 1, 30 + (shown.length - 1) * lh - 8, 5, 9);
    }
  }

  private paintAlert(ctx: CanvasRenderingContext2D, t: number): void {
    ctx.fillStyle = PALETTE.stateNeedsYou;
    ctx.fillRect(0, 0, W, H);
    // Hazard-ish diagonal stripes, gently scrolling.
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    const off = (t * 30) % 40;
    for (let x = -H - 40 + off; x < W + 40; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, H);
      ctx.lineTo(x + 18, H);
      ctx.lineTo(x + 18 + H, 0);
      ctx.lineTo(x + H, 0);
      ctx.fill();
    }
    const bob = Math.sin(t * 6) * 5;
    ctx.fillStyle = '#FFFDF7';
    ctx.beginPath();
    ctx.arc(W / 2, H / 2 - 8 + bob, 44, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#E8890C';
    ctx.font = `700 64px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', W / 2, H / 2 - 4 + bob);
    ctx.fillStyle = '#5A3200';
    ctx.font = `700 15px ${FONT_FAMILY}`;
    ctx.fillText('NEEDS YOU', W / 2, H - 16);
  }

  private paintSleeping(ctx: CanvasRenderingContext2D, t: number): void {
    ctx.fillStyle = '#151B2B';
    ctx.fillRect(0, 0, W, H);
    // Crescent moon.
    ctx.fillStyle = '#FFE9A8';
    ctx.beginPath();
    ctx.arc(W - 40, 36, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#151B2B';
    ctx.beginPath();
    ctx.arc(W - 33, 31, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < 3; i++) {
      const p = (t * 0.35 + i / 3 + this.phase) % 1;
      const size = 16 + i * 8 + p * 10;
      ctx.globalAlpha = Math.sin(p * Math.PI);
      ctx.fillStyle = PALETTE.stateSleeping;
      ctx.font = `700 ${size.toFixed(0)}px ${FONT_FAMILY}`;
      ctx.fillText('z', W * 0.32 + p * 70 + i * 12, H * 0.78 - p * 90);
    }
    ctx.globalAlpha = 1;
  }

  private randomLine(): CodeLine {
    const r = this.rand;
    if (r() < 0.12) return { indent: 0, tokens: [] };
    const indent = Math.floor(r() * 4);
    const n = 1 + Math.floor(r() * 5);
    const tokens = [];
    for (let i = 0; i < n; i++) tokens.push({ w: 8 + Math.floor(r() * 34), c: CODE_COLORS[Math.floor(r() * CODE_COLORS.length)] });
    return { indent, tokens };
  }
}

function chrome(ctx: CanvasRenderingContext2D, accent: string): void {
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(0, 0, W, 16);
  ['#FF6B6B', '#FFD166', '#6EDC9A'].forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(10 + i * 11, 8, 3.4, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.roundRect(W - 46, 4, 38, 8, 4);
  ctx.fill();
}

/** The Claude-ish sparkle: a ring of rounded rays of two lengths. */
export function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, rot = 0): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = r * 0.2;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const len = i % 2 === 0 ? r : r * 0.7;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.18, Math.sin(a) * r * 0.18);
    ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
    ctx.stroke();
  }
  ctx.restore();
}

function sameLines(a: string[] | undefined, b: string[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function mixHex(a: string, b: string, t: number): string {
  return '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
}
