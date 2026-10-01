// The detail drawer: a live 3D look at one model (or its cut-out, if nobody has built it yet),
// tint swatches that recolour it live, and everything the game needs to use it.
import { statusChip } from './grid';
import { ICON, faceSvg, silhouetteFor } from './icons';
import { PRIORITY, TINTS, artistOf, categoryLabel, tintNames, version, type CatalogItem } from './types';
import { bytesText, camel, clear, h, metres, rich, svg } from './util';
import { ModelViewer } from './viewer';

/** docs/ASSETS.md: "Keep every GLB under ~250 KB unless there's a good reason." */
const BUDGET_BYTES = 250 * 1024;

interface PanelOpts {
  onClose(): void;
  onStep(dir: 1 | -1): void;
  onCopy(text: string, el: HTMLElement): void;
}

export class DetailPanel {
  readonly el: HTMLElement;
  private readonly face: HTMLElement;
  private readonly title: HTMLElement;
  private readonly by: HTMLElement;
  private readonly body: HTMLElement;
  private readonly pos: HTMLElement;
  private readonly prev: HTMLButtonElement;
  private readonly next: HTMLButtonElement;
  /** Made on first use; null when this browser can't do WebGL. */
  private viewer: ModelViewer | null | undefined;
  private item: CatalogItem | null = null;
  private sig = '';
  private readonly tints = new Map<string, string>();
  private code: HTMLElement | null = null;
  private hideTimer = 0;

  constructor(private readonly opts: PanelOpts) {
    this.face = h('span', { class: 'drawer-face' });
    this.title = h('h2', { id: 'drawer-title' });
    this.by = h('p', { class: 'drawer-by' });
    this.body = h('div', { class: 'drawer-body' });
    this.pos = h('span', { class: 'drawer-pos num' });
    this.prev = h('button', { type: 'button', class: 'btn', onclick: () => this.opts.onStep(-1) }, h('kbd', null, '←'), 'Previous');
    this.next = h('button', { type: 'button', class: 'btn', onclick: () => this.opts.onStep(1) }, 'Next', h('kbd', null, '→'));
    this.el = h(
      'aside',
      { class: 'drawer', role: 'dialog', 'aria-labelledby': 'drawer-title', tabindex: '-1', hidden: true },
      h(
        'div',
        { class: 'drawer-head' },
        this.face,
        h('div', { class: 'drawer-titles' }, this.title, this.by),
        h('button', { type: 'button', class: 'drawer-x', title: 'Close (Esc)', 'aria-label': 'Close', onclick: () => this.opts.onClose() }, svg(ICON.close)),
      ),
      this.body,
      h('div', { class: 'drawer-foot' }, this.prev, this.pos, this.next),
    );
  }

  get isOpen(): boolean {
    return !this.el.hidden && !this.el.classList.contains('closing');
  }

  get openId(): string | null {
    return this.isOpen ? (this.item?.id ?? null) : null;
  }

  /** Show a model (or refresh it in place when its data changed). `sig` is its data signature. */
  show(item: CatalogItem, sig: string, place: { index: number; total: number }): void {
    clearTimeout(this.hideTimer);
    const wasOpen = this.isOpen;
    this.el.hidden = false;
    this.el.classList.remove('closing');
    if (!wasOpen) {
      this.el.classList.remove('opening');
      void this.el.offsetWidth;
      this.el.classList.add('opening');
    }
    this.pos.textContent = place.index >= 0 ? `${place.index + 1} of ${place.total}` : 'Hidden by your filters';
    this.prev.disabled = this.next.disabled = place.total === 0;

    const prev = this.item;
    const same = prev?.id === item.id;
    if (same && sig === this.sig && wasOpen) return;
    const reload = !prev || !same || prev.file !== item.file || version(prev) !== version(item);
    if (!same) this.tints.clear();
    const scroll = same ? this.body.scrollTop : 0;
    this.item = item;
    this.sig = sig;
    this.render(item);
    this.body.scrollTop = scroll;
    const viewer = this.ensureViewer();
    if (!item.file || !viewer) {
      viewer?.stop();
      viewer?.clear();
    } else {
      viewer.start();
      if (reload) {
        void viewer.show(item).then(() => {
          if (this.item?.id === item.id) for (const [m, c] of this.tints) viewer.tint(m, c);
        });
      }
    }
  }

