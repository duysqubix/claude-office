// The office roster: merges the live registry, transcripts, subagents and tmux into
// Employee records, polls once a second, and emits 'change' / 'notice'.
import { EventEmitter } from 'node:events';
import type { Ask, Employee, EmployeeState, Intern, NoticeMessage } from '../shared/protocol';
import { SLEEP_AFTER_MS } from '../shared/protocol';
import { POLL_MS } from './config';
import { projectName } from './archive';
import { activeInterns } from './interns';
import { assignNames, pickName } from './names';
import { claudeProcessCount, readRegistry, type RegistryEntry } from './registry';
import { capture, kill, listHosted, readOfficeMeta, rehire, type HostedPane, type OfficeMeta } from './tmux';
import { TranscriptTail } from './transcript';

/** A hire we started that Claude hasn't registered yet. */
interface PendingHire {
  sessionId: string;
  tmuxName: string;
  cwd: string;
  displayName: string;
  startedAt: number;
}

const TRUST_PROMPT = /trust (the files in )?this folder|Do you trust/i;

/** Open in-game questions per session (server/asks.ts). */
export interface AskSource {
  forSession(sessionId: string): Ask | undefined;
}

export class Roster extends EventEmitter {
  employees: Employee[] = [];
  /** Employees as last polled, before open asks are applied. */
  private base: Employee[] = [];
  private tails = new Map<string, TranscriptTail>();
  private memo = new Map<string, { state: EmployeeState; since: number }>();
  private interns = new Map<string, Intern[]>();
  private screens = new Map<string, string[]>();
  private pending = new Map<string, PendingHire>();
  /** tmux name -> what the office stamped on it (null: not one of our hires). */
  private officeMeta = new Map<string, OfficeMeta | null>();
  private hostedBySession = new Map<string, string>();
  /** Pids of the people in other offices' hires (tmux.ts listHosted): never brought in here. */
  private elsewhere = new Set<number>();
  private lastJson = '';
  private tickN = 0;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private warnedUnreadable = false;
  /** External sessions waiting to move into the office (resumed in tmux once they exit). */
  private adoptions = new Map<string, { cwd: string; displayName: string; until: number }>();

  constructor(private readonly asks?: AskSource) {
    super();
  }

