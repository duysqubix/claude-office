// Sessions hired in-game live in tmux sessions named office-<id8>; each employee's shell (the
// Shell tab) lives in office-<id8>-sh. tmux owns them, so they survive a server restart and
// can be attached from any terminal too. This module only ever touches those two kinds.
import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import type { HirePermissionMode } from '../shared/protocol';
import { PORT, TMUX_PREFIX } from './config';
import { cleanEnv, run, which } from './exec';
import { cut } from './transcript';

export interface HostedPane {
  tmuxName: string;
  panePid: number;
  dead: boolean;
  deadStatus?: number;
  /** Epoch ms the tmux session was created. */
  createdAt: number;
  cwd: string;
}

/** What the office stamped on a tmux session when it hired someone (tmux session environment). */
export interface OfficeMeta {
  sessionId: string;
  displayName?: string;
  cwd?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export function claudePath(): string {
  return claudeBin;
}

const tmux = (args: string[], opts: { input?: string } = {}) => run(tmuxBin, args, { ...opts, timeoutMs: 5000 });

/** An employee's shell session is their hire's name plus this. */
const SHELL_SUFFIX = '-sh';
const OFFICE_NAME = new RegExp(`^${TMUX_PREFIX}[0-9a-f]{8}(?:${SHELL_SUFFIX})?$`, 'i');

/** Only the names the office makes: office-<id8> (a hire) and office-<id8>-sh (a shell). */
export function isOfficeName(name: string): boolean {
  return OFFICE_NAME.test(name);
}

const isShellName = (name: string) => isOfficeName(name) && name.endsWith(SHELL_SUFFIX);

/** The tmux session of `sessionId`'s shell. */
const shellName = (sessionId: string) => TMUX_PREFIX + sessionId.slice(0, 8).toLowerCase() + SHELL_SUFFIX;

/** Every pane of every office hire's tmux session (none if the tmux server isn't running). */
export async function listHosted(): Promise<HostedPane[]> {
  const r = await tmux([
    'list-panes', '-a', '-F',
    '#{session_name}\t#{pane_pid}\t#{pane_dead}\t#{pane_dead_status}\t#{session_created}\t#{pane_current_path}',
  ]);
  if (r.code !== 0) return [];
  const out: HostedPane[] = [];
  for (const line of r.stdout.split('\n')) {
    const [name, pid, dead, status, created, cwd] = line.split('\t');
    if (!name || !isOfficeName(name) || isShellName(name)) continue;
    out.push({
      tmuxName: name,
      panePid: Number(pid),
      dead: dead === '1',
      deadStatus: status ? Number(status) : undefined,
      createdAt: Number(created) * 1000 || Date.now(),
      cwd: cwd ?? '',
    });
  }
  return out;
}

/** The environment the office stamped on one of its tmux sessions (null if it can't be read). */
async function stamps(tmuxName: string): Promise<Map<string, string> | null> {
  if (!isOfficeName(tmuxName)) return null;
  const r = await tmux(['show-environment', '-t', `=${tmuxName}:`]);
  if (r.code !== 0) return null;
  const env = new Map<string, string>();
  for (const line of r.stdout.split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0) env.set(line.slice(0, eq), line.slice(eq + 1));
  }
  return env;
}

/** Read back the session id / name / folder the office stamped on a tmux session, if any. */
export async function readOfficeMeta(tmuxName: string): Promise<OfficeMeta | null> {
  const env = await stamps(tmuxName);
  if (!env) return null;
  const sessionId = env.get('CLAUDE_OFFICE_SESSION');
  if (!sessionId || !UUID.test(sessionId)) return null;
  return { sessionId, displayName: env.get('CLAUDE_OFFICE_NAME') || undefined, cwd: env.get('CLAUDE_OFFICE_CWD') || undefined };
}

export async function assertDirectory(cwd: string): Promise<void> {
  const s = await stat(cwd).catch(() => null);
  if (!s?.isDirectory()) throw new Error(`Not a directory: ${cwd}`);
}

