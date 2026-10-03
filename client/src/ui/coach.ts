// First-run tips (issue #32, UX.md §3.1): on a first visit, one small card at a time in the
// bottom-left corner teaches the basics: walking, E to talk, T for a quick look, Q for whoever
// needs you, V for first person, and (once, the first time you stand at one) that an empty desk's
// computer is yours. Each goes away when you do the thing (or press Got it), "Skip tips" ends them
// all, and Help → "Show tips again" starts over. A card never covers a needs-you bubble, its "!",
// an edge face or an open question: it steps aside until they've moved.
// Automated pages (tests, screenshots) get no tips unless they ask with ?tips=1.
import type { Employee } from '../../../shared/protocol';
import { USE_COMPUTER } from '../hotdesk';
import { isTypingTarget } from '../input';
import type { RosterStore } from '../net';
import { coachCard, keyCap } from './components';
import { el, type Child } from './el';

const KEY = 'claude-office:tips';
/** A walk this long (metres) counts as having learned to walk. */
const WALKED_M = 3;
/** A jump farther than this in one frame is a teleport (the start position, a go-to), not a walk. */
const STEP_MAX_M = 1.5;

type TipId = 'walk' | 'talk' | 'peek' | 'q' | 'v' | 'desk';
const ORDER: TipId[] = ['walk', 'talk', 'peek', 'v'];

interface Saved {
  done: TipId[];
  skipped?: boolean;
}

function load(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Saved | null;
    if (raw && Array.isArray(raw.done)) return raw;
  } catch {
    // unreadable: start fresh
  }
  return { done: [] };
}

function save(s: Saved): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage unavailable: this visit only
  }
}

const k = (label: string) => keyCap(label);

function tip(id: TipId, people: readonly Employee[]): { title: string; body: Child[] } {
  switch (id) {
    case 'walk':
      return {
        title: "You're the manager.",
        body: ['Walk with ', k('W'), k('A'), k('S'), k('D'), ' or the arrows. Hold ', k('Shift'), ' to run, ', k('Space'), ' to jump. Drag to look around, scroll to zoom.'],
      };
    case 'talk':
      return people.length
        ? { title: 'These are your Claude Code sessions.', body: ['Walk up to someone and press ', k('E'), ' to talk.'] }
        : { title: "Nobody's in yet.", body: ['Hire someone at reception (', k('H'), '), or run ', el('code', null, 'claude'), ' in any terminal.'] };
    case 'peek':
      return { title: 'Peek at their screen.', body: ['Press ', k('T'), ' near someone to see their live terminal right here. ', k('Esc'), ' comes back.'] };
    case 'q':
      return { title: 'A raised hand means they’re stuck.', body: ["They can't go on until you answer. Press ", k('Q'), ' to go to them.'] };
    case 'v':
      return { title: 'See it through your eyes.', body: ['Press ', k('V'), ' for first person. Click to look around, ', k('V'), ' again to step back.'] };
    case 'desk':
      return { title: 'This desk is free.', body: ['Press ', k('E'), ' to use its computer: your own shell, in your home folder. It keeps running after you stand up.'] };
  }
}

class Coach {
  private wrap: HTMLElement;
  private saved = load();
  private current: TipId | null = null;
  private walked = 0;
  private last: { x: number; z: number } | null = null;
  private started = false;
  /** Standing at an empty desk (its E prompt is showing). */
  private atDesk = false;

  constructor(
    host: HTMLElement,
    private store: RosterStore,
  ) {
    this.wrap = el('div', { class: 'co-coachwrap', attrs: { 'aria-live': 'polite' } });
    host.append(this.wrap);
    window.addEventListener('keydown', (ev) => {
      if (ev.repeat || ev.metaKey || ev.ctrlKey || ev.altKey || isTypingTarget(ev.target)) return;
      if ((ev.code === 'KeyQ' || ev.code === 'KeyN') && this.someoneNeedsYou()) this.done('q');
      if (ev.code === 'KeyV') this.done('v');
    });
    // Someone raising a hand is when the Q tip makes sense; the empty office's talk tip changes once someone's in.
    store.subscribe(() => {
      if (!this.started) return;
      if (!this.current) this.next();
      else if (this.current === 'talk') this.show('talk');
    });
    window.setInterval(() => this.place(), 250);
  }

  /** After the splash: a first visit gets the tips. */
  start(): void {
    this.started = true;
    this.next();
  }

  reset(): void {
    this.saved = { done: [] };
    save(this.saved);
    this.walked = 0;
    this.current = null;
    this.started = true;
    this.next();
  }

