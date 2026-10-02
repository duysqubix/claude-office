// The Shell tab's shells (tmux.ts ensureShell): one login shell per employee, in their folder.
// This closes a shell once its employee has been gone from the roster for a few seconds (let
// go, /exit, their terminal closed), and only ever the shells this office started.
import { PORT } from './config';
import { kill, listShells } from './tmux';

/** Gone this long before their shell closes, so one missed poll can't take it. */
const GRACE_MS = 5000;

export class ShellKeeper {
  /** Shell tmux name → when its employee was first seen missing. */
  private gone = new Map<string, number>();
  private sweeping = false;

  /** Close this office's shells whose employee isn't in `present` (after the grace period). */
  async sweep(present: readonly { sessionId: string }[]): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const here = new Set(present.map((e) => e.sessionId));
      const now = Date.now();
      const shells = await listShells();
      for (const [name, s] of shells) {
        if (s.port !== PORT || here.has(s.sessionId)) {
          this.gone.delete(name);
          continue;
        }
        const since = this.gone.get(name) ?? now;
        this.gone.set(name, since);
        if (now - since < GRACE_MS) continue;
        this.gone.delete(name);
        await kill(name).catch(() => {});
      }
      for (const name of [...this.gone.keys()]) if (!shells.has(name)) this.gone.delete(name);
    } finally {
      this.sweeping = false;
    }
  }

  /** They were let go: their shell (if this office opened one) closes now. */
  async close(sessionId: string): Promise<void> {
    for (const [name, s] of await listShells()) {
      if (s.sessionId === sessionId && s.port === PORT) await kill(name).catch(() => {});
    }
  }
}
