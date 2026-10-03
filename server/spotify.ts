// Spotify on the manager's laptop (#28), the office's half: the sign-in (Authorization Code
// with PKCE) and the tokens. shared/spotify.ts lists the calls.
//
// The refresh token never leaves this process and ~/.claude-office/spotify-<port>.json (mode 0600,
// one per office).
// The page asks for short-lived access tokens, for the Web Playback SDK and the Web API, and
// gets a fresh one a minute before the last one runs out. Sign-ins are single-use: each has
// its own random `state` (the CSRF check at /callback) and PKCE verifier, and lapses after
// ten minutes. index.ts has already checked Host, Origin and the JSON-only POST rule.
import { createHash, randomBytes } from 'node:crypto';
import { chmod, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';
import { basename, dirname, join } from 'node:path';
import { SPOTIFY_CLIENT_ID, SPOTIFY_SCOPES, type SpotifyResult } from '../shared/spotify';
import { startPlayerFrame, type PlayerFrame } from './spotify-frame';

const ACCOUNTS = 'https://accounts.spotify.com';
/** A sign-in must come back within this long. */
const STATE_MS = 10 * 60_000;
/** Sign-ins waiting at once: a new one drops the oldest. */
const MAX_PENDING = 4;
/** The page gets a new access token this long before the old one expires. */
const EARLY_MS = 60_000;
/** A token the page says was refused is replaced at most this often. */
const MIN_REFRESH_MS = 30_000;
const TIMEOUT_MS = 10_000;
/** After Spotify's token endpoint fails, nobody asks it again for this long (or as long as it says). */
const BACKOFF_MS = 10_000;
const MAX_BACKOFF_MS = 10 * 60_000;
/** Shutting down, the office waits at most this long for a token being saved. */
const FLUSH_MS = 1000;
/** Longest piece of Spotify's own wording passed on (error descriptions). */
const MAX_TEXT = 200;

interface Saved {
  clientId: string;
  refreshToken?: string;
  accessToken?: string;
  /** Epoch ms. */
  expiresAt?: number;
  scope?: string;
}

interface Pending {
  clientId: string;
  verifier: string;
  at: number;
}

type Grant = { ok: true; access: string; expiresAt: number; refresh?: string; scope?: string } | { ok: false; status: number; code: string; error: string; retryAfter?: number };

export interface SpotifyOptions {
  /** This office's port: Spotify sends you back to http://127.0.0.1:<port>/callback. */
  port: number;
  /** Where the tokens are kept. */
  file: string;
  /** Spotify's accounts service (the checks use a pretend one). */
  accounts?: string;
  fetch?: typeof fetch;
  now?: () => number;
}

export interface SpotifyReply {
  status: number;
  body: SpotifyResult;
}

/** No sign-in any more: Spotify said the refresh token is no good (revoked, or the app was removed), or you signed out. */
class SignedOut extends Error {
  constructor(message = 'Spotify signed you out. Sign in again on your laptop.') {
    super(message);
  }
}
const YOU_SIGNED_OUT = 'You signed out of Spotify on your laptop.';

const b64url = (b: Buffer) => b.toString('base64url');
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const fail = (status: number, error: string, connected?: boolean): SpotifyReply => ({ status, body: { ok: false, error, ...(connected === undefined ? {} : { connected }) } });

export class SpotifyLink {
  readonly redirectUri: string;
  private readonly accounts: string;
  private readonly fetch: typeof fetch;
  private readonly now: () => number;
  private saved: Saved | null = null;
  private loading: Promise<void> | null = null;
  private pending = new Map<string, Pending>();
  private refreshing: Promise<Saved> | null = null;
  /** When the current access token came from Spotify (epoch ms). */
  private issuedAt = 0;
  private writing: Promise<void> = Promise.resolve();
  private frame: PlayerFrame | null = null;
  /** Spotify's token endpoint failed: until then, its answer stands (epoch ms), and what it said. */
  private failedUntil = 0;
  private failure = '';
  /** Sign-outs so far: a refresh that started before one hands out nothing. */
  private signOuts = 0;

  constructor(private readonly opts: SpotifyOptions) {
    this.redirectUri = `http://127.0.0.1:${opts.port}/callback`;
    this.accounts = opts.accounts ?? ACCOUNTS;
    this.fetch = opts.fetch ?? ((...args) => fetch(...args));
    this.now = opts.now ?? Date.now;
  }

  /** The player frame's origin (its own loopback port), once it's listening; null without one. */
  get playerOrigin(): string | null {
    return this.frame?.origin ?? null;
  }

  /**
   * Open the player frame's listener (spotify-frame.ts): the only place Spotify's SDK runs.
   * `office`: the office's own origins, the only pages allowed to frame it.
   */
  async startPlayer(office: string[]): Promise<void> {
    this.frame ??= await startPlayerFrame(office);
  }

  /**
   * Wait (at most `ms` in all) for the sign-in to settle on disk: the office calls this as it
   * shuts down, so a refresh token Spotify just replaced is never lost. That's a token being
   * asked for (it refreshes as soon as the sign-in is read), a refresh still waiting on Spotify,
   * and then the save it makes.
   */
  async flush(ms = FLUSH_MS): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const settled = (async () => {
      await this.loading?.catch(() => {});
      await this.refreshing?.catch(() => {});
      await this.writing.catch(() => {});
    })();
    await Promise.race([settled, new Promise<void>((done) => (timer = setTimeout(done, ms)))]);
    clearTimeout(timer);
  }

  /** POST /api/spotify/<action> with its parsed JSON body. */
  async api(action: string, body: Record<string, unknown>): Promise<SpotifyReply> {
    await this.load();
    switch (action) {
      case 'status':
        return { status: 200, body: { ok: true, connected: !!this.saved?.refreshToken, clientId: this.saved?.clientId ?? null, redirectUri: this.redirectUri, player: this.playerOrigin } };
      case 'login':
        return this.login(body.clientId);
      case 'token':
        return this.token(body.refresh === true);
      case 'logout':
        this.signOuts++;
        await this.forget(this.saved);
        return { status: 200, body: { ok: true } };
    }
    return fail(404, 'Not found');
  }

  /** GET /callback: Spotify sends you back here with a code (or an error) and the sign-in's state. */
  async callback(url: URL, res: ServerResponse): Promise<void> {
    await this.load();
    this.sweep();
    const state = url.searchParams.get('state') ?? '';
    const p = this.pending.get(state);
    // Each sign-in comes back once, whatever happens next.
    this.pending.delete(state);
    if (!p) return page(res, 400, 'That sign-in has run out', 'Go back to the office and press Sign in on your laptop again.');
    const error = url.searchParams.get('error');
    if (error) {
      return error === 'access_denied'
        ? page(res, 400, 'No problem', 'You said no to Spotify, so nothing changed. Sign in from your laptop whenever you like.')
        : page(res, 400, 'Spotify didn’t sign you in', `Spotify said: ${error.slice(0, MAX_TEXT)}. Go back to the office and try again.`);
    }
    const code = url.searchParams.get('code') ?? '';
    if (!code) return page(res, 400, 'Spotify didn’t sign you in', 'Spotify sent no sign-in code. Go back to the office and try again.');
    const g = await this.grant({ grant_type: 'authorization_code', code, redirect_uri: this.redirectUri, client_id: p.clientId, code_verifier: p.verifier });
    if (!g.ok) return page(res, 502, 'Spotify didn’t sign you in', `${g.error}. Go back to the office and try again.`);
    if (!g.refresh) return page(res, 502, 'Spotify didn’t sign you in', 'Spotify sent no refresh token. Go back to the office and try again.');
    // A refresh still running for the old sign-in must not land on top of this one.
    this.refreshing = null;
    this.issuedAt = this.now();
    try {
      await this.save({ clientId: p.clientId, refreshToken: g.refresh, accessToken: g.access, expiresAt: g.expiresAt, scope: g.scope });
    } catch (err) {
      return page(res, 500, 'The office couldn’t keep your sign-in', `${err instanceof Error ? err.message : String(err)}. Sign in again from your laptop.`);
    }
    return page(res, 200, 'Spotify is connected', 'Your laptop is ready. You can close this tab and go back to the office.', true);
  }

  // ---------------------------------------------------------------------------------------

  private login(v: unknown): SpotifyReply {
    const clientId = str(v).trim();
    if (!SPOTIFY_CLIENT_ID.test(clientId)) return fail(400, 'A Client ID is 32 letters and numbers: copy it from your Spotify app’s Settings');
    this.sweep();
    // 64 characters from the PKCE alphabet (43 to 128 allowed), and an unguessable state.
    const verifier = b64url(randomBytes(48));
    const state = b64url(randomBytes(24));
    this.pending.set(state, { clientId, verifier, at: this.now() });
    for (const old of this.pending.keys()) {
      if (this.pending.size <= MAX_PENDING) break;
      this.pending.delete(old);
    }
    const q = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      state,
      scope: SPOTIFY_SCOPES.join(' '),
      code_challenge_method: 'S256',
      code_challenge: b64url(createHash('sha256').update(verifier).digest()),
    });
    return { status: 200, body: { ok: true, url: `${this.accounts}/authorize?${q}` } };
  }

  private async token(force: boolean): Promise<SpotifyReply> {
    const s = this.saved;
    if (!s?.refreshToken) return fail(409, 'Not signed in to Spotify', false);
    const fresh = !!s.accessToken && (s.expiresAt ?? 0) - EARLY_MS > this.now();
    // Refused by Spotify already: a new one, unless this one is brand new (then it's not the token).
    if (fresh && !(force && this.now() - this.issuedAt >= MIN_REFRESH_MS)) return handOut(s);
    // Spotify's token endpoint failed a moment ago: don't ask it again yet. Until then, the token
    // we have while it lasts (it's only near its end), else what Spotify said.
    if (this.now() < this.failedUntil) return this.lasting(s) ?? fail(503, this.failure);
    try {
      return handOut(await this.refresh());
    } catch (err) {
      if (err instanceof SignedOut) return fail(401, err.message, false);
      return this.lasting(s) ?? fail(502, err instanceof Error ? err.message : 'Spotify didn’t answer');
    }
  }

  /** The access token of sign-in `s`, if it's still the current one and hasn't run out. */
  private lasting(s: Saved): SpotifyReply | null {
    return this.saved === s && s.accessToken && (s.expiresAt ?? 0) > this.now() ? handOut(s) : null;
  }

  /** One refresh at a time: Spotify may hand out a new refresh token, and two at once would race for it. */
  private refresh(): Promise<Saved> {
    if (this.refreshing) return this.refreshing;
    const s = this.saved!;
    const signOuts = this.signOuts;
    const run = (async (): Promise<Saved> => {
      const g = await this.grant({ grant_type: 'refresh_token', refresh_token: s.refreshToken!, client_id: s.clientId });
      // You signed out meanwhile: nobody gets a token (and it wasn't Spotify).
      if (this.signOuts !== signOuts) throw new SignedOut(YOU_SIGNED_OUT);
      // Signed in again meanwhile: that sign-in wins.
      if (this.saved !== s) {
        if (this.saved?.accessToken) return this.saved;
        throw new SignedOut();
      }
      if (!g.ok) {
        if (g.code === 'invalid_grant') {
          await this.forget(s);
          throw new SignedOut();
        }
        // Spotify is busy or down: nobody asks it again for a while (as long as it says, if it says).
        this.failedUntil = this.now() + (g.retryAfter ?? BACKOFF_MS);
        this.failure = g.error;
        throw new Error(g.error);
      }
      this.failedUntil = 0;
      this.issuedAt = this.now();
      // A PKCE refresh may come without a new refresh token: then the old one stays good.
      const next: Saved = { ...s, accessToken: g.access, expiresAt: g.expiresAt, refreshToken: g.refresh ?? s.refreshToken, scope: g.scope ?? s.scope };
      await this.save(next);
      // Signed out while it was being saved: that token isn't handed out either.
      if (this.signOuts !== signOuts) throw new SignedOut(YOU_SIGNED_OUT);
      return next;
    })();
    const shared = run.finally(() => {
      if (this.refreshing === shared) this.refreshing = null;
    });
    this.refreshing = shared;
    return shared;
  }

  /** POST Spotify's token endpoint (no client secret: PKCE). */
  private async grant(form: Record<string, string>): Promise<Grant> {
    let r: Response;
    try {
      r = await this.fetch(`${this.accounts}/api/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams(form),
        redirect: 'error',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return { ok: false, status: 0, code: '', error: 'Can’t reach Spotify right now' };
    }
    const j = ((await r.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    if (!r.ok) {
      const said = (str(j.error_description) || str(j.error)).slice(0, MAX_TEXT);
      // How long Spotify asks us to wait (a 429's Retry-After, in seconds), if it says.
      const wait = Number(r.headers.get('retry-after'));
      return {
        ok: false,
        status: r.status,
        code: str(j.error),
        error: said ? `Spotify said: ${said}` : `Spotify said ${r.status}`,
        ...(wait > 0 ? { retryAfter: Math.min(wait * 1000, MAX_BACKOFF_MS) } : {}),
      };
    }
    const access = str(j.access_token);
    const seconds = Number(j.expires_in);
    if (!access || !(seconds > 0)) return { ok: false, status: 502, code: '', error: 'Spotify sent no access token' };
    return { ok: true, access, expiresAt: this.now() + seconds * 1000, refresh: str(j.refresh_token) || undefined, scope: str(j.scope) || undefined };
  }

  /** Drop the tokens of sign-in `s` (if it's still the current one), keeping its Client ID. */
  private async forget(s: Saved | null): Promise<void> {
    if (!s || this.saved !== s) return;
    this.refreshing = null;
    await this.save({ clientId: s.clientId });
  }

  private sweep(): void {
    const now = this.now();
    for (const [state, p] of this.pending) if (now - p.at > STATE_MS) this.pending.delete(state);
  }

  private load(): Promise<void> {
    this.loading ??= (async () => {
      // A save cut short (the office stopped between writing and renaming) left a copy of the tokens behind.
      const dir = dirname(this.opts.file);
      const base = basename(this.opts.file);
      for (const f of await readdir(dir).catch(() => [] as string[])) {
        if (f.startsWith(`${base}.`) && /^\d+\.tmp$/.test(f.slice(base.length + 1))) await rm(join(dir, f), { force: true }).catch(() => {});
      }
      let raw: unknown;
      try {
        raw = JSON.parse(await readFile(this.opts.file, 'utf8'));
      } catch {
        return; // nothing saved yet
      }
      const o = (raw ?? {}) as Record<string, unknown>;
      if (!SPOTIFY_CLIENT_ID.test(str(o.clientId))) return;
      this.saved = {
        clientId: str(o.clientId),
        refreshToken: str(o.refreshToken) || undefined,
        accessToken: str(o.accessToken) || undefined,
        expiresAt: Number(o.expiresAt) || undefined,
        scope: str(o.scope) || undefined,
      };
      // A copy made some other way: owner-only, like the ones written here.
      await chmod(this.opts.file, 0o600).catch(() => {});
    })();
    return this.loading;
  }

  /** Keep `s` (in memory at once; on disk, owner-only, one write at a time). */
  private save(s: Saved): Promise<void> {
    this.saved = s;
    const file = this.opts.file;
    const text = JSON.stringify(s, null, 2) + '\n';
    const write = async () => {
      await mkdir(dirname(file), { recursive: true, mode: 0o700 });
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, text, { mode: 0o600 });
      // writeFile's mode only applies to a new file, under the umask: make sure.
      await chmod(tmp, 0o600);
      await rename(tmp, file);
    };
    this.writing = this.writing.then(write, write);
    return this.writing;
  }
}

// ---------------------------------------------------------------------------------------------
// The page Spotify sends you back to: a little card saying how it went. It may only run the one
// script below (by its hash), which closes the tab when the office opened it.

const CLOSE_JS = 'setTimeout(function(){window.close()},1500)';
const CLOSE_HASH = createHash('sha256').update(CLOSE_JS).digest('base64');

const handOut = (s: Saved): SpotifyReply => ({ status: 200, body: { ok: true, accessToken: s.accessToken!, expiresAt: s.expiresAt! } });

const escHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

function page(res: ServerResponse, status: number, title: string, text: string, close = false): void {
  const good = status === 200;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light">
<title>${escHtml(title)} · Claude Office</title>
<style>
html,body{margin:0;height:100%}
body{display:grid;place-items:center;background:linear-gradient(#5bb8ff,#cfefff);color:#2b2d42;font:400 17px/1.45 ui-rounded,'SF Pro Rounded',system-ui,sans-serif}
main{max-width:380px;margin:24px;padding:28px 32px 26px;border:4px solid #2b2d42;border-radius:28px;background:#fffdf7;box-shadow:inset 0 0 0 3px #f3ebda,0 8px 0 rgba(43,45,66,.25);text-align:center}
i{display:grid;place-items:center;width:64px;height:64px;margin:0 auto 12px;border:4px solid #2b2d42;border-radius:50%;background:${good ? '#1ed760' : '#ffb020'};font:700 34px/1 system-ui,sans-serif;font-style:normal}
h1{margin:0 0 8px;font-size:26px;line-height:1.2}
p{margin:0;color:#5c5f77}
</style></head>
<body><main><i aria-hidden="true">${good ? '&#10003;' : '!'}</i><h1>${escHtml(title)}</h1><p>${escHtml(text)}</p></main>${close ? `<script>${CLOSE_JS}</script>` : ''}</body></html>
`;
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; script-src 'sha256-${CLOSE_HASH}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  });
  res.end(html);
}
