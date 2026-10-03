// HUD (UX.md §2): the badge and clock, the needs-you chip (the hero), counts and the plan meter
// top-left; Roster, Hire, Sound and Help top-right; the [E] prompt bottom-centre; the offline
// banner top-centre. Same calls as before, so the game loop just feeds it numbers.
import type { Employee, EmployeeState, TeamStats } from '../../../shared/protocol';
import type { RosterStore } from '../net';
import { audio } from '../audio';
import type { OfficeStats } from '../world/types';
import { bus } from './bus';
import { coachDone, coachPrompt } from './coach';
import { hudButton, internChip, keyCap, needsChip, stateChip } from './components';
import { waitingLines } from './dom';
import { el } from './el';
import { logoSvg, setTabAlert } from './faces';
import { icon } from './icons';
import { planMeter } from './teamstats';

export interface HudHandlers {
  /** Clicked the needs-you chip (= Q). */
  needsYou(): void;
  /** Clicked the plan meter. */
  stats(): void;
  roster(): void;
  hire(): void;
  mute(): void;
  help(): void;
}

/** The count chips, in order; zeros hide. */
const COUNTED: EmployeeState[] = ['working', 'idle', 'sleeping', 'starting'];
/** After this long offline the banner stops saying "reconnecting" and says what to do. */
const STUCK_MS = 30_000;

export class Hud {
  private root: HTMLElement;
  private clock: HTMLElement;
  private sky: HTMLElement;
  private staff: HTMLElement;
  private demo: HTMLElement;
  private needsSlot: HTMLElement;
  private counts: HTMLElement;
  private meterSlot: HTMLElement;
  private soundBtn: HTMLButtonElement;
  private promptWrap: HTMLElement;
  private promptText = '';
  private promptFp = false;
  private crosshair: HTMLElement | null = null;
  private banner: HTMLElement;
  private bannerText: HTMLElement;
  /** What screen readers hear: changes with the situation, not with every second of the countdown. */
  private bannerSr: HTMLElement;
  private bannerLead: HTMLElement;
  private retryBtn: HTMLButtonElement;
  private srLive: HTMLElement;
  private office: OfficeStats | null = null;
  private usage: { stats: TeamStats; skew: number } | null = null;
  private needsKey = '';
  private countsKey = '';
  private ring: SVGCircleElement | null = null;
  private waiting = new Set<string>();
  private retryAt = 0;
  private offline = false;
  private offlineSince = 0;
  private backTimer = 0;
  private hadNeeds = false;
  private muted = false;
  private soundLocked = false;
  /** The Sound button's glyph on show (swapped only when it changes: a swap mid-click loses the click). */
  private soundGlyph: 'sound' | 'soundOff' = 'sound';
  /** The speakers unlocked during the event being handled right now (cleared once its task ends). */
  private unlocking = false;
  /** The Sound button's current press is the one that unlocks the speakers: its click doesn't mute. */
  private pressUnlocks = false;

