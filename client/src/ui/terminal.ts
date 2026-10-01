// "Sit at their computer": a chunky monitor modal with a real xterm.js terminal on /term.
// Every key goes to the terminal (Claude Code needs Esc). Stand up with the button or Ctrl+].
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import type { Employee } from '../../../shared/protocol';
import type { Backend, TermLink } from '../net';
import { h } from './dom';

export class TerminalOverlay {
  /** Called after the overlay has closed (manager stands up, camera returns). */
  onClose: (() => void) | null = null;
  private layer: HTMLElement | null = null;
  private term: Terminal | null = null;
  private link: TermLink | null = null;
  private onResize = () => this.fit?.fit();
  private fit: FitAddon | null = null;

  constructor(
    private root: HTMLElement,
    private backend: Backend,
  ) {}

  get isOpen(): boolean {
    return this.layer !== null;
  }

  open(e: Employee): void {
    if (this.layer) this.close();
    const screen = h('div', { class: 'term-screen' });
    const status = h('span', { class: 'term-status' }, 'Connecting…');
    const led = h('i', { class: 'term-led' });
    const stand = h('button', { class: 'btn btn-orange', type: 'button' }, 'Stand up', h('kbd', null, 'Ctrl ]'));
    stand.addEventListener('click', () => this.close());
    const monitor = h(
      'div',
      { class: 'term-monitor' },
      h('div', { class: 'term-bezel' }, screen),
      h(
        'div',
        { class: 'term-chin' },
        led,
        h('span', { class: 'term-name' }, h('b', null, e.displayName), ` · ${e.project}`),
        status,
        h('span', { class: 'term-spacer' }),
        stand,
      ),
      h('div', { class: 'term-neck' }),
      h('div', { class: 'term-foot' }),
    );
    const layer = h('div', { class: 'term-modal', role: 'dialog', 'aria-label': `${e.displayName}'s terminal` }, monitor);
    this.root.append(layer);
    this.layer = layer;

    const term = new Terminal({
      fontFamily: 'Menlo, "SF Mono", Monaco, "Cascadia Mono", Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.12,
      cursorBlink: true,
      macOptionIsMeta: true,
      scrollback: 5000,
      theme: {
        background: '#1B2330',
        foreground: '#E8EEF6',
        cursor: '#FFB020',
        cursorAccent: '#1B2330',
        selectionBackground: '#3C5A86',
        black: '#2B2D42',
        red: '#FF6B6B',
        green: '#6BCB77',
        yellow: '#FFD93D',
        blue: '#4D96FF',
        magenta: '#B983FF',
        cyan: '#00C2C7',
        white: '#E8EEF6',
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
    try {
      fit.fit();
    } catch {
      // not laid out yet; the resize handler catches up
    }
    // Ctrl+] stands up, and never reaches the terminal.
    term.attachCustomKeyEventHandler((ev) => {
      if (ev.ctrlKey && (ev.code === 'BracketRight' || ev.key === ']')) {
        if (ev.type === 'keydown') this.close();
        return false;
      }
      return true;
    });

    const link = this.backend.terminal(e.sessionId, term.cols, term.rows);
    this.link = link;
    link.onOpen = () => {
      status.textContent = 'Connected';
      led.classList.add('on');
      link.send({ t: 'resize', cols: term.cols, rows: term.rows });
    };
    link.onData = (d) => term.write(d);
    link.onClose = (reason) => {
      if (this.term !== term) return;
      status.textContent = 'Disconnected';
      led.classList.remove('on');
      term.write(`\r\n\x1b[2m[${reason}]\x1b[0m\r\n`);
    };
    term.onData((d) => link.send({ t: 'in', d }));
    term.onResize(({ cols, rows }) => link.send({ t: 'resize', cols, rows }));
    window.addEventListener('resize', this.onResize);
    // Fit again once the pop-in animation has settled.
    window.setTimeout(() => {
      if (this.term === term) {
        fit.fit();
        term.focus();
      }
    }, 260);
    term.focus();
  }

  close(): void {
    if (!this.layer) return;
    window.removeEventListener('resize', this.onResize);
    const layer = this.layer;
    this.layer = null;
    this.link?.close();
    this.link = null;
    const term = this.term;
    this.term = null;
    this.fit = null;
    layer.classList.add('out');
    window.setTimeout(() => {
      term?.dispose();
      layer.remove();
    }, 200);
    this.onClose?.();
  }
}
