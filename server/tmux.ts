// Sessions hired in-game live in tmux sessions named office-<id8>. tmux owns them, so they
// survive a server restart and can be attached from any terminal too. This module only
// ever touches tmux sessions with the office- prefix.
import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { TMUX_PREFIX } from './config';
import { cleanEnv, run, which } from './exec';

export interface HostedPane {
  tmuxName: string;
  panePid: number;
  dead: boolean;
  deadStatus?: number;
}

let tmuxBin = 'tmux';
let claudeBin = 'claude';

export async function initTmux(): Promise<{ tmux: string | null; claude: string | null }> {
  const t = await which('tmux');
  const c = process.env.CLAUDE_BIN ?? (await which('claude'));
  if (t) tmuxBin = t;
  if (c) claudeBin = c;
  return { tmux: t, claude: c };
}

export function tmuxPath(): string {
  return tmuxBin;
}

const tmux = (args: string[], opts: { input?: string } = {}) => run(tmuxBin, args, { ...opts, timeoutMs: 5000 });

export function isOfficeName(name: string): boolean {
  return name.startsWith(TMUX_PREFIX) && /^[\w-]+$/.test(name);
}

/** Every pane of every office-* tmux session (none if the tmux server isn't running). */
export async function listHosted(): Promise<HostedPane[]> {
  const r = await tmux(['list-panes', '-a', '-F', '#{session_name}\t#{pane_pid}\t#{pane_dead}\t#{pane_dead_status}']);
  if (r.code !== 0) return [];
  const out: HostedPane[] = [];
  for (const line of r.stdout.split('\n')) {
    const [name, pid, dead, status] = line.split('\t');
    if (!name || !isOfficeName(name)) continue;
    out.push({ tmuxName: name, panePid: Number(pid), dead: dead === '1', deadStatus: status ? Number(status) : undefined });
  }
  return out;
}

export async function assertDirectory(cwd: string): Promise<void> {
  const s = await stat(cwd).catch(() => null);
  if (!s?.isDirectory()) throw new Error(`Not a directory: ${cwd}`);
}

async function newSession(tmuxName: string, cwd: string, claudeArgs: string[]): Promise<void> {
  await assertDirectory(cwd);
  const env = cleanEnv();
  const r = await tmux([
    'new-session', '-d',
    '-s', tmuxName,
    '-x', '160', '-y', '48',
    '-c', cwd,
    '-e', `PATH=${env.PATH ?? ''}`,
    '-e', 'CLAUDE_OFFICE=1',
    // More than one word after `--`: tmux execs it directly, no shell, so nothing here is ever shell-parsed.
    '--', claudeBin, ...claudeArgs,
  ]);
  if (r.code !== 0) throw new Error(r.stderr.trim() || `tmux new-session failed (${r.code})`);
  // Keep the pane around if claude dies, so we can report why instead of vanishing.
  await tmux(['set-option', '-w', '-t', `=${tmuxName}:`, 'remain-on-exit', 'on']);
  // The in-game terminal is the whole screen; tmux's status bar is just noise there.
  await tmux(['set-option', '-t', `=${tmuxName}:`, 'status', 'off']);
}

export function newSessionId(): string {
  return randomUUID();
}

/** New claude session in `cwd` with a session id we chose, so we can recognise it when it registers. */
export async function hire(opts: { sessionId: string; cwd: string; displayName: string; prompt?: string }): Promise<{ tmuxName: string }> {
  const tmuxName = TMUX_PREFIX + opts.sessionId.slice(0, 8);
  const args = ['--session-id', opts.sessionId, '-n', opts.displayName];
  if (opts.prompt?.trim()) args.push('--', opts.prompt.trim());
  await newSession(tmuxName, opts.cwd, args);
  return { tmuxName };
}

/** `claude --resume <id>` in `cwd`. */
export async function rehire(opts: { sessionId: string; cwd: string }): Promise<{ tmuxName: string }> {
  const tmuxName = TMUX_PREFIX + opts.sessionId.slice(0, 8);
  const existing = await listHosted();
  if (existing.some((p) => p.tmuxName === tmuxName && !p.dead)) throw new Error('Already in the office');
  if (existing.some((p) => p.tmuxName === tmuxName)) await kill(tmuxName);
  await newSession(tmuxName, opts.cwd, ['--resume', opts.sessionId]);
  return { tmuxName };
}

export async function kill(tmuxName: string): Promise<void> {
  if (!isOfficeName(tmuxName)) throw new Error('Refusing to touch a tmux session the office did not create');
  await tmux(['kill-session', '-t', `=${tmuxName}:`]);
}

/** Type `text` into the session (bracketed paste) and press Enter. */
export async function say(tmuxName: string, text: string): Promise<void> {
  if (!isOfficeName(tmuxName)) throw new Error('Not an office session');
  const buffer = `office-say-${process.pid}`;
  const load = await tmux(['load-buffer', '-b', buffer, '-'], { input: text });
  if (load.code !== 0) throw new Error(load.stderr.trim() || 'tmux load-buffer failed');
  const paste = await tmux(['paste-buffer', '-p', '-d', '-b', buffer, '-t', `=${tmuxName}:`]);
  if (paste.code !== 0) throw new Error(paste.stderr.trim() || 'tmux paste-buffer failed');
  // Give Claude Code's input a beat to take the paste before submitting.
  await new Promise((r) => setTimeout(r, 150));
  await tmux(['send-keys', '-t', `=${tmuxName}:`, 'Enter']);
}

/** Last lines of the visible screen, for the desk monitor. */
export async function capture(tmuxName: string, maxLines = 18, maxCols = 80): Promise<string[]> {
  const r = await tmux(['capture-pane', '-p', '-t', `=${tmuxName}:`]);
  if (r.code !== 0) return [];
  const lines = r.stdout.split('\n').map((l) => l.replace(/\s+$/, ''));
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines
    .filter((l) => l.trim())
    .slice(-maxLines)
    .map((l) => (l.length > maxCols ? l.slice(0, maxCols) : l));
}
