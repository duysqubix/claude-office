// Incremental reader for a session transcript (~/.claude/projects/<enc>/<id>.jsonl).
// Transcripts reach 10+ MB, so the first read only looks at the tail and later reads
// only consume newly appended bytes.
import { open, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Activity, ChatLine } from '../shared/protocol';
import { PROJECTS_DIR } from './config';

const INITIAL_TAIL_BYTES = 1024 * 1024;
const MAX_READ_PER_POLL = 4 * 1024 * 1024;
const HEAD_BYTES = 64 * 1024;
const CHATTER_KEEP = 30;

export function encodeCwd(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-');
}

/** Find a session's transcript: the expected project dir first, then every project dir. */
export async function findTranscript(sessionId: string, cwd?: string): Promise<string | null> {
  const name = `${sessionId}.jsonl`;
  if (cwd) {
    const p = join(PROJECTS_DIR, encodeCwd(cwd), name);
    if (await exists(p)) return p;
  }
  let dirs: string[] = [];
  try {
    dirs = await readdir(PROJECTS_DIR);
  } catch {
    return null;
  }
  for (const d of dirs) {
    const p = join(PROJECTS_DIR, d, name);
    if (await exists(p)) return p;
  }
  return null;
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

interface PendingTool {
  name: string;
  input: Record<string, unknown>;
  at: number;
}

export interface TranscriptSummary {
  title?: string;
  lastPrompt?: string;
  lastText?: string;
  model?: string;
  branch?: string;
  cwd?: string;
  costUSD?: number;
  activity: Activity;
  chatter: ChatLine[];
}

export class TranscriptTail {
  path: string | null = null;
  private offset = 0;
  private leftover: Buffer = Buffer.alloc(0);
  private nextLookup = 0;
  private headScanned = false;

  title?: string;
  lastPrompt?: string;
  lastText?: string;
  model?: string;
  branch?: string;
  cwd?: string;
  costUSD?: number;
  private firstPrompt?: string;
  private pending = new Map<string, PendingTool>();
  chatter: ChatLine[] = [];

  constructor(
    readonly sessionId: string,
    private readonly hintCwd?: string,
  ) {}

  /** Read anything appended since last time. Returns true if something was parsed. */
  async update(): Promise<boolean> {
    if (!this.path) {
      if (Date.now() < this.nextLookup) return false;
      this.path = await findTranscript(this.sessionId, this.hintCwd);
      // Brand-new sessions have no transcript until the first message; look again soon.
      if (!this.path) {
        this.nextLookup = Date.now() + 3000;
        return false;
      }
    }
    let size: number;
    try {
      size = (await stat(this.path)).size;
    } catch {
      this.path = null;
      return false;
    }
    if (size < this.offset) {
      // Rewritten from scratch: start over.
      this.offset = 0;
      this.leftover = Buffer.alloc(0);
    }
    if (size === this.offset) return false;

    let start = this.offset;
    let skipFirstLine = false;
    if (start === 0 && size > INITIAL_TAIL_BYTES) {
      start = size - INITIAL_TAIL_BYTES;
      skipFirstLine = true;
    }
    const end = Math.min(size, start + MAX_READ_PER_POLL);
    const chunk = await readRange(this.path, start, end);
    this.offset = end;

    let buf = this.leftover.length ? Buffer.concat([this.leftover, chunk]) : chunk;
    if (skipFirstLine) {
      const nl = buf.indexOf(0x0a);
      buf = nl === -1 ? Buffer.alloc(0) : buf.subarray(nl + 1);
    }
    const lastNl = buf.lastIndexOf(0x0a);
    if (lastNl === -1) {
      this.leftover = Buffer.from(buf);
      return false;
    }
    this.leftover = Buffer.from(buf.subarray(lastNl + 1));
    const text = buf.subarray(0, lastNl).toString('utf8');
    for (const line of text.split('\n')) {
      if (line) this.ingest(line);
    }
    if (!this.title && !this.headScanned) await this.scanHeadForPrompt();
    return true;
  }

  private ingest(line: string): void {
    let e: Record<string, any>;
    try {
      e = JSON.parse(line);
    } catch {
      return;
    }
    if (typeof e.cwd === 'string') this.cwd = e.cwd;
    if (typeof e.gitBranch === 'string' && e.gitBranch) this.branch = e.gitBranch;
    switch (e.type) {
      case 'ai-title':
        if (typeof e.aiTitle === 'string' && e.aiTitle.trim()) this.title = e.aiTitle.trim();
        break;
      case 'last-prompt': {
        const p = typeof e.lastPrompt === 'string' ? humanize(e.lastPrompt) : null;
        if (p) this.lastPrompt = clip(p, 200);
        break;
      }
      case 'cost-state':
        if (typeof e.totalCostUSD === 'number') this.costUSD = e.totalCostUSD;
        break;
      case 'assistant': {
        if (e.isSidechain) break;
        const m = e.message ?? {};
        if (typeof m.model === 'string' && !m.model.startsWith('<')) this.model = m.model;
        const at = Date.parse(e.timestamp) || Date.now();
        for (const b of Array.isArray(m.content) ? m.content : []) {
          if (b?.type === 'text' && typeof b.text === 'string' && b.text.trim()) {
            this.lastText = clip(b.text.trim(), 280);
            this.say('assistant', b.text, e.timestamp);
          } else if (b?.type === 'tool_use' && typeof b.id === 'string') {
            this.pending.set(b.id, { name: String(b.name ?? 'tool'), input: (b.input ?? {}) as Record<string, unknown>, at });
          }
        }
        break;
      }
      case 'user': {
        if (e.isSidechain) break;
        const c = e.message?.content;
        if (typeof c === 'string') {
          if (!e.isMeta) this.humanPrompt(c, e.timestamp);
        } else if (Array.isArray(c)) {
          for (const b of c) {
            if (b?.type === 'tool_result' && typeof b.tool_use_id === 'string') this.pending.delete(b.tool_use_id);
            else if (b?.type === 'text' && typeof b.text === 'string' && !e.isMeta) this.humanPrompt(b.text, e.timestamp);
          }
        }
        break;
      }
    }
  }

  private humanPrompt(raw: string, ts?: string): void {
    const text = humanize(raw);
    if (!text) return;
    // A new human turn means anything still "pending" from before was interrupted.
    this.pending.clear();
    this.firstPrompt ??= text;
    this.say('user', text, ts);
  }

  private say(role: ChatLine['role'], text: string, ts?: string): void {
    this.chatter.push({ role, text: clip(text.trim(), 400), ts });
    if (this.chatter.length > CHATTER_KEEP) this.chatter.splice(0, this.chatter.length - CHATTER_KEEP);
  }

  /** Untitled sessions: use the very first human prompt from the head of the file. */
  private async scanHeadForPrompt(): Promise<void> {
    this.headScanned = true;
    if (!this.path || this.firstPrompt) return;
    try {
      const head = (await readRange(this.path, 0, HEAD_BYTES)).toString('utf8').split('\n');
      for (const line of head.slice(0, -1)) {
        try {
          const e = JSON.parse(line);
          if (e.type !== 'user' || e.isMeta || e.isSidechain) continue;
          const c = e.message?.content;
          const raw = typeof c === 'string' ? c : Array.isArray(c) ? c.find((b: any) => b?.type === 'text')?.text : undefined;
          const text = typeof raw === 'string' ? humanize(raw) : null;
          if (text) {
            this.firstPrompt = text;
            return;
          }
        } catch {
          // partial or odd line
        }
      }
    } catch {
      // unreadable head: no fallback title
    }
  }

  summary(busy: boolean): TranscriptSummary {
    return {
      title: this.title ?? (this.firstPrompt ? clip(this.firstPrompt, 60) : undefined),
      lastPrompt: this.lastPrompt,
      lastText: this.lastText,
      model: this.model,
      branch: this.branch,
      cwd: this.cwd,
      costUSD: this.costUSD,
      activity: busy ? this.currentActivity() : { kind: 'thinking', label: 'Thinking…' },
      chatter: this.chatter,
    };
  }

  private currentActivity(): Activity {
    let latest: PendingTool | undefined;
    for (const p of this.pending.values()) if (!latest || p.at >= latest.at) latest = p;
    return latest ? describeTool(latest.name, latest.input) : { kind: 'thinking', label: 'Thinking…' };
  }
}

async function readRange(path: string, start: number, end: number): Promise<Buffer> {
  const fh = await open(path, 'r');
  try {
    const buf = Buffer.alloc(Math.max(0, end - start));
    const { bytesRead } = await fh.read(buf, 0, buf.length, start);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

/** Turn a raw user message into something a human typed, or null for harness noise. */
export function humanize(text: string): string | null {
  const cmd = text.match(/<command-name>([^<]*)<\/command-name>/);
  if (cmd) {
    const args = text.match(/<command-args>([^<]*)<\/command-args>/);
    return clip(`${cmd[1]} ${args?.[1] ?? ''}`.trim(), 400) || null;
  }
  const t = text.trimStart();
  if (/^<(local-command|system-reminder|task-notification|teammate-message|bash-|user-memory|command-message)/.test(t)) return null;
  if (t.startsWith('Caveat:') || t.startsWith('[Request interrupted') || t.startsWith('Another Claude session sent a message')) return null;
  const plain = t.replace(/<[^>]{1,80}>/g, ' ').replace(/\s+/g, ' ').trim();
  return plain || null;
}

export function clip(s: string, n: number): string {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > n ? one.slice(0, n - 1) + '…' : one;
}

const baseName = (p: unknown) => (typeof p === 'string' ? p.split('/').filter(Boolean).pop() ?? p : '');
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** Map a tool call to an animation bucket and a short label. */
export function describeTool(name: string, input: Record<string, unknown>): Activity {
  const a = (kind: Activity['kind'], label: string): Activity => ({ tool: name, kind, label: clip(label, 60) });
  switch (name) {
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
    case 'NotebookEdit':
      return a('typing', `Editing ${baseName(input.file_path ?? input.notebook_path)}`);
    case 'Read':
      return a('reading', `Reading ${baseName(input.file_path)}`);
    case 'Grep':
    case 'Glob':
    case 'LS':
      return a('reading', `Searching ${str(input.pattern) || baseName(input.path)}`);
    case 'Bash':
      return a('running', str(input.description) || `$ ${str(input.command).split('\n')[0]}`);
    case 'BashOutput':
    case 'Monitor':
      return a('running', 'Watching a command');
    case 'WebFetch':
      return a('browsing', `Reading ${hostOf(input.url)}`);
    case 'WebSearch':
      return a('browsing', `Searching the web: ${str(input.query)}`);
    case 'Agent':
    case 'Task':
      return a('delegating', `Briefing an intern: ${str(input.description)}`);
    case 'Workflow':
      return a('delegating', 'Running a workflow');
    case 'SendMessage':
      return a('delegating', 'Messaging a colleague');
    case 'AskUserQuestion':
      return a('asking', 'Has a question for you');
    case 'TodoWrite':
    case 'TaskCreate':
    case 'TaskUpdate':
    case 'TaskList':
    case 'EnterPlanMode':
    case 'ExitPlanMode':
      return a('planning', 'Updating the plan');
    case 'Skill':
      return a('reading', `Using skill ${str(input.skill)}`);
    case 'Artifact':
      return a('typing', 'Publishing a page');
  }
  if (name.startsWith('mcp__')) {
    const [, server = '', tool = ''] = name.split('__');
    const browsing = /chrome|browser|playwright|puppeteer|fetch|firecrawl/i.test(server);
    return a(browsing ? 'browsing' : 'other', `${server.replace(/^plugin_[^_]+_/, '').replace(/[-_]/g, ' ')} › ${tool.replace(/_/g, ' ')}`);
  }
  return a('other', `Using ${name}`);
}

function hostOf(u: unknown): string {
  try {
    return new URL(String(u)).hostname;
  } catch {
    return 'a web page';
  }
}