  close(): void {
    if (this.el.hidden) return;
    this.viewer?.stop();
    this.el.classList.remove('opening');
    this.el.classList.add('closing');
    this.hideTimer = window.setTimeout(() => {
      this.el.hidden = true;
      this.el.classList.remove('closing');
    }, 170);
  }

  private ensureViewer(): ModelViewer | null {
    if (this.viewer === undefined) {
      try {
        this.viewer = new ModelViewer();
      } catch (err) {
        console.warn('[catalog] no WebGL, showing thumbnails instead', err);
        this.viewer = null;
      }
    }
    return this.viewer;
  }

  private render(item: CatalogItem): void {
    const artist = artistOf(item.artist);
    this.el.style.setProperty('--a', artist.color);
    this.face.innerHTML = faceSvg(artist);
    this.title.textContent = item.name;
    this.by.textContent = `By ${artist.name}, ${item.group ?? artist.dept.toLowerCase()}`;
    clear(this.body);
    this.code = null;

    this.body.append(this.stage(item));
    this.body.append(
      h(
        'div',
        { class: 'chips' },
        item.priority ? h('span', { class: `chip prio-chip prio-${item.priority.toLowerCase()}` }, h('b', null, item.priority), PRIORITY[item.priority] ?? '') : null,
        statusChip(item),
        this.copyChip(item.id, 'Copy id'),
      ),
    );
    if (item.error) this.body.append(h('p', { class: 'warn' }, `Couldn't read this model: ${item.error}`));

    const tintable = item.file ? tintNames(item) : [];
    if (tintable.length) this.body.append(this.tintRows(tintable));

    if (item.description) this.body.append(h('p', { class: 'about' }, ...rich(item.description)));
    if (item.status !== 'planned') this.body.append(this.facts(item));

    const rows: [string, Node | null][] = [
      ['Category', item.category ? h('span', { class: 'chip' }, categoryLabel(item.category)) : h('span', { class: 'muted' }, 'Not set yet')],
      ['Tags', item.tags.length ? chips(item.tags) : null],
      ['Materials', item.materials?.length ? chips(item.materials, new Set(tintable)) : null],
      ['Nodes', item.nodes?.length ? chips(item.nodes) : null],
      ['Anchors', anchorList(item)],
    ];
    const dl = h('dl', { class: 'details' });
    for (const [k, v] of rows) if (v) dl.append(h('dt', null, k), h('dd', null, v));
    this.body.append(dl);
    this.body.append(this.useIt(item));
  }

  private stage(item: CatalogItem): HTMLElement {
    const viewer = item.file ? this.ensureViewer() : null;
    if (viewer) return viewer.el;
    const artist = artistOf(item.artist);
    if (item.file && item.thumb) {
      return h('div', { class: 'stage stage-still' }, h('img', { src: `${item.thumb}?v=${version(item)}`, alt: `Preview of ${item.name}` }));
    }
    return h(
      'div',
      { class: 'stage stage-empty' },
      svg(silhouetteFor(item.id, artist.shape), 'sil'),
      h('p', null, h('b', null, 'Not built yet'), `${artist.name} has it on the ${item.priority ?? 'to-do'} list.`),
    );
  }

