// Live sessions, straight from Claude Code's own registry: ~/.claude/sessions/<pid>.json.
// Never read the sibling *.key files: they are secrets.
import { access, readdir, readFile, readlink, stat, unlink } from 'node:fs/promises';
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
/** The kinds the office knows; one it doesn't is logged once. */
const KNOWN = new Set(['interactive', ...BACKGROUND]);
const newKinds = new Set<string>();

/** Pids of the sessions the last read left out on purpose (spares, thought bubbles, BACKGROUND). */
let leftOut = new Set<number>();

export async function readRegistry(): Promise<RegistryEntry[]> {
  let files: string[];
  try {
    files = await readdir(SESSIONS_DIR);
  } catch {
    return [];
  }
  let entries: RegistryEntry[] = [];
  const skipped = new Set<number>();
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
          if (e.spare || e.cwd === THINK_DIR || BACKGROUND.has(String(e.kind))) skipped.add(e.pid);
          else entries.push(e);
        } catch {
          // Being rewritten right now, or not ours to understand. Next poll will catch it.
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
  const live = await liveProcesses(entries.map((e) => e.pid));
  const digits = entries.filter((e) => /^\d+$/.test(String(e.procStart ?? '')));
  const most = digits.length ? await mostTicks() : null;
  const ticks = new Map(
    await Promise.all(digits.filter((e) => most !== null && Number(e.procStart) <= most).map(async (e) => [e.pid, await startTicks(e.pid)] as const)),
  );
  return withGrace([...unchecked, ...entries.filter((e) => {
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
  })]);
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

/** Registry files touched more recently than this are never pruned: a session just starting may not show its process yet. */
const PRUNE_AFTER_MS = 60 * 60_000;
/** Room for clock jitter when a time is compared with the boot. */
const BOOT_SLACK_MS = 60_000;
const KEY_FILE = /^(\d+)\.[0-9a-f]+\.key$/;
/** pidDomain exactly as Claude Code writes it on Linux. Anything else is a shape the pruner doesn't judge. */
const LINUX_DOMAIN = /^linux:([0-9a-f]+):pid:\[(\d+)\]$/;
/** A time in ms since 1970 (Claude Code's startedAt and updatedAt), not seconds or junk. */
const isMs = (t: unknown): t is number => typeof t === 'number' && Number.isFinite(t) && t > 1e12;

/**
 * Deletes what Claude Code leaves in its registry when a session is killed or the machine
 * restarts, which nothing else ever removes. Only entries it can prove are gone, and only ones
 * whose pidDomain names this machine (it trusts /etc/machine-id to name one machine, as systemd
 * requires): one that started and was last written before boot, in any PID namespace, and one in
 * this office's namespace whose process has ended or is now another process (start ticks). Also
 * files an unclean shutdown left unreadable, from before boot, and the *.key files that go with
 * all of these (unlinked by name, never read). A key whose pid has a kept entry stays, and so
 * does anything touched within the hour, any entry with no pidDomain or one in another shape,
 * and everything off Linux. Each file is checked again right before it goes. Returns the names
 * of the files it removed.
 */
export async function pruneRegistry(): Promise<string[]> {
  if (process.platform !== 'linux') return [];
  const [own, machine, btime, most, files, version, mounts] = await Promise.all([
    ownPidDomain(),
    ownMachineId(),
    bootedAt(),
    mostTicks(),
    readdir(SESSIONS_DIR).catch(() => null),
    readFile('/proc/version', 'utf8').catch(() => ''),
    readFile('/proc/mounts', 'utf8').catch(() => null),
  ]);
  const ownNs = own === null ? undefined : NAMESPACE.exec(own)?.[1];
  if (!ownNs || machine === null || btime === null || files === null) return [];
  // btime is now minus uptime, so a stepped clock moves it later than the real boot. /run is made
  // at boot (or when the distro or container starts): the earlier of the two is never later.
  const runMade = await stat('/run').then((s) => s.birthtimeMs, () => 0);
  const boot = (runMade > 0 ? Math.min(btime, runMade) : btime) - BOOT_SLACK_MS;
  // WSL keeps each distro's files to itself, so every session that wrote here ran in this distro,
  // which started when /run was made. Anywhere else a container or another kernel could share this
  // folder and started before /run, so "before boot" also takes start ticks this boot hasn't
  // reached yet, which no clock step can fake.
  const wsl = /microsoft/i.test(version);
  // hidepid hides other users' processes: then a pid missing from /proc proves nothing.
  const pidsVisible = mounts !== null && !/^\S+ \/proc proc \S*hidepid=(?!0\b|off\b)/m.test(mounts);
  const cutoff = Date.now() - PRUNE_AFTER_MS;
  const alive = (pid: number) => access(`/proc/${pid}`).then(() => true, () => false);
  const ticksPast = (e: RegistryEntry) => /^\d+$/.test(String(e.procStart ?? '')) && most !== null && Number(e.procStart) > most;
  const beforeBoot = (e: RegistryEntry) => {
    const written = e.updatedAt ?? e.startedAt;
    return isMs(e.startedAt) && e.startedAt < boot && isMs(written) && written < boot && (wsl || ticksPast(e));
  };
  // Same pid, another process: the start ticks differ (when they're ticks, not some other format).
  const reused = async (e: RegistryEntry) => {
    const start = String(e.procStart ?? '');
    if (!/^\d+$/.test(start) || most === null || Number(start) > most) return false;
    const t = await startTicks(e.pid);
    return t !== null && t !== start;
  };
  const keep = new Set<number>();
  const doomed: { f: string; ino: number; mtime: number; orphan: boolean }[] = [];
  const doomedPids = new Set<number>();
  for (const f of files.filter((f) => REGISTRY_FILE.test(f))) {
    const pid = Number.parseInt(f, 10);
    const path = join(SESSIONS_DIR, f);
    const st = await stat(path).catch(() => null);
    if (!st) continue;
    if (st.mtimeMs > cutoff) {
      keep.add(pid);
      continue;
    }
    let e: unknown;
    let unreadable = false;
    try {
      e = JSON.parse(await readFile(path, 'utf8'));
    } catch {
      unreadable = true;
    }
    let gone = false;
    if (unreadable) gone = st.mtimeMs < boot && pidsVisible && !(await alive(pid));
    else if (e && typeof e === 'object' && (e as RegistryEntry).pid === pid && typeof (e as RegistryEntry).sessionId === 'string') {
      const entry = e as RegistryEntry;
      const domain = LINUX_DOMAIN.exec(typeof entry.pidDomain === 'string' ? entry.pidDomain : '');
      if (domain && domain[1] === machine) {
        if (beforeBoot(entry)) gone = true;
        else if (domain[2] === ownNs && pidsVisible) gone = !(await alive(pid)) || (await reused(entry));
      }
    }
    if (gone) {
      doomed.push({ f, ino: st.ino, mtime: st.mtimeMs, orphan: false });
      doomedPids.add(pid);
    } else keep.add(pid);
  }
  for (const f of files) {
    const m = KEY_FILE.exec(f);
    if (!m || keep.has(Number(m[1]))) continue;
    const pid = Number(m[1]);
    const st = await stat(join(SESSIONS_DIR, f)).catch(() => null);
    if (!st || st.mtimeMs > cutoff) continue;
    if (doomedPids.has(pid)) doomed.push({ f, ino: st.ino, mtime: st.mtimeMs, orphan: false });
    else if ((wsl && st.mtimeMs < boot) || (pidsVisible && !(await alive(pid)))) doomed.push({ f, ino: st.ino, mtime: st.mtimeMs, orphan: true });
  }
  const removed: string[] = [];
  for (const d of doomed) {
    const path = join(SESSIONS_DIR, d.f);
    // Judged a moment ago: skip it if it has changed since (a new session on a reused pid), or if a
    // key with no entry has gained one.
    const st = await stat(path).catch(() => null);
    if (!st || st.ino !== d.ino || st.mtimeMs !== d.mtime) continue;
    if (d.orphan && (await access(join(SESSIONS_DIR, `${Number.parseInt(d.f, 10)}.json`)).then(() => true, () => false))) continue;
    try {
      await unlink(path);
      removed.push(d.f);
    } catch {
      // Gone already (the session exited, or another office got there first).
    }
  }
  return removed;
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
