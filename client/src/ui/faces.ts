// Little portraits for the 2D UI (UX.md §4.3): the same person as their 3D rig (chars/rig.ts:
// sphere head, glossy eyes with catchlights, pink cheeks, small smile, the same hair or hat),
// drawn as an SVG string on a disc of their shirt colour. Used in pills, rows, toasts, edge
// markers, the HUD logo and the favicon.
import type { Looks } from '../chars/looks';
import { employeeLooks, internLooks, managerLooks } from '../chars/looks';
import { PALETTE, hash32 } from '../style/palette';
import { esc, markup, type Markup } from './el';

const DEEP = '#1E1B2E';

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)) as [number, number, number];
}

/** Mix two hex colours: t = 0 → a, t = 1 → b. */
export function mix(a: string, b: string, t: number): string {
  const ca = rgb(a);
  const cb = rgb(b);
  return '#' + ca.map((c, i) => Math.round(c + (cb[i] - c) * t).toString(16).padStart(2, '0')).join('');
}

const darken = (hex: string, f: number) => mix(hex, DEEP, f);

function luma(hex: string): number {
  const [r, g, b] = rgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

// Face layout in a 64 × 64 box: head centre (32, 29), radius 17.5, the rig's proportions scaled.
const HX = 32;
const HY = 29;
const HR = 17.5;

/** Hair or hat pieces that sit behind the head (drawn first). */
function backHair(l: Looks, hair: string, hairEdge: string): string {
  const s = `stroke="${hairEdge}" stroke-width="1.4" stroke-linejoin="round"`;
  switch (l.hairStyle) {
    case 'bob':
      return `<path d="M12.8 30C12.4 40 14 45.5 19.5 45.5h25c5.5 0 7.1-5.5 6.7-15.5A19.2 19.2 0 0 0 12.8 30z" fill="${hair}" ${s}/>`;
    case 'bun':
      return `<circle cx="32" cy="9.4" r="6.6" fill="${hair}" ${s}/>`;
    default:
      return '';
  }
}

/** Hair or hat pieces in front of the head. */
function frontHair(l: Looks, hair: string, hairEdge: string, hat: string, hatEdge: string, hatDark: string): string {
  const hs = `stroke="${hairEdge}" stroke-width="1.4" stroke-linejoin="round"`;
  const ts = `stroke="${hatEdge}" stroke-width="1.4" stroke-linejoin="round"`;
  const topCap = (d: string) => `<path d="${d}" fill="${hair}" ${hs}/>`;
  switch (l.hairStyle) {
    case 'tuft':
      return (
        `<ellipse cx="27.8" cy="12.4" rx="2.7" ry="4.9" transform="rotate(-38 27.8 12.4)" fill="${hair}" ${hs}/>` +
        `<ellipse cx="36.2" cy="12.4" rx="2.7" ry="4.9" transform="rotate(38 36.2 12.4)" fill="${hair}" ${hs}/>` +
        `<ellipse cx="32" cy="10.2" rx="3.4" ry="6.4" transform="rotate(-12 32 10.2)" fill="${hair}" ${hs}/>`
      );
    case 'bob':
      return (
        topCap('M13.4 29A18.7 18.7 0 0 1 50.6 29C47 21 40 18.6 32 18.8C22.6 19 16 22 13.4 29z') +
        `<ellipse cx="36" cy="19.4" rx="9.6" ry="3.6" transform="rotate(-16 36 19.4)" fill="${hair}" ${hs}/>`
      );
    case 'cap':
    case 'capBack': {
      const dome = `<path d="M14.4 22.6A18.6 18.6 0 0 1 49.6 22.6z" fill="${hat}" ${ts}/>`;
      const button = `<circle cx="32" cy="10.6" r="1.7" fill="${hat}" ${ts} stroke-width="1"/>`;
      if (l.hairStyle === 'capBack') return dome + `<path d="M24 22.6h16" stroke="${hatDark}" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>` + button;
      return (
        dome +
        `<ellipse cx="32" cy="25.4" rx="12.5" ry="1.8" fill="${DEEP}" opacity=".18"/>` +
        `<ellipse cx="32" cy="23.2" rx="14.6" ry="3.8" fill="${hat}" ${ts}/>` +
        button
      );
    }
    case 'beanie':
      return (
        `<path d="M13 24.5C13 9 22 5.6 32 5.6S51 9 51 24.5z" fill="${hat}" ${ts}/>` +
        `<rect x="12" y="20.4" width="40" height="7.6" rx="3.8" fill="${hatDark}" ${ts}/>` +
        `<circle cx="32" cy="5.4" r="4.6" fill="${hatDark}" ${ts}/>`
      );
    case 'bun':
      return (
        topCap('M13.6 28A18.6 18.6 0 0 1 50.4 28C47 19.6 40 19.4 32 19.8C24 19.4 17 19.6 13.6 28z') +
        `<ellipse cx="23.6" cy="21.2" rx="5" ry="2.3" transform="rotate(28 23.6 21.2)" fill="${hair}" ${hs}/>` +
        `<ellipse cx="40.4" cy="21.2" rx="5" ry="2.3" transform="rotate(-28 40.4 21.2)" fill="${hair}" ${hs}/>` +
        `<ellipse cx="32" cy="12.2" rx="4.4" ry="1.7" fill="${hat}" ${ts}/>`
      );
    case 'headphones':
      return (
        topCap('M13.6 28A18.6 18.6 0 0 1 50.4 28C47 20.4 40 19.6 32 20C24 19.6 17 20.4 13.6 28z') +
        `<path d="M12.4 27A19.6 19.6 0 0 1 51.6 27" fill="none" stroke="${hatEdge}" stroke-width="5" stroke-linecap="round"/>` +
        `<path d="M12.4 27A19.6 19.6 0 0 1 51.6 27" fill="none" stroke="${hatDark}" stroke-width="2.4" stroke-linecap="round"/>` +
        `<rect x="8.2" y="21.6" width="8.4" height="14.4" rx="4.2" fill="${hat}" ${ts}/>` +
        `<rect x="47.4" y="21.6" width="8.4" height="14.4" rx="4.2" fill="${hat}" ${ts}/>`
      );
    case 'slick':
      return (
        topCap('M13.6 27A18.6 18.6 0 0 1 50.4 27C47 20.6 40 19.6 32 20C23 20.4 17 21.6 13.6 27z') +
        `<ellipse cx="35.6" cy="14.2" rx="10.4" ry="4.4" transform="rotate(-14 35.6 14.2)" fill="${hair}" ${hs}/>`
      );
    case 'bald':
      return '';
  }
}

function shoulders(l: Looks): string {
  const edge = darken(l.shirt, 0.28);
  let s = `<rect x="28.4" y="40" width="7.2" height="12" rx="3" fill="${darken(l.skin, 0.12)}"/>`;
  s += `<ellipse cx="32" cy="67" rx="26" ry="17.5" fill="${l.shirt}" stroke="${edge}" stroke-width="1.6"/>`;
  if (l.tie) {
    const collar = '#F4F6FA';
    const tieEdge = darken(PALETTE.managerTie, 0.3);
    s +=
      `<path d="M23.8 51.2 32 56l-3.3-6.2z" fill="${collar}" stroke="${edge}" stroke-width="1.2" stroke-linejoin="round"/>` +
      `<path d="M40.2 51.2 32 56l3.3-6.2z" fill="${collar}" stroke="${edge}" stroke-width="1.2" stroke-linejoin="round"/>` +
      `<path d="M30.2 55.4h3.6l1.5 8.6-3.3 3-3.3-3z" fill="${PALETTE.managerTie}" stroke="${tieEdge}" stroke-width="1.2" stroke-linejoin="round"/>`;
  } else if (l.lanyard) {
    s += `<path d="M24.5 50.6 32 60.5l7.5-9.9" fill="none" stroke="${PALETTE.claude}" stroke-width="1.8" stroke-linecap="round"/>`;
  }
  return s;
}

function face(l: Looks): string {
  const eye = PALETTE.eye;
  let s = '';
  // Cheeks, eyes with the rig's two catchlights, the small smile.
  for (const side of [-1, 1]) {
    s += `<ellipse cx="${HX + side * 10.3}" cy="${HY + 4.2}" rx="3.1" ry="2.1" fill="${PALETTE.cheek}" opacity=".6"/>`;
  }
  for (const side of [-1, 1]) {
    const x = HX + side * 5.8;
    s +=
      `<ellipse cx="${x}" cy="${HY}" rx="2.45" ry="3.6" fill="${eye}"/>` +
      `<circle cx="${x + 0.8}" cy="${HY - 1.4}" r="0.95" fill="#fff"/>` +
      `<circle cx="${x - 0.7}" cy="${HY + 1.3}" r="0.45" fill="#fff"/>`;
  }
  s += `<path d="M29.5 ${HY + 6.6}Q32 ${HY + 8.9} 34.5 ${HY + 6.6}" fill="none" stroke="${PALETTE.mouth}" stroke-width="1.5" stroke-linecap="round"/>`;
  if (l.glasses) {
    const g = l.glassesColor;
    s +=
      `<path d="M23.2 28.4 14.6 27.4M40.8 28.4l8.6-1" stroke="${g}" stroke-width="1.4" stroke-linecap="round"/>` +
      `<circle cx="${HX - 5.9}" cy="${HY + 0.2}" r="4.6" fill="rgba(255,255,255,.18)" stroke="${g}" stroke-width="1.7"/>` +
      `<circle cx="${HX + 5.9}" cy="${HY + 0.2}" r="4.6" fill="rgba(255,255,255,.18)" stroke="${g}" stroke-width="1.7"/>` +
      `<path d="M30.4 28.6Q32 27.4 33.6 28.6" fill="none" stroke="${g}" stroke-width="1.4" stroke-linecap="round"/>`;
  }
  return s;
}

export interface FaceOptions {
  /** Pixel size (square). Default 40. */
  size?: number;
  /** Accessible name; omit for decorative faces next to a visible name. */
  title?: string;
}

/** A portrait of whoever has these looks, as SVG markup. Same looks and size → the same string. */
export function faceSvg(looks: Looks, opts: FaceOptions = {}): Markup {
  const size = opts.size ?? 40;
  // Every face clips to the same circle, so a deterministic id is safe even when it repeats.
  const id = `co-face-${hash32(`${looks.skin}${looks.shirt}${looks.hair}${looks.hairStyle}${looks.hatColor}${looks.glasses}${looks.tie}${size}`).toString(36)}`;
  const bg = luma(looks.shirt) > 0.86 ? '#D9E6F5' : mix(looks.shirt, PALETTE.paper, 0.58);
  const hair = looks.hair;
  const hairEdge = darken(hair, 0.32);
  const hat = looks.hatColor;
  const hatEdge = darken(hat, 0.3);
  const hatDark = darken(hat, 0.45);
  const skinEdge = darken(looks.skin, 0.3);
  const a11y = opts.title ? `role="img" aria-label="${esc(opts.title)}"` : 'aria-hidden="true"';
  return markup(
    `<svg viewBox="0 0 64 64" width="${size}" height="${size}" ${a11y}>` +
    `<defs><clipPath id="${id}"><circle cx="32" cy="32" r="32"/></clipPath></defs>` +
    `<g clip-path="url(#${id})">` +
    `<rect width="64" height="64" fill="${bg}"/>` +
    backHair(looks, hair, hairEdge) +
    shoulders(looks) +
    `<circle cx="${HX}" cy="${HY}" r="${HR}" fill="${looks.skin}" stroke="${skinEdge}" stroke-width="1.4"/>` +
    `<ellipse cx="25.6" cy="20.4" rx="5.4" ry="3.2" fill="#fff" opacity=".2"/>` +
    face(looks) +
    frontHair(looks, hair, hairEdge, hat, hatEdge, hatDark) +
    `</g></svg>`
  );
}

/** Portrait for an employee, from the same deterministic looks the 3D rig uses. */
export function employeeFace(sessionId: string, hosted: boolean, opts?: FaceOptions): Markup {
  return faceSvg(employeeLooks(sessionId, hosted), opts);
}

/** Interns wear their boss's shirt colour on their cap (chars/intern.ts), so pass it. */
export function internFace(internId: string, bossColor?: string, opts?: FaceOptions): Markup {
  return faceSvg(internLooks(internId, bossColor), opts);
}

export function managerFace(opts?: FaceOptions): Markup {
  return faceSvg(managerLooks(), opts);
}

// ------------------------------------------------------------------ logo, favicon, tab title

/** The office logo: a happy face on a Claude-orange disc; `alert` adds the amber "!" dot. */
export function logoSvg(alert = false, size = 32): Markup {
  const skin = '#FFDDBB';
  const dot = alert
    ? `<circle cx="50" cy="14" r="12" fill="${PALETTE.stateNeedsYou}" stroke="${PALETTE.ink}" stroke-width="3.5"/>` +
      `<rect x="48.2" y="6.6" width="3.6" height="9.4" rx="1.8" fill="${PALETTE.ink}"/><circle cx="50" cy="19.6" r="2" fill="${PALETTE.ink}"/>`
    : '';
  return markup(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">` +
    `<circle cx="32" cy="32" r="29.5" fill="${PALETTE.claude}" stroke="${PALETTE.ink}" stroke-width="4"/>` +
    `<circle cx="32" cy="33" r="17" fill="${skin}" stroke="${darken(skin, 0.3)}" stroke-width="1.6"/>` +
    `<ellipse cx="21.8" cy="37" rx="3.1" ry="2.1" fill="${PALETTE.cheek}" opacity=".7"/><ellipse cx="42.2" cy="37" rx="3.1" ry="2.1" fill="${PALETTE.cheek}" opacity=".7"/>` +
    `<ellipse cx="26.4" cy="32" rx="2.6" ry="3.8" fill="${PALETTE.eye}"/><ellipse cx="37.6" cy="32" rx="2.6" ry="3.8" fill="${PALETTE.eye}"/>` +
    `<circle cx="27.3" cy="30.5" r="1" fill="#fff"/><circle cx="38.5" cy="30.5" r="1" fill="#fff"/>` +
    `<path d="M28.6 39.4Q32 42.4 35.4 39.4" fill="none" stroke="${PALETTE.mouth}" stroke-width="2" stroke-linecap="round"/>` +
    dot +
    `</svg>`
  );
}

export function svgDataUrl(svg: string): string {
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

let lastTabCount = -1;

/**
 * Tab title and favicon while people wait (UX.md §2): "(2) Claude Office" and an amber dot.
 * Cheap to call every roster update; it only touches the DOM when the count changes.
 */
export function setTabAlert(needsYou: number, base = 'Claude Office'): void {
  const n = Math.max(0, Math.floor(needsYou));
  if (n === lastTabCount) return;
  lastTabCount = n;
  document.title = n > 0 ? `(${n}) ${base}` : base;
  let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.append(link);
  }
  link.href = svgDataUrl(logoSvg(n > 0, 64));
}
