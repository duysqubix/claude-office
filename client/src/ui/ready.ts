// "Ready for you" (#162): someone who finished their turn and whose finish you haven't seen yet.
// A finished session looks like it's resting (and soon asleep), so nothing told you it was
// waiting on you for the next task. Now it shows a calm cue until you look: open their chat, sit
// at their computer, have Monitor show them, or Say something to them. Walking past never counts.
//
// What you've seen is kept per session in this browser: the moment their last turn finished
// (server clock). A turn that finishes later than that is news again. Help has two switches:
// the cue itself, and its chime.
import type { Employee } from '../../../shared/protocol';
import { SLEEP_AFTER_MS } from '../../../shared/protocol';

const SEEN_KEY = 'claude-office:ready-seen';
const CUE_KEY = 'claude-office:ready-cue';
const CHIME_KEY = 'claude-office:ready-chime';
/** Sessions remembered at most (the newest finishes win). */
const KEEP = 300;
/** Slack for clocks: a sleeper's finish is worked out from when they fell asleep. */
const SLACK_MS = 2000;

/** Session id → the finish (server ms) you've seen. Null until loaded. */
let seen: Map<string, number> | null = null;
/** Nothing was saved yet: the first roster this browser sees is the starting line, not news. */
let fresh = false;
const subs = new Set<() => void>();

function load(): Map<string, number> {
  if (seen) return seen;
  seen = new Map();
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (raw === null) fresh = true;
    else for (const [id, at] of Object.entries(JSON.parse(raw) as Record<string, number>)) if (typeof at === 'number') seen.set(id, at);
  } catch {
    // Storage unavailable (or garbled): remember for this visit only.
    fresh = true;
  }
  return seen;
}

function save(): void {
  const m = load();
  if (m.size > KEEP) {
    const keep = [...m].sort((a, b) => b[1] - a[1]).slice(0, KEEP);
    m.clear();
    for (const [id, at] of keep) m.set(id, at);
  }
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(Object.fromEntries(m)));
  } catch {
    // storage unavailable: this visit only
  }
}

function changed(): void {
  for (const fn of subs) fn();
}

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) !== '0';
  } catch {
    return true;
  }
}

function writeFlag(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? '1' : '0');
  } catch {
    // storage unavailable: this visit only
  }
  changed();
}

/** Help → "Ready for you": the cue, the chip, the edge faces, the toast and Q's second round. */
export const readyCueOn = (): boolean => readFlag(CUE_KEY);
export const setReadyCue = (on: boolean): void => writeFlag(CUE_KEY, on);
/** Help → "Ready chime": the soft sound when someone finishes. */
export const readyChimeOn = (): boolean => readFlag(CHIME_KEY);
export const setReadyChime = (on: boolean): void => writeFlag(CHIME_KEY, on);

/** Something changed: what you've seen, or a switch. */
export function onReadyChange(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}

/**
 * When their last turn finished (server ms), or null if they're not done: still working,
 * waiting on you, just walked in, or never said anything yet (a fresh claude has no turn to report).
 * A sleeper finished SLEEP_AFTER_MS before they nodded off (server/roster.ts).
 */
export function finishedAt(e: Employee): number | null {
  if (!e.lastText) return null;
  if (e.state === 'idle') return e.stateSince;
  if (e.state === 'sleeping') return e.stateSince - SLEEP_AFTER_MS;
  return null;
}

/** Finished, and you haven't seen it (whatever the switch says). */
function unseen(e: Employee): boolean {
  const at = finishedAt(e);
  if (at === null) return false;
  const was = load().get(e.sessionId);
  return was === undefined || at > was + SLACK_MS;
}

/** Ready for you: they finished their turn and you haven't looked yet (and the cue is on). */
export function isReady(e: Employee): boolean {
  return unseen(e) && readyCueOn();
}

/** You looked at them (their chat, their computer, Monitor, Say): their finish isn't news any more. */
export function markSeen(e: Employee | undefined): void {
  if (!e || !unseen(e)) return;
  load().set(e.sessionId, finishedAt(e)!);
  save();
  changed();
}

/**
 * The first roster this browser ever sees: whoever is already done is the starting line, not
 * news (or a first visit would open on a wall of "ready"). Later visits keep what was saved, so
 * whoever finished while the office was closed is still news.
 */
export function baseline(list: Employee[]): void {
  load();
  if (!fresh) return;
  fresh = false;
  for (const e of list) {
    const at = finishedAt(e);
    if (at !== null) seen!.set(e.sessionId, at);
  }
  save();
}

/** Whoever is ready, longest-waiting first. */
export function readyList(list: readonly Employee[]): Employee[] {
  return list.filter(isReady).sort((a, b) => finishedAt(a)! - finishedAt(b)!);
}

// Dev builds with ?debug=1: checks can start over (window.officeReady.reset()).
if (import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  Object.assign(window, {
    officeReady: {
      reset() {
        load().clear();
        save();
        changed();
      },
    },
  });
}
