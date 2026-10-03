// Spotify on the manager's laptop (#28): what the laptop works with, and the two places it comes
// from: the real thing (web.ts: the office's sign-in, the Web API and the Web Playback SDK) and
// the demo office's pretend one (mock.ts). store.ts drives either; app.ts and screen.ts show it.
import type { SpotifyStatus } from '../../../shared/spotify';

export interface Track {
  uri: string;
  name: string;
  /** "Artist, Artist". */
  artists: string;
  album: string;
  /** Cover art: a Spotify image host's https URL (a data: URL in the demo), or null. */
  cover: string | null;
  durationMs: number;
}

export interface Playlist {
  /** Spotify's id, or LIKED for Liked Songs. */
  id: string;
  /** What to play it as (a playlist URI); null for Liked Songs, which plays as a list of tracks. */
  uri: string | null;
  name: string;
  /** Whose it is (display name). */
  owner: string;
  /** Yours or collaborative: Spotify shows its tracks. Someone else's: it plays, but has no track list. */
  listable: boolean;
  cover: string | null;
  /** Number of tracks, when known. */
  total: number | null;
}

export const LIKED = 'liked';

export interface TrackPage {
  tracks: Track[];
  /** All of them (the page holds the first 100 at most). */
  total: number;
}

/** What the player in this page is doing. */
export interface PlayerState {
  track: Track | null;
  paused: boolean;
  /** Where it was at `at` (performance.now()). */
  positionMs: number;
  at: number;
  durationMs: number;
  /** The playlist it plays from (its URI), if any. */
  context: string | null;
  canNext: boolean;
  canPrev: boolean;
}

/** What can go wrong with the player itself, from the Web Playback SDK's events. */
export type PlayerProblem = 'premium' | 'auth' | 'browser' | 'playback' | 'autoplay';

export interface PlayerEvents {
  /** There's a device to play on (the SDK said ready). */
  ready(): void;
  /** It went away (offline, or Spotify dropped it). */
  gone(): void;
  /** Playing, paused, a new track; null: nothing plays here any more (moved to another device). */
  state(s: PlayerState | null): void;
  problem(kind: PlayerProblem, message: string): void;
}

/** Play a playlist (from a track in it), or a list of tracks (Liked Songs). */
export type PlayRequest = { context: string; offset?: { uri: string } } | { uris: string[]; offset?: { position: number } };

export interface Player {
  /** Load the player and connect. The events say when it's ready. */
  connect(events: PlayerEvents): Promise<boolean>;
  /** Call inside the click that starts music: lets the browser play it. */
  activate(): void;
  play(what: PlayRequest): Promise<void>;
  pause(): Promise<void>;
  toggle(): Promise<void>;
  next(): Promise<void>;
  prev(): Promise<void>;
  seek(ms: number): Promise<void>;
  /** 0–1: the office's music level (volume, mute, ducking). */
  setVolume(level: number): void;
  disconnect(): void;
}

export interface SpotifyService {
  /** The demo office's pretend Spotify. */
  readonly demo: boolean;
  /** Signed in or not, and the redirect URI for the setup steps. */
  status(): Promise<SpotifyStatus>;
  /** Spotify's sign-in page for this Client ID ('' when there's nothing to open: the demo). */
  login(clientId: string): Promise<string>;
  logout(): Promise<void>;
  me(): Promise<{ id: string; name: string }>;
  /** Liked Songs first, then your playlists. */
  playlists(me: { id: string }): Promise<Playlist[]>;
  tracks(list: Playlist): Promise<TrackPage>;
  readonly player: Player;
}

/** Why something failed, worded for the laptop's screen. `kind` picks how the laptop shows it. */
export type ProblemKind = 'offline' | 'signedout' | 'refused' | 'premium' | 'notfound' | 'busy' | 'other';

export class SpotifyError extends Error {
  constructor(
    message: string,
    readonly kind: ProblemKind = 'other',
    readonly status = 0,
  ) {
    super(message);
  }
}
