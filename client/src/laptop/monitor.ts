// Monitor, the laptop's second app (#150): see everyone in the office from your desk, the way
// your computer could remote into theirs. A list of everyone, the ones who need you first, then
// the busy ones; pick someone for a summary of where they are (what they're on, what they're
// doing right now, what you last asked, what they last said, their interns) above their live
// conversation: their own chat, so you can read along, answer their question or talk to them
// without walking over. "Go to them" stands you up and walks you there.
import type { Employee, EmployeeState } from '../../../shared/protocol';
import type { RosterStore } from '../net';
import type { ChatView } from '../ui/chatpanel';
import { button } from '../ui/components';
import { el, type Markup } from '../ui/el';
import { icon, stateBadge, STATE_WORD } from '../ui/icons';

export interface MonitorDeps {
  store: RosterStore;
  face(sessionId: string, size: number): Markup;
  /** Their chat, inline in `container` (read along, answer, talk). Null if they've gone. */
  chat(container: HTMLElement, sessionId: string): { view: ChatView; dispose(): void } | null;
  /** Stand up from the laptop and walk to them. */
  goTo(sessionId: string): void;
}

export interface MonitorView {
  el: HTMLElement;
  focus(): void;
  /** Esc, before it stands you up: out of a text box (the draft stays) or back from Terminal mode. True if it did. */
  escape(): boolean;
  dispose(): void;
}

/** Who comes first in the list: whoever needs you, then the busy ones. */
const ORDER: Record<EmployeeState, number> = { 'needs-you': 0, working: 1, starting: 2, idle: 3, sleeping: 4 };

