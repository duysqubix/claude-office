// A hot desk's computer (hotdesk.ts): the monitor grows out of an empty desk's screen around one
// terminal, your own shell there (a TerminalView of kind 'desk'), with no tabs. It looks and
// keys like sitting at someone's computer (TerminalOverlay): until the bezel is open Esc means
// "never mind", then every key goes to the shell (it needs Esc too); stand up with the button or
// Ctrl+]. The shell runs on after you stand up. `exit` closes it (New shell opens another), and
// Shut down closes it on purpose and stands you up.
import type { Backend } from '../net';
import { button } from './components';
import { el } from './el';
import { managerFace } from './faces';
import { OPEN_MS, STATUS_TEXT, TerminalOverlay, TerminalView, type TermStatus, type TerminalEvents } from './terminal';

const isStandUp = (ev: KeyboardEvent) => ev.ctrlKey && (ev.code === 'BracketRight' || ev.key === ']');

export class DeskTerminal {
  events: TerminalEvents = {};
  private layer: HTMLElement | null = null;
  private monitor: HTMLElement | null = null;
  private view: TerminalView | null = null;
  private from: DOMRect | null = null;
  private timers: number[] = [];
  /** Takes the document-wide Ctrl+] listener off again. */
  private offKeys: (() => void) | null = null;

  constructor(
    private root: HTMLElement,
    private backend: Backend,
  ) {}

  get isOpen(): boolean {
    return this.layer !== null;
  }

  /** Sit at `desk`'s computer. `from` = its monitor's on-screen rect, to grow out of. */
  open(desk: number, from?: DOMRect): void {
    if (this.layer) this.close();
    this.from = from ?? null;
    let ready = false;
    let state: TermStatus = 'connecting';
    const status = el('span', { class: 'term-status' }, STATUS_TEXT.connecting);
    const led = el('i', { class: 'term-led', attrs: { 'aria-hidden': 'true' } });
    const retry = button('Try again', { small: true, onClick: () => view.retry() });
    const fresh = button('New shell', { small: true, onClick: () => view.retry() });
    const shut = button('Shut down', { small: true, onClick: () => void shutDown() });
    const stand = button('Stand up', { key: 'Ctrl+]', onClick: () => this.close() });
    stand.classList.add('term-stand');
    /** The chin follows the connection: Try again once it's lost, New shell once the shell has closed. */
    const chrome = () => {
      status.textContent = state === 'ended' ? 'Shell closed' : STATUS_TEXT[state];
      led.classList.toggle('on', state === 'connected');
      retry.hidden = state !== 'lost';
      fresh.hidden = state !== 'ended';
      shut.hidden = state === 'ended';
    };
    const view: TerminalView = new TerminalView(this.backend, String(desk), {
      kind: 'desk',
      hold: true,
      onKey: (ev) => {
        // Ctrl+] stands up and never reaches the shell.
        if (isStandUp(ev)) {
          if (ev.type === 'keydown') this.close();
          return true;
        }
        // Until the bezel is open nothing goes to the shell; Esc means "never mind".
        if (!ready && ev.key === 'Escape') {
          if (ev.type === 'keydown') this.close();
          return true;
        }
        return false;
      },
      onStatus: (s) => {
        state = s;
        chrome();
      },
      onEnd: (why, reason) => {
        // No shell at all (no tmux, say): say so and stand up. One that exited stays on screen.
        if (why !== 'refused') return;
        this.events.onNotice?.(`Can't use this computer${reason ? `: ${reason}` : ''}`, 'bad');
        this.close();
      },
    });
    const shutDown = async () => {
      shut.disabled = true;
      const r = await this.backend.closeDesk(desk);
      if (this.view !== view) return;
      if (r.ok) this.close();
      else {
        shut.disabled = false;
        this.events.onNotice?.(`Couldn't shut it down${r.error ? `: ${r.error}` : ''}`, 'bad');
      }
    };
    chrome();

    const monitor = el(
      'div',
      { class: 'term-monitor' },
      el('div', { class: 'term-bezel' }, view.el),
      el(
        'div',
        { class: 'term-chin' },
        el('span', { class: 'term-face', html: managerFace({ size: 32 }) }),
        el('span', { class: 'term-name' }, el('b', null, 'Hot desk'), el('span', null, 'Your shell in ~')),
        led,
        status,
        el('span', { class: 'term-spacer' }),
        el('span', { class: 'term-hint' }, 'Esc goes to the shell'),
        retry,
        fresh,
        shut,
        stand,
      ),
      el('div', { class: 'term-neck' }),
      el('div', { class: 'term-foot' }),
    );
    const layer = el('div', { class: 'term-modal', attrs: { role: 'dialog', 'aria-label': 'Hot desk' } }, monitor);
    // Clicks on the backdrop or the monitor itself (not a button, not the screen) keep the
    // keyboard in the shell. They never close it.
    layer.addEventListener('pointerdown', (ev) => {
      const t = ev.target as Element;
      if (t.closest('button, a, input, textarea, .term-screen')) return;
      ev.preventDefault();
      view.focus();
    });
    // Ctrl+] from the chin's buttons too (inside the shell, onKey has it first), and from
    // wherever the focus went (the page itself, say).
    const keys = (ev: KeyboardEvent) => {
      if (ev.defaultPrevented || this.layer !== layer || !isStandUp(ev)) return;
      ev.preventDefault();
      ev.stopPropagation();
      this.close();
    };
    layer.addEventListener('keydown', keys);
    const outside = (ev: KeyboardEvent) => {
      if (!layer.contains(ev.target as Node)) keys(ev);
    };
    document.addEventListener('keydown', outside, true);
    this.offKeys = () => document.removeEventListener('keydown', outside, true);
    this.root.append(layer);
    this.layer = layer;
    this.monitor = monitor;
    this.view = view;
    document.body.classList.add('seated');
    TerminalOverlay.growFrom(monitor, this.from);
    view.start();
    view.focus();
    this.timers.push(
      window.setTimeout(() => {
        if (this.view !== view) return;
        ready = true;
        view.release();
      }, OPEN_MS),
    );
  }

  close(): void {
    if (!this.layer) return;
    this.offKeys?.();
    this.offKeys = null;
    for (const t of this.timers) window.clearTimeout(t);
    this.timers = [];
    const layer = this.layer;
    const monitor = this.monitor;
    const view = this.view;
    this.layer = null;
    this.monitor = null;
    this.view = null;
    document.body.classList.remove('seated');
    layer.classList.add('out');
    if (monitor && this.from) TerminalOverlay.shrinkInto(monitor, this.from);
    window.setTimeout(() => {
      view?.dispose();
      layer.remove();
    }, 260);
    this.events.onClose?.();
  }
}
