// In-game answers for Claude Code hooks.
//
// scripts/office-hook.mjs forwards two hook events here and waits for the reply:
//   - PermissionRequest (any tool)               → Allow / Always allow … / Deny
//   - PreToolUse for AskUserQuestion             → pick answers
//   - PreToolUse for ExitPlanMode                → Approve plan / Keep planning
// The office only holds a request while a manager is actually looking at the game
// (visible tab, recent input). Otherwise, or when nobody answers within HOLD_MS, it
// returns no decision and Claude Code shows its normal terminal prompt.
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { AnswerRequest, Ask, AskOption } from '../shared/protocol';
import { clip } from './transcript';

export const HOLD_MS = Number(process.env.OFFICE_HOLD_MS ?? 90_000);
/** Game input within this window counts as "the manager is here". */
const PRESENCE_FRESH_MS = 2 * 60_000;

export interface HookPayload {
  session_id?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  permission_suggestions?: PermissionUpdate[];
  cwd?: string;
  permission_mode?: string;
}

interface PermissionUpdate {
  type?: string;
  rules?: { toolName?: string; ruleContent?: string }[];
  behavior?: string;
  destination?: string;
  mode?: string;
  directories?: string[];
}

/** What the hook script prints to stdout (null = no decision: the terminal handles it). */
export type HookOutput = { hookSpecificOutput: Record<string, unknown> } | null;

interface Pending {
  ask: Ask;
  sessionId: string;
  hook: HookPayload;
  settle: (out: HookOutput) => void;
}

export class AskBroker extends EventEmitter {
  private pending = new Map<string, Pending>();
  private presence = new Map<object, { visible: boolean; lastInputAt: number; canAnswer: boolean }>();

  setPresence(client: object, visible: boolean, lastInputAt: number, canAnswer = false): void {
    this.presence.set(client, { visible, lastInputAt: Math.min(Number(lastInputAt) || 0, Date.now()), canAnswer });
    if (!this.managerPresent()) this.releaseAll();
  }

  dropClient(client: object): void {
    this.presence.delete(client);
    if (!this.managerPresent()) this.releaseAll();
  }

  /**
   * Announce a change on the next turn of the event loop, so the HTTP reply to an answer
   * (sent synchronously by the caller) leaves before the roster broadcast that drops the ask.
   */
  private changed(): void {
    setImmediate(() => this.emit('change'));
  }

  managerPresent(): boolean {
    const now = Date.now();
    for (const p of this.presence.values()) if (p.canAnswer && p.visible && now - p.lastInputAt < PRESENCE_FRESH_MS) return true;
    return false;
  }

  /** The newest open ask for a session. */
  forSession(sessionId: string): Ask | undefined {
    let newest: Ask | undefined;
    for (const p of this.pending.values()) if (p.sessionId === sessionId && (!newest || p.ask.createdAt > newest.createdAt)) newest = p.ask;
    return newest;
  }

  /**
   * Turn a hook call into an in-game ask and wait for the manager. Resolves with the hook's
   * stdout JSON, or null for "no decision". `knownSession` says whether anyone in the office
   * has that session id (no employee, no hand to raise).
   */
  hold(payload: HookPayload, knownSession: boolean, onAbandon: (cancel: () => void) => void): Promise<HookOutput> {
    const sessionId = payload.session_id;
    if (!sessionId || !knownSession || !this.managerPresent()) return Promise.resolve(null);
    const ask = toAsk(payload);
    if (!ask) return Promise.resolve(null);

    return new Promise<HookOutput>((resolve) => {
      let open = true;
      const settle = (out: HookOutput) => {
        if (!open) return;
        open = false;
        clearTimeout(timer);
        this.pending.delete(ask.id);
        this.changed();
        resolve(out);
      };
      const timer = setTimeout(() => settle(null), HOLD_MS);
      this.pending.set(ask.id, { ask, sessionId, hook: payload, settle });
      onAbandon(() => settle(null)); // Claude gave up waiting (Esc, interrupt, hook timeout)
      this.changed();
    });
  }

