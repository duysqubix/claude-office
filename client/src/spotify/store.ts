// The laptop's Spotify as one state the screen draws (#28): signed in or not, your playlists,
// the one on screen, and what's playing. It also hands the office speakers to Spotify while it
// plays (audio.handOver: the café band fades out, Help says "Playing from Spotify"), from the
// moment a song really plays, and takes them back when it stops. Problems become a kind message:
// a song that plays on keeps the speakers, and with nothing playing the café band plays on.
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
  /** Offline: the laptop keeps asking the office again by itself (an older server gets one quiet re-check instead). */
  asking: boolean;
}

/** Signing in waits this long for you at Spotify. */
const SIGN_IN_MS = 10 * 60_000;
const POLL_MS = 1500;
/** After pressing play, a paused state this soon after is Spotify loading, not you pausing. */
const START_GRACE_MS = 6000;
/** Spotify dropped the player (offline, say): this long without it coming back, the song has stopped here. */
const GONE_MS = 4000;
/** "Isn't answering" on screen: the office is asked again after this, then a little later each time, up to the max. */
const RETRY_FIRST_MS = 2000;
const RETRY_MAX_MS = 10_000;

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
/** The office's server is older than this page (it said 404): asking again won't help until it restarts. */
const outdated = (err: unknown) => err instanceof SpotifyError && err.kind === 'outdated';

/** Where the song is now: Spotify's last word, plus the time since if it's playing. */
const positionOf = (now: PlayerState) => Math.max(0, Math.min(now.positionMs + (now.paused ? 0 : performance.now() - now.at), now.durationMs || Infinity));

