// "Ready for you" (#162): someone who finished their turn and whose finish you haven't seen yet.
// A finished session looks like it's resting (and soon asleep), so nothing told you it was
// waiting on you for the next task. Now it shows a calm cue until you look: open their chat, sit
// at their computer, have Monitor show them, or Say something to them. Walking past never counts.
//
// What you've seen is kept per session in this browser: the moment their last turn finished
// (server clock). A turn that finishes later than that is news again. Every office tab shares it
// (merged on each write, followed through 'storage' events). Looking only counts while the page
// is visible: a chat left open in a background tab sees nothing until you come back to it.
// Help has two switches: the cue itself, and its chime.
import type { Employee } from '../../../shared/protocol';
import { SLEEP_AFTER_MS } from '../../../shared/protocol';

const SEEN_KEY = 'claude-office:ready-seen';
const CUE_KEY = 'claude-office:ready-cue';
const CHIME_KEY = 'claude-office:ready-chime';
/** Sessions remembered at most (the newest finishes win). */
const KEEP = 300;
/** Slack for clocks, when the server sends no turnEndedAt and a sleeper's finish is worked out from when they fell asleep. */
const SLACK_MS = 2000;

/** Session id → the finish (server ms) you've seen. Null until loaded. */
let seen: Map<string, number> | null = null;
/** Nothing was saved yet: the first roster this browser sees is the starting line, not news. */
let fresh = false;
const subs = new Set<() => void>();

/** What's saved (null if nothing is, or storage is unavailable or garbled). */
function stored(): Map<string, number> | null {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (raw === null) return null;
    const m = new Map<string, number>();
    for (const [id, at] of Object.entries(JSON.parse(raw) as Record<string, number>)) if (typeof at === 'number') m.set(id, at);
    return m;
  } catch {
    return null;
  }
}

/** Fold `from` into `into`, keeping the later finish per session. True if anything moved. */
function merge(into: Map<string, number>, from: Map<string, number>): boolean {
  let moved = false;
  for (const [id, at] of from) {
    if (at > (into.get(id) ?? -Infinity)) {
      into.set(id, at);
      moved = true;
    }
  }
  return moved;
}

function load(): Map<string, number> {
  if (seen) return seen;
  const s = stored();
  // Nothing saved yet (or no storage): the first roster is the starting line (baseline).
  fresh = s === null;
  seen = s ?? new Map();
  return seen;
}

function save(): void {
  const m = load();
  // Another tab may have seen someone since we loaded: keep theirs too (the later finish wins).
  const s = stored();
  if (s) merge(m, s);
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

// Another office tab saw someone, or flipped a switch in Help: this one follows.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (ev) => {
    if (ev.key === SEEN_KEY) {
      const s = stored();
      if (s && merge(load(), s)) changed();
    } else if (ev.key === CUE_KEY || ev.key === CHIME_KEY || ev.key === null) changed();
  });
}

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
  if (!e.lastText || (e.state !== 'idle' && e.state !== 'sleeping')) return null;
  // The server's per-turn mark: stateSince stays put across a quick turn between two polls.
  if (e.turnEndedAt !== undefined) return e.turnEndedAt;
  return e.state === 'idle' ? e.stateSince : e.stateSince - SLEEP_AFTER_MS;
}

/** Finished, and you haven't seen it (whatever the switch says). */
function unseen(e: Employee): boolean {
  const at = finishedAt(e);
  if (at === null) return false;
  const was = load().get(e.sessionId);
  // The server's per-turn mark is exact: any later one is a new turn, however quick.
  return was === undefined || at > was + (e.turnEndedAt !== undefined ? 0 : SLACK_MS);
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

/** The page is on screen (a background tab sees nothing). */
const visible = (): boolean => typeof document === 'undefined' || document.visibilityState === 'visible';

/**
 * You're looking at them without doing anything (their chat or computer open as they finish,
 * Monitor on them): seen, but only while the page is visible.
 */
export function seenIfVisible(e: Employee | undefined): void {
  if (visible()) markSeen(e);
}

const watchers = new Set<() => Employee | undefined>();

/**
 * A view that shows someone (their chat, their computer, Monitor): `who` says whom, right now.
 * Coming back to the tab with it still open, you see how they finished. Returns the unwatch.
 */
export function watch(who: () => Employee | undefined): () => void {
  watchers.add(who);
  return () => watchers.delete(who);
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!visible()) return;
    for (const who of [...watchers]) markSeen(who());
  });
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
        try {
          localStorage.setItem(SEEN_KEY, '{}');
        } catch {
          // storage unavailable: nothing to clear
        }
        changed();
      },
    },
  });
}
