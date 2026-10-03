// Live sessions, straight from Claude Code's own registry: ~/.claude/sessions/<pid>.json.
// Never read the sibling *.key files: they are secrets.
import { readdir, readFile } from 'node:fs/promises';
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
}

const REGISTRY_FILE = /^\d+\.json$/;

export async function readRegistry(): Promise<RegistryEntry[]> {
  let files: string[];
  try {
    files = await readdir(SESSIONS_DIR);
  } catch {
    return [];
  }
  const entries: RegistryEntry[] = [];
  await Promise.all(
    files
      .filter((f) => REGISTRY_FILE.test(f))
      .map(async (f) => {
        try {
          const e = JSON.parse(await readFile(join(SESSIONS_DIR, f), 'utf8')) as RegistryEntry;
          if (typeof e.pid === 'number' && typeof e.sessionId === 'string' && typeof e.cwd === 'string' && !e.spare && e.cwd !== THINK_DIR) {
            entries.push(e);
          }
        } catch {
          // Being rewritten right now, or not ours to understand. Next poll will catch it.
        }
      }),
  );
  const live = await liveProcesses(entries.map((e) => e.pid));
  const digits = entries.filter((e) => /^\d+$/.test(String(e.procStart ?? '')));
  const most = digits.length ? await mostTicks() : null;
  const ticks = new Map(
    await Promise.all(digits.filter((e) => most !== null && Number(e.procStart) <= most).map(async (e) => [e.pid, await startTicks(e.pid)] as const)),
  );
  return withGrace(entries.filter((e) => {
    const p = live.get(e.pid);
    if (!p) return false;
    // Registry files can outlive their process, and pids get recycled. Claude records when the
    // process started as procStart. On Linux that's clock ticks since boot, exact: only that
    // very process is this session (all digits but more than the machine has ticked since boot
    // is some other format, so it gets the checks below). On macOS it's ps's lstart (in UTC): a
    // match proves it's the same process. Otherwise accept anything that is still a claude binary.
    const start = String(e.procStart ?? '');
    const t = ticks.get(e.pid);
    if (t) return t === start;
    if (start && squash(start) === squash(p.lstart)) return true;
    return /claude/i.test(basename(p.comm));
  }));
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

/** How many Claude Code processes are running (to tell "nobody's here" from "can't read the registry"). */
export async function claudeProcessCount(): Promise<number> {
  const r = await run('ps', ['-axo', 'comm=']);
  return r.stdout.split('\n').filter((c) => /(^|\/)claude(\.exe)?$/i.test(c.trim())).length;
}
