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
  return withGrace(entries.filter((e) => {
    const p = live.get(e.pid);
    if (!p) return false;
    // Registry files can outlive their process, and pids get recycled. Claude records the
    // process start time (in UTC) as procStart; a match proves it's the same process.
    // Otherwise accept anything that is still a claude binary.
    if (e.procStart && squash(e.procStart) === squash(p.lstart)) return true;
    return /claude/i.test(basename(p.comm));
  }));
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
