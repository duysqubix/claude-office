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
  /** Its session pinned down (see PINNED): what to act on, as nothing that takes the name or the id since can be reached through it. */
  id: string;
  panePid: number;
  dead: boolean;
  deadStatus?: number;
  /** The signal that ended it, if one did (then there's no exit status): a name on macOS ("kill"), a number on Linux. */
  deadSignal?: string;
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

/**
 * A tmux session pinned down (see pin): `$12@4242/office-1a2b3c4d`, its id, the pid of the tmux
 * server it was read on, and its name. tmux doesn't hand an id out twice while its server runs,
 * but a server started after that one exits counts from $0 again: only all three are that session.
 */
const PINNED = /^(\$\d+)@(\d+)\/(.+)$/;

function unpin(target: string): { id: string; server: string; name: string } | null {
  const m = PINNED.exec(target);
  return m && isOfficeName(m[3]) ? { id: m[1], server: m[2], name: m[3] } : null;
}

/**
 * A format that's 1 while the session it's expanded for is still `p`: the same id, on the same
 * server, under the same name. The id too, as for an id that's gone, tmux expands a format for
 * the session of a client attached somewhere instead (yours, sitting at their call-back, say).
 */
const still = (p: { id: string; server: string; name: string }) =>
  `#{&&:#{==:#{session_id},${p.id}},#{&&:#{==:#{pid},${p.server}},#{==:#{session_name},${p.name}}}}`;

/** One of the office's sessions: by name, or pinned down along with its stamp (see ownHire). */
export function isOfficeTarget(target: string): boolean {
  return isOfficeName(target) || unpin(target) !== null;
}

/** tmux's `-t` for `target`: the session with exactly that name, or the id it was pinned with. */
function tmuxTarget(target: string): string {
  return unpin(target)?.id ?? `=${target}`;
}

/**
 * tmux's arguments for `commands` (each a command's words) on `target`, run in turn until one
 * fails. On a pinned session they run inside tmux, and only if the session with that id there is
 * still on the same server under the same name, checked in the same step; if not, nothing happens
 * and nothing is printed. So a session that has the id since (a new server's first, say: someone's
 * own shell) is never touched.
 */