  answer(req: AnswerRequest): { ok: true } | { ok: false; error: string } {
    const p = this.pending.get(String(req.askId));
    if (!p || p.sessionId !== req.sessionId) return { ok: false, error: 'That question was already answered or withdrawn' };
    const out = decide(p, req);
    if (out === undefined) return { ok: false, error: `Unknown choice "${req.choice}"` };
    p.settle(out);
    return { ok: true };
  }

  /** Let every waiting hook fall back to the terminal (manager left, server stopping). */
  releaseAll(): void {
    for (const p of [...this.pending.values()]) p.settle(null);
  }
}

// ── Building asks ─────────────────────────────────────────────────────────────

const str = (v: unknown) => (typeof v === 'string' ? v : '');
/** Truncate but keep line breaks (commands, plans). */
const clipKeep = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const base = (p: unknown) => str(p).split('/').filter(Boolean).pop() ?? str(p);

function toAsk(h: HookPayload): Ask | null {
  const tool = h.tool_name ?? '';
  const input = h.tool_input ?? {};
  const now = Date.now();
  const common = { id: randomUUID(), tool, createdAt: now, expiresAt: now + HOLD_MS };

  if (h.hook_event_name === 'PreToolUse' && tool === 'AskUserQuestion') {
    const questions = Array.isArray(input.questions) ? (input.questions as Ask['questions']) ?? [] : [];
    if (!questions.length) return null;
    return {
      ...common,
      kind: 'question',
      title: questions.length === 1 ? clip(str(questions[0].question), 80) : `${questions.length} questions for you`,
      detail: questions.map((q) => str(q.question)).join('\n'),
      questions: questions.map((q) => ({
        question: str(q.question),
        header: q.header,
        multiSelect: Boolean(q.multiSelect),
        options: (q.options ?? []).map((o) => ({ label: str(o.label), description: o.description })),
      })),
      options: [
        { id: 'answer', label: 'Send answers', style: 'primary' },
        { id: 'terminal', label: 'Answer in their terminal', style: 'ghost' },
      ],
    };
  }

  if (h.hook_event_name === 'PreToolUse' && tool === 'ExitPlanMode') {
    return {
      ...common,
      kind: 'plan',
      title: 'Approve this plan?',
      detail: clipKeep(str(input.plan) || 'No plan text provided.', 4000),
      options: [
        { id: 'approve', label: 'Approve plan', style: 'primary' },
        { id: 'revise', label: 'Keep planning', hint: 'Add a note with what to change', style: 'secondary' },
        { id: 'terminal', label: 'Answer in their terminal', style: 'ghost' },
      ],
    };
  }

  if (h.hook_event_name !== 'PermissionRequest' || tool === 'AskUserQuestion' || tool === 'ExitPlanMode') return null;
  const { title, detail } = describePermission(tool, input);
  const always: AskOption[] = (h.permission_suggestions ?? []).slice(0, 2).map((s, i) => ({
    id: `always:${i}`,
    label: suggestionLabel(s),
    hint: destinationHint(s.destination),
    style: 'secondary' as const,
  }));
  return {
    ...common,
    kind: 'permission',
    title,
    detail,
    options: [
      { id: 'allow', label: 'Allow', style: 'primary' },
      ...always,
      { id: 'deny', label: 'Deny', hint: 'Optionally tell them why', style: 'danger' },
      { id: 'terminal', label: 'Answer in their terminal', style: 'ghost' },
    ],
  };
}