  constructor(
    host: HTMLElement,
    private on: HudHandlers,
    private store?: RosterStore,
  ) {
    this.clock = el('span', { class: 'co-hud__clock' });
    this.sky = el('span', { class: 'co-hud__sky' });
    this.staff = el('span', { class: 'co-hud__staff' });
    this.demo = el('span', { class: 'co-tag co-hud__demo', attrs: { hidden: true, title: 'A pretend office: nothing here is a real session' } }, 'Demo');
    const badge = el(
      'div',
      { class: 'co-hud-box co-hud__badge' },
      el('span', { class: 'co-hud__logo', html: logoSvg(false, 40) }),
      el('span', null, el('span', { class: 'co-hud-box__title' }, 'Claude Office'), el('span', { class: 'co-hud-box__meta' }, this.sky, this.clock, this.staff, this.demo)),
    );
    this.needsSlot = el('div', { class: 'co-hud__needs' });
    this.counts = el('div', { class: 'co-hud__counts' });
    this.meterSlot = el('span', { class: 'co-hud__meter', attrs: { hidden: true } });
    const left = el('div', { class: 'co-hud__left' }, badge, this.needsSlot, el('div', { class: 'co-hud__row' }, this.counts, this.meterSlot));

    this.soundBtn = hudButton('sound', 'Sound', 'M', () => {
      // The press that unlocked the speakers turns sound on, as the dot promised: it doesn't mute.
      if (this.pressUnlocks) {
        this.pressUnlocks = false;
        return;
      }
      this.on.mute();
    });
    // Is this press the one that unlocks them? The speakers wake in a capture listener on window,
    // so they're unlocked by this very event already (unlocking), or not yet (still locked). No
    // clock involved: a busy main thread can hold the event back for any length of time. Muted,
    // there's no dot and no promise: the button says "Sound is off" and the press turns it on.
    const press = () => (this.pressUnlocks = (this.unlocking || this.soundLocked) && !this.muted);
    this.soundBtn.addEventListener('pointerdown', press);
    this.soundBtn.addEventListener('keydown', (ev) => (ev.key === 'Enter' || ev.key === ' ') && press());
    const right = el(
      'div',
      { class: 'co-hud__right' },
      hudButton('roster', 'Roster', 'R', () => this.on.roster()),
      hudButton('hire', 'Hire', 'H', () => this.on.hire()),
      this.soundBtn,
      hudButton('help', 'Help', '?', () => this.on.help()),
    );
    // Clicking a HUD button shouldn't leave focus on it (Space would press it again).
    right.addEventListener('click', (ev) => (ev.target as HTMLElement).closest('button')?.blur());

    this.promptWrap = el('div', { class: 'co-hud__prompt', attrs: { hidden: true } });
    this.bannerLead = el('span');
    this.bannerText = el('span', { attrs: { 'aria-hidden': 'true' } });
    this.bannerSr = el('span', { class: 'co-sr' });
    this.retryBtn = el('button', { class: 'co-btn co-btn--small', attrs: { type: 'button', hidden: true } }, 'Retry now');
    // net.ts reconnects at once on the browser's 'online' event.
    this.retryBtn.addEventListener('click', () => window.dispatchEvent(new Event('online')));
    this.banner = el('div', { class: 'co-banner co-hud__banner', attrs: { role: 'status', hidden: true } }, this.bannerLead, this.bannerSr, this.bannerText, this.retryBtn);
    this.srLive = el('div', { class: 'co-sr', attrs: { 'aria-live': 'assertive' } });

    this.root = el('div', { class: 'co-hud' }, left, right, this.promptWrap, this.banner, this.srLive);
    host.append(this.root);

    // The prompt's key cap presses with E.
    window.addEventListener('keydown', (ev) => {
      if (ev.code !== 'KeyE' || ev.repeat || this.promptWrap.hidden) return;
      const cap = this.promptWrap.querySelector('.co-key');
      cap?.classList.add('is-down');
      window.setTimeout(() => cap?.classList.remove('is-down'), 140);
    });
    store?.subscribe(() => this.renderPeople());
    this.renderPeople();
    this.tick();
    // The speakers (audio/): the dot until the browser lets the page play, and M or another
    // tab's mute showing on the button.
    const sound = () => {
      if (this.soundLocked && audio.unlocked) {
        this.unlocking = true;
        window.setTimeout(() => (this.unlocking = false));
      }
      if (this.soundLocked !== !audio.unlocked) this.setSoundLocked(!audio.unlocked);
      if (this.muted !== audio.muted) this.setMuted(audio.muted);
    };
    audio.subscribe(sound);
    sound();
  }

  setDemo(on: boolean): void {
    this.demo.hidden = !on;
  }

  /** Called by the game loop whenever the office's numbers change. */
  setStats(s: OfficeStats): void {
    this.office = s;
    this.renderPeople();
  }

  /** The plan meter (hidden until some session has reported plan usage). */
  setUsage(stats: TeamStats, serverNow: number): void {
    this.usage = { stats, skew: serverNow - Date.now() };
    this.renderMeter();
  }

