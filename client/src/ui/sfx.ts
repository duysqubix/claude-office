// Little synthesized sounds (no assets), UX.md §4.5: door chimes, the needs-you ding, footsteps,
// pops and the rest of the sound table. They play through the office's speakers (audio/), which
// own the mute (M), the volumes and the café music; this is the sound-effects half.
// Play one by name with sfx.play('pop-up'), or from anywhere with bus.emit('sfx', { name }).
import { audio } from '../audio';
import { bus, type SfxName } from './bus';

/** At most this many sounds at once; footsteps make way first, a ding never does. */
const MAX_VOICES = 6;
/** The same sound again this soon is dropped (steps excepted). */
const RETRIGGER = 0.12;
/** Needs-you reminders (UX.md §1.1): softer dings at 60 s and 180 s, then silence. */
const REMIND_AT = [60_000, 180_000];
/** An answer here and the state change that follows are one answer: one sound. */
const ANSWER_DEDUPE = 8;

interface Voice {
  name: SfxName;
  end: number;
  out: GainNode;
}

export interface PlayOptions {
  /** Screen x in −1…1 (P1: sounds pan with where they happen). */
  pan?: number;
  /** 0–1: footsteps from walking to running, landings from a hop to a full jump. */
  strength?: number;
  /** A reminder: the quieter version (ding .12). */
  soft?: boolean;
}

/** A recipe draws its sound into the voice's output from time `t` and says how long it lasts. */
type Recipe = (k: Draw, t: number, o: PlayOptions) => number;

interface Draw {
  ctx: BaseAudioContext;
  out: AudioNode;
  /** An enveloped tone into `to` (default: the voice's output). */
  tone(freq: number, at: number, dur: number, type: OscillatorType, gain: number, slideTo?: number, to?: AudioNode): OscillatorNode;
  noise(at: number, dur: number): AudioBufferSourceNode;
  filter(type: BiquadFilterType, freq: number, q?: number): BiquadFilterNode;
}