function describePermission(tool: string, input: Record<string, unknown>): { title: string; detail: string } {
  switch (tool) {
    case 'Bash':
      return { title: 'Run a command?', detail: clipKeep(str(input.command), 600) + (str(input.description) ? `\n— ${clip(str(input.description), 120)}` : '') };
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return { title: `Edit ${base(input.file_path ?? input.notebook_path)}?`, detail: str(input.file_path ?? input.notebook_path) };
    case 'Write':
      return { title: `Write ${base(input.file_path)}?`, detail: str(input.file_path) };
    case 'WebFetch':
      return { title: `Open ${hostOf(input.url)}?`, detail: clip(str(input.url), 400) };
    case 'WebSearch':
      return { title: 'Search the web?', detail: clip(str(input.query), 300) };
    case 'Agent':
    case 'Task':
      return { title: 'Bring in an intern?', detail: clip(str(input.description) || str(input.prompt), 300) };
  }
  if (tool.startsWith('mcp__')) {
    const [, server = '', name = ''] = tool.split('__');
    return { title: `Use ${server} › ${name.replace(/_/g, ' ')}?`, detail: clip(JSON.stringify(input), 600) };
  }
  return { title: `Use ${tool}?`, detail: clip(JSON.stringify(input), 600) };
}

function suggestionLabel(s: PermissionUpdate): string {
  if (s.type === 'addRules' && s.rules?.length) {
    const r = s.rules[0];
    const what = r.ruleContent ? `${r.toolName}(${clip(r.ruleContent, 40)})` : `all ${r.toolName}`;
    return `Always allow ${what}`;
  }
  if (s.type === 'setMode' && s.mode) return s.mode === 'acceptEdits' ? 'Allow all edits from now on' : `Switch to ${s.mode} mode`;
  if (s.type === 'addDirectories' && s.directories?.length) return `Allow access to ${base(s.directories[0])}/`;
  return 'Allow and remember';
}

function destinationHint(d?: string): string | undefined {
  switch (d) {
    case 'session':
      return 'for this session';
    case 'localSettings':
    case 'projectSettings':
      return 'in this project';
    case 'userSettings':
      return 'everywhere';
  }
  return undefined;
}

function hostOf(u: unknown): string {
  try {
    return new URL(String(u)).hostname;
  } catch {
    return 'a web page';
  }
}

// ── Turning answers into hook output ──────────────────────────────────────────

/** undefined = invalid choice; null = no decision (terminal). */
function decide(p: Pending, req: AnswerRequest): HookOutput | undefined {
  const { ask, hook } = p;
  if (req.choice === 'terminal') return null;
  const note = typeof req.message === 'string' ? clip(req.message, 1000) : '';

  if (ask.kind === 'permission') {
    const perm = (decision: Record<string, unknown>) => ({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision } });
    if (req.choice === 'allow') return perm({ behavior: 'allow' });
    if (req.choice === 'deny') return perm({ behavior: 'deny', message: note || 'The manager declined this in Claude Office.' });
    const m = /^always:(\d)$/.exec(req.choice);
    const suggestion = m ? hook.permission_suggestions?.[Number(m[1])] : undefined;
    if (suggestion) return perm({ behavior: 'allow', updatedPermissions: [suggestion] });
    return undefined;
  }

  const pre = (out: Record<string, unknown>) => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', ...out } });
  if (ask.kind === 'plan') {
    if (req.choice === 'approve') return pre({ permissionDecision: 'allow', updatedInput: hook.tool_input ?? {} });
    if (req.choice === 'revise') return pre({ permissionDecision: 'deny', permissionDecisionReason: note || 'The manager wants you to keep planning.' });
    return undefined;
  }

  if (ask.kind === 'question' && req.choice === 'answer') {
    const answers: Record<string, string> = {};
    for (const q of ask.questions ?? []) {
      const a = req.answers?.[q.question];
      if (typeof a === 'string' && a.trim()) answers[q.question] = clip(a, 500);
    }
    if (!Object.keys(answers).length) return undefined;
    return pre({ permissionDecision: 'allow', updatedInput: { ...(hook.tool_input ?? {}), answers } });
  }
  return undefined;
}
