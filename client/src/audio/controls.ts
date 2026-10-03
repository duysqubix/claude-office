// Help → Music and sound: the café music switch and the music and sound-effect volumes, all
// saved per browser (audio/index.ts). Built from the co- styles, so it sits with the other
// Help switches.
import { el } from '../ui/el';
import { audio, type AudioPrefs } from './index';

const pct = (v: number) => `${Math.round(v * 100)}%`;

function slider(label: string, key: 'musicVolume' | 'sfxVolume'): { row: HTMLElement; sync(): void } {
  const input = el('input', { class: 'co-range', attrs: { type: 'range', min: 0, max: 100, step: 1, 'aria-label': label } });
  const out = el('output', { class: 'co-range__value' });
  const sync = () => {
    const v = audio.prefs[key];
    if (document.activeElement !== input) input.value = String(Math.round(v * 100));
    out.textContent = pct(v);
    input.setAttribute('aria-valuetext', pct(v));
    // How much of the track is filled (theme.css draws it).
    input.style.setProperty('--pct', pct(v));
  };
  input.addEventListener('input', () => {
    audio.setPref(key, Number(input.value) / 100);
    sync();
  });
  const row = el('label', { class: 'co-range-row' }, el('span', { class: 'co-range__label' }, label), input, out);
  sync();
  return { row, sync };
}

/**
 * The section, live: it follows changes made elsewhere (M, another tab). Pass the panel's
 * `signal` and it lets go the moment the panel closes.
 */
export function soundSettings(opts: { signal?: AbortSignal } = {}): HTMLElement {
  const music = el('input', { attrs: { type: 'checkbox' } });
  music.addEventListener('change', () => audio.setPref('music', music.checked));
  const musicVol = slider('Music volume', 'musicVolume');
  const sfxVol = slider('Sound effects', 'sfxVolume');
  const note = el('p', { class: 'co-muted co-sound__note', attrs: { 'aria-live': 'polite' } });
  const root = el(
    'div',
    { class: 'co-sound' },
    el('h3', { class: 'co-section' }, 'Music and sound'),
    el(
      'label',
      { class: 'co-choice co-choice--toggle' },
      music,
      el('span', null, 'Music', el('small', null, 'Coffee-shop tunes, made up as they play. Softer and slower after 9 pm, and a little quieter while you type to someone.')),
    ),
    musicVol.row,
    sfxVol.row,
    note,
  );
  const sync = () => {
    const p: Readonly<AudioPrefs> = audio.prefs;
    music.checked = p.music;
    musicVol.sync();
    sfxVol.sync();
    const now = audio.nowPlaying;
    note.textContent = p.muted
      ? 'All sound is off. Press M to turn it back on.'
      : !audio.unlocked
        ? 'Click anywhere to turn on sound.'
        : now.by === 'external'
          ? `Playing from ${now.label}.`
          : 'M turns all sound off and on.';
  };
  sync();
  // Live while it's on screen. It lets go when the panel's signal aborts, or (without one) at
  // the first change after it has left the page.
  let shown = false;
  const off = audio.subscribe(() => {
    if (root.isConnected) {
      shown = true;
      sync();
    } else if (shown) off();
  });
  opts.signal?.addEventListener('abort', off, { once: true });
  return root;
}
