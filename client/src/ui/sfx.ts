// Little synthesized sounds (no assets): door chime, needs-you ding, footsteps, UI pops.
// Mute persists in localStorage.

const MUTE_KEY = 'claude-office:muted';

export class Sfx {
  muted: boolean;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private lastStep = 0;

  constructor() {
    let m = false;
    try {
      m = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      // storage unavailable: default unmuted
    }
    this.muted = m;
    // Browsers only allow audio after a gesture; wake up on the first one.
    const wake = () => {
      this.ensure();
      if (this.ctx?.state === 'suspended') void this.ctx.resume();
    };
    window.addEventListener('pointerdown', wake, { capture: true });
    window.addEventListener('keydown', wake, { capture: true });
  }

  toggle(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      // ignore
    }
    if (!this.muted) this.pop();
    return this.muted;
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 0.25;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return this.ctx;
  }

  private ready(): AudioContext | null {
    if (this.muted) return null;
    const c = this.ensure();
    return c && c.state === 'running' ? c : null;
  }

  private tone(freq: number, at: number, dur: number, type: OscillatorType, gain: number, slideTo?: number): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(this.master!);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  /** Ding-dong: someone came through the front door. */
  chime(): void {
    const c = this.ready();
    if (!c) return;
    const t = c.currentTime;
    this.tone(659.25, t, 0.7, 'sine', 0.22);
    this.tone(1318.5, t, 0.3, 'sine', 0.05);
    this.tone(523.25, t + 0.28, 0.9, 'sine', 0.22);
    this.tone(1046.5, t + 0.28, 0.35, 'sine', 0.05);
  }

  /** Bright double ding: someone needs you. */
  ding(): void {
    const c = this.ready();
    if (!c) return;
    const t = c.currentTime;
    for (const [dt, f] of [
      [0, 1567.98],
      [0.16, 2093],
    ] as const) {
      this.tone(f, t + dt, 0.5, 'sine', 0.2);
      this.tone(f * 2.76, t + dt, 0.2, 'sine', 0.04);
    }
  }

  /** Soft footstep. */
  step(strength = 1): void {
    const c = this.ready();
    if (!c || !this.noise) return;
    const now = c.currentTime;
    if (now - this.lastStep < 0.08) return;
    this.lastStep = now;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500 + Math.random() * 250;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.11 * strength, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    src.connect(f).connect(g).connect(this.master!);
    src.start(now, Math.random() * 0.1, 0.12);
  }

  /** Panel pop. */
  pop(): void {
    const c = this.ready();
    if (!c) return;
    this.tone(420, c.currentTime, 0.12, 'sine', 0.16, 820);
  }

  /** Close / whoosh down. */
  close(): void {
    const c = this.ready();
    if (!c) return;
    this.tone(700, c.currentTime, 0.12, 'sine', 0.12, 300);
  }

  /** Boing: bumped into someone. */
  boing(): void {
    const c = this.ready();
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(520, t + 0.08);
    o.frequency.exponentialRampToValueAtTime(240, t + 0.3);
    const lfo = c.createOscillator();
    const lg = c.createGain();
    lfo.frequency.value = 22;
    lg.gain.value = 40;
    lfo.connect(lg).connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(this.master!);
    o.start(t);
    lfo.start(t);
    o.stop(t + 0.4);
    lfo.stop(t + 0.4);
  }

  /** Happy little arpeggio: hired! */
  fanfare(): void {
    const c = this.ready();
    if (!c) return;
    const t = c.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, t + i * 0.09, 0.35, 'triangle', 0.13));
  }

  /** Slurp. */
  slurp(): void {
    const c = this.ready();
    if (!c) return;
    this.tone(300, c.currentTime, 0.35, 'sawtooth', 0.04, 900);
  }
}
