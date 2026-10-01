// Top of the page: title, live indicator, overall progress and one tile per artist. Each tile
// has a stud per model (built ones filled in the artist's colour), so the four grids fill up
// like progress bars while the artists work. Clicking a stud opens that model.
import { faceSvg, LOGO } from './icons';
import { ARTISTS, artistOf, byProgress, type Catalog, type CatalogItem } from './types';
import { ago, clear, h, svg } from './util';

interface HeaderOpts {
  onArtist(name: string): void;
  onOpen(id: string): void;
}

interface Tile {
  el: HTMLElement;
  pick: HTMLButtonElement;
  done: HTMLElement;
  total: HTMLElement;
  studs: HTMLElement;
}

const STATUS_WORD = { done: 'built', wip: 'in the workshop', planned: 'planned' } as const;

export class Header {
  readonly el: HTMLElement;
  /** Set by the page so stud tooltips can name their model. */
  lookup: ((id: string) => CatalogItem | undefined) | null = null;
  private readonly live: HTMLElement;
  private readonly liveText: HTMLElement;
  private readonly doneNum: HTMLElement;
  private readonly allNum: HTMLElement;
  private readonly pct: HTMLElement;
  private readonly meter: HTMLElement;
  private readonly fillDone: HTMLElement;
  private readonly fillWip: HTMLElement;
  private readonly notes: HTMLElement;
  private readonly tilesEl: HTMLElement;
  private readonly tiles = new Map<string, Tile>();
  private readonly tip: HTMLElement;
  private generated = 0;
  private failing: string | null = null;

  constructor(private readonly opts: HeaderOpts) {
    this.live = h('div', { class: 'live', role: 'status' }, h('i'), (this.liveText = h('span', null, 'Opening the catalogue…')));
    this.doneNum = h('b', { class: 'num' }, '0');
    this.allNum = h('b', { class: 'num' }, '0');
    this.pct = h('span', { class: 'total-pct num' }, '0%');
    this.fillDone = h('i', { class: 'fill-done', hidden: true });
    this.fillWip = h('i', { class: 'fill-wip', hidden: true });
    this.meter = h('div', { class: 'meter', role: 'progressbar', 'aria-label': 'Models built', 'aria-valuemin': '0' }, this.fillDone, this.fillWip);
    this.notes = h('div', { class: 'total-notes' });
    this.tilesEl = h('div', { class: 'artists' });
    this.tip = h('div', { class: 'tip', hidden: true });

    this.el = h(
      'header',
      { class: 'top' },
      h(
        'div',
        { class: 'masthead' },
        h('div', { class: 'brand' }, svg(LOGO, 'logo'), 'Claude Office'),
        h('h1', { class: 'title' }, h('span', { class: 'sr' }, 'Claude Office · '), 'Model Catalog'),
        this.live,
      ),
      h(
        'section',
        { class: 'board', 'aria-label': 'Progress' },
        h('div', { class: 'total' }, h('p', { class: 'total-line' }, this.doneNum, ' of ', this.allNum, ' models built'), this.meter, this.pct),
        this.notes,
        this.tilesEl,
      ),
    );
    document.body.append(this.tip);
    for (const a of ARTISTS) this.tile(a.name);

    this.tilesEl.addEventListener('mouseover', (e) => this.hover(e.target as HTMLElement));
    this.tilesEl.addEventListener('mouseleave', () => (this.tip.hidden = true));
    this.tilesEl.addEventListener('click', (e) => {
      const id = (e.target as HTMLElement).closest<HTMLElement>('.stud')?.dataset.id;
      if (id) this.opts.onOpen(id);
    });
  }

