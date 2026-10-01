// Model Catalog: every 3D model the artists are building for Claude Office, filling in live.
//   /catalog.html                     everything        /catalog.html#office_chair   open one model
//   ?status=done&p=P0,P1&artist=Claude%20Monet&cat=furniture&group=category&q=chair  (filters)
// Data: models/catalog.json, written by `npm run catalog` and re-fetched every 10 s.
// Keys: / search, Esc close, ← → step through the models on screen.
import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import './catalog.css';
import { CatalogMissing, fetchCatalog, landed as landedBetween, loadSeen, saveSeen, signature } from './data';
import { FilterBar, NO_CATEGORY, matches, readFilters, writeFilters, type Filters } from './filters';
import { Grid, type Shelf } from './grid';
import { Header } from './header';
import { faceSvg } from './icons';
import { DetailPanel } from './panel';
import { Toasts } from './toasts';
import { ARTISTS, artistOf, byShelf, categoryLabel, type Catalog, type CatalogItem } from './types';
import { copyText, h, reducedMotion, svg } from './util';

const POLL_MS = 10_000;

let catalog: Catalog | null = null;
let byId = new Map<string, CatalogItem>();
/** Models on screen, in reading order (what ← → step through). */
let visible: CatalogItem[] = [];
let filters = readFilters();
/** Built since this browser last looked: they wear a "New!" sticker. */
const fresh = new Set<string>();

const toasts = new Toasts();
const header = new Header({
  onArtist: (name) => setFilters({ ...filters, artist: filters.artist === name ? null : name }),
  onOpen: (id) => open(id, 'push'),
});
header.lookup = (id) => byId.get(id);
const bar = new FilterBar(filters, setFilters);
const grid = new Grid(copy);
const panel = new DetailPanel({ onClose: close, onStep: step, onCopy: copy });
const emptyText = h('p');
const emptyBtn = h('button', { type: 'button', class: 'btn', onclick: () => setFilters({ ...filters, q: '', status: 'all', prio: [], artist: null, cat: null }) }, 'Clear filters');
const empty = h('div', { class: 'empty', hidden: true }, emptyText, emptyBtn);

/** Waiting for the first catalogue: only the masthead and any problem note show. */
const page = h('main', { class: 'page waiting' }, header.el, bar.el, bar.summary, grid.el, empty);
document.getElementById('app')?.replaceChildren(page, panel.el, toasts.el);

// ── Rendering ────────────────────────────────────────────────────────────────────────────

/**
 * By artist: a shelf per artist and work list (their docs/ASSETS.md section, which a model keeps
 * even when its sidecar names the artist differently). By category: a shelf per category.
 */
function shelves(items: CatalogItem[]): Shelf[] {
  const lists = workLists();
  const groups = new Map<string, Shelf & { order: number }>();
  for (const i of items) {
    const a = artistOf(i.artist);
    const byArtist = filters.group === 'artist';
    const own = lists.get(a.name) ?? [];
    const list = i.group ?? own[0] ?? a.dept;
    const key = byArtist ? `a:${a.name}:${list}` : `c:${i.category ?? NO_CATEGORY}`;
    let g = groups.get(key);
    if (!g) {
      // The four artists in their usual order (anyone new after them); uncategorised last.
      const rank = ARTISTS.findIndex((x) => x.name === a.name);
      g = byArtist
        ? { key, title: a.name, sub: sentence(list), artist: a, items: [], order: (rank < 0 ? ARTISTS.length : rank) * 100 + Math.max(0, own.indexOf(list)) }
        : { key, title: categoryLabel(i.category), sub: '', artist: null, items: [], order: i.category ? 0 : 1 };
      groups.set(key, g);
    }
    g.items.push(i);
  }
  const list = [...groups.values()].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  for (const g of list) g.items.sort(byShelf);
  return list;
}

/** Each artist's work lists, biggest first (so their first list comes before "round 2"). */
function workLists(): Map<string, string[]> {
  const counts = new Map<string, Map<string, number>>();
  for (const i of catalog?.items ?? []) {
    if (!i.group) continue;
    const a = artistOf(i.artist).name;
    const m = counts.get(a) ?? new Map<string, number>();
    m.set(i.group, (m.get(i.group) ?? 0) + 1);
    counts.set(a, m);
  }
  return new Map([...counts].map(([a, m]) => [a, [...m].sort((x, y) => y[1] - x[1]).map(([g]) => g)]));
}

function render(landed: ReadonlySet<string> = new Set()): void {
  if (!catalog) return;
  page.classList.remove('waiting');
  const items = catalog.items.filter((i) => matches(i, filters));
  const list = shelves(items);
  visible = list.flatMap((g) => g.items);
  grid.render(list, fresh);
  grid.select(panel.openId);
  bar.update(catalog.items, items.length);
  header.update(catalog, landed, filters.artist);
  empty.hidden = items.length > 0;
  emptyText.textContent = 'No models match these filters.';
  emptyBtn.hidden = false;
}

function setFilters(f: Filters): void {
  filters = f;
  bar.set(f);
  writeFilters(f);
  render();
  if (panel.isOpen) place();
}

// ── The open model ───────────────────────────────────────────────────────────────────────

