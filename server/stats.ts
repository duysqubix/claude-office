// Live numbers for the Team Room wall: plan usage, team totals, context fill per employee.
//
// Plan usage: Claude Code reports rate limits to status-line programs. The office reads
// whichever snapshot is freshest (no credentials involved):
//   ~/.claude/plugins/oh-my-claudecode/.usage-cache-*.json   oh-my-claudecode HUD: five-hour, weekly, per-model
//   ~/.omc/state/hud-stdin-cache.json                       oh-my-claudecode HUD: last status-line input
//   ~/.claude-office/statusline.json                        the office's own tap (npm run statusline:install)
// Without any of them, plan.updatedAt is null and the board says it's waiting for data.
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { ContextFill, Employee, PlanLimit, TeamStats } from '../shared/protocol';
import { CLAUDE_HOME, HOME, PROJECTS_DIR } from './config';
import { run } from './exec';

const PLAN_TTL_MS = 10_000;
const SLOW_TTL_MS = 60_000;

interface Plan {
  limits: PlanLimit[];
  updatedAt: number | null;
}

export interface ContextSource {
  contextTokens(sessionId: string): number | undefined;
  linesChanged(sessionId: string): { added: number; removed: number } | undefined;
}

export class StatsService {
  private plan: Plan = { limits: [], updatedAt: null };
  private planAt = 0;
  private slow = { commitsToday: 0, sessionsToday: 0 };
  private slowAt = 0;
  private windowByModel = new Map<string, number>();

  async build(employees: Employee[], ctx: ContextSource): Promise<TeamStats> {
    const now = Date.now();
    if (now - this.planAt > PLAN_TTL_MS) {
      this.planAt = now;
      this.plan = await readPlan(this.windowByModel).catch(() => this.plan);
    }
    if (now - this.slowAt > SLOW_TTL_MS) {
      this.slowAt = now;
      this.slow = await slowNumbers(employees).catch(() => this.slow);
    }

    let costUSD = 0;
    let linesAdded = 0;
    let linesRemoved = 0;
    const context: ContextFill[] = [];
    for (const e of employees) {
      costUSD += e.costUSD ?? 0;
      const lines = ctx.linesChanged(e.sessionId);
      linesAdded += lines?.added ?? 0;
      linesRemoved += lines?.removed ?? 0;
      const tokens = ctx.contextTokens(e.sessionId);
      if (tokens === undefined) continue;
      const windowSize = this.windowByModel.get(e.model ?? '') ?? defaultWindow(e.model);
      context.push({ sessionId: e.sessionId, displayName: e.displayName, tokens, windowSize, pct: Math.min(100, Math.round((tokens / windowSize) * 100)) });
    }
    context.sort((a, b) => b.pct - a.pct);

    return {
      plan: this.plan,
      team: {
        staff: employees.length,
        working: employees.filter((e) => e.state === 'working').length,
        needsYou: employees.filter((e) => e.state === 'needs-you').length,
        idle: employees.filter((e) => e.state === 'idle' || e.state === 'sleeping').length,
        interns: employees.reduce((n, e) => n + e.interns.length, 0),
        costUSD: Math.round(costUSD * 100) / 100,
        linesAdded,
        linesRemoved,
        ...this.slow,
      },
      context,
    };
  }
}

function defaultWindow(model?: string): number {
  if (!model) return 200_000;
  if (/\[1m\]|opus-5|fable|sonnet-5/i.test(model)) return 1_000_000;
  return 200_000;
}

// ── Plan usage ────────────────────────────────────────────────────────────────

const LABELS: Record<string, string> = { five_hour: '5-hour', seven_day: 'Weekly' };

