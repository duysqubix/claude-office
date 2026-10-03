// Someone's live terminal over /term: one TerminalView (xterm.js + fit + the socket + reconnect),
// used two ways:
// - "Sit at their computer" (UX.md §3.4), TerminalOverlay: a chunky monitor grows out of their
//   desk screen. Every key goes to the terminal (Claude needs Esc) once the bezel is open; before
//   that Esc cancels. Stand up with the button or Ctrl+].
// - The quick look (T), in the chat panel: the same terminal, right away, no walking or sitting.
// Each computer has two tabs: Claude (their session, hosted only) and Shell (a login shell in
// their folder, anyone's), switched with the tabs or Ctrl+`.
// Office tmux sessions run with `mouse on`: xterm sends the wheel to tmux as mouse events and tmux
// scrolls the history, so nothing here may swallow wheel events.
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import type { Employee } from '../../../shared/protocol';
import type { Backend, TermKind, TermLink } from '../net';
import { lastTab, setLastTab } from '../termtab';
import { button, keyCap } from './components';
import { tildify } from './dom';
import { el } from './el';
import { employeeFace } from './faces';
import { icon } from './icons';

/** How long the bezel takes to grow in; keys reach the pty only after this. */
export const OPEN_MS = 460;
/** Dropped connections retry after these delays, then wait for "Try again". */
const RETRY_MS = [1000, 2000, 4000];
/** After their session ends, the message stays this long before you stand up. */
const ENDED_MS = 2000;
/** Keys and pastes go to the pty in pieces this long (UTF-16 units), far under the office's 8 MiB message cap. */
const INPUT_CHUNK = 64 * 1024;

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
  /** Their Claude session (default) or their shell. */
  kind?: TermKind;
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
      if (!this.live) return;
      // A big paste goes in pieces, each ending on a whole character (never half a surrogate pair).
      for (let i = 0; i < d.length; ) {
        let end = Math.min(d.length, i + INPUT_CHUNK);
        const last = d.charCodeAt(end - 1);
        if (end < d.length && last >= 0xd800 && last <= 0xdbff) end--;
        this.link?.send({ t: 'in', d: d.slice(i, end) });
        i = end;
      }
    });
    term.onResize(({ cols, rows }) => this.link?.send({ t: 'resize', cols, rows }));
    // Panels change width (Chat ⇄ Terminal) and windows resize: follow the box.
    this.resizeObs = new ResizeObserver(() => this.fit());
    this.resizeObs.observe(this.el);
    this.connect();
  }

  /**
   * Let keys through (after the sit-down's bezel opened, or the quick look's beat). It never moves
   * the keyboard: whoever opened it on purpose focused it already, and one that a roster update
   * rebuilt (someone moving into the office) must never take keys typed for something else.
   */
  release(): void {
    this.live = true;
    this.fit();
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

  get kind(): TermKind {
    return this.opts.kind ?? 'claude';
  }

  /** Shown again (a tab switch): keys held from before it was shown never auto-repeat into it. */
  forgetHeld(): void {
    this.held.clear();
  }

  /** Reconnect now (the "Try again" button; for a shell that was exited, a fresh shell). */
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
    // The screen goes too: an empty one left behind would push the next one out of view.
    this.el.remove();
  }

  private connect(): void {
    const term = this.term;
    if (!term || this.disposed) return;
    const link = this.backend.terminal(this.sessionId, term.cols, term.rows, this.kind);
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
        // 'detached': the session ended or was let go (a shell: someone typed exit).
        this.opts.onStatus?.('ended');
        term.write(this.kind !== 'claude' ? `\r\n\x1b[2m[The shell has closed. New shell opens another.]\x1b[0m\r\n` : `\r\n\x1b[2m[Their session has ended.]\x1b[0m\r\n`);
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

/** What the connection light says (at their computer and in the quick look). */
export const STATUS_TEXT: Record<TermStatus, string> = {
  connecting: 'Connecting…',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
  lost: 'Connection lost',
  ended: 'Session ended',
};

/** Ctrl+`: switch between their Claude and Shell tabs, from inside either terminal. */
export function isTabSwitch(ev: KeyboardEvent): boolean {
  return ev.ctrlKey && !ev.metaKey && !ev.altKey && (ev.code === 'Backquote' || ev.key === '`');
}

/**
 * The Claude | Shell tabs of someone's computer: folder tabs standing on the top edge of their
 * screen, with their key. `onPick(kind, focus)`: `focus` is true for a click with the mouse, which
 * puts you in that terminal. From the keyboard (Enter, Space, the arrows) you stay on the tabs, so
 * the key that picked one never lands in the terminal (an Enter there could answer Claude).
 */
export function termTabs(onPick: (kind: TermKind, focus: boolean) => void): { el: HTMLElement; set(kind: TermKind): void; focus(): void } {
  const tab = (kind: TermKind, label: string, glyph: 'model' | 'terminal') => {
    const b = el(
      'button',
      { class: 'term-tab', attrs: { type: 'button', role: 'tab', 'aria-selected': 'false', tabindex: '-1', 'data-tab': kind, 'aria-keyshortcuts': 'Control+`' } },
      el('span', { html: icon(glyph, 18) }),
      label,
    );
    // detail is the click count: 0 when Enter or Space pressed it.
    b.addEventListener('click', (ev) => onPick(kind, ev.detail > 0));
    return b;
  };
  const tabs = { claude: tab('claude', 'Claude', 'model'), shell: tab('shell', 'Shell', 'terminal') };
  const list = el('div', { class: 'term-tabs', attrs: { role: 'tablist', 'aria-label': 'Their terminals' } }, tabs.claude, tabs.shell);
  // The arrows (and Home/End) move between the tabs and show each one; they never reach the game.
  list.addEventListener('keydown', (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const to = ev.key === 'Home' ? 'claude' : ev.key === 'End' ? 'shell' : ev.key === 'ArrowLeft' || ev.key === 'ArrowRight' ? (tabs.claude.getAttribute('aria-selected') === 'true' ? 'shell' : 'claude') : null;
    if (!to) return;
    ev.preventDefault();
    ev.stopPropagation();
    // A held arrow switches once.
    if (ev.repeat) return;
    onPick(to, false);
    tabs[to].focus();
  });
  const key = keyCap('Ctrl+`');
  key.title = 'Switch tabs';
  return {
    el: el('div', { class: 'term-tabbar' }, list, key),
    set(kind) {
      for (const [k, b] of Object.entries(tabs)) {
        b.setAttribute('aria-selected', String(k === kind));
        b.tabIndex = k === kind ? 0 : -1;
      }
    },
    /** Keyboard on the tab that's showing (never on a button a stray Space or Enter would press). */
    focus() {
      (tabs.claude.getAttribute('aria-selected') === 'true' ? tabs.claude : tabs.shell).focus();
    },
  };
}

/** Sitting at someone's computer: the monitor overlay around their terminals (Claude and Shell). */
export class TerminalOverlay {
  events: TerminalEvents = {};
  private layer: HTMLElement | null = null;
  private monitor: HTMLElement | null = null;
  private views: Partial<Record<TermKind, TerminalView>> = {};
  private from: DOMRect | null = null;
  private timers: number[] = [];
  /** Takes the document-wide Ctrl+] and Ctrl+` listener off again. */
  private offKeys: (() => void) | null = null;

  constructor(
    private root: HTMLElement,
    private backend: Backend,
    /** The home folder, for "~/…" paths on the Shell tab. */
    private home: () => string = () => '',
  ) {}

  get isOpen(): boolean {
    return this.layer !== null;
  }

  /**
   * Open over `who`'s computer, on the tab they were last looked at in (their Shell for someone
   * who runs in your own terminal). `from` = the desk monitor's on-screen rect, to grow out of.
   */
  open(who: Employee, from?: DOMRect): void {
    if (this.layer) this.close();
    this.from = from ?? null;
    const id = who.sessionId;
    let ready = false;
    // Their Shell when there's no Claude here; Claude while they need you (you came to answer);
    // else where you last looked.
    let tab: TermKind = !who.hosted ? 'shell' : who.state === 'needs-you' ? 'claude' : (lastTab(id) ?? 'claude');
    let claudeEnded = false;
    /** When you last pressed a key here: standing you up waits for the keyboard to go quiet. */
    let lastKeyAt = 0;
    const statusOf: Partial<Record<TermKind, TermStatus>> = {};
    /** A tab whose terminal the office refused says why in the chin (until it connects after all). */
    const refusedNote: Partial<Record<TermKind, string>> = {};
    const status = el('span', { class: 'term-status' }, STATUS_TEXT.connecting);
    const led = el('i', { class: 'term-led', attrs: { 'aria-hidden': 'true' } });
    const retry = button('Try again', { small: true, onClick: () => this.views[tab]?.retry() });
    const fresh = button('New shell', { small: true, onClick: () => this.views.shell?.retry() });
    retry.hidden = fresh.hidden = true;
    const stand = button('Stand up', { key: 'Ctrl+]', onClick: () => this.close() });
    stand.classList.add('term-stand');
    const name = el('b', null, `${who.displayName}'s computer`);
    const where = el('span');
    const hint = el('span', { class: 'term-hint' });
    const tabs = termTabs((k, focus) => pick(k, focus));
    const bezel = el('div', { class: 'term-bezel' }, tabs.el);
    // Someone in your own terminal (or another office's hire) has no Claude screen here, only their shell.
    const note = el(
      'div',
      { class: 'term-screen term-note', attrs: { hidden: true } },
      el('span', { html: icon('terminal', 32) }),
      who.otherOffice
        ? el('p', null, el('strong', null, `${who.displayName} works in another office`), ", so there's no Claude screen here. Their Shell tab works.")
        : el('p', null, el('strong', null, `${who.displayName} runs in their own terminal`), ` (pid ${who.pid}), so there's no Claude screen here. Their Shell tab works.`),
    );
    bezel.append(note);

    /** The chin follows whichever tab is showing (no light at all where there's no screen). */
    const chrome = () => {
      const s = statusOf[tab];
      const shell = tab === 'shell';
      const noClaude = !shell && !who.hosted;
      status.textContent = refusedNote[tab] ?? (s === 'ended' && shell ? 'Shell closed' : STATUS_TEXT[s ?? 'connecting']);
      status.hidden = led.hidden = noClaude;
      led.classList.toggle('on', s === 'connected');
      retry.hidden = noClaude || s !== 'lost';
      fresh.hidden = !shell || s !== 'ended';
      where.textContent = shell ? `Shell in ${tildify(who.cwd, this.home())}` : who.project;
      hint.textContent = shell ? 'Esc goes to the shell' : 'Esc goes to Claude';
      hint.hidden = noClaude;
    };

    const makeView = (kind: TermKind): TerminalView => {
      const view: TerminalView = new TerminalView(this.backend, id, {
        kind,
        hold: !ready,
        onKey: (ev) => {
          // Ctrl+` flips tabs (once per press: a held one never repeats into the other terminal).
          if (isTabSwitch(ev)) {
            if (ev.type === 'keydown' && !ev.repeat) pick(tab === 'claude' ? 'shell' : 'claude');
            return true;
          }
          // Ctrl+] stands up and never reaches the terminal.
          if (ev.ctrlKey && (ev.code === 'BracketRight' || ev.key === ']')) {
            if (ev.type === 'keydown') this.close();
            return true;
          }
          // Until the bezel is open nothing goes to the terminal; Esc means "never mind".
          if (!ready && ev.key === 'Escape') {
            if (ev.type === 'keydown') this.close();
            return true;
          }
          return false;
        },
        onStatus: (s) => {
          statusOf[kind] = s;
          if (s === 'connected') delete refusedNote[kind];
          if (kind === tab) chrome();
        },
        onEnd: (why, reason) => {
          // Refused (their folder is gone, say): with the other tab's terminal here, that tab says so
          // in the chin and you stay seated; with nothing else here, stand up.
          if (why === 'refused') {
            const other = this.views[kind === 'claude' ? 'shell' : 'claude'];
            if (other || (kind === 'shell' && who.hosted)) {
              statusOf[kind] = 'lost';
              refusedNote[kind] = `${kind === 'shell' ? 'No shell' : "Can't show Claude"}${reason ? `: ${reason}` : ''}`;
              if (kind === tab) chrome();
              return;
            }
            this.events.onNotice?.(`Can't use ${who.displayName}'s ${kind === 'shell' ? 'shell' : 'computer'}${reason ? `: ${reason}` : ''}`, 'bad');
            this.close();
            return;
          }
          // An exited shell stays on screen; New shell opens another.
          if (kind === 'shell') return;
          // The chin and the terminal say so; the office's own "clocked out" toast follows. You
          // stand up once you stop typing; in their Shell you stay until you're done there.
          claudeEnded = true;
          if (tab === 'claude') standWhenQuiet();
        },
      });
      this.views[kind] = view;
      bezel.append(view.el);
      view.start();
      return view;
    };

    /** Show one tab (its terminal opens the first time); `focus`: and type in it. */
    const show = (kind: TermKind, focus = true) => {
      if (!this.layer) return;
      tab = kind;
      tabs.set(kind);
      const noClaude = kind === 'claude' && !who.hosted;
      note.hidden = !noClaude;
      for (const [k, v] of Object.entries(this.views)) v.el.hidden = k !== kind;
      const view = noClaude ? null : (this.views[kind] ?? makeView(kind));
      view?.fit();
      view?.forgetHeld();
      // With no screen to type in, the keyboard waits on the tabs (never on Stand up).
      if (focus) (view ?? tabs).focus();
      if (kind === 'claude' && claudeEnded) standWhenQuiet();
      chrome();
    };
    /** You picked a tab: show it, and remember it for them (only where Claude could show). */
    const pick = (kind: TermKind, focus = true) => {
      if (who.hosted) setLastTab(id, kind);
      show(kind, focus);
    };
    /**
     * Stand up ENDED_MS after the session ended, or after your last key if you're still typing:
     * keys mid-word must never spill into the office (T would open someone's quick look).
     */
    let standing = false;
    const standWhenQuiet = () => {
      if (standing) return;
      standing = true;
      const check = () => {
        if (!this.layer || this.layer !== layer) return;
        // Gone to their Shell meanwhile: you stay; their Claude tab arms this again (show()).
        if (tab !== 'claude') {
          standing = false;
          return;
        }
        const quiet = performance.now() - lastKeyAt;
        if (quiet >= ENDED_MS) this.close();
        else this.timers.push(window.setTimeout(check, ENDED_MS - quiet + 50));
      };
      this.timers.push(window.setTimeout(check, ENDED_MS));
    };

    const monitor = el(
      'div',
      { class: 'term-monitor' },
      bezel,
      el(
        'div',
        { class: 'term-chin' },
        el('span', { class: 'term-face', html: employeeFace(id, who.hosted, { size: 32 }) }),
        el('span', { class: 'term-name' }, name, where),
        led,
        status,
        el('span', { class: 'term-spacer' }),
        hint,
        retry,
        fresh,
        stand,
      ),
      el('div', { class: 'term-neck' }),
      el('div', { class: 'term-foot' }),
    );
    const layer = el('div', { class: 'term-modal', attrs: { role: 'dialog', 'aria-label': `${who.displayName}'s computer` } }, monitor);
    // Clicks on the backdrop or the monitor itself (not a button, not the screen) keep the
    // keyboard where it was: in the terminal. They never close it.
    layer.addEventListener('pointerdown', (ev) => {
      const t = ev.target as Element;
      if (t.closest('button, a, input, textarea') || t.closest('.term-screen:not(.term-note)')) return;
      ev.preventDefault();
      this.views[tab]?.focus();
    });
    // Every key here counts as typing (see standWhenQuiet), the terminal's included.
    layer.addEventListener('keydown', () => (lastKeyAt = performance.now()), true);
    // Ctrl+` and Ctrl+] from the chin's buttons, the tabs and the note too (inside a terminal,
    // onKey has them first), and from wherever the focus went (the page itself, say). From out
    // here a switch keeps you on the tabs: the next Enter must not land in a terminal.
    const keys = (ev: KeyboardEvent) => {
      if (ev.defaultPrevented || this.layer !== layer) return;
      if (isTabSwitch(ev)) {
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.repeat) return;
        pick(tab === 'claude' ? 'shell' : 'claude', false);
        tabs.focus();
      } else if (ev.ctrlKey && (ev.code === 'BracketRight' || ev.key === ']')) {
        ev.preventDefault();
        ev.stopPropagation();
        this.close();
      }
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
    document.body.classList.add('seated');
    TerminalOverlay.growFrom(monitor, this.from);
    show(tab);
    this.timers.push(
      window.setTimeout(() => {
        if (this.layer !== layer) return;
        ready = true;
        // Every terminal opened so far goes live; the one showing last, so it keeps focus.
        for (const [k, v] of Object.entries(this.views)) if (k !== tab) v.release();
        this.views[tab]?.release();
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
    const views = Object.values(this.views);
    this.layer = null;
    this.monitor = null;
    this.views = {};
    document.body.classList.remove('seated');
    layer.classList.add('out');
    if (monitor && this.from) TerminalOverlay.shrinkInto(monitor, this.from);
    window.setTimeout(() => {
      for (const v of views) v.dispose();
      layer.remove();
    }, 260);
    this.events.onClose?.();
  }

  /** FLIP: start the bezel at the desk monitor's rect and spring it to full size (a hot desk's too, ui/deskterm.ts). */
  static growFrom(el: HTMLElement, from: DOMRect | null): void {
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

  static shrinkInto(el: HTMLElement, into: DOMRect): void {
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