interface Waiter {
  resolve(): void;
  reject(err: Error): void;
}

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
    asking: false,
  };
  private subs = new Set<() => void>();
  private handBack: (() => void) | null = null;
  private cache = new Map<string, TrackPage>();
  private poll = 0;
  private pollUntil = 0;
  private startingUntil = 0;
  private graceTimer = 0;
  private goneTimer = 0;
  private authRetryAt = -Infinity;
  private waiters: Waiter[] = [];
  /** Which connect is the current one: a slower, older one's answer is ignored. */
  private connectGen = 0;
  /** Which sign-in this is: songs and playlists that answer after a sign-out are dropped. */
  private session = 0;
  /** Which ask of the office ("where do things stand?") is the current one: an older one's answer, good or bad, is dropped. */
  private statusGen = 0;
  /** The laptop app is open (the only time "isn't answering" asks again by itself). */
  private shown = false;
  private retryTimer = 0;
  private retryDelay = RETRY_FIRST_MS;
  /** 404s in a row from an older server: one quick re-check, then it waits for a restart and Try again. */
  private staleAnswers = 0;
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

  /** A song plays here right now. */
  private get playing(): boolean {
    const now = this.state.now;
    return !!now?.track && !now.paused;
  }

  /** For the setup form: the Client ID that signed in last, else the one you last tried. */
  get clientId(): string {
    return this.state.status?.clientId ?? this.tried;
  }

  /** The laptop opened: find out where things stand (once signed in, the library and the player). */
  async wake(): Promise<void> {
    const { phase } = this.state;
    if (phase === 'waiting' || (phase === 'ready' && this.library)) return;
    window.clearTimeout(this.retryTimer);
    const gen = ++this.statusGen;
    // Asking again: "can't reach the office" is old news (a failure says it again).
    this.set({ phase: 'loading', ...(phase === 'offline' ? { setupError: '' } : {}) });
    try {
      const status = await this.service.status();
      // The laptop closed meanwhile (the next open asks again), or opened again and asked anew: old news.
      if (gen !== this.statusGen) return;
      this.set({ status, asking: false });
      if (status.connected) await this.enter();
      else this.set({ phase: 'setup' });
    } catch (err) {
      if (gen !== this.statusGen) return;
      this.set({ phase: 'offline', setupError: messageOf(err) });
      // An older server gets one quiet re-check; anything else, the laptop keeps asking.
      this.staleAnswers = outdated(err) ? 1 : 0;
      this.retrySoon(true);
    }
  }

  /** The laptop app opened or closed. While it's open on "isn't answering", the office is asked again by itself. */
  setShown(shown: boolean): void {
    this.shown = shown;
    if (shown) return this.retrySoon(true);
    // Closed: no more asking, and an answer still on its way starts nothing (the next open asks again).
    this.statusGen++;
    window.clearTimeout(this.retryTimer);
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
    const session = this.session;
    try {
      const page = await this.service.tracks(list);
      // Signed out meanwhile: they're the old account's songs.
      if (session !== this.session) return;
      this.cache.set(id, page);
      if (this.state.selected === id) this.set({ tracks: page, loadingTracks: false });
    } catch (err) {
      if (session !== this.session) return;
      if (err instanceof SpotifyError && err.kind === 'signedout') return this.signedOut();
      if (this.state.selected !== id) return;
      // Spotify lists the songs only of playlists you own or collaborate on.
      const refused = err instanceof SpotifyError && err.kind === 'refused';
      this.set({ loadingTracks: false, tracksError: refused ? 'Spotify doesn’t list the songs in this one, but it plays. Press Play.' : messageOf(err) });
    }
  }

  /**
   * Play `list`, from its track `index` (call inside the click). The speakers stay the café
   * band's until the song really plays (onState takes them then).
   */
  async play(list: Playlist, index?: number): Promise<void> {
    // Spotify can't play here (no Premium, no DRM): say so again, and leave the band be.
    if (this.broken) return this.onProblem(this.broken, '');
    this.service.player.activate();
    this.set({ starting: true, notice: null });
    this.grace();
    const session = this.session;
    try {
      let tracks = this.cache.get(list.id)?.tracks ?? [];
      // Liked Songs plays as a list of its songs: get them first.
      if (!list.uri && !tracks.length) {
        const page = await this.service.tracks(list);
        // Signed out meanwhile: nothing to play, nothing to keep.
        if (session !== this.session) return;
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
      if (session !== this.session) return;
      this.set({ starting: false });
      // The song that was playing (if any) plays on, and keeps the speakers.
      if (!this.playing) this.giveBack();
      this.fail(err);
    }
  }

  /** Play or pause (call inside the click). Nothing playing yet: the playlist on screen. */
  async toggle(): Promise<void> {
    const now = this.state.now;
    if (!now?.track) {
      const list = this.list;
      if (list) await this.play(list);
      return;
    }
    if (now.paused && this.broken) return this.onProblem(this.broken, '');
    this.service.player.activate();
    // Resuming: the speakers come with the playing state. Pausing: the band may have them back at once.
    if (now.paused) this.grace();
    else this.startingUntil = 0;
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

  /** "Isn't answering" on screen: ask again in a moment (2 s, then a little longer each time, up to 10 s). */
  private retrySoon(first = false): void {
    window.clearTimeout(this.retryTimer);
    if (!this.shown || this.state.phase !== 'offline') return;
    if (first) this.retryDelay = RETRY_FIRST_MS;
    const delay = this.retryDelay;
    this.retryDelay = Math.min(RETRY_MAX_MS, Math.round(delay * 1.6));
    this.retryTimer = window.setTimeout(() => void this.askAgain(), delay);
    // An older server gets one quiet re-check: the screen says to restart it, not that it keeps asking.
    const asking = this.staleAnswers === 0;
    if (this.state.asking !== asking) this.set({ asking });
  }

  /** Ask the office again, quietly (no "Opening Spotify…" in between). Answered: on to the setup steps or your library. */
  private async askAgain(): Promise<void> {
    if (!this.shown || this.state.phase !== 'offline') return;
    const gen = ++this.statusGen;
    // Try again asked since (its answer is the newer one), or the laptop closed: this answer, good or bad, is dropped.
    const current = () => gen === this.statusGen && this.state.phase === 'offline';
    let status: SpotifyStatus;
    try {
      status = await this.service.status();
    } catch (err) {
      if (!current()) return;
      this.set({ setupError: messageOf(err) });
      if (outdated(err)) {
        // Checked again and still the older server: no use asking until it restarts (Try again).
        if (++this.staleAnswers >= 2) return this.set({ asking: false });
        return this.retrySoon(true);
      }
      this.staleAnswers = 0;
      this.retrySoon();
      return;
    }
    if (!current()) return;
    this.set({ status, setupError: '', asking: false });
    if (status.connected) await this.enter();
    else this.set({ phase: 'setup' });
  }

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
    // Whatever the last connect, song list or playlist request still says, it's over.
    this.connectGen++;
    this.session++;
    for (const w of this.waiters.splice(0)) w.reject(new SpotifyError('Signed out', 'other'));
    window.clearTimeout(this.goneTimer);
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
    const session = this.session;
    try {
      const me = await this.service.me();
      const playlists = await this.service.playlists(me);
      // Signed out meanwhile: that was the old account's library.
      if (session !== this.session) return;
      this.library = true;
      this.set({ user: me.name, playlists });
      if (!this.state.selected && playlists[0]) void this.select(playlists[0].id);
    } catch (err) {
      if (session === this.session) this.fail(err);
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
    // Only this connect's answers count from now on (an older one may still be on its way).
    const gen = ++this.connectGen;
    const current = () => gen === this.connectGen;
    this.set({ device: 'starting' });
    this.service.player
      .connect({
        ready: () => {
          if (!current()) return;
          window.clearTimeout(this.goneTimer);
          this.set({ device: 'ready' });
          for (const w of this.waiters.splice(0)) w.resolve();
        },
        gone: () => {
          if (current()) this.gone();
        },
        state: (s) => {
          if (current()) this.onState(s);
        },
        problem: (kind, message) => {
          if (current()) this.onProblem(kind, message);
        },
      })
      .then(
        (ok) => {
          if (!current() || ok) return;
          this.set({ device: 'failed', notice: { kind: 'browser', text: NOTICES.browser } });
          for (const w of this.waiters.splice(0)) w.reject(new SpotifyError(NOTICES.browser, 'other'));
        },
        (err: unknown) => {
          if (!current()) return;
          this.set({ device: 'failed', notice: { kind: 'offline', text: messageOf(err) } });
          for (const w of this.waiters.splice(0)) w.reject(new SpotifyError(messageOf(err), 'offline'));
        },
      );
  }

  /** Spotify dropped the player (offline, say). Back soon: carry on; not back: the song stopped here. */
  private gone(): void {
    this.set({ device: 'starting' });
    window.clearTimeout(this.goneTimer);
    this.goneTimer = window.setTimeout(() => {
      if (this.state.device === 'ready') return;
      const now = this.state.now;
      if (now?.track && !now.paused) this.set({ now: { ...now, paused: true, positionMs: positionOf(now), at: performance.now() }, starting: false });
      this.giveBack();
    }, GONE_MS);
  }

  /** Resolves once the player can take a song (or fails after `ms`, or as soon as it can't). */
  private whenReady(ms = 10_000): Promise<void> {
    if (this.state.device === 'ready') return Promise.resolve();
    if (this.broken) return Promise.reject(this.brokenError(this.broken));
    if (this.state.device === 'off' || this.state.device === 'failed') this.connect();
    return new Promise((resolve, reject) => {
      const w: Waiter = {
        resolve: () => {
          window.clearTimeout(t);
          resolve();
        },
        reject: (err) => {
          window.clearTimeout(t);
          reject(err);
        },
      };
      const t = window.setTimeout(() => {
        this.waiters = this.waiters.filter((x) => x !== w);
        reject(new SpotifyError('The laptop’s player didn’t start. Try again in a moment.', 'other'));
      }, ms);
      this.waiters.push(w);
    });
  }

  private brokenError(kind: 'premium' | 'browser'): SpotifyError {
    return new SpotifyError(NOTICES[kind], kind === 'premium' ? 'premium' : 'other');
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
      // The player goes, and the song with it: say so, and the café band has the speakers until a
      // new player plays again (onState takes them back then).
      window.clearTimeout(this.goneTimer);
      this.set({ now: null, starting: false });
      this.giveBack();
      this.service.player.disconnect();
      this.set({ device: 'off' });
      this.connect();
      return;
    }
    if (kind === 'premium' || kind === 'browser') {
      this.broken = kind;
      this.set({ device: 'failed' });
      // Anyone waiting to play hears why now, not after a timeout.
      for (const w of this.waiters.splice(0)) w.reject(this.brokenError(kind));
    }
    if (!this.playing) this.giveBack();
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
      if (this.playing) return;
      this.set({ starting: false });
      this.giveBack();
    }, START_GRACE_MS + 100);
  }

  /**
   * A song plays: Spotify takes the office speakers (the café band fades out) and gets the music
   * level. Help's Music switch is the band's: Spotify plays with it off, and leaves it as it was.
   */
  private take(): void {
    if (this.handBack) return;
    this.handBack = audio.handOver({
      name: 'Spotify',
      setLevel: (level) => this.service.player.setVolume(level),
      release: () => {
        // The office wants them back (Music switched off in Help, or another office tab took the music): pause.
        this.handBack = null;
        void this.service.player.pause().catch(() => {});
      },
    });
  }

  /** The café band gets the speakers back (it fades in); Spotify goes quiet until it has them again. */
  private giveBack(): void {
    const back = this.handBack;
    this.handBack = null;
    back?.();
    this.service.player.setVolume(0);
  }
}