  private tintRows(names: string[]): HTMLElement {
    const box = h('div', { class: 'tints' });
    for (const name of names) {
      const colors = TINTS[name] ?? TINTS.Accent;
      const row = h('div', { class: 'swatches', role: 'group', 'aria-label': `${name} colour` });
      const pick = (color: string | null) => {
        if (color) this.tints.set(name, color);
        else this.tints.delete(name);
        this.viewer?.tint(name, color);
        for (const b of row.querySelectorAll('button')) b.setAttribute('aria-pressed', String((b.dataset.c || null) === color));
        this.refreshCode();
      };
      row.append(
        h('button', { type: 'button', class: 'sw sw-own', title: 'Its own colour', 'aria-label': 'Its own colour', 'aria-pressed': String(!this.tints.has(name)), onclick: () => pick(null) }),
      );
      for (const c of colors) {
        row.append(h('button', { type: 'button', class: 'sw', style: `--c:${c}`, 'data-c': c, title: c, 'aria-label': c, 'aria-pressed': String(this.tints.get(name) === c), onclick: () => pick(c) }));
      }
      box.append(h('div', { class: 'tint' }, h('span', { class: 'tint-name' }, svg(ICON.drop), name), row));
    }
    return box;
  }

  private facts(item: CatalogItem): HTMLElement {
    const fact = (value: string, label: string, cls = '') => h('div', { class: `fact ${cls}` }, h('b', { class: 'num' }, value), h('span', null, label));
    const grid = h('div', { class: 'facts' });
    if (item.dims) grid.append(fact(`${metres(item.dims.w)} m`, 'Width'), fact(`${metres(item.dims.d)} m`, 'Depth'), fact(`${metres(item.dims.h)} m`, 'Height'));
    if (item.tris !== undefined) grid.append(fact(item.tris.toLocaleString(), 'Triangles'));
    if (item.bytes !== undefined) {
      const over = item.bytes > BUDGET_BYTES;
      grid.append(fact(bytesText(item.bytes), over ? 'File size, over 250 KB' : 'File size', over ? 'over' : ''));
    }
    if (item.textures !== undefined) grid.append(fact(String(item.textures), item.textures === 1 ? 'Texture' : 'Textures'));
    return grid;
  }

  private useIt(item: CatalogItem): HTMLElement {
    this.code = h('code');
    const box = h(
      'section',
      { class: 'use' },
      h('h3', null, 'Use it in the game'),
      h('div', { class: 'snippet' }, this.code, this.copyChip(() => this.code?.textContent ?? '', 'Copy code', true)),
    );
    if (item.file) {
      box.append(
        h('p', { class: 'file' }, h('a', { class: 'btn btn-small', href: `${item.file}?v=${version(item)}`, download: `${item.id}.glb` }, svg(ICON.download), 'Download'), h('span', null, `client/public/${item.file}`)),
      );
    } else {
      box.append(h('p', { class: 'muted' }, "model() returns null until it's built, so code can ask for it today."));
    }
    this.refreshCode();
    return box;
  }

  private refreshCode(): void {
    if (!this.code || !this.item) return;
    const tint = [...this.tints].map(([m, c]) => `${m}: '${c}'`).join(', ');
    this.code.textContent = `const ${camel(this.item.id)} = await model('${this.item.id}'${tint ? `, { tint: { ${tint} } }` : ''});`;
  }

  private copyChip(text: string | (() => string), label: string, dark = false): HTMLButtonElement {
    const b: HTMLButtonElement = h(
      'button',
      { type: 'button', class: dark ? 'copy copy-dark' : 'chip copy', title: label, onclick: () => this.opts.onCopy(typeof text === 'string' ? text : text(), b) },
      svg(ICON.copy),
      h('span', null, typeof text === 'string' ? text : 'Copy'),
    );
    return b;
  }
}

function chips(list: string[], marked: Set<string> = new Set()): HTMLElement {
  return h(
    'span',
    { class: 'chips' },
    ...list.map((s) => h('span', { class: `chip${marked.has(s) ? ' chip-tint' : ''}`, title: marked.has(s) ? 'The game can recolour this' : undefined }, marked.has(s) ? svg(ICON.drop) : null, s)),
  );
}

function anchorList(item: CatalogItem): HTMLElement | null {
  const entries = Object.entries(item.anchors);
  if (!entries.length) return null;
  return h(
    'ul',
    { class: 'anchors' },
    ...entries.map(([name, p]) => h('li', null, h('b', null, name), h('span', { class: 'num' }, `(${p.map((n) => metres(n)).join(', ')})`))),
  );
}
