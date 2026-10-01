// The sticky toolbar: search, status, priority, artist, category and grouping. Filters live in
// the query string (the hash is the open model), so a filtered view survives reloads and links.
import { ICON } from './icons';
import { ARTISTS, PRIORITY, artistOf, categoryLabel, type CatalogItem, type Status } from './types';
import { clear, h, svg } from './util';

/** Category filter value for models whose sidecar has no category yet. */
export const NO_CATEGORY = 'none';

export interface Filters {
  q: string;
  status: 'all' | Status;
  prio: string[];
  artist: string | null;
  cat: string | null;
  group: 'artist' | 'category';
}

export function readFilters(search = location.search): Filters {
  const p = new URLSearchParams(search);
  const status = p.get('status');
  return {
    q: p.get('q') ?? '',
    status: status === 'done' || status === 'wip' || status === 'planned' ? status : 'all',
    prio: (p.get('p') ?? '').split(',').filter((x) => x in PRIORITY),
    artist: p.get('artist'),
    cat: p.get('cat'),
    group: p.get('group') === 'category' ? 'category' : 'artist',
  };
}

export function writeFilters(f: Filters): void {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.status !== 'all') p.set('status', f.status);
  if (f.prio.length) p.set('p', f.prio.join(','));
  if (f.artist) p.set('artist', f.artist);
  if (f.cat) p.set('cat', f.cat);
  if (f.group !== 'artist') p.set('group', f.group);
  const qs = p.toString();
  history.replaceState(history.state, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
}

export function isFiltered(f: Filters): boolean {
  return Boolean(f.q.trim() || f.status !== 'all' || f.prio.length || f.artist || f.cat);
}

export function matches(i: CatalogItem, f: Filters): boolean {
  if (f.status !== 'all' && i.status !== f.status) return false;
  if (f.prio.length && !f.prio.includes(i.priority ?? '')) return false;
  if (f.artist && artistOf(i.artist).name !== f.artist) return false;
  if (f.cat && (i.category ?? NO_CATEGORY) !== f.cat) return false;
  const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = haystack(i);
  return words.every((w) => hay.includes(w));
}

const hays = new WeakMap<CatalogItem, string>();
function haystack(i: CatalogItem): string {
  let s = hays.get(i);
  if (s === undefined) {
    s = [i.id, i.id.replace(/_/g, ' '), i.name, i.description, i.category, categoryLabel(i.category), i.artist, i.group, ...i.tags, ...(i.materials ?? [])]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    hays.set(i, s);
  }
  return s;
}

const STATUSES: { value: Filters['status']; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'done', label: 'Done' },
  { value: 'wip', label: 'In progress' },
  { value: 'planned', label: 'Planned' },
];

export class FilterBar {
  readonly el: HTMLElement;
  /** "Showing 12 of 228  Clear filters", under the bar while anything is filtered. */
  readonly summary: HTMLElement;
  readonly search: HTMLInputElement;
  private readonly statusBtns = new Map<Filters['status'], HTMLButtonElement>();
  private readonly prioBtns = new Map<string, HTMLButtonElement>();
  private readonly groupBtns = new Map<Filters['group'], HTMLButtonElement>();
  private readonly artistSel: HTMLSelectElement;
  private readonly catSel: HTMLSelectElement;
  private readonly count: HTMLElement;
  private readonly reset: HTMLButtonElement;
  private optionsKey = '';

  constructor(
    private f: Filters,
    private readonly onChange: (f: Filters) => void,
  ) {
    this.search = h('input', {
      class: 'search-input',
      type: 'search',
      value: f.q,
      placeholder: 'Search models',
      'aria-label': 'Search models',
      autocomplete: 'off',
      spellcheck: false,
      oninput: () => this.change({ q: this.search.value }),
    });
    const status = h('div', { class: 'seg', role: 'group', 'aria-label': 'Status' });
    for (const s of STATUSES) {
      const b = h('button', { type: 'button', onclick: () => this.change({ status: s.value }) }, s.label, h('small', { class: 'num' }));
      this.statusBtns.set(s.value, b);
      status.append(b);
    }
    const prio = h('div', { class: 'seg', role: 'group', 'aria-label': 'Priority' });
    for (const [p, hint] of Object.entries(PRIORITY)) {
      const b = h(
        'button',
        { type: 'button', title: `${p}: ${hint}`, onclick: () => this.change({ prio: this.f.prio.includes(p) ? this.f.prio.filter((x) => x !== p) : [...this.f.prio, p] }) },
        p,
      );
      this.prioBtns.set(p, b);
      prio.append(b);
    }
    this.artistSel = h('select', { class: 'pick', 'aria-label': 'Artist', onchange: () => this.change({ artist: this.artistSel.value || null }) });
    this.catSel = h('select', { class: 'pick', 'aria-label': 'Category', onchange: () => this.change({ cat: this.catSel.value || null }) });
    const group = h('div', { class: 'seg', role: 'group', 'aria-label': 'Group by' });
    for (const [g, label] of [
      ['artist', 'By artist'],
      ['category', 'By category'],
    ] as const) {
      const b = h('button', { type: 'button', onclick: () => this.change({ group: g }) }, label);
      this.groupBtns.set(g, b);
      group.append(b);
    }
    this.count = h('span', { 'aria-live': 'polite' });
    this.reset = h(
      'button',
      { type: 'button', class: 'linkish', onclick: () => this.change({ q: '', status: 'all', prio: [], artist: null, cat: null }) },
      'Clear filters',
    );
    this.summary = h('p', { class: 'results' }, this.count, this.reset);

    this.el = h(
      'nav',
      { class: 'bar', 'aria-label': 'Filters' },
      h('label', { class: 'search' }, svg(ICON.search, 'ico search-ico'), this.search, h('kbd', { title: 'Press / to search' }, '/')),
      status,
      prio,
      this.artistSel,
      this.catSel,
      group,
    );
  }