async function readPlan(windowByModel: Map<string, number>): Promise<Plan> {
  const candidates: Plan[] = [];

  // 1. The HUD's usage report (includes per-model weekly buckets such as Fable).
  const dir = join(CLAUDE_HOME, 'plugins', 'oh-my-claudecode');
  const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => /^\.usage-cache.*\.json$/.test(f));
  for (const f of files) {
    try {
      const c = JSON.parse(await readFile(join(dir, f), 'utf8'));
      const d = c?.data;
      if (!d || typeof d.fiveHourPercent !== 'number') continue;
      const limits: PlanLimit[] = [
        { id: 'five_hour', label: '5-hour', usedPct: d.fiveHourPercent, resetsAt: toMs(d.fiveHourResetsAt) },
        { id: 'seven_day', label: 'Weekly', usedPct: d.weeklyPercent, resetsAt: toMs(d.weeklyResetsAt) },
      ];
      for (const b of Array.isArray(d.scopedWeeklyBuckets) ? d.scopedWeeklyBuckets : []) {
        if (typeof b?.percent === 'number') limits.push({ id: `seven_day_${b.id}`, label: `${b.label ?? b.id} weekly`, usedPct: b.percent, resetsAt: toMs(b.resetsAt) });
      }
      candidates.push({ limits: limits.filter((l) => typeof l.usedPct === 'number'), updatedAt: Number(c.lastSuccessAt ?? c.timestamp) || null });
    } catch {
      // unreadable or mid-write: skip this round
    }
  }

  // 2. The last status-line input Claude Code sent, as cached by the HUD.
  try {
    const path = join(HOME, '.omc', 'state', 'hud-stdin-cache.json');
    const [raw, s] = await Promise.all([readFile(path, 'utf8'), stat(path)]);
    const plan = fromStatusInput(JSON.parse(raw), Math.round(s.mtimeMs), windowByModel);
    if (plan) candidates.push(plan);
  } catch {
    // no HUD cache on this machine
  }

  // 3. The office's own status line tap (`npm run statusline:install`), for setups without the HUD.
  try {
    const tap = JSON.parse(await readFile(join(HOME, '.claude-office', 'statusline.json'), 'utf8'));
    const plan = fromStatusInput(tap?.data, Number(tap?.savedAt) || null, windowByModel);
    if (plan) candidates.push(plan);
  } catch {
    // tap not installed
  }

  candidates.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  return candidates[0] ?? { limits: [], updatedAt: null };
}

/** Plan limits (and the model's context window size) from one status-line input snapshot. */
function fromStatusInput(input: any, updatedAt: number | null, windowByModel: Map<string, number>): Plan | null {
  if (!input || typeof input !== 'object') return null;
  if (input.model?.id && input.context_window?.context_window_size) {
    windowByModel.set(input.model.id, Number(input.context_window.context_window_size));
  }
  const rl = input.rate_limits;
  if (!rl || typeof rl !== 'object') return null;
  const limits: PlanLimit[] = Object.entries(rl as Record<string, { used_percentage?: number; resets_at?: number }>)
    .filter(([, v]) => typeof v?.used_percentage === 'number')
    .map(([id, v]) => ({ id, label: LABELS[id] ?? id.replace(/_/g, ' '), usedPct: v.used_percentage!, resetsAt: toMs(v.resets_at) }));
  return limits.length ? { limits, updatedAt } : null;
}

/** Accepts epoch seconds, epoch ms, or an ISO string. */
function toMs(v: unknown): number | undefined {
  if (typeof v === 'number') return v < 1e12 ? v * 1000 : v;
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : undefined;
  }
  return undefined;
}

// ── Slow numbers: commits today, sessions today ───────────────────────────────

async function slowNumbers(employees: Employee[]): Promise<{ commitsToday: number; sessionsToday: number }> {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);

  const repos = new Set<string>();
  for (const cwd of new Set(employees.map((e) => e.cwd).filter(Boolean))) {
    const top = await run('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { timeoutMs: 3000 });
    if (top.code === 0 && top.stdout.trim()) repos.add(top.stdout.trim());
  }
  let commitsToday = 0;
  for (const repo of repos) {
    const r = await run('git', ['-C', repo, 'rev-list', '--count', `--since=${midnight.toISOString()}`, 'HEAD'], { timeoutMs: 3000 });
    if (r.code === 0) commitsToday += Number(r.stdout.trim()) || 0;
  }

  let sessionsToday = 0;
  for (const d of await readdir(PROJECTS_DIR).catch(() => [] as string[])) {
    for (const f of await readdir(join(PROJECTS_DIR, d)).catch(() => [] as string[])) {
      if (!f.endsWith('.jsonl')) continue;
      const s = await stat(join(PROJECTS_DIR, d, f)).catch(() => null);
      if (s && s.mtimeMs >= midnight.getTime()) sessionsToday++;
    }
  }
  return { commitsToday, sessionsToday };
}