  /**
   * Before the first click or key, browsers keep the page quiet: the Sound button wears a dot
   * and says so (UX.md §4.5).
   */
  setSoundLocked(locked: boolean): void {
    this.soundLocked = locked;
    this.setMuted(this.muted);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    // Muted says so first (the browser's lock doesn't matter then); locked: its name first (screen
    // readers, the tooltip), then why it's quiet.
    const locked = this.soundLocked && !m;
    this.soundBtn.classList.toggle('is-locked', locked);
    const label = m ? 'Sound is off (M)' : locked ? 'Sound (M): click anywhere to turn it on' : 'Sound is on (M)';
    const glyph = m ? 'soundOff' : 'sound';
    if (glyph !== this.soundGlyph) {
      this.soundGlyph = glyph;
      this.soundBtn.firstElementChild!.innerHTML = icon(glyph, 24);
    }
    this.soundBtn.setAttribute('aria-label', label);
    this.soundBtn.setAttribute('data-co-tip', label);
    this.soundBtn.setAttribute('aria-pressed', String(m));
  }

  /** Every frame: touches the DOM only when something changed. */
  setPrompt(text: string | null): void {
    if (!text) {
      if (this.promptText) {
        this.promptWrap.hidden = true;
        this.promptText = '';
        coachPrompt(null);
      }
      return;
    }
    // First person: the prompt sits under the crosshair.
    this.crosshair ??= document.getElementById('crosshair');
    const fp = this.crosshair?.hidden === false;
    if (fp !== this.promptFp) {
      this.promptFp = fp;
      this.promptWrap.classList.toggle('is-fp', fp);
    }
    if (text !== this.promptText) {
      this.promptText = text;
      this.promptWrap.replaceChildren(el('div', { class: 'co-prompt' }, keyCap('E', true), text));
      this.promptWrap.hidden = false;
      coachPrompt(text);
    }
  }

  setOffline(offline: boolean, retryAt = 0): void {
    const was = this.offline;
    if (offline && !was) this.offlineSince = Date.now();
    this.offline = offline;
    this.retryAt = retryAt;
    window.clearTimeout(this.backTimer);
    document.body.classList.toggle('co-offline', offline);
    // Server buttons everywhere follow this (offline.ts).
    if (offline !== was) bus.emit('offline', { offline, retryAt });
    if (!offline && was) {
      // A quick green "Back online", then out of the way.
      this.showBanner('back', 'Back online');
      this.backTimer = window.setTimeout(() => (this.banner.hidden = true), 1200);
      return;
    }
    if (!offline) {
      this.banner.hidden = true;
      return;
    }
    this.tick();
  }

  /** Once a second: the clock, timers and the reconnect countdown. */
  tick(): void {
    const d = new Date();
    this.clock.textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const night = d.getHours() >= 19 || d.getHours() < 6;
    if (this.sky.dataset.night !== String(night)) {
      this.sky.dataset.night = String(night);
      this.sky.innerHTML = icon(night ? 'moon' : 'sun', 18);
    }
    this.updateRing();
    if (d.getSeconds() === 0) this.renderMeter();
    if (this.offline) {
      const s = Math.max(0, Math.ceil((this.retryAt - Date.now()) / 1000));
      if (Date.now() - this.offlineSince > STUCK_MS) this.showBanner('stuck', "The office server isn't running. Start it with npm run dev in the claude-office folder.");
      else this.showBanner('offline', s > 1 ? `Lost the office server. Reconnecting in ${s}s…` : 'Lost the office server. Reconnecting…', 'Lost the office server. Reconnecting.');
    }
  }

  // ---------------------------------------------------------------------------------

  private people(): Employee[] {
    return this.store?.employees ?? [];
  }

