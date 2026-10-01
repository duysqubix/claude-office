// Springy toasts, top centre.
import { h } from './dom';

export type ToastKind = 'info' | 'good' | 'warn' | 'bad' | 'arrive' | 'leave';

export class Toasts {
  private el: HTMLElement;

  constructor(root: HTMLElement) {
    this.el = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    root.append(this.el);
  }

  show(text: string, kind: ToastKind = 'info', ms = 3800, sub?: string): void {
    const t = h('div', { class: `toast toast-${kind}` }, h('span', { class: 'toast-dot' }), h('span', { class: 'toast-text' }, text, sub ? h('small', null, sub) : null));
    this.el.prepend(t);
    while (this.el.children.length > 4) this.el.lastElementChild?.remove();
    window.setTimeout(() => {
      t.classList.add('out');
      window.setTimeout(() => t.remove(), 320);
    }, ms);
  }
}
