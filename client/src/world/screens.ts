// Monitor contents (SPEC §6.3), painted into a small canvas. Repaints only when the state
// changes or an animated state's frame is due (staggered per screen), and only while the
// screen is near the camera, in view and facing it.
import * as THREE from 'three';
import { PALETTE } from '../style/palette';
import type { OfficeApp, ScreenState } from './types';
import { FONT_FAMILY, MONO_FAMILY, rng } from './kit';

/** Design space: every screen paints in 256 × 160 units, scaled to its canvas. */
const W = 256;
const H = 160;
const CODE_COLORS = ['#7FD8FF', '#FF9DCB', '#FFD166', '#8BE9A8', '#C3A6FF', '#FF9F7A', '#DDE6F3'];
/** Seconds between repaints per animated state. */
const FRAME: Record<ScreenState, number> = { off: Infinity, idle: 0.25, working: 0.22, alert: 0.12, sleeping: 0.3 };
/** Screens farther than this from the camera don't repaint. */
const PAINT_DISTANCE = 16;
/** Seconds between repaints of a regular's office app (a cell hop, a new mail, a slide change). */
const OFFICE_FRAME = 0.35;

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
  /** A regular's office app (painted instead of code or terminal lines while 'working'). */
  private app: OfficeApp | undefined;
  private code: CodeLine[] = [];
  private typed = 0;
  private timer = 0;
  private dirty = true;
  private mesh: THREE.Mesh | null = null;
  /** Brightness multiplier: a little over 1 reads as a lit screen; kept under the bloom threshold so text stays crisp. */
  private readonly hdr: number;

  constructor(
    seed: number,
    private readonly accent: string,
    px: { w: number; h: number } = { w: W, h: H },
    hdr = 1.1,
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

  set(state: ScreenState, lines?: string[], app?: OfficeApp): void {
    const next = lines && lines.length ? lines.slice(-14) : undefined;
    if (state === this.state && sameLines(next, this.lines) && app === this.app) return;
    this.state = state;
    this.lines = next;
    this.app = app;
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
    const frame = this.app && this.state === 'working' ? OFFICE_FRAME : this.lines && this.state === 'working' ? 0.5 : FRAME[this.state];
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
        if (this.app) paintOffice(ctx, this.app, this.lines, t, this.phase);
        else if (this.lines) this.paintLines(ctx, this.lines, t);
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

// ---------------------------------------------------------------------------------------------
// Office apps: what a regular (an NPC coworker, chars/regulars.ts) has on screen. Ordinary office
// work, never a terminal: light, friendly and gently alive (a cell cursor hops, new mail slides
// in, slides advance, a doc types itself, a chart draws, the calendar's now-line creeps down).
// Surfaces stay below white, so even at the screen brightness nothing blooms into glare.

const OFFICE: Record<OfficeApp, { color: string; title: string }> = {
  sheet: { color: '#2FA36B', title: 'Budget.xlsx' },
  mail: { color: '#3D7CFF', title: 'Inbox' },
  slides: { color: '#F07A45', title: 'Review.pptx' },
  doc: { color: '#5B6CF0', title: 'Plan.docx' },
  chart: { color: '#9B5DE5', title: 'Dashboard' },
  calendar: { color: '#14A89A', title: 'Calendar' },
};
const O_BACK = '#D3DCE8';
const O_PANEL = '#C3CEDD';
const O_CARD = '#E6ECF3';
const O_INK = '#4A5468';
const O_TEXT = '#6B768A';
const O_SOFT = '#A3AFC2';
const O_LINE = '#C2CCDA';
const O_CHIPS = ['#FF7A6B', '#FFC94A', '#5CC8FF', '#6EDC9A', '#B48CFF', '#FF9DCB'];

/** `lines[0]` is the document's name; for mail, the rest are subjects. */
function paintOffice(ctx: CanvasRenderingContext2D, app: OfficeApp, lines: string[] | undefined, t: number, phase: number): void {
  const { color, title } = OFFICE[app];
  const seed = Math.floor(phase * 1000);
  ctx.fillStyle = O_BACK;
  ctx.fillRect(0, 0, W, H);
  // Title bar in the app's colour, with the document's name.
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, 18);
  for (let i = 0; i < 3; i++) fillDot(ctx, 9 + i * 9, 9, 2.8, 'rgba(240,244,248,0.7)');
  ctx.fillStyle = '#EEF2F6';
  ctx.font = `700 9px ${FONT_FAMILY}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText((lines?.[0] || title).slice(0, 34), 40, 9.5);
  switch (app) {
    case 'sheet':
      paintSheet(ctx, t, seed, color);
      break;
    case 'mail':
      paintMail(ctx, t, seed, color, lines?.slice(1).filter((l) => l.trim()) ?? []);
      break;
    case 'slides':
      paintSlides(ctx, t, color);
      break;
    case 'doc':
      paintDoc(ctx, t, seed, color);
      break;
    case 'chart':
      paintChart(ctx, t, seed, color);
      break;
    case 'calendar':
      paintCalendar(ctx, t, seed);
      break;
  }
}

/** A spreadsheet: header row, label and number cells, a total row, the selected cell hopping about. */
function paintSheet(ctx: CanvasRenderingContext2D, t: number, seed: number, color: string): void {
  const r = rng(seed);
  const hop = Math.floor(t / 1.3);
  fillPill(ctx, 4, 21, W - 8, 10, 3, O_CARD);
  ctx.fillStyle = O_SOFT;
  ctx.font = `700 7px ${FONT_FAMILY}`;
  ctx.fillText('fx', 8, 26.5);
  fillPill(ctx, 20, 24.5, 34 + (hop % 4) * 9, 3, 1.5, O_SOFT);
  const cols = 5;
  const rows = 9;
  const x0 = 4;
  const y0 = 34;
  const cw = (W - 8) / cols;
  const rh = (H - y0 - 3) / rows;
  ctx.fillStyle = O_CARD;
  ctx.fillRect(x0, y0, W - 8, rh * rows);
  ctx.fillStyle = O_PANEL;
  ctx.fillRect(x0, y0, W - 8, rh);
  ctx.fillStyle = mixHex(O_CARD, color, 0.22);
  ctx.fillRect(x0, y0 + rh * (rows - 1), W - 8, rh);
  ctx.strokeStyle = O_LINE;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (let c = 1; c < cols; c++) {
    ctx.moveTo(x0 + c * cw, y0);
    ctx.lineTo(x0 + c * cw, y0 + rh * rows);
  }
  for (let row = 1; row < rows; row++) {
    ctx.moveTo(x0, y0 + row * rh);
    ctx.lineTo(x0 + W - 8, y0 + row * rh);
  }
  ctx.stroke();
  ctx.fillStyle = O_TEXT;
  ctx.font = `700 7px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  for (let c = 0; c < cols; c++) ctx.fillText('ABCDE'[c], x0 + (c + 0.5) * cw, y0 + rh / 2 + 0.5);
  ctx.textAlign = 'left';
  for (let row = 1; row < rows; row++) {
    const total = row === rows - 1;
    for (let c = 0; c < cols; c++) {
      const y = y0 + row * rh + rh / 2 - 1.5;
      const w = c === 0 ? 14 + r() * 22 : 10 + r() * 22;
      const x = c === 0 ? x0 + 3 : x0 + (c + 1) * cw - 3 - w;
      fillPill(ctx, x, y, w, 3, 1.5, total ? O_INK : c === 0 ? O_TEXT : O_SOFT);
    }
  }
  const hr = rng(seed + hop * 7 + 1);
  const sc = 1 + Math.floor(hr() * (cols - 1));
  const sr = 1 + Math.floor(hr() * (rows - 2));
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.strokeRect(x0 + sc * cw + 0.8, y0 + sr * rh + 0.8, cw - 1.6, rh - 1.6);
  ctx.fillStyle = color;
  ctx.fillRect(x0 + (sc + 1) * cw - 3, y0 + (sr + 1) * rh - 3, 3.5, 3.5);
}

/** An inbox: folders on the left, and every few seconds a new message slides in on top. */
function paintMail(ctx: CanvasRenderingContext2D, t: number, seed: number, color: string, subjects: string[]): void {
  ctx.fillStyle = O_PANEL;
  ctx.fillRect(0, 18, 52, H - 18);
  for (let i = 0; i < 5; i++) {
    const y = 27 + i * 13;
    if (i === 0) fillPill(ctx, 3, y - 5, 46, 10, 5, O_CARD);
    fillDot(ctx, 9, y, 2.5, i === 0 ? color : O_CHIPS[i]);
    fillPill(ctx, 15, y - 1.5, [22, 18, 26, 14, 20][i], 3, 1.5, i === 0 ? O_INK : O_TEXT);
  }
  const period = 4.5;
  const n = Math.floor(t / period);
  const k = smooth01((t - n * period) / 0.5);
  const rowH = 21;
  ctx.save();
  ctx.beginPath();
  ctx.rect(54, 20, W - 56, H - 20);
  ctx.clip();
  ctx.font = `600 7px ${FONT_FAMILY}`;
  for (let i = 0; i < 8; i++) {
    const id = n - i;
    const y = 21 + (i - 1 + k) * rowH;
    const r = rng(seed + id * 13);
    const unread = i <= 1;
    fillPill(ctx, 56, y + 1, W - 60, rowH - 2, 4, unread ? O_CARD : mixHex(O_BACK, O_CARD, 0.5));
    fillDot(ctx, 66, y + rowH / 2, 5.5, O_CHIPS[Math.floor(r() * O_CHIPS.length)]);
    fillPill(ctx, 76, y + 5, 26 + r() * 24, 3.2, 1.6, unread ? O_INK : O_TEXT);
    const subject = subjects.length ? subjects[((id % subjects.length) + subjects.length) % subjects.length] : '';
    if (subject) {
      ctx.fillStyle = O_TEXT;
      ctx.fillText(subject.slice(0, 30), 76, y + 14.5);
    } else {
      fillPill(ctx, 76, y + 12.5, 50 + r() * 80, 2.6, 1.3, O_SOFT);
    }
    if (unread) fillDot(ctx, W - 11, y + rowH / 2, 2.4, color);
  }
  ctx.restore();
}

/** A deck: thumbnails down the side, the current slide building in, the next one every 5 s. */
function paintSlides(ctx: CanvasRenderingContext2D, t: number, color: string): void {
  const period = 5;
  const n = Math.floor(t / period);
  const cur = ((n % 4) + 4) % 4;
  const k = smooth01((t - n * period) / 0.8);
  for (let i = 0; i < 4; i++) {
    const y = 22 + i * 34;
    fillPill(ctx, 4, y, 40, 28, 2, O_CARD);
    fillPill(ctx, 8, y + 5, 22, 3, 1.5, i === cur ? color : O_SOFT);
    fillPill(ctx, 8, y + 12, 30, 2.4, 1.2, O_LINE);
    fillPill(ctx, 8, y + 17, 26, 2.4, 1.2, O_LINE);
    if (i === cur) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.roundRect(4, y, 40, 28, 2);
      ctx.stroke();
    }
  }
  const x = 50;
  const y = 22;
  const w = 200;
  const h = 134;
  fillPill(ctx, x, y, w, h, 3, O_CARD);
  if (cur === 0) {
    // Title slide: a band of colour, a big title, confetti.
    ctx.fillStyle = color;
    ctx.fillRect(x, y + 44, w, 40);
    fillPill(ctx, x + 20, y + 54, 110 * k, 9, 4.5, '#EEF2F6');
    fillPill(ctx, x + 20, y + 69, 70 * k, 4, 2, mixHex(color, '#EEF2F6', 0.55));
    for (let i = 0; i < 6; i++) fillDot(ctx, x + 150 + (i % 3) * 14, y + 20 + Math.floor(i / 3) * 90, 3, O_CHIPS[i]);
  } else if (cur === 1) {
    // A bar chart growing in.
    fillPill(ctx, x + 14, y + 12, 90, 7, 3.5, O_INK);
    ctx.fillStyle = O_LINE;
    ctx.fillRect(x + 20, y + h - 18, w - 40, 1.2);
    [0.45, 0.7, 0.55, 0.9].forEach((v, i) => fillPill(ctx, x + 32 + i * 38, y + h - 18 - 84 * v * k, 22, 84 * v * k, 3, O_CHIPS[i]));
  } else if (cur === 2) {
    // Three bullet points, one at a time.
    fillPill(ctx, x + 14, y + 12, 80, 7, 3.5, O_INK);
    for (let i = 0; i < 3; i++) {
      const show = smooth01(k * 3 - i);
      if (show <= 0) continue;
      fillDot(ctx, x + 22, y + 44 + i * 26, 3.5, O_CHIPS[i]);
      fillPill(ctx, x + 32, y + 42 + i * 26, (70 + i * 25) * show, 4.5, 2.2, O_TEXT);
    }
  } else {
    // The big number.
    fillPill(ctx, x + 14, y + 12, 70, 7, 3.5, O_INK);
    ctx.fillStyle = color;
    ctx.font = `700 ${Math.round(26 + 8 * k)}px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.fillText('+18%', x + w / 2, y + h / 2 + 6);
    ctx.textAlign = 'left';
    fillTriangle(ctx, x + w / 2 + 52, y + h / 2 + 2, 7, '#3DBE7A');
  }
}

/** A document typing itself out word by word, with a blinking caret. */
function paintDoc(ctx: CanvasRenderingContext2D, t: number, seed: number, color: string): void {
  ctx.fillStyle = O_PANEL;
  ctx.fillRect(0, 18, W, 9);
  for (let i = 0; i < 6; i++) fillPill(ctx, 6 + i * 13, 20, 9, 5, 1.5, i === 1 ? color : O_SOFT);
  fillPill(ctx, 40, 31, 176, 140, 2, O_CARD);
  const r = rng(seed);
  fillPill(ctx, 50, 39, 70 + r() * 30, 6, 3, O_INK);
  const words: { x: number; y: number; w: number }[] = [];
  let x = 50;
  let y = 54;
  while (y < H - 6) {
    const w = 6 + r() * 18;
    if (x + w > 206) {
      x = 50;
      y += r() < 0.18 ? 15 : 9;
      continue;
    }
    words.push({ x, y, w });
    x += w + 3.5;
  }
  // Type on, hold the full page a moment, start again.
  const shown = Math.min(words.length, Math.floor(t * 5) % (words.length + 12));
  for (let i = 0; i < shown; i++) fillPill(ctx, words[i].x, words[i].y, words[i].w, 2.8, 1.4, O_SOFT);
  if (Math.floor(t * 2.5) % 2 === 0) {
    const last = words[shown - 1];
    ctx.fillStyle = color;
    ctx.fillRect(last ? last.x + last.w + 1.5 : 50, (last?.y ?? 54) - 2.5, 1.4, 7.5);
  }
}

/** A dashboard: three KPI tiles and a line chart that keeps drawing itself. */
function paintChart(ctx: CanvasRenderingContext2D, t: number, seed: number, color: string): void {
  const r = rng(seed);
  for (let i = 0; i < 3; i++) {
    const x = 6 + i * 83;
    fillPill(ctx, x, 22, 78, 28, 4, O_CARD);
    fillPill(ctx, x + 6, 27, 26, 3, 1.5, O_SOFT);
    fillPill(ctx, x + 6, 35, 30 + r() * 26, 8, 4, i === 0 ? color : O_INK);
    fillTriangle(ctx, x + 70, 42, 4, '#3DBE7A');
  }
  const px = 6;
  const py = 55;
  const pw = 244;
  const ph = 101;
  fillPill(ctx, px, py, pw, ph, 4, O_CARD);
  ctx.fillStyle = O_LINE;
  for (let i = 1; i < 4; i++) ctx.fillRect(px + 8, py + (ph * i) / 4, pw - 16, 0.8);
  const n = 13;
  const pts: [number, number][] = [];
  let v = 0.35 + r() * 0.2;
  for (let i = 0; i < n; i++) {
    v = Math.min(0.92, Math.max(0.12, v + (r() - 0.38) * 0.18));
    pts.push([px + 10 + (i * (pw - 20)) / (n - 1), py + ph - 8 - v * (ph - 16)]);
  }
  // How much of the line is drawn: never less than a few points, steadily on, a pause, again.
  const drawn = Math.min(n - 1, 3 + ((t * 2.2) % (n + 3)));
  const end = Math.floor(drawn);
  const f = drawn - end;
  const tip: [number, number] = end < n - 1 ? [pts[end][0] + (pts[end + 1][0] - pts[end][0]) * f, pts[end][1] + (pts[end + 1][1] - pts[end][1]) * f] : pts[n - 1];
  ctx.beginPath();
  ctx.moveTo(pts[0][0], py + ph - 6);
  for (let i = 0; i <= end; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.lineTo(tip[0], tip[1]);
  ctx.lineTo(tip[0], py + ph - 6);
  ctx.closePath();
  ctx.fillStyle = mixHex(O_CARD, color, 0.25);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i <= end; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.lineTo(tip[0], tip[1]);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();
  fillDot(ctx, tip[0], tip[1], 3 + Math.sin(t * 6) * 0.6, color);
}

/** A working week: coloured meetings, today's column tinted, the red now-line creeping down. */
function paintCalendar(ctx: CanvasRenderingContext2D, t: number, seed: number): void {
  const r = rng(seed);
  const x0 = 22;
  const y0 = 30;
  const cols = 5;
  const rows = 8;
  const cw = (W - x0 - 4) / cols;
  const rh = (H - y0 - 4) / rows;
  const today = Math.floor(r() * cols);
  ctx.fillStyle = O_PANEL;
  ctx.fillRect(0, 18, W, 11);
  ctx.fillStyle = mixHex(O_BACK, '#14A89A', 0.15);
  ctx.fillRect(x0 + today * cw, y0, cw, rows * rh);
  ctx.font = `700 7px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  for (let c = 0; c < cols; c++) {
    ctx.fillStyle = c === today ? '#14A89A' : O_TEXT;
    ctx.fillText('MTWTF'[c], x0 + (c + 0.5) * cw, 24);
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = O_LINE;
  for (let i = 0; i <= rows; i++) ctx.fillRect(x0, y0 + i * rh, W - x0 - 4, 0.7);
  for (let i = 0; i < rows; i++) fillPill(ctx, 4, y0 + i * rh + 2, 12, 2.4, 1.2, O_SOFT);
  for (let k = 0; k < 8; k++) {
    const c = Math.floor(r() * cols);
    const row = Math.floor(r() * (rows - 1));
    const len = 1 + Math.floor(r() * 2);
    const x = x0 + c * cw + 2;
    const y = y0 + row * rh + 1.5;
    fillPill(ctx, x, y, cw - 4, len * rh - 3, 3, O_CHIPS[k % O_CHIPS.length]);
    fillPill(ctx, x + 3, y + 3, (cw - 10) * (0.5 + r() * 0.4), 2.4, 1.2, 'rgba(238,242,246,0.85)');
  }
  const ny = y0 + ((t * 2.5 + (seed % 97)) % (rows * rh));
  ctx.fillStyle = '#FF5A5F';
  ctx.fillRect(x0, ny, W - x0 - 4, 1.4);
  fillDot(ctx, x0, ny + 0.7, 2.4, '#FF5A5F');
}

function fillPill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number, color: string): void {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(radius, w / 2, h / 2));
  ctx.fill();
}

function fillDot(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

/** A little "up" triangle. */
function fillTriangle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x + size, y + size * 0.6);
  ctx.lineTo(x - size, y + size * 0.6);
  ctx.closePath();
  ctx.fill();
}

const smooth01 = (x: number): number => {
  const v = Math.min(1, Math.max(0, x));
  return v * v * (3 - 2 * v);
};
