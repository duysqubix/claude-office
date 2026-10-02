// Keyboard state for the game. Never touches keys while you're typing into a form field
// or the terminal (Claude Code needs Esc and everything else).

export type Action = 'interact' | 'roster' | 'hire' | 'mute' | 'help' | 'jump' | 'close' | 'next' | 'view';

const ACTION_KEYS: Record<string, Action> = {
  KeyE: 'interact',
  KeyQ: 'next',
  KeyN: 'next',
  KeyR: 'roster',
  KeyV: 'view',
  KeyH: 'hire',
  KeyM: 'mute',
  Space: 'jump',
  Escape: 'close',
};
const MOVE_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/** True when keystrokes belong to a text field or the terminal, not the game. */
export function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  if (t.closest('.xterm, .term-modal')) return true;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export class Input {
  /** While true (terminal open) the game ignores the keyboard completely. */
  blocked = false;
  private down = new Set<string>();
  private actions: Action[] = [];
  /** Called when a movement key goes down (panels close themselves on it). */
  onMoveKey: (() => void) | null = null;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (this.blocked || isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Tab stays normal browser focus (the HUD is keyboard-reachable).
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      this.down.add(e.code);
      if (MOVE_CODES.has(e.code)) this.onMoveKey?.();
      if (e.repeat) return;
      const a = e.key === '?' ? 'help' : ACTION_KEYS[e.code];
      if (a) this.actions.push(a);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  }

  isDown(code: string): boolean {
    return !this.blocked && this.down.has(code);
  }

  /** Movement axis: x right, y forward, each −1..1. */
  axis(): { x: number; y: number } {
    const d = (a: string, b: string) => (this.isDown(a) || this.isDown(b) ? 1 : 0);
    return {
      x: d('KeyD', 'ArrowRight') - d('KeyA', 'ArrowLeft'),
      y: d('KeyW', 'ArrowUp') - d('KeyS', 'ArrowDown'),
    };
  }

  get running(): boolean {
    return this.isDown('ShiftLeft') || this.isDown('ShiftRight');
  }

  /** Actions pressed since the last call. */
  drain(): Action[] {
    const a = this.actions;
    this.actions = [];
    return this.blocked ? [] : a;
  }

  clear(): void {
    this.down.clear();
    this.actions = [];
  }
}
