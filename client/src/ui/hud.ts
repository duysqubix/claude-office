// HUD: company badge, clock and stat chips (top-left), buttons (top-right), the
// interaction prompt (bottom centre) and the "server offline" banner.
import type { OfficeStats } from '../world/types';
import { h } from './dom';

export interface HudHandlers {
  /** Clicked the "need you" chip. */
  needsYou(): void;
  roster(): void;
  hire(): void;
  mute(): void;
  help(): void;
}

export class Hud {
  private clock: HTMLElement;
  private chips: Record<keyof Pick<OfficeStats, 'staff' | 'working' | 'needsYou' | 'interns'>, HTMLElement>;
  private needsChip: HTMLElement;
  private muteBtn: HTMLButtonElement;
  private prompt: HTMLElement;
  private promptText: HTMLElement;
  private banner: HTMLElement;
  private bannerText: HTMLElement;
  private retryAt = 0;
  private offline = false;
  private offlineSince = 0;
  private backTimer = 0;
  private demoTag: HTMLElement;

  constructor(root: HTMLElement, on: HudHandlers) {
    const chip = (cls: string, label: string) => {
      const n = h('b', null, '0');
      const el = h('span', { class: `hud-chip ${cls}` }, h('i'), n, h('span', null, label));
      return [el, n] as const;
    };
    const [staffEl, staffN] = chip('c-staff', 'staff');
    const [workEl, workN] = chip('c-working', 'working');
    const [needEl, needN] = chip('c-needs', 'need you');
    const [internEl, internN] = chip('c-interns', 'interns');
    this.chips = { staff: staffN, working: workN, needsYou: needN, interns: internN };
    this.needsChip = needEl;
    needEl.title = 'Walk over to whoever needs you';
    needEl.addEventListener('click', () => on.needsYou());
    this.clock = h('span', { class: 'hud-clock' }, '--:--');
    this.demoTag = h('span', { class: 'hud-demo', hidden: true }, 'DEMO');
    const badge = h(
      'div',
      { class: 'hud-badge' },
      h('div', { class: 'hud-logo' }, h('i'), h('i'), h('b')),
      h('div', { class: 'hud-title' }, h('strong', null, 'Claude Office'), h('span', null, this.clock, this.demoTag)),
    );
    const left = h('div', { class: 'hud-left' }, badge, h('div', { class: 'hud-chips' }, staffEl, workEl, needEl, internEl));

    const btn = (label: string, key: string, fn: () => void, cls = '') => {
      const b = h('button', { class: `btn btn-hud ${cls}`, type: 'button', title: `${label} (${key})` }, label, h('kbd', null, key));
      b.addEventListener('click', () => {
        fn();
        b.blur();
      });
      return b;
    };
    this.muteBtn = btn('Mute', 'M', on.mute, 'btn-mute');
    const right = h('div', { class: 'hud-right' }, btn('Roster', 'Tab', on.roster, 'btn-blue'), btn('Hire', 'H', on.hire, 'btn-orange'), this.muteBtn, btn('Help', '?', on.help, 'btn-plain'));

    this.promptText = h('span');
    this.prompt = h('div', { class: 'hud-prompt', hidden: true }, h('kbd', null, 'E'), this.promptText);
    this.bannerText = h('span');
    this.banner = h('div', { class: 'hud-offline', hidden: true }, h('i'), this.bannerText);
    root.append(left, right, this.prompt, this.banner);
    this.tick();
  }

  setDemo(on: boolean): void {
    this.demoTag.hidden = !on;
  }

  setStats(s: OfficeStats): void {
    this.chips.staff.textContent = String(s.staff);
    this.chips.working.textContent = String(s.working);
    this.chips.needsYou.textContent = String(s.needsYou);
    this.chips.interns.textContent = String(s.interns);
    this.needsChip.classList.toggle('hot', s.needsYou > 0);
  }

  setMuted(m: boolean): void {
    this.muteBtn.firstChild!.textContent = m ? 'Unmute' : 'Mute';
    this.muteBtn.classList.toggle('on', m);
  }

  setPrompt(text: string | null): void {
    if (!text) {
      this.prompt.hidden = true;
      return;
    }
    if (this.promptText.textContent !== text) {
      this.promptText.textContent = text;
      this.prompt.classList.remove('pop');
      void this.prompt.offsetWidth;
      this.prompt.classList.add('pop');
    }
    this.prompt.hidden = false;
  }

  setOffline(offline: boolean, retryAt = 0): void {
    const was = this.offline;
    if (offline && !was) this.offlineSince = Date.now();
    this.offline = offline;
    this.retryAt = retryAt;
    window.clearTimeout(this.backTimer);
    this.banner.classList.toggle('back', !offline && was);
    if (!offline && was) {
      // A quick green "Back online", then out of the way.
      this.bannerText.textContent = 'Back online';
      this.banner.hidden = false;
      this.backTimer = window.setTimeout(() => (this.banner.hidden = true), 1200);
      return;
    }
    this.banner.hidden = !offline;
    this.tick();
  }

  /** Once a second: clock and the retry countdown. */
  tick(): void {
    const d = new Date();
    this.clock.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (this.offline) {
      const s = Math.max(0, Math.ceil((this.retryAt - Date.now()) / 1000));
      this.bannerText.textContent =
        Date.now() - this.offlineSince > 30_000
          ? "The office server isn't running. Start it with npm run dev in ~/claude-office."
          : s > 1
            ? `Lost the office server. Reconnecting in ${s}s…`
            : 'Lost the office server. Reconnecting…';
    }
  }
}
