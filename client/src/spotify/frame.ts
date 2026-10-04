// The office's side of the Spotify player frame (#28). Spotify's Web Playback SDK runs in a frame
// on its own loopback port (server/spotify-frame.ts and spotify-player/player.js), never in this
// page, and this drives it over postMessage. The frame is made the first time Spotify is turned
// on (the laptop opens while you're signed in); nothing of Spotify's loads before that. It asks
// for access tokens (the office never hands it the refresh token) and sends the player's events
// back. Every message is checked for its origin and source, and goes only to the frame's origin.
// Starting a song is a Web API call from this page, onto the frame's device.
import { SpotifyError, type Player, type PlayerEvents, type PlayerProblem, type PlayerState, type PlayRequest } from './types';

/** How long the frame has to say hello, and to connect (the SDK loads from Spotify first). */
const HELLO_MS = 20_000;
const CONNECT_MS = 30_000;
const COMMAND_MS = 10_000;

const PROBLEMS: Record<string, PlayerProblem> = {
  initialization_error: 'browser',
  authentication_error: 'auth',
  account_error: 'premium',
  playback_error: 'playback',
  autoplay_failed: 'autoplay',
};

export interface FrameOptions {
  /** The frame's origin, from the office's status; null when the office has no player frame. */
  origin(): string | null;
  /** A short-lived access token from the office (`refresh`: Spotify refused the last one). */
  token(refresh: boolean): Promise<string>;
  /** Start `what` on the frame's device (a Web API call from this page). */
  play(device: string, what: PlayRequest): Promise<void>;
  /** The SDK's state, as the frame passed it on, made into ours (names cut to size, covers checked). */
  state(raw: unknown): PlayerState;
}

interface Waiting {
  resolve(ok: boolean): void;
  reject(err: Error): void;
  timer: number;
}

export class FramePlayer implements Player {
  private frame: HTMLIFrameElement | null = null;
  private origin = '';
  private events: PlayerEvents | null = null;
  private device: string | null = null;
  private serial = 0;
  private waiting = new Map<number, Waiting>();
  private hello: Promise<void> | null = null;
  private greeted: (() => void) | null = null;
  private readonly onMessage = (ev: MessageEvent) => this.receive(ev);

  constructor(private opts: FrameOptions) {}

  async connect(events: PlayerEvents): Promise<boolean> {
    this.events = events;
    await this.open();
    return this.request({ t: 'connect', name: 'Claude Office' }, CONNECT_MS);
  }

  activate(): void {
    // Only a hint for the browser's autoplay rules: no frame or no answer is fine.
    void this.command('activate').catch(() => {});
  }

  play(what: PlayRequest): Promise<void> {
    if (!this.device) return Promise.reject(new SpotifyError('The laptop’s player isn’t ready yet. Give it a second.', 'busy'));
    return this.opts.play(this.device, what);
  }

  pause = () => this.command('pause');
  toggle = () => this.command('toggle');
  next = () => this.command('next');
  prev = () => this.command('prev');
  seek = (ms: number) => this.command('seek', ms);

  setVolume(level: number): void {
    void this.command('volume', Math.max(0, Math.min(1, level))).catch(() => {});
  }

  disconnect(): void {
    const frame = this.frame;
    if (!frame) return;
    this.post({ t: 'cmd', id: ++this.serial, cmd: 'disconnect' });
    window.removeEventListener('message', this.onMessage);
    for (const w of this.waiting.values()) {
      window.clearTimeout(w.timer);
      w.reject(new SpotifyError('The player was turned off', 'other'));
    }
    this.waiting.clear();
    this.frame = null;
    this.hello = null;
    this.greeted = null;
    this.device = null;
    // A moment for the frame to tell Spotify it's going, then it goes.
    window.setTimeout(() => frame.remove(), 300);
  }

  // ---------------------------------------------------------------------------------------

