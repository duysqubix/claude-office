// Inline SVG icons (UX.md §4.3): no icon fonts, no emoji.
// - State glyphs are solid ink shapes that sit inside a state-coloured disc (the colour-blind contract).
// - UI icons are stickers: flat palette fills with a 2 px ink outline and round joins.
import type { EmployeeState } from '../../../shared/protocol';
import { esc, markup, type Markup } from './el';

const INK = '#2B2D42';
const PAPER = '#FFFDF7';
const PAPER_2 = '#F3EBDA';
const SKY = '#5CC8FF';
const YELLOW = '#FFC94A';
const MINT = '#8FE0C8';
const MANILA = '#F6B76E';
const CORAL = '#FF7A6B';
const GREEN = '#4ADE80';

const S = `stroke="${INK}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;

const GLYPHS: Record<EmployeeState, string> = {
  working: `<path d="M13.6 2 4.6 13.6h6.2L9.2 22l10.2-12.1h-6.3L15.2 2z" fill="${INK}"/>`,
  'needs-you': `<rect x="9.7" y="2.5" width="4.6" height="12.5" rx="2.3" fill="${INK}"/><circle cx="12" cy="19.4" r="2.5" fill="${INK}"/>`,
  idle: `<path d="M4.5 12.8 9.6 17.8 19.6 6.6" fill="none" stroke="${INK}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  sleeping: `<path d="M6.5 5.5h11L6.5 18.5h11" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`,
  starting: `<circle cx="5.5" cy="12" r="2.4" fill="${INK}"/><circle cx="12" cy="12" r="2.4" fill="${INK}"/><circle cx="18.5" cy="12" r="2.4" fill="${INK}"/>`,
};

/** The user-facing word for each state (UX.md §5: "free", never "idle"). */
export const STATE_WORD: Record<EmployeeState, string> = {
  working: 'Working',
  'needs-you': 'Needs you',
  idle: 'Free',
  sleeping: 'Asleep',
  starting: 'Starting',
};

export function stateGlyph(state: EmployeeState, size = 12): Markup {
  return markup(`<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${GLYPHS[state] ?? GLYPHS.starting}</svg>`);
}

/** The round state badge used in pills, chips and rows: state colour + ink glyph. */
export function stateBadge(state: EmployeeState, large = false): Markup {
  const word = STATE_WORD[state] ?? 'Unknown';
  return markup(
    `<span class="co-badge${large ? ' co-badge--lg' : ''}" data-state="${esc(state)}" role="img" aria-label="${word}">${stateGlyph(state, large ? 14 : 12)}</span>`,
  );
}

