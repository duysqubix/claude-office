// "Sit at their computer" (UX.md §3.4): a chunky monitor with a real xterm.js terminal on /term.
// Every key goes to the terminal (Claude Code needs Esc) once the bezel has finished opening;
// before that, Esc cancels the sit-down. Stand up with the button or Ctrl+].
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import type { Employee } from '../../../shared/protocol';
import type { Backend, TermLink } from '../net';
import { button } from './components';
import { el } from './el';
import { employeeFace } from './faces';

/** How long the bezel takes to grow in; keys reach the pty only after this. */
const OPEN_MS = 460;
/** Dropped connections retry after these delays, then wait for "Try again". */
const RETRY_MS = [1000, 2000, 4000];
/** After their session ends, the message stays this long before you stand up. */
const ENDED_MS = 2000;

export interface TerminalEvents {
  /** The overlay closed (stood up, cancelled, or the session went away). */
  onClose?(): void;
  /** Something worth a toast. */
  onNotice?(text: string, kind: 'leave' | 'bad' | 'info'): void;
}

export class TerminalOverlay {
  events: TerminalEvents = {};
  private layer: HTMLElement | null = null;
  private monitor: HTMLElement | null = null;
  private term: Terminal | null = null;
  private link: TermLink | null = null;
  private fit: FitAddon | null = null;
  private from: DOMRect | null = null;
  private timers: number[] = [];
  private onResize = () => {
    try {
      this.fit?.fit();
    } catch {
      // not laid out
    }
  };

  constructor(
    private root: HTMLElement,
    private backend: Backend,
  ) {}

  get isOpen(): boolean {
    return this.layer !== null;
  }

