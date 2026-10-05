// Live sessions, straight from Claude Code's own registry: ~/.claude/sessions/<pid>.json.
// Never read the sibling *.key files: they are secrets.
import { readdir, readFile, readlink } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { SESSIONS_DIR, THINK_DIR } from './config';
import { run } from './exec';

export interface RegistryEntry {
  pid: number;
  sessionId: string;
  cwd: string;
  startedAt?: number;
  procStart?: string;
  version?: string;
  /** "interactive", "bg", "daemon" or "daemon-worker" (Claude Code 2.1; none before): see BACKGROUND. */
  kind?: string;
  /** How it was started: "cli" (someone at a terminal), or "sdk-cli" / "sdk-ts" (a program, through the Agent SDK): see isSdk. */
  entrypoint?: string;
  name?: string;
  nameSource?: string;
  /** "busy" | "idle" | "waiting" */
  status?: string;
  waitingFor?: string;
  statusUpdatedAt?: number;
  updatedAt?: number;
  spare?: unknown;
  /** The PID namespace the session runs in: "linux:<machine id>:pid:[4026531836]", or "darwin". */
  pidDomain?: string;
  /**
   * Set by readRegistry, not Claude Code: the session runs in another PID namespace than this
   * office (the office in a container, Claude on the host, or the other way round), so its pid
   * means nothing here and can't be checked. It's shown until its registry file goes, unless it
   * ran on this machine and started before the machine booted: then it's gone.
   */
  pidUnchecked?: boolean;
}

const REGISTRY_FILE = /^\d+\.json$/;

/**
 * Claude Code's kinds of session that aren't anyone at work, so they never walk in. Its daemon
 * runs them out of sight, with no terminal the office could open or type into: "bg" (the spares,
 * forks and background jobs behind its agents view, ← on an empty prompt) and "daemon" /
 * "daemon-worker" (its own). "interactive" is someone at a terminal: a hire, or a session you
 * started yourself. A kind Claude Code adds later is shown, the way "interactive" is.
 */
const BACKGROUND = new Set(['bg', 'daemon', 'daemon-worker']);
/**
 * Sessions a program drives through the Agent SDK (entrypoint "sdk-cli", "sdk-ts", ...), not
 * someone at a terminal: a plugin's helpers (claude-mem's observers, which it starts all day),
 * scripts, the office's own thought bubbles. Claude Code still registers them as "interactive",
 * but there's no terminal to sit at and often no transcript, so they never walk in either.
 */
const isSdk = (e: RegistryEntry) => typeof e.entrypoint === 'string' && e.entrypoint.startsWith('sdk-');
/** The kinds the office knows; one it doesn't is logged once. */
const KNOWN = new Set(['interactive', ...BACKGROUND]);
const newKinds = new Set<string>();

/** Pids of the sessions the last read left out on purpose (spares, thought bubbles, BACKGROUND, SDK sessions). */
let leftOut = new Set<number>();
/**
 * Session ids of the hidden ones a program drives (Agent SDK) or Claude Code runs in the
 * background: off the roster, but maybe running. The archive counts them as live and a call-back
 * refuses them, so the office never starts a second copy of a session that's still going.
 */
let hiddenIds = new Set<string>();
/** The same, by pid: a hidden session's file caught mid-rewrite keeps its id for that poll. */
let hiddenByPid = new Map<number, string>();

/** Sessions left off the roster on purpose that may still be running (see hiddenIds). */
export function hiddenSessions(): ReadonlySet<string> {
  return hiddenIds;
}

