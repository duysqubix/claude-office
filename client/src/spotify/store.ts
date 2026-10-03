// The laptop's Spotify as one state the screen draws (#28): signed in or not, your playlists,
// the one on screen, and what's playing. It also hands the office speakers to Spotify while
// it plays (audio.handOver: the café band fades out, Help says "Playing from Spotify") and
// takes them back when it stops. Problems become a kind message; the band keeps playing.
import type { SpotifyStatus } from '../../../shared/spotify';
import { audio } from '../audio/index';
import { SpotifyError, type PlayerProblem, type PlayerState, type PlayRequest, type Playlist, type SpotifyService, type TrackPage } from './types';

export type Phase = 'loading' | 'offline' | 'setup' | 'waiting' | 'ready';

export interface Notice {
  kind: PlayerProblem | 'refused' | 'offline' | 'other';
  text: string;
}

export interface LaptopState {
  phase: Phase;
  status: SpotifyStatus | null;
  /** Setup (or offline): what went wrong last. */
  setupError: string;
  /** Waiting: Spotify's sign-in page, to open again. */
  signInUrl: string;
  user: string;
  playlists: Playlist[] | null;
  /** The playlist on screen. */
  selected: string | null;
  tracks: TrackPage | null;
  loadingTracks: boolean;
  tracksError: string;
  device: 'off' | 'starting' | 'ready' | 'failed';
  now: PlayerState | null;
  notice: Notice | null;
  /** A play request is on its way. */
  starting: boolean;
}

/** Signing in waits this long for you at Spotify. */
const SIGN_IN_MS = 10 * 60_000;
const POLL_MS = 1500;
/** After pressing play, a paused state this soon after is Spotify loading, not you pausing. */
const START_GRACE_MS = 6000;

export const NOTICES: Record<Notice['kind'], string> = {
  premium: 'Spotify Premium is needed to play music here. Your playlists still show, and the café band keeps playing.',
  auth: 'Spotify didn’t accept the sign-in. Sign out, then sign in again.',
  browser: 'This browser can’t play Spotify here: it needs protected media (DRM) turned on. Chrome, Edge, Firefox and Safari can.',
  playback: 'Spotify couldn’t play that one. Try another song.',
  autoplay: 'Your browser held the music back. Press play once more.',
  refused: 'Spotify won’t let this app in. In your app’s settings on developer.spotify.com, add your Spotify account under User Management (the owner is always allowed).',
  offline: 'Can’t reach Spotify right now. Check your connection.',
  other: 'Something went wrong with Spotify.',
};

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

export class SpotifyStore {
  state: LaptopState = {
    phase: 'loading',
    status: null,
    setupError: '',
    signInUrl: '',
    user: '',
    playlists: null,
    selected: null,
    tracks: null,
    loadingTracks: false,
    tracksError: '',
    device: 'off',
    now: null,
    notice: null,
    starting: false,
  };
  private subs = new Set<() => void>();
  private handBack: (() => void) | null = null;
  private cache = new Map<string, TrackPage>();
  private poll = 0;
  private pollUntil = 0;
  private startingUntil = 0;
  private graceTimer = 0;
  private authRetryAt = -Infinity;
  private waiters: (() => void)[] = [];
  private library = false;
  /** The player can't play for this account or browser (until you sign in again). */
  private broken: 'premium' | 'browser' | null = null;
  /** The Client ID you last tried, for the form until one signs in (the office only keeps one that worked). */
  private tried = '';

  constructor(readonly service: SpotifyService) {
    // Back from signing in (in another tab): look straight away.
    window.addEventListener('focus', () => {
      if (this.state.phase === 'waiting') void this.check();
    });
  }

