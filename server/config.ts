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

/** tmux sessions the office creates are named `office-<first 8 chars of session id>`. */
export const TMUX_PREFIX = 'office-';

export const POLL_MS = 1000;
/** A subagent whose transcript hasn't moved for this long (and never finished) is presumed gone. */
export const INTERN_STALE_MS = 15 * 60_000;