function guarded(target: string, ...commands: string[][]): string[] {
  const p = unpin(target);
  // As on tmux's own command line: a lone ; between commands.
  if (!p) return commands.flatMap((c, i) => (i ? [';', ...c] : c));
  // Single-quoted for tmux's command parser, which then takes each one as it is: one with a quote
  // or a line break in it wouldn't be.
  if (commands.flat().some((a) => /['\n\r]/.test(a))) throw new Error('A quote or line break in a guarded tmux command');
  return ['if-shell', '-F', '-t', `${p.id}:`, still(p), commands.map((c) => c.map((a) => `'${a}'`).join(' ')).join(' ; ')];
}

/** Run tmux `commands` on `target` (see guarded). */
const on = (target: string, ...commands: string[][]) => tmux(guarded(target, ...commands));

/** tmux's arguments to attach a client to `target` (see guarded). */
export function attachArgs(target: string): string[] {
  return guarded(target, ['attach-session', '-t', tmuxTarget(target)]);
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
  // as "_". Session names can't hold a colon, and the rest are ids ($12), numbers or a signal's name.
  const r = await tmux([
    'list-panes', '-a', '-F',
    '#{session_name}:#{session_id}:#{pane_pid}:#{pane_dead}:#{pane_dead_status}:#{pane_dead_signal}:#{session_created}:#{pid}',
  ]);
  const panes: HostedPane[] = [];
  const elsewhere = new Set<number>();
  if (r.code !== 0) return { panes, elsewhere };
  const seen = new Set<string>();
  for (const line of r.stdout.split('\n')) {
    const [name, tmuxId, pid, dead, status, signal, created, server] = line.split(':');
    // Hires only: the roster reaps dead panes and lets go of these, never a shell or a desk.
    if (!name || !isHireName(name)) continue;
    const id = `${tmuxId}@${server}/${name}`;
    const key = `${name}\t${pid}\t${created}`;
    seen.add(key);
    if (!hirePorts.has(key)) {
      // Unreadable twice (it closed meanwhile): not ours this poll, read again on the next.
      const env = (await stamps(id)) ?? (await stamps(id));
      if (env) hirePorts.set(key, Number(env.get('CLAUDE_OFFICE_PORT')));
    }
    if (hirePorts.get(key) !== PORT) {
      if (dead !== '1') elsewhere.add(Number(pid));
      continue;
    }
    panes.push({
      tmuxName: name,
      id,
      panePid: Number(pid),
      dead: dead === '1',
      deadStatus: status ? Number(status) : undefined,
      deadSignal: signal || undefined,
      createdAt: Number(created) * 1000 || Date.now(),
    });
  }
  for (const key of hirePorts.keys()) if (!seen.has(key)) hirePorts.delete(key);
  return { panes, elsewhere };
}

/** The environment the office stamped on one of its tmux sessions, by name or pinned (null if it can't be read, or it's no longer the one pinned). */
async function stamps(target: string): Promise<Map<string, string> | null> {
  if (!isOfficeTarget(target)) return null;
  const r = await on(target, ['show-environment', '-t', `${tmuxTarget(target)}:`]);
  if (r.code !== 0 || !r.stdout) return null;
  const env = new Map<string, string>();
  for (const line of r.stdout.split('\n')) {
    const eq = line.indexOf('=');
    if (eq > 0) env.set(line.slice(0, eq), line.slice(eq + 1));
  }
  return env;
}

/** Read back the session id / name / folder the office stamped on a tmux session, by name or pinned, if any. */
export async function readOfficeMeta(target: string): Promise<OfficeMeta | null> {
  const env = await stamps(target);
  if (!env) return null;
  const sessionId = env.get('CLAUDE_OFFICE_SESSION');
  if (!sessionId || !UUID.test(sessionId)) return null;
  return { sessionId, displayName: env.get('CLAUDE_OFFICE_NAME') || undefined, cwd: env.get('CLAUDE_OFFICE_CWD') || undefined };
}

/**
 * The tmux session called `tmuxName` right now, pinned down (see PINNED), and what the office
 * stamped on it, read through the pin (null if unreadable just now). Whatever then acts on the
 * pin reaches the session whose stamp was read or nothing: never one that takes the name
 * meanwhile, nor one a new tmux server hands the id to. Null if there's none.
 */
async function pin(tmuxName: string): Promise<{ id: string; env: Map<string, string> | null } | null> {
  if (!isOfficeName(tmuxName)) return null;
  const r = await tmux(['display-message', '-p', '-t', `=${tmuxName}:`, '#{session_id}@#{pid}']);
  const id = `${r.stdout.trim()}/${tmuxName}`;
  return r.code === 0 && unpin(id) ? { id, env: await stamps(id) } : null;
}

/**
 * Hire session `tmuxName` pinned down to act on, if it's this office's (see pin). Null if it's
 * running but not this office's (another office's, stamped by none, or unreadable just now),
 * undefined if it isn't running. The roster's map can be a poll old, so this is read again right
 * before acting.
 */
export async function ownHire(tmuxName: string): Promise<string | null | undefined> {
  const p = await pin(tmuxName);
  if (!p) return (await tmux(['has-session', '-t', `=${tmuxName}`])).code === 0 ? null : undefined;
  return Number(p.env?.get('CLAUDE_OFFICE_PORT')) === PORT ? p.id : null;
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

/** Someone else's tmux session holds the name a call-back needs (rehire). */
export class NameTaken extends Error {}

/** This office's own hire is running under that name: they're here already. */
export class AlreadyHere extends Error {}

/**
 * Who holds tmux session `tmuxName`, read once: its id (see pin), the port of the office that
 * stamped it (null when none did, undefined when the stamp can't be read right now), and whether
 * everything in it has exited. Null when there's no such session.
 */
async function holder(tmuxName: string): Promise<{ id: string; port: number | null | undefined; dead: boolean } | null> {
  const p = await pin(tmuxName);
  if (!p) return null;
  const panes = await on(p.id, ['list-panes', '-s', '-t', tmuxTarget(p.id), '-F', '#{pane_dead}']);
  if (panes.code !== 0 || !panes.stdout.trim()) return null;
  return { id: p.id, port: p.env ? Number(p.env.get('CLAUDE_OFFICE_PORT')) || null : undefined, dead: panes.stdout.split('\n').filter(Boolean).every((d) => d === '1') };
}

/** `claude --resume <id>` in `cwd`. */
export async function rehire(opts: { sessionId: string; cwd: string; displayName: string }): Promise<{ tmuxName: string }> {
  const tmuxName = TMUX_PREFIX + opts.sessionId.slice(0, 8);
  const existing = (await listHosted()).panes;
  if (existing.some((p) => p.tmuxName === tmuxName && !p.dead)) throw new AlreadyHere('Already in the office');
  const own = existing.find((p) => p.tmuxName === tmuxName);
  if (own) await killDead(own.id);
  else {
    // Not in this office's list: whose is it? (Never advise killing a session someone's running in.)
    const held = await holder(tmuxName);
    if (held && held.port === PORT && !held.dead) throw new AlreadyHere('Already in the office');
    if (held && held.port === undefined) throw new NameTaken(`tmux session ${tmuxName} is in the way, and whose it is can't be read right now: try again in a moment`);
    if (held && held.port && held.port !== PORT) {
      throw new NameTaken(held.dead ? `An old session from the office on port ${held.port} is still there: tmux kill-session -t ${tmuxName}` : `They're in the office on port ${held.port} right now: let them go there first`);
    }
    if (held && held.port === null && !held.dead) throw new NameTaken(`They're running in tmux session ${tmuxName}, which no office started: let them finish there first`);
    // Left: this office's own dead hire, or a dead one from before the port stamp. Nothing runs in it.
    if (held) await killDead(held.id);
  }
  // A session another office made under the name meanwhile lives on (see killDead), and holds it.
  await newSession(tmuxName, opts.cwd, ['--resume', opts.sessionId], { sessionId: opts.sessionId, displayName: opts.displayName }).catch((err: Error) => {
    throw /duplicate session/.test(err.message) ? new NameTaken(`Someone else just called them back (tmux session ${tmuxName}): try again in a moment`) : err;
  });
  return { tmuxName };
}

/** End one of the office's tmux sessions, by name or pinned down by ownHire. */
export async function kill(target: string): Promise<void> {
  if (!isOfficeTarget(target)) throw new Error('Refusing to touch a tmux session the office did not create');
  await on(target, ['kill-session', '-t', `${tmuxTarget(target)}:`]);
}

/**
 * End the session pinned as `id` (a dead hire) if everything in it is still dead: one step inside
 * tmux, so a live session can't take its place in between, and neither can a session a new tmux
 * server hands the id to once the old one exits (another office's call-back, say).
 */
export async function killDead(id: string): Promise<void> {
  const p = unpin(id);
  if (!p) throw new Error('Not a pinned tmux session');
  await tmux(['if-shell', '-F', '-t', `${p.id}:`, `#{&&:#{pane_dead},${still(p)}}`, `kill-session -t '${p.id}'`]);
}

/**
 * Text as typed, minus anything that could act as a key inside the paste: control characters
 * (an ESC could end the bracketed paste early with `ESC[201~`) and bare carriage returns.
 */
export function pasteSafe(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '');
}

/**
 * How far say() got: all of it; stopped before the paste (a question open, their terminal away
 * from its prompt or gone, or unsent text already in their box); stopped before Enter; or Enter
 * didn't send, leaving the text in their box.
 */
export type Said = 'sent' | 'not-pasted' | 'draft' | 'not-sent' | 'held';

/**
 * Type `text` into the session's input box (bracketed paste) and press Enter. Claude can raise a
 * question at any moment, and Enter on one of its dialogs would answer it (a permission prompt's
 * first choice is Yes), so `asking` (what the office knows) and the screen are checked right
 * before the paste, and again right before Enter, which waits until the box shows the text: a
 * dialog hides the box (keeping the text in it for later). Sent, the text leaves the box.
 */
export async function say(target: string, text: string, asking: (stage: 'paste' | 'enter') => Promise<boolean> = async () => false): Promise<Said> {
  if (!isOfficeTarget(target)) throw new Error('Not an office session');
  const clean = pasteSafe(text);
  if (!clean.trim()) throw new Error('Nothing to say');
  if (await asking('paste')) return 'not-pasted';
  const box = await inputBox(target);
  if (box === null) return 'not-pasted';
  if (!box.empty) return 'draft';
  // A last word starting with : or @ opens an emoji or file menu, whose pick Enter would take,
  // and after a last \ Enter starts a new line: a space after either keeps Enter for sending.
  const typing = /(^|\s)[:@]\S*$|\\$/.test(clean) ? `${clean} ` : clean;
  const buffer = `office-say-${process.pid}-${randomUUID()}`;
  const load = await tmux(['load-buffer', '-b', buffer, '-'], { input: typing });
  if (load.code !== 0) throw new Error(load.stderr.trim() || 'tmux load-buffer failed');
  // "pasted" is printed only once the paste is done: a failing command ends the list, and on a
  // session that's no longer the one pinned neither runs.
  const paste = await on(
    target,
    ['paste-buffer', '-p', '-d', '-b', buffer, '-t', `${tmuxTarget(target)}:`],
    ['display-message', '-p', '-t', `${tmuxTarget(target)}:`, 'pasted'],
  );
  // Pasted, -d has dropped the text from tmux; not pasted, it mustn't stay there either.
  await tmux(['delete-buffer', '-b', buffer]);
  if (paste.code !== 0) throw new Error(paste.stderr.trim() || 'tmux paste-buffer failed');
  if (paste.stdout.trim() !== 'pasted') return 'not-pasted';
  // Give Claude Code's input a beat to take the paste, and up to a second more to draw it.
  for (let look = 0; ; look++) {
    await new Promise((r) => setTimeout(r, look ? 100 : 150));
    if (await asking('enter')) return 'not-sent';
    if (!(await dialogOnScreen(target, typing))) break;
    if (look === 8) return 'not-sent';
  }
  await on(target, ['send-keys', '-t', `${tmuxTarget(target)}:`, 'Enter']);
  // Sent, the text leaves the box: it empties, shows a suggested reply, or gives way to what a
  // command opens. Still there a second later (all of it, or how it starts), Enter did something
  // else there.
  for (let look = 0; look < 10; look++) {
    await new Promise((r) => setTimeout(r, 100));
    const after = await inputBox(target);
    if (after === null || after.empty || !(holds(after.typed, typing) || flat(after.typed).startsWith(flat(typing).slice(0, 16)))) return 'sent';
  }
  return 'held';
}

/**
 * The input box's edges: rules across (2.x: the top one with their name in it, or only the name
 * once the pane is narrow) or a ╭─╮ box (1.x).
 */
const TOP_EDGE = /^\s*[╭┌]?─{2,}|─$/;
const BOTTOM_EDGE = /^\s*[╰└]?─{8,}[╯┘]?$/;
/** The input box's first line starts with the prompt glyph (1.x: past the box's side), or what a typed ! (shell mode) or # (memory mode, before 2.1) turns it into. */
const BOX_HEAD = /^(?:│\s*)?([❯>!#])(?=\s|$)/;
/** A hint under the box that Enter does something else for now: a focused footer pill ("Enter to view tasks"), the agents view ("enter to return", "enter to create"). */
const ENTER_ELSEWHERE = /(?<![\w+-])enter to (?:view tasks|return|create|open)\b/i;
/** A paste or an image Claude Code folded into one token in the box: "[Pasted text #1 +39 lines]", "[Image #2]". */
const FOLDED = /\[(?:Pasted text|\.\.\.Truncated text|Image|✦ Team setup guide) #\d/;
/** Claude Code's own words in an empty box: its "Try …" example and its hints about queued messages. */
const PLACEHOLDER = /^(?:Try ".*"|Press (?:up|Enter) to (?:edit|select)\b.*)$/;
/** The footer hint Claude Code shows under the box only while nothing is typed in it. */
const EMPTY_HINT = /\? for shortcuts/;

/**
 * Text as the box shows it, to compare: Claude Code composes accents and drops zero-width
 * characters, a terminal can leave out emoji modifiers and variation selectors (tmux 3.3a draws
 * 👍🏽 as 👍), and wrapping adds spaces.
 */
const flat = (s: string) => s.normalize('NFC').replace(/[\s\p{Cf}\p{Emoji_Modifier}\p{Variation_Selector}]/gu, '');

/** Whether the box shows exactly `typing` (however it wraps it), or for a paste long enough to fold (over 800 characters or 3 lines) only its "[Pasted text #N]". */
function holds(typed: string, typing: string): boolean {
  const folds = typing.length > 800 || typing.split('\n').length > 3;
  return reads(flat(typed), flat(typing)) || stale(typed, typing) || (folds && /^\[(?:Pasted text|\.\.\.Truncated text) #\d+[^\]]*\]$/.test(typed));
}

/**
 * Whether one row of the box shows `typing` but for the cells of emoji the terminal didn't draw,
 * which keep whatever was there before (tmux 3.3a leaves letters of the "Try …" placeholder in a
 * new hire's box): each such emoji covers exactly its two cells, everything else matches exactly
 * and in place, spaces too, and some of it is more than emoji and spaces.
 */
function stale(typed: string, typing: string): boolean {
  if (typed.includes('\n') || /[\n\t]/.test(typing)) return false;
  const cells = (s: string) => [...s.normalize('NFC').replace(/[\p{Cf}\p{Emoji_Modifier}\p{Variation_Selector}]/gu, '').replace(/\u00a0/g, ' ').trim()];
  const shown = cells(typed);
  const want = cells(typing);
  if (!shown.length || !want.some((c) => c !== ' ' && !EMOJI.test(c))) return false;
  let at = new Set([0]);
  for (const c of want) {
    const next = new Set<number>();
    for (const i of at) {
      if (shown[i] === c) next.add(i + 1);
      if (EMOJI.test(c)) {
        if (i + 2 <= shown.length && !EMOJI.test(shown[i]) && !EMOJI.test(shown[i + 1])) next.add(i + 2);
        // Its cells at the end of the row, trimmed off with the row's trailing blanks.
        if (i + 2 > shown.length) next.add(shown.length);
      } else if (c === ' ' && i === shown.length) next.add(i);
    }
    if (!next.size) return false;
    at = next;
  }
  return at.has(shown.length);
}

/** An emoji a terminal may not know how to draw: one newer than its tmux. */
const EMOJI = /\p{Extended_Pictographic}/u;

/**
 * Whether `shown` reads as `want` (both flat), each emoji in `want` drawn as itself, as "_" or
 * U+FFFD, or as blank cells (tmux 3.3a and Unicode 15's 🫨 🪿): one emoji stands for one
 * character at most, never for text that isn't there.
 */
function reads(shown: string, want: string): boolean {
  if (shown === want) return true;
  if (!shown) return false;
  const cells = [...shown];
  let at = new Set([0]);
  for (const c of want) {
    const next = new Set<number>();
    for (const i of at) {
      if (cells[i] === c) next.add(i + 1);
      if (EMOJI.test(c)) {
        next.add(i);
        if (cells[i] === '_' || cells[i] === '\ufffd') next.add(i + 1);
      }
    }
    if (!next.size) return false;
    at = next;
  }
  return at.has(cells.length);
}

/**
 * Would Enter answer one of Claude Code's dialogs, or send something else, rather than send
 * `typing` from its input box? Yes while the box isn't on screen (a dialog or menu has the keys:
 * it hides the box) or Enter does something else under it, and yes unless the box holds exactly
 * `typing`. With no `typing`, only whether the box is out of reach.
 */
export async function dialogOnScreen(target: string, typing = ''): Promise<boolean> {
  const box = await inputBox(target);
  return box === null || (!!typing && !holds(box.typed, typing));
}

/** The folder-trust prompt a new hire meets first, in 2.1's words and 1.x's. */
const TRUST_PROMPT = /Accessing workspace:|Quick safety check|Do you trust the files in this folder/i;

/** Is the folder-trust prompt up on `target`: its words on screen, and no input box (Claude's own replies could quote them)? */
export async function trustPromptUp(target: string): Promise<boolean> {
  const r = await on(target, ['capture-pane', '-p', '-t', `${tmuxTarget(target)}:`]);
  return r.code === 0 && TRUST_PROMPT.test(r.stdout) && (await inputBox(target)) === null;
}

/**
 * Claude Code's input box on `target`'s screen: what's in it as drawn (`typed`), and whether
 * that's nothing but ghost text (`empty`). Null if the box isn't on screen, or a hint under it
 * says Enter does something else. The box is the last prompt line right under a rule, down to
 * the next plain rule: a dialog's choices and the echoes of sent messages never sit right under
 * a rule. Ghost text ("Try …", a suggested reply, an argument hint) follows the cursor, drawn
 * dim. Without any styles (NO_COLOR) it's drawn plain, so with the cursor at its start or not
 * drawn (their terminal unfocused) it's known by Claude Code's own words, or by the footer hint
 * shown only while nothing is typed. Anything else counts as typed, and so does a folded paste.
 */
async function inputBox(target: string): Promise<{ typed: string; empty: boolean } | null> {
  const r = await on(target, ['capture-pane', '-p', '-e', '-t', `${tmuxTarget(target)}:`]);
  if (r.code !== 0) return null;
  const rows = screenRows(r.stdout);
  for (let top = rows.length - 1; top > 0; top--) {
    if (!BOX_HEAD.test(rows[top].text) || !TOP_EDGE.test(rows[top - 1].text)) continue;
    const bottom = rows.findIndex((row, i) => i > top && BOTTOM_EDGE.test(row.text));
    if (bottom < 0) continue;
    if (rows.slice(bottom + 1).some((row) => ENTER_ELSEWHERE.test(row.text))) return null;
    const box = rows.slice(top, bottom);
    // A row without the prompt glyph or a 1.x box's sides. In shell mode, the ! was typed.
    const inside = (s: string, i: number) => (i ? s.replace(/^\s*│/, '') : s.replace(BOX_HEAD, '')).replace(/\s*│$/, '').trim();
    const glyph = BOX_HEAD.exec(box[0].text)?.[1];
    const mode = glyph === '!' || glyph === '#' ? glyph : '';
    const typed = mode + box.map((row, i) => inside(row.typed, i)).join('\n').trim();
    // Claude Code draws the box's edge in a colour, unless it draws no styles at all.
    const cursor = box.findIndex((row) => row.cursor >= 0);
    const atStart = cursor < 0 || (cursor === 0 && !inside(box[0].text.slice(0, box[0].cursor), 0));
    const known = PLACEHOLDER.test(box.map((row, i) => inside(row.text, i)).join('')) || rows.slice(bottom + 1).some((row) => EMPTY_HINT.test(row.text));
    const placeholder = !rows[top - 1].styled && atStart && known;
    const folded = FOLDED.test(box.map((row) => row.text).join('\n'));
    // Blank cells before a cursor were typed too: what the terminal can't draw (tmux 3.3a and
    // Unicode 15 emoji), which can leave a second cursor drawn further on.
    const blanks = cursor === 0 && box[0].lastCursor > (BOX_HEAD.exec(box[0].text)?.[0].length ?? 0) + 1;
    return { typed: placeholder ? '' : typed, empty: !mode && !folded && !blanks && (placeholder || !typed) };
  }
  return null;
}

/**
 * `capture-pane -e` output as rows: `text` as drawn; `typed`, what's left once ghost text is out:
 * all the cells before the cursor (the first inverse cell, at `cursor`; -1 for none), the ones
 * after it unless drawn dim; `lastCursor`, where the last inverse cell starts; `styled`, whether
 * any cell is dim or coloured. Attributes carry over from one row to the next, as tmux writes them.
 */
function screenRows(out: string): { text: string; typed: string; cursor: number; lastCursor: number; styled: boolean }[] {
  const rows: { text: string; typed: string; cursor: number; lastCursor: number; styled: boolean }[] = [];
  let text = '';
  let undim = '';
  let after = '';
  let cursor = -1;
  let lastCursor = -1;
  let styled = false;
  let dim = false;
  let inverse = false;
  let colour = false;
  const row = () => rows.push({ text: text.trimEnd(), typed: (cursor < 0 ? undim : text.slice(0, cursor) + after).trimEnd(), cursor, lastCursor, styled });
  for (const [token, sgr] of out.matchAll(/\x1b\[([\d;:]*)m|\x1b\[[\d;:?<=>]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?|\x1b.?|\n|[^\x1b\n]+/g)) {
    if (token === '\n') {
      row();
      text = undim = after = '';
      cursor = lastCursor = -1;
      styled = false;
    } else if (sgr !== undefined) {
      const codes = sgr.split(';');
      for (let i = 0; i < codes.length; i++) {
        const c = codes[i];
        if (c === '' || c === '0') dim = inverse = colour = false;
        else if (c === '2' || c === '22') dim = c === '2';
        else if (c === '7' || c === '27') inverse = c === '7';
        else if (/^(3[0-7]|39|9[0-7])$/.test(c)) colour = c !== '39';
        // 38;5;n and 38;2;r;g;b (and 48, 58 for the background and underline): colours, whose
        // numbers aren't attributes.
        else if (c === '38' || c === '48' || c === '58') {
          colour ||= c === '38';
          i += codes[i + 1] === '5' ? 2 : codes[i + 1] === '2' ? 4 : 0;
        }
      }
    } else if (token[0] !== '\x1b') {
      if (inverse && cursor < 0) cursor = text.length;
      if (inverse) lastCursor = text.length;
      if (dim || colour) styled = true;
      text += token;
      if (!dim && !inverse) {
        undim += token;
        if (cursor >= 0) after += token;
      }
    }
  }
  row();
  return rows;
}

/** Press Esc in the session (Claude Code's interrupt). */
export async function interrupt(target: string): Promise<void> {
  if (!isOfficeTarget(target)) throw new Error('Not an office session');
  await on(target, ['send-keys', '-t', `${tmuxTarget(target)}:`, 'Escape']);
}

/** Last lines of the visible screen, for the desk monitor. */
export async function capture(target: string, maxLines = 18, maxCols = 80): Promise<string[]> {
  const r = await on(target, ['capture-pane', '-p', '-t', `${tmuxTarget(target)}:`]);
  if (r.code !== 0) return [];
  const lines = r.stdout.split('\n').map((l) => l.replace(/\s+$/, ''));
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines
    .filter((l) => l.trim())
    .slice(-maxLines)
    .map((l) => (l.length > maxCols ? cut(l, maxCols) : l));
}