  subscribe(fn: () => void): () => void {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  /** The playlist on screen. */
  get list(): Playlist | null {
    return this.state.playlists?.find((p) => p.id === this.state.selected) ?? null;
  }

  /** Spotify has the office speakers. */
  get hasSpeakers(): boolean {
    return this.handBack !== null;
  }

  /** For the setup form: the Client ID that signed in last, else the one you last tried. */
  get clientId(): string {
    return this.state.status?.clientId ?? this.tried;
  }

  /** The laptop opened: find out where things stand (once signed in, the library and the player). */
  async wake(): Promise<void> {
    const { phase } = this.state;
    if (phase === 'waiting' || (phase === 'ready' && this.library)) return;
    this.set({ phase: 'loading' });
    try {
      const status = await this.service.status();
      this.set({ status });
      if (status.connected) await this.enter();
      else this.set({ phase: 'setup' });
    } catch (err) {
      this.set({ phase: 'offline', setupError: messageOf(err) });
    }
  }

  /**
   * Sign in with this Client ID. `win`: a window the click opened (popups must open inside the
   * click), sent on to Spotify's sign-in page; null shows a link to it instead.
   */
  async signIn(clientId: string, win: Window | null): Promise<void> {
    this.tried = clientId.trim();
    this.set({ setupError: '' });
    let url: string;
    try {
      url = await this.service.login(clientId.trim());
    } catch (err) {
      win?.close();
      this.set({ setupError: messageOf(err) });
      return;
    }
    if (url && win && !win.closed) win.location.replace(url);
    else win?.close();
    this.set({ phase: 'waiting', signInUrl: url });
    this.pollUntil = Date.now() + SIGN_IN_MS;
    window.clearInterval(this.poll);
    this.poll = window.setInterval(() => void this.check(), POLL_MS);
  }

  cancelSignIn(): void {
    window.clearInterval(this.poll);
    this.set({ phase: 'setup', signInUrl: '' });
  }

  async signOut(): Promise<void> {
    this.giveBack();
    try {
      await this.service.logout();
    } catch (err) {
      this.set({ notice: { kind: 'other', text: `Couldn’t sign out: ${messageOf(err)}` } });
      return;
    }
    this.reset();
    this.library = false;
    await this.wake();
  }

  /** Show playlist `id` (its tracks load the first time). */
  async select(id: string): Promise<void> {
    const list = this.state.playlists?.find((p) => p.id === id);
    if (!list) return;
    const cached = this.cache.get(id) ?? null;
    this.set({ selected: id, tracks: cached, tracksError: '', loadingTracks: !cached && list.listable });
    if (cached || !list.listable) return;
    try {
      const page = await this.service.tracks(list);
      this.cache.set(id, page);
      if (this.state.selected === id) this.set({ tracks: page, loadingTracks: false });
    } catch (err) {
      if (err instanceof SpotifyError && err.kind === 'signedout') return this.signedOut();
      if (this.state.selected !== id) return;
      // Spotify lists the songs only of playlists you own or collaborate on.
      const refused = err instanceof SpotifyError && err.kind === 'refused';
      this.set({ loadingTracks: false, tracksError: refused ? 'Spotify doesn’t list the songs in this one, but it plays. Press Play.' : messageOf(err) });
    }
  }

  /** Play `list`, from its track `index` (call inside the click). */
  async play(list: Playlist, index?: number): Promise<void> {
    this.service.player.activate();
    this.set({ starting: true, notice: null });
    this.take();
    this.grace();
    try {
      let tracks = this.cache.get(list.id)?.tracks ?? [];
      // Liked Songs plays as a list of its songs: get them first.
      if (!list.uri && !tracks.length) {
        const page = await this.service.tracks(list);
        this.cache.set(list.id, page);
        tracks = page.tracks;
      }
      let req: PlayRequest;
      if (list.uri) req = { context: list.uri, ...(index !== undefined && tracks[index] ? { offset: { uri: tracks[index].uri } } : {}) };
      else if (tracks.length) req = { uris: tracks.map((t) => t.uri), offset: { position: Math.max(0, Math.min(index ?? 0, tracks.length - 1)) } };
      else throw new SpotifyError('There’s nothing in Liked Songs yet.', 'other');
      await this.whenReady();
      await this.service.player.play(req);
    } catch (err) {
      this.set({ starting: false });
      this.giveBack();
      this.fail(err);
    }
  }

  /** Play or pause (call inside the click). Nothing playing yet: the playlist on screen. */
  async toggle(): Promise<void> {
    this.service.player.activate();
    const now = this.state.now;
    if (!now?.track) {
      const list = this.list;
      if (list) await this.play(list);
      return;
    }
    if (now.paused) {
      this.take();
      this.grace();
    } else this.startingUntil = 0;
    await this.service.player.toggle().catch((err: unknown) => this.fail(err));
  }

  async next(): Promise<void> {
    await this.service.player.next().catch((err: unknown) => this.fail(err));
  }

  async prev(): Promise<void> {
    await this.service.player.prev().catch((err: unknown) => this.fail(err));
  }

  /** Jump to `fraction` (0–1) of the song. */
  async seek(fraction: number): Promise<void> {
    const now = this.state.now;
    if (!now?.track || !now.durationMs) return;
    await this.service.player.seek(Math.max(0, Math.min(1, fraction)) * now.durationMs).catch((err: unknown) => this.fail(err));
  }

  dismissNotice(): void {
    this.set({ notice: null });
  }

  // ---------------------------------------------------------------------------------------

  private set(patch: Partial<LaptopState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of [...this.subs]) {
      try {
        fn();
      } catch (err) {
        console.error('[spotify] a listener failed', err);
      }
    }
  }

  private reset(): void {
    this.service.player.disconnect();
    this.cache.clear();
    this.broken = null;
    this.set({ user: '', playlists: null, selected: null, tracks: null, tracksError: '', loadingTracks: false, device: 'off', now: null, notice: null, starting: false });
  }

  /** Signed in: the library, and the player in this page. */
  private async enter(): Promise<void> {
    window.clearInterval(this.poll);
    this.set({ phase: 'ready', setupError: '', signInUrl: '' });
    this.connect();
    try {
      const me = await this.service.me();
      const playlists = await this.service.playlists(me);
      this.library = true;
      this.set({ user: me.name, playlists });
      if (!this.state.selected && playlists[0]) void this.select(playlists[0].id);
    } catch (err) {
      this.fail(err);
    }
  }

