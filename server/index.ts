// Claude Office server: roster over WebSocket, REST for hiring/firing, terminals over /term.
// Binds to 127.0.0.1 only. It can start Claude sessions and type into them, so every
// request must carry our own Host, and browser-originated writes must carry our Origin.
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { createReadStream, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import { extname, isAbsolute, join, resolve, sep } from 'node:path';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import type { ViteDevServer } from 'vite';
import { HIRE_PERMISSION_MODES, MAX_HOT_DESK } from '../shared/protocol';
import type { AnswerRequest, ApiResult, ClientMessage, HirePermissionMode, ServerMessage } from '../shared/protocol';
import { findPastSession, listPastSessions, listProjects } from './archive';
import { AskBroker, type HookPayload } from './asks';
import { HOME, HOST, IS_PROD, PORT, ROOT, THINK_DIR } from './config';
import { sessionStatus } from './registry';
import { Roster } from './roster';
import { StatsService } from './stats';
import { attachTerminal } from './terminal';
import { run } from './exec';
import { ShellKeeper } from './shells';
import { SpotifyLink } from './spotify';
import { ThoughtService } from './thoughts';
import { AlreadyHere, assertDirectory, closeDesk, ensureDesk, ensureShell, hire, hireTakenElsewhere, initTmux, interrupt, kill, listDesks, NameTaken, newSessionId, pasteSafe, rehire, say } from './tmux';

const VERSION: string = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
const DIST = join(ROOT, 'dist', 'client');
const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const ALLOWED_ORIGINS = new Set([...ALLOWED_HOSTS].map((h) => `http://${h}`));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAME_OK = /^[\p{L}\p{N}][\p{L}\p{N} .'-]{0,31}$/u;
const MAX_BODY = 64 * 1024;
/** Hook payloads carry full tool input (a Write can hold a whole file). */
const MAX_HOOK_BODY = 4 * 1024 * 1024;
const MAX_TEXT = 8000;
/** Biggest terminal message: a paste arrives whole, so this is the biggest paste that gets through. */
const MAX_TERM_MESSAGE = 8 * 1024 * 1024;
/** Most a terminal may send while its shell starts. */
const MAX_TERM_INPUT = 1024 * 1024;
/** Terminals open at once, each a tmux client in a pty: far more than anyone sits at. */
const MAX_TERMINALS = 32;
/**
 * The built game has no inline script and only talks to this server: fetches, and WebSockets
 * to the host it was loaded from. Model textures are blob: URLs that three.js fetches or loads
 * as images; faces and icons are data: SVGs, and the build inlines small font files as data:.
 * Inline styles stay: the UI sets style attributes and xterm.js adds <style> elements.
 * Spotify on the laptop (#28): the page calls the Web API (api.spotify.com) and shows cover art
 * from Spotify's image hosts. Spotify's player SDK never runs here: it plays in a frame on its
 * own loopback port (spotify-frame.ts), the one frame the page may hold (cspProd).
 */
const SPOTIFY_IMAGES = 'https://i.scdn.co https://mosaic.scdn.co https://image-cdn-ak.spotifycdn.com https://image-cdn-fa.spotifycdn.com';
const CSP_PROD = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${SPOTIFY_IMAGES}`,
  "font-src 'self' data:",
  `connect-src 'self' blob: https://api.spotify.com ${[...ALLOWED_HOSTS].map((h) => `ws://${h}`).join(' ')}`,
  "object-src 'none'",
  "base-uri 'none'",
  // The game has no forms that submit anywhere; default-src doesn't cover this one.
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');
/** The production CSP, framing only Spotify's player frame (its exact origin, once it listens). */
const cspProd = () => (spotify.playerOrigin ? `${CSP_PROD}; frame-src ${spotify.playerOrigin}` : CSP_PROD);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

const hostOk = (req: IncomingMessage) => ALLOWED_HOSTS.has(String(req.headers.host ?? '').toLowerCase());
/** Browsers always send Origin on cross-site writes and WebSocket handshakes; local tools may omit it. */
const originOk = (req: IncomingMessage) => req.headers.origin === undefined || ALLOWED_ORIGINS.has(String(req.headers.origin).toLowerCase());
/** The request's URL, or null when its target can't be one (`//a:99999`: `new URL` throws). */
function urlOf(req: IncomingMessage, base: string): URL | null {
  try {
    return new URL(req.url ?? '/', base);
  } catch {
    return null;
  }
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const asks = new AskBroker();
const roster = new Roster(asks);
asks.on('change', () => roster.refresh());
const stats = new StatsService();
const shells = new ShellKeeper();
// Spotify on the manager's laptop (#28): the sign-in, and its tokens in ~/.claude-office (0600).
// One per office, by port (like desks, shells and hires): each signs in at its own redirect URI,
// and one office signing out (or being signed out by Spotify) never touches another's.
const spotify = new SpotifyLink({ port: PORT, file: join(HOME, '.claude-office', `spotify-${PORT}.json`) });
const server = http.createServer((req, res) => {
  handle(req, res).catch((err: unknown) => {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error('[http]', err);
    if (!res.headersSent) sendJson(res, status, { ok: false, error: err instanceof Error ? err.message : 'Server error' } satisfies ApiResult);
    else res.end();
  });
});

let vite: ViteDevServer | null = null;

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!hostOk(req)) throw new HttpError(403, 'Unexpected Host header');
  // Same-origin page loads send no Origin; a foreign one means another site is reading us.
  if (!originOk(req)) throw new HttpError(403, 'Cross-origin request');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  // Nobody may frame the office: an invisible frame over a decoy button could click Allow for
  // you. Production also pins scripts, fetches and sockets to our origin (CSP_PROD).
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', IS_PROD ? cspProd() : "frame-ancestors 'none'");
  const url = urlOf(req, `http://${req.headers.host}`);
  if (!url) throw new HttpError(400, 'Bad request target');
  if (url.pathname.startsWith('/api/')) return api(req, res, url);
  // Spotify sends you back here after you sign in on the laptop; the sign-in's state is checked there.
  if (url.pathname === '/callback' && req.method === 'GET') return spotify.callback(url, res);
  if (vite) {
    vite.middlewares(req, res, () => sendJson(res, 404, { ok: false, error: 'Not found' }));
    return;
  }
  return serveStatic(res, url.pathname);
}

async function api(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const path = url.pathname;
  if (req.method === 'GET') {
    if (path === '/api/roster') return sendJson(res, 200, roster.employees);
    if (path === '/api/stats') return sendJson(res, 200, await stats.build(roster.employees, roster));
    if (path === '/api/projects') return sendJson(res, 200, await listProjects(roster.employees.map((e) => e.cwd)));
    if (path === '/api/archive') return sendJson(res, 200, await listPastSessions(new Set(roster.employees.map((e) => e.sessionId))));
    const chatter = path.match(/^\/api\/session\/([0-9a-f-]{36})\/chatter$/i);
    if (chatter) {
      const n = Math.min(120, Math.max(1, Number(url.searchParams.get('n')) || (url.searchParams.has('after') ? 120 : 12)));
      const after = Number(url.searchParams.get('after'));
      const live = roster.tail(chatter[1]);
      // In the office but not read yet (a hire or call-back starting): nothing, rather than the
      // archive's copy, which is numbered differently and would show up twice once live.
      if (!live && roster.find(chatter[1])) return sendJson(res, 200, []);
      const lines = live ? live.chatter : (await findPastSession(chatter[1]))?.digest.chatter ?? [];
      return sendJson(res, 200, Number.isFinite(after) && url.searchParams.has('after') ? lines.filter((l) => l.seq > after).slice(-n) : lines.slice(-n));
    }
    throw new HttpError(404, 'Not found');
  }

  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
  if (!originOk(req)) throw new HttpError(403, 'Cross-origin request refused');
  if (!String(req.headers['content-type'] ?? '').includes('application/json')) throw new HttpError(415, 'Send JSON');

  if (path === '/api/hook') {
    // From scripts/office-hook.mjs (a local process, never a browser). Long-polls until the
    // manager answers in-game, or returns {output: null} so Claude shows its terminal prompt.
    if (req.headers.origin !== undefined) throw new HttpError(403, 'Hooks only');
    const payload = (await readJson(req, MAX_HOOK_BODY)) as HookPayload;
    const sid = typeof payload.session_id === 'string' ? payload.session_id : '';
    const output = await asks.hold(payload, Boolean(sid && roster.find(sid)), (cancel) => {
      res.on('close', () => {
        if (!res.writableEnded) cancel();
      });
    });
    return sendJson(res, 200, { output });
  }

  const body = await readJson(req);

  // Spotify on the laptop (#28): its own calls, past the same Origin and JSON-only checks.
  if (path.startsWith('/api/spotify/')) {
    const r = await spotify.api(path.slice('/api/spotify/'.length), body);
    return sendJson(res, r.status, r.body);
  }

  switch (path) {
    case '/api/hire': {
      const cwd = expandHome(typeof body.cwd === 'string' ? body.cwd.trim() : '');
      if (!cwd || !isAbsolute(cwd)) throw new HttpError(400, 'Pick a project folder (absolute path or ~/…)');
      await assertDirectory(cwd).catch((e: Error) => {
        throw new HttpError(400, e.message);
      });
      // The roster ignores the thinker's folder, so a hire there would never walk in.
      if (cwd === THINK_DIR || cwd.startsWith(THINK_DIR + '/')) throw new HttpError(400, 'That folder is reserved for the office');
      const prompt = typeof body.prompt === 'string' ? body.prompt.slice(0, MAX_TEXT) : undefined;
      const requested = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
      if (requested && !NAME_OK.test(requested)) throw new HttpError(400, 'Names can use letters, numbers, spaces and . \' - (max 32)');
      if (requested && roster.takenNames().has(requested)) throw new HttpError(409, `Someone called ${requested} already works here`);
      const mode = body.permissionMode;
      if (mode !== undefined && !(HIRE_PERMISSION_MODES as readonly unknown[]).includes(mode)) {
        throw new HttpError(400, `permissionMode must be one of: ${HIRE_PERMISSION_MODES.join(', ')}`);
      }
      const permissionMode = mode as HirePermissionMode | undefined;
      const sessionId = newSessionId();
      const displayName = requested || roster.nameForNewHire(sessionId);
      const { tmuxName } = await hire({ sessionId, cwd, displayName, prompt, permissionMode });
      roster.addPendingHire({ sessionId, tmuxName, cwd, displayName });
      return sendJson(res, 200, { ok: true, sessionId } satisfies ApiResult);
    }
    case '/api/rehire': {
      const sessionId = uuidFrom(body.sessionId);
      if (roster.find(sessionId)) throw new HttpError(409, 'They are already in the office');
      const past = await findPastSession(sessionId);
      if (!past?.digest.cwd) throw new HttpError(404, 'No personnel file for that session');
      await assertDirectory(past.digest.cwd).catch(() => {
        throw new HttpError(410, `Their old desk is gone: ${past.digest.cwd}`);
      });
      const displayName = roster.nameForNewHire(sessionId);
      const { tmuxName } = await rehire({ sessionId, cwd: past.digest.cwd, displayName }).catch((err: unknown) => {
        throw err instanceof NameTaken || err instanceof AlreadyHere ? new HttpError(409, err.message) : err;
      });
      roster.addPendingHire({ sessionId, tmuxName, cwd: past.digest.cwd, displayName });
      return sendJson(res, 200, { ok: true, sessionId } satisfies ApiResult);
    }
    case '/api/fire': {
      const sessionId = uuidFrom(body.sessionId);
      const tmuxName = await hiredHere(sessionId, 'Only people hired in the office can be let go from here');
      await kill(tmuxName);
      void shells.close(sessionId);
      void roster.tick();
      return sendJson(res, 200, { ok: true, sessionId } satisfies ApiResult);
    }
    case '/api/interrupt': {
      const sessionId = uuidFrom(body.sessionId);
      const tmuxName = await hiredHere(sessionId, 'They work in your own terminal; interrupt them there');
      await interrupt(tmuxName);
      return sendJson(res, 200, { ok: true, sessionId } satisfies ApiResult);
    }
    case '/api/adopt': {
      const sessionId = uuidFrom(body.sessionId);
      try {
        roster.requestAdoption(sessionId);
      } catch (err) {
        throw new HttpError(400, err instanceof Error ? err.message : 'Cannot adopt');
      }
      return sendJson(res, 200, { ok: true, sessionId } satisfies ApiResult);
    }
    case '/api/answer': {
      const sessionId = uuidFrom(body.sessionId);
      const result = asks.answer({ ...(body as unknown as AnswerRequest), sessionId });
      if (!result.ok) throw new HttpError(409, result.error);
      return sendJson(res, 200, { ok: true, sessionId } satisfies ApiResult);
    }
    case '/api/say': {
      const sessionId = uuidFrom(body.sessionId);
      const text = typeof body.text === 'string' ? pasteSafe(body.text.slice(0, MAX_TEXT)).trim() : '';
      if (!text) throw new HttpError(400, 'Say something');
      const tmuxName = await hiredHere(sessionId, 'They work in your own terminal; talk to them there');
      // With a question open, the Enter after the paste would answer it, and a permission
      // prompt's first choice is Yes. Claude can ask at any moment, so say() looks right before
      // it pastes and again right before Enter. `asked`: whether a question is what stopped it.
      let asked = false;
      const said = await say(tmuxName, text, async () => (asked = await asking(sessionId)));
      if (said === 'not-pasted') throw new HttpError(409, asked ? 'They have a question open. Sit at their computer to answer it.' : "Their terminal isn't at the prompt. Sit at their computer to see what's on it.");
      if (said === 'draft') throw new HttpError(409, "There's unsent text in their box. Sit at their computer to send or clear it.");
      if (said === 'not-sent') throw new HttpError(409, asked ? 'They asked something just as you spoke: your message is in their box, not sent. Sit at their computer to answer them.' : "Your message didn't show up in their box. Sit at their computer to check it.");
      if (said === 'held') throw new HttpError(409, "Enter didn't send your message: it's still in their box. Sit at their computer to send it.");
      return sendJson(res, 200, { ok: true, sessionId } satisfies ApiResult);
    }
    case '/api/desk/close': {
      const desk = typeof body.desk === 'number' ? deskFrom(String(body.desk)) : null;
      if (desk === null) throw new HttpError(400, `desk must be a whole number 0 to ${MAX_HOT_DESK}`);
      await closeDesk(desk);
      await pushDesks();
      return sendJson(res, 200, { ok: true } satisfies ApiResult);
    }
  }
  throw new HttpError(404, 'Not found');
}

function uuidFrom(v: unknown): string {
  if (typeof v !== 'string' || !UUID.test(v)) throw new HttpError(400, 'Bad session id');
  return v.toLowerCase();
}

/**
 * Has Claude asked something that Enter would answer, as far as the office knows? An in-game ask,
 * the roster (a poll old), or Claude Code's own status read fresh from its registry file. That
 * file can trail the dialog by a few frames, so say() reads the screen as well.
 */
async function asking(sessionId: string): Promise<boolean> {
  const e = roster.find(sessionId);
  if (asks.forSession(sessionId) || e?.state === 'needs-you') return true;
  return !!e?.pid && (await sessionStatus(e.pid, sessionId)) === 'waiting';
}

/** The tmux session of someone this office hired, else 400 `refused`. Its stamp is read again here: the roster's map can be a poll old. */
async function hiredHere(sessionId: string, refused: string): Promise<string> {
  const tmuxName = roster.tmuxNameFor(sessionId);
  if (!tmuxName || (await hireTakenElsewhere(tmuxName))) throw new HttpError(400, refused);
  return tmuxName;
}

/** A hot desk's number from plain digits: a whole number 0 to 99 ("03", "+3", "3.0" and "1e1" are not), else null. */
function deskFrom(v: string | null): number | null {
  if (v === null || !/^(?:0|[1-9][0-9]?)$/.test(v)) return null;
  const desk = Number(v);
  return desk <= MAX_HOT_DESK ? desk : null;
}

function expandHome(p: string): string {
  if (p === '~') return HOME;
  if (p.startsWith('~/')) return join(HOME, p.slice(2));
  return p;
}

function readJson(req: IncomingMessage, max = MAX_BODY): Promise<Record<string, unknown>> {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > max) {
        reject(new HttpError(413, 'Too much'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        resolveBody(v && typeof v === 'object' && !Array.isArray(v) ? v : {});
      } catch {
        reject(new HttpError(400, 'Bad JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

async function serveStatic(res: ServerResponse, pathname: string): Promise<void> {
  let file: string;
  try {
    file = resolve(DIST, '.' + decodeURIComponent(pathname));
  } catch {
    throw new HttpError(400, 'Bad path');
  }
  if (file !== DIST && !file.startsWith(DIST + sep)) throw new HttpError(403, 'Nope');
  let s = await stat(file).catch(() => null);
  if (!s || s.isDirectory()) {
    file = join(DIST, 'index.html');
    s = await stat(file).catch(() => null);
  }
  if (!s) throw new HttpError(404, 'Client not built yet: run `npm run build` (or use `npm run dev`)');
  const isHtml = file.endsWith('.html');
  res.writeHead(200, {
    'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=3600',
  });
  createReadStream(file).pipe(res);
}

// ── WebSockets ────────────────────────────────────────────────────────────────

// A bigger message closes its socket: the game sends small presence JSON on /ws, and keys,
// pastes and resizes on /term.
const rosterSockets = new WebSocketServer({ noServer: true, maxPayload: MAX_BODY });
const termSockets = new WebSocketServer({ noServer: true, maxPayload: MAX_TERM_MESSAGE });
const alive = new WeakMap<WebSocket, boolean>();

const send = (ws: WebSocket, msg: ServerMessage) => {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
};
const broadcast = (msg: ServerMessage) => {
  const data = JSON.stringify(msg);
  for (const ws of rosterSockets.clients) if (ws.readyState === ws.OPEN) ws.send(data);
};

rosterSockets.on('connection', (ws) => {
  alive.set(ws, true);
  ws.on('pong', () => alive.set(ws, true));
  // A malformed frame (bad UTF-8, unmasked) errors the socket; unhandled, it would take the office down.
  ws.on('error', () => ws.terminate());
  ws.on('message', (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (msg?.type === 'presence') {
      asks.setPresence(ws, Boolean(msg.visible), Number(msg.lastInputAt), msg.canAnswer === true);
      viewers.set(ws, { visible: Boolean(msg.visible), lastInputAt: Math.min(Number(msg.lastInputAt) || 0, Date.now()), thoughts: msg.thoughts === true });
    }
  });
  ws.on('close', () => {
    asks.dropClient(ws);
    viewers.delete(ws);
  });
  send(ws, { type: 'hello', version: VERSION, home: HOME });
  // Hot desks before the roster: regulars sit down once the first roster is in, and never at one.
  send(ws, { type: 'desks', open: openDesks });
  send(ws, { type: 'roster', employees: roster.employees, now: Date.now() });
  void stats.build(roster.employees, roster).then((s) => send(ws, { type: 'stats', stats: s }));
});

// Hot desks: which desks have a shell running. Checked when a desk's terminal opens or closes
// (`exit` ends its attach), on Shut down, and every 5 s for a shell closed from outside the
// game; pushed whenever the set changes. One check at a time, so an older one never lands last.
let openDesks: number[] = [];
let deskCheck: Promise<void> = Promise.resolve();
function pushDesks(): Promise<void> {
  deskCheck = deskCheck
    .then(async () => {
      const open = await listDesks();
      if (open.join() === openDesks.join()) return;
      openDesks = open;
      broadcast({ type: 'desks', open });
    })
    .catch((err: unknown) => console.warn('[desks]', err));
  return deskCheck;
}
const deskTimer = setInterval(() => void pushDesks(), 5000);

// Thought bubbles: only while someone is actually looking, with thoughts on, and was around lately.
const viewers = new Map<WebSocket, { visible: boolean; lastInputAt: number; thoughts: boolean }>();
const THOUGHT_AUDIENCE_MS = 10 * 60_000;
const thoughts = new ThoughtService(
  () => roster.employees,
  () => [...viewers.values()].some((v) => v.visible && v.thoughts && Date.now() - v.lastInputAt < THOUGHT_AUDIENCE_MS),
);
thoughts.on('thought', (t) => broadcast({ type: 'thought', ...t }));
thoughts.start();

// Team Room numbers: re-check every 5 s (plan usage is cached inside), broadcast on change.
let lastStats = '';
async function pushStats(): Promise<void> {
  const s = await stats.build(roster.employees, roster);
  const json = JSON.stringify(s);
  if (json === lastStats) return;
  lastStats = json;
  broadcast({ type: 'stats', stats: s });
}
const statsTimer = setInterval(() => void pushStats().catch(() => {}), 5000);
roster.on('change', () => void pushStats().catch(() => {}));
roster.on('change', (employees) => broadcast({ type: 'roster', employees, now: Date.now() }));
roster.on('notice', (notice: ServerMessage) => broadcast(notice));

// Shells close once their employee has left (checked on every roster change and every 5 s,
// starting once the first poll is in, so an empty roster at startup never closes anyone's).
let rosterIn = false;
roster.once('change', () => (rosterIn = true));
roster.on('change', (employees: typeof roster.employees) => void shells.sweep(employees).catch(() => {}));
const shellTimer = setInterval(() => {
  if (rosterIn) void shells.sweep(roster.employees).catch(() => {});
}, 5000);

const heartbeat = setInterval(() => {
  for (const ws of rosterSockets.clients) {
    if (!alive.get(ws)) ws.terminate();
    else {
      alive.set(ws, false);
      ws.ping();
    }
  }
}, 30_000);

server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
  // Nothing catches a throw in this listener: a target no URL can hold is dropped right here.
  const url = urlOf(req, 'http://localhost');
  if (!url) {
    socket.destroy();
    return;
  }
  const ours = url.pathname === '/ws' || url.pathname === '/term';
  if (!ours) {
    if (!vite) socket.destroy(); // in dev, Vite's HMR listener handles its own upgrades
    return;
  }
  if (!hostOk(req) || !originOk(req)) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  if (url.pathname === '/ws') {
    rosterSockets.handleUpgrade(req, socket, head, (ws) => rosterSockets.emit('connection', ws, req));
    return;
  }
  const id = url.searchParams.get('id') ?? '';
  const sessionId = UUID.test(id) ? id.toLowerCase() : '';
  // Their Claude session (hosted only), their shell (anyone in the office), or a hot desk's shell.
  const kind = url.searchParams.get('kind') ?? 'claude';
  const desk = deskFrom(url.searchParams.get('desk'));
  const cols = Number(url.searchParams.get('cols'));
  const rows = Number(url.searchParams.get('rows'));
  termSockets.handleUpgrade(req, socket, head, (ws) => {
    // First thing: a malformed frame must close this socket, never crash the office.
    ws.on('error', () => ws.terminate());
    // Each terminal runs a pty; this socket is already counted.
    if (termSockets.clients.size > MAX_TERMINALS) {
      ws.close(1008, 'Too many terminals open');
      return;
    }
    if (kind === 'claude') {
      const tmuxName = sessionId ? roster.tmuxNameFor(sessionId) : undefined;
      if (!tmuxName) ws.close(1008, 'Not an office session');
      else {
        // Its stamp is read again first: the roster's map can be a poll old.
        const ours = async () => {
          if (await hireTakenElsewhere(tmuxName)) throw new Error('Not an office session');
          return tmuxName;
        };
        openShell(ws, ours, cols, rows, 'No terminal');
      }
      return;
    }
    if (kind === 'desk') {
      if (desk === null) {
        ws.close(1008, `Desks are numbered 0 to ${MAX_HOT_DESK}`);
        return;
      }
      // Sitting down makes the desk hot; `exit` ends the attach, and then it may not be.
      ws.on('close', () => void pushDesks());
      openShell(
        ws,
        async () => {
          const tmuxName = await ensureDesk(desk);
          void pushDesks();
          return tmuxName;
        },
        cols,
        rows,
      );
      return;
    }
    if (kind !== 'shell') {
      ws.close(1008, 'Unknown terminal kind');
      return;
    }
    const who = sessionId ? roster.find(sessionId) : undefined;
    if (!who) {
      ws.close(1008, 'Nobody by that id is in the office');
      return;
    }
    openShell(ws, () => ensureShell(who.sessionId, who.cwd), cols, rows);
  });
});

/**
 * Attach `ws` to the tmux session `start` finds or starts. Starting one takes a moment: keep
 * what the browser sends meanwhile. If `start` fails, the socket closes with `refused: why`.
 */
function openShell(ws: WebSocket, start: () => Promise<string>, cols: number, rows: number, refused = 'No shell'): void {
  const early: [RawData, boolean][] = [];
  let held = 0;
  const hold = (data: RawData, binary: boolean) => {
    held += Array.isArray(data) ? data.reduce((n, b) => n + b.length, 0) : data.byteLength;
    if (held > MAX_TERM_INPUT) ws.close(1009, 'Too much input before the shell started');
    else early.push([data, binary]);
  };
  ws.on('message', hold);
  start()
    .then(
      (tmuxName) => {
        ws.off('message', hold);
        if (ws.readyState !== ws.OPEN) return;
        attachTerminal(ws, tmuxName, cols, rows);
        for (const [data, binary] of early) ws.emit('message', data, binary);
      },
      (err: unknown) => {
        // Close reasons are capped at 123 bytes.
        const why = `${refused}: ${err instanceof Error ? err.message : String(err)}`;
        ws.close(1008, Buffer.from(why).subarray(0, 120).toString());
      },
    )
    // Anything else that fails while attaching closes this terminal, never the office.
    .catch((err: unknown) => {
      console.error('[term]', err);
      ws.close(1011, 'No terminal');
    });
}

// ── Live model catalog (dev) ─────────────────────────────────────────────────
// The Blender artists export GLBs, previews and sidecars; regenerate catalog.json whenever
// any of them changes so the catalog page fills in live without anyone running a script.

const CATALOG_INPUTS = [join(ROOT, 'client', 'public', 'models'), join(ROOT, 'assets', 'catalog'), join(ROOT, 'snaps', 'blender')];
let catalogStamp = '';
let catalogRunning = false;

async function newestMtime(dir: string): Promise<number> {
  let newest = 0;
  for (const f of await readdir(dir).catch(() => [] as string[])) {
    if (!/\.(glb|json|png)$/.test(f) || f === 'catalog.json' || f.startsWith('.')) continue;
    const s = await stat(join(dir, f)).catch(() => null);
    if (s && s.mtimeMs > newest) newest = s.mtimeMs;
  }
  return newest;
}

async function refreshCatalog(): Promise<void> {
  if (catalogRunning) return;
  const stamp = (await Promise.all([...CATALOG_INPUTS.map(newestMtime), stat(join(ROOT, 'docs', 'ASSETS.md')).then((s) => s.mtimeMs, () => 0)])).join(':');
  if (stamp === catalogStamp) return;
  catalogRunning = true;
  const child = spawn(process.execPath, [join(ROOT, 'scripts', 'catalog.mjs')], { cwd: ROOT, stdio: 'ignore' });
  child.on('exit', (code) => {
    catalogRunning = false;
    if (code === 0) catalogStamp = stamp;
  });
  child.on('error', () => (catalogRunning = false));
}
const catalogTimer = IS_PROD ? null : setInterval(() => void refreshCatalog().catch(() => {}), 15_000);

// ── Start ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const bins = await initTmux();
  if (!bins.tmux) console.warn('[office] tmux not found on PATH: hiring and terminals are disabled');
  if (!bins.claude) console.warn('[office] claude not found on PATH: hiring is disabled (set CLAUDE_BIN)');
  // Hot desks left running by the last server are still hot.
  void pushDesks();

  if (!IS_PROD) {
    const { createServer } = await import('vite');
    vite = await createServer({
      configFile: join(ROOT, 'vite.config.ts'),
      server: { middlewareMode: true, ws: { server } },
      appType: 'spa',
    });
  }

  // Spotify's player frame gets a port of its own (#28), before the first page asks for the CSP.
  await spotify.startPlayer([...ALLOWED_ORIGINS]).catch((err: unknown) => console.warn('[spotify] no player frame:', err));
  roster.start();
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') console.error(`[office] Port ${PORT} is busy. Is the office already open? Try PORT=4778 npm run dev`);
    else console.error('[office]', err);
    process.exit(1);
  });
  server.listen(PORT, HOST, () => {
    const url = `http://${HOST}:${PORT}`;
    console.log(`\n  Claude Office is open → ${url}  (${IS_PROD ? 'production' : 'dev'})\n`);
    if (process.argv.includes('--open')) void openBrowser(url);
  });
}

/** Open the office in the user's browser: macOS `open`, Windows' browser from WSL, else xdg-open. */
function openBrowser(url: string): Promise<unknown> {
  if (process.platform === 'darwin') return run('open', [url]);
  // Inside WSL there's usually no Linux browser: hand the address to Windows. wslview ships with
  // most WSL distros; explorer.exe (via interop) opens URLs too but always exits 1, so it's last.
  const wsl = Boolean(process.env.WSL_DISTRO_NAME) || /microsoft/i.test(readVersion());
  if (wsl) return run('wslview', [url]).then((r) => (r.code === 0 ? r : run('explorer.exe', [url])));
  return run('xdg-open', [url]);
}

function readVersion(): string {
  try {
    return readFileSync('/proc/version', 'utf8');
  } catch {
    return '';
  }
}

function shutdown(): void {
  asks.releaseAll();
  thoughts.stop();
  roster.stop();
  clearInterval(heartbeat);
  clearInterval(statsTimer);
  clearInterval(shellTimer);
  clearInterval(deskTimer);
  if (catalogTimer) clearInterval(catalogTimer);
  for (const ws of termSockets.clients) ws.close(1001, 'office closing');
  for (const ws of rosterSockets.clients) ws.close(1001, 'office closing');
  void vite?.close();
  server.close();
  // A Spotify sign-in being saved reaches the disk first (at most a second, #28).
  void spotify.flush().then(() => setTimeout(() => process.exit(0), 300).unref());
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((err) => {
  console.error('[office] failed to start:', err);
  process.exit(1);
});
