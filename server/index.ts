// Claude Office server: roster over WebSocket, REST for hiring/firing, terminals over /term.
// Binds to 127.0.0.1 only. It can start Claude sessions and type into them, so every
// request must carry our own Host, and browser-originated writes must carry our Origin.
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { createReadStream, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, isAbsolute, join, resolve, sep } from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ViteDevServer } from 'vite';
import type { AnswerRequest, ApiResult, ClientMessage, ServerMessage } from '../shared/protocol';
import { findPastSession, listPastSessions, listProjects } from './archive';
import { AskBroker, type HookPayload } from './asks';
import { HOME, HOST, IS_PROD, PORT, ROOT } from './config';
import { Roster } from './roster';
import { StatsService } from './stats';
import { attachTerminal } from './terminal';
import { run } from './exec';
import { assertDirectory, hire, initTmux, kill, newSessionId, rehire, say } from './tmux';

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
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) return api(req, res, url);
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
      const live = roster.tail(chatter[1]);
      if (live) return sendJson(res, 200, live.chatter.slice(-12));
      const past = await findPastSession(chatter[1]);
      return sendJson(res, 200, past?.digest.chatter.slice(-12) ?? []);
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

  switch (path) {
    case '/api/hire': {
      const cwd = expandHome(typeof body.cwd === 'string' ? body.cwd.trim() : '');
      if (!cwd || !isAbsolute(cwd)) throw new HttpError(400, 'Pick a project folder (absolute path or ~/…)');
      await assertDirectory(cwd).catch((e: Error) => {
        throw new HttpError(400, e.message);
      });
      const prompt = typeof body.prompt === 'string' ? body.prompt.slice(0, MAX_TEXT) : undefined;
      const requested = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
      if (requested && !NAME_OK.test(requested)) throw new HttpError(400, 'Names can use letters, numbers, spaces and . \' - (max 32)');
      if (requested && roster.takenNames().has(requested)) throw new HttpError(409, `Someone called ${requested} already works here`);
      const sessionId = newSessionId();
      const displayName = requested || roster.nameForNewHire(sessionId);
      const { tmuxName } = await hire({ sessionId, cwd, displayName, prompt });
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
      const { tmuxName } = await rehire({ sessionId, cwd: past.digest.cwd, displayName });
      roster.addPendingHire({ sessionId, tmuxName, cwd: past.digest.cwd, displayName });
      return sendJson(res, 200, { ok: true, sessionId } satisfies ApiResult);
    }
    case '/api/fire': {
      const sessionId = uuidFrom(body.sessionId);
      const tmuxName = roster.tmuxNameFor(sessionId);
      if (!tmuxName) throw new HttpError(400, 'Only people hired in the office can be let go from here');
      await kill(tmuxName);
      void roster.tick();
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
      const text = typeof body.text === 'string' ? body.text.slice(0, MAX_TEXT).trim() : '';
      if (!text) throw new HttpError(400, 'Say something');
      const tmuxName = roster.tmuxNameFor(sessionId);
      if (!tmuxName) throw new HttpError(400, 'They work in your own terminal; talk to them there');
      // With a dialog open, the Enter after the paste would pick the dialog's default answer.
      if (roster.find(sessionId)?.state === 'needs-you') throw new HttpError(409, 'They have a question open. Sit at their computer to answer it.');
      await say(tmuxName, text);
      return sendJson(res, 200, { ok: true, sessionId } satisfies ApiResult);
    }
  }
  throw new HttpError(404, 'Not found');
}

function uuidFrom(v: unknown): string {
  if (typeof v !== 'string' || !UUID.test(v)) throw new HttpError(400, 'Bad session id');
  return v.toLowerCase();
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

const rosterSockets = new WebSocketServer({ noServer: true });
const termSockets = new WebSocketServer({ noServer: true });
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
  ws.on('message', (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (msg?.type === 'presence') asks.setPresence(ws, Boolean(msg.visible), Number(msg.lastInputAt));
  });
  ws.on('close', () => asks.dropClient(ws));
  send(ws, { type: 'hello', version: VERSION, home: HOME });
  send(ws, { type: 'roster', employees: roster.employees, now: Date.now() });
  void stats.build(roster.employees, roster).then((s) => send(ws, { type: 'stats', stats: s }));
});

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
  const url = new URL(req.url ?? '/', 'http://localhost');
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
  const tmuxName = UUID.test(id) ? roster.tmuxNameFor(id.toLowerCase()) : undefined;
  termSockets.handleUpgrade(req, socket, head, (ws) => {
    if (!tmuxName) {
      ws.close(1008, 'Not an office session');
      return;
    }
    attachTerminal(ws, tmuxName, Number(url.searchParams.get('cols')), Number(url.searchParams.get('rows')));
  });
});

// ── Start ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const bins = await initTmux();
  if (!bins.tmux) console.warn('[office] tmux not found on PATH: hiring and terminals are disabled');
  if (!bins.claude) console.warn('[office] claude not found on PATH: hiring is disabled (set CLAUDE_BIN)');

  if (!IS_PROD) {
    const { createServer } = await import('vite');
    vite = await createServer({
      configFile: join(ROOT, 'vite.config.ts'),
      server: { middlewareMode: true, ws: { server } },
      appType: 'spa',
    });
  }

  roster.start();
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') console.error(`[office] Port ${PORT} is busy. Is the office already open? Try PORT=4778 npm run dev`);
    else console.error('[office]', err);
    process.exit(1);
  });
  server.listen(PORT, HOST, () => {
    const url = `http://${HOST}:${PORT}`;
    console.log(`\n  Claude Office is open → ${url}  (${IS_PROD ? 'production' : 'dev'})\n`);
    if (process.argv.includes('--open')) void run(process.platform === 'darwin' ? 'open' : 'xdg-open', [url]);
  });
}

function shutdown(): void {
  asks.releaseAll();
  roster.stop();
  clearInterval(heartbeat);
  clearInterval(statsTimer);
  for (const ws of termSockets.clients) ws.close(1001, 'office closing');
  for (const ws of rosterSockets.clients) ws.close(1001, 'office closing');
  void vite?.close();
  server.close();
  setTimeout(() => process.exit(0), 300).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((err) => {
  console.error('[office] failed to start:', err);
  process.exit(1);
});
