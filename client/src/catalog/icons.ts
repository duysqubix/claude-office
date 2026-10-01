// Inline SVG for the catalog: artist faces, placeholder silhouettes for planned models and
// small glyphs. Stickers, not hairlines: filled shapes with round ink strokes (docs/UX.md §4.3).
import { PALETTE } from '../style/palette';
import type { Artist, Silhouette } from './types';

const INK = PALETTE.ink;

/** An artist's little face, beret in their colour. Same face language as the game's logo. */
export function faceSvg(a: Artist): string {
  return `<svg viewBox="0 0 64 64">
  <circle cx="32" cy="38" r="21" fill="${a.skin}" stroke="${INK}" stroke-width="3.5"/>
  <ellipse cx="25" cy="38" rx="3.1" ry="4.4" fill="${INK}"/><ellipse cx="39" cy="38" rx="3.1" ry="4.4" fill="${INK}"/>
  <circle cx="26.2" cy="36.4" r="1.15" fill="#fff"/><circle cx="40.2" cy="36.4" r="1.15" fill="#fff"/>
  <circle cx="18.5" cy="45" r="3.4" fill="${PALETTE.cheek}" opacity=".85"/><circle cx="45.5" cy="45" r="3.4" fill="${PALETTE.cheek}" opacity=".85"/>
  <path d="M27.5 46.5q4.5 4 9 0" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
  <path d="M8.5 22.5C9 12 22 7.5 34 8.5s21 6.5 21.5 13.5c-6 3.8-17 5.2-27 4.6S10.5 25.3 8.5 22.5z" fill="${a.color}" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M30 8.8c.3-2.6 1.6-4.3 3.6-4.6" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>
</svg>`;
}

/** The Claude Office logo face (the game's HUD badge). */
export const LOGO = `<svg viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="27" fill="${PALETTE.claude}" stroke="${INK}" stroke-width="4"/>
  <ellipse cx="23.5" cy="29" rx="4" ry="6" fill="${INK}"/><ellipse cx="40.5" cy="29" rx="4" ry="6" fill="${INK}"/>
  <path d="M25 41q7 6 14 0" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
</svg>`;

/** Friendly cut-out shapes for models nobody has built yet. */
export const SILHOUETTE: Record<Silhouette, string> = {
  chair: `<svg viewBox="0 0 64 64" fill="currentColor"><rect x="17" y="6" width="30" height="26" rx="7"/><rect x="11" y="33" width="42" height="10" rx="5"/><rect x="29" y="42" width="6" height="11"/><rect x="12" y="52" width="40" height="6" rx="3"/><circle cx="14" cy="60" r="3"/><circle cx="50" cy="60" r="3"/><circle cx="32" cy="60" r="3"/></svg>`,
  table: `<svg viewBox="0 0 64 64" fill="currentColor"><rect x="4" y="20" width="56" height="10" rx="5"/><rect x="10" y="28" width="8" height="30" rx="3"/><rect x="46" y="28" width="8" height="30" rx="3"/></svg>`,
  lamp: `<svg viewBox="0 0 64 64" fill="currentColor"><path d="M22 6h20c2 0 3 1 3.6 2.6L53 28c.6 1.8-.6 3-2.4 3H13.4c-1.8 0-3-1.2-2.4-3l7.4-19.4C19 7 20 6 22 6z"/><rect x="29" y="30" width="6" height="22"/><rect x="17" y="51" width="30" height="8" rx="4"/></svg>`,
  screen: `<svg viewBox="0 0 64 64" fill="currentColor"><rect x="5" y="8" width="54" height="36" rx="7"/><rect x="28" y="43" width="8" height="9"/><rect x="17" y="51" width="30" height="7" rx="3.5"/></svg>`,
  mug: `<svg viewBox="0 0 64 64" fill="currentColor"><path d="M12 18h32v27c0 7-5 12-12 12H24c-7 0-12-5-12-12z"/><path d="M44 24h5c5 0 9 4 9 8.5S54 41 49 41h-5v-6.5h5a2.2 2.2 0 0 0 0-4.5h-5z"/><path d="M22 4c3 3-2 6 1 9M31 3c3 3-2 6 1 9" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/></svg>`,
  tree: `<svg viewBox="0 0 64 64" fill="currentColor"><circle cx="32" cy="22" r="16"/><circle cx="19" cy="31" r="11"/><circle cx="45" cy="31" r="11"/><circle cx="32" cy="34" r="12"/><rect x="28" y="38" width="8" height="20" rx="3"/><rect x="18" y="56" width="28" height="5" rx="2.5"/></svg>`,
  cloud: `<svg viewBox="0 0 64 64" fill="currentColor"><circle cx="21" cy="36" r="12"/><circle cx="35" cy="27" r="15"/><circle cx="48" cy="37" r="11"/><rect x="11" y="36" width="45" height="12" rx="6"/></svg>`,
  board: `<svg viewBox="0 0 64 64" fill="currentColor"><rect x="7" y="6" width="50" height="36" rx="5"/><path d="M17 41h6l-5 19h-6zM41 41h6l5 19h-6z"/></svg>`,
  person: `<svg viewBox="0 0 64 64" fill="currentColor"><circle cx="32" cy="20" r="14"/><path d="M15 60c0-14 7.5-24 17-24s17 10 17 24z"/></svg>`,
  box: `<svg viewBox="0 0 64 64" fill="currentColor"><path d="M8 22 32 12l24 10v24L32 57 8 46z"/><path d="M8 22 32 32l24-10M32 32v25M20 17l24 10" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="2.5" stroke-linejoin="round"/></svg>`,
};