export async function readRegistry(): Promise<RegistryEntry[]> {
  let files: string[];
  try {
    files = await readdir(SESSIONS_DIR);
  } catch {
    return [];
  }
  let entries: RegistryEntry[] = [];
  const skipped = new Set<number>();
  let hiddenEntries: RegistryEntry[] = [];
  const unreadable = new Set<number>();
  await Promise.all(
    files
      .filter((f) => REGISTRY_FILE.test(f))
      .map(async (f) => {
        try {
          const e = JSON.parse(await readFile(join(SESSIONS_DIR, f), 'utf8')) as RegistryEntry;
          if (typeof e.pid !== 'number' || typeof e.sessionId !== 'string' || typeof e.cwd !== 'string') return;
          if (typeof e.kind === 'string' && !KNOWN.has(e.kind) && !newKinds.has(e.kind)) {
            newKinds.add(e.kind);
            console.warn(`[registry] Claude Code writes a new kind of session, "${e.kind}": shown like "interactive"`);
          }
          if (e.spare || e.cwd === THINK_DIR || BACKGROUND.has(String(e.kind)) || isSdk(e)) {
            skipped.add(e.pid);
            if (BACKGROUND.has(String(e.kind)) || isSdk(e)) hiddenEntries.push(e);
          } else entries.push(e);
        } catch {
          // Being rewritten right now, or not ours to understand. Next poll will catch it.
          unreadable.add(Number.parseInt(f, 10));
        }
      }),
  );
  leftOut = skipped;
  const own = await ownPidDomain();
  const boot = await bootedAt();
  const machine = await ownMachineId();
  // Every PID namespace on this machine runs on its one kernel, so a session here that started
  // before the kernel booted is gone, whichever namespace it ran in. WSL starts a new namespace
  // each time it restarts, and the sessions a restart cut off never remove their files. Boot
  // time is now minus uptime, so a stepped clock (a VM after its host slept) can move it later
  // than the real boot: the entry must also have been written before it, as a live session
  // rewrites its entry when it works.
  const gone = (e: RegistryEntry) =>
    boot !== null && onThisMachine(e.pidDomain, machine) && (e.startedAt ?? Infinity) < boot && (e.updatedAt ?? e.startedAt ?? Infinity) < boot;
  const unchecked = entries.filter((e) => elsewhere(e.pidDomain, own) && !gone(e)).map((e) => ({ ...e, pidUnchecked: true }));
  entries = entries.filter((e) => !elsewhere(e.pidDomain, own));
  // Hidden sessions (Agent SDK, background) get the same liveness checks, so only running ones
  // keep their ids (see hiddenIds); in another namespace they count unless gone since boot.
  const hiddenElsewhere = hiddenEntries.filter((e) => elsewhere(e.pidDomain, own) && !gone(e));
  hiddenEntries = hiddenEntries.filter((e) => !elsewhere(e.pidDomain, own));
  const checked = [...entries, ...hiddenEntries];
  const live = await liveProcesses(checked.map((e) => e.pid));
  const digits = checked.filter((e) => /^\d+$/.test(String(e.procStart ?? '')));
  const most = digits.length ? await mostTicks() : null;
  const ticks = new Map(
    await Promise.all(digits.filter((e) => most !== null && Number(e.procStart) <= most).map(async (e) => [e.pid, await startTicks(e.pid)] as const)),
  );
  const running = (e: RegistryEntry) => {
    const p = live.get(e.pid);
    if (!p) return false;
    // Registry files can outlive their process, and pids get recycled. Claude records when the
    // process started as procStart. On Linux that's clock ticks since boot, exact: only that
    // very process is this session (all digits but more than the machine has ticked since boot
    // is some other format, so it gets the checks below). On macOS it's ps's lstart (in UTC): a
    // match proves it's the same process. Otherwise accept anything that is still a claude binary,
    // unless the session started before the machine booted (Linux): its pid is another's now.
    const start = String(e.procStart ?? '');
    const t = ticks.get(e.pid);
    if (t) return t === start;
    if (start && squash(start) === squash(p.lstart)) return true;
    if (boot !== null && (e.startedAt ?? Infinity) < boot) return false;
    return /claude/i.test(basename(p.comm));
  };
  const nextHidden = new Map<number, string>([...hiddenElsewhere, ...hiddenEntries.filter(running)].map((e) => [e.pid, e.sessionId]));
  // A file caught mid-rewrite this poll: a session hidden last poll stays hidden-and-running.
  for (const pid of unreadable) {
    const id = hiddenByPid.get(pid);
    if (id && !nextHidden.has(pid)) nextHidden.set(pid, id);
  }
  hiddenByPid = nextHidden;
  hiddenIds = new Set(nextHidden.values());
  return withGrace([...unchecked, ...entries.filter(running)]);
}

let ownDomain: string | null | undefined;

/** This office's PID namespace, in pidDomain's terms: "linux::pid:[N]" (/proc/self/ns/pid; no machine id, as elsewhere() never compares it) or "darwin". Null if unknown. */
async function ownPidDomain(): Promise<string | null> {
  if (ownDomain === undefined) {
    if (process.platform === 'darwin') ownDomain = 'darwin';
    else ownDomain = await readlink('/proc/self/ns/pid').then((ns) => `linux::${ns}`, () => null);
  }
  return ownDomain;
}

let ownMachine: string | null | undefined;

/** This machine's id (/etc/machine-id), which Claude Code writes into pidDomain. Null if unknown. */
async function ownMachineId(): Promise<string | null> {
  if (ownMachine === undefined) ownMachine = await readFile('/etc/machine-id', 'utf8').then((id) => id.trim() || null, () => null);
  return ownMachine;
}

/**
 * Whether a pidDomain names this machine: Claude Code writes "linux:<machine id>:pid:[N]". One
 * with no id, or another id (a container's own), can't be tied to this kernel's boot.
 */
function onThisMachine(domain: unknown, machine: string | null): boolean {
  return machine !== null && typeof domain === 'string' && /^linux:([^:]+):/.exec(domain)?.[1] === machine;
}

const NAMESPACE = /pid:\[(\d+)\]/;
const OS = (domain: string) => /^(linux|darwin|win32)(?=:|$)/.exec(domain)?.[1];

/**
 * Whether a session's pidDomain is another PID namespace than this office's: another OS (a
 * Linux container's session read on a Mac), or another Linux namespace. Unknown on either
 * side (an older Claude Code writes none): no, so the pid gets the usual checks.
 */