  update(cat: Catalog, landed: ReadonlySet<string>, artistFilter: string | null): void {
    const items = cat.items;
    const done = items.filter((i) => i.status === 'done').length;
    const wip = items.filter((i) => i.status === 'wip').length;
    const all = items.length;
    if (this.doneNum.textContent !== String(done) && this.doneNum.textContent !== '0') bump(this.doneNum);
    this.doneNum.textContent = String(done);
    this.allNum.textContent = String(all);
    this.pct.textContent = `${all ? Math.floor((done / all) * 100) : 0}%`;
    const pDone = all ? (done / all) * 100 : 0;
    const pWip = all ? (wip / all) * 100 : 0;
    this.fillDone.style.width = `${pDone}%`;
    this.fillDone.hidden = done === 0;
    this.fillWip.style.left = `${pDone}%`;
    this.fillWip.style.width = `${pWip}%`;
    this.fillWip.hidden = wip === 0;
    this.meter.setAttribute('aria-valuemax', String(all));
    this.meter.setAttribute('aria-valuenow', String(done));

    const p0 = items.filter((i) => i.priority === 'P0');
    clear(this.notes);
    this.notes.append(
      h('span', { class: 'note' }, h('b', { class: 'num' }, `${p0.filter((i) => i.status === 'done').length} of ${p0.length}`), ' P0 models built (the ones the game uses now)'),
    );
    if (wip) this.notes.append(h('span', { class: 'note note-wip' }, h('i'), h('b', { class: 'num' }, String(wip)), ' in the workshop'));

    const byArtist = new Map<string, CatalogItem[]>();
    for (const i of items) {
      const name = artistOf(i.artist).name;
      const list = byArtist.get(name);
      if (list) list.push(i);
      else byArtist.set(name, [i]);
    }
    for (const [name, list] of byArtist) this.fillTile(this.tile(name), list.sort(byProgress), landed);
    for (const [name, t] of this.tiles) {
      t.el.hidden = !byArtist.has(name);
      t.el.classList.toggle('on', artistFilter === name);
      t.pick.setAttribute('aria-pressed', String(artistFilter === name));
    }
    this.tilesEl.classList.toggle('filtered', artistFilter !== null);
  }

  /** Server reachable (with the catalog's build time) or not (with why). */
  setLive(generated: string | null, problem: string | null = null): void {
    if (generated) this.generated = Date.parse(generated) || 0;
    this.failing = problem;
    this.tick();
  }

  /** Refresh the "updated … ago" text. */
  tick(): void {
    this.live.classList.toggle('down', this.failing !== null);
    this.liveText.textContent = this.failing ?? (this.generated ? `Live, catalog updated ${ago(this.generated)}` : 'Opening the catalogue…');
  }

  private tile(name: string): Tile {
    let t = this.tiles.get(name);
    if (t) return t;
    const a = artistOf(name);
    const done = h('b', { class: 'num' }, '0');
    const total = h('span', { class: 'num' }, '0');
    const pick = h(
      'button',
      { class: 'artist-pick', type: 'button', 'aria-pressed': 'false', title: `Show only ${a.name}'s models`, onclick: () => this.opts.onArtist(a.name) },
      svg(faceSvg(a), 'face'),
      h('span', { class: 'artist-who' }, h('b', null, a.name), h('small', null, a.dept)),
      h('span', { class: 'artist-count' }, done, h('small', null, 'of ', total)),
    );
    const studs = h('div', { class: 'studs', 'aria-hidden': 'true' });
    t = { el: h('div', { class: 'artist', style: `--a:${a.color}` }, pick, studs), pick, done, total, studs };
    this.tiles.set(name, t);
    this.tilesEl.append(t.el);
    return t;
  }

  private fillTile(t: Tile, list: CatalogItem[], landed: ReadonlySet<string>): void {
    const done = list.filter((i) => i.status === 'done').length;
    if (t.done.textContent !== String(done) && t.done.textContent !== '0') bump(t.done);
    t.done.textContent = String(done);
    t.total.textContent = String(list.length);
    t.pick.setAttribute('aria-label', `${t.pick.querySelector('b')?.textContent}: ${done} of ${list.length} built. Show only their models`);
    clear(t.studs);
    for (const i of list) {
      t.studs.append(h('span', { class: `stud st-${i.status}${landed.has(i.id) ? ' pop' : ''}`, 'data-id': i.id }));
    }
  }

  private hover(target: HTMLElement): void {
    const stud = target.closest<HTMLElement>('.stud');
    const item = stud?.dataset.id ? this.lookup?.(stud.dataset.id) : undefined;
    if (!stud || !item) {
      this.tip.hidden = true;
      return;
    }
    const r = stud.getBoundingClientRect();
    this.tip.textContent = `${item.name}, ${STATUS_WORD[item.status]}`;
    this.tip.style.left = `${r.left + r.width / 2}px`;
    this.tip.style.top = `${r.top}px`;
    this.tip.hidden = false;
  }
}

/** Count change: 1.3 → 1 (docs/UX.md §4.4). */
function bump(el: HTMLElement): void {
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}
