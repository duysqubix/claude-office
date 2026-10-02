// "Got it" on the needs-you note of a session running in its own terminal (UX.md §3.3): you've
// read it, so the note steps aside until they need you again (a new wait, a new note).
import type { Employee } from '../../../shared/protocol';

const seen = new Set<string>();
const key = (e: Employee) => `${e.sessionId}@${e.stateSince}`;

export function noteSeen(e: Employee): boolean {
  return seen.has(key(e));
}

export function markNoteSeen(e: Employee): void {
  seen.add(key(e));
}
