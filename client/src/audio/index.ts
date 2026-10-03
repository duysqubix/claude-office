// The office's speakers (UX.md §4.5): one AudioContext for every sound, woken by the first
// click or key press; the master mute (M); music and sound-effect volumes saved per browser;
// the café music, which fades in, dips under a focused terminal or chat, gets softer and slower
// after 9 pm, and steps aside when another source takes the speakers (later: Spotify on the
// manager's laptop, #28) or another office tab starts playing.
//
//   audio.arm()                  the office page calls this once (via Sfx); nothing plays before
//   audio.muted / toggleMute()   everything, music and sounds (claude-office:muted)
//   audio.prefs / setPref(k, v)  music on/off, music and effects volume (claude-office:music…)
//   audio.subscribe(fn)          any change: prefs, unlocked, what's playing
//   audio.handOver(source)       an external player takes the music; call the result to hand back
import { limiter, murmurBuffer } from './fx';
import { MusicPlayer } from './music';
import { rng } from './rng';

export interface AudioPrefs {
  muted: boolean;
  /** The café music (Help → Music). */
  music: boolean;
  /** 0–1, the slider's position. */
  musicVolume: number;
  sfxVolume: number;
}

/**
 * Something else playing the office's music: it gets the level the office wants and gives the
 * speakers back by calling the function handOver() returned.
 */
export interface ExternalSource {
  /** Shown in Help ("Playing from Spotify"). */
  readonly name: string;
  /** 0–1: the music volume with mute, Music off and ducking already applied. Called on every change. */
  setLevel(level: number): void;
  /** The office takes the speakers back (Music turned off, or another source took over). */
  release(): void;
}

const KEY: Record<keyof AudioPrefs, string> = {
  muted: 'claude-office:muted',
  music: 'claude-office:music',
  musicVolume: 'claude-office:music-volume',
  sfxVolume: 'claude-office:sfx-volume',
};
const DEFAULTS: AudioPrefs = { muted: false, music: true, musicVolume: 0.55, sfxVolume: 1 };

/** UX.md §4.5: sounds go out at 0.55 before the compressor. */
const SFX_MASTER = 0.55;
/** How far the music dips under a focused terminal or chat. */
const DUCK = 0.55;
const FADE_IN = 5;
/** Lookahead for the music scheduler (more in a hidden tab, whose timers run late). */
const AHEAD = 0.8;
const AHEAD_HIDDEN = 2.5;
const PUMP_MS = 100;
/** Murmur loop level under the band. */
const MURMUR = 0.2;
/** Where focus means "the manager is typing to someone": the music dips. */
const DUCK_SELECTOR = '.term-modal, .co-panel--chat';

/** A slider position as a gain: squared, so the middle of the slider sounds like the middle. */
export const volumeGain = (v: number): number => Math.max(0, Math.min(1, v)) ** 2;

const params = new URLSearchParams(location.search);
/** `?hour=22` pretends it's that hour (as the regulars do). */
const FORCED_HOUR = (() => {
  const h = Number(params.get('hour') ?? NaN);
  return Number.isInteger(h) && h >= 0 && h < 24 ? h : null;
})();
/** The office clock (the HUD's: local time), evening from 9 pm to 5 am. */
export const isEvening = (): boolean => {
  const h = FORCED_HOUR ?? new Date().getHours();
  return h >= 21 || h < 5;
};

function readPrefs(): AudioPrefs {
  const p = { ...DEFAULTS };
  try {
    const s = localStorage;
    if (s.getItem(KEY.muted) !== null) p.muted = s.getItem(KEY.muted) === '1';
    if (s.getItem(KEY.music) !== null) p.music = s.getItem(KEY.music) === '1';
    for (const k of ['musicVolume', 'sfxVolume'] as const) {
      const v = Number(s.getItem(KEY[k]) ?? NaN);
      if (Number.isFinite(v)) p[k] = Math.max(0, Math.min(1, v));
    }
  } catch {
    // storage unavailable: defaults for this visit
  }
  return p;
}