async function newSession(tmuxName: string, cwd: string, claudeArgs: string[], meta: OfficeMeta): Promise<void> {
  await assertDirectory(cwd);
  const env = cleanEnv();
  const r = await tmux([
    'new-session', '-d',
    '-s', tmuxName,
    '-x', '160', '-y', '48',
    '-c', cwd,
    '-e', `PATH=${env.PATH ?? ''}`,
    '-e', 'CLAUDE_OFFICE=1',
    // The permission hook asks the office that hired this session, so a second office on
    // another port (a dev copy) keeps its hires' questions to itself.
    '-e', `CLAUDE_OFFICE_PORT=${PORT}`,
    // Stamped so a restarted server can recognise hires that haven't registered with Claude yet.
    '-e', `CLAUDE_OFFICE_SESSION=${meta.sessionId}`,
    '-e', `CLAUDE_OFFICE_NAME=${meta.displayName ?? ''}`,
    '-e', `CLAUDE_OFFICE_CWD=${cwd}`,
    // More than one word after `--`: tmux execs it directly, no shell, so nothing here is ever shell-parsed.
    '--', claudeBin, ...claudeArgs,
  ]);
  if (r.code !== 0) throw new Error(r.stderr.trim() || `tmux new-session failed (${r.code})`);
  // Keep the pane around if claude dies, so we can report why instead of vanishing.
  await tmux(['set-option', '-w', '-t', `=${tmuxName}:`, 'remain-on-exit', 'on']);
  await inGameOptions(tmuxName);
}

/** What every office session needs to work as the in-game terminal. */
async function inGameOptions(tmuxName: string): Promise<void> {
  // The in-game terminal is the whole screen; tmux's status bar is just noise there.
  await tmux(['set-option', '-t', `=${tmuxName}:`, 'status', 'off']);
  // No tmux prefix key: Ctrl+B (and every other key) must reach Claude Code, which uses
  // Ctrl+B to send a running command to the background (and a shell uses it to move back).
  await tmux(['set-option', '-t', `=${tmuxName}:`, 'prefix', 'None']);
  await tmux(['set-option', '-t', `=${tmuxName}:`, 'prefix2', 'None']);
  // Mouse mode: the wheel scrolls back through the output (tmux copy mode, which exits by
  // itself at the bottom) instead of reaching the program as arrow keys.
  await tmux(['set-option', '-t', `=${tmuxName}:`, 'mouse', 'on']);
}

/** The user's login shell (their $SHELL), or the system's. */
function loginShell(env: NodeJS.ProcessEnv): string {
  const s = env.SHELL ?? '';
  if (/^\/[\w./+-]+$/.test(s)) return s;
  return process.platform === 'darwin' ? '/bin/zsh' : '/bin/sh';
}

/**
 * `sessionId`'s shell (the Shell tab): their login shell in `cwd`, in its own tmux session,
 * started the first time someone opens it. Stamped with this office's port, so each office
 * only ever closes the shells it started (see listShells). Returns the tmux name.
 */
export async function ensureShell(sessionId: string, cwd: string): Promise<string> {
  const name = shellName(sessionId);
  if ((await tmux(['has-session', '-t', `=${name}`])).code === 0) return name;
  await assertDirectory(cwd);
  const env = cleanEnv();
  const r = await tmux([
    'new-session', '-d',
    '-s', name,
    '-x', '160', '-y', '48',
    '-c', cwd,
    '-e', `PATH=${env.PATH ?? ''}`,
    '-e', 'CLAUDE_OFFICE=1',
    // A claude started in here asks the office that opened the shell, like its hires do.
    '-e', `CLAUDE_OFFICE_PORT=${PORT}`,
    '-e', `CLAUDE_OFFICE_SHELL=${sessionId}`,
    // Two words after `--`: tmux execs it directly, no shell parsing.
    '--', loginShell(env), '-l',
  ]);
  if (r.code !== 0) {
    // Opened from another tab a moment ago.
    if ((await tmux(['has-session', '-t', `=${name}`])).code === 0) return name;
    throw new Error(r.stderr.trim() || `tmux new-session failed (${r.code})`);
  }
  await inGameOptions(name);
  return name;
}

