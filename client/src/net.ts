// Talking to the office server: the /ws roster feed (with reconnect + backoff), REST
// helpers for every endpoint, and the /term bridge. demo.ts implements the same Backend.
import type {
  AnswerRequest,
  ApiResult,
  ChatLine,
  ClientMessage,
  Employee,
  PastSession,
  ProjectInfo,
  ServerMessage,
  TeamStats,
  TermClientMessage,
} from '../../shared/protocol';

/**
 * Which of their terminals: their Claude session (hosted only), or their shell (anyone). Or a
 * hot desk's: your own shell at an empty desk, where the terminal's id is the desk number.
 */
export type TermKind = 'claude' | 'shell' | 'desk';

export interface TermLink {
  send(msg: TermClientMessage): void;
  close(): void;
  onOpen: (() => void) | null;
  onData: ((data: string | Uint8Array) => void) | null;
  /** 1000 'detached' = the session ended or was let go; 1008 = not an office session; anything else = dropped. */
  onClose: ((code: number, reason: string) => void) | null;
}

export interface Backend {
  readonly demo: boolean;
  onRoster: ((employees: Employee[], serverNow: number) => void) | null;
  onHello: ((home: string, version: string) => void) | null;
  /** Server-side events worth a toast (e.g. a new hire that crashed on startup). */
  onNotice: ((level: 'info' | 'warn', text: string) => void) | null;
  /** Team Room numbers (plan limits, team totals, context fill), every ~15 s and on connect. */
  onStats: ((stats: TeamStats) => void) | null;
  /** online=false comes with the time of the next reconnect attempt. */
  onStatus: ((online: boolean, retryAt: number) => void) | null;
  /** A session thought something: one short line from the server (see ui/thoughts.ts). */
  onThought?: ((sessionId: string, text: string, at: number) => void) | null;
  /** Thought bubbles on/off. Goes out with presence, so the server only thinks while someone wants it. */
  setThoughts?(on: boolean): void;
  /** Hot desks: the desks with a shell running, on connect and whenever that changes. */
  onDesks: ((open: number[]) => void) | null;
  start(): void;
  roster(): Promise<Employee[]>;
  projects(): Promise<ProjectInfo[]>;
  archive(): Promise<PastSession[]>;
  chatter(sessionId: string): Promise<ChatLine[]>;
  hire(cwd: string, prompt?: string, name?: string): Promise<ApiResult>;
  rehire(sessionId: string): Promise<ApiResult>;
  fire(sessionId: string): Promise<ApiResult>;
  /** Give someone a name of your own (empty: back to their usual one). */
  rename(sessionId: string, name: string): Promise<ApiResult>;
  say(sessionId: string, text: string): Promise<ApiResult>;
  /** Answer an open Ask in-game. */
  answer(req: AnswerRequest): Promise<ApiResult>;
  /**
   * Their Claude session (default), or their shell: a login shell in their folder, opened on
   * demand. Kind 'desk': `id` is a desk number, and the shell is yours, in your home folder.
   */
  terminal(id: string, cols: number, rows: number, kind?: TermKind): TermLink;
  /** Shut down the shell at a hot desk (fine if it has none). */
  closeDesk(desk: number): Promise<ApiResult>;
}