  /** The manager is here now (every frame; adds up the walk once the tips are on). */
  walk(x: number, z: number): void {
    if (!this.started) return;
    const step = this.last ? Math.hypot(x - this.last.x, z - this.last.z) : 0;
    if (step < STEP_MAX_M) this.walked += step;
    this.last = { x, z };
    if (this.walked >= WALKED_M && !this.has('walk')) this.done('walk');
  }

  /**
   * The E prompt changed. Standing at an empty desk for the first time, with no other card up,
   * brings its tip; it's done once you leave the prompt (sat down or walked on): it says it once.
   */
  prompt(text: string | null): void {
    const at = text === USE_COMPUTER;
    if (at === this.atDesk) return;
    this.atDesk = at;
    if (at) this.next();
    else if (this.current === 'desk') this.done('desk');
  }

  done(id: TipId): void {
    // Pages without tips (tests, screenshots) never record any progress.
    if (!this.started || this.has(id)) return;
    this.saved.done.push(id);
    save(this.saved);
    if (this.current === id) {
      this.current = null;
      this.next();
    }
  }

  private has(id: TipId): boolean {
    return this.saved.done.includes(id);
  }

  private someoneNeedsYou(): boolean {
    return this.store.employees.some((e) => e.state === 'needs-you');
  }

  private next(): void {
    if (this.saved.skipped || !this.started) return this.hide();
    if (this.current) return;
    // A raised hand jumps the queue once you can walk: it's the one that costs real time. Then
    // an empty desk you're standing at.
    const pending =
      this.has('walk') && this.someoneNeedsYou() && !this.has('q') ? 'q' : this.has('walk') && this.atDesk && !this.has('desk') ? 'desk' : ORDER.find((id) => !this.has(id));
    if (!pending) return this.hide();
    this.show(pending);
  }

  private show(id: TipId): void {
    this.current = id;
    const { title, body } = tip(id, this.store.employees);
    const card = coachCard(title, body, {
      done: 'Got it',
      onDone: () => this.done(id),
      onSkip: () => {
        this.saved.skipped = true;
        save(this.saved);
        this.current = null;
        this.hide();
      },
    });
    card.dataset.tip = id;
    this.wrap.replaceChildren(card);
    this.place();
  }

  private hide(): void {
    this.wrap.replaceChildren();
  }

  /**
   * Out of the way of anything that needs you: a card that would cover a needs-you bubble, its
   * "!", an edge face or an open question hides until they've moved. Sitting at a computer hides it.
   */
  private place(): void {
    const card = this.wrap.firstElementChild as HTMLElement | null;
    if (!card) return;
    const r = card.getBoundingClientRect();
    let blocked = document.body.classList.contains('seated');
    if (!blocked) {
      for (const n of document.querySelectorAll<HTMLElement>('.co-bubble--needs:not([hidden]), .co-bang:not([hidden]):not(.co-bang--bump), .co-edge, .co-ask:not(.is-folded)')) {
        const b = n.getBoundingClientRect();
        if (b.width && b.left < r.right && r.left < b.right && b.top < r.bottom && r.top < b.bottom) {
          blocked = true;
          break;
        }
      }
    }
    this.wrap.classList.toggle('is-away', blocked);
  }
}

let coach: Coach | null = null;

/** The HUD's E prompt changed (hud.ts): the desk tip watches for an empty desk's. */
export function coachPrompt(text: string | null): void {
  coach?.prompt(text);
}

/** Set up the tips (PanelHost does, once). They start when the office is on screen. */
export function startCoach(host: HTMLElement, store: RosterStore): void {
  if (coach) return;
  coach = new Coach(host, store);
  const params = new URLSearchParams(location.search);
  if (params.get('tips') === '0') return;
  if (navigator.webdriver && params.get('tips') !== '1') return;
  const go = () => {
    window.setTimeout(() => coach?.start(), 1200);
  };
  const splash = document.getElementById('splash');
  if (!splash || splash.classList.contains('gone')) {
    go();
    return;
  }
  new MutationObserver((_, obs) => {
    if (!splash.classList.contains('gone')) return;
    obs.disconnect();
    go();
  }).observe(splash, { attributes: true, attributeFilter: ['class'] });
}

/** Something a tip teaches just happened. */
export function coachDone(id: TipId): void {
  coach?.done(id);
}

/** The manager's position (each frame), for the walking tip. */
export function coachWalk(x: number, z: number): void {
  coach?.walk(x, z);
}

/** Help → "Show tips again". */
export function coachReset(): void {
  coach?.reset();
}