/** Office shells that are running: tmux name → the employee and office (port) they belong to. */
export async function listShells(): Promise<Map<string, { sessionId: string; port: number }>> {
  const out = new Map<string, { sessionId: string; port: number }>();
  const r = await tmux(['list-sessions', '-F', '#{session_name}']);
  if (r.code !== 0) return out;
  for (const name of r.stdout.split('\n')) {
    if (!isShellName(name)) continue;
    const env = await stamps(name);
    const sessionId = env?.get('CLAUDE_OFFICE_SHELL') ?? '';
    const port = Number(env?.get('CLAUDE_OFFICE_PORT'));
    if (UUID.test(sessionId) && Number.isFinite(port)) out.set(name, { sessionId: sessionId.toLowerCase(), port });
  }
  return out;
}

export function newSessionId(): string {
  return randomUUID();
}

/** New claude session in `cwd` with a session id we chose, so we can recognise it when it registers. */
export async function hire(opts: {
  sessionId: string;
  cwd: string;
  displayName: string;
  prompt?: string;
  permissionMode?: HirePermissionMode;
}): Promise<{ tmuxName: string }> {
  const tmuxName = TMUX_PREFIX + opts.sessionId.slice(0, 8);
  const args = ['--session-id', opts.sessionId, '-n', opts.displayName];
  if (opts.permissionMode) args.push('--permission-mode', opts.permissionMode);
  if (opts.prompt?.trim()) args.push('--', opts.prompt.trim());
  await newSession(tmuxName, opts.cwd, args, { sessionId: opts.sessionId, displayName: opts.displayName });
  return { tmuxName };
}

/** `claude --resume <id>` in `cwd`. */
export async function rehire(opts: { sessionId: string; cwd: string; displayName: string }): Promise<{ tmuxName: string }> {
  const tmuxName = TMUX_PREFIX + opts.sessionId.slice(0, 8);
  const existing = await listHosted();
  if (existing.some((p) => p.tmuxName === tmuxName && !p.dead)) throw new Error('Already in the office');
  if (existing.some((p) => p.tmuxName === tmuxName)) await kill(tmuxName);
  await newSession(tmuxName, opts.cwd, ['--resume', opts.sessionId], { sessionId: opts.sessionId, displayName: opts.displayName });
  return { tmuxName };
}

export async function kill(tmuxName: string): Promise<void> {
  if (!isOfficeName(tmuxName)) throw new Error('Refusing to touch a tmux session the office did not create');
  await tmux(['kill-session', '-t', `=${tmuxName}:`]);
}

/**
 * Text as typed, minus anything that could act as a key inside the paste: control characters
 * (an ESC could end the bracketed paste early with `ESC[201~`) and bare carriage returns.
 */
export function pasteSafe(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '');
}

/** Type `text` into the session (bracketed paste) and press Enter. */
export async function say(tmuxName: string, text: string): Promise<void> {
  if (!isOfficeName(tmuxName)) throw new Error('Not an office session');
  const clean = pasteSafe(text);
  if (!clean.trim()) throw new Error('Nothing to say');
  const buffer = `office-say-${process.pid}-${randomUUID()}`;
  const load = await tmux(['load-buffer', '-b', buffer, '-'], { input: clean });
  if (load.code !== 0) throw new Error(load.stderr.trim() || 'tmux load-buffer failed');
  const paste = await tmux(['paste-buffer', '-p', '-d', '-b', buffer, '-t', `=${tmuxName}:`]);
  if (paste.code !== 0) throw new Error(paste.stderr.trim() || 'tmux paste-buffer failed');
  // Give Claude Code's input a beat to take the paste before submitting.
  await new Promise((r) => setTimeout(r, 150));
  await tmux(['send-keys', '-t', `=${tmuxName}:`, 'Enter']);
}

/** Press Esc in the session (Claude Code's interrupt). */
export async function interrupt(tmuxName: string): Promise<void> {
  if (!isOfficeName(tmuxName)) throw new Error('Not an office session');
  await tmux(['send-keys', '-t', `=${tmuxName}:`, 'Escape']);
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
    .map((l) => (l.length > maxCols ? cut(l, maxCols) : l));
}