const wsBase = () => `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;

async function errorOf(r: Response): Promise<string> {
  try {
    const body = (await r.json()) as { error?: string };
    if (body?.error) return body.error;
  } catch {
    // not JSON
  }
  return `HTTP ${r.status}`;
}

export async function getJSON<T>(path: string): Promise<T> {
  const r = await fetch(path, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(await errorOf(r));
  return (await r.json()) as T;
}

/** POST JSON to an ApiResult endpoint. Never throws: failures come back as { ok: false }. */
export async function postApi(path: string, body: unknown): Promise<ApiResult> {
  try {
    const r = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) return { ok: false, error: await errorOf(r) };
    return (await r.json()) as ApiResult;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function createBackend(): Backend {
  let attempt = 0;
  let ws: WebSocket | null = null;
  let timer = 0;

  const backend: Backend = {
    demo: false,
    onRoster: null,
    onHello: null,
    onNotice: null,
    onStats: null,
    onStatus: null,
    onThought: null,
    onDesks: null,
    setThoughts(on) {
      wantThoughts = on;
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(presence()));
    },
    start() {
      connect();
      watchPresence(() => ws, (msg) => {
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
      });
      window.addEventListener('online', () => {
        if (!ws || ws.readyState === WebSocket.CLOSED) {
          clearTimeout(timer);
          connect();
        }
      });
    },
    roster: () => getJSON<Employee[]>('/api/roster'),
    projects: () => getJSON<ProjectInfo[]>('/api/projects'),
    archive: () => getJSON<PastSession[]>('/api/archive'),
    chatter: (id) => getJSON<ChatLine[]>(`/api/session/${encodeURIComponent(id)}/chatter`),
    hire: (cwd, prompt, name) => postApi('/api/hire', { cwd, ...(prompt ? { prompt } : {}), ...(name ? { name: name.slice(0, 32) } : {}) }),
    rehire: (sessionId) => postApi('/api/rehire', { sessionId }),
    fire: (sessionId) => postApi('/api/fire', { sessionId }),
    rename: (sessionId, name) => postApi('/api/rename', { sessionId, name }),
    say: (sessionId, text) => postApi('/api/say', { sessionId, text }),
    answer: (req) => postApi('/api/answer', req),
    closeDesk: (desk) => postApi('/api/desk/close', { desk }),
    terminal(id, cols, rows, kind = 'claude') {
      const q = new URLSearchParams({ ...(kind === 'desk' ? { desk: id } : { id }), kind, cols: String(cols), rows: String(rows) });
      const sock = new WebSocket(`${wsBase()}/term?${q}`);
      sock.binaryType = 'arraybuffer';
      const link: TermLink = {
        onOpen: null,
        onData: null,
        onClose: null,
        send(msg) {
          if (sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify(msg));
        },
        close() {
          sock.close(1000, 'stood up');
        },
      };
      sock.onopen = () => link.onOpen?.();
      sock.onmessage = (ev) => link.onData?.(typeof ev.data === 'string' ? ev.data : new Uint8Array(ev.data as ArrayBuffer));
      sock.onclose = (ev) => link.onClose?.(ev.code, ev.reason);
      return link;
    },
  };

  function connect(): void {
    const sock = new WebSocket(`${wsBase()}/ws`);
    ws = sock;
    // A server that never answers the upgrade would leave us "connecting" forever.
    const giveUp = window.setTimeout(() => {
      if (sock.readyState === WebSocket.CONNECTING) sock.close();
    }, 4000);
    sock.onopen = () => {
      window.clearTimeout(giveUp);
      attempt = 0;
      backend.onStatus?.(true, 0);
      sock.send(JSON.stringify(presence()));
    };
    sock.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(ev.data)) as ServerMessage;
      } catch {
        return;
      }
      if (msg.type === 'hello') backend.onHello?.(msg.home, msg.version);
      else if (msg.type === 'roster') backend.onRoster?.(msg.employees, msg.now);
      else if (msg.type === 'notice') backend.onNotice?.(msg.level, msg.text);
      else if (msg.type === 'stats') backend.onStats?.(msg.stats);
      else if (msg.type === 'thought') backend.onThought?.(msg.sessionId, msg.text, msg.at);
      else if (msg.type === 'desks') backend.onDesks?.(msg.open);
    };
    sock.onclose = () => {
      window.clearTimeout(giveUp);
      if (ws !== sock) return;
      const delay = Math.min(8000, 600 * 2 ** attempt);
      attempt = Math.min(attempt + 1, 6);
      backend.onStatus?.(false, Date.now() + delay);
      clearTimeout(timer);
      timer = window.setTimeout(connect, delay);
    };
    sock.onerror = () => sock.close();
  }

  return backend;
}

// Presence: lets the office know someone is actually looking (tab visible, recent input).
// 0 until a real key/pointer/wheel event: a page that was just opened (or a headless
// screenshot) must not count as a manager, or real sessions' prompts would wait on it.
let lastInputAt = 0;
let wantThoughts = false;
const presence = (): ClientMessage => ({
  type: 'presence',
  visible: document.visibilityState === 'visible',
  lastInputAt,
  canAnswer: true,
  thoughts: wantThoughts,
});

function watchPresence(current: () => WebSocket | null, send: (msg: ClientMessage) => void): void {
  let lastSent = 0;
  const push = () => {
    lastSent = Date.now();
    send(presence());
  };
  const onInput = () => {
    lastInputAt = Date.now();
    if (Date.now() - lastSent > 5_000) push();
  };
  for (const ev of ['keydown', 'pointerdown', 'pointermove', 'wheel'] as const) window.addEventListener(ev, onInput, { capture: true, passive: true });
  document.addEventListener('visibilitychange', push);
  window.setInterval(() => {
    if (current()?.readyState === WebSocket.OPEN) push();
  }, 30_000);
}

/** The latest roster, for anything in the UI that wants to read or watch it. */
export class RosterStore {
  employees: Employee[] = [];
  /** Latest Team Room numbers (null until the server sends some). */
  stats: TeamStats | null = null;
  /** Absolute home dir from the server's hello (for "~/…" paths). */
  home = '';
  /** serverNow − Date.now(), so uptimes use the server's clock. */
  skew = 0;
  online = false;
  private subs = new Set<() => void>();

  set(list: Employee[], serverNow: number): void {
    this.employees = list;
    this.skew = serverNow - Date.now();
    for (const fn of this.subs) fn();
  }

  setStats(stats: TeamStats): void {
    this.stats = stats;
    for (const fn of this.subs) fn();
  }

  get(sessionId: string): Employee | undefined {
    return this.employees.find((e) => e.sessionId === sessionId);
  }

  subscribe(fn: () => void): () => void {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  now(): number {
    return Date.now() + this.skew;
  }
}