class Speakers {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private meter: AnalyserNode | null = null;
  private p: AudioPrefs = readPrefs();
  /** `?music=0|1`: this visit only (tests, screenshots). */
  private musicParam = params.get('music');
  private armed = false;
  private gestured = false;
  /** When this tab was last clicked or typed in (the newest one keeps the music). */
  private claimAt = 0;
  private player: MusicPlayer | null = null;
  private timer = 0;
  private stopTimer = 0;
  private ducked = false;
  private external: ExternalSource | null = null;
  /** Another office tab has the music; ours waits for a click or key here. */
  private yielded = false;
  private subs = new Set<() => void>();
  private seed = Number(params.get('musicseed')) || (Math.random() * 2 ** 32) >>> 0;
  private nextTune = 0;
  private tuneLabel = '';
  private murmur: AudioBuffer | null = null;
  private murmurStarted = false;
  private channel: BroadcastChannel | null = null;
  private readonly id = Math.random().toString(36).slice(2);

  get prefs(): Readonly<AudioPrefs> {
    return this.p;
  }

  get muted(): boolean {
    return this.p.muted;
  }

  /** The browser lets us make sound: a click or key press happened (muted or not). */
  get unlocked(): boolean {
    return this.gestured;
  }

  /** The café music is playing right now. */
  get playing(): boolean {
    return !!this.player;
  }

  /** What has the speakers: the band (and its current tune), another source, or nothing. */
  get nowPlaying(): { by: 'band' | 'external' | 'none'; label: string } {
    if (this.external) return { by: 'external', label: this.external.name };
    if (this.player) return { by: 'band', label: this.tuneLabel };
    return { by: 'none', label: '' };
  }

  /** The office page turns the speakers on (once). Sound waits for the first gesture. */
  arm(): void {
    if (this.armed) return;
    this.armed = true;
    const wake = (ev: Event) => {
      if (!(ev instanceof KeyboardEvent && ev.repeat)) this.wake();
    };
    // Touch screens only count the end of a tap as a gesture, so pointerup too.
    for (const type of ['pointerdown', 'pointerup', 'keydown']) window.addEventListener(type, wake, { capture: true });
    // Music dips while the manager types into a terminal or chat.
    const focus = () => this.setDucked(!!document.activeElement?.closest(DUCK_SELECTOR));
    document.addEventListener('focusin', focus);
    document.addEventListener('focusout', () => window.setTimeout(focus, 0));
    // Another tab changed a setting: follow it.
    window.addEventListener('storage', (ev) => {
      if (ev.key && Object.values(KEY).includes(ev.key)) this.applyPrefs(readPrefs());
    });
    // One office tab plays music at a time: the one last clicked or typed in.
    try {
      this.channel = new BroadcastChannel('claude-office:speakers');
      this.channel.onmessage = (ev: MessageEvent<{ type: string; id: string; at: number }>) => {
        const m = ev.data;
        if (m?.type !== 'playing' || m.id === this.id) return;
        // The tab clicked or typed in most recently keeps the music.
        if (m.at > this.claimAt || (m.at === this.claimAt && m.id > this.id)) {
          this.yielded = true;
          this.stopMusic(2);
        } else if (this.player) this.claim();
      };
    } catch {
      // no BroadcastChannel: every tab plays
    }
    if (import.meta.env.DEV && params.has('debug')) Object.assign(window, { officeAudio: this });
  }

