// The café band, made of plain WebAudio nodes (no samples): an electric piano, a round bass,
// brushy drums and soft vibes. Every voice is fire-and-forget: built, scheduled at an exact
// time, and left to stop itself. Works on an AudioContext or an OfflineAudioContext (renders).
import { between, type Rng } from './rng';
import { midiHz } from './theory';

/** Shared, per-context bits: a noise buffer and the shaping curves. */
export interface Kit {
  ctx: BaseAudioContext;
  noise: AudioBuffer;
  /**
   * The e-piano pickup: the tine swings past a magnet a little off its centre, and the flux it
   * sees falls off like 1 / (1 + d²). Soft notes stay almost pure; hard ones bark.
   */
  pickup: Float32Array<ArrayBuffer>;
  /** Gentle saturation for bass and drums. */
  warm: Float32Array<ArrayBuffer>;
  /** Tape: barely there until the peaks. */
  tape: Float32Array<ArrayBuffer>;
}

const kits = new WeakMap<BaseAudioContext, Kit>();

export function kitFor(ctx: BaseAudioContext, r: Rng): Kit {
  let kit = kits.get(ctx);
  if (kit) return kit;
  const len = Math.floor(ctx.sampleRate * 1.5);
  const noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const n = noise.getChannelData(0);
  for (let i = 0; i < len; i++) n[i] = r() * 2 - 1;
  const flux = (x: number) => 1 / (1 + ((x - 0.35) / 1.1) ** 2);
  // Zero at rest and unit gain for small swings, so loudness doesn't depend on the curve.
  const slope = (flux(1e-4) - flux(-1e-4)) / 2e-4;
  kit = { ctx, noise, pickup: curve((x) => (flux(x) - flux(0)) / slope), warm: curve((x) => Math.tanh(1.4 * x) / Math.tanh(1.4)), tape: curve((x) => Math.tanh(x)) };
  kits.set(ctx, kit);
  return kit;
}

function curve(f: (x: number) => number, n = 2048): Float32Array<ArrayBuffer> {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = f((i / (n - 1)) * 2 - 1);
  return c;
}

/** Envelope helper: silence, a linear rise to `peak`, then exponential decays. */
function env(g: AudioParam, t: number, attack: number, peak: number): void {
  g.setValueAtTime(0, t);
  g.linearRampToValueAtTime(peak, t + attack);
}

const SETTLE = 7; // time constants after a release before a voice stops (e^-7: inaudible)

// ------------------------------------------------------------------------------------------
// Electric piano

/**
 * A tine through a pickup. The sine is the tine's swing, the waveshaper the pickup: the harder
 * the note, the further into the curve it swings and the more it barks; as it dies away it
 * mellows to almost a pure tone. A short high partial gives the bell of the hammer strike.
 */
export function epiano(kit: Kit, out: AudioNode, t: number, midi: number, vel: number, dur: number, r: Rng): void {
  const { ctx } = kit;
  const f = midiHz(midi) * Math.pow(2, between(r, -3, 3) / 1200);
  const v = Math.min(1, Math.max(0.05, vel));
  // Low notes ring for ages; high ones are short.
  const sustain = 2.6 * Math.pow(2, -(midi - 60) / 24);
  const drive = Math.min(0.98, 0.2 + 0.85 * v);
  const off = t + Math.max(0.08, dur);

  const osc = ctx.createOscillator();
  osc.frequency.value = f;
  const swing = ctx.createGain();
  env(swing.gain, t, 0.003, drive);
  swing.gain.setTargetAtTime(drive * 0.55, t + 0.003, 0.18);
  if (off > t + 0.5) swing.gain.setTargetAtTime(0, t + 0.5, sustain);
  // No oversampling: the pickup's harmonics that matter stay far below Nyquist up to G5.
  const shaper = ctx.createWaveShaper();
  shaper.curve = kit.pickup;
  const amp = ctx.createGain();
  // Keep the top of the keyboard from poking out.
  amp.gain.value = (0.3 / drive) * v * Math.pow(2, -Math.max(0, midi - 64) / 30);
  osc.connect(swing).connect(shaper).connect(amp).connect(out);

  // The hammer's bell: a fast-dying partial well above the note.
  const bell = ctx.createOscillator();
  bell.frequency.value = f * 7.02;
  const bg = ctx.createGain();
  env(bg.gain, t, 0.001, 0.07 * v * Math.sqrt(v) * Math.pow(2, -Math.max(0, midi - 60) / 18));
  bg.gain.setTargetAtTime(0, t + 0.001, 0.022);
  bell.connect(bg).connect(out);

  // Key up: the damper.
  swing.gain.setTargetAtTime(0, off, 0.07);
  const stop = off + 0.07 * SETTLE;
  osc.start(t);
  osc.stop(stop);
  bell.start(t);
  bell.stop(t + 0.25);
  // Out of the render graph as soon as it's done (rather than whenever it's collected).
  osc.onended = () => {
    swing.disconnect();
    shaper.disconnect();
    amp.disconnect();
    bg.disconnect();
  };
}

