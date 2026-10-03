// The music lab (dev only, /music-lab.html): play the café band live, or render it offline to
// a WAV for listening tests (scripts/music-render.mjs drives window.musicLab.render).
import { followUp, type MusicEvent } from './composer';
import { murmurBuffer, limiter } from './fx';
import { MusicPlayer, type Part } from './music';
import { rng } from './rng';
import type { SfxName } from '../ui/bus';
import { drawSound } from '../ui/sfx';

export interface RenderOptions {
  seconds: number;
  seed: number;
  night?: boolean;
  firstTune?: number;
  parts?: Part[];
  crackle?: boolean;
  /** Café murmur level (0 = none). */
  murmur?: number;
  /** Render this much first and drop it (to start mid-tune). */
  skip?: number;
  sampleRate?: number;
}

async function render(o: RenderOptions): Promise<{ wav: string; tunes: string[]; ms: number }> {
  const started = performance.now();
  const sr = o.sampleRate ?? 44100;
  const skip = o.skip ?? 0;
  const total = o.seconds + skip;
  const ctx = new OfflineAudioContext(2, Math.ceil(sr * total), sr);
  const bus = ctx.createGain();
  bus.connect(limiter(ctx, ctx.destination));
  const tunes: string[] = [];
  const p = new MusicPlayer(ctx, {
    seed: o.seed,
    firstTune: o.firstTune,
    night: () => !!o.night,
    crackle: o.crackle,
    parts: o.parts,
    onTune: (t, i) => tunes.push(`${i}: ${t.label}`),
  });
  p.output.connect(bus);
  p.start(0.05);
  if (o.murmur) p.addMurmur(await murmurBuffer(sr, 23, rng(o.seed ^ 0x77)), o.murmur, 0.05);
  // Schedule as the live timer does: a little ahead at a time (suspend, pump, resume).
  const ahead = 1.2;
  for (let t = 0.5; t < total; t += 0.5) {
    void ctx.suspend(t).then(() => {
      p.pump(t + ahead);
      void ctx.resume();
    });
  }
  p.pump(ahead);
  const buf = await ctx.startRendering();
  return { wav: wavBase64(buf, Math.floor(skip * sr)), tunes, ms: Math.round(performance.now() - started) };
}

/** 16-bit PCM WAV, base64 (it crosses the DevTools protocol as a string). */
function wavBase64(buf: AudioBuffer, from: number): string {
  const ch = [buf.getChannelData(0), buf.getChannelData(1)];
  const n = buf.length - from;
  const bytes = new Uint8Array(44 + n * 4);
  const v = new DataView(bytes.buffer);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * 4, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, buf.sampleRate, true);
  v.setUint32(28, buf.sampleRate * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++)
    for (let c = 0; c < 2; c++) {
      const s = Math.max(-1, Math.min(1, ch[c][from + i]));
      v.setInt16(44 + i * 4 + c * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

/**
 * Single notes and hits through the band's real chain (no crackle), one per `gap` seconds, for
 * measuring each voice: [{ type: 'keys', notes: [60], vel: 0.5, dur: 3 }, { type: 'drum', hit: 'kick', vel: 0.8 }, …].
 */
async function renderKit(list: MusicEvent[], gap = 2, sampleRate = 44100): Promise<{ wav: string }> {
  const total = list.length * gap + 1;
  const ctx = new OfflineAudioContext(2, Math.ceil(sampleRate * total), sampleRate);
  const p = new MusicPlayer(ctx, { seed: 1, night: () => false, crackle: false });
  p.output.connect(ctx.destination);
  p.start(0);
  list.forEach((ev, i) => p.audition(ev, 0.05 + i * gap));
  const buf = await ctx.startRendering();
  return { wav: wavBase64(buf, 0) };
}

/** The sound table, one sound per `gap` seconds, through the hub's sfx gain and limiter. */
async function renderSfx(names: SfxName[], gap = 1.2, sampleRate = 44100): Promise<{ wav: string }> {
  const ctx = new OfflineAudioContext(2, Math.ceil(sampleRate * (names.length * gap + 0.5)), sampleRate);
  const bus = ctx.createGain();
  bus.gain.value = 0.55;
  bus.connect(limiter(ctx, ctx.destination));
  names.forEach((n, i) => drawSound(ctx, bus, n, 0.05 + i * gap));
  return { wav: wavBase64(await ctx.startRendering(), 0) };
}

/** Seconds from the start of tune `index` of a visit to the start of the next (day tunes). */
function tuneLength(seed: number, index: number): number {
  let t = null;
  for (let i = 0; i <= index; i++) t = followUp(t, seed, i, false);
  return (t!.bars.length * 4 * 60) / t!.bpm + 0.05;
}

// Live play, for a quick listen in a real browser.
let live: { ctx: AudioContext; p: MusicPlayer; timer: number } | null = null;
function play(night: boolean, seed = (Math.random() * 2 ** 32) >>> 0, parts?: Part[]): void {
  stop();
  const ctx = new AudioContext();
  const bus = ctx.createGain();
  bus.gain.value = 0.8;
  bus.connect(limiter(ctx, ctx.destination));
  const now = document.getElementById('now');
  const p = new MusicPlayer(ctx, { seed, parts, night: () => night, onTune: (t, i) => now && (now.textContent = `Tune ${i}: ${t.label}`) });
  p.output.connect(bus);
  p.start(ctx.currentTime + 0.1);
  const timer = window.setInterval(() => p.pump(ctx.currentTime + 0.8), 100);
  p.pump(ctx.currentTime + 0.8);
  live = { ctx, p, timer };
}
/** Profiling: just a running context with a silent oscillator. */
function idleContext(): void {
  stop();
  const ctx = new AudioContext();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  g.gain.value = 0;
  o.connect(g).connect(ctx.destination);
  o.start();
  live = { ctx, p: null as unknown as MusicPlayer, timer: 0 };
}

function stop(): void {
  if (!live) return;
  window.clearInterval(live.timer);
  void live.ctx.close();
  live = null;
}

Object.assign(window, { musicLab: { render, renderKit, renderSfx, play, stop, tuneLength, idleContext } });
document.getElementById('day')?.addEventListener('click', () => play(false));
document.getElementById('night')?.addEventListener('click', () => play(true));
document.getElementById('stop')?.addEventListener('click', stop);
