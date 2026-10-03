// The laptop's own screen, in the room (#28): while Spotify plays here it shows now playing
// (the cover, the song and artist rolling by when they don't fit, a progress bar and three
// jiggling bars), so you can tell what's on from across the room. Otherwise the boss's usual
// dashboard. It repaints ten times a second while a song plays and the laptop is in view.
import * as THREE from 'three';
import { font } from '../world/kit';
import type { Laptop } from '../world/types';
import type { SpotifyStore } from './store';
import type { PlayerState } from './types';

const FRAME_MS = 100;
/** Past this the screen is a few pixels: no repaints. */
const FAR = 18;
const GREEN = '#1DB954';
const NIGHT = '#14202E';
const PAPER = '#FFFDF7';
const INK = '#2B2D42';
/** Covers kept loaded for the screen. */
const MAX_COVERS = 12;

const _at = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _f = new THREE.Frustum();

export class LaptopScreen {
  private covers = new Map<string, HTMLImageElement>();
  private showing = false;
  private readonly t0 = performance.now();

  constructor(
    private laptop: Laptop,
    private store: SpotifyStore,
    private camera: THREE.Camera,
  ) {
    store.subscribe(() => this.sync());
    window.setInterval(() => this.tick(), FRAME_MS);
  }

  private sync(): void {
    const now = this.store.state.now;
    if (now?.track) {
      this.showing = true;
      this.paint();
    } else if (this.showing) {
      this.showing = false;
      this.laptop.paint(null);
    }
  }

  private tick(): void {
    const now = this.store.state.now;
    if (this.showing && now && !now.paused && this.inView()) this.paint();
  }

  private inView(): boolean {
    this.laptop.screen.getWorldPosition(_at);
    this.camera.getWorldPosition(_eye);
    if (_at.distanceTo(_eye) > FAR) return false;
    _m.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    return _f.setFromProjectionMatrix(_m).containsPoint(_at);
  }

  private paint(): void {
    const now = this.store.state.now;
    if (!now?.track) return;
    const cover = this.cover(now.track.cover);
    const t = (performance.now() - this.t0) / 1000;
    this.laptop.paint((c, w, h) => draw(c, w, h, now, cover, t));
  }

  /** The cover as a loaded image (CORS-clean, so the texture can use it), or null while it loads. */
  private cover(url: string | null): HTMLImageElement | null {
    if (!url) return null;
    let img = this.covers.get(url);
    if (!img) {
      img = new Image();
      img.crossOrigin = 'anonymous';
      img.referrerPolicy = 'no-referrer';
      img.decoding = 'async';
      img.onload = () => {
        if (this.store.state.now?.track?.cover === url) this.paint();
      };
      img.src = url;
      this.covers.set(url, img);
      for (const old of this.covers.keys()) {
        if (this.covers.size <= MAX_COVERS) break;
        this.covers.delete(old);
      }
    }
    return img.complete && img.naturalWidth > 0 ? img : null;
  }
}

/** One frame of now playing on the 256 × 160 screen. */
function draw(c: CanvasRenderingContext2D, w: number, h: number, now: PlayerState, cover: HTMLImageElement | null, t: number): void {
  const track = now.track!;
  c.fillStyle = NIGHT;
  c.fillRect(0, 0, w, h);
  // The green band: what it's doing, and three bars that jiggle while it plays.
  c.fillStyle = GREEN;
  c.fillRect(0, 0, w, 28);
  c.fillStyle = NIGHT;
  c.font = font(700, 15);
  c.textBaseline = 'middle';
  c.fillText(now.paused ? 'PAUSED' : 'NOW PLAYING', 12, 15);
  for (let i = 0; i < 3; i++) {
    const k = now.paused ? 0.35 : 0.3 + 0.7 * Math.abs(Math.sin(t * (4.2 + i * 1.7) + i * 1.3));
    const bh = 16 * k;
    c.beginPath();
    c.roundRect(w - 46 + i * 11, 22 - bh, 7, bh, 2);
    c.fill();
  }
  // The cover in a chunky frame.
  const x = 12;
  const y = 38;
  const s = 84;
  c.save();
  c.beginPath();
  c.roundRect(x, y, s, s, 12);
  c.clip();
  if (cover) c.drawImage(cover, x, y, s, s);
  else {
    c.fillStyle = '#2E5B45';
    c.fillRect(x, y, s, s);
    c.fillStyle = PAPER;
    c.font = font(700, 44);
    c.textAlign = 'center';
    c.fillText('♪', x + s / 2, y + s / 2 + 2);
    c.textAlign = 'left';
  }
  c.restore();
  c.strokeStyle = INK;
  c.lineWidth = 3;
  c.beginPath();
  c.roundRect(x, y, s, s, 12);
  c.stroke();
  // The song and who it's by, rolling by when they don't fit.
  const tx = x + s + 12;
  const tw = w - tx - 10;
  c.save();
  c.beginPath();
  c.rect(tx, y, tw, s);
  c.clip();
  marquee(c, track.name, font(700, 21), PAPER, tx, y + 18, tw, t);
  marquee(c, track.artists, font(500, 16), '#9FE8B9', tx, y + 46, tw, t + 0.8);
  c.restore();
  // How far in.
  const pos = now.positionMs + (now.paused ? 0 : performance.now() - now.at);
  const k = now.durationMs ? Math.max(0, Math.min(1, pos / now.durationMs)) : 0;
  const by = h - 22;
  c.fillStyle = '#2B3A4E';
  c.beginPath();
  c.roundRect(12, by, w - 24, 10, 5);
  c.fill();
  c.fillStyle = GREEN;
  c.beginPath();
  c.roundRect(12, by, Math.max(10, (w - 24) * k), 10, 5);
  c.fill();
}

/** Text that fits sits still; longer text rolls left (after a pause at the start), looping. */
function marquee(c: CanvasRenderingContext2D, text: string, f: string, color: string, x: number, y: number, width: number, t: number): void {
  c.font = f;
  c.fillStyle = color;
  c.textBaseline = 'middle';
  const tw = c.measureText(text).width;
  if (tw <= width) {
    c.fillText(text, x, y);
    return;
  }
  const gap = 40;
  const speed = 30;
  const hold = 1.6;
  const cycle = (tw + gap) / speed + hold;
  const k = t % cycle;
  const off = k < hold ? 0 : (k - hold) * speed;
  c.fillText(text, x - off, y);
  c.fillText(text, x - off + tw + gap, y);
}
