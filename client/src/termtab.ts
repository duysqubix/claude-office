// Which of their terminals (Claude or Shell) each employee was last looked at in, per browser,
// so the quick look and the sit-down open where you left off.
import type { TermKind } from './net';

const KEY = 'claude-office:term-tabs';
/** Remembered employees; the oldest are forgotten first. */
const MAX = 200;

function load(): Record<string, TermKind> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, TermKind>) : {};
  } catch {
    return {};
  }
}

/** The tab they were last looked at in, or null for someone new. */
export function lastTab(sessionId: string): TermKind | null {
  const v = load()[sessionId];
  return v === 'claude' || v === 'shell' ? v : null;
}

export function setLastTab(sessionId: string, kind: TermKind): void {
  try {
    const all = load();
    // Most recent last, so the cap drops whoever was looked at longest ago.
    delete all[sessionId];
    all[sessionId] = kind;
    const keys = Object.keys(all);
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX))) delete all[k];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Private mode or storage full: the tab just isn't remembered.
  }
}
