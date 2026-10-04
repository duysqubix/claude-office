// The real Spotify (#28): the office's sign-in calls (POST /api/spotify/*, server/spotify.ts),
// the Web API with the short-lived access token the office hands out, and the Web Playback SDK,
// which plays in this page. The refresh token never comes here; access tokens stay in memory.
//
// Spotify's rules for new development-mode apps (February 2026): playlists come from
// GET /me/playlists, a playlist's tracks from /playlists/{id}/items (each entry's track is
// `item`), and only for playlists you own or collaborate on; Liked Songs from GET /me/tracks.
import type { SpotifyLogin, SpotifyStatus, SpotifyToken } from '../../../shared/spotify';
import { FramePlayer } from './frame';
import { LIKED, SpotifyError, type PlayerState, type PlayRequest, type Playlist, type SpotifyService, type Track, type TrackPage } from './types';

const API = 'https://api.spotify.com/v1';
/** Cover art comes from these hosts (and the production CSP allows exactly these). */
const IMAGE_HOSTS = new Set(['i.scdn.co', 'mosaic.scdn.co', 'image-cdn-ak.spotifycdn.com', 'image-cdn-fa.spotifycdn.com']);
/** Most tracks a list shows (two pages). */
const MAX_TRACKS = 100;
/** Most playlists listed (four pages). */
const MAX_PLAYLISTS = 200;
/** Longest name kept (Spotify allows long ones; the laptop shows a line). */
const MAX_NAME = 200;
/** A token is fetched again this long before it runs out. */
const EARLY_MS = 30_000;
/** An office call with no answer by now counts as "can't reach the office" (a token may wait on Spotify for 10 s). */
const OFFICE_MS = 15_000;
/** What a 404 from the office means: its server predates these calls (it hasn't restarted since an update). */
export const OUTDATED = 'This office’s server is older than this page. Restart the office (npm start) and press Try again.';

// ---------------------------------------------------------------------------------------------
// The office (sign-in and tokens)