  /** Open over `who`'s session. `from` = the desk monitor's on-screen rect, to grow out of. */
  open(who: Employee, from?: DOMRect): void {
    if (this.layer) this.close();
    this.from = from ?? null;
    let ready = false;
    let attempt = 0;
    const screen = el('div', { class: 'term-screen' });
    const status = el('span', { class: 'term-status' }, 'Connecting…');
    const led = el('i', { class: 'term-led', attrs: { 'aria-hidden': 'true' } });
    const retry = button('Try again', { small: true });
    retry.hidden = true;
    const stand = button('Stand up', { key: 'Ctrl+]', onClick: () => this.close() });
    stand.classList.add('term-stand');
    const monitor = el(
      'div',
      { class: 'term-monitor' },
      el('div', { class: 'term-bezel' }, screen),
      el(
        'div',
        { class: 'term-chin' },
        el('span', { class: 'term-face', html: employeeFace(who.sessionId, who.hosted, { size: 32 }) }),
        el('span', { class: 'term-name' }, el('b', null, `${who.displayName}'s computer`), el('span', null, who.project)),
        led,
        status,
        el('span', { class: 'term-spacer' }),
        el('span', { class: 'term-hint' }, 'Esc goes to Claude'),
        retry,
        stand,
      ),
      el('div', { class: 'term-neck' }),
      el('div', { class: 'term-foot' }),
    );
    const layer = el('div', { class: 'term-modal', attrs: { role: 'dialog', 'aria-label': `${who.displayName}'s computer` } }, monitor);
    // Backdrop clicks refocus the terminal, never close it.
    layer.addEventListener('pointerdown', (ev) => {
      if (ev.target === layer) {
        ev.preventDefault();
        this.term?.focus();
      }
    });
    this.root.append(layer);
    this.layer = layer;
    this.monitor = monitor;
    document.body.classList.add('seated');
    this.growFrom(monitor, this.from);

    const term = new Terminal({
      fontFamily: 'ui-monospace, "SF Mono", Menlo, Monaco, "Cascadia Mono", Consolas, monospace',
      fontSize: 14,
      lineHeight: 1.1,
      cursorBlink: true,
      macOptionIsMeta: true,
      scrollback: 5000,
      theme: {
        background: '#1B2330',
        foreground: '#E6EDF5',
        cursor: '#7FD8FF',
        cursorAccent: '#1B2330',
        selectionBackground: '#3C5A86',
        black: '#2B2D42',
        red: '#FF6B6B',
        green: '#6BCB77',
        yellow: '#FFD93D',
        blue: '#4D96FF',
        magenta: '#B983FF',
        cyan: '#00C2C7',
        white: '#E6EDF5',
        brightBlack: '#6B7A8F',
        brightRed: '#FF8A8A',
        brightGreen: '#9BE15D',
        brightYellow: '#FFE680',
        brightBlue: '#7FB2FF',
        brightMagenta: '#D2A8FF',
        brightCyan: '#5BE3E6',
        brightWhite: '#FFFFFF',
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(screen);
    this.term = term;
    this.fit = fit;
    this.onResize();
    // Office tmux sessions run with `mouse on`: tmux turns on mouse reporting, so xterm sends
    // the wheel to tmux as mouse events and tmux scrolls Claude's history (copy mode).

    term.attachCustomKeyEventHandler((ev) => {
      // Ctrl+] stands up and never reaches the terminal.
      if (ev.ctrlKey && (ev.code === 'BracketRight' || ev.key === ']')) {
        if (ev.type === 'keydown') this.close();
        return false;
      }
      // Until the bezel is open nothing goes to Claude; Esc means "never mind".
      if (!ready) {
        if (ev.type === 'keydown' && ev.key === 'Escape') this.close();
        return false;
      }
      return true;
    });

    const later = (fn: () => void, ms: number) => this.timers.push(window.setTimeout(fn, ms));
    const connect = () => {
      const link = this.backend.terminal(who.sessionId, term.cols, term.rows);
      this.link = link;
      status.textContent = attempt ? 'Reconnecting…' : 'Connecting…';
      retry.hidden = true;
      link.onOpen = () => {
        attempt = 0;
        status.textContent = 'Connected';
        led.classList.add('on');
        link.send({ t: 'resize', cols: term.cols, rows: term.rows });
      };
      link.onData = (d) => term.write(d);
      link.onClose = (code, reason) => {
        if (this.term !== term || this.link !== link) return;
        led.classList.remove('on');
        if (code === 1000) {
          // 'detached': the session ended or was let go.
          status.textContent = 'Session ended';
          term.write(`\r\n\x1b[2m[${who.displayName}'s session has ended.]\x1b[0m\r\n`);
          this.events.onNotice?.(`${who.displayName}'s session has ended.`, 'leave');
          later(() => {
            if (this.term === term) this.close();
          }, ENDED_MS);
        } else if (code === 1008) {
          this.events.onNotice?.(`Can't use ${who.displayName}'s computer${reason ? `: ${reason}` : ''}`, 'bad');
          this.close();
        } else if (attempt < RETRY_MS.length) {
          status.textContent = 'Reconnecting…';
          later(() => {
            if (this.term === term && this.link === link) connect();
          }, RETRY_MS[attempt++]);
        } else {
          status.textContent = 'Connection lost';
          retry.hidden = false;
          term.write(`\r\n\x1b[2m[Connection lost. Press Try again to reconnect.]\x1b[0m\r\n`);
        }
      };
    };
    retry.addEventListener('click', () => {
      attempt = 0;
      this.link?.close();
      connect();
      term.focus();
    });
    connect();
    term.onData((d) => {
      if (ready) this.link?.send({ t: 'in', d });
    });
    term.onResize(({ cols, rows }) => this.link?.send({ t: 'resize', cols, rows }));
    window.addEventListener('resize', this.onResize);
    later(() => {
      if (this.term !== term) return;
      ready = true;
      this.onResize();
      term.focus();
    }, OPEN_MS);
    term.focus();
  }

  close(): void {
    if (!this.layer) return;
    window.removeEventListener('resize', this.onResize);
    for (const t of this.timers) window.clearTimeout(t);
    this.timers = [];
    const layer = this.layer;
    const monitor = this.monitor;
    this.layer = null;
    this.monitor = null;
    const link = this.link;
    this.link = null;
    link?.close();
    const term = this.term;
    this.term = null;
    this.fit = null;
    document.body.classList.remove('seated');
    layer.classList.add('out');
    if (monitor && this.from) this.shrinkInto(monitor, this.from);
    window.setTimeout(() => {
      term?.dispose();
      layer.remove();
    }, 260);
    this.events.onClose?.();
  }

  /** FLIP: start the bezel at the desk monitor's rect and spring it to full size. */
  private growFrom(el: HTMLElement, from: DOMRect | null): void {
    if (!from || from.width < 4) return;
    const to = el.getBoundingClientRect();
    if (to.width < 4) return;
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const s = Math.max(0.05, from.width / to.width);
    el.style.animation = 'none';
    el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0.3 },
        { transform: 'translate(0, 0) scale(1.03)', opacity: 1, offset: 0.7 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: OPEN_MS, easing: 'cubic-bezier(.2,.8,.2,1)' },
    );
  }

  private shrinkInto(el: HTMLElement, into: DOMRect): void {
    const now = el.getBoundingClientRect();
    if (now.width < 4) return;
    const dx = into.left + into.width / 2 - (now.left + now.width / 2);
    const dy = into.top + into.height / 2 - (now.top + now.height / 2);
    const s = Math.max(0.05, into.width / now.width);
    el.animate([{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0 }], {
      duration: 260,
      easing: 'cubic-bezier(.5,0,.75,0)',
      fill: 'forwards',
    });
  }
}
