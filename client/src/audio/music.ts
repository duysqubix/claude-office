// The café band's player: a mix (buses, a warm room, tape wow, vinyl), and a lookahead
// scheduler that turns the composer's tunes into timed notes. Nothing here runs per frame:
// the hub calls pump() from a timer a few times a second, and pump() only schedules what
// starts within the lookahead, so a slow frame never makes the music stumble.
import { followUp, type MusicEvent, type Tune } from './composer';
import { roomImpulse, surfaceBuffer } from './fx';
import { bass, brush, epiano, hat, kick, kitFor, rim, shaker, snare, swirl, vibes, type Kit } from './instruments';
import { mix, rng, type Rng } from './rng';

export type Part = 'keys' | 'bass' | 'drums' | 'lead';

export interface MusicOptions {
  /** One seed per visit: tune n of the visit is always the same tune. */
  seed: number;
  /** Which tune of the visit to start with (a restart carries on, it doesn't repeat). */
  firstTune?: number;
  /** Evening in the office? Asked at every new tune, and every few seconds for the level. */
  night: () => boolean;
  crackle?: boolean;
  /** Only these parts (lab renders). */
  parts?: Part[];
  onTune?: (tune: Tune, index: number) => void;
}

interface Queued {
  time: number;
  ev: MusicEvent;
  /** Seconds per beat of its tune. */
  spb: number;
}

const surfaces = new WeakMap<BaseAudioContext, Promise<AudioBuffer>>();
/** One vinyl loop per context (restarts reuse it). */
function surface(ctx: BaseAudioContext, kit: Kit): Promise<AudioBuffer> {
  let b = surfaces.get(ctx);
  if (!b) surfaces.set(ctx, (b = surfaceBuffer(ctx, kit.noise, 7.31, rng(0x5eed))));
  return b;
}

/** The band's overall level into the hub (before the music volume). */
const LEVEL = 1.55;
/** A breath between tunes, in beats. */
const GAP_BEATS = 2;
/** How often the evening level is re-checked (seconds of audio time). */
const NIGHT_CHECK = 10;

export class MusicPlayer {
  /** The band's output: the hub fades and mutes it. */
  readonly output: GainNode;
  private kit: Kit;
  private r: Rng;
  private parts: Set<Part>;
  private bus: Record<Part, GainNode>;
  private room: BiquadFilterNode;
  private evening: GainNode;
  private echo: DelayNode;
  private hatsBus: AudioNode;
  private brushBus: AudioNode;
  private pumpGain: GainNode;
  private level: GainNode;
  /** Between a tune's closing sweep and the next one's opening: the evening leaves the filter be. */
  private closing = false;
  private started = false;
  private startedAt = 0;
  private sources: AudioScheduledSourceNode[] = [];
  private tune: Tune | null = null;
  /** The next tune, written ahead of time in idle moments (so no pump ever composes). */
  private upcoming: Tune | null = null;
  private composing = false;
  private tuneIndex: number;
  private bar = 0;
  /** When the next bar to queue starts (audio time). */
  private barTime = 0;
  private queue: Queued[] = [];
  private running = false;
  private night: boolean;
  private nightCheckedAt = -Infinity;
  /** When the last scheduled sweep of the room filter ends. */
  private sweepEnd = 0;
  /** Main-thread cost and health, for the frame-budget check. */
  readonly stats = { scheduled: 0, dropped: 0, pumps: 0, pumpMs: 0, maxPumpMs: 0, buildMs: 0 };

