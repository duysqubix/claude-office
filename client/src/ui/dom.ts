// Tiny DOM helpers and formatters shared by the UI.
import type { Employee, EmployeeState } from '../../../shared/protocol';
import { PALETTE } from '../style/palette';

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
  append(el, children);
  return el;
}

export function append(el: Element, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.firstChild.remove();
}

export const STATE_COLOR: Record<EmployeeState, string> = {
  working: PALETTE.stateWorking,
  'needs-you': PALETTE.stateNeedsYou,
  idle: PALETTE.stateIdle,
  sleeping: PALETTE.stateSleeping,
  starting: PALETTE.stateStarting,
};

/** The user-facing word for each state ("free", never "idle": idle reads as stuck). */
export const STATE_LABEL: Record<EmployeeState, string> = {
  working: 'Working',
  'needs-you': 'Needs you',
  idle: 'Free',
  sleeping: 'Asleep',
  starting: 'Starting',
};

export function stateChip(state: EmployeeState): HTMLElement {
  return h('span', { class: `chip state-${state}`, style: `--c:${STATE_COLOR[state]}` }, h('i'), STATE_LABEL[state]);
}

/** What a needs-you person says (line 1) and the plain fact (line 2), by what they're waiting for. */
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

export function duration(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const hrs = Math.floor(m / 60);
  if (hrs < 24) return `${hrs}h ${m % 60}m`;
  return `${Math.floor(hrs / 24)}d ${hrs % 24}h`;
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

export function money(usd: number | undefined): string {
  if (usd === undefined) return '—';
  return usd < 0.01 ? '<$0.01' : `$${usd.toFixed(2)}`;
}

/** "/Users/me/x" → "~/x" given the home dir. */
export function tildify(path: string, home: string): string {
  if (home && (path === home || path.startsWith(home + '/'))) return '~' + path.slice(home.length);
  return path;
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
