// The demo office's pretend Spotify (#28): signed in as you, a few playlists of made-up songs
// with covers drawn here, and a player that keeps time but makes no sound. Nothing leaves the
// page. The ui-check suite (scripts/ui-check/spotify.mjs) runs the laptop against it.
//   ?demo=1                  signed in, ready to play
//   ?demo=1&spotify=new      the first-time setup steps (Sign in pretends to work)
//   ?demo=1&spotify=free     an account without Premium: playlists show, nothing plays
//   ?demo=1&spotify=refused  an app Spotify won't talk to (not on its allowlist)
import { SPOTIFY_CLIENT_ID, type SpotifyStatus } from '../../../shared/spotify';
import { LIKED, SpotifyError, type Player, type PlayerEvents, type PlayerState, type PlayRequest, type Playlist, type SpotifyService, type Track } from './types';

const ARTISTS = ['The Semicolons', 'DJ Null Pointer', 'Lo-Fi Lobster', 'Cache Money', 'Mx. Async', 'The Await Brothers', 'Tabby & the Spaces', 'Rubber Duck Club', 'Kernel Sanders'];
const SONGS = [
  'Pancake Sunrise',
  'Tabs vs Spaces',
  'Merge Conflict Blues',
  'Green Build',
  'Rubber Duck Waltz',
  'Refactor in D Minor',
  'Coffee Break Bossa',
  'Two Spaces After',
  'Ship It Shuffle',
  'Lo-fi for Linting',
  'Night Owl Commit',
  'Off by One',
  'Stand-up at Ten',
  'Cold Brew Cadence',
  'Hello, World',
  'Garden Path',
  'Rainy Window Seat',
  'Sleepy Server',
  'Pull Request Polka',
  'Sunday Deploy',
  'Little Tickets',
  'Cosy Corner',
  'Desk Plant Groove',
  'Long Lunch',
];
const COLOURS = [
  ['#5CC8FF', '#2E5BFF'],
  ['#FFC94A', '#FF7A6B'],
  ['#8FE0C8', '#2A9D8F'],
  ['#FF9DCB', '#B48CFF'],
  ['#6EDC9A', '#1E7F4F'],
  ['#F6B76E', '#C2410C'],
  ['#B48CFF', '#3D2C8D'],
  ['#7FD8FF', '#1B2330'],
];

const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