function open(id: string, nav: 'push' | 'replace' | 'none'): void {
  const item = byId.get(id);
  if (!item) {
    if (catalog) toasts.show([`There's no model called "${id}" in the catalogue.`]);
    return;
  }
  const wasOpen = panel.isOpen;
  panel.show(item, signature(item), where(id));
  document.body.classList.add('drawer-open');
  grid.select(id);
  // Opening the drawer adds one history entry (so Back closes it); moving between models replaces it.
  if (nav !== 'none' && location.hash !== `#${id}`) {
    const url = `${location.pathname}${location.search}#${id}`;
    if (nav === 'push' && !wasOpen) history.pushState({ drawer: true }, '', url);
    else history.replaceState(history.state, '', url);
  }
  const card = grid.cardEl(id);
  if (card) requestAnimationFrame(() => card.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' }));
}

function close(): void {
  const id = panel.openId;
  if (!id) return;
  panel.close();
  document.body.classList.remove('drawer-open');
  grid.select(null);
  if (location.hash) {
    if (history.state?.drawer) history.back();
    else history.replaceState(null, '', `${location.pathname}${location.search}`);
  }
  grid.cardEl(id)?.querySelector<HTMLElement>('.card-link')?.focus({ preventScroll: true });
}

function step(dir: 1 | -1): void {
  if (!visible.length) return;
  const at = visible.findIndex((i) => i.id === panel.openId);
  const next = at < 0 ? (dir > 0 ? 0 : visible.length - 1) : (at + dir + visible.length) % visible.length;
  open(visible[next].id, 'replace');
}

/** Where the open model sits among the ones on screen. */
function where(id: string): { index: number; total: number } {
  return { index: visible.findIndex((i) => i.id === id), total: visible.length };
}

/** Refresh the open model's data (and its "7 of 48") after a poll or a filter change. */
function place(): void {
  const id = panel.openId;
  const item = id ? byId.get(id) : undefined;
  if (id && item) panel.show(item, signature(item), where(id));
}

function onHash(): void {
  const id = decodeURIComponent(location.hash.slice(1));
  if (id) open(id, 'none');
  else close();
}

// ── Live data ────────────────────────────────────────────────────────────────────────────

async function refresh(): Promise<void> {
  let next: Catalog;
  try {
    next = await fetchCatalog();
  } catch (err) {
    const missing = err instanceof CatalogMissing;
    header.setLive(null, missing ? 'No catalogue yet' : "Can't reach the office server, retrying");
    if (!catalog) {
      emptyText.textContent = missing
        ? 'No catalogue yet. Run npm run catalog in ~/claude-office and this page fills in by itself.'
        : "Can't reach the office server. Start it with npm run dev in ~/claude-office; this page tries again every 10 seconds.";
      emptyBtn.hidden = true;
      empty.hidden = false;
    }
    return;
  }
  header.setLive(next.generated);
  if (catalog && next.generated === catalog.generated) return;
  const prev = catalog;
  catalog = next;
  byId = new Map(next.items.map((i) => [i.id, i]));
  const built = next.items.filter((i) => i.status === 'done');
  const landed = prev ? landedBetween(prev, next) : sinceLastVisit(built);
  for (const i of landed) fresh.add(i.id);
  render(new Set(prev ? landed.map((i) => i.id) : []));
  if (prev) {
    for (const i of landed) grid.land(i.id);
    announce(landed, 'just landed');
  } else {
    announce(landed, 'since your last visit');
  }
  saveSeen(built.map((i) => i.id));
  if (!prev) onHash();
  else place();
}

function sinceLastVisit(built: CatalogItem[]): CatalogItem[] {
  const seen = loadSeen();
  return seen ? built.filter((i) => !seen.has(i.id)) : [];
}

function announce(landed: CatalogItem[], when: string): void {
  if (!landed.length) return;
  const first = landed[0];
  const a = artistOf(first.artist);
  const look = { label: 'Look', run: () => open(first.id, 'push') };
  if (landed.length === 1) {
    toasts.show([`${a.name} finished `, h('b', null, first.name)], { color: a.color, icon: svg(faceSvg(a), 'face'), action: look });
    return;
  }
  const names = landed.slice(0, 2).map((i) => i.name);
  const more = landed.length - names.length;
  const text = more ? `${names.join(', ')} and ${more} more` : names.join(' and ');
  toasts.show([h('b', null, `${landed.length} new models`), ` ${when}: ${text}`], { color: a.color, action: look });
}

// ── Small things ─────────────────────────────────────────────────────────────────────────

function copy(text: string, el: HTMLElement): void {
  void copyText(text).then((ok) => {
    const label = el.lastElementChild;
    if (!label || el.classList.contains('copied')) return;
    const before = label.textContent;
    el.classList.add('copied');
    label.textContent = ok ? 'Copied!' : "Couldn't copy";
    setTimeout(() => {
      label.textContent = before;
      el.classList.remove('copied');
    }, 1200);
  });
}

function sentence(s: string): string {
  return s.replace(/^\w/, (c) => c.toUpperCase());
}

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target as HTMLElement;
  const typing = t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t.isContentEditable;
  if (e.key === 'Escape') {
    if (t === bar.search && bar.search.value) bar.clearSearch();
    else if (typing) t.blur();
    else if (panel.isOpen) close();
    else return;
    e.preventDefault();
    return;
  }
  if (typing) return;
  if (e.key === '/') {
    e.preventDefault();
    bar.search.focus();
    bar.search.select();
  } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault();
    step(e.key === 'ArrowRight' ? 1 : -1);
  }
});

// Cards are real links (new tabs work); a plain click opens the drawer without a page jump.
grid.el.addEventListener('click', (e) => {
  const link = (e.target as HTMLElement).closest('a.card-link');
  const id = link?.closest<HTMLElement>('.card')?.dataset.id;
  if (!id || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  open(id, 'push');
});
window.addEventListener('hashchange', onHash);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) void refresh();
});
setInterval(() => {
  if (!document.hidden) void refresh();
}, POLL_MS);
setInterval(() => header.tick(), 15_000);
void refresh();