// ------------------------------------------------------------------------------------------
// Bass

/**
 * Round and soft: a sine with a triangle on top whose brightness dies away after the pluck.
 * (The bus saturates and filters the sum, so each note is only four cheap nodes, and no filter
 * is swept per note: an automated filter costs a coefficient update every sample.)
 */
export function bass(kit: Kit, out: AudioNode, t: number, midi: number, vel: number, dur: number): void {
  const { ctx } = kit;
  const f = midiHz(midi);
  const v = Math.min(1, vel);
  const sine = ctx.createOscillator();
  sine.frequency.value = f;
  const tri = ctx.createOscillator();
  tri.type = 'triangle';
  tri.frequency.value = f;
  const pluck = ctx.createGain();
  env(pluck.gain, t, 0.006, 0.6);
  pluck.gain.setTargetAtTime(0.14, t + 0.006, 0.12);
  const amp = ctx.createGain();
  env(amp.gain, t, 0.008, 0.62 * v);
  amp.gain.setTargetAtTime(0.4 * v, t + 0.008, 0.35);
  const off = t + Math.max(0.1, dur);
  // Plucked notes stop short; a long held note (a tune's last) fades away.
  const release = dur > 2 ? 0.3 : 0.045;
  amp.gain.setTargetAtTime(0, off, release);
  sine.connect(amp);
  tri.connect(pluck).connect(amp);
  amp.connect(out);
  const stop = off + release * SETTLE;
  sine.start(t);
  tri.start(t);
  sine.stop(stop);
  tri.stop(stop);
  sine.onended = () => {
    pluck.disconnect();
    amp.disconnect();
  };
}

// ------------------------------------------------------------------------------------------
// Drums

function noiseBurst(kit: Kit, t: number, r: Rng, length: number): AudioBufferSourceNode {
  const src = kit.ctx.createBufferSource();
  src.buffer = kit.noise;
  // Anywhere in the buffer that leaves room for the whole burst (an early end would click).
  src.start(t, between(r, 0, Math.max(0, src.buffer.duration - length - 0.01)), length);
  return src;
}

function filter(ctx: BaseAudioContext, type: BiquadFilterType, freq: number, q = 0.707): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

/** A soft, round kick: a falling sine and a tiny beater click. */
export function kick(kit: Kit, out: AudioNode, t: number, vel: number, r: Rng): void {
  const { ctx } = kit;
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(165, t);
  o.frequency.exponentialRampToValueAtTime(60, t + 0.06);
  o.frequency.exponentialRampToValueAtTime(52, t + 0.4);
  const g = ctx.createGain();
  env(g.gain, t, 0.002, 0.125 * vel);
  g.gain.setTargetAtTime(0, t + 0.002, 0.085);
  const sat = ctx.createWaveShaper();
  sat.curve = kit.warm;
  o.connect(g).connect(sat).connect(out);
  o.start(t);
  o.stop(t + 0.9);
  const click = noiseBurst(kit, t, r, 0.03);
  const bp = filter(ctx, 'bandpass', 2800, 0.8);
  const cg = ctx.createGain();
  env(cg.gain, t, 0.0008, 0.03 * vel);
  cg.gain.setTargetAtTime(0, t + 0.0008, 0.004);
  click.connect(bp).connect(cg).connect(out);
}

/** A soft stick on the snare: a short noisy crack over a little body. */
export function snare(kit: Kit, out: AudioNode, t: number, vel: number, r: Rng): void {
  const { ctx } = kit;
  const src = noiseBurst(kit, t, r, 0.4);
  const hp = filter(ctx, 'highpass', 800);
  const bp = filter(ctx, 'bandpass', 2100, 0.55);
  const g = ctx.createGain();
  env(g.gain, t, 0.0015, 0.38 * vel);
  g.gain.setTargetAtTime(0, t + 0.0015, 0.055);
  src.connect(hp).connect(bp).connect(g).connect(out);
  const body = ctx.createOscillator();
  body.frequency.setValueAtTime(205, t);
  body.frequency.exponentialRampToValueAtTime(175, t + 0.08);
  const bg = ctx.createGain();
  env(bg.gain, t, 0.0015, 0.28 * vel);
  bg.gain.setTargetAtTime(0, t + 0.0015, 0.035);
  body.connect(bg).connect(out);
  body.start(t);
  body.stop(t + 0.3);
}

/** Side-stick: a woody click. */
export function rim(kit: Kit, out: AudioNode, t: number, vel: number, r: Rng): void {
  const { ctx } = kit;
  for (const [f, d, a] of [
    [1720, 0.011, 0.29],
    [830, 0.018, 0.26],
  ] as const) {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f * between(r, 0.99, 1.01);
    const g = ctx.createGain();
    env(g.gain, t, 0.0007, a * vel);
    g.gain.setTargetAtTime(0, t + 0.0007, d);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + d * SETTLE + 0.01);
  }
  const src = noiseBurst(kit, t, r, 0.05);
  const bp = filter(ctx, 'bandpass', 3200, 1.2);
  const g = ctx.createGain();
  env(g.gain, t, 0.0005, 0.16 * vel);
  g.gain.setTargetAtTime(0, t + 0.0005, 0.007);
  src.connect(bp).connect(g).connect(out);
}

