// Factories for the co- components (theme.css): the UI kit renders them now, the game's HUD and
// panels use them at handoff. Each returns a plain element; the copy rules live in docs/UX.md.
//
// CSS2D labels: the element handed to a CSS2DObject must be a plain `.co-tagstack` wrapper with
// the pill, bubble and marker inside it. The animated pieces (pop-ins, the bouncing "!") set
// `transform` from CSS, which would override CSS2DRenderer's inline transform if they were the
// object's own element.
import type { EmployeeState } from '../../../shared/protocol';
import type { ToastRequest } from './bus';
import { el, markup, type Child, type Markup } from './el';
import { icon, stateBadge, STATE_WORD, type IconName } from './icons';
import './theme.css';

export type ButtonKind = 'primary' | 'secondary' | 'danger' | 'ghost' | 'danger-text';

export function keyCap(label: string, large = false): HTMLElement {
  return el('kbd', { class: `co-key${large ? ' co-key--lg' : ''}` }, label);
}

export interface ButtonOptions {
  kind?: ButtonKind;
  small?: boolean;
  /** Key cap shown on the right, e.g. 'E'. */
  key?: string;
  icon?: IconName;
  disabled?: boolean;
  /** Tooltip; for a disabled button, say why. */
  tip?: string;
  onClick?: () => void;
}

export function button(label: string, opts: ButtonOptions = {}): HTMLButtonElement {
  const kind = opts.kind ?? 'secondary';
  const cls = ['co-btn'];
  if (kind === 'danger-text') cls.push('co-btn--ghost', 'co-btn--danger-text');
  else if (kind !== 'secondary') cls.push(`co-btn--${kind}`);
  if (opts.small) cls.push('co-btn--small');
  const b = el(
    'button',
    {
      class: cls.join(' '),
      // With a tooltip, name the button explicitly so the tooltip's ::after text isn't folded into it.
      attrs: { type: 'button', disabled: opts.disabled, 'data-co-tip': opts.tip, 'aria-label': opts.tip ? label : undefined, 'aria-description': opts.tip },
    },
    opts.icon ? el('span', { html: icon(opts.icon, 22) }) : null,
    label,
    opts.key ? keyCap(opts.key) : null,
  );
  if (opts.onClick) b.addEventListener('click', opts.onClick);
  return b;
}