/** The sound table (UX.md §4.5): wave, Hz, ms and gain as specified there. */
const RECIPES: Record<SfxName, Recipe> = {
  pop: (k, t) => (k.tone(520, t, 0.07, 'sine', 0.16, 880), 0.07),
  unpop: (k, t) => (k.tone(760, t, 0.08, 'sine', 0.1, 420), 0.08),
  tick: (k, t) => (k.tone(1800, t, 0.025, 'triangle', 0.05), 0.025),
  ding: (k, t, o) => {
    const g = o.soft ? 0.12 : 0.22;
    for (const [dt, f] of [
      [0, 988],
      [0.09, 1319],
    ] as const) {
      k.tone(f, t + dt, 0.35, 'triangle', g);
      k.tone(f / 2, t + dt, 0.35, 'sine', g * 0.3);
    }
    return 0.44;
  },
  'pop-up': (k, t) => {
    k.tone(659, t, 0.16, 'triangle', 0.12);
    k.tone(988, t + 0.07, 0.16, 'triangle', 0.12);
    return 0.23;
  },
  tada: (k, t) => {
    [1047, 1319, 1568].forEach((f, i) => k.tone(f, t + i * 0.06, 0.25, 'triangle', 0.1));
    return 0.37;
  },
  'chime-in': (k, t) => {
    k.tone(659, t, 0.5, 'sine', 0.16);
    k.tone(659 * 2, t, 0.22, 'sine', 0.025);
    k.tone(523, t + 0.16, 0.5, 'sine', 0.16);
    k.tone(523 * 2, t + 0.16, 0.25, 'sine', 0.025);
    return 0.66;
  },
  'chime-out': (k, t) => {
    k.tone(523, t, 0.5, 'sine', 0.12);
    k.tone(392, t + 0.16, 0.5, 'sine', 0.12);
    return 0.66;
  },
  whoosh: (k, t) => {
    const src = k.noise(t, 0.35);
    const bp = k.filter('bandpass', 800, 0.8);
    bp.frequency.setValueAtTime(800, t);
    bp.frequency.exponentialRampToValueAtTime(2400, t + 0.35);
    const g = k.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.07, t + 0.12);
    g.gain.linearRampToValueAtTime(0, t + 0.35);
    src.connect(bp).connect(g).connect(k.out);
    return 0.35;
  },
  bell: (k, t) => {
    k.tone(1319, t, 0.9, 'triangle', 0.2);
    k.tone(2637, t, 0.9, 'sine', 0.06);
    return 0.9;
  },
  step: (k, t, o) => {
    const src = k.noise(t, 0.03);
    src.playbackRate.value = 0.94 + Math.random() * 0.12;
    const lp = k.filter('lowpass', 600);
    const g = k.ctx.createGain();
    const peak = 0.035 + 0.015 * Math.max(0, Math.min(1, o.strength ?? 1));
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    src.connect(lp).connect(g).connect(k.out);
    return 0.03;
  },
  boing: (k, t) => (k.tone(260, t, 0.13, 'sine', 0.1, 520), 0.13),
  // A landing: as hard as the jump was (strength ≈ 1 for a full one).
  thud: (k, t, o) => (k.tone(140, t, 0.09, 'sine', 0.14 * (0.5 + 0.5 * Math.min(1, o.strength ?? 1)), 70), 0.09),
  boop: (k, t) => {
    const lp = k.filter('lowpass', 1200);
    lp.connect(k.out);
    k.tone(440, t, 0.08, 'square', 0.07, 330, lp);
    return 0.08;
  },
  error: (k, t) => {
    const lp = k.filter('lowpass', 1200);
    lp.connect(k.out);
    k.tone(220, t, 0.12, 'square', 0.08, 180, lp);
    return 0.12;
  },
  pip: (k, t) => (k.tone(1568, t, 0.04, 'sine', 0.05), 0.04),
  wahwah: (k, t) => {
    k.tone(392, t, 0.16, 'triangle', 0.14);
    k.tone(330, t + 0.16, 0.16, 'triangle', 0.14);
    const last = k.tone(262, t + 0.32, 0.4, 'triangle', 0.14);
    // The last one sags 60 cents, with a sad little vibrato.
    last.detune.setValueAtTime(0, t + 0.32);
    last.detune.linearRampToValueAtTime(-60, t + 0.72);
    const vib = k.ctx.createOscillator();
    vib.frequency.value = 6;
    const depth = k.ctx.createGain();
    depth.gain.value = 18;
    vib.connect(depth).connect(last.detune);
    vib.start(t + 0.32);
    vib.stop(t + 0.8);
    return 0.72;
  },
  // Someone finished their turn (#162): two soft rising notes, gentler than the needs-you ding.
  ready: (k, t) => {
    k.tone(784, t, 0.3, 'sine', 0.09);
    k.tone(1175, t + 0.11, 0.42, 'sine', 0.08);
    k.tone(2350, t + 0.11, 0.2, 'sine', 0.012);
    return 0.53;
  },
  slurp: (k, t) => {
    const src = k.noise(t, 0.25);
    const bp = k.filter('bandpass', 900, 1.2);
    bp.frequency.setValueAtTime(900, t);
    bp.frequency.exponentialRampToValueAtTime(400, t + 0.25);
    const g = k.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.04);
    g.gain.linearRampToValueAtTime(0, t + 0.25);
    src.connect(bp).connect(g).connect(k.out);
    return 0.25;
  },
};

export class Sfx {
  private voices: Voice[] = [];
  private last = new Map<SfxName, number>();
  private lastAny = 0;
  private reminders = new Map<string, number[]>();
  private answeredAt = new Map<string, number>();

  constructor() {
    // The speakers wake on the first click or key press; the café music starts with them.
    audio.arm();
    bus.on('sfx', ({ name, pan }) => this.play(name, { pan }));
    bus.on('jump', () => this.play('boing'));
    bus.on('land', () => this.play('thud'));
  }

  get muted(): boolean {
    return audio.muted;
  }

  /** M: everything off or on (music too). Returns the new muted state. */
  toggle(): boolean {
    const m = audio.toggleMute();
    // Once the speakers are awake again (resuming takes a moment).
    if (!m) void audio.ready().then(() => this.pop());
    return m;
  }

