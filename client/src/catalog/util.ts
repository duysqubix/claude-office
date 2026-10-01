// Small DOM helpers and number formatting for the catalog page.
import type { Dims } from './types';

type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown> & { class?: string; style?: string };

/** Hyperscript: h('div', { class: 'x', onclick: fn }, 'text', child). Same shape as ui/dom.ts. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'style') el.setAttribute('style', String(v));
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
      else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

/** Inline SVG markup (our own static strings only) in a span. */
export function svg(markup: string, cls = 'ico'): HTMLSpanElement {
  const span = h('span', { class: cls, 'aria-hidden': 'true' });
  span.innerHTML = markup;
  return span;
}

export function clear(el: Element): void {
  while (el.firstChild) el.firstChild.remove();
}

/** Text with `backtick` spans, as the notes in docs/ASSETS.md are written. */
export function rich(text: string): Node[] {
  return text.split('`').map((part, i) => (i % 2 ? h('span', { class: 'tick' }, part) : document.createTextNode(part)));
}

export const reducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Metres, trimmed: 0.73, 1.4, 12.5. */
export function metres(n: number): string {
  return String(Number(n.toFixed(n < 10 ? 2 : 1)));
}

/** Width × depth × height, the order a furniture catalogue prints them. */
export function dimsText(d: Dims): string {
  return `${metres(d.w)} × ${metres(d.d)} × ${metres(d.h)} m`;
}

export function trisShort(n: number): string {
  return n < 1000 ? String(n) : `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k`;
}

export function bytesText(b: number): string {
  return b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function ago(ts: number, now = Date.now()): string {
  const s = Math.max(0, (now - ts) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ts).toLocaleDateString();
}

/** "office_chair" → "officeChair", for code snippets. */
export function camel(id: string): string {
  const s = id.replace(/_(\w)/g, (_, c: string) => c.toUpperCase());
  return /^\d/.test(s) ? `m${s}` : s;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { style: 'position:fixed;opacity:0' }, text);
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}
