// One typed event bus for everything the office should react to (UX.md §6). Gameplay code emits
// what happened; sound, effects, toasts, the tab title, coach cards and (later) achievements and
// Beans subscribe. Nobody calls the toast or sfx modules directly, so new listeners never touch
// gameplay code.
import type { Ask } from '../../../shared/protocol';
import type { Markup } from './el';

export type ToastKind = 'info' | 'good' | 'warn' | 'bad';

export interface ToastRequest {
  text: string;
  sub?: string;
  kind?: ToastKind;
  /** Portrait (faces.ts) or icon (icons.ts) shown on the left. */
  face?: Markup;
  action?: { label: string; run: () => void };
  /** Default: 3.5 s, 6 s with an action, 7 s for 'bad'. */
  ms?: number;
  /** Toasts with the same key within 2 s merge into one… */
  key?: string;
  /** …whose text this gives for n merged toasts, e.g. n => `${n} people clocked in`… */
  merged?: (n: number) => string;
  /** …with this icon instead of one person's face. */
  mergedFace?: Markup;
  /** Slam in (scale 1.4 → .95 → 1) for the big moments: "Interview went great!". */
  slam?: boolean;
}

/** Sounds from UX.md §4.5. */
export type SfxName =
  | 'pop'
  | 'unpop'
  | 'tick'
  | 'ding'
  | 'pop-up'
  | 'tada'
  | 'chime-in'
  | 'chime-out'
  | 'whoosh'
  | 'bell'
  | 'step'
  | 'boing'
  | 'thud'
  | 'boop'
  | 'error'
  | 'pip'
  | 'wahwah'
  | 'slurp';

export interface OfficeEvents {
  /** Someone walked in. `how` says why: their own terminal, hired here, called back, or a resync after reconnecting. */
  arrive: { id: string; name: string; project: string; how: 'external' | 'hired' | 'rehired' | 'resync' };
  /** Someone walked out. */
  leave: { id: string; name: string; project: string; how: 'exit' | 'fired' | 'resync' };
  'needs-you': { id: string; name: string; waitingFor?: string; ask?: Ask };
  /** A new in-game ask opened (always alongside 'needs-you'). */
  ask: { id: string; name: string; ask: Ask };
  /** They stopped waiting: answered here (`where: 'office'`) or in their own terminal. */
  answered: { id: string; name: string; where: 'office' | 'terminal'; choice?: string };
  'turn-done': { id: string; name: string; busyMs: number; lastPrompt?: string };
  hired: { cwd: string; name?: string };
  rehired: { id: string };
  fired: { id: string; name: string };
  'go-to': { id: string };
  toast: ToastRequest;
  sfx: { name: SfxName; /** Screen x in −1…1 for panning (P1). */ pan?: number };
  /** A docked panel opened or closed. `el` (and `left`/`top`, its box then): so edge faces stay clear of it. */
  panel: { name: string; open: boolean; left?: number; top?: number; el?: HTMLElement };
  jump: undefined;
  land: undefined;
  bump: { id: string; hard: boolean };
  coffee: undefined;
  offline: { offline: boolean; retryAt?: number };
}

type Listener<T> = (payload: T) => void;
type Args<T> = [T] extends [undefined] ? [] : [payload: T];

export class Bus<E extends object> {
  private listeners = new Map<keyof E, Set<Listener<never>>>();

  /** Subscribe; returns the unsubscribe function. */
  on<K extends keyof E>(type: K, fn: Listener<E[K]>): () => void {
    let set = this.listeners.get(type);
    if (!set) this.listeners.set(type, (set = new Set()));
    set.add(fn as Listener<never>);
    return () => this.off(type, fn);
  }

  once<K extends keyof E>(type: K, fn: Listener<E[K]>): () => void {
    const off = this.on(type, (p) => {
      off();
      fn(p);
    });
    return off;
  }

  off<K extends keyof E>(type: K, fn: Listener<E[K]>): void {
    this.listeners.get(type)?.delete(fn as Listener<never>);
  }

  /** Tell everyone. A listener that throws is logged and skipped; the others still run. */
  emit<K extends keyof E>(type: K, ...args: Args<E[K]>): void {
    const set = this.listeners.get(type);
    if (!set?.size) return;
    const payload = args[0] as never;
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[bus] a "${String(type)}" listener failed`, err);
      }
    }
  }

  /** Drop every listener (tests, the UI kit). */
  clear(): void {
    this.listeners.clear();
  }
}

/** The office's bus. */
export const bus = new Bus<OfficeEvents>();
