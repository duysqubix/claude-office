// Deterministic character looks. The same session id always gets the same person.
import { PALETTE, hash32, pick } from '../style/palette';

export type HairStyle = 'tuft' | 'bob' | 'cap' | 'beanie' | 'bun' | 'headphones' | 'bald' | 'slick' | 'capBack';
export type Role = 'employee' | 'manager' | 'intern';

export interface Looks {
  role: Role;
  skin: string;
  shirt: string;
  pants: string;
  shoes: string;
  hair: string;
  hairStyle: HairStyle;
  /** Cap, beanie or headphones colour. */
  hatColor: string;
  glasses: boolean;
  glassesColor: string;
  sleeves: 'long' | 'short';
  /** The orange staff lanyard: every Claude session wears one, regulars (NPC coworkers) never do. */
  lanyard: boolean;
  tie: boolean;
  mug: boolean;
  laptop: boolean;
  /** Overall scale (manager 1.08, interns 0.7). */
  scale: number;
  /** Torso width multiplier, so not everyone is the same bean. */
  girth: number;
  /** Walking pace multiplier, a little personality. */
  pace: number;
  /** A mic on the headphones (the receptionist, chars/receptionist.ts). */
  headset?: boolean;
}

const EMPLOYEE_HAIR: HairStyle[] = ['tuft', 'bob', 'cap', 'beanie', 'bun', 'headphones', 'bald'];
const HAT_COLORS = ['#FF5A5F', '#3D7CFF', '#FFC93C', '#2EC4B6', '#9B5DE5', '#FF9F45', '#FF7EB6', '#6BCB77'];
const GLASSES_COLORS = ['#2B2D42', '#2B2D42', '#E63946', '#3A86FF', '#8D6E63'];

const roll = (seed: string, salt: string) => (hash32(seed + ':' + salt) % 1000) / 1000;

/** Pick from `list` but never `avoid` (keeps hats from vanishing into shirts). */
function pickNot(list: readonly string[], seed: string, salt: string, avoid: string): string {
  const i = hash32(seed + ':' + salt) % list.length;
  return list[i] === avoid ? list[(i + 1) % list.length] : list[i];
}

/** A Claude session. Hosted or not, they wear the staff lanyard (`_hosted` stays for callers). */
export function employeeLooks(sessionId: string, _hosted: boolean): Looks {
  const shirt = pick(PALETTE.shirts, sessionId, 'shirt');
  const hairStyle = pick(EMPLOYEE_HAIR, sessionId, 'hair');
  return {
    role: 'employee',
    skin: pick(PALETTE.skins, sessionId, 'skin'),
    shirt,
    pants: pick(PALETTE.pants, sessionId, 'pants'),
    shoes: pick(PALETTE.shoes, sessionId, 'shoes'),
    hair: pick(PALETTE.hair, sessionId, 'hairColor'),
    hairStyle,
    hatColor: pickNot(HAT_COLORS, sessionId, 'hat', shirt),
    glasses: roll(sessionId, 'glasses') < 0.3,
    glassesColor: pick(GLASSES_COLORS, sessionId, 'glassesColor'),
    sleeves: roll(sessionId, 'sleeves') < 0.5 ? 'short' : 'long',
    lanyard: true,
    tie: false,
    mug: false,
    laptop: false,
    scale: 0.96 + roll(sessionId, 'height') * 0.08,
    girth: 0.94 + roll(sessionId, 'girth') * 0.14,
    pace: 0.9 + roll(sessionId, 'pace') * 0.25,
  };
}

/** A regular (NPC coworker, chars/npc.ts): office folk, so no staff lanyard; a mug for breaks. */
export function regularLooks(id: string): Looks {
  return { ...employeeLooks(id, false), lanyard: false, mug: true };
}

/** Mabel on the front desk: always the same warm face. Sunny cardigan, round specs, headset on. */
export function receptionistLooks(): Looks {
  return {
    role: 'employee',
    skin: PALETTE.skins[1],
    shirt: '#FFD93D',
    pants: '#4B3F72',
    shoes: '#E63946',
    hair: '#D94F30',
    hairStyle: 'headphones',
    hatColor: '#3D7CFF',
    glasses: true,
    glassesColor: PALETTE.ink,
    sleeves: 'long',
    lanyard: false,
    tie: false,
    mug: true,
    laptop: false,
    scale: 1,
    girth: 1.04,
    pace: 1,
    headset: true,
  };
}

export function managerLooks(): Looks {
  return {
    role: 'manager',
    skin: PALETTE.skins[1],
    shirt: PALETTE.managerShirt,
    pants: PALETTE.managerPants,
    shoes: '#5B3A29',
    hair: PALETTE.managerHair,
    hairStyle: 'slick',
    hatColor: PALETTE.managerTie,
    glasses: false,
    glassesColor: PALETTE.ink,
    sleeves: 'long',
    lanyard: false,
    tie: true,
    mug: true,
    laptop: false,
    scale: 1.08,
    girth: 1.04,
    pace: 1,
  };
}

/** Interns wear their boss's colour on their cap, so you can tell whose they are. */
export function internLooks(internId: string, bossColor?: string): Looks {
  const shirt = pick(PALETTE.shirts, internId, 'shirt');
  return {
    role: 'intern',
    skin: pick(PALETTE.skins, internId, 'skin'),
    shirt,
    pants: pick(PALETTE.pants, internId, 'pants'),
    shoes: pick(PALETTE.shoes, internId, 'shoes'),
    hair: pick(PALETTE.hair, internId, 'hairColor'),
    hairStyle: 'capBack',
    hatColor: bossColor ?? pickNot(HAT_COLORS, internId, 'hat', shirt),
    glasses: roll(internId, 'glasses') < 0.2,
    glassesColor: pick(GLASSES_COLORS, internId, 'glassesColor'),
    sleeves: 'short',
    lanyard: false,
    tie: false,
    mug: false,
    laptop: true,
    scale: 0.7,
    girth: 0.96 + roll(internId, 'girth') * 0.08,
    pace: 1.1,
  };
}