  start(): void {
    const loop = async () => {
      if (this.stopped) return;
      try {
        await this.tick();
      } catch (err) {
        console.error('[roster] tick failed:', err);
      }
      if (!this.stopped) this.timer = setTimeout(loop, POLL_MS);
    };
    void loop();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  /** tmux session name for a hosted employee, if they are hosted. */
  tmuxNameFor(sessionId: string): string | undefined {
    return this.hostedBySession.get(sessionId) ?? this.pending.get(sessionId)?.tmuxName;
  }

  find(sessionId: string): Employee | undefined {
    return this.employees.find((e) => e.sessionId === sessionId);
  }

  tail(sessionId: string): TranscriptTail | undefined {
    return this.tails.get(sessionId);
  }

  contextTokens(sessionId: string): number | undefined {
    return this.tails.get(sessionId)?.contextTokens;
  }

  linesChanged(sessionId: string): { added: number; removed: number } | undefined {
    const t = this.tails.get(sessionId);
    return t?.linesAdded === undefined ? undefined : { added: t.linesAdded, removed: t.linesRemoved ?? 0 };
  }

  takenNames(): Set<string> {
    return new Set(this.employees.map((e) => e.displayName));
  }

  nameForNewHire(sessionId: string): string {
    return pickName(sessionId, this.takenNames());
  }

  /**
   * Bring an external session into the office: as soon as it exits its own terminal, resume
   * it here (claude --resume in tmux), keeping its name. Expires after 10 minutes.
   */
  requestAdoption(sessionId: string): void {
    const e = this.find(sessionId);
    if (!e) throw new Error('Nobody by that id is in the office');
    if (e.hosted) throw new Error('They already work in the office');
    if (e.otherOffice) throw new Error('They work in another office');
    this.adoptions.set(sessionId, { cwd: e.cwd, displayName: e.displayName, until: Date.now() + 10 * 60_000 });
    this.refresh();
  }

  /** Called right after tmux started a hire, so they can walk in before Claude registers. */
  addPendingHire(h: Omit<PendingHire, 'startedAt'>): void {
    this.pending.set(h.sessionId, { ...h, startedAt: Date.now() });
    void this.tick().catch(() => {});
  }

  private notice(level: NoticeMessage['level'], text: string): void {
    this.emit('notice', { type: 'notice', level, text } satisfies NoticeMessage);
  }

  private ticking: Promise<void> | null = null;

  /** One poll. Concurrent callers share the in-flight poll. */
  tick(): Promise<void> {
    this.ticking ??= this.doTick().finally(() => (this.ticking = null));
    return this.ticking;
  }

  private async doTick(): Promise<void> {
    this.tickN++;
    const now = Date.now();
    const [reg, { panes, elsewhere }] = await Promise.all([readRegistry(), listHosted()]);
    if (!reg.length && !this.warnedUnreadable && this.tickN % 10 === 1 && (await claudeProcessCount()) > 0) {
      // Claude is running but its session registry gave us nothing: likely a newer Claude Code format.
      this.warnedUnreadable = true;
      this.notice('warn', "Claude Code is running, but the office can't read its live sessions (~/.claude/sessions). Your Claude Code version may be newer than this office supports.");
    }

    const livePanes = panes.filter((p) => !p.dead);
    const paneByPid = new Map(livePanes.map((p) => [p.panePid, p.tmuxName]));
    await Promise.all(panes.filter((p) => p.dead).map((p) => this.reap(p)));

    // Forget sessions that left.
    const liveIds = new Set(reg.map((e) => e.sessionId));
    for (const id of [...this.tails.keys()]) {
      if (!liveIds.has(id)) {
        this.tails.delete(id);
        this.interns.delete(id);
        this.screens.delete(id);
      }
    }
    for (const id of [...this.memo.keys()]) if (!liveIds.has(id) && !this.pending.has(id)) this.memo.delete(id);

    // Pending hires: drop once Claude registers them or their tmux session is gone. No timeout:
    // a hire can sit at the trust dialog for as long as the manager takes to get there.
    const livePaneNames = new Set(livePanes.map((p) => p.tmuxName));
    for (const [id, h] of this.pending) {
      if (liveIds.has(id) || !livePaneNames.has(h.tmuxName)) this.pending.delete(id);
    }
    for (const name of [...this.officeMeta.keys()]) if (!livePaneNames.has(name)) this.officeMeta.delete(name);
    // After a server restart, recover hires that are still starting up from their tmux stamps.
    const registeredPids = new Set(reg.map((e) => e.pid));
    const pendingPanes = new Set([...this.pending.values()].map((h) => h.tmuxName));
    for (const p of livePanes) {
      if (registeredPids.has(p.panePid) || pendingPanes.has(p.tmuxName)) continue;
      if (!this.officeMeta.has(p.tmuxName)) this.officeMeta.set(p.tmuxName, await readOfficeMeta(p.tmuxName));
      const meta = this.officeMeta.get(p.tmuxName);
      if (!meta || liveIds.has(meta.sessionId)) continue;
      this.pending.set(meta.sessionId, {
        sessionId: meta.sessionId,
        tmuxName: p.tmuxName,
        cwd: meta.cwd ?? '',
        displayName: meta.displayName ?? pickName(meta.sessionId, new Set()),
        startedAt: p.createdAt,
      });
    }

    // Adoptions: once the external process is gone, resume the session in the office. Someone
    // who turns up in another office's hire meanwhile (it resumed them first) stays there.
    const inOtherOffices = new Set(reg.filter((e) => elsewhere.has(e.pid)).map((e) => e.sessionId));
    for (const [id, a] of this.adoptions) {
      if (now > a.until || inOtherOffices.has(id)) {
        this.adoptions.delete(id);
        continue;
      }
      if (liveIds.has(id) || this.pending.has(id)) continue;
      this.adoptions.delete(id);
      try {
        const { tmuxName } = await rehire({ sessionId: id, cwd: a.cwd, displayName: a.displayName });
        this.pending.set(id, { sessionId: id, tmuxName, cwd: a.cwd, displayName: a.displayName, startedAt: now });
        this.notice('info', `${a.displayName} is moving into the office`);
      } catch (err) {
        this.notice('warn', `Couldn't bring ${a.displayName} in: ${err instanceof Error ? err.message : err}`);
      }
    }

    this.elsewhere = elsewhere;
    this.hostedBySession = new Map();
    for (const e of reg) {
      const name = paneByPid.get(e.pid);
      if (name) this.hostedBySession.set(e.sessionId, name);
    }

    const slow = this.tickN % 2 === 0;
    await Promise.all(
      reg.map(async (e) => {
        let t = this.tails.get(e.sessionId);
        if (!t) {
          t = new TranscriptTail(e.sessionId, e.cwd);
          this.tails.set(e.sessionId, t);
        }
        await t.update();
        if ((slow || !this.interns.has(e.sessionId)) && t.path) this.interns.set(e.sessionId, await activeInterns(t.path, e.sessionId, t));
        const tmuxName = this.hostedBySession.get(e.sessionId);
        if (tmuxName && (slow || !this.screens.has(e.sessionId))) this.screens.set(e.sessionId, await capture(tmuxName));
      }),
    );
    const pendingScreens = new Map<string, string[]>();
    await Promise.all([...this.pending.values()].map(async (h) => pendingScreens.set(h.sessionId, await capture(h.tmuxName))));

    const names = assignNames([
      ...reg.map((e) => ({ sessionId: e.sessionId, startedAt: e.startedAt, name: e.name, nameSource: e.nameSource })),
      ...[...this.pending.values()].map((h) => ({ sessionId: h.sessionId, startedAt: h.startedAt, name: h.displayName, nameSource: 'user' })),
    ]);

    const employees: Employee[] = reg.map((e) => this.toEmployee(e, names.get(e.sessionId) ?? 'Claude', now));
    for (const h of this.pending.values()) {
      const screen = pendingScreens.get(h.sessionId) ?? [];
      const trust = screen.some((l) => TRUST_PROMPT.test(l));
      const state: EmployeeState = trust ? 'needs-you' : 'starting';
      employees.push({
        sessionId: h.sessionId,
        pid: 0,
        name: h.displayName,
        displayName: names.get(h.sessionId) ?? h.displayName,
        cwd: h.cwd,
        project: projectName(h.cwd),
        kind: 'interactive',
        hosted: true,
        state,
        stateSince: this.since(h.sessionId, state, h.startedAt),
        waitingFor: trust ? 'Trust this folder?' : undefined,
        interns: [],
        startedAt: h.startedAt,
        screen,
      });
    }
    employees.sort((a, b) => a.startedAt - b.startedAt);
    this.base = employees;
    this.publish();
  }

  /** Re-apply open asks to the last poll and broadcast if anything changed (no re-poll). */
  refresh(): void {
    this.publish();
  }

  private publish(): void {
    this.employees = this.base.map((e) => {
      const ask = this.asks?.forSession(e.sessionId);
      const adopting = this.adoptions.has(e.sessionId) ? { adopting: true } : {};
      if (!ask) return { ...e, ...adopting };
      return { ...e, ...adopting, ask, state: 'needs-you', waitingFor: ask.title, stateSince: this.since(e.sessionId, 'needs-you', ask.createdAt) };
    });
    const json = JSON.stringify(this.employees);
    if (json !== this.lastJson) {
      this.lastJson = json;
      this.emit('change', this.employees);
    }
  }

  private toEmployee(e: RegistryEntry, displayName: string, now: number): Employee {
    const busy = e.status === 'busy';
    const s = this.tails.get(e.sessionId)!.summary(busy);
    const state = stateOf(e, now);
    const sinceHint =
      state === 'sleeping' ? (e.statusUpdatedAt ?? now) + SLEEP_AFTER_MS : e.statusUpdatedAt ?? e.startedAt ?? now;
    const tmuxName = this.hostedBySession.get(e.sessionId);
    const cwd = e.cwd || s.cwd || '';
    return {
      sessionId: e.sessionId,
      pid: e.pid,
      name: e.name ?? '',
      displayName,
      cwd,
      project: projectName(cwd),
      title: s.title,
      branch: s.branch && s.branch !== 'HEAD' ? s.branch : undefined,
      model: s.model,
      kind: e.kind ?? 'interactive',
      entrypoint: e.entrypoint,
      hosted: Boolean(tmuxName),
      otherOffice: this.elsewhere.has(e.pid) || undefined,
      state,
      stateSince: this.since(e.sessionId, state, sinceHint),
      waitingFor: state === 'needs-you' ? e.waitingFor || 'your input' : undefined,
      activity: busy ? s.activity : undefined,
      lastText: s.lastText,
      lastPrompt: s.lastPrompt,
      interns: this.interns.get(e.sessionId) ?? [],
      costUSD: s.costUSD,
      startedAt: e.startedAt ?? now,
      screen: tmuxName ? this.screens.get(e.sessionId) : undefined,
    };
  }

  /** When the current state began: kept across polls while the state holds. */
  private since(sessionId: string, state: EmployeeState, hint: number): number {
    const m = this.memo.get(sessionId);
    if (m && m.state === state) return m.since;
    const since = Math.min(hint, Date.now());
    this.memo.set(sessionId, { state, since });
    return since;
  }

  /** A hosted claude exited: report a crash, then remove the dead tmux session. */
  private async reap(p: HostedPane): Promise<void> {
    if (p.deadStatus && p.deadStatus !== 0) {
      const lines = await capture(p.tmuxName, 6, 120);
      const why = lines.filter((l) => !/^Pane is dead/.test(l)).slice(-2).join(' ').trim();
      this.notice('warn', `A hire in ${p.tmuxName} quit (exit ${p.deadStatus})${why ? `: ${why}` : ''}`);
    }
    await kill(p.tmuxName).catch(() => {});
  }
}

function stateOf(e: RegistryEntry, now: number): EmployeeState {
  switch (e.status) {
    case 'busy':
      return 'working';
    case 'waiting':
      return 'needs-you';
    case 'idle':
      return now - (e.statusUpdatedAt ?? now) > SLEEP_AFTER_MS ? 'sleeping' : 'idle';
    default:
      return 'starting';
  }
}