  constructor(
    readonly ctx: BaseAudioContext,
    private opts: MusicOptions,
  ) {
    const built = performance.now();
    this.r = rng(mix(opts.seed, 0xbeef));
    this.kit = kitFor(ctx, rng(mix(opts.seed, 0xcafe)));
    this.tuneIndex = opts.firstTune ?? 0;
    this.parts = new Set(opts.parts ?? ['keys', 'bass', 'drums', 'lead']);
    this.night = opts.night();
    const c = ctx;
    const gain = (v: number) => {
      const g = c.createGain();
      g.gain.value = v;
      return g;
    };
    const filt = (type: BiquadFilterType, f: number, q = 0.707) => {
      const n = c.createBiquadFilter();
      n.type = type;
      n.frequency.value = f;
      n.Q.value = q;
      return n;
    };
    const lfo = (hz: number, depth: number, param: AudioParam) => {
      const o = c.createOscillator();
      o.frequency.value = hz;
      const g = gain(depth);
      o.connect(g).connect(param);
      this.sources.push(o);
      return o;
    };

    // Everything the band makes meets here at its level, then the hub's fades (output).
    this.output = gain(1);
    const level = gain(LEVEL);
    level.connect(this.output);
    this.level = level;
    this.evening = gain(this.night ? 0.72 : 1);
    const band = gain(1);

    // Keys: the pickups make a little DC (a lopsided curve), so a gentle high-pass; a touch of
    // presence; the suitcase tremolo (a slow stereo sway); and a small dip on every kick.
    const keys = gain(0.75);
    const keysPan = c.createStereoPanner();
    // Once per render quantum is plenty for a 3.4 Hz sway (and far cheaper than every sample).
    keysPan.pan.automationRate = 'k-rate';
    lfo(3.4, 0.28, keysPan.pan);
    const presence = filt('peaking', 1300, 0.8);
    presence.gain.value = 2.5;
    this.pumpGain = gain(1);
    keys.connect(this.pumpGain).connect(filt('highpass', 75)).connect(presence).connect(keysPan).connect(band);

    // Bass: the notes, gently saturated together (harmonics laptop speakers can play), then
    // a fixed low-pass.
    const bassBus = gain(1);
    const warm = c.createWaveShaper();
    warm.curve = this.kit.warm;
    bassBus.connect(warm).connect(filt('lowpass', 900, 0.6)).connect(gain(0.14)).connect(band);

    const drums = gain(1.3);
    drums.connect(filt('lowpass', 5600, 0.6)).connect(band);
    // Hats a touch right, shaker and brushes a touch left: a little width, like a real kit.
    const right = c.createStereoPanner();
    right.pan.value = 0.22;
    const left = c.createStereoPanner();
    left.pan.value = -0.2;
    right.connect(drums);
    left.connect(drums);
    this.hatsBus = right;
    this.brushBus = left;

    // Vibes (each note brings its own motor tremolo) and a soft dotted-8th echo.
    const lead = gain(0.4);
    lead.connect(band);
    this.echo = c.createDelay(2);
    this.echo.delayTime.value = 0.55;
    const echoTone = filt('lowpass', 2400);
    lead.connect(this.echo).connect(echoTone).connect(gain(0.26)).connect(this.echo);
    echoTone.connect(gain(0.32)).connect(band);

    this.bus = { keys, bass: bassBus, drums, lead };

    // The room: a short, warm café tail, rendered off the main thread (until it's ready, a
    // moment under the fade-in, the band plays dry).
    const verb = c.createConvolver();
    verb.normalize = false;
    void roomImpulse(c, 1, 0.9, rng(0x7007)).then((ir) => (verb.buffer = ir));
    const send = gain(0.2);
    band.connect(send).connect(verb);

    // Tape: gentle saturation and a slow wow (a modulated delay bends the pitch a few cents).
    const sat = c.createWaveShaper();
    sat.curve = this.kit.tape;
    const tape = c.createDelay(0.1);
    tape.delayTime.value = 0.02;
    lfo(0.31, 0.0009, tape.delayTime);
    band.connect(sat).connect(tape);
    verb.connect(tape);

    // Then the café's air: the top end rolled off, darker in the evening. Each tune starts
    // muffled and opens up over its intro, and closes again as it ends (queueBar sweeps it).
    this.room = filt('lowpass', this.openHz(), 0.5);
    tape.connect(this.room).connect(this.evening).connect(level);

    // Vinyl: surface hiss and crackle, one loop rendered off the main thread.
    if (opts.crackle !== false) {
      void surface(c, this.kit).then((buf) => {
        if (!this.running && this.started) return;
        const vinyl = c.createBufferSource();
        vinyl.buffer = buf;
        vinyl.loop = true;
        vinyl.connect(gain(0.55)).connect(level);
        this.sources.push(vinyl);
        if (this.started) vinyl.start(Math.max(c.currentTime, this.startedAt));
      });
    }
    this.stats.buildMs = performance.now() - built;
  }

