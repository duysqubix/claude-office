import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PORT } from '../shared/protocol';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const HOME = homedir();
export const CLAUDE_HOME = process.env.CLAUDE_HOME ?? join(HOME, '.claude');
export const SESSIONS_DIR = join(CLAUDE_HOME, 'sessions');
export const PROJECTS_DIR = join(CLAUDE_HOME, 'projects');
export const HOST = '127.0.0.1';
export const PORT = Number(process.env.PORT ?? DEFAULT_PORT);
export const IS_PROD = process.env.NODE_ENV === 'production';
/**
 * Where thought-bubble calls (`claude -p`) run. Claude Code registers them as live sessions
 * for a few seconds; the roster ignores this folder so they never walk into the office.
 */
export const THINK_DIR = join(HOME, '.claude-office', 'thinking');

/** tmux sessions the office creates are named `office-<first 8 chars of session id>`. */
export const TMUX_PREFIX = 'office-';

export const POLL_MS = 1000;
/** Interns idle this long (or that never report finishing) go home; they walk back in if they start working again. */
export const INTERN_STALE_MS = 5 * 60_000;