  subscribe(fn: () => void): () => void {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  toggleMute(): boolean {
    this.setPref('muted', !this.p.muted);
    return this.p.muted;
  }

  setMuted(m: boolean): void {
    this.setPref('muted', m);
  }

  setPref<K extends keyof AudioPrefs>(key: K, value: AudioPrefs[K]): void {
    const next = { ...this.p, [key]: value };
    try {
      const v = next[key];
      localStorage.setItem(KEY[key], typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
    } catch {
      // storage unavailable: this visit only
    }
    // Choosing Music on or off in Help beats ?music= for the rest of the visit.
    if (key === 'music') this.musicParam = null;
    this.applyPrefs(next);
  }

  /** For Sfx: the context and the sound-effects bus, when sound can play right now. */
  sfxOut(): { ctx: AudioContext; out: GainNode } | null {
    if (this.p.muted || !this.ctx || this.ctx.state !== 'running' || !this.sfxBus) return null;
    return { ctx: this.ctx, out: this.sfxBus };
  }

  /**
   * An external player takes the music: the band fades out and the source gets the office's
   * music level from now on. Call the returned function to hand the speakers back.
   */
  handOver(source: ExternalSource): () => void {
    const old = this.external;
    this.external = source;
    if (old && old !== source) old.release();
    this.stopMusic(2);
    this.levels();
    this.emit();
    return () => {
      if (this.external !== source) return;
      this.external = null;
      this.startMusic();
      this.emit();
    };
  }

  /** Debug and tests: what the speakers are doing. */
  state() {
    return {
      context: this.ctx?.state ?? 'none',
      armed: this.armed,
      unlocked: this.unlocked,
      playing: this.playing,
      yielded: this.yielded,
      ducked: this.ducked,
      prefs: { ...this.p },
      musicWanted: this.musicWanted(),
      master: this.master?.gain.value ?? null,
      musicBus: this.musicBus?.gain.value ?? null,
      sfxBus: this.sfxBus?.gain.value ?? null,
      fade: this.player?.output.gain.value ?? null,
      tune: this.tuneLabel,
      murmur: !!this.murmur,
      evening: isEvening(),
      music: this.player ? { ...this.player.stats } : null,
    };
  }

  /** Debug and tests: RMS of what's going out right now, in dBFS (−Infinity when silent). */
  level(): number {
    if (!this.ctx || !this.master) return -Infinity;
    if (!this.meter) {
      this.meter = this.ctx.createAnalyser();
      this.meter.fftSize = 2048;
      this.master.connect(this.meter);
    }
    const d = new Float32Array(this.meter.fftSize);
    this.meter.getFloatTimeDomainData(d);
    let s = 0;
    for (const x of d) s += x * x;
    return 10 * Math.log10(s / d.length);
  }

  // ---------------------------------------------------------------------------------------

  private emit(): void {
    for (const fn of [...this.subs]) {
      try {
        fn();
      } catch (err) {
        console.error('[audio] a listener failed', err);
      }
    }
  }

  /** Music on (Help, or `?music=` for this visit), not muted, not another tab's turn. */
  private musicOn(): boolean {
    const on = this.musicParam === null ? this.p.music : this.musicParam !== '0';
    return on && !this.p.muted && !this.yielded;
  }

  private musicWanted(): boolean {
    return this.musicOn() && !this.external;
  }

  /** A click or key press: the browser now lets us play. */
  private wake(): void {
    if (!this.ensure()) return;
    const first = !this.gestured;
    this.gestured = true;
    // Clicking or typing here takes the music back from another office tab.
    this.claimAt = Date.now();
    this.yielded = false;
    if (first || !this.p.muted) {
      // Unlock inside the gesture (some browsers allow it nowhere else), muted or not: the
      // mute keeps it silent, and puts the context to sleep a moment later.
      this.resume(() => (this.p.muted ? this.sleepSoon() : this.startMusic()));
    }
    if (first) this.emit();
  }

  private resume(then: () => void): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state === 'running') then();
    // Also right after a suspend() that hasn't finished yet: they run in order.
    else ctx.resume().then(then, (err) => console.warn('[audio] could not resume', err));
  }

  /** Muted: the band stops and the context sleeps (no CPU) after a moment, in case of an unmute. */
  private sleepSoon(): void {
    window.clearTimeout(this.stopTimer);
    this.stopTimer = window.setTimeout(() => {
      if (!this.p.muted) return;
      this.stopMusic(0.05);
      if (this.ctx?.state === 'running') this.ctx.suspend().catch(() => {});
    }, 1500);
  }