  /** While signing in: has the office got it yet? */
  private async check(): Promise<void> {
    if (this.state.phase !== 'waiting') return;
    if (Date.now() > this.pollUntil) {
      window.clearInterval(this.poll);
      this.set({ phase: 'setup', setupError: 'That sign-in took a while, so it lapsed. Press Sign in to try again.' });
      return;
    }
    try {
      const status = await this.service.status();
      if (this.state.phase !== 'waiting') return;
      this.set({ status });
      if (status.connected) await this.enter();
    } catch {
      // the office is busy or restarting: the next look will tell
    }
  }

  private connect(): void {
    if (this.state.device === 'starting' || this.state.device === 'ready') return;
    this.set({ device: 'starting' });
    this.service.player
      .connect({
        ready: () => {
          this.set({ device: 'ready' });
          for (const w of this.waiters.splice(0)) w();
        },
        gone: () => this.set({ device: 'starting' }),
        state: (s) => this.onState(s),
        problem: (kind, message) => this.onProblem(kind, message),
      })
      .then(
        (ok) => {
          if (!ok) this.set({ device: 'failed', notice: { kind: 'browser', text: NOTICES.browser } });
        },
        (err: unknown) => this.set({ device: 'failed', notice: { kind: 'offline', text: messageOf(err) } }),
      );
  }

  /** Resolves once the player can take a song (or fails after `ms`). */
  private whenReady(ms = 10_000): Promise<void> {
    if (this.state.device === 'ready') return Promise.resolve();
    if (this.broken) return Promise.reject(new SpotifyError(NOTICES[this.broken], this.broken === 'premium' ? 'premium' : 'other'));
    if (this.state.device === 'off' || this.state.device === 'failed') this.connect();
    return new Promise((resolve, reject) => {
      const t = window.setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== done);
        reject(new SpotifyError('The laptop’s player didn’t start. Try again in a moment.', 'other'));
      }, ms);
      const done = () => {
        window.clearTimeout(t);
        resolve();
      };
      this.waiters.push(done);
    });
  }

  private onState(s: PlayerState | null): void {
    this.set({ now: s, starting: false });
    if (s?.track && !s.paused) {
      this.take();
      return;
    }
    // Paused right after pressing play: that's Spotify loading the song. Look again after.
    if (s?.track && performance.now() < this.startingUntil) return;
    this.giveBack();
  }

  private onProblem(kind: PlayerProblem, message: string): void {
    // A refused token: once a minute, connect again with a fresh one before saying so.
    if (kind === 'auth' && performance.now() - this.authRetryAt > 60_000) {
      this.authRetryAt = performance.now();
      this.service.player.disconnect();
      this.set({ device: 'off' });
      this.connect();
      return;
    }
    if (kind === 'premium' || kind === 'browser') {
      this.broken = kind;
      this.set({ device: 'failed' });
    }
    if (!(this.state.now?.track && !this.state.now.paused)) this.giveBack();
    if (message) console.warn(`[spotify] ${kind}: ${message}`);
    this.set({ starting: false, notice: { kind, text: NOTICES[kind] } });
  }

  private fail(err: unknown): void {
    if (err instanceof SpotifyError) {
      if (err.kind === 'signedout') return this.signedOut();
      if (err.kind === 'premium') return this.onProblem('premium', err.message);
      if (err.kind === 'refused') return this.set({ notice: { kind: 'refused', text: NOTICES.refused } });
      if (err.kind === 'offline') return this.set({ notice: { kind: 'offline', text: err.message || NOTICES.offline } });
    }
    this.set({ notice: { kind: 'other', text: messageOf(err) || NOTICES.other } });
  }

  private signedOut(): void {
    window.clearTimeout(this.graceTimer);
    this.giveBack();
    this.reset();
    this.library = false;
    this.set({ phase: 'setup', setupError: 'Spotify signed you out. Sign in again.' });
    void this.service.status().then((status) => this.set({ status }), () => {});
  }

  /** Pressing play: a paused state in the next few seconds is Spotify loading, not you. */
  private grace(): void {
    this.startingUntil = performance.now() + START_GRACE_MS;
    window.clearTimeout(this.graceTimer);
    this.graceTimer = window.setTimeout(() => {
      const now = this.state.now;
      if (!(now?.track && !now.paused)) {
        this.set({ starting: false });
        this.giveBack();
      }
    }, START_GRACE_MS + 100);
  }

  /** Spotify takes the office speakers: the café band fades out, and Spotify gets the music level. */
  private take(): void {
    if (this.handBack) return;
    this.handBack = audio.handOver({
      name: 'Spotify',
      setLevel: (level) => this.service.player.setVolume(level),
      release: () => {
        // The office wants them back (Music turned off in Help): pause.
        this.handBack = null;
        void this.service.player.pause().catch(() => {});
      },
    });
    // You pressed play, so you want music: with Music switched off, Spotify would be silent.
    if (!audio.prefs.music) audio.setPref('music', true);
  }

  /** The café band gets the speakers back (it fades in); Spotify goes quiet until it has them again. */
  private giveBack(): void {
    const back = this.handBack;
    this.handBack = null;
    back?.();
    this.service.player.setVolume(0);
  }
}
