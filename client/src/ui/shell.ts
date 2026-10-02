// The panel frame every panel shares: coloured header band, title, close button, body.
import { h } from './dom';

export type PanelId = 'employee' | 'hire' | 'archive' | 'roster' | 'help' | 'ask' | 'stats' | 'interns';

export interface Panel {
  id: PanelId;
  el: HTMLElement;
  /** Focus something sensible when opened. */
  focus?: HTMLElement;
  dispose?(): void;
}

export function shell(title: string, color: string, body: HTMLElement[], onClose: () => void, extraHead: HTMLElement[] = [], cls = ''): HTMLElement {
  const close = h('button', { class: 'panel-x', type: 'button', title: 'Close (Esc)', 'aria-label': 'Close' }, '×');
  close.addEventListener('click', onClose);
  return h(
    'section',
    { class: `panel ${cls}`, style: `--head:${color}`, role: 'dialog', 'aria-label': title },
    h('header', { class: 'panel-head' }, h('h2', null, title), ...extraHead, close),
    h('div', { class: 'panel-body' }, ...body),
  );
}
