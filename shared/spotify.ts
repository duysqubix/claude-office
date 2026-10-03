// Spotify on the manager's laptop (#28): what the office server and the page say to each other.
// The office does the sign-in (PKCE) and keeps the refresh token; the page only ever gets
// short-lived access tokens, for its Web API calls and for the Web Playback SDK, which runs in a
// player frame on its own loopback port (server/spotify-frame.ts), never in the office page.
// Both sides import this file; keep it dependency-free.
//
// Every call is a JSON POST to /api/spotify/<action> (same origin, 127.0.0.1 only):
//   status             -> SpotifyStatus
//   login {clientId}   -> SpotifyLogin    (Spotify's sign-in page, with a fresh state and PKCE challenge)
//   token {refresh?}   -> SpotifyToken    (refresh: the last one was refused, get a new one)
//   logout             -> { ok: true }    (forget the tokens; the Client ID stays)
// GET /callback?code&state: Spotify sends you back there after you sign in.

/** Signed in or not, and what the laptop's setup steps need. */
export interface SpotifyStatus {
  ok: true;
  /** The office holds a sign-in (a refresh token). */
  connected: boolean;
  /** The Client ID of the last sign-in that worked (kept after signing out), or null. */
  clientId: string | null;
  /** What to add to the Spotify app's Redirect URIs: http://127.0.0.1:<port>/callback. */
  redirectUri: string;
  /** The player frame's origin (http://127.0.0.1:<its own port>), where the Web Playback SDK runs; null when there's none. */
  player: string | null;
}

export interface SpotifyLogin {
  ok: true;
  /** Spotify's sign-in page to open. */
  url: string;
}

export interface SpotifyToken {
  ok: true;
  accessToken: string;
  /** Epoch ms. The office hands out a new one a minute before this. */
  expiresAt: number;
}

export interface SpotifyFailure {
  ok: false;
  error: string;
  /** false: the office has no usable sign-in any more (sign in again). */
  connected?: boolean;
}

export type SpotifyResult = SpotifyStatus | SpotifyLogin | SpotifyToken | { ok: true } | SpotifyFailure;

/** A Client ID from the Spotify developer dashboard: 32 hex characters. */
export const SPOTIFY_CLIENT_ID = /^[0-9a-f]{32}$/i;

/**
 * What the laptop asks for: playback in the page (the Web Playback SDK needs streaming,
 * user-read-email and user-read-private), starting and steering it, your playlists (yours
 * and collaborative ones) and Liked Songs.
 */
export const SPOTIFY_SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
] as const;