  /** Play a sound from the table. */
  play(name: SfxName, o: PlayOptions = {}): void {
    const sp = audio.sfxOut();
    if (!sp) return;
    const { ctx } = sp;
    const now = ctx.currentTime;
    if (name !== 'step' && now - (this.last.get(name) ?? -1) < RETRIGGER) return;
    // A toast's pip makes way for any other sound (clock-ins chime, needs-you dings).
    if (name === 'pip' && now - this.lastAny < 0.25) return;
    this.voices = this.voices.filter((v) => v.end > now);
    if (this.voices.length >= MAX_VOICES) {
      const victim = this.voices.find((v) => v.name === 'step') ?? (name === 'step' ? undefined : this.voices.find((v) => v.name !== 'ding'));
      if (!victim) return;
      victim.out.gain.setTargetAtTime(0, now, 0.004);
      this.voices.splice(this.voices.indexOf(victim), 1);
    }
    const out = ctx.createGain();
    if (o.pan !== undefined) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-0.6, Math.min(0.6, o.pan * 0.6));
      out.connect(p).connect(sp.out);
    } else out.connect(sp.out);
    const t = now + 0.005;
    const dur = drawSound(ctx, out, name, t, o);
    this.voices.push({ name, end: t + dur + 0.05, out });
    this.last.set(name, now);
    if (name !== 'step') this.lastAny = now;
  }

  /** Ding-dong: someone came through the front door (and the door slides). */
  chime(): void {
    this.play('chime-in');
    this.play('whoosh');
  }

  /** Someone needs you. With their id, softer reminders follow at 60 s and 180 s until answered. */
  ding(id?: string): void {
    this.play('ding');
    if (!id) return;
    // A new question: its answer gets its own pop-up.
    this.answeredAt.delete(id);
    this.forget(id);
    this.reminders.set(
      id,
      REMIND_AT.map((ms) => window.setTimeout(() => this.play('ding', { soft: true }), ms)),
    );
  }

  /**
   * They were answered: the hop's pop-up, once per answer. `settled` (their state left
   * needs-you) also ends the reminders; an answer given here passes false, since another
   * question may already be waiting behind it.
   */
  answered(id: string, settled = true): void {
    if (settled) this.forget(id);
    const now = performance.now() / 1000;
    for (const [k, t] of this.answeredAt) if (now - t > ANSWER_DEDUPE) this.answeredAt.delete(k);
    // The state change that follows an answer given here is the same answer.
    if (this.answeredAt.has(id)) return;
    this.answeredAt.set(id, now);
    this.play('pop-up');
  }

  /** They left: no more reminders. */
  forget(id: string): void {
    for (const t of this.reminders.get(id) ?? []) window.clearTimeout(t);
    this.reminders.delete(id);
  }

  /** Soft footstep (0–1: walking to running). */
  step(strength = 1): void {
    this.play('step', { strength });
  }

  /** Panel or toast in. */
  pop(): void {
    this.play('pop');
  }

  /** Panel or toast out. */
  close(): void {
    this.play('unpop');
  }

  /** Boing: a jump. */
  boing(): void {
    this.play('boing');
  }

  /** You hired someone (or called them back). */
  fanfare(): void {
    this.play('bell');
  }

  /** Coffee. */
  slurp(): void {
    this.play('slurp');
  }
}

const noises = new WeakMap<BaseAudioContext, AudioBuffer>();

/** Draw sound `name` from the table into `out` at time `t` (the lab renders these offline too). Returns its length. */
export function drawSound(ctx: BaseAudioContext, out: AudioNode, name: SfxName, t: number, o: PlayOptions = {}): number {
  return RECIPES[name](drawKit(ctx, out), t, o);
}

function drawKit(ctx: BaseAudioContext, out: AudioNode): Draw {
  let noise = noises.get(ctx);
  if (!noise) {
    const len = Math.floor(ctx.sampleRate * 0.5);
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    noises.set(ctx, noise);
  }
  const buf = noise;
  return {
    ctx,
    out,
    tone(freq, at, dur, type, gain, slideTo, to = out) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, at);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.012, dur * 0.3));
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g).connect(to);
      o.start(at);
      o.stop(at + dur + 0.05);
      return o;
    },
    noise(at, dur) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.start(at, Math.random() * (buf.duration - dur - 0.01), dur + 0.01);
      return src;
    },
    filter(type, freq, q = 0.707) {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      return f;
    },
  };
}