/** A 48 × 48 HUD button: sticker icon, key cap hanging off the bottom edge, tooltip "Roster (R)". */
export function hudButton(name: IconName, label: string, key: string, onClick?: () => void): HTMLButtonElement {
  const b = el(
    'button',
    { class: 'co-btn co-btn--icon', attrs: { type: 'button', 'aria-label': `${label} (${key})`, 'data-co-tip': `${label} (${key})` } },
    el('span', { html: icon(name, 24) }),
    keyCap(key),
  );
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

const COUNT_WORD: Record<EmployeeState, [string, string]> = {
  working: ['working', 'working'],
  'needs-you': ['needs you', 'need you'],
  idle: ['free', 'free'],
  sleeping: ['asleep', 'asleep'],
  starting: ['starting', 'starting'],
};

/** HUD count chip: "4 working" with the state badge. */
export function stateChip(state: EmployeeState, count: number): HTMLElement {
  return el(
    'span',
    { class: 'co-chip', attrs: { 'data-state': state } },
    el('span', { html: stateBadge(state) }),
    el('b', null, String(count)),
    COUNT_WORD[state][count === 1 ? 0 : 1],
  );
}

/** The interns count chip. */
export function internChip(count: number): HTMLElement {
  return el('span', { class: 'co-chip' }, el('span', { html: icon('intern', 20) }), el('b', null, String(count)), count === 1 ? 'intern' : 'interns');
}

/**
 * The needs-you chip (UX.md §2). count 0 → the calm "Nobody needs you" chip. `left` (0–1) draws
 * the soonest open ask's countdown ring; `seated` hides the Q key cap.
 */
export function needsChip(count: number, opts: { left?: number; seated?: boolean; onClick?: () => void } = {}): HTMLElement {
  if (count <= 0) {
    return el('span', { class: 'co-chip co-needs--calm', attrs: { role: 'status' } }, el('span', { html: icon('check', 20) }), 'Nobody needs you');
  }
  const r = 14;
  const len = 2 * Math.PI * r;
  const ring =
    opts.left === undefined
      ? markup('')
      : markup(
          `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="${r}" fill="none" stroke="#2B2D42" stroke-width="3" stroke-dasharray="${(len * Math.max(0, Math.min(1, opts.left))).toFixed(2)} ${len.toFixed(2)}" stroke-linecap="round"/></svg>`,
        );
  const b = el(
    'button',
    { class: 'co-needs', attrs: { type: 'button', 'aria-label': `${count} ${count === 1 ? 'person needs' : 'people need'} you. Go to the next (Q)` } },
    el('span', { class: 'co-needs__disc', html: ring }, el('b', null, '!')),
    `${count} ${count === 1 ? 'needs' : 'need'} you`,
    opts.seated ? null : keyCap('Q'),
  );
  if (opts.onClick) b.addEventListener('click', opts.onClick);
  return b;
}

export function promptPill(text: string, key = 'E'): HTMLElement {
  return el('div', { class: 'co-prompt', attrs: { role: 'status' } }, keyCap(key, true), text);
}

export function namePill(name: string, state: EmployeeState, dim = false): HTMLElement {
  return el(
    'span',
    { class: `co-pill${dim ? ' is-dim' : ''}`, attrs: { title: `${name}: ${STATE_WORD[state].toLowerCase()}` } },
    el('span', { html: stateBadge(state) }),
    name,
  );
}

/** A speech bubble: `text` for chatter, or `line1` + `line2`/`code` for needs-you (amber). */
export function speech(opts: { text?: string; line1?: string; line2?: string; code?: string; needs?: boolean }): HTMLElement {
  const inner = opts.line1
    ? el(
        'span',
        { class: 'co-bubble__lines' },
        el('span', { class: 'co-bubble__line1' }, opts.line1),
        opts.code ? el('span', { class: 'co-bubble__code' }, opts.code) : opts.line2 ? el('span', { class: 'co-bubble__line2' }, opts.line2) : null,
      )
    : el('span', { class: 'co-bubble__text' }, opts.text ?? '');
  return el('div', { class: `co-bubble${opts.needs ? ' co-bubble--needs' : ''}` }, inner);
}

export function bangMarker(kind: 'needs' | 'bump' = 'needs'): HTMLElement {
  return el('div', { class: `co-bang${kind === 'bump' ? ' co-bang--bump' : ''}`, attrs: { 'aria-hidden': 'true' } }, '!');
}

export function zzz(): HTMLElement {
  return el('div', { class: 'co-zzz', attrs: { 'aria-hidden': 'true' } }, el('span', null, 'Z'), el('span', null, 'z'), el('span', null, 'z'));
}

/** A first-run coach card (UX.md §3.1). */
export function coachCard(title: string, body: Child[], opts: { done?: string; onDone?: () => void; onSkip?: () => void } = {}): HTMLElement {
  return el(
    'aside',
    { class: 'co-coach', attrs: { 'aria-label': title } },
    el('h3', null, title),
    el('p', null, ...body),
    el(
      'div',
      { class: 'co-coach__foot' },
      button('Skip tips', { kind: 'ghost', small: true, onClick: opts.onSkip }),
      opts.done ? button(opts.done, { small: true, onClick: opts.onDone }) : null,
    ),
  );
}

/** The 3D world tag: a pill with a bouncing arrow under it, pointing at reception, the files, the whiteboard. */
export function worldTag(text: string): HTMLElement {
  return el(
    'div',
    { class: 'co-worldtag' },
    el('span', { class: 'co-pill', style: 'padding: 0 12px; cursor: default' }, text),
    el('span', {
      class: 'co-worldtag__arrow',
      html: markup(
        '<svg viewBox="0 0 22 16" width="22" height="16" aria-hidden="true"><path d="M2.5 2.5h17L11 13.5z" fill="#FFFDF7" stroke="#2B2D42" stroke-width="2.4" stroke-linejoin="round"/></svg>',
      ),
    }),
  );
}

/** Top-centre connection banner (UX.md §3.5): ink while offline, green when back. */
export function banner(kind: 'offline' | 'back', text: string, action?: { label: string; run: () => void }): HTMLElement {
  return el(
    'div',
    { class: `co-banner${kind === 'back' ? ' co-banner--back' : ''}`, attrs: { role: 'status' } },
    kind === 'offline' ? el('span', { class: 'co-spinner', attrs: { 'aria-hidden': 'true' } }) : el('span', { html: icon('check', 22) }),
    text,
    action ? button(action.label, { small: true, onClick: action.run }) : null,
  );
}

/** One toast. The stack's container is the live region, so the toast itself has no role. */
export function toastEl(req: ToastRequest, onAction?: () => void): HTMLElement {
  const kind = req.kind ?? 'info';
  return el(
    'div',
    { class: `co-toast${kind === 'info' ? '' : ` co-toast--${kind}`}` },
    req.face ? el('span', { class: 'co-toast__face', html: req.face }) : null,
    el('span', { class: 'co-toast__text' }, req.text, req.sub ? el('span', { class: 'co-toast__sub' }, req.sub) : null),
    req.action
      ? button(req.action.label, {
          small: true,
          onClick: () => {
            req.action!.run();
            onAction?.();
          },
        })
      : null,
  );
}

interface Recent {
  /** Individual toasts shown for this key in the current 2 s window. */
  nodes: HTMLElement[];
  merged: HTMLElement | null;
  n: number;
  at: number;
  req: ToastRequest;
}

/**
 * Toasts top-centre (UX.md §2): at most 3, newest on top; 3.5 s, 6 s with an action, 7 s for
 * errors; hover or keyboard focus pauses. Three or more with the same `key` within 2 s merge into
 * one ("3 people clocked in").
 */
export class ToastStack {
  readonly el: HTMLElement;
  private recent = new Map<string, Recent>();

  constructor(parent: HTMLElement = document.body) {
    this.el = el('div', { class: 'co-toasts', attrs: { 'aria-live': 'polite' } });
    parent.append(this.el);
  }

  show(req: ToastRequest): void {
    const now = performance.now();
    for (const [k, r] of this.recent) if (now - r.at > 2000) this.recent.delete(k);
    const r = req.key ? this.recent.get(req.key) : undefined;
    if (r && req.key) {
      r.n++;
      r.at = now;
      r.req = req;
      if (r.n >= 3) {
        const merged: ToastRequest = { ...req, text: req.merged?.(r.n) ?? req.text, face: undefined };
        const node = toastEl(merged, () => this.dismiss(node));
        if (r.merged?.isConnected) r.merged.replaceWith(node);
        else this.el.prepend(node);
        for (const old of r.nodes) this.dismiss(old);
        r.nodes = [];
        r.merged = node;
        this.arm(node, merged);
        this.trim();
        return;
      }
    }
    const node = toastEl(req, () => this.dismiss(node));
    this.el.prepend(node);
    if (req.key) {
      if (r) r.nodes.push(node);
      else this.recent.set(req.key, { nodes: [node], merged: null, n: 1, at: now, req });
    }
    this.arm(node, req);
    this.trim();
  }

  clear(): void {
    this.el.replaceChildren();
    this.recent.clear();
  }

  /** Keep three; toasts already animating out don't count. */
  private trim(): void {
    const staying = [...this.el.children].filter((c) => !c.classList.contains('is-out')) as HTMLElement[];
    for (const extra of staying.slice(3)) this.dismiss(extra);
  }

  private arm(node: HTMLElement, req: ToastRequest): void {
    const ms = req.ms ?? (req.kind === 'bad' ? 7000 : req.action ? 6000 : 3500);
    let t = window.setTimeout(() => this.dismiss(node), ms);
    const pause = () => window.clearTimeout(t);
    const resume = () => {
      window.clearTimeout(t);
      if (node.matches(':hover') || node.contains(document.activeElement)) return;
      t = window.setTimeout(() => this.dismiss(node), 2000);
    };
    node.addEventListener('mouseenter', pause);
    node.addEventListener('mouseleave', resume);
    node.addEventListener('focusin', pause);
    node.addEventListener('focusout', () => window.setTimeout(resume, 0));
  }

  private dismiss(node: HTMLElement): void {
    for (const [k, r] of this.recent) {
      r.nodes = r.nodes.filter((n) => n !== node);
      if (r.merged === node) r.merged = null;
      if (!r.nodes.length && !r.merged && performance.now() - r.at > 2000) this.recent.delete(k);
    }
    if (!node.isConnected || node.classList.contains('is-out')) return;
    node.classList.add('is-out');
    window.setTimeout(() => node.remove(), 200);
  }
}

export type PanelTheme = 'person' | 'hire' | 'files' | 'roster' | 'help' | 'interns';

export interface PanelOptions {
  title: string;
  theme?: PanelTheme;
  /** Band colour override (a person's shirt). */
  band?: string;
  /** Portrait straddling the band (theme 'person'). */
  face?: Markup;
  wide?: boolean;
  /** Fixed in the right dock (the game); off for inline use (the kit). */
  dock?: boolean;
  body?: Child[];
  foot?: Child[];
  onClose?: () => void;
}

let panelUid = 0;

/** The panel frame (UX.md §4.3): outlined title on a coloured band, scrolling body, sticky footer. */
export function panelShell(opts: PanelOptions) {
  const theme = opts.theme ?? 'help';
  const titleId = `co-panel-${++panelUid}`;
  const close = el('button', { class: 'co-panel__close', attrs: { type: 'button', 'aria-label': 'Close (Esc)' }, html: icon('close', 18) });
  if (opts.onClose) close.addEventListener('click', opts.onClose);
  const band = el(
    'header',
    { class: 'co-panel__band' },
    opts.face ? el('div', { class: 'co-panel__face', html: opts.face }) : null,
    el('h2', { class: 'co-panel__title', attrs: { id: titleId, tabindex: -1 } }, opts.title),
    close,
  );
  const body = el('div', { class: 'co-panel__body' }, ...(opts.body ?? []));
  const foot = el('footer', { class: 'co-panel__foot' }, ...(opts.foot ?? []));
  const cls = ['co-panel', `co-panel--${theme}`];
  if (opts.wide) cls.push('co-panel--wide');
  if (opts.dock) cls.push('co-panel--dock');
  const panel = el(
    'section',
    { class: cls.join(' '), style: opts.band ? `--band: ${opts.band}` : undefined, attrs: { role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': titleId } },
    band,
    body,
    opts.foot?.length ? foot : null,
  );
  return { el: panel, body, foot, close, title: band.querySelector('.co-panel__title') as HTMLElement };
}

/** A roster / intern-desk row: portrait, name, one line, a right-hand detail. */
export function personRow(opts: { face: Markup; name: string; line: string; side?: string; onClick?: () => void }): HTMLButtonElement {
  const b = el(
    'button',
    { class: 'co-person', attrs: { type: 'button' } },
    el('span', { class: 'co-person__face', html: opts.face }),
    el('span', null, el('span', { class: 'co-person__name' }, opts.name), el('span', { class: 'co-person__line' }, opts.line)),
    el('span', { class: 'co-person__side' }, opts.side ?? ''),
  );
  if (opts.onClick) b.addEventListener('click', opts.onClick);
  return b;
}
