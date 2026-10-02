// Someone's live terminal over /term: one TerminalView (xterm.js + fit + the socket + reconnect),
// used two ways:
// - "Sit at their computer" (UX.md §3.4), TerminalOverlay: a chunky monitor grows out of their
//   desk screen. Every key goes to Claude (it needs Esc) once the bezel is open; before that Esc
//   cancels. Stand up with the button or Ctrl+].
// - The quick look (T), in the chat panel: the same terminal, right away, no walking or sitting.
// Office tmux sessions run with `mouse on`: xterm sends the wheel to tmux as mouse events and tmux
// scrolls Claude's history, so nothing here may swallow wheel events.
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

const THEME = {
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
};

export type TermStatus = 'connecting' | 'connected' | 'reconnecting' | 'lost' | 'ended';

export interface TerminalViewOptions {
  /** Connection state, for the host's chrome (the chin's LED, a header line). */
  onStatus?(status: TermStatus): void;
  /** For good: the session ended (1000) or the office refused the attach (1008, with its reason). */
  onEnd?(why: 'ended' | 'refused', reason: string): void;
  /** The host's keys come first: return true for a key the host used (it never reaches Claude). */
  onKey?(ev: KeyboardEvent): boolean;
  /** Hold every key until release() (the sit-down's bezel animation). Default: live at once. */
  hold?: boolean;
}

/** A live, interactive terminal for one session. Put `el` in the page, then start(). */
export class TerminalView {
  readonly el: HTMLElement;
  private term: Terminal | null = null;
  private fitter: FitAddon | null = null;
  private link: TermLink | null = null;
  private attempt = 0;
  private live: boolean;
  private disposed = false;
  private timers: number[] = [];
  /**
   * Keys that went down while the terminal was live. Auto-repeat only gets through for these: a
   * key already held when it opened (the Enter that pressed "Terminal", the T that opened the
   * quick look) must never repeat into the session, where a CR picks "Yes".
   */
  private held = new Set<string>();
  private resizeObs: ResizeObserver | null = null;

  constructor(
    private backend: Backend,
    readonly sessionId: string,
    private opts: TerminalViewOptions = {},
  ) {
    this.el = el('div', { class: 'term-screen' });
    this.live = !opts.hold;
  }

  /** Open xterm in `el` (it must be in the document, to measure) and connect. */
  start(): void {
    if (this.term || this.disposed) return;
    const term = new Terminal({
      fontFamily: 'ui-monospace, "SF Mono", Menlo, Monaco, "Cascadia Mono", Consolas, monospace',
      fontSize: 14,
      lineHeight: 1.1,
      cursorBlink: true,
      macOptionIsMeta: true,
      scrollback: 5000,
      theme: THEME,
    });
    const fitter = new FitAddon();
    term.loadAddon(fitter);
    term.open(this.el);
    this.term = term;
    this.fitter = fitter;
    this.fit();
    term.attachCustomKeyEventHandler((ev) => {
      if (this.opts.onKey?.(ev)) {
        ev.preventDefault();
        ev.stopPropagation();
        return false;
      }
      if (!this.live) return false;
      if (ev.type === 'keyup') this.held.delete(ev.code);
      else if (!ev.repeat) this.held.add(ev.code);
      else if (!this.held.has(ev.code)) return false;
      return true;
    });
    // Focus left and came back: whatever was held then counts as held from before.
    term.textarea?.addEventListener('blur', () => this.held.clear());
    term.onData((d) => {
      if (this.live) this.link?.send({ t: 'in', d });
    });
    term.onResize(({ cols, rows }) => this.link?.send({ t: 'resize', cols, rows }));
    // Panels change width (Chat ⇄ Terminal) and windows resize: follow the box.
    this.resizeObs = new ResizeObserver(() => this.fit());
    this.resizeObs.observe(this.el);
    this.connect();
  }

  /** Let keys through (after the sit-down's bezel opened) and take focus. */
  release(): void {
    this.live = true;
    this.fit();
    this.focus();
  }

  focus(): void {
    this.term?.focus();
  }

  fit(): void {
    try {
      this.fitter?.fit();
    } catch {
      // not laid out yet
    }
  }