const ICONS = {
  roster: `<rect x="4" y="4" width="16" height="18" rx="3" fill="${MINT}" ${S}/><rect x="8" y="2" width="8" height="5" rx="2" fill="${PAPER}" ${S}/><path d="M8 12h8M8 16h5" ${S}/>`,
  hire: `<path d="M5.5 17.5c.4-6.6 2.5-10.3 6.5-10.3s6.1 3.7 6.5 10.3z" fill="${YELLOW}" ${S}/><rect x="3.5" y="17" width="17" height="3.5" rx="1.75" fill="${YELLOW}" ${S}/><circle cx="12" cy="5" r="1.7" fill="${YELLOW}" ${S}/>`,
  sound: `<path d="M3.5 9.5h4l5-4.5v14l-5-4.5h-4z" fill="${PAPER}" ${S}/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.2 6.4a7.8 7.8 0 0 1 0 11.2" fill="none" ${S}/>`,
  soundOff: `<path d="M3.5 9.5h4l5-4.5v14l-5-4.5h-4z" fill="${PAPER_2}" ${S}/><path d="M16 9.5l5 5M21 9.5l-5 5" fill="none" ${S}/>`,
  help: `<circle cx="12" cy="12" r="9.5" fill="${SKY}" ${S}/><path d="M9.4 9.6a2.6 2.6 0 1 1 3.7 2.4c-.8.4-1.1.9-1.1 1.8" fill="none" ${S} stroke-width="2.2"/><circle cx="12" cy="17.1" r="1.3" fill="${INK}"/>`,
  close: `<path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`,
  folder: `<path d="M3 7.2A2.2 2.2 0 0 1 5.2 5h4.1l2 2.2h7.5A2.2 2.2 0 0 1 21 9.4v8.4a2.2 2.2 0 0 1-2.2 2.2H5.2A2.2 2.2 0 0 1 3 17.8z" fill="${MANILA}" ${S}/>`,
  branch: `<path d="M7.5 8.3v7.4M16.5 10.3c0 4.3-5.6 3.1-8.4 5.7" fill="none" ${S}/><circle cx="7.5" cy="6" r="2.4" fill="${PAPER}" ${S}/><circle cx="7.5" cy="18" r="2.4" fill="${PAPER}" ${S}/><circle cx="16.5" cy="8" r="2.4" fill="${PAPER}" ${S}/>`,
  model: `<path d="M9 3.5v3M15 3.5v3M9 17.5v3M15 17.5v3M3.5 9h3M3.5 15h3M17.5 9h3M17.5 15h3" fill="none" ${S}/><rect x="6.5" y="6.5" width="11" height="11" rx="2.5" fill="${SKY}" ${S}/>`,
  clock: `<circle cx="12" cy="12" r="9.5" fill="${PAPER}" ${S}/><path d="M12 7v5.2l3.2 2" fill="none" ${S}/>`,
  coin: `<circle cx="12" cy="12" r="9.5" fill="${YELLOW}" ${S}/><circle cx="12" cy="12" r="5.6" fill="none" ${S}/>`,
  staff: `<circle cx="12" cy="8" r="4.2" fill="${PAPER}" ${S}/><path d="M4.5 20.5c0-4.6 3.4-7.2 7.5-7.2s7.5 2.6 7.5 7.2z" fill="${PAPER}" ${S}/>`,
  intern: `<circle cx="12" cy="9.5" r="4" fill="${PAPER}" ${S}/><path d="M7.8 8.6a4.3 4.3 0 0 1 8.4 0z M16 8.6l3.6.6" fill="${CORAL}" ${S}/><path d="M5.5 21c0-4.2 2.9-6.6 6.5-6.6s6.5 2.4 6.5 6.6z" fill="${PAPER}" ${S}/>`,
  sun: `<path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" fill="none" ${S}/><circle cx="12" cy="12" r="5" fill="${YELLOW}" ${S}/>`,
  moon: `<path d="M15.6 3.6a8.6 8.6 0 1 0 4.8 14.6 7 7 0 0 1-4.8-14.6z" fill="${PAPER_2}" ${S}/>`,
  check: `<circle cx="12" cy="12" r="9.5" fill="${GREEN}" ${S}/><path d="M7.6 12.4l3 3 5.8-6.4" fill="none" ${S} stroke-width="2.4"/>`,
  send: `<path d="M3 11.2 21 3l-6.4 18-3.2-7.6z" fill="${PAPER}" ${S}/><path d="M11.4 13.4 21 3" fill="none" ${S}/>`,
  copy: `<rect x="8" y="8" width="12" height="12" rx="2.5" fill="${PAPER}" ${S}/><path d="M16 5.5V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h.5" fill="none" ${S}/>`,
  plan: `<rect x="4" y="3" width="16" height="18" rx="3" fill="${PAPER}" ${S}/><path d="M8 8h8M8 12h8M8 16h5" fill="none" ${S}/>`,
  chat: `<path d="M4 6.5A3.5 3.5 0 0 1 7.5 3h9A3.5 3.5 0 0 1 20 6.5v6a3.5 3.5 0 0 1-3.5 3.5H11l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5z" fill="${SKY}" ${S}/><circle cx="8.6" cy="9.6" r="1.2" fill="${INK}"/><circle cx="12" cy="9.6" r="1.2" fill="${INK}"/><circle cx="15.4" cy="9.6" r="1.2" fill="${INK}"/>`,
  question: `<path d="M4 6.5A3.5 3.5 0 0 1 7.5 3h9A3.5 3.5 0 0 1 20 6.5v6a3.5 3.5 0 0 1-3.5 3.5H11l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5z" fill="${PAPER}" ${S}/><path d="M10.2 8a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.8.6-.8 1.2" fill="none" ${S}/><circle cx="12" cy="13.3" r="1" fill="${INK}"/>`,
  terminal: `<rect x="2.5" y="4" width="19" height="16" rx="3" fill="${INK}" ${S}/><path d="M6.5 9l3 3-3 3M11.5 15h5" fill="none" stroke="${PAPER}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  pencil: `<path d="M4 20l1.2-4.6L15.6 5a2.1 2.1 0 0 1 3 0l.4.4a2.1 2.1 0 0 1 0 3L8.6 18.8z" fill="${YELLOW}" ${S}/><path d="M13.8 6.8l3.4 3.4" fill="none" ${S}/>`,
  globe: `<circle cx="12" cy="12" r="9.5" fill="${SKY}" ${S}/><path d="M2.5 12h19M12 2.5c2.8 2.6 4.2 5.8 4.2 9.5s-1.4 6.9-4.2 9.5c-2.8-2.6-4.2-5.8-4.2-9.5s1.4-6.9 4.2-9.5z" fill="none" ${S}/>`,
  stop: `<rect x="4" y="4" width="16" height="16" rx="4" fill="${CORAL}" ${S}/><rect x="9" y="9" width="6" height="6" rx="1.2" fill="${INK}"/>`,
} as const;

export type IconName = keyof typeof ICONS;

/** A sticker icon as markup. Pass `label` when the icon carries meaning on its own. */
export function icon(name: IconName, size = 24, label?: string): Markup {
  const a11y = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"';
  return markup(`<svg class="co-icon" viewBox="0 0 24 24" width="${size}" height="${size}" ${a11y}>${ICONS[name]}</svg>`);
}
