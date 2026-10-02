// Wire protocol between the office server (server/) and the 3D client (client/).
// Both sides import this file; keep it dependency-free.

/** Coarse state that drives an employee's body language. */
export type EmployeeState =
  | 'starting' // process is up but has not reported a status yet
  | 'working' // Claude is busy (registry status "busy")
  | 'needs-you' // Claude is blocked on the human (registry status "waiting"): permission, question, dialog
  | 'idle' // turn finished, waiting for the next prompt
  | 'sleeping'; // idle for a long time (> SLEEP_AFTER_MS)

/** Bucket used to pick an animation while working. */
export type ActivityKind =
  | 'thinking' // busy, no tool running
  | 'typing' // Edit / Write / NotebookEdit
  | 'reading' // Read / Grep / Glob / LS
  | 'running' // Bash and other command runners
  | 'browsing' // WebFetch / WebSearch / browser MCP tools
  | 'delegating' // Agent / Task / Workflow (spawning interns)
  | 'asking' // AskUserQuestion
  | 'planning' // TodoWrite / Task* / plan mode tools
  | 'other';

export interface Activity {
  /** Raw tool name, e.g. "Edit", "Bash", "mcp__fff__grep". Absent while thinking. */
  tool?: string;
  kind: ActivityKind;
  /** Short human label, e.g. "Editing roster.ts", "$ npm test", "Thinking…". ≤ 60 chars. */
  label: string;
}

/** A subagent working for an employee. */
export interface Intern {
  id: string;
  /** agentType from the subagent's meta.json, e.g. "Explore", "oh-my-claudecode:executor". */
  type: string;
  description: string;
  /** True while it's writing (last minute); false while it waits or thinks for a long time. */
  active: boolean;
}

/** A choice the manager can make for an Ask. */
export interface AskOption {
  /** What to send back in POST /api/answer `choice`. */
  id: string;
  label: string;
  /** Optional one-line explanation under the label. */
  hint?: string;
  style: 'primary' | 'secondary' | 'danger' | 'ghost';
}

/**
 * Something an employee is waiting for the manager to answer IN THE GAME (v0.5), delivered
 * through Claude Code hooks. While an Ask is open the employee's state is 'needs-you'.
 * If nobody answers before `expiresAt`, the question falls back to the employee's own terminal.
 */
export interface Ask {
  id: string;
  kind: 'permission' | 'question' | 'plan';
  /** Tool being asked about, e.g. "Bash", "Edit", "mcp__chrome__navigate", "AskUserQuestion". */
  tool: string;
  /** Short headline, e.g. "Run a command?", "Edit auth.ts?", "Pick a framework". */
  title: string;
  /** The specifics: the command, file path, URL, or the plan (≤ 4000 chars, may be markdown for plans). */
  detail: string;
  /** For permission/plan asks: the buttons. For question asks: one entry per question (see `questions`). */
  options: AskOption[];
  /** kind 'question' only: the questions with their options (answer with choice 'answer' + `answers`). */
  questions?: { question: string; header?: string; multiSelect?: boolean; options: { label: string; description?: string }[] }[];
  createdAt: number;
  expiresAt: number;
}

export interface Employee {
  sessionId: string;
  pid: number;
  /** Claude Code's own peer name for the session, e.g. "duan-uys-7b". */
  name: string;
  /** Friendly office name, stable per session, e.g. "Claudette". */
  displayName: string;
  cwd: string;
  /** Last path segment of cwd ("~" for the home directory). */
  project: string;
  /** AI-generated session title, if Claude wrote one. */
  title?: string;
  branch?: string;
  model?: string;
  /** Registry kind, e.g. "interactive". */
  kind: string;
  entrypoint?: string;
  /** Launched by the office inside tmux: we can attach a terminal, type, and fire. */
  hosted: boolean;
  state: EmployeeState;
  /** Epoch ms when `state` last changed. */
  stateSince: number;
  /** Why Claude is blocked when state is "needs-you", e.g. "permission", "dialog open". */
  waitingFor?: string;
  activity?: Activity;
  /** Last assistant text, ≤ 280 chars. */
  lastText?: string;
  /** Last human prompt, ≤ 200 chars. */
  lastPrompt?: string;
  interns: Intern[];
  costUSD?: number;
  /** Epoch ms the process started. */
  startedAt: number;
  /** Hosted only: last lines of the terminal as plain text (≤ 18 lines × 80 cols), for the desk monitor. */
  screen?: string[];
  /** Open question the manager can answer in-game (see Ask). Implies state 'needs-you'. */
  ask?: Ask;
  /** External session the manager asked to bring into the office: it moves in once it exits its own terminal. */
  adopting?: boolean;
}

/** Client → server over /ws. Tells the office someone is actually looking at it. */
export interface PresenceMessage {
  type: 'presence';
  /** document.visibilityState === 'visible' */
  visible: boolean;
  /** Epoch ms of the last keyboard/mouse input in the game. */
  lastInputAt: number;
  /** This client can show and answer Asks. The server never holds a question for a client that can't. */
  canAnswer?: boolean;
}

export type ClientMessage = PresenceMessage;

/** POST /api/answer body. `answers` (question text → chosen label(s), comma-joined) only for choice 'answer'. */
export interface AnswerRequest {
  sessionId: string;
  askId: string;
  choice: string;
  /** Optional note: sent to Claude as the reason on deny, or as feedback on a plan. */
  message?: string;
  answers?: Record<string, string>;
}

export interface RosterMessage {
  type: 'roster';
  employees: Employee[];
  now: number;
}

