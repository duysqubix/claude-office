// Little notes at the bottom of the page: "Claude Monet finished Water cooler  [Look]".
import { h } from './util';

interface ToastOpts {
  color?: string;
  icon?: Node;
  action?: { label: string; run(): void };
  ms?: number;
}

export class Toasts {
  readonly el = h('div', { class: 'toasts', 'aria-live': 'polite' });

  show(text: (Node | string)[], opts: ToastOpts = {}): void {
    const t = h(
      'div',
      { class: 'toast', style: opts.color ? `--a:${opts.color}` : undefined },
      opts.icon ?? null,
      h('span', { class: 'toast-text' }, ...text),
      opts.action
        ? h(
            'button',
            {
              type: 'button',
              class: 'btn btn-small',
              onclick: () => {
                opts.action?.run();
                dismiss();
              },
            },
            opts.action.label,
          )
        : null,
    );
    const dismiss = () => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 220);
    };
    this.el.append(t);
    while (this.el.children.length > 3) this.el.firstElementChild?.remove();
    setTimeout(dismiss, opts.ms ?? (opts.action ? 7000 : 3500));
  }
}