const SHAPE_HINTS: [RegExp, Silhouette][] = [
  [/cloud|balloon/, 'cloud'],
  [/tree|bush|plant|flower|hedge|cactus|succulent|palm|fern|monstera|grass|planter/, 'tree'],
  [/chair|stool|couch|bench|beanbag|nap_pod/, 'chair'],
  [/lamp/, 'lamp'],
  [/monitor|^tv|laptop|arcade|phone|calculator|screen/, 'screen'],
  [/desk|table|counter|bar$/, 'table'],
  [/mug|cup|bottle|drink|jar/, 'mug'],
  [/board|partition|wall|flipchart|frame|poster|sign|calendar|plaque|month|banner|window|door/, 'board'],
  [/^(char_|hair_|hat_|preset_|glasses|sunglasses|mustache|beard|headband|headphones|headset|bow_tie|scarf|cape|legs_)/, 'person'],
];

/** Placeholder shape for a planned model: a guess from its id, else its artist's usual shape. */
export function silhouetteFor(id: string, fallback: Silhouette): string {
  return SILHOUETTE[SHAPE_HINTS.find(([re]) => re.test(id))?.[1] ?? fallback];
}

const stroke = `fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"`;

export const ICON = {
  check: `<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" ${stroke} stroke-width="3.2"/></svg>`,
  copy: `<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="3" ${stroke}/><path d="M16 5.5A2.5 2.5 0 0 0 13.5 3H6a3 3 0 0 0-3 3v7.5A2.5 2.5 0 0 0 5.5 16" ${stroke}/></svg>`,
  close: `<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" ${stroke} stroke-width="3.4"/></svg>`,
  search: `<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5" ${stroke} stroke-width="3"/><path d="m15.5 15.5 5 5" ${stroke} stroke-width="3.4"/></svg>`,
  person: `<svg viewBox="0 0 24 24"><circle cx="12" cy="6.5" r="3.6" fill="currentColor"/><path d="M5.5 21c0-5.6 2.9-9.5 6.5-9.5s6.5 3.9 6.5 9.5z" fill="currentColor"/></svg>`,
  wire: `<svg viewBox="0 0 24 24"><path d="M12 3 20 7.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12 4 7.5" ${stroke} stroke-width="2.2"/></svg>`,
  spin: `<svg viewBox="0 0 24 24"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" ${stroke} stroke-width="2.8"/><path d="M18.5 3.5v4h-4" ${stroke} stroke-width="2.8"/></svg>`,
  pin: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><circle cx="12" cy="12" r="8.5" ${stroke} stroke-width="2.2"/></svg>`,
  reset: `<svg viewBox="0 0 24 24"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" ${stroke} stroke-width="2.8"/><path d="M5.5 3.5v4h4" ${stroke} stroke-width="2.8"/></svg>`,
  download: `<svg viewBox="0 0 24 24"><path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" ${stroke} stroke-width="2.8"/></svg>`,
  drop: `<svg viewBox="0 0 24 24"><path d="M12 3.5C9 8 6.5 10.8 6.5 14a5.5 5.5 0 0 0 11 0c0-3.2-2.5-6-5.5-10.5z" fill="currentColor"/></svg>`,
  cube: `<svg viewBox="0 0 64 64" fill="currentColor"><path d="M32 6 56 18v28L32 58 8 46V18z" opacity=".55"/><path d="M32 30 56 18v28L32 58z"/></svg>`,
};

/** The "New!" starburst stuck on freshly built models. */
export const STARBURST = (() => {
  const pts: string[] = [];
  for (let i = 0; i < 28; i++) {
    const r = i % 2 ? 23 : 31;
    const a = (i / 28) * Math.PI * 2 - Math.PI / 2;
    pts.push(`${(32 + Math.cos(a) * r).toFixed(1)},${(32 + Math.sin(a) * r).toFixed(1)}`);
  }
  return `<svg viewBox="0 0 64 64"><polygon points="${pts.join(' ')}" fill="${PALETTE.shirts[2]}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><text x="32" y="37" text-anchor="middle" font-family="Fredoka, ui-rounded, sans-serif" font-weight="700" font-size="15" fill="${INK}">New!</text></svg>`;
})();
