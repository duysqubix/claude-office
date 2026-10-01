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

/** Something worth a toast that the roster alone doesn't show (e.g. a new hire that crashed on startup). */
export interface NoticeMessage {
  type: 'notice';
  level: 'info' | 'warn';
  text: string;
}

export type ServerMessage = RosterMessage | HelloMessage | NoticeMessage;

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

export interface ChatLine {
  role: 'user' | 'assistant';
  text: string;
  ts?: string;
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
//   POST /api/hire   {cwd, prompt?, name?} -> ApiResult (new claude session in tmux, walks in the door;
//                                                      name: optional, ≤ 32 chars, becomes `claude -n <name>`)
//   POST /api/rehire {sessionId}    -> ApiResult      (claude --resume in tmux)
//   POST /api/fire   {sessionId}    -> ApiResult      (hosted only: ends the tmux session)
//   POST /api/say    {sessionId, text} -> ApiResult   (hosted only: types text + Enter into their terminal)
//
// WebSocket /ws    server -> client: ServerMessage JSON (hello once, then roster on every change)
// WebSocket /term?id=<sessionId>&cols=<n>&rows=<n>   (hosted only)
//   server -> client: raw terminal output (text frames)
//   client -> server: TermClientMessage JSON
export type TermClientMessage = { t: 'in'; d: string } | { t: 'resize'; cols: number; rows: number };

export const SLEEP_AFTER_MS = 15 * 60 * 1000;
export const DEFAULT_PORT = 4777;