  get playing(): boolean {
    return this.running;
  }

  /** What's on now (lab page, logs). */
  get current(): Tune | null {
    return this.tune;
  }

  start(at: number): void {
    if (this.running) return;
    this.running = true;
    this.started = true;
    this.startedAt = at;
    this.barTime = at;
    for (const s of this.sources) s.start(at);
  }

  /** Stop scheduling; tails ring on under the hub's fade, then everything stops at `at`. */
  stop(at: number): void {
    if (!this.running) return;
    this.running = false;
    this.queue = [];
    for (const s of this.sources) s.stop(at);
    window.setTimeout(() => this.output.disconnect(), Math.max(0, (at - this.ctx.currentTime) * 1000) + 3000);
  }

  /** A loop of café murmur (rendered later, once): mixed in very quietly under the band. */
  addMurmur(buf: AudioBuffer, level: number, at: number): void {
    if (!this.running) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(level, at + 8);
    src.connect(g).connect(this.level);
    src.start(at, this.r() * buf.duration);
    this.sources.push(src);
  }

  /** Play one event right away at `time` (the lab's calibration renders). */
  audition(ev: MusicEvent, time: number, bpm = 80): void {
    this.play({ time, ev, spb: 60 / bpm });
  }

  /** Schedule everything that starts before `until` (audio time). */
  pump(until: number): void {
    if (!this.running) return;
    const t0 = performance.now();
    if (until - this.nightCheckedAt > NIGHT_CHECK) {
      this.nightCheckedAt = until;
      this.setEvening(this.opts.night(), until);
    }
    // Queue bars a beat or so ahead of time: a pushed chord starts before its bar.
    while (this.barTime < until + 2) this.queueBar();
    const late = this.ctx.currentTime - 0.01;
    let n = 0;
    while (n < this.queue.length && this.queue[n].time < until) n++;
    for (const q of this.queue.splice(0, n)) {
      if (q.time < late) {
        this.stats.dropped++;
        continue;
      }
      this.play(q);
      this.stats.scheduled++;
    }
    const ms = performance.now() - t0;
    this.stats.pumps++;
    this.stats.pumpMs += ms;
    this.stats.maxPumpMs = Math.max(this.stats.maxPumpMs, ms);
  }

  /** How far the room filter opens: darker in the evening. */
  private openHz(): number {
    return this.night ? 4200 : 6200;
  }

  private setEvening(night: boolean, at: number): void {
    if (night === this.night) return;
    this.night = night;
    // Ease into the evening over half a minute: quieter and darker.
    this.evening.gain.setTargetAtTime(night ? 0.72 : 1, at, 10);
    if (!this.closing) this.room.frequency.setTargetAtTime(this.openHz(), Math.max(at, this.sweepEnd), 10);
  }

  /** Write the next tune while the current one plays out (evening or not is decided now). */
  private composeAhead(): void {
    if (this.upcoming || this.composing || !this.tune) return;
    this.composing = true;
    const prev = this.tune;
    const index = this.tuneIndex;
    const idle = (window as { requestIdleCallback?: Window['requestIdleCallback'] }).requestIdleCallback;
    const write = () => {
      this.composing = false;
      if (this.tune === prev && this.tuneIndex === index) this.upcoming = followUp(prev, this.opts.seed, index, this.opts.night());
    };
    if (idle) idle(write, { timeout: 4000 });
    else window.setTimeout(write, 0);
  }

