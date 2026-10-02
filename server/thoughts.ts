// Thought bubbles: now and then a working employee "thinks" one short line about what they
// are really doing, written by Haiku from their live activity. It runs `claude -p` on the
// user's own login with no tools, no settings, no MCP and nothing saved, in a sandbox folder
// the roster ignores (so the call never walks into the office). It only thinks while someone
// is watching with thoughts on, and stays well inside a small hourly budget.
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdir } from 'node:fs/promises';
import type { Employee } from '../shared/protocol';
import { THINK_DIR } from './config';
import { cleanEnv } from './exec';
import { claudePath } from './tmux';
import { clip } from './transcript';

/** A session thinks at most this often (randomised up to 2×, so bubbles don't sync up). */
const PER_EMPLOYEE_MS = 3 * 60_000;
/** Thoughts per rolling hour across the whole office. */
const HOURLY_BUDGET = 20;
const TICK_MS = 20_000;
const CALL_TIMEOUT_MS = 30_000;
const MAX_THOUGHT = 80;

const SYSTEM = [
  'You voice the inner thoughts of a cute cartoon office worker in a cosy office game.',
  'The worker is an AI coding assistant; the details say what they are doing right now.',
  'Write ONE short thought in first person, at most 9 words, specific to those details:',
  'playful, warm, a little funny. Plain text only: no quotes, no emoji, no hashtags.',
  'Never mention being an AI or a model. Never include secrets, URLs, paths or code.',
].join(' ');

export interface Thought {
  sessionId: string;
  text: string;
  at: number;
}

export class ThoughtService extends EventEmitter<{ thought: [Thought] }> {
  private last = new Map<string, { at: number; sig: string }>();
  private spent: number[] = [];
  private busy = false;
  private pausedUntil = 0;
  private failures = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private employees: () => Employee[],
    /** True while someone is looking at the office with thoughts turned on. */
    private watching: () => boolean,
  ) {
    super();
  }

  start(): void {
    if (process.env.CLAUDE_OFFICE_THOUGHTS === '0' || this.timer) return;
    void mkdir(THINK_DIR, { recursive: true }).catch(() => {});
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    const now = Date.now();
    if (this.busy || now < this.pausedUntil || !this.watching()) return;
    this.spent = this.spent.filter((t) => now - t < 3600_000);
    if (this.spent.length >= HOURLY_BUDGET) return;

    const live = this.employees();
    const ids = new Set(live.map((e) => e.sessionId));
    for (const id of this.last.keys()) if (!ids.has(id)) this.last.delete(id);
    const ready = live.filter((e) => {
      if (e.state !== 'working' || !e.activity) return false;
      const prev = this.last.get(e.sessionId);
      // Something new to think about, and not too soon after the last thought.
      return !prev || (prev.sig !== signature(e) && now - prev.at > PER_EMPLOYEE_MS * (1 + Math.random()));
    });
    const e = ready[Math.floor(Math.random() * ready.length)];
    if (!e) return;

    this.busy = true;
    this.spent.push(now);
    this.last.set(e.sessionId, { at: now, sig: signature(e) });
    try {
      const text = await think(e);
      this.failures = 0;
      if (text) this.emit('thought', { sessionId: e.sessionId, text, at: Date.now() });
    } catch (err) {
      // Not signed in, offline, rate-limited… back off (2, 4, 8… up to 60 min) and stay quiet.
      this.failures++;
      this.pausedUntil = Date.now() + Math.min(60, 2 ** this.failures) * 60_000;
      if (this.failures === 1) console.warn('[thoughts] paused:', err instanceof Error ? err.message : err);
    } finally {
      this.busy = false;
    }
  }
}

/** What they're doing, so the same activity doesn't get a second thought. */
const signature = (e: Employee) => `${e.activity?.label ?? ''}|${e.title ?? ''}`;

/** Visible text only: no control or bidi characters, one line. */
const plain = (s: string) => s.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]+/g, ' ').trim();

function prompt(e: Employee): string {
  const lines = [
    `Name: ${plain(e.displayName)}`,
    `Project: ${plain(e.project)}`,
    e.title && `Task: ${clip(plain(e.title), 120)}`,
    e.activity && `Doing now: ${clip(plain(e.activity.label), 80)}`,
    e.lastText && `Last thing they said: ${clip(plain(e.lastText), 240)}`,
  ];
  return lines.filter(Boolean).join('\n');
}

function think(e: Employee): Promise<string | null> {
  const args = [
    '-p', '--model', 'haiku',
    '--no-session-persistence', '--tools', '', '--setting-sources', '', '--strict-mcp-config',
    '--system-prompt', SYSTEM,
    prompt(e),
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(claudePath(), args, { cwd: THINK_DIR, env: cleanEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), CALL_TIMEOUT_MS);
    child.stdout.on('data', (d: Buffer) => (out += d));
    child.stderr.on('data', (d: Buffer) => (err += d));
    child.on('error', (x) => {
      clearTimeout(timer);
      reject(x);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(clip(plain(err) || `claude exited ${code}`, 160)));
      resolve(tidy(out));
    });
  });
}

/** One clean line, or null if the model didn't play along. */
function tidy(raw: string): string | null {
  const line = plain(raw.split('\n').find((l) => l.trim()) ?? '').replace(/^["'“‘]+|["'”’]+$/g, '').trim();
  if (!line || /\b(as an ai|language model|i can(?:no|')t)\b/i.test(line)) return null;
  return line.length > MAX_THOUGHT ? clip(line, MAX_THOUGHT) : line;
}