  /** Needs-you chip, counts, tab title and the screen-reader announcement. */
  private renderPeople(): void {
    const people = this.people();
    const byState = (s: EmployeeState) => people.filter((e) => e.state === s).length;
    const needs = this.store ? byState('needs-you') : (this.office?.needsYou ?? 0);
    setTabAlert(needs);

    if (needs !== Number(this.needsKey || -1)) {
      this.needsKey = String(needs);
      const hadFocus = this.needsSlot.contains(document.activeElement);
      const chip = needsChip(needs, {
        left: this.soonestAsk() ?? undefined,
        onClick: () => {
          coachDone('q');
          this.on.needsYou();
        },
      });
      // "Nobody needs you" slams in only when the last person was just answered.
      if (needs === 0 && !this.hadNeeds) chip.classList.add('is-static');
      this.hadNeeds = needs > 0;
      this.needsSlot.replaceChildren(chip);
      this.ring = chip.querySelector('circle');
      chip.classList.add('is-counted');
      // Rebuilt under the keyboard: focus moves to the new chip (or back to the game for the calm one).
      if (hadFocus) (chip.matches('button') ? chip : document.getElementById('scene'))?.focus({ preventScroll: true });
    }
    this.updateRing();

    const counts = this.store
      ? COUNTED.map((s) => [s, byState(s)] as const)
      : ([
          ['working', this.office?.working ?? 0],
          ['idle', this.office?.idle ?? 0],
        ] as const);
    const interns = this.store ? people.reduce((n, e) => n + e.interns.length, 0) : (this.office?.interns ?? 0);
    const staff = this.office?.staff ?? people.length;
    const key = `${counts.map(([s, n]) => `${s}${n}`).join()}|${interns}|${staff}`;
    if (key !== this.countsKey) {
      this.countsKey = key;
      this.counts.replaceChildren(...counts.filter(([, n]) => n > 0).map(([s, n]) => stateChip(s, n)), ...(interns > 0 ? [internChip(interns)] : []));
      this.staff.textContent = `${staff} staff`;
    }

    // Say each new hand-up once, assertively (UX.md §5).
    const now = new Set(people.filter((e) => e.state === 'needs-you').map((e) => e.sessionId));
    for (const e of people) {
      if (now.has(e.sessionId) && !this.waiting.has(e.sessionId)) {
        const fact = (e.ask?.title ?? waitingLines(e)[1]).replace(/[.!?]+$/, '');
        this.srLive.textContent = `${e.displayName}: ${fact.charAt(0).toLowerCase()}${fact.slice(1)}.`;
      }
    }
    this.waiting = now;
  }

  /** How much time the soonest open ask has left, 0–1 (null: no ask open). */
  private soonestAsk(): number | null {
    const now = this.store?.now() ?? Date.now();
    let best: number | null = null;
    for (const e of this.people()) {
      const a = e.ask;
      if (!a) continue;
      const left = Math.max(0, Math.min(1, (a.expiresAt - now) / Math.max(1, a.expiresAt - a.createdAt)));
      if (best === null || left < best) best = left;
    }
    return best;
  }

  /** Drain the chip's ring with the soonest ask (drawn by needsChip; this only moves the dash). */
  private updateRing(): void {
    const left = this.soonestAsk();
    const chip = this.needsSlot.firstElementChild as HTMLElement | null;
    if (!chip || !chip.classList.contains('co-needs')) return;
    if ((left === null) !== !this.ring) {
      // An ask opened or closed: redraw the chip with (or without) its ring.
      this.needsKey = '';
      this.renderPeople();
      return;
    }
    if (!this.ring || left === null) return;
    const len = 2 * Math.PI * 14;
    this.ring.setAttribute('stroke-dasharray', `${(len * left).toFixed(2)} ${len.toFixed(2)}`);
  }

  private renderMeter(): void {
    const u = this.usage;
    const show = !!u && u.stats.plan.updatedAt !== null && u.stats.plan.limits.length > 0;
    this.meterSlot.hidden = !show;
    if (!u || !show) return;
    this.meterSlot.replaceChildren(planMeter(u.stats.plan.limits, Date.now() + u.skew, () => this.on.stats()));
  }

  /** `spoken`: what screen readers hear, when the visible text ticks (the countdown). */
  private showBanner(kind: 'offline' | 'stuck' | 'back', text: string, spoken = text): void {
    this.banner.hidden = false;
    if (this.bannerSr.textContent !== spoken) this.bannerSr.textContent = spoken;
    this.banner.classList.toggle('co-banner--back', kind === 'back');
    if (this.banner.dataset.kind !== kind) {
      this.banner.dataset.kind = kind;
      this.bannerLead.replaceChildren(kind === 'back' ? el('span', { html: icon('check', 22) }) : el('span', { class: 'co-spinner', attrs: { 'aria-hidden': 'true' } }));
    }
    this.retryBtn.hidden = kind !== 'stuck';
    if (this.bannerText.textContent !== text) this.bannerText.textContent = text;
  }
}
