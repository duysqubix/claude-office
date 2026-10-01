// The shelves: one section per artist (or category), one card per model. Cards are keyed by id
// and reused across polls, so a model that gets built fills in its own slot (with a little
// celebration) instead of the whole grid redrawing.
import { PALETTE } from '../style/palette';
import { signature } from './data';
import { ICON, STARBURST, faceSvg, silhouetteFor } from './icons';
import { PRIORITY, artistOf, version, type Artist, type CatalogItem } from './types';
import { bytesText, clear, dimsText, h, reducedMotion, rich, svg, trisShort } from './util';

export interface Shelf {
  key: string;
  title: string;
  sub: string;
  artist: Artist | null;
  items: CatalogItem[];
}

interface Card {
  el: HTMLElement;
  sig: string;
}

interface Section {
  el: HTMLElement;
  head: HTMLElement;
  cards: HTMLElement;
}

const CONFETTI = PALETTE.deskAccents;

export class Grid {
  readonly el = h('div', { class: 'shelves' });
  private readonly cards = new Map<string, Card>();
  private readonly sections = new Map<string, Section>();
  private selected: string | null = null;

  constructor(private readonly onCopy: (id: string, el: HTMLElement) => void) {}

  render(shelves: Shelf[], fresh: ReadonlySet<string>): void {
    shelves.forEach((shelf, si) => {
      const sec = this.section(shelf);
      const at = this.el.children[si];
      if (at !== sec.el) this.el.insertBefore(sec.el, at ?? null);
      this.head(sec, shelf);
      shelf.items.forEach((item, ci) => {
        const card = this.card(item, fresh.has(item.id));
        const here = sec.cards.children[ci];
        if (here !== card.el) sec.cards.insertBefore(card.el, here ?? null);
      });
      while (sec.cards.children.length > shelf.items.length) sec.cards.lastElementChild?.remove();
    });
    while (this.el.children.length > shelves.length) this.el.lastElementChild?.remove();
  }

  select(id: string | null): void {
    if (this.selected) this.cards.get(this.selected)?.el.classList.remove('sel');
    this.selected = id;
    if (id) this.cards.get(id)?.el.classList.add('sel');
  }

  /** The card on screen for this model, if it's showing. */
  cardEl(id: string): HTMLElement | null {
    const el = this.cards.get(id)?.el;
    return el?.isConnected ? el : null;
  }

  /** A model just got built: stamp its thumbnail in and throw some confetti. */
  land(id: string): void {
    const el = this.cardEl(id);
    if (!el) return;
    el.classList.add('landed');
    setTimeout(() => el.classList.remove('landed'), 1800);
    if (reducedMotion()) return;
    const burst = h('span', { class: 'confetti', 'aria-hidden': 'true' });
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + Math.random() * 0.35;
      const d = 80 + Math.random() * 70;
      const style = `--c:${CONFETTI[i % CONFETTI.length]};--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(Math.sin(a) * d * 0.8 - 30).toFixed(0)}px;--r:${(Math.random() * 600 - 300).toFixed(0)}deg`;
      burst.append(h('i', { style }));
    }
    el.append(burst);
    setTimeout(() => burst.remove(), 1300);
  }

  private section(shelf: Shelf): Section {
    let s = this.sections.get(shelf.key);
    if (!s) {
      const head = h('div', { class: 'shelf-head' });
      const cards = h('div', { class: 'cards' });
      s = { el: h('section', { class: 'shelf' }, head, cards), head, cards };
      this.sections.set(shelf.key, s);
    }
    return s;
  }

  private head(s: Section, shelf: Shelf): void {
    const done = shelf.items.filter((i) => i.status === 'done').length;
    const total = shelf.items.length;
    const sig = JSON.stringify([shelf.title, shelf.sub, done, total]);
    if (s.head.dataset.sig === sig) return;
    s.head.dataset.sig = sig;
    s.el.setAttribute('aria-label', shelf.title);
    s.el.style.setProperty('--a', shelf.artist?.color ?? PALETTE.wallAccent);
    clear(s.head);
    s.head.append(
      shelf.artist ? svg(faceSvg(shelf.artist), 'face') : h('span', { class: 'shelf-cap' }),
      h('span', { class: 'shelf-text' }, h('h2', null, shelf.title), shelf.sub ? h('small', null, shelf.sub) : null),
      h(
        'span',
        { class: 'shelf-count' },
        h('span', null, h('b', { class: 'num' }, `${done} of ${total}`), ' built'),
        h('span', { class: 'mini-meter', 'aria-hidden': 'true' }, h('i', { style: `width:${total ? (done / total) * 100 : 0}%` })),
      ),
    );
  }

  private card(item: CatalogItem, fresh: boolean): Card {
    const sig = signature(item) + (fresh ? ' new' : '');
    let c = this.cards.get(item.id);
    if (c?.sig === sig) return c;
    const el = c?.el ?? h('article', { class: 'card' });
    this.fill(el, item, fresh);
    c = { el, sig };
    this.cards.set(item.id, c);
    return c;
  }

  private fill(el: HTMLElement, item: CatalogItem, fresh: boolean): void {
    const artist = artistOf(item.artist);
    el.className = `card st-${item.status}${this.selected === item.id ? ' sel' : ''}`;
    el.dataset.id = item.id;
    el.style.setProperty('--a', artist.color);
    clear(el);

    const win = h('div', { class: 'win' });
    if (item.thumb) {
      win.append(h('img', { src: `${item.thumb}?v=${version(item)}`, alt: '', loading: 'lazy', decoding: 'async', width: 480, height: 400 }));
    } else {
      win.append(svg(item.status === 'planned' ? silhouetteFor(item.id, artist.shape) : ICON.cube, 'sil'));
    }
    if (item.status === 'wip') win.append(h('span', { class: 'tape' }, 'In the workshop'));
    if (item.priority) {
      win.append(h('span', { class: `prio prio-${item.priority.toLowerCase()}`, title: `${item.priority}: ${PRIORITY[item.priority] ?? ''}` }, item.priority));
    }
    if (fresh) win.append(svg(STARBURST, 'burst'));

    const tag: HTMLButtonElement = h(
      'button',
      { type: 'button', class: 'idtag', title: 'Copy id', onclick: () => this.onCopy(item.id, tag) },
      svg(ICON.copy),
      h('span', null, item.id),
    );
    el.append(h('a', { class: 'card-link', href: `#${item.id}` }, win, h('h3', { class: 'card-name' }, item.name)), tag);

    if (item.error) {
      el.append(h('p', { class: 'card-desc card-error' }, `Couldn't read this model: ${item.error}`));
    } else if (item.status !== 'planned' && item.dims) {
      el.append(h('p', { class: 'specs' }, h('span', { title: 'Width × depth × height' }, dimsText(item.dims))));
    } else if (item.description) {
      el.append(h('p', { class: 'card-desc' }, ...rich(item.description)));
    }
    const foot = h('div', { class: 'card-foot' });
    if (item.status !== 'planned' && item.tris !== undefined) {
      foot.append(h('span', { class: 'specs' }, h('span', null, `${trisShort(item.tris)} tris`), item.bytes ? h('span', null, bytesText(item.bytes)) : null));
    }
    foot.append(statusChip(item));
    el.append(foot);
  }
}

export function statusChip(item: CatalogItem): HTMLElement {
  if (item.status === 'done') return h('span', { class: 'status s-done' }, svg(ICON.check), 'Done');
  if (item.status === 'wip') return h('span', { class: 'status s-wip' }, 'In progress');
  return h('span', { class: 'status s-planned' }, 'Planned');
}
