// Tiny DOM helpers and wording shared by the game and the UI.
import type { Employee } from '../../../shared/protocol';

type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown> & { class?: string; style?: string };

/** Hyperscript: h('div', { class: 'x', onclick: fn }, 'text', child). */
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

/** What a needs-you person says (line 1) and the plain fact (line 2), by what they're waiting for (UX.md §2.1). */
export function waitingLines(e: Employee): [said: string, fact: string] {
  const w = (e.waitingFor ?? '').toLowerCase();
  if (w.includes('permission')) return ['Can I do this?', 'Needs your permission'];
  if (w.includes('input') || w.includes('question')) return ['Quick question!', 'Needs an answer'];
  if (w.includes('dialog')) return ["I've got a menu open.", 'Needs you at the keyboard'];
  if (w.includes('sandbox')) return ['Can I leave the sandbox?', 'Sandbox request'];
  if (w.includes('trust')) return ['Is this folder safe?', 'Trust this folder?'];
  return ['I need you!', e.waitingFor || 'Needs you'];
}

/** One-line version for toasts and lists. */
export function waitingText(e: Employee): string {
  return waitingLines(e)[1];
}

/** One line describing what someone is up to right now. */
export function doingText(e: Employee): string {
  switch (e.state) {
    case 'working':
      return e.activity?.label ?? 'Thinking…';
    case 'needs-you':
      return waitingText(e);
    case 'idle':
      return 'Free: waiting for their next task';
    case 'sleeping':
      return 'Fast asleep';
    case 'starting':
      return 'Getting settled…';
  }
}

export function truncate(s: string, n: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
}

export function ago(ts: number, now = Date.now()): string {
  const s = Math.max(0, (now - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d} days ago`;
  return new Date(ts).toLocaleDateString();
}

/** "/Users/me/x" → "~/x" given the home dir. */
export function tildify(path: string, home: string): string {
  if (home && (path === home || path.startsWith(home + '/'))) return '~' + path.slice(home.length);
  return path;
}