  get filters(): Filters {
    return this.f;
  }

  set(f: Filters): void {
    this.f = f;
    if (this.search.value !== f.q) this.search.value = f.q;
    this.sync();
  }

  clearSearch(): void {
    this.change({ q: '' });
  }

  /** Counts, options and pressed states, after the data or the filters changed. */
  update(items: CatalogItem[], shown: number): void {
    for (const [value, b] of this.statusBtns) {
      const n = value === 'all' ? items.length : items.filter((i) => i.status === value).length;
      (b.querySelector('small') as HTMLElement).textContent = String(n);
      b.hidden = value === 'wip' && n === 0 && this.f.status !== 'wip';
    }
    for (const [p, b] of this.prioBtns) b.title = `${p}: ${PRIORITY[p]} (${items.filter((i) => i.priority === p).length} models)`;
    this.search.placeholder = `Search ${items.length} models`;

    const artists = new Map<string, number>();
    const cats = new Map<string, number>();
    for (const i of items) {
      const a = artistOf(i.artist).name;
      artists.set(a, (artists.get(a) ?? 0) + 1);
      const c = i.category ?? NO_CATEGORY;
      cats.set(c, (cats.get(c) ?? 0) + 1);
    }
    const artistOrder = [...artists.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
    const catOrder = [...cats.keys()].sort((a, b) => Number(a === NO_CATEGORY) - Number(b === NO_CATEGORY) || categoryLabel(a).localeCompare(categoryLabel(b)));
    // Only rebuild the menus when their contents change, so a poll never closes an open menu.
    const key = JSON.stringify([[...artists], [...cats]]);
    if (key !== this.optionsKey) {
      this.optionsKey = key;
      fillSelect(this.artistSel, 'All artists', artistOrder.map((a) => [a, `${a} (${artists.get(a)})`]));
      fillSelect(this.catSel, 'All categories', catOrder.map((c) => [c, `${categoryLabel(c === NO_CATEGORY ? null : c)} (${cats.get(c)})`]));
    }
    this.count.textContent = `Showing ${shown} of ${items.length} models`;
    this.sync();
  }

  private change(patch: Partial<Filters>): void {
    this.f = { ...this.f, ...patch };
    this.sync();
    this.onChange(this.f);
  }

  private sync(): void {
    for (const [value, b] of this.statusBtns) b.setAttribute('aria-pressed', String(this.f.status === value));
    for (const [p, b] of this.prioBtns) b.setAttribute('aria-pressed', String(this.f.prio.includes(p)));
    for (const [g, b] of this.groupBtns) b.setAttribute('aria-pressed', String(this.f.group === g));
    this.artistSel.value = this.f.artist ?? '';
    this.catSel.value = this.f.cat ?? '';
    this.artistSel.classList.toggle('set', Boolean(this.f.artist));
    this.catSel.classList.toggle('set', Boolean(this.f.cat));
    this.summary.hidden = !isFiltered(this.f);
  }
}

function rank(artist: string): number {
  const i = ARTISTS.findIndex((a) => a.name === artist);
  return i < 0 ? ARTISTS.length : i;
}

function fillSelect(sel: HTMLSelectElement, all: string, options: [string, string][]): void {
  const keep = sel.value;
  clear(sel);
  sel.append(h('option', { value: '' }, all), ...options.map(([v, label]) => h('option', { value: v }, label)));
  sel.value = keep;
}
