// The Spotify app on the manager's laptop (#28): E at your desk walks you behind your chair and a
// chunky laptop springs out of the one on the desk, the same sit-down as at any computer. First
// time, the setup steps (create an app, the redirect URI, tick the APIs, paste the Client ID, Sign
// in); then your playlists and Liked Songs, their songs, and a player bar: cover, title, artist,
// previous, play/pause, next, a seek bar and the volume (the office's music volume). Esc or
// Ctrl+] stands you up; the music plays on. Names from Spotify only ever go in as text.
import { SPOTIFY_CLIENT_ID } from '../../../shared/spotify';
import { audio } from '../audio/index';
import { button } from '../ui/components';
import { el, markup, type Markup } from '../ui/el';
import { icon } from '../ui/icons';
import { TerminalOverlay } from '../ui/terminal';
import type { LaptopState, Phase, SpotifyStore } from './store';
import { LIKED, type Playlist, type Track } from './types';
import './laptop.css';

const isStandUp = (ev: KeyboardEvent) => ev.ctrlKey && (ev.code === 'BracketRight' || ev.key === ']');
/** Where Space is the control's own key (a button, a field, the sliders), not play/pause. */
const OWN_SPACE = 'button, a, input, textarea, select, [role="slider"]';
const DASHBOARD = 'https://developer.spotify.com/dashboard';

const INK = '#2B2D42';
const svg = (body: string, size = 24, view = 24): Markup => markup(`<svg class="co-icon" viewBox="0 0 ${view} ${view}" width="${size}" height="${size}" aria-hidden="true">${body}</svg>`);
const ICON = {
  play: (n = 24) => svg(`<path d="M8.5 5.6v12.8a1 1 0 0 0 1.5.9l10-6.4a1 1 0 0 0 0-1.7l-10-6.4a1 1 0 0 0-1.5.8z" fill="${INK}"/>`, n),
  pause: (n = 24) => svg(`<rect x="6.5" y="5" width="4.2" height="14" rx="1.6" fill="${INK}"/><rect x="13.3" y="5" width="4.2" height="14" rx="1.6" fill="${INK}"/>`, n),
  next: (n = 22) => svg(`<path d="M5 6.4v11.2a.9.9 0 0 0 1.4.7l8.2-5.6a.9.9 0 0 0 0-1.4L6.4 5.7A.9.9 0 0 0 5 6.4z" fill="${INK}"/><rect x="16.2" y="5.5" width="3" height="13" rx="1.3" fill="${INK}"/>`, n),
  prev: (n = 22) => svg(`<path d="M19 6.4v11.2a.9.9 0 0 1-1.4.7l-8.2-5.6a.9.9 0 0 1 0-1.4l8.2-5.6a.9.9 0 0 1 1.4.7z" fill="${INK}"/><rect x="4.8" y="5.5" width="3" height="13" rx="1.3" fill="${INK}"/>`, n),
  note: (n = 22) => svg(`<path d="M9.5 17.2V6.4l9-2v10.8" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="7.1" cy="17.4" rx="2.9" ry="2.3" fill="${INK}"/><ellipse cx="16.1" cy="15.4" rx="2.9" ry="2.3" fill="${INK}"/>`, n),
  /** The laptop's app badge: a green disc with three sound waves. */
  logo: (n = 30) =>
    svg(`<circle cx="12" cy="12" r="10.4" fill="#1ED760" stroke="${INK}" stroke-width="2"/><path d="M6.8 9.4c3.4-1.1 7.4-.8 10.4.9M7.4 12.4c2.8-.8 6-.5 8.5.8M8 15.2c2.2-.6 4.6-.4 6.6.7" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>`, n),
};

/** Liked Songs' cover: a heart on a violet tile (no id'd gradients: several sit on one page). */
const LIKED_ART = markup(
  `<svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" fill="#8B7CF6"/><path d="M0 48 48 0v48z" fill="#5CC8FF" opacity=".55"/><path d="M24 35.5s-11-6.6-11-14.2a5.9 5.9 0 0 1 11-3 5.9 5.9 0 0 1 11 3c0 7.6-11 14.2-11 14.2z" fill="#FFFDF7" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/></svg>`,
);