/** A brush tap on the snare: soft-edged and breathy. */
export function brush(kit: Kit, out: AudioNode, t: number, vel: number, r: Rng): void {
  const { ctx } = kit;
  const src = noiseBurst(kit, t, r, 0.5);
  const bp = filter(ctx, 'bandpass', 2000, 0.5);
  // Soft-edged, like bristles on a skin.
  const lp = filter(ctx, 'lowpass', 3500);
  const g = ctx.createGain();
  env(g.gain, t, 0.006, 0.33 * vel);
  g.gain.setTargetAtTime(0, t + 0.006, 0.075);
  src.connect(bp).connect(lp).connect(g).connect(out);
  const body = ctx.createOscillator();
  body.frequency.value = 190;
  const bg = ctx.createGain();
  env(bg.gain, t, 0.004, 0.1 * vel);
  bg.gain.setTargetAtTime(0, t + 0.004, 0.04);
  body.connect(bg).connect(out);
  body.start(t);
  body.stop(t + 0.35);
}

/** A brush circling on the skin: a long, quiet swish. */
export function swirl(kit: Kit, out: AudioNode, t: number, vel: number, dur: number, r: Rng): void {
  const { ctx } = kit;
  const src = noiseBurst(kit, t, r, dur + 0.1);
  const soft = filter(ctx, 'lowpass', 3500);
  // A fixed band: the swell of the level is the swish (a swept filter would cost per sample).
  const bp = filter(ctx, 'bandpass', 2000, 0.45);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.13 * vel, t + dur * 0.45);
  g.gain.linearRampToValueAtTime(0.04 * vel, t + dur * 0.8);
  g.gain.linearRampToValueAtTime(0, t + dur);
  src.connect(soft).connect(bp).connect(g).connect(out);
}

/** Hi-hat (closed or open): dusty noise up top. */
export function hat(kit: Kit, out: AudioNode, t: number, vel: number, open: boolean, r: Rng): void {
  const { ctx } = kit;
  const src = noiseBurst(kit, t, r, open ? 0.7 : 0.15);
  const hp = filter(ctx, 'highpass', 6000);
  const bp = filter(ctx, 'bandpass', 8200, 0.7);
  const g = ctx.createGain();
  env(g.gain, t, 0.0008, (open ? 0.25 : 0.47) * vel);
  g.gain.setTargetAtTime(0, t + 0.0008, open ? 0.09 : 0.016);
  src.connect(hp).connect(bp).connect(g).connect(out);
}

/** A shaker: a softer, slower-starting hat. */
export function shaker(kit: Kit, out: AudioNode, t: number, vel: number, r: Rng): void {
  const { ctx } = kit;
  const src = noiseBurst(kit, t, r, 0.2);
  const bp = filter(ctx, 'bandpass', 6200, 1.1);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.29 * vel, t + 0.014);
  g.gain.setTargetAtTime(0, t + 0.014, 0.026);
  src.connect(bp).connect(g).connect(out);
}

// ------------------------------------------------------------------------------------------
// Vibes

/** A soft mallet on a metal bar: the fundamental, the bar's bright partial two octaves up, a tick. */
export function vibes(kit: Kit, out: AudioNode, t: number, midi: number, vel: number, dur: number, r: Rng): void {
  const { ctx } = kit;
  const f = midiHz(midi);
  const v = Math.min(1, vel);
  const off = t + Math.max(0.1, dur);
  const end = off + 0.18 * SETTLE;
  // The motor: a slow pulse in the level, about five times a second.
  const motor = ctx.createGain();
  motor.gain.value = 0.8;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 5.1;
  const depth = ctx.createGain();
  depth.gain.value = 0.2;
  lfo.connect(depth).connect(motor.gain);
  motor.connect(out);
  lfo.start(t);
  lfo.stop(end);
  for (const [ratio, level, decay] of [
    [1, 0.33, 1.4],
    [3.98, 0.075, 0.22],
    [9.85, 0.018, 0.05],
  ] as const) {
    const o = ctx.createOscillator();
    o.frequency.value = f * ratio;
    const g = ctx.createGain();
    env(g.gain, t, 0.002, level * v);
    g.gain.setTargetAtTime(0, t + 0.002, decay);
    // Damped when the note ends (soft pedal).
    g.gain.setTargetAtTime(0, off, 0.18);
    o.connect(g).connect(motor);
    o.start(t);
    o.stop(end);
  }
  const tick = noiseBurst(kit, t, r, 0.02);
  const lp = filter(ctx, 'lowpass', 2400);
  const tg = ctx.createGain();
  env(tg.gain, t, 0.0006, 0.035 * v);
  tg.gain.setTargetAtTime(0, t + 0.0006, 0.003);
  tick.connect(lp).connect(tg).connect(out);
}