  /** Make the frame (once), and wait for it to say hello. */
  private open(): Promise<void> {
    if (this.hello) return this.hello;
    const origin = this.opts.origin();
    if (!origin) return Promise.reject(new SpotifyError('The office has no Spotify player. Restart the office and try again.', 'other'));
    this.origin = origin;
    window.addEventListener('message', this.onMessage);
    const f = document.createElement('iframe');
    f.className = 'sp-player-frame';
    f.title = 'Spotify player';
    // DRM playback and sound; scripts and its own origin, and nothing else (no popups, forms or
    // navigating the office). It's another origin, so same-origin can't reach the office.
    f.allow = 'encrypted-media; autoplay';
    f.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    f.tabIndex = -1;
    f.setAttribute('aria-hidden', 'true');
    // Who we are (the frame checks it against the office's own list, then talks only to us).
    f.src = `${origin}/player#${encodeURIComponent(location.origin)}`;
    this.frame = f;
    const hello = new Promise<void>((resolve, reject) => {
      const t = window.setTimeout(() => reject(new SpotifyError('Spotify’s player didn’t start. Check your connection, or an ad blocker.', 'offline')), HELLO_MS);
      this.greeted = () => {
        window.clearTimeout(t);
        resolve();
      };
    });
    this.hello = hello;
    hello.catch(() => {
      if (this.hello === hello) this.disconnect();
    });
    document.body.append(f);
    return hello;
  }

  private post(msg: Record<string, unknown>): void {
    this.frame?.contentWindow?.postMessage(msg, this.origin);
  }

  private request(msg: Record<string, unknown>, ms = COMMAND_MS): Promise<boolean> {
    if (!this.frame) return Promise.resolve(false);
    const id = ++this.serial;
    return new Promise<boolean>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.waiting.delete(id);
        reject(new SpotifyError('Spotify’s player didn’t answer', 'offline'));
      }, ms);
      this.waiting.set(id, { resolve, reject, timer });
      this.post({ ...msg, id });
    });
  }

  private async command(cmd: string, arg?: number): Promise<void> {
    if (!this.frame) return;
    await this.request({ t: 'cmd', cmd, ...(arg === undefined ? {} : { arg }) });
  }

  private receive(ev: MessageEvent): void {
    // The frame, and only the frame.
    if (!this.frame || ev.source !== this.frame.contentWindow || ev.origin !== this.origin) return;
    const m = ev.data as { t?: unknown; id?: unknown; ok?: unknown; error?: unknown; refresh?: unknown; name?: unknown; data?: unknown } | null;
    if (!m || typeof m !== 'object' || typeof m.t !== 'string') return;
    switch (m.t) {
      case 'hello':
        this.greeted?.();
        return;
      case 'token?': {
        const id = Number(m.id);
        this.opts.token(m.refresh === true).then(
          (token) => this.post({ t: 'token', id, token }),
          (err: unknown) => this.post({ t: 'token', id, error: err instanceof Error ? err.message : 'No token' }),
        );
        return;
      }
      case 'done': {
        const w = this.waiting.get(Number(m.id));
        if (!w) return;
        this.waiting.delete(Number(m.id));
        window.clearTimeout(w.timer);
        if (m.ok === true) w.resolve(true);
        else if (typeof m.error === 'string' && m.error) w.reject(new SpotifyError(m.error.slice(0, 200), 'other'));
        else w.resolve(false);
        return;
      }
      case 'event':
        this.event(String(m.name), m.data);
    }
  }

  private event(name: string, data: unknown): void {
    const d = (data ?? {}) as { device_id?: unknown; message?: unknown; directive?: unknown; blocked?: unknown };
    const message = typeof d.message === 'string' ? d.message.slice(0, 200) : '';
    if (name === 'ready' && typeof d.device_id === 'string' && d.device_id) {
      this.device = d.device_id.slice(0, 100);
      this.events?.ready();
    } else if (name === 'not_ready') {
      this.device = null;
      this.events?.gone();
    } else if (name === 'state') this.events?.state(data ? this.opts.state(data) : null);
    else if (name === 'sdk_error') {
      // The connect waiting on the SDK won't happen.
      for (const [id, w] of this.waiting) {
        window.clearTimeout(w.timer);
        this.waiting.delete(id);
        w.reject(new SpotifyError('Spotify’s player didn’t load. Check your connection, or an ad blocker.', 'offline'));
      }
      // And this frame never will: the next connect makes a fresh one, which loads the SDK again.
      this.disconnect();
    } else if (name === 'csp') console.warn('[spotify] the player frame’s CSP blocked', String(d.directive).slice(0, 60), String(d.blocked).slice(0, 200));
    else if (PROBLEMS[name] && Object.hasOwn(PROBLEMS, name)) this.events?.problem(PROBLEMS[name], message);
  }
}