async function office<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`/api/spotify/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      // A browser without AbortSignal.timeout just waits (rather than every call failing).
      signal: AbortSignal.timeout?.(OFFICE_MS),
    });
  } catch {
    throw new SpotifyError('Can’t reach the office', 'offline');
  }
  const j = (await r.json().catch(() => null)) as ({ ok?: boolean; error?: string; connected?: boolean } & T) | null;
  if (r.status === 404) throw new SpotifyError(OUTDATED, 'outdated', 404);
  if (!r.ok || !j?.ok) throw new SpotifyError(j?.error ?? `The office said ${r.status}`, j?.connected === false ? 'signedout' : 'other', r.status);
  return j;
}

/** Access tokens from the office, kept in memory and fetched again a little before they run out. */
class Tokens {
  private token: { value: string; expiresAt: number } | null = null;
  private asking: Promise<string> | null = null;

  /** `refresh`: the last one was refused, so ask for a new one. */
  get(refresh = false): Promise<string> {
    if (!refresh && this.token && this.token.expiresAt - EARLY_MS > Date.now()) return Promise.resolve(this.token.value);
    this.asking ??= office<SpotifyToken>('token', refresh ? { refresh: true } : {})
      .then((t) => {
        this.token = { value: t.accessToken, expiresAt: t.expiresAt };
        return t.accessToken;
      })
      .finally(() => (this.asking = null));
    return this.asking;
  }

  forget(): void {
    this.token = null;
  }
}

// ---------------------------------------------------------------------------------------------
// The Web API

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = (v: unknown, max = MAX_NAME) => (typeof v === 'string' ? v.slice(0, max) : '');

function problem(status: number, j: unknown): SpotifyError {
  const e = ((j as { error?: { message?: unknown; reason?: unknown } } | null)?.error ?? {}) as { message?: unknown; reason?: unknown };
  const said = text(e.message, 160);
  if (status === 403 && e.reason === 'PREMIUM_REQUIRED') return new SpotifyError('Spotify Premium is needed to play music here', 'premium', status);
  if (status === 403) return new SpotifyError(said ? `Spotify said no: ${said}` : 'Spotify said no', 'refused', status);
  if (status === 404) return new SpotifyError(said || 'Spotify couldn’t find that', 'notfound', status);
  if (status === 429) return new SpotifyError('Spotify asked us to slow down. Try again in a moment.', 'busy', status);
  return new SpotifyError(said ? `Spotify said: ${said}` : `Spotify said ${status}`, 'other', status);
}

/** One Web API call. A refused token is replaced once; a short "slow down" is waited out once. */
async function call<T>(tokens: Tokens, path: string, opts: { method?: string; body?: unknown } = {}, again = true): Promise<T | null> {
  const token = await tokens.get();
  let r: Response;
  try {
    r = await fetch(`${API}${path}`, {
      method: opts.method ?? 'GET',
      headers: { Authorization: `Bearer ${token}`, ...(opts.body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new SpotifyError('Can’t reach Spotify right now', 'offline');
  }
  if (r.status === 401 && again) {
    await tokens.get(true);
    return call(tokens, path, opts, false);
  }
  if (r.status === 429 && again) {
    const wait = Number(r.headers.get('Retry-After')) || 1;
    if (wait <= 5) {
      await sleep(wait * 1000);
      return call(tokens, path, opts, false);
    }
  }
  if (r.status === 204 || r.status === 202) return null;
  const j = await r.json().catch(() => null);
  if (!r.ok) throw problem(r.status, j);
  return j as T;
}

/**
 * A cover from a Spotify image list (widest first), only from a Spotify image host. Covers show
 * at up to 96 px (192 on a sharp screen): the smallest of 280 px or more, else the widest.
 */
function cover(images: unknown): string | null {
  if (!Array.isArray(images)) return null;
  const ok = images
    .map((i) => i as { url?: unknown; width?: unknown })
    .filter((i) => {
      try {
        const u = new URL(String(i.url));
        return u.protocol === 'https:' && IMAGE_HOSTS.has(u.hostname);
      } catch {
        return false;
      }
    });
  const sharp = ok.filter((i) => Number(i.width) >= 280).sort((a, b) => Number(a.width) - Number(b.width));
  const pick = sharp[0] ?? ok[0];
  return pick ? String(pick.url) : null;
}

interface ApiTrack {
  type?: string;
  uri?: string;
  name?: string;
  duration_ms?: number;
  is_local?: boolean;
  artists?: { name?: string }[];
  album?: { name?: string; images?: unknown };
}

/** A track you can play from a list (no local files, no podcast episodes). */
function track(t: ApiTrack | null | undefined): Track | null {
  if (!t || (t.type && t.type !== 'track') || t.is_local || typeof t.uri !== 'string' || !t.uri.startsWith('spotify:track:')) return null;
  return trackOf(t);
}

function trackOf(t: ApiTrack): Track {
  return {
    uri: text(t.uri, 100),
    name: text(t.name) || 'Untitled',
    artists: (t.artists ?? []).map((a) => text(a?.name, 80)).filter(Boolean).join(', ').slice(0, MAX_NAME),
    album: text(t.album?.name),
    cover: cover(t.album?.images),
    durationMs: Math.max(0, Number(t.duration_ms) || 0),
  };
}

interface Page<T> {
  items?: T[];
  total?: number;
  next?: string | null;
}

// ---------------------------------------------------------------------------------------------
// Playing: Spotify's Web Playback SDK runs in the player frame (frame.ts), never in this page. A
// song starts with a Web API call from here onto the frame's device; the frame passes on the
// SDK's state, which becomes ours here.

interface SdkState {
  paused?: boolean;
  position?: number;
  duration?: number;
  context?: { uri?: string | null };
  disallows?: { skipping_next?: boolean; skipping_prev?: boolean };
  track_window?: { current_track?: ApiTrack | null };
}

/** Play `what` on `device` (the frame's), making it the active device first if Spotify doesn't know it yet. */
async function playOn(tokens: Tokens, device: string, what: PlayRequest): Promise<void> {
  const body = 'context' in what ? { context_uri: what.context, ...(what.offset ? { offset: what.offset } : {}) } : { uris: what.uris, ...(what.offset ? { offset: what.offset } : {}) };
  const play = () => call(tokens, `/me/player/play?device_id=${encodeURIComponent(device)}`, { method: 'PUT', body });
  try {
    await play();
  } catch (err) {
    if (!(err instanceof SpotifyError && err.kind === 'notfound')) throw err;
    await call(tokens, '/me/player', { method: 'PUT', body: { device_ids: [device], play: false } });
    await play();
  }
}

function stateOf(raw: unknown): PlayerState {
  const s = (raw ?? {}) as SdkState;
  const t = s.track_window?.current_track;
  return {
    // Whatever plays here (a podcast episode too), as it's shown.
    track: t ? trackOf(t) : null,
    paused: !!s.paused,
    positionMs: Math.max(0, Number(s.position) || 0),
    at: performance.now(),
    durationMs: Math.max(0, Number(s.duration || t?.duration_ms) || 0),
    context: typeof s.context?.uri === 'string' && s.context.uri ? s.context.uri.slice(0, 100) : null,
    canNext: !s.disallows?.skipping_next,
    canPrev: !s.disallows?.skipping_prev,
  };
}
// ---------------------------------------------------------------------------------------------

export function createWebSpotify(): SpotifyService {
  const tokens = new Tokens();
  const api = <T>(path: string, opts?: { method?: string; body?: unknown }) => call<T>(tokens, path, opts);
  /** The player frame's origin, as the office last said. */
  let frame: string | null = null;
  const player = new FramePlayer({
    origin: () => frame,
    token: (refresh) => tokens.get(refresh),
    play: (device, what) => playOn(tokens, device, what),
    state: stateOf,
  });
  return {
    demo: false,
    async status() {
      const s = await office<SpotifyStatus>('status');
      frame = s.player;
      return s;
    },
    login: async (clientId) => (await office<SpotifyLogin>('login', { clientId })).url,
    async logout() {
      player.disconnect();
      tokens.forget();
      await office('logout');
    },
    async me() {
      const j = await api<{ id?: string; display_name?: string | null }>('/me');
      return { id: text(j?.id), name: text(j?.display_name) || text(j?.id) || 'you' };
    },
    async playlists(me) {
      const lists: Playlist[] = [];
      let path: string | null = '/me/playlists?limit=50';
      while (path && lists.length < MAX_PLAYLISTS) {
        const page: Page<Record<string, unknown>> | null = await api<Page<Record<string, unknown>>>(path);
        for (const p of page?.items ?? []) {
          const id = text(p?.id, 64);
          const uri = text(p?.uri, 100);
          if (!id || !uri.startsWith('spotify:playlist:')) continue;
          const owner = (p.owner ?? {}) as { id?: string; display_name?: string | null };
          const count = ((p.items ?? p.tracks) as { total?: number } | undefined)?.total;
          lists.push({
            id,
            uri,
            name: text(p.name) || 'Untitled playlist',
            owner: text(owner.display_name) || text(owner.id) || 'someone',
            listable: owner.id === me.id || p.collaborative === true,
            cover: cover(p.images),
            total: Number.isFinite(count) ? Number(count) : null,
          });
        }
        path = page?.next ? page.next.replace(API, '') : null;
        // Only ever follow Spotify's own next pages.
        if (path && !path.startsWith('/me/playlists?')) path = null;
      }
      const liked = await api<Page<unknown>>('/me/tracks?limit=1').catch(() => null);
      return [{ id: LIKED, uri: null, name: 'Liked Songs', owner: 'you', listable: true, cover: null, total: liked?.total ?? null }, ...lists];
    },
    async tracks(list) {
      const tracks: Track[] = [];
      let total = 0;
      for (let offset = 0; offset < MAX_TRACKS; offset += 50) {
        const path = list.id === LIKED ? `/me/tracks?limit=50&offset=${offset}` : `/playlists/${encodeURIComponent(list.id)}/items?limit=50&offset=${offset}`;
        const page = await api<Page<{ item?: ApiTrack; track?: ApiTrack; is_local?: boolean }>>(path);
        total = Number(page?.total) || 0;
        for (const e of page?.items ?? []) {
          // Playlist entries carry the track as `item` (Liked Songs as `track`).
          const t = e?.is_local ? null : track(e?.item ?? e?.track);
          if (t) tracks.push(t);
        }
        if (!page?.next) break;
      }
      return { tracks, total: Math.max(total, tracks.length) } satisfies TrackPage;
    },
    player,
  };
}