function elsewhere(domain: unknown, own: string | null): boolean {
  if (typeof domain !== 'string' || !domain || own === null) return false;
  const [theirs, ours] = [OS(domain), OS(own)];
  if (theirs && ours && theirs !== ours) return true;
  const [a, b] = [NAMESPACE.exec(domain)?.[1], NAMESPACE.exec(own)?.[1]];
  return !!a && !!b && a !== b;
}

/**
 * When `pid` started, in clock ticks since boot (field 22 of /proc/<pid>/stat), the way
 * Claude Code writes procStart on Linux. Null without /proc (macOS) or if it can't be read.
 */
async function startTicks(pid: number): Promise<string | null> {
  try {
    const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
    // Field 2 is the command in parentheses, which can hold spaces and ')': count from the last ')'.
    return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19] ?? null;
  } catch {
    return null;
  }
}

let bootMs: number | null | undefined;

/** When the machine booted, in ms (btime in /proc/stat, to the second). Null without /proc (macOS). */
async function bootedAt(): Promise<number | null> {
  if (bootMs === undefined) {
    try {
      const m = /^btime (\d+)$/m.exec(await readFile('/proc/stat', 'utf8'));
      bootMs = m ? Number(m[1]) * 1000 : null;
    } catch {
      bootMs = null;
    }
  }
  return bootMs;
}

let clockTicks = 0;

/** The most clock ticks a process can have started at: uptime × CLK_TCK. Null without /proc (macOS). */
async function mostTicks(): Promise<number | null> {
  try {
    const uptime = Number((await readFile('/proc/uptime', 'utf8')).split(' ')[0]);
    clockTicks ||= Number((await run('getconf', ['CLK_TCK'])).stdout.trim()) || 100;
    return Number.isFinite(uptime) ? Math.ceil((uptime + 1) * clockTicks) : null;
  } catch {
    return null;
  }
}

/** `sessionId`'s status in Claude Code's registry right now ("busy", "idle" or "waiting"), read from its file. */
export async function sessionStatus(pid: number, sessionId: string): Promise<string | undefined> {
  try {
    const e = JSON.parse(await readFile(join(SESSIONS_DIR, `${pid}.json`), 'utf8')) as RegistryEntry;
    return e.sessionId === sessionId ? e.status : undefined;
  } catch {
    return undefined;
  }
}

/** Sessions on the last poll, and the ones missing from it for the first time. */
let lastSeen = new Map<string, RegistryEntry>();
const graced = new Set<string>();

/**
 * One bad read (a registry file caught mid-rewrite, a ps that failed) must not make
 * everyone stand up and walk out: a session missing from one poll is kept for that poll,
 * and only gone once it's missing twice in a row (a real exit shows up a second later).
 */
function withGrace(fresh: RegistryEntry[]): RegistryEntry[] {
  const out = new Map(fresh.map((e) => [e.sessionId, e]));
  for (const id of graced) if (out.has(id)) graced.delete(id);
  for (const [id, e] of lastSeen) {
    if (out.has(id)) continue;
    if (graced.delete(id)) continue;
    graced.add(id);
    out.set(id, e);
  }
  lastSeen = out;
  return [...out.values()];
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

async function liveProcesses(pids: number[]): Promise<Map<number, { lstart: string; comm: string }>> {
  const out = new Map<number, { lstart: string; comm: string }>();
  if (!pids.length) return out;
  // `lstart` is 5 whitespace-separated fields ("Thu Oct  1 15:12:59 2026"); comm is last.
  // TZ=UTC because that's how Claude Code writes procStart.
  const r = await run('ps', ['-o', 'pid=,lstart=,comm=', '-p', pids.join(',')], { env: { TZ: 'UTC' } });
  for (const line of r.stdout.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\S+\s+\S+\s+\d+\s+[\d:]+\s+\d+)\s+(.+)$/);
    if (m) out.set(Number(m[1]), { lstart: m[2], comm: m[3] });
  }
  return out;
}

/** Claude Code's daemon and the helpers it runs: its processes, not sessions. */
const DAEMON = /\sdaemon run\b|--bg-pty-host\b|--bg-spare\b/;

/**
 * How many Claude Code processes are running that the roster should show (to tell "nobody's
 * here" from "can't read the registry"): not the sessions the last read left out on purpose,
 * nor Claude Code's daemon and its helpers.
 */
export async function claudeProcessCount(): Promise<number> {
  const r = await run('ps', ['-axo', 'pid=,comm=']);
  const pids = r.stdout
    .split('\n')
    .map((l) => /^\s*(\d+)\s+(.+)$/.exec(l))
    .filter((m): m is RegExpExecArray => !!m && /(^|\/)claude(\.exe)?$/i.test(m[2].trim()) && !leftOut.has(Number(m[1])))
    .map((m) => m[1]);
  if (!pids.length) return 0;
  const args = await run('ps', ['-o', 'args=', '-p', pids.join(',')]);
  return args.stdout.split('\n').filter((a) => a.trim() && !DAEMON.test(a)).length;
}
