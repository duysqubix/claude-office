// The "/" picker in the chat composer (#151), the way Claude Code's prompt does it: type "/" at
// the start and their slash commands and skills open above the box, filtered as you type
// (prefix first, then fuzzy). Up/Down move, Enter or Tab fills in "/name " (Enter on a name
// typed in full sends it), Esc closes only the picker. A listbox the box points into with aria-activedescendant, so a screen reader follows.
//
//   const picker = slashPicker(input, () => api.commands(id));
//   composer.prepend(picker.el);
//   input.addEventListener('keydown', (ev) => { if (picker.key(ev)) return; … });
import type { SlashCommand } from '../../../shared/protocol';
import { el } from './el';

export interface SlashPicker {
  readonly el: HTMLElement;
  readonly open: boolean;
  /** A key in the box: true if the picker took it (it has stopped it going anywhere else). */
  key(ev: KeyboardEvent): boolean;
  /** Esc from outside the box's own keys (the laptop catches Esc first). True if it closed. */
  close(): boolean;
  /** The box's text changed from outside (a failed send put it back): open or close to match. */
  sync(): void;
}

/** Rows shown at most (the list scrolls; typing narrows it). */
const MAX_ROWS = 60;
/** The list is fetched again after this long (the server caches it about as long). */
const STALE_MS = 30_000;
/** "/" then the name typed so far: no space yet, nothing after. */
const TYPING_NAME = /^\/([^\s/]*)$/;
const SOURCE_ORDER: Record<SlashCommand['source'], number> = { 'built-in': 0, project: 1, user: 2, plugin: 3 };

/**
 * The commands for `query` (what follows "/"), best first: the name starts with it, then a
 * part after ":" does, then it's somewhere in the name, then its letters are, in order.
 */
export function rankCommands(all: SlashCommand[], query: string): SlashCommand[] {
  const q = query.toLowerCase();
  const scored: [SlashCommand, number][] = [];
  for (const c of all) {
    const n = c.name.toLowerCase();
    let score: number;
    if (!q || n.startsWith(q)) score = 0;
    else if (n.split(':').some((part) => part.startsWith(q))) score = 1;
    else if (n.includes(q)) score = 2;
    else if (fuzzy(n, q)) score = 3;
    else continue;
    scored.push([c, score]);
  }
  return scored
    .sort(([a, sa], [b, sb]) => sa - sb || SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source] || a.name.localeCompare(b.name))
    .map(([c]) => c);
}

/** Every letter of `q` in `name`, in order. */
function fuzzy(name: string, q: string): boolean {
  let at = 0;
  for (const ch of q) {
    at = name.indexOf(ch, at) + 1;
    if (!at) return false;
  }
  return true;
}

/** Where a command comes from, as the row says it. */
function sourceLabel(c: SlashCommand): string {
  const from = c.source === 'plugin' ? (c.plugin ?? 'plugin') : c.source;
  return c.kind === 'skill' ? `${from} · skill` : from;
}