export interface HelloMessage {
  type: 'hello';
  version: string;
  /** Absolute home directory, so the client can shorten paths to "~/…". */
  home: string;
}

/** One plan limit, e.g. the 5-hour window or the weekly quota. */
export interface PlanLimit {
  /** Key as Claude Code reports it, e.g. "five_hour", "seven_day". */
  id: string;
  /** Display label, e.g. "5-hour", "Weekly". */
  label: string;
  usedPct: number;
  /** Epoch ms when it resets. */
  resetsAt?: number;
}

/** One employee's context window fill (from their transcript's last request). */
export interface ContextFill {
  sessionId: string;
  displayName: string;
  tokens: number;
  windowSize: number;
  pct: number;
}

/** Live numbers for the Team Room wall (and the HUD). Pushed every ~15 s and on connect. */
export interface TeamStats {
  plan: {
    limits: PlanLimit[];
    /** Epoch ms the plan numbers were last reported by any Claude Code session; null = unknown. */
    updatedAt: number | null;
  };
  team: {
    staff: number;
    working: number;
    needsYou: number;
    idle: number;
    interns: number;
    /** Sum of the in-office sessions' running costs. */
    costUSD: number;
    linesAdded: number;
    linesRemoved: number;
    /** Commits since local midnight across the in-office sessions' git repos. */
    commitsToday: number;
    /** Sessions with transcript activity since local midnight. */
    sessionsToday: number;
  };
  context: ContextFill[];
}

export interface StatsMessage {
  type: 'stats';
  stats: TeamStats;
}

/** Something worth a toast that the roster alone doesn't show (e.g. a new hire that crashed on startup). */
export interface NoticeMessage {
  type: 'notice';
  level: 'info' | 'warn';
  text: string;
}

export type ServerMessage = RosterMessage | HelloMessage | NoticeMessage | StatsMessage;

/** A directory Claude Code has been used in (from ~/.claude/projects). */
export interface ProjectInfo {
  cwd: string;
  name: string;
  lastActive: number;
  sessionCount: number;
}

/** A previous session that can be "called back in" (claude --resume). */
export interface PastSession {
  sessionId: string;
  cwd: string;
  project: string;
  title?: string;
  lastPrompt?: string;
  lastActive: number;
  costUSD?: number;
  /** Already running somewhere: cannot be resumed again. */
  live: boolean;
}

/** One line of a session's conversation, for the chat panel. */
export interface ChatLine {
  /** 'tool' = a step Claude took (text is a short label like "Editing auth.ts"). */
  role: 'user' | 'assistant' | 'tool';
  /** Full text for user/assistant (line breaks kept, ≤ 4000 chars). */
  text: string;
  ts?: string;
  /** Increasing per session; GET …/chatter?after=<seq> returns only newer lines. */
  seq: number;
  /** role 'tool' only: the tool name. */
  tool?: string;
}

export interface ApiResult {
  ok: boolean;
  error?: string;
  sessionId?: string;
}

// REST (JSON, same origin, 127.0.0.1 only)
//   GET  /api/roster               -> Employee[]
//   GET  /api/projects             -> ProjectInfo[]
//   GET  /api/archive              -> PastSession[]
//   GET  /api/session/:id/chatter  -> ChatLine[]      (last ~12 human/assistant text lines)
//   POST /api/hire   {cwd, prompt?, name?, permissionMode?} -> ApiResult (new claude session in tmux,
//                    walks in the door; name: optional, ≤ 32 chars, becomes `claude -n <name>`;
//                    permissionMode: one of HIRE_PERMISSION_MODES, else the user's own default)
//   POST /api/rehire {sessionId}    -> ApiResult      (claude --resume in tmux)
//   POST /api/fire   {sessionId}    -> ApiResult      (hosted only: ends the tmux session)
//   POST /api/say    {sessionId, text} -> ApiResult   (hosted only: types text + Enter into their terminal)
//   POST /api/answer AnswerRequest -> ApiResult      (answer an open Ask in-game; any session, via hooks)
//   POST /api/interrupt {sessionId} -> ApiResult      (hosted only: press Esc in their terminal)
//   POST /api/adopt {sessionId}     -> ApiResult      (external session: resume it in the office as soon as it
//                                                      exits its own terminal; Employee.adopting until then)
//   GET  /api/session/:id/chatter?after=<seq>&n=<count> -> ChatLine[]  (incremental chat feed, n ≤ 120)
//   POST /api/hook   <Claude Code hook stdin JSON>    (from scripts/office-hook.mjs only; long-polls for the answer)
//
// Ask choices: permission → 'allow' | 'always' | 'deny' | 'terminal';  plan → 'approve' | 'revise' | 'terminal';
//              question → 'answer' (with `answers`) | 'terminal'.  'terminal' = "answer in their own terminal instead".
//
// WebSocket /ws    server -> client: ServerMessage JSON (hello once, then roster on every change)
// WebSocket /term?id=<sessionId>&cols=<n>&rows=<n>   (hosted only)
//   server -> client: raw terminal output (text frames)
//   client -> server: TermClientMessage JSON
export type TermClientMessage = { t: 'in'; d: string } | { t: 'resize'; cols: number; rows: number };

export const SLEEP_AFTER_MS = 15 * 60 * 1000;
export const DEFAULT_PORT = 4777;

/** Permission modes a hire may start in (`claude --permission-mode`). Never one that skips prompts. */
export const HIRE_PERMISSION_MODES = ['manual', 'plan', 'acceptEdits'] as const;
export type HirePermissionMode = (typeof HIRE_PERMISSION_MODES)[number];
