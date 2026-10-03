// Hot desks: sit at any empty desk and its computer is your own shell, a login shell in your
// home folder that the server keeps in tmux, so it runs on after you stand up. A desk with one
// running is hot: "Hot desk" on its nameplate and a shell at its prompt on the monitor. Regulars
// never take a hot desk, and a new session takes one only when no other desk is free. Nobody is
// given the desk you're sitting at. main.ts sits you down (sitAtDesk); the director and the
// regulars ask this about desks; ui/deskterm.ts is the computer itself.
import { MAX_HOT_DESK } from '../../shared/protocol';
import type { Director } from './chars/director';
import type { Regulars } from './chars/regulars';
import type { DeskSlot, World } from './world/types';

/** The E prompt at a desk nobody is using. */
export const USE_COMPUTER = 'Use the computer';

/** A hot desk's monitor: a shell waiting at its prompt (the cursor blinks after the last line). */
const SCREEN = ['Last login: at this desk', '', '~ % '];

export class HotDesks {
  /** Desks with your shell running (the server's list). */
  private hot: ReadonlySet<number> = new Set();
  /** The desk you're sitting at, or walking over to sit at. */
  private mine: number | null = null;

  constructor(
    private world: World,
    private director: Director,
    private regulars: Regulars,
  ) {}

  /**
   * The server's hot desks, on connect and whenever they change. A regular holding one (you sat
   * there in another tab, where nobody was) gives it up.
   */
  set(open: readonly number[]): void {
    this.hot = new Set(open);
    // A shell outlives the desk it was opened at when a busy office grew, then the page was
    // reloaded once it was quieter: build up to it again, so every running shell has its desk
    // (its nameplate, and a way to sit down and Shut down).
    if (open.length) this.world.ensureDesks(Math.max(...open) + 1);
    const held = this.regulars.holding();
    for (const i of this.hot) if (held.has(i)) this.regulars.makeRoom(i);
    this.director.refreshDesks();
  }

  isHot(index: number): boolean {
    return this.hot.has(index);
  }

  /** The desk you're sitting at (or walking over to): nobody is given it. null when you aren't. */
  get yours(): number | null {
    return this.mine;
  }

  /**
   * You can sit here: no session has the desk, and no regular is sitting at it. Its regular may
   * be away (on a break, or on their way to it): sitting down makes them give it up.
   */
  canSit(index: number): boolean {
    if (index > MAX_HOT_DESK) return false;
    if (this.director.list().some((e) => e.desk.index === index && e.phase !== 'leaving' && e.phase !== 'gone')) return false;
    return !this.regulars.holderOf(index)?.atDesk;
  }

  /** You're sitting down at `index`: it's yours until you stand up, and a regular away from it gives it up. */
  sit(index: number): void {
    this.mine = index;
    this.regulars.makeRoom(index);
  }

  stand(): void {
    this.mine = null;
  }

  /** Desks regulars leave alone: the hot ones, and yours. */
  offLimits(): Set<number> {
    const out = new Set(this.hot);
    if (this.mine !== null) out.add(this.mine);
    return out;
  }

  /** A hot desk nobody is at: its nameplate, and your shell waiting on the monitor. */
  paint(desk: DeskSlot): void {
    desk.setNameplate('Hot desk');
    desk.setScreen('working', SCREEN);
  }
}