const fmt = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** A cover: the image (or Liked Songs' heart, or a note) in a rounded, outlined tile. */
function art(list: { id?: string; cover: string | null } | null, cls = ''): HTMLElement {
  const c = `sp-art ${cls}`.trim();
  if (list?.id === LIKED) return el('span', { class: c, html: LIKED_ART });
  if (!list?.cover) return el('span', { class: c, html: ICON.note(26) });
  return el('span', { class: c }, el('img', { attrs: { src: list.cover, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' } }));
}

/** A round transport button with its icon. */
function roundButton(label: string, glyph: Markup, cls = ''): HTMLButtonElement {
  return el('button', { class: `sp-round ${cls}`.trim(), attrs: { type: 'button', 'aria-label': label }, html: glyph });
}

interface View {
  el: HTMLElement;
  update(s: LaptopState): void;
  /** Where the keyboard goes when the view appears. */
  focus?(): void;
  dispose?(): void;
}

export class LaptopApp {
  events: { onClose?(): void } = {};
  private layer: HTMLElement | null = null;
  private laptop: HTMLElement | null = null;
  private screen: HTMLElement | null = null;
  private from: DOMRect | null = null;
  private view: View | null = null;
  private phase: Phase | null = null;
  private cleanups: (() => void)[] = [];

  constructor(
    private root: HTMLElement,
    readonly store: SpotifyStore,
  ) {}

  get isOpen(): boolean {
    return this.layer !== null;
  }

  /** Sit down at the laptop. `from` = its screen's on-screen rect, to spring out of. */
  open(from?: DOMRect): void {
    if (this.layer) this.close();
    this.from = from ?? null;
    // Focusable, so the keyboard is on the laptop even before there's a button to put it on.
    const screen = el('div', { class: 'sp-screen', attrs: { tabindex: -1 } });
    const stand = button('Stand up', { small: true, key: 'Ctrl+]', onClick: () => this.close() });
    stand.classList.add('sp-stand');
    const laptop = el(
      'div',
      { class: 'sp-laptop' },
      el('div', { class: 'sp-lid' }, el('i', { class: 'sp-cam', attrs: { 'aria-hidden': 'true' } }), screen),
      el(
        'div',
        { class: 'sp-deck' },
        el('span', { class: 'sp-deck__hint' }, 'Esc stands you up. The music plays on.'),
        el('span', { class: 'sp-deck__pad', attrs: { 'aria-hidden': 'true' } }),
        stand,
      ),
    );
    const layer = el('div', { class: 'sp-modal', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Your laptop: Spotify' } }, laptop);
    // Clicks on the backdrop never stand you up (Esc, Ctrl+] and the button do).
    layer.addEventListener('pointerdown', (ev) => {
      if (ev.target === layer) ev.preventDefault();
    });
    // Esc and Ctrl+] from anywhere; Space plays or pauses unless a control wants it.
    const keys = (ev: KeyboardEvent) => {
      if (this.layer !== layer || ev.defaultPrevented || ev.isComposing) return;
      if (ev.key === 'Escape' || isStandUp(ev)) {
        ev.preventDefault();
        ev.stopPropagation();
        if (!ev.repeat) this.close();
        return;
      }
      if (ev.code === 'Space' && !ev.ctrlKey && !ev.metaKey && !ev.altKey && !(ev.target as Element | null)?.closest?.(OWN_SPACE)) {
        ev.preventDefault();
        ev.stopPropagation();
        if (!ev.repeat && this.store.state.phase === 'ready') void this.store.toggle();
      }
    };
    document.addEventListener('keydown', keys, true);
    this.cleanups.push(() => document.removeEventListener('keydown', keys, true));
    this.cleanups.push(this.store.subscribe(() => this.render()));
    // The volume slider and the sound note follow the office's speakers (M, Help).
    this.cleanups.push(audio.subscribe(() => this.render()));
    // The song's clock moves on between Spotify's updates.
    const tick = window.setInterval(() => this.view?.update(this.store.state), 250);
    this.cleanups.push(() => window.clearInterval(tick));

    this.root.append(layer);
    this.layer = layer;
    this.laptop = laptop;
    this.screen = screen;
    document.body.classList.add('seated');
    this.render();
    TerminalOverlay.growFrom(laptop, this.from);
    void this.store.wake();
  }

  close(): void {
    if (!this.layer) return;
    for (const c of this.cleanups.splice(0)) c();
    const layer = this.layer;
    const laptop = this.laptop;
    this.view?.dispose?.();
    this.layer = null;
    this.laptop = null;
    this.screen = null;
    this.view = null;
    this.phase = null;
    document.body.classList.remove('seated');
    layer.classList.add('out');
    if (laptop && this.from) TerminalOverlay.shrinkInto(laptop, this.from);
    window.setTimeout(() => layer.remove(), 260);
    this.events.onClose?.();
  }

  private render(): void {
    const screen = this.screen;
    if (!screen) return;
    const s = this.store.state;
    if (s.phase !== this.phase || !this.view) {
      this.view?.dispose?.();
      this.phase = s.phase;
      this.view = this.build(s.phase);
      screen.replaceChildren(this.view.el);
      screen.dataset.phase = s.phase;
      this.view.update(s);
      // The old view (and whatever had the keyboard in it) is gone: into the new one.
      screen.focus({ preventScroll: true });
      this.view.focus?.();
      return;
    }
    this.view.update(s);
  }

  private build(phase: Phase): View {
    switch (phase) {
      case 'setup':
        return setupView(this.store);
      case 'waiting':
        return waitingView(this.store);
      case 'offline':
        return offlineView(this.store);
      case 'ready':
        return readyView(this.store);
      default:
        return loadingView();
    }
  }
}

// ---------------------------------------------------------------------------------------------
// The views, one per phase

function topBar(...right: (Node | null)[]): HTMLElement {
  return el('header', { class: 'sp-top' }, el('span', { class: 'sp-top__logo', html: ICON.logo(30) }), el('b', { class: 'sp-top__name' }, 'Spotify'), el('span', { class: 'sp-top__spacer' }), ...right);
}

function loadingView(): View {
  const root = el('div', { class: 'sp-view sp-center' }, el('span', { class: 'co-spinner sp-spin', attrs: { 'aria-hidden': 'true' } }), el('p', { attrs: { role: 'status' } }, 'Opening Spotify…'));
  return { el: el('div', { class: 'sp-frame' }, topBar(), root), update() {} };
}

function offlineView(store: SpotifyStore): View {
  const why = el('p', { class: 'co-muted' });
  const retry = button('Try again', { kind: 'primary', small: true, onClick: () => void store.wake() });
  const root = el(
    'div',
    { class: 'sp-view sp-center' },
    el('span', { class: 'sp-bigicon', html: ICON.logo(56) }),
    el('h2', null, 'The office’s Spotify isn’t answering'),
    why,
    retry,
  );
  return {
    el: el('div', { class: 'sp-frame' }, topBar(), root),
    update(s) {
      why.textContent = s.setupError || 'Is the office still running?';
    },
    focus: () => retry.focus(),
  };
}

function setupView(store: SpotifyStore): View {
  const uri = el('code', { class: 'sp-uri' });
  const copy = button('Copy', { small: true });
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(uri.textContent ?? '');
      copy.lastChild!.textContent = 'Copied';
    } catch {
      // No clipboard here: select it for a manual copy.
      getSelection()?.selectAllChildren(uri);
    }
  });
  const field = el('input', {
    class: 'co-input sp-client',
    attrs: { type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', maxlength: 64, placeholder: '32 letters and numbers', 'aria-label': 'Client ID' },
  });
  const error = el('p', { class: 'sp-error', attrs: { role: 'alert' } });
  const signIn = button('Sign in with Spotify', { kind: 'primary' });
  signIn.classList.add('sp-signin');
  signIn.prepend(el('span', { html: ICON.logo(22) }));
  const go = () => {
    const id = field.value.trim();
    if (!SPOTIFY_CLIENT_ID.test(id)) {
      error.textContent = 'A Client ID is 32 letters and numbers. Copy it from your app’s Settings on developer.spotify.com.';
      field.focus();
      return;
    }
    error.textContent = '';
    // The sign-in window has to open inside the click (or the browser blocks it): a blank one
    // now, sent on to Spotify once the office has the address.
    const win = store.service.demo ? null : window.open('about:blank', 'claude-office-spotify', 'popup,width=520,height=780');
    // Spotify's pages never get a handle on the office (the sign-in comes back through the office server).
    if (win) win.opener = null;
    void store.signIn(id, win);
  };
  signIn.addEventListener('click', go);
  field.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.isComposing) go();
  });
  let filled = false;
  const step = (n: number, title: string, ...body: (Node | string | null)[]) =>
    el('li', { class: 'sp-step' }, el('span', { class: 'sp-step__n', attrs: { 'aria-hidden': 'true' } }, String(n)), el('div', { class: 'sp-step__body' }, el('b', null, title), ...body));
  const root = el(
    'div',
    { class: 'sp-view sp-setup' },
    el('h2', null, 'Connect Spotify'),
    el('p', { class: 'sp-lede' }, 'Play your own playlists through the office speakers. It takes a couple of minutes, once.'),
    el(
      'ol',
      { class: 'sp-steps' },
      step(1, 'Create an app at developer.spotify.com', el('a', { class: 'co-btn co-btn--small sp-link', attrs: { href: DASHBOARD, target: '_blank', rel: 'noopener noreferrer' } }, 'Open the dashboard')),
      step(2, 'Add this redirect URI', el('span', { class: 'sp-uri-row' }, uri, copy), el('small', null, 'Exactly this: 127.0.0.1, not localhost (Spotify refuses localhost).')),
      step(3, 'Tick Web API and Web Playback SDK', el('small', null, 'Under “Which API/SDKs are you planning to use?”, then Save.')),
      step(4, 'Paste the Client ID here', el('small', null, 'It’s on your app’s Settings page.'), field),
      step(5, 'Sign in', signIn, el('small', null, 'Playing music needs Spotify Premium.')),
    ),
    error,
  );
  return {
    el: el('div', { class: 'sp-frame' }, topBar(store.service.demo ? demoChip() : null), root),
    update(s) {
      uri.textContent = s.status?.redirectUri ?? `http://127.0.0.1:${location.port || '4777'}/callback`;
      if (!filled && store.clientId) {
        field.value = store.clientId;
        filled = true;
      }
      if (s.setupError) error.textContent = s.setupError;
    },
    focus: () => (field.value ? signIn : field).focus(),
  };
}

function waitingView(store: SpotifyStore): View {
  const again = el('a', { class: 'co-btn co-btn--small', attrs: { target: '_blank', rel: 'noopener noreferrer' } }, 'Open the Spotify window again');
  const cancel = button('Cancel', { small: true, kind: 'ghost', onClick: () => store.cancelSignIn() });
  const root = el(
    'div',
    { class: 'sp-view sp-center' },
    el('span', { class: 'co-spinner sp-spin', attrs: { 'aria-hidden': 'true' } }),
    el('h2', null, 'Finish signing in at Spotify'),
    el('p', { class: 'co-muted' }, store.service.demo ? 'Demo office: pretending you said yes…' : 'A Spotify window opened. Sign in there and say yes; the laptop notices by itself.'),
    el('div', { class: 'sp-row-buttons' }, again, cancel),
  );
  return {
    el: el('div', { class: 'sp-frame' }, topBar(), root),
    update(s) {
      again.hidden = !s.signInUrl;
      if (s.signInUrl) again.setAttribute('href', s.signInUrl);
    },
    focus: () => cancel.focus(),
  };
}

function demoChip(): HTMLElement {
  return el('span', { class: 'co-chip co-chip--plain sp-demo', attrs: { 'data-co-tip': 'The demo office: pretend playlists, and no sound' } }, 'Demo');
}

function readyView(store: SpotifyStore): View {
  // ------------------------------------------------------------------ top bar
  const who = el('span', { class: 'sp-top__who' });
  const signOut = button('Sign out', { small: true, kind: 'ghost', onClick: () => void store.signOut() });
  const top = topBar(who, store.service.demo ? demoChip() : null, signOut);

  // ------------------------------------------------------------------ playlists
  const nav = el('nav', { class: 'sp-lists', attrs: { 'aria-label': 'Your playlists' } });
  let navFor: Playlist[] | null = null;
  const navButtons = new Map<string, HTMLButtonElement>();
  const drawNav = (lists: Playlist[] | null) => {
    navFor = lists;
    navButtons.clear();
    if (!lists) {
      nav.replaceChildren(el('p', { class: 'sp-lists__wait' }, el('span', { class: 'co-spinner', attrs: { 'aria-hidden': 'true' } }), ' Your playlists…'));
      return;
    }
    nav.replaceChildren(
      ...lists.map((p) => {
        const b = el(
          'button',
          { class: 'sp-list', attrs: { type: 'button', 'data-id': p.id } },
          art(p),
          el('span', { class: 'sp-list__text' }, el('span', { class: 'sp-list__name' }, p.name), el('small', null, p.id === LIKED ? 'Your favourites' : p.listable ? `${p.total ?? '?'} songs` : `by ${p.owner}`)),
        );
        b.addEventListener('click', () => void store.select(p.id));
        navButtons.set(p.id, b);
        return b;
      }),
    );
  };

  // ------------------------------------------------------------------ the playlist on screen
  const headArt = el('span', { class: 'sp-head__art' });
  const headName = el('h2', { class: 'sp-head__name' });
  const headLine = el('p', { class: 'sp-head__line' });
  const playList = button('Play', { kind: 'primary' });
  playList.classList.add('sp-playlist');
  playList.prepend(el('span', { html: ICON.play(20) }));
  playList.addEventListener('click', () => {
    const list = store.list;
    if (list) void store.play(list);
  });
  const head = el('header', { class: 'sp-head' }, headArt, el('div', { class: 'sp-head__text' }, headName, headLine), playList);
  const note = el('p', { class: 'sp-note', attrs: { role: 'status' } });
  const rows = el('ol', { class: 'sp-rows', attrs: { 'aria-label': 'Songs' } });
  const more = el('p', { class: 'sp-more' });
  const tracksBox = el('section', { class: 'sp-tracks', attrs: { 'aria-label': 'Playlist' } }, head, note, rows, more);
  let rowsFor: unknown = undefined;
  let rowButtons: { b: HTMLButtonElement; t: Track }[] = [];
  const drawRows = (s: LaptopState, list: Playlist | null) => {
    rowsFor = s.tracks;
    rowButtons = [];
    rows.replaceChildren(
      ...(s.tracks?.tracks ?? []).map((t, i) => {
        const b = el(
          'button',
          { class: 'sp-row', attrs: { type: 'button', 'aria-label': `Play ${t.name} by ${t.artists}` } },
          el('span', { class: 'sp-row__n' }, el('span', { class: 'sp-row__num' }, String(i + 1)), el('span', { class: 'sp-eq', attrs: { 'aria-hidden': 'true' } }, el('i'), el('i'), el('i'))),
          el('span', { class: 'sp-row__text' }, el('span', { class: 'sp-row__name' }, t.name), el('small', null, t.artists)),
          el('span', { class: 'sp-row__dur' }, fmt(t.durationMs)),
        );
        b.addEventListener('click', () => {
          if (list) void store.play(list, i);
        });
        rowButtons.push({ b, t });
        return el('li', null, b);
      }),
    );
    const shown = s.tracks?.tracks.length ?? 0;
    more.textContent = s.tracks && s.tracks.total > shown ? `The first ${shown} of ${s.tracks.total} songs. Press Play for all of them.` : '';
  };

  // ------------------------------------------------------------------ notice
  const noticeText = el('span');
  const noticeClose = el('button', { class: 'sp-notice__close', attrs: { type: 'button', 'aria-label': 'OK' }, html: icon('close', 16) });
  noticeClose.addEventListener('click', () => store.dismissNotice());
  const notice = el('div', { class: 'sp-notice', attrs: { role: 'alert' } }, el('span', { class: 'sp-notice__icon', attrs: { 'aria-hidden': 'true' } }, '!'), noticeText, noticeClose);

  // ------------------------------------------------------------------ player bar
  const nowArt = el('span', { class: 'sp-now__art' });
  const nowName = el('b', { class: 'sp-now__name' });
  const nowArtist = el('small', { class: 'sp-now__artist' });
  const prev = roundButton('Previous', ICON.prev());
  const toggle = roundButton('Play', ICON.play(28), 'sp-round--play');
  const next = roundButton('Next', ICON.next());
  prev.addEventListener('click', () => void store.prev());
  next.addEventListener('click', () => void store.next());
  toggle.addEventListener('click', () => void store.toggle());
  const at = el('span', { class: 'sp-time' }, '0:00');
  const len = el('span', { class: 'sp-time' }, '0:00');
  const fill = el('i');
  const seek = el('div', { class: 'sp-seek', attrs: { role: 'slider', tabindex: 0, 'aria-label': 'Seek', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 0 } }, fill);
  seek.addEventListener('click', (ev) => {
    const r = seek.getBoundingClientRect();
    if (r.width > 0) void store.seek((ev.clientX - r.left) / r.width);
  });
  seek.addEventListener('keydown', (ev) => {
    const now = store.state.now;
    if (!now?.track || !now.durationMs || (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight')) return;
    ev.preventDefault();
    const pos = position(now) + (ev.key === 'ArrowRight' ? 10_000 : -10_000);
    void store.seek(pos / now.durationMs);
  });
  const volume = el('input', { class: 'co-range sp-volume', attrs: { type: 'range', min: 0, max: 100, step: 1, 'aria-label': 'Volume' } });
  volume.addEventListener('input', () => audio.setPref('musicVolume', Number(volume.value) / 100));
  const quiet = el('span', { class: 'sp-quiet' }, 'The office sound is off', button('Sound on', { small: true, onClick: () => audio.setMuted(false) }));
  const status = el('small', { class: 'sp-bar__status', attrs: { role: 'status' } });
  const bar = el(
    'footer',
    { class: 'sp-bar' },
    el('div', { class: 'sp-now' }, nowArt, el('span', { class: 'sp-now__text' }, nowName, nowArtist, status)),
    el('div', { class: 'sp-transport' }, el('div', { class: 'sp-buttons' }, prev, toggle, next), el('div', { class: 'sp-progress' }, at, seek, len)),
    el('div', { class: 'sp-side' }, quiet, el('label', { class: 'sp-vol' }, el('span', { html: icon('sound', 22) }), volume)),
  );

  const root = el('div', { class: 'sp-frame sp-frame--ready' }, top, notice, el('div', { class: 'sp-lib' }, nav, tracksBox), bar);
  let shownTrack = '';
  let headFor = '';
  let showsPause = false;

  return {
    el: root,
    update(s) {
      who.textContent = s.user ? `Hi, ${s.user}` : '';
      if (s.playlists !== navFor) drawNav(s.playlists);
      for (const [id, b] of navButtons) b.setAttribute('aria-current', String(id === s.selected));

      // The playlist on screen.
      const list = s.playlists?.find((p) => p.id === s.selected) ?? null;
      tracksBox.hidden = !list;
      if (list && headFor !== list.id) {
        headFor = list.id;
        headArt.replaceChildren(art(list, 'sp-art--big'));
        headName.textContent = list.name;
      }
      if (list) headLine.textContent = list.id === LIKED ? `${s.tracks?.total ?? list.total ?? '…'} songs you liked` : `by ${list.owner}${list.total !== null ? ` · ${list.total} songs` : ''}`;
      playList.disabled = !list || s.starting || (list.id === LIKED && !!s.tracks && !s.tracks.tracks.length);
      note.textContent = !list
        ? ''
        : s.loadingTracks
          ? 'Fetching the songs…'
          : !list.listable
            ? 'Spotify only lists the songs in playlists you made or collaborate on. This one plays all the same: press Play.'
            : s.tracksError || (s.tracks && !s.tracks.tracks.length ? 'No songs in here yet.' : '');
      note.hidden = !note.textContent;
      if (s.tracks !== rowsFor) drawRows(s, list);

      // The song playing, in its list.
      const now = s.now;
      const playingUri = now?.track?.uri ?? '';
      for (const { b, t } of rowButtons) {
        const on = t.uri === playingUri && (!list?.uri || now?.context === list.uri || !now?.context);
        b.classList.toggle('is-now', on);
        b.classList.toggle('is-paused', on && !!now?.paused);
        if (on) b.setAttribute('aria-current', 'true');
        else b.removeAttribute('aria-current');
      }

      // Notice.
      notice.hidden = !s.notice;
      noticeText.textContent = s.notice?.text ?? '';

      // Player bar.
      const t = now?.track ?? null;
      if (playingUri !== shownTrack) {
        shownTrack = playingUri;
        nowArt.replaceChildren(art(t ? { cover: t.cover } : null));
        nowName.textContent = t?.name ?? (s.device === 'ready' ? 'Pick a song' : '');
        nowArtist.textContent = t?.artists ?? '';
        nowName.title = t?.name ?? '';
        nowArtist.title = t?.artists ?? '';
      }
      if (!t) nowName.textContent = s.device === 'ready' || s.device === 'failed' ? 'Pick a song' : '';
      status.textContent = s.starting ? 'Starting…' : s.device === 'starting' && !t ? 'Getting the player ready…' : '';
      const playing = !!t && !now!.paused;
      if (playing !== showsPause) {
        showsPause = playing;
        toggle.innerHTML = playing ? ICON.pause(28) : ICON.play(28);
        toggle.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      }
      toggle.disabled = !t && !list;
      prev.disabled = !t || !now!.canPrev;
      next.disabled = !t || !now!.canNext;
      const pos = now ? position(now) : 0;
      const dur = now?.durationMs ?? 0;
      at.textContent = fmt(pos);
      len.textContent = fmt(dur);
      const pct = dur ? Math.min(100, (pos / dur) * 100) : 0;
      fill.style.width = `${pct}%`;
      seek.setAttribute('aria-valuenow', String(Math.round(pct)));
      seek.setAttribute('aria-valuetext', `${fmt(pos)} of ${fmt(dur)}`);
      seek.classList.toggle('is-off', !t);
      bar.classList.toggle('is-playing', playing);

      // Volume: the office's music volume (Help → Music volume is the same knob).
      const v = audio.prefs.musicVolume;
      if (document.activeElement !== volume) volume.value = String(Math.round(v * 100));
      volume.style.setProperty('--pct', `${Math.round(v * 100)}%`);
      volume.setAttribute('aria-valuetext', `${Math.round(v * 100)}%`);
      quiet.hidden = !audio.muted;
    },
    focus: () => {
      const b = navButtons.get(store.state.selected ?? '') ?? (nav.querySelector('button') as HTMLButtonElement | null);
      (b ?? toggle).focus();
    },
  };
}

/** Where the song is now: Spotify's last word, plus the time since if it's playing. */
function position(now: { positionMs: number; at: number; paused: boolean; durationMs: number }): number {
  const p = now.positionMs + (now.paused ? 0 : performance.now() - now.at);
  return Math.max(0, Math.min(p, now.durationMs || p));
}
