// Sessions hired in-game live in tmux sessions named office-<id8>; each employee's shell (the
// Shell tab) lives in office-<id8>-sh<port>, and a hot desk's shell in office-desk<port>-<NN>.
// tmux owns them, so they survive a server restart and can be attached from any terminal too.
// This module only ever touches those three kinds.
import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { MAX_HOT_DESK, type HirePermissionMode } from '../shared/protocol';
import { HOME, PORT, TMUX_PREFIX } from './config';
import { cleanEnv, run, which } from './exec';
import { cut } from './transcript';

export interface HostedPane {
  tmuxName: string;
  panePid: number;
  dead: boolean;
  deadStatus?: number;
  /** Epoch ms the tmux session was created. */
  createdAt: number;
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

/** An employee's shell session is their hire's name plus this: the port is in it, so two offices never share one. */
const SHELL_SUFFIX = `-sh${PORT}`;
const HIRE_NAME = new RegExp(`^${TMUX_PREFIX}[0-9a-f]{8}$`, 'i');
/** This office's shells, and plain -sh ones from before shells were named per office (closed by their port stamp). */
const SHELL_NAME = new RegExp(`^${TMUX_PREFIX}[0-9a-f]{8}-sh(?:${PORT})?$`, 'i');
/** This office's hot desks only: the port is in the name, so two offices never touch each other's. */
const DESK_NAME = new RegExp(`^${TMUX_PREFIX}desk${PORT}-[0-9]{2}$`);

/**
 * Only the names the office makes: office-<id8> (a hire), office-<id8>-sh<this port> (a shell)
 * and office-desk<this port>-<NN> (a hot desk).
 */
export function isOfficeName(name: string): boolean {
  return HIRE_NAME.test(name) || SHELL_NAME.test(name) || DESK_NAME.test(name);
}

const isShellName = (name: string) => SHELL_NAME.test(name);
const isHireName = (name: string) => HIRE_NAME.test(name);

/** The tmux session of `sessionId`'s shell. */
const shellName = (sessionId: string) => TMUX_PREFIX + sessionId.slice(0, 8).toLowerCase() + SHELL_SUFFIX;

/** The tmux session of this office's shell at `desk` (0 to 99). */
function deskName(desk: number): string {
  if (!Number.isInteger(desk) || desk < 0 || desk > MAX_HOT_DESK) throw new Error(`Desks are numbered 0 to ${MAX_HOT_DESK}`);
  return `${TMUX_PREFIX}desk${PORT}-${String(desk).padStart(2, '0')}`;
}

/**
 * The port each hire's tmux session was stamped with (CLAUDE_OFFICE_PORT), by session name,
 * pane pid and creation time: a stamp never changes, so each session is read once, and a new
 * session under an old name is read again.
 */
const hirePorts = new Map<string, number>();

export interface Hires {
  /** Every pane of this office's hires. */
  panes: HostedPane[];
  /** Pids of the people in anyone else's hires: in their own terminal here, and not to be brought in. */
  elsewhere: Set<number>;
}

/**
 * The hires in tmux (none if the tmux server isn't running). Another office's hire (a dev copy
 * on another port) is someone in their own terminal here: never typed into, attached to, let
 * go, reaped or brought in. Hires from before the port stamp (older than 1.0.0) count for no
 * office: nothing shows which office started them, so none may drive them; they still show up
 * as people in their own terminal, and close from tmux like any other session.
 */
export async function listHosted(): Promise<Hires> {
  // Colon-separated, not tabs: tmux 3.3/3.4 (Debian 12, Ubuntu 24.04) print a tab in -F output
  // as "_". Session names can't hold a colon, and the rest are numbers.
  const r = await tmux([
    'list-panes', '-a', '-F',
    '#{session_name}:#{pane_pid}:#{pane_dead}:#{pane_dead_status}:#{session_created}',
  ]);
  const panes: HostedPane[] = [];
  const elsewhere = new Set<number>();
  if (r.code !== 0) return { panes, elsewhere };
  const seen = new Set<string>();
  for (const line of r.stdout.split('\n')) {
    const [name, pid, dead, status, created] = line.split(':');
    // Hires only: the roster reaps dead panes and lets go of these, never a shell or a desk.
    if (!name || !isHireName(name)) continue;
    const key = `${name}\t${pid}\t${created}`;
    seen.add(key);
    if (!hirePorts.has(key)) {
      const env = await stamps(name);
      // Unreadable just now (it closed meanwhile): not ours this poll, read again on the next.
      if (env) hirePorts.set(key, Number(env.get('CLAUDE_OFFICE_PORT')));
    }
    if (hirePorts.get(key) !== PORT) {
      if (dead !== '1') elsewhere.add(Number(pid));
      continue;
    }
    panes.push({
      tmuxName: name,
      panePid: Number(pid),
      dead: dead === '1',
      deadStatus: status ? Number(status) : undefined,
      createdAt: Number(created) * 1000 || Date.now(),
    });
  }
  for (const key of hirePorts.keys()) if (!seen.has(key)) hirePorts.delete(key);
  return { panes, elsewhere };
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
 * started the first time someone opens it. Named and stamped with this office's port, so two
 * offices never share one and each closes only its own (see listShells). Returns the tmux name.
 */
export async function ensureShell(sessionId: string, cwd: string): Promise<string> {
  const name = shellName(sessionId);
  // Their shell from before shells were named per office (1.0.1), if this office opened it:
  // it carries on under the new name instead of being left behind.
  const old = TMUX_PREFIX + sessionId.slice(0, 8).toLowerCase() + '-sh';
  const env = await stamps(old);
  if (Number(env?.get('CLAUDE_OFFICE_PORT')) === PORT && env?.get('CLAUDE_OFFICE_SHELL')?.toLowerCase() === sessionId.toLowerCase()) {
    await tmux(['rename-session', '-t', `=${old}`, name]);
  }
  return ensureLoginShell(name, cwd, `CLAUDE_OFFICE_SHELL=${sessionId}`);
}

/**
 * The shell at hot desk `desk` (0 to 99): your login shell in your home folder, started the
 * first time you sit there, and still running after you stand up. Returns the tmux name.
 */
export function ensureDesk(desk: number): Promise<string> {
  return ensureLoginShell(deskName(desk), HOME, `CLAUDE_OFFICE_DESK=${desk}`);
}

/** The login shell in tmux session `name`, in `cwd`, unless it's running already. `stamp`: one more VAR=value. */
async function ensureLoginShell(name: string, cwd: string, stamp: string): Promise<string> {
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
    '-e', stamp,
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

/** The desks with one of this office's shells running, lowest first. */
export async function listDesks(): Promise<number[]> {
  const r = await tmux(['list-sessions', '-F', '#{session_name}']);
  if (r.code !== 0) return [];
  return r.stdout
    .split('\n')
    .filter((name) => DESK_NAME.test(name))
    .map((name) => Number(name.slice(-2)))
    .sort((a, b) => a - b);
}

/** Shut down this office's shell at `desk` (nothing happens if it has none). */
export async function closeDesk(desk: number): Promise<void> {
  await kill(deskName(desk));
}

/** This office's shells (and older plain -sh ones) that are running: tmux name → the employee and office (port) they belong to. */
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
  const existing = (await listHosted()).panes;
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