/** A made-up cover: a gradient square with a few chunky shapes (an SVG data: URL). */
function art(name: string): string {
  const h = hash(name);
  const [a, b] = COLOURS[h % COLOURS.length];
  const shape = (h >>> 3) % 4;
  const ink = '#2B2D42';
  const paper = '#FFFDF7';
  const shapes = [
    `<circle cx="100" cy="92" r="46" fill="${paper}" stroke="${ink}" stroke-width="8"/><circle cx="100" cy="92" r="12" fill="${ink}"/>`,
    `<path d="M20 130 Q60 70 100 130 T180 130" fill="none" stroke="${paper}" stroke-width="16" stroke-linecap="round"/><path d="M20 160 Q60 100 100 160 T180 160" fill="none" stroke="${ink}" stroke-width="10" stroke-linecap="round"/>`,
    `<rect x="46" y="46" width="108" height="108" rx="24" fill="${paper}" stroke="${ink}" stroke-width="8" transform="rotate(${(h % 30) - 15} 100 100)"/>`,
    `<path d="M100 30 L170 150 L30 150 Z" fill="${paper}" stroke="${ink}" stroke-width="8" stroke-linejoin="round"/><circle cx="100" cy="112" r="16" fill="${b}"/>`,
  ][shape];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="200" height="200" fill="url(#g)"/>${shapes}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function songs(seed: number, n: number): Track[] {
  return Array.from({ length: n }, (_, i) => {
    const k = (seed * 7 + i * 5) % SONGS.length;
    const artist = ARTISTS[(seed + i * 3) % ARTISTS.length];
    const album = `${SONGS[(k + 3) % SONGS.length]} EP`;
    return {
      uri: `spotify:track:demo${seed}x${i}`,
      name: SONGS[k],
      artists: i % 5 === 3 ? `${artist}, ${ARTISTS[(seed + i) % ARTISTS.length]}` : artist,
      album,
      cover: art(album),
      durationMs: (128 + ((seed * 31 + i * 47) % 140)) * 1000,
    };
  });
}

interface DemoList {
  list: Playlist;
  tracks: Track[];
}

function library(): DemoList[] {
  const make = (id: string, name: string, owner: string, seed: number, n: number, listable = true): DemoList => {
    const tracks = songs(seed, n);
    return { list: { id, uri: id === LIKED ? null : `spotify:playlist:${id}`, name, owner, listable, cover: id === LIKED ? null : art(name), total: n }, tracks };
  };
  return [
    make(LIKED, 'Liked Songs', 'you', 1, 24),
    make('demolofi', 'Late Night Lo-fi', 'you', 2, 14),
    make('demofocus', 'Deep Focus Desk', 'you', 3, 12),
    make('demoparty', 'Friday Deploy Party', 'you', 4, 16),
    make('demojazz', 'Coffee Shop Jazz', 'Café Radio', 5, 30, false),
    make('demorain', 'Rainy Window', 'you', 6, 9),
  ];
}

/** A player that keeps time: no sound, but next, previous, pause and seek all work. */
class DemoPlayer implements Player {
  private events: PlayerEvents | null = null;
  private queue: Track[] = [];
  private index = 0;
  private context: string | null = null;
  private paused = true;
  private position = 0;
  private since = 0;
  private timer = 0;

  constructor(
    private lookup: (uri: string) => Track[],
    private premium: boolean,
  ) {}

  async connect(events: PlayerEvents): Promise<boolean> {
    this.events = events;
    window.setTimeout(() => {
      if (!this.premium) events.problem('premium', 'This account doesn’t have Spotify Premium');
      else events.ready();
    }, 400);
    return true;
  }

  activate(): void {}

  async play(what: PlayRequest): Promise<void> {
    await wait(250);
    if (!this.premium) throw new SpotifyError('Spotify Premium is needed to play music here', 'premium', 403);
    if ('context' in what) {
      this.queue = this.lookup(what.context);
      this.context = what.context;
      const at = what.offset ? this.queue.findIndex((t) => t.uri === what.offset!.uri) : 0;
      this.index = Math.max(0, at);
    } else {
      this.queue = what.uris.map((u) => this.lookup(u)[0]).filter(Boolean);
      this.context = null;
      this.index = Math.min(what.offset?.position ?? 0, this.queue.length - 1);
    }
    this.start(0);
  }

  async pause(): Promise<void> {
    if (this.paused) return;
    this.position = this.now();
    this.paused = true;
    this.emit();
  }

  async toggle(): Promise<void> {
    if (!this.queue.length) return;
    if (this.paused) this.start(this.position);
    else await this.pause();
  }

  async next(): Promise<void> {
    if (!this.queue.length) return;
    this.index = (this.index + 1) % this.queue.length;
    this.start(0);
  }

  async prev(): Promise<void> {
    if (!this.queue.length) return;
    // Like Spotify: a few seconds in, back to the start of this one.
    if (this.now() < 3000) this.index = (this.index - 1 + this.queue.length) % this.queue.length;
    this.start(0);
  }

  async seek(ms: number): Promise<void> {
    if (!this.queue.length) return;
    this.position = Math.max(0, Math.min(ms, this.queue[this.index].durationMs - 500));
    this.since = performance.now();
    this.emit();
  }

  setVolume(): void {}

  disconnect(): void {
    window.clearTimeout(this.timer);
    this.events = null;
  }

  private now(): number {
    return this.paused ? this.position : this.position + performance.now() - this.since;
  }

  private start(from: number): void {
    this.position = from;
    this.since = performance.now();
    this.paused = false;
    this.emit();
  }

  private emit(): void {
    window.clearTimeout(this.timer);
    const t = this.queue[this.index] ?? null;
    if (!t) return this.events?.state(null);
    const s: PlayerState = { track: t, paused: this.paused, positionMs: this.now(), at: performance.now(), durationMs: t.durationMs, context: this.context, canNext: true, canPrev: true };
    this.events?.state(s);
    // On to the next one when this one ends.
    if (!this.paused) this.timer = window.setTimeout(() => void this.next(), Math.max(50, t.durationMs - this.now()));
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createDemoSpotify(params: URLSearchParams): SpotifyService {
  const mode = params.get('spotify');
  const lists = library();
  let connected = mode !== 'new';
  let clientId: string | null = connected ? '0f0e0d0c0b0a09080706050403020100' : null;
  const lookup = (uri: string): Track[] => {
    const list = lists.find((l) => l.list.uri === uri);
    if (list) return list.tracks;
    for (const l of lists) {
      const t = l.tracks.find((x) => x.uri === uri);
      if (t) return [t];
    }
    return [];
  };
  return {
    demo: true,
    async status(): Promise<SpotifyStatus> {
      await wait(150);
      // No player frame: the demo's player is pretend.
      return { ok: true, connected, clientId, redirectUri: `http://127.0.0.1:${location.port || '4777'}/callback`, player: null };
    },
    async login(id) {
      await wait(200);
      if (!SPOTIFY_CLIENT_ID.test(id.trim())) throw new SpotifyError('A Client ID is 32 letters and numbers: copy it from your Spotify app’s Settings', 'other', 400);
      clientId = id.trim();
      // Pretend you signed in at Spotify a moment later.
      window.setTimeout(() => (connected = true), 1500);
      return '';
    },
    async logout() {
      await wait(150);
      connected = false;
    },
    async me() {
      await wait(150);
      if (mode === 'refused') throw new SpotifyError('Spotify said no: Check settings on developer.spotify.com/dashboard, the user may not be registered.', 'refused', 403);
      return { id: 'you', name: 'You' };
    },
    async playlists() {
      await wait(250);
      return lists.map((l) => ({ ...l.list }));
    },
    async tracks(list) {
      await wait(300);
      const l = lists.find((x) => x.list.id === list.id);
      if (!l) throw new SpotifyError('Spotify couldn’t find that', 'notfound', 404);
      if (!l.list.listable) throw new SpotifyError('Spotify said no: Forbidden', 'refused', 403);
      return { tracks: l.tracks.map((t) => ({ ...t })), total: l.tracks.length };
    },
    player: new DemoPlayer(lookup, mode !== 'free'),
  };
}