  /** Reconnect now (the "Try again" button). */
  retry(): void {
    this.attempt = 0;
    this.link?.close();
    this.connect();
    this.focus();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const t of this.timers) window.clearTimeout(t);
    this.timers = [];
    this.resizeObs?.disconnect();
    const link = this.link;
    this.link = null;
    link?.close();
    this.term?.dispose();
    this.term = null;
    this.fitter = null;
  }

  private connect(): void {
    const term = this.term;
    if (!term || this.disposed) return;
    const link = this.backend.terminal(this.sessionId, term.cols, term.rows);
    this.link = link;
    this.opts.onStatus?.(this.attempt ? 'reconnecting' : 'connecting');
    link.onOpen = () => {
      if (this.link !== link) return;
      this.attempt = 0;
      this.opts.onStatus?.('connected');
      link.send({ t: 'resize', cols: term.cols, rows: term.rows });
    };
    link.onData = (d) => {
      if (this.link === link) term.write(d);
    };
    link.onClose = (code, reason) => {
      if (this.link !== link || this.disposed) return;
      if (code === 1000) {
        // 'detached': the session ended or was let go.
        this.opts.onStatus?.('ended');
        term.write(`\r\n\x1b[2m[Their session has ended.]\x1b[0m\r\n`);
        this.opts.onEnd?.('ended', reason);
      } else if (code === 1008) {
        this.opts.onStatus?.('ended');
        this.opts.onEnd?.('refused', reason);
      } else if (this.attempt < RETRY_MS.length) {
        this.opts.onStatus?.('reconnecting');
        this.timers.push(
          window.setTimeout(() => {
            if (this.link === link && !this.disposed) this.connect();
          }, RETRY_MS[this.attempt++]),
        );
      } else {
        this.opts.onStatus?.('lost');
        term.write(`\r\n\x1b[2m[Connection lost. Press Try again to reconnect.]\x1b[0m\r\n`);
      }
    };
  }
}

export interface TerminalEvents {
  /** The overlay closed (stood up, cancelled, or the session went away). */
  onClose?(): void;
  /** Something worth a toast. */
  onNotice?(text: string, kind: 'leave' | 'bad' | 'info'): void;
}

const STATUS_TEXT: Record<TermStatus, string> = {
  connecting: 'Connecting…',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
  lost: 'Connection lost',
  ended: 'Session ended',
};

/** Sitting at someone's computer: the monitor overlay around a TerminalView. */
export class TerminalOverlay {
  events: TerminalEvents = {};
  private layer: HTMLElement | null = null;
  private monitor: HTMLElement | null = null;
  private view: TerminalView | null = null;
  private from: DOMRect | null = null;
  private timers: number[] = [];

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
    const status = el('span', { class: 'term-status' }, STATUS_TEXT.connecting);
    const led = el('i', { class: 'term-led', attrs: { 'aria-hidden': 'true' } });
    const retry = button('Try again', { small: true, onClick: () => view.retry() });
    retry.hidden = true;
    const stand = button('Stand up', { key: 'Ctrl+]', onClick: () => this.close() });
    stand.classList.add('term-stand');

    const view: TerminalView = new TerminalView(this.backend, who.sessionId, {
      hold: true,
      onKey: (ev) => {
        // Ctrl+] stands up and never reaches the terminal.
        if (ev.ctrlKey && (ev.code === 'BracketRight' || ev.key === ']')) {
          if (ev.type === 'keydown') this.close();
          return true;
        }
        // Until the bezel is open nothing goes to Claude; Esc means "never mind".
        if (!ready && ev.key === 'Escape') {
          if (ev.type === 'keydown') this.close();
          return true;
        }
        return false;
      },
      onStatus: (s) => {
        status.textContent = STATUS_TEXT[s];
        led.classList.toggle('on', s === 'connected');
        retry.hidden = s !== 'lost';
      },
      onEnd: (why, reason) => {
        if (why === 'refused') {
          this.events.onNotice?.(`Can't use ${who.displayName}'s computer${reason ? `: ${reason}` : ''}`, 'bad');
          this.close();
          return;
        }
        // The chin and the terminal say so; the office's own "clocked out" toast follows.
        this.timers.push(
          window.setTimeout(() => {
            if (this.view === view) this.close();
          }, ENDED_MS),
        );
      },
    });

    const monitor = el(
      'div',
      { class: 'term-monitor' },
      el('div', { class: 'term-bezel' }, view.el),
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
        view.focus();
      }
    });
    this.root.append(layer);
    this.layer = layer;
    this.monitor = monitor;
    this.view = view;
    document.body.classList.add('seated');
    this.growFrom(monitor, this.from);
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
    if (monitor && this.from) this.shrinkInto(monitor, this.from);
    window.setTimeout(() => {
      view?.dispose();
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