  private ensure(): boolean {
    if (this.ctx) return true;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return false;
    const ctx = new Ctor();
    this.ctx = ctx;
    const out = limiter(ctx, ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.p.muted ? 0 : 1;
    this.master.connect(out);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.levels(true);
    ctx.addEventListener('statechange', () => this.emit());
    return true;
  }

  private applyPrefs(next: AudioPrefs): void {
    const was = this.p;
    this.p = next;
    if (next.muted !== was.muted) {
      window.clearTimeout(this.stopTimer);
      // Silence at once; the band stops a moment later (unmuting quickly carries on).
      if (next.muted) this.sleepSoon();
      else
        this.resume(() => {
          this.startMusic();
          this.emit();
        });
    }
    this.levels();
    if (this.musicWanted()) this.startMusic();
    else if (!next.muted) this.stopMusic(1.5);
    if (!this.musicWanted() && this.external && (!next.music || this.musicParam === '0')) {
      // Music off: whoever had the speakers stops too.
      const ext = this.external;
      this.external = null;
      ext.release();
    }
    this.emit();
  }

  /** Every gain follows prefs and ducking. */
  private levels(instant = false): void {
    const music = volumeGain(this.p.musicVolume) * (this.ducked ? DUCK : 1);
    this.external?.setLevel(this.musicOn() ? music : 0);
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.musicBus || !this.sfxBus) return;
    const now = ctx.currentTime;
    const set = (g: AudioParam, v: number, tau: number) => {
      if (instant) g.setValueAtTime(v, now);
      else g.setTargetAtTime(v, now, tau);
    };
    // Mute: master to 0 in about 50 ms (UX.md §4.5).
    set(this.master.gain, this.p.muted ? 0 : 1, 0.015);
    set(this.sfxBus.gain, SFX_MASTER * volumeGain(this.p.sfxVolume), 0.03);
    set(this.musicBus.gain, music, this.ducked ? 0.15 : 0.35);
  }

  private setDucked(on: boolean): void {
    if (on === this.ducked) return;
    this.ducked = on;
    this.levels();
  }

  private startMusic(): void {
    const ctx = this.ctx;
    if (this.player || !ctx || ctx.state !== 'running' || !this.musicBus || !this.musicWanted()) return;
    const p = new MusicPlayer(ctx, {
      seed: this.seed,
      firstTune: this.nextTune,
      night: isEvening,
      onTune: (t, i) => {
        this.nextTune = i + 1;
        this.tuneLabel = t.label;
        this.emit();
      },
    });
    const now = ctx.currentTime;
    p.output.gain.setValueAtTime(0, now);
    p.output.gain.linearRampToValueAtTime(1, now + FADE_IN);
    p.output.connect(this.musicBus);
    p.start(now + 0.15);
    this.player = p;
    const pump = () => p.pump(ctx.currentTime + (document.hidden ? AHEAD_HIDDEN : AHEAD));
    pump();
    this.timer = window.setInterval(pump, PUMP_MS);
    this.claim();
    this.addMurmur(p);
    this.emit();
  }

  /** Tell the other office tabs we have the music (they yield if this tab was used more recently). */
  private claim(): void {
    this.channel?.postMessage({ type: 'playing', id: this.id, at: this.claimAt });
  }

  /** Resolves once the speakers are running (after an unmute's resume). */
  ready(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || this.p.muted) return Promise.resolve();
    return ctx.state === 'running' ? Promise.resolve() : ctx.resume().catch(() => {});
  }

  private stopMusic(fade: number): void {
    const p = this.player;
    if (!p || !this.ctx) return;
    this.player = null;
    window.clearInterval(this.timer);
    const now = this.ctx.currentTime;
    const g = p.output.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + fade);
    p.stop(now + fade + 0.05);
    this.emit();
  }

  /** The café murmur is rendered once, a little after the music starts, then looped quietly. */
  private addMurmur(p: MusicPlayer): void {
    const ctx = this.ctx!;
    if (this.murmur) {
      p.addMurmur(this.murmur, MURMUR, ctx.currentTime + 0.2);
      return;
    }
    if (this.murmurStarted) return;
    this.murmurStarted = true;
    // Safari has no requestIdleCallback.
    const idle = (window as { requestIdleCallback?: Window['requestIdleCallback'] }).requestIdleCallback;
    const later = (fn: () => void) => (idle ? idle(fn, { timeout: 8000 }) : window.setTimeout(fn, 3000));
    window.setTimeout(
      () =>
        later(() => {
          void murmurBuffer(ctx.sampleRate, 23, rng(this.seed ^ 0x77))
            .then((buf) => {
              this.murmur = buf;
              if (this.player) this.player.addMurmur(buf, MURMUR, ctx.currentTime + 0.1);
            })
            .catch((err) => console.warn('[audio] no café murmur', err));
        }),
      6000,
    );
  }
}

/** The office's one set of speakers. */
export const audio = new Speakers();