const ago = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
};
const clip = (s: string | undefined, n: number) => (!s ? '' : s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** One line on where they are, for the list. */
function lineFor(e: Employee): string {
  if (e.state === 'needs-you') return `Needs you: ${e.waitingFor ?? 'your input'}`;
  if (e.state === 'working') return e.activity?.label ?? 'Working';
  if (e.state === 'starting') return 'Just walked in';
  return clip(e.title ?? e.lastText, 60) || STATE_WORD[e.state];
}

/** The summary above their conversation: a few labelled facts, only the ones they have. */
function insight(e: Employee, now: number): [string, string][] {
  const since = ago(now - e.stateSince);
  const rows: [string, string][] = [];
  const state =
    e.state === 'needs-you'
      ? `Needs you for ${since}: ${e.waitingFor ?? 'your input'}`
      : e.state === 'working'
        ? `Working for ${since}${e.activity ? `: ${e.activity.label}` : ''}`
        : e.state === 'sleeping'
          ? `Asleep: free for ${since}`
          : e.state === 'starting'
            ? 'Just walked in, getting settled'
            : `Done with their turn ${since === 'just now' ? 'just now' : `${since} ago`}`;
  rows.push(['Now', state]);
  if (e.title) rows.push(['On', e.title]);
  rows.push(['Where', [e.project, e.branch].filter(Boolean).join(' · ')]);
  if (e.lastPrompt) rows.push(['You asked', clip(e.lastPrompt, 160)]);
  if (e.lastText) rows.push(['They said', clip(e.lastText, 200)]);
  const active = e.interns.filter((i) => i.active);
  if (e.interns.length) rows.push(['Interns', active.length ? `${active.length} helping: ${[...new Set(active.map((i) => i.type.replace(/^.*:/, '')))].join(', ')}` : `${e.interns.length} waiting`]);
  const extra = [e.model, e.costUSD !== undefined ? `$${e.costUSD.toFixed(2)} so far` : ''].filter(Boolean).join(' · ');
  if (extra) rows.push(['Session', extra]);
  return rows;
}

export function monitorView(deps: MonitorDeps): MonitorView {
  const { store } = deps;
  const list = el('div', { class: 'mon-list', attrs: { role: 'listbox', 'aria-label': 'Everyone in the office' } });
  const summary = el('dl', { class: 'mon-summary' });
  const head = el('div', { class: 'mon-head' });
  const chatSlot = el('div', { class: 'mon-chat' });
  const empty = el('div', { class: 'mon-empty' }, el('span', { html: icon('staff', 40) }), el('p', null, 'Nobody in the office right now.'));
  const detail = el('section', { class: 'mon-detail' }, head, summary, chatSlot);
  const root = el('div', { class: 'mon' }, el('aside', { class: 'mon-side' }, el('h3', { class: 'mon-side__title' }, 'Everyone'), list), detail, empty);

  let picked: string | null = null;
  /** The picked person was moving into the office when last seen: a gap in the roster is them on the way. */
  let pickedAdopting = false;
  let chat: { view: ChatView; dispose(): void } | null = null;
  let listKey = '';
  let headKey = '';

  const people = () => [...store.employees].sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.stateSince - b.stateSince || a.displayName.localeCompare(b.displayName));

  function pick(id: string, focus = false): void {
    if (picked === id && chat) return;
    picked = id;
    chat?.dispose();
    chatSlot.replaceChildren();
    chat = deps.chat(chatSlot, id);
    headKey = '';
    render();
    if (focus) list.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)?.focus();
  }

  function renderList(all: Employee[]): void {
    const now = store.now();
    const key = all.map((e) => `${e.sessionId}|${e.state}|${e.displayName}|${lineFor(e)}|${Math.floor((now - e.stateSince) / 60_000)}|${e.sessionId === picked}`).join('\n');
    if (key === listKey) return;
    listKey = key;
    const had = list.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.id : undefined;
    list.replaceChildren(
      ...all.map((e) => {
        const row = el(
          'button',
          {
            class: `mon-row${e.sessionId === picked ? ' is-picked' : ''}`,
            attrs: { type: 'button', role: 'option', 'aria-selected': String(e.sessionId === picked), 'data-id': e.sessionId, 'data-state': e.state },
          },
          el('span', { class: 'mon-row__face', html: deps.face(e.sessionId, 36) }),
          el(
            'span',
            { class: 'mon-row__text' },
            el('span', { class: 'mon-row__name' }, el('span', { html: stateBadge(e.state) }), e.displayName, el('small', null, ago(now - e.stateSince))),
            el('span', { class: 'mon-row__line' }, lineFor(e)),
          ),
        );
        row.addEventListener('click', () => pick(e.sessionId));
        return row;
      }),
    );
    if (had) list.querySelector<HTMLElement>(`[data-id="${CSS.escape(had)}"]`)?.focus({ preventScroll: true });
  }

  function renderDetail(e: Employee): void {
    const now = store.now();
    const key = `${e.sessionId}|${e.displayName}|${e.project}`;
    if (key !== headKey) {
      headKey = key;
      const go = button(`Go to ${e.displayName}`, { small: true, icon: 'staff', onClick: () => deps.goTo(e.sessionId) });
      head.replaceChildren(
        el('span', { class: 'mon-head__face', html: deps.face(e.sessionId, 44) }),
        el('span', { class: 'mon-head__name' }, el('b', null, e.displayName), el('small', null, e.project)),
        el('span', { class: 'mon-spacer' }),
        go,
      );
    }
    summary.replaceChildren(...insight(e, now).map(([k, v]) => el('div', { class: 'mon-summary__row' }, el('dt', null, k), el('dd', null, v))));
  }

  function render(): void {
    const all = people();
    empty.hidden = all.length > 0;
    detail.hidden = all.length === 0;
    root.classList.toggle('is-empty', all.length === 0);
    if (!all.length) {
      list.replaceChildren();
      listKey = '';
      // Nobody left to watch: their chat stops asking for news.
      chat?.dispose();
      chat = null;
      chatSlot.replaceChildren();
      picked = null;
      return;
    }
    const cur = picked ? store.get(picked) : undefined;
    if (cur) pickedAdopting = !!cur.adopting;
    // Nobody picked yet, or they left (not just on their way in): whoever needs you most.
    if (!picked || (!cur && !pickedAdopting)) {
      pickedAdopting = false;
      pick(all[0].sessionId);
      return;
    }
    renderList(all);
    if (cur) renderDetail(cur);
  }

  // T flips their chat between Chat and Terminal, as it does in the office (the game's own
  // keys are off while you sit at the laptop). Not while typing.
  root.addEventListener('keydown', (ev) => {
    if (ev.key !== 't' && ev.key !== 'T') return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.repeat || ev.isComposing || !chat) return;
    if ((ev.target as Element | null)?.closest?.('input, textarea, select, [contenteditable], .xterm')) return;
    chat.view.setMode(chat.view.getMode() === 'terminal' ? 'chat' : 'terminal');
    ev.preventDefault();
    ev.stopPropagation();
  });

  // Arrow keys move through the list.
  list.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
    const ids = people().map((e) => e.sessionId);
    const at = ids.indexOf(picked ?? '');
    const next = ids[Math.max(0, Math.min(ids.length - 1, at + (ev.key === 'ArrowDown' ? 1 : -1)))];
    if (next) pick(next, true);
    ev.preventDefault();
    ev.stopPropagation();
  });

  const unsub = store.subscribe(() => render());
  // The minutes move on between roster updates.
  const tick = window.setInterval(() => render(), 15_000);
  render();

  return {
    el: root,
    focus() {
      list.querySelector<HTMLElement>('.mon-row.is-picked')?.focus({ preventScroll: true });
    },
    escape() {
      if (!chat) return false;
      const at = document.activeElement as HTMLElement | null;
      if (at && root.contains(at) && at.closest('input, textarea, select, [contenteditable]')) {
        at.blur();
        list.querySelector<HTMLElement>('.mon-row.is-picked')?.focus({ preventScroll: true });
        return true;
      }
      if (chat.view.getMode() === 'terminal') {
        chat.view.setMode('chat');
        return true;
      }
      return false;
    },
    dispose() {
      unsub();
      window.clearInterval(tick);
      chat?.dispose();
      chat = null;
    },
  };
}
