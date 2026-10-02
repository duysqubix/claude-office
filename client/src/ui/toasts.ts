// Toasts, top centre (UX.md §2): the game's show(text, kind, ms, sub) over the co- ToastStack.
// Faces on the left, clock-ins merge ("3 people clocked in"), and while you sit at someone's
// computer only errors show; the rest wait until you stand up.
import type { Employee } from '../../../shared/protocol';
import type { ToastRequest } from './bus';
import { ToastStack } from './components';
import { employeeFace } from './faces';
import { icon } from './icons';

export type ToastKind = 'info' | 'good' | 'warn' | 'bad' | 'arrive' | 'leave';

export interface ToastExtras {
  /** Whose toast it is: their face goes on the left. */
  who?: Employee;
  /** One small button, e.g. { label: 'Go', run: () => walkTo(id) }. */
  action?: { label: string; run: () => void };
  /** Slam in, for the big moments ("Interview went great!"). */
  slam?: boolean;
}

/** Toasts held while seated: the latest few. */
const HELD_MAX = 3;

export class Toasts {
  private stack: ToastStack;
  private held: ToastRequest[] = [];

  constructor(root: HTMLElement) {
    this.stack = new ToastStack(root);
    // Standing up (body loses .seated) lets the held ones through.
    new MutationObserver(() => {
      if (this.held.length && !document.body.classList.contains('seated')) {
        const held = this.held;
        this.held = [];
        for (const req of held) this.stack.show(req);
      }
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  show(text: string, kind: ToastKind = 'info', ms?: number, sub?: string, extras: ToastExtras = {}): void {
    const crowd = kind === 'arrive' || kind === 'leave';
    const req: ToastRequest = {
      text,
      sub,
      kind: crowd ? 'info' : kind,
      face: extras.who ? employeeFace(extras.who.sessionId, extras.who.hosted, { size: 32 }) : kind === 'good' ? icon('check', 32) : crowd ? icon('staff', 32) : undefined,
      action: extras.action,
      // At least 7 s for errors and 6 s with a button (UX.md §2); otherwise the caller's choice.
      ms: Math.max(ms ?? 3500, kind === 'bad' ? 7000 : extras.action ? 6000 : 0),
      slam: extras.slam,
      key: crowd ? kind : undefined,
      merged: kind === 'arrive' ? (n) => `${n} people clocked in` : kind === 'leave' ? (n) => `${n} people clocked out` : undefined,
      mergedFace: crowd ? icon('staff', 32) : undefined,
    };
    if (kind !== 'bad' && document.body.classList.contains('seated')) {
      this.held.push(req);
      if (this.held.length > HELD_MAX) this.held.shift();
      return;
    }
    this.stack.show(req);
  }
}
