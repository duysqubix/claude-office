// Tiny DOM and formatting helpers for the co- views (theme.css). No framework, no globals.

/**
 * Markup we built ourselves (icons, faces, rings, escaped markdown). Only this type may reach
 * innerHTML, so a name or an AI-written title can never be passed as HTML by accident.
 */
export type Markup = string & { readonly __markup: unique symbol };

/** Brand a string as trusted markup. Only for strings assembled from constants and esc()'d text. */
export const markup = (s: string) => s as Markup;

export type Child = Node | string | number | null | undefined | false;

export interface Props {
  class?: string;
  style?: string;
  /** Plain attributes (aria-*, role, type, title, data-*, …). `false`/null/undefined are skipped. */
  attrs?: Record<string, string | number | boolean | null | undefined>;
  on?: Partial<{ [K in keyof HTMLElementEventMap]: (ev: HTMLElementEventMap[K]) => void }>;
  /** Trusted markup, set before children are appended. */
  html?: Markup;
}

/** Hyperscript: el('button', { class: 'co-btn', on: { click } }, 'Label'). */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props) {
    if (props.class) node.className = props.class;
    if (props.style) node.setAttribute('style', props.style);
    if (props.attrs) {
      for (const [k, v] of Object.entries(props.attrs)) {
        if (v === false || v === null || v === undefined) continue;
        node.setAttribute(k, v === true ? '' : String(v));
      }
    }
    if (props.on) {
      for (const [type, fn] of Object.entries(props.on)) node.addEventListener(type, fn as EventListener);
    }
    if (props.html) node.innerHTML = props.html;
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : String(c));
  }
  return node;
}

/** Escape text for use inside markup we build as strings. */
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

/** "1:05" (minutes:seconds), never negative. */
export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "45s", "12m", "1h 12m", "2d 3h". */
export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** "128k", "1M", "1.5M" token counts. */
export function fmtTokens(n: number): string {
  if (n >= 999_500) {
    const m = n / 1_000_000;
    return `${m >= 10 ? Math.round(m) : Number(m.toFixed(1))}M`;
  }
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

export function fmtMoney(usd: number): string {
  if (usd <= 0) return '$0.00';
  return usd < 0.01 ? '<$0.01' : `$${usd.toFixed(2)}`;
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** "3:42 PM" in the viewer's locale. */
export function fmtTime(ts: number | string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