  private queueBar(): void {
    if (this.tune && this.bar === this.tune.bars.length - 8) this.composeAhead();
    if (!this.tune || this.bar >= this.tune.bars.length) {
      if (this.tune) this.barTime += (GAP_BEATS * 60) / this.tune.bpm;
      // Evening tunes are slower and softer; the clock decides at each new tune.
      this.tune = this.upcoming ?? followUp(this.tune, this.opts.seed, this.tuneIndex, this.opts.night());
      this.upcoming = null;
      this.opts.onTune?.(this.tune, this.tuneIndex);
      this.tuneIndex++;
      this.bar = 0;
      // The vibes' echo sits on a dotted 8th of the new tempo.
      this.echo.delayTime.setValueAtTime((0.75 * 60) / this.tune.bpm, Math.max(this.barTime - 0.5, this.ctx.currentTime));
    }
    const spb = 60 / this.tune.bpm;
    const f = this.room.frequency;
    const at = Math.max(this.barTime, this.ctx.currentTime);
    if (this.bar === 0) {
      // In from behind a door: muffled, opening over three and a half bars.
      this.closing = false;
      f.setValueAtTime(650, at);
      f.exponentialRampToValueAtTime(this.openHz(), (this.sweepEnd = at + 14 * spb));
    } else if (this.bar === this.tune.bars.length - 2) {
      // The last chord fades into the distance.
      this.closing = true;
      f.setValueAtTime(this.openHz(), at);
      f.exponentialRampToValueAtTime(1100, (this.sweepEnd = at + 8 * spb));
    }
    const bar = this.tune.bars[this.bar++];
    for (const ev of bar.events) this.queue.push({ time: this.barTime + ev.at * spb, ev, spb });
    this.queue.sort((a, b) => a.time - b.time);
    this.barTime += 4 * spb;
  }

  private play({ time, ev, spb }: Queued): void {
    const { kit, r } = this;
    switch (ev.type) {
      case 'keys': {
        if (!this.parts.has('keys')) return;
        const top = ev.notes.length - 1;
        ev.notes.forEach((n, i) => epiano(kit, this.bus.keys, time + i * ev.spread, n, ev.vel * (i === top ? 1.12 : 1), ev.dur * spb - i * ev.spread, r));
        return;
      }
      case 'bass':
        if (this.parts.has('bass')) bass(kit, this.bus.bass, time, ev.note, ev.vel, ev.dur * spb);
        return;
      case 'lead':
        if (this.parts.has('lead')) vibes(kit, this.bus.lead, time, ev.note, ev.vel, ev.dur * spb, r);
        return;
      case 'drum': {
        if (!this.parts.has('drums')) return;
        const out = this.bus.drums;
        switch (ev.hit) {
          case 'kick': {
            const g = this.pumpGain.gain;
            g.setTargetAtTime(1 - 0.16 * ev.vel, time, 0.006);
            g.setTargetAtTime(1, time + 0.04, 0.11);
            return kick(kit, out, time, ev.vel, r);
          }
          case 'snare':
            return snare(kit, out, time, ev.vel, r);
          case 'rim':
            return rim(kit, out, time, ev.vel, r);
          case 'brush':
            return brush(kit, out, time, ev.vel, r);
          case 'swirl':
            return swirl(kit, this.brushBus, time, ev.vel, (ev.dur ?? 1) * spb, r);
          case 'hat':
            return hat(kit, this.hatsBus, time, ev.vel, false, r);
          case 'ohat':
            return hat(kit, this.hatsBus, time, ev.vel, true, r);
          case 'shaker':
            return shaker(kit, this.brushBus, time, ev.vel, r);
        }
      }
    }
  }
}