export function slashPicker(input: HTMLTextAreaElement, load: () => Promise<SlashCommand[]>): SlashPicker {
  const uid = `co-slash-${Math.random().toString(36).slice(2, 8)}`;
  const list = el('div', { class: 'co-slash__list', attrs: { id: uid, role: 'listbox', 'aria-label': 'Slash commands' } });
  const note = el('p', { class: 'co-slash__note', attrs: { hidden: true } });
  const root = el('div', { class: 'co-slash', attrs: { hidden: true } }, list, note);
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', uid);
  input.setAttribute('aria-expanded', 'false');

  let all: SlashCommand[] | null = null;
  let loadedAt = 0;
  let loading: Promise<void> | null = null;
  let failed = false;
  /** After a failed load, not again before this (performance.now()). */
  let retryAt = 0;
  let shown: SlashCommand[] = [];
  let active = 0;
  let isOpen = false;
  /** Esc closed it for this text: it stays shut until the text changes. */
  let dismissed: string | null = null;

  function fetchList(): void {
    if (loading || (all && performance.now() - loadedAt < STALE_MS) || performance.now() < retryAt) return;
    loading = load()
      .then((list) => {
        all = Array.isArray(list) ? list : [];
        loadedAt = performance.now();
        failed = false;
      })
      .catch(() => {
        failed = !all;
        retryAt = performance.now() + 5000;
      })
      .finally(() => {
        loading = null;
        sync();
      });
  }

  function setOpen(on: boolean): void {
    isOpen = on;
    root.hidden = !on;
    input.setAttribute('aria-expanded', String(on));
    if (!on) input.removeAttribute('aria-activedescendant');
  }

  function sync(): void {
    const m = TYPING_NAME.exec(input.value);
    if (!m || input.value === dismissed || document.activeElement !== input) {
      if (input.value !== dismissed) dismissed = null;
      setOpen(false);
      return;
    }
    dismissed = null;
    fetchList();
    if (!all) {
      // Nothing to pick from yet: say so, but Enter still sends what's typed.
      shown = [];
      list.replaceChildren();
      note.hidden = false;
      note.textContent = failed ? "Couldn't load their commands." : 'Looking up their commands…';
      setOpen(true);
      return;
    }
    const prev = shown[active]?.name;
    shown = rankCommands(all, m[1]).slice(0, MAX_ROWS);
    // Nothing matches: out of the way, so Enter sends what's typed.
    if (!shown.length) {
      setOpen(false);
      return;
    }
    note.hidden = true;
    const kept = shown.findIndex((c) => c.name === prev);
    active = kept >= 0 && m[1] ? kept : 0;
    render();
    setOpen(true);
  }

  function render(): void {
    list.replaceChildren(
      ...shown.map((c, i) => {
        const row = el(
          'div',
          { class: 'co-slash__row', attrs: { id: `${uid}-${i}`, role: 'option', 'aria-selected': String(i === active), 'data-name': c.name } },
          el('span', { class: 'co-slash__name' }, `/${c.name}`),
          el('span', { class: `co-slash__source co-slash__source--${c.source}` }, sourceLabel(c)),
          el('span', { class: 'co-slash__desc' }, c.description),
        );
        // Keep the cursor in the box: a click picks, it never takes focus.
        row.addEventListener('pointerdown', (ev) => ev.preventDefault());
        row.addEventListener('click', () => pick(i));
        return row;
      }),
    );
    highlight();
  }

  function highlight(): void {
    list.querySelectorAll<HTMLElement>('.co-slash__row').forEach((r, i) => r.setAttribute('aria-selected', String(i === active)));
    const row = list.children[active] as HTMLElement | undefined;
    if (!row) return input.removeAttribute('aria-activedescendant');
    input.setAttribute('aria-activedescendant', row.id);
    row.scrollIntoView({ block: 'nearest' });
  }

  function pick(i: number): void {
    const c = shown[i];
    if (!c) return;
    input.value = `/${c.name} `;
    input.setSelectionRange(input.value.length, input.value.length);
    input.focus({ preventScroll: true });
    setOpen(false);
    // The composer grows and its Send button wakes up as if you'd typed it.
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  input.addEventListener('input', sync);
  input.addEventListener('blur', () => setOpen(false));
  input.addEventListener('focus', sync);

  const stop = (ev: KeyboardEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
  };

  return {
    el: root,
    get open() {
      return isOpen;
    },
    key(ev) {
      if (!isOpen || ev.isComposing || ev.altKey || ev.ctrlKey || ev.metaKey) return false;
      if (ev.key === 'Escape') {
        stop(ev);
        dismissed = input.value;
        setOpen(false);
        return true;
      }
      if (!shown.length) return false;
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        stop(ev);
        active = (active + (ev.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length;
        highlight();
        return true;
      }
      if ((ev.key === 'Enter' || ev.key === 'Tab') && !ev.shiftKey) {
        // Typed in full: Enter sends it, as in Claude Code (Tab still adds the space).
        if (ev.key === 'Enter' && input.value === `/${shown[active].name}`) {
          setOpen(false);
          return false;
        }
        stop(ev);
        pick(active);
        return true;
      }
      return false;
    },
    close() {
      if (!isOpen) return false;
      dismissed = input.value;
      setOpen(false);
      return true;
    },
    sync,
  };
}
