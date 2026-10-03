// Harmony for the café music: jazzy chord qualities, ii-V-I-style progressions written as roman
// numerals, and voice leading that moves each chord to the nearest comfortable voicing, the way
// a pianist's left hand would. Pure functions: no WebAudio here.
import { pick, type Rng } from './rng';

export type Quality = 'maj7' | 'maj9' | 'maj7#11' | '69' | 'm7' | 'm9' | 'm11' | 'm6' | '7' | '9' | '13' | '7b9' | '9sus' | 'm7b5';

/**
 * The notes a pianist voices over the bass (semitones above the root). Mostly rootless: the
 * bass plays the root, so the hands keep the colour (3rd, 7th, 9th, 13th…).
 */
const TONES: Record<Quality, number[]> = {
  maj7: [0, 4, 7, 11],
  maj9: [4, 7, 11, 14],
  'maj7#11': [4, 11, 14, 18],
  '69': [4, 7, 9, 14],
  m7: [0, 3, 7, 10],
  m9: [3, 7, 10, 14],
  m11: [3, 10, 14, 17],
  m6: [3, 7, 9, 14],
  '7': [0, 4, 7, 10],
  '9': [4, 7, 10, 14],
  '13': [4, 10, 14, 21],
  '7b9': [4, 10, 13, 20],
  '9sus': [5, 7, 10, 14],
  m7b5: [3, 6, 10, 12],
};

/** Chord tones a melody may land on over this quality (semitones above the root, mod 12). */
const LANDING: Record<Quality, number[]> = {
  maj7: [0, 4, 7, 11, 2],
  maj9: [0, 4, 7, 11, 2],
  'maj7#11': [4, 7, 11, 2, 6],
  '69': [0, 4, 7, 9, 2],
  m7: [0, 3, 7, 10],
  m9: [0, 3, 7, 10, 2],
  m11: [0, 3, 7, 10, 2, 5],
  m6: [0, 3, 7, 9, 2],
  '7': [0, 4, 7, 10],
  '9': [0, 4, 7, 10, 2],
  '13': [4, 7, 10, 2, 9],
  '7b9': [0, 4, 10, 8],
  '9sus': [5, 7, 10, 2, 0],
  m7b5: [0, 3, 6, 10],
};

export interface Chord {
  /** Root pitch class, 0 = C. */
  root: number;
  quality: Quality;
}

const NUMERALS = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'];
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10];

/**
 * "ii9", "V13", "bVImaj9", "III7b9", "iiø" → a chord in a key. Lowercase numerals are minor
 * chords, uppercase major or dominant. Degrees count up the major scale and flats say what
 * differs, in minor keys too ("i9 | bVImaj9 | iiø | V7b9").
 */
export function parseChord(token: string, tonic: number): Chord {
  const m = /^([b#]?)(vii|VII|iii|III|ii|II|iv|IV|vi|VI|i|I|v|V)(.*)$/.exec(token);
  if (!m) throw new Error(`bad chord ${token}`);
  const [, acc, num, rest] = m;
  const degree = NUMERALS.indexOf(num.toLowerCase());
  const lower = num === num.toLowerCase();
  const root = (tonic + MAJOR_STEPS[degree] + (acc === 'b' ? -1 : acc === '#' ? 1 : 0) + 24) % 12;
  const quality = qualityOf(rest, lower);
  return { root, quality };
}

function qualityOf(suffix: string, lower: boolean): Quality {
  if (lower) {
    if (suffix === 'ø') return 'm7b5';
    if (suffix === '9') return 'm9';
    if (suffix === '11') return 'm11';
    if (suffix === '6') return 'm6';
    return 'm7';
  }
  switch (suffix) {
    case 'maj7':
      return 'maj7';
    case 'maj9':
      return 'maj9';
    case 'maj7#11':
      return 'maj7#11';
    case '69':
      return '69';
    case '9':
      return '9';
    case '13':
      return '13';
    case '7b9':
      return '7b9';
    case '9sus':
      return '9sus';
    default:
      return '7';
  }
}

/** A progression: bars split by "|", chords in a bar by spaces (they share the bar evenly). */
export function parseProgression(text: string, tonic: number): Chord[][] {
  return text.split('|').map((bar) =>
    bar
      .trim()
      .split(/\s+/)
      .map((t) => parseChord(t, tonic)),
  );
}

/** Four-bar progressions that sit well under a lazy beat. Mixed into eight-bar sections. */
export const MAJOR_PROGRESSIONS = [
  'ii9 | V13 | Imaj9 | Imaj9',
  'Imaj9 | vi9 | ii9 | V13',
  'IVmaj9 | iii7 | ii9 | Imaj9',
  'IVmaj9 | III7b9 | vi9 | v9 I9',
  'Imaj9 | iv9 | iii7 | VI7b9',
  'ii9 | V13 | iii7 VI7b9 | ii9 V13',
  'Imaj9 | IVmaj9 | Imaj9 | IVmaj9',
  'vi9 | IVmaj9 | Imaj9 | V9sus',
  'IVmaj9 | iv9 | iii7 | VI7b9',
  'ii9 | bII9 | Imaj9 | VI7b9',
  'Imaj9 | bVII9 | IVmaj9 | iv9',
  'IVmaj7#11 | V9sus | iii7 | vi9',
  'ii11 | V9sus | Imaj9 | I69',
  'bVImaj9 | bVII9 | Imaj9 | Imaj9',
  'Imaj9 | iii7 | IVmaj9 | iv9',
  'ii9 | iii7 | IVmaj9 | V9sus',
  'Imaj9 | II9 | IVmaj9 | iv9',
  'vi9 | ii9 | V13 | Imaj9',
  'IVmaj9 | I69 | ii9 | V13',
  'iii7 | vi9 | ii9 | V13',
];

export const MINOR_PROGRESSIONS = [
  'i9 | iv9 | bVII13 | bIIImaj9',
  'i9 | bVImaj9 | iiø | V7b9',
  'i9 | IV9 | i9 | IV9',
  'iv9 | v9 | i9 | i9',
  'bVImaj9 | bVII13 | i9 | i9',
  'i11 | bIIImaj9 | bVImaj9 | V7b9',
  'i9 | i9 | iv9 | bVII13',
  'i9 | bVII13 | bVImaj9 | V7b9',
  'iiø | V7b9 | i9 | bVImaj9',
  'i11 | iv9 | i11 | iv9',
];

/** Gentle evening progressions: slow-moving, no spicy dominants. */
export const NIGHT_PROGRESSIONS = [
  'Imaj9 | IVmaj9 | Imaj9 | IVmaj9',
  'IVmaj9 | iii7 | ii9 | Imaj9',
  'Imaj9 | vi9 | IVmaj7#11 | IVmaj7#11',
  'ii9 | V9sus | Imaj9 | I69',
  'IVmaj9 | iv9 | Imaj9 | Imaj9',
  'Imaj9 | iii7 | IVmaj9 | IVmaj9',
  'vi9 | IVmaj9 | Imaj9 | Imaj9',
  'IVmaj7#11 | IVmaj7#11 | Imaj9 | Imaj9',
];

/** Pitch classes of a chord's voicing tones. */
export const chordTones = (c: Chord): number[] => TONES[c.quality].map((t) => (c.root + t) % 12);

/** Pitch classes a melody may rest on over this chord. */
export const landingTones = (c: Chord): number[] => LANDING[c.quality].map((t) => (c.root + t) % 12);

/** Voicings live here: low enough to be warm, high enough not to be mud. */
export const VOICE_LO = 50; // D3
export const VOICE_HI = 79; // G5

/** Close and drop-2 arrangements of these tones with the lowest note in [lo, lo + 12). */
function candidates(tones: number[], lo: number): number[][] {
  const out: number[][] = [];
  for (let rot = 0; rot < tones.length; rot++) {
    const order = tones.slice(rot).concat(tones.slice(0, rot));
    for (let base = lo; base < lo + 12; base++) {
      if ((base - order[0] + 120) % 12 !== 0) continue;
      const close = [base];
      for (let i = 1; i < order.length; i++) {
        let n = close[i - 1] + 1;
        while ((n - order[i] + 120) % 12 !== 0) n++;
        close.push(n);
      }
      out.push(close);
      if (close.length >= 4) {
        // Drop 2: the second voice from the top drops an octave, opening the sound.
        const drop = close.slice();
        drop[drop.length - 2] -= 12;
        drop.sort((a, b) => a - b);
        out.push(drop);
      }
    }
  }
  return out;
}

/** Muddy or awkward: seconds down low, notes out of range, giant stretches. */
function penalty(v: number[]): number {
  let p = 0;
  if (v[0] < VOICE_LO - 2 || v[v.length - 1] > VOICE_HI) p += 50;
  for (let i = 1; i < v.length; i++) {
    const gap = v[i] - v[i - 1];
    // Seconds and minor thirds are fine up high, cloudy below about E3.
    if (gap <= 2 && v[i - 1] < 56) p += 12;
    if (gap === 1 && i === v.length - 1) p += 4;
    if (gap > 9) p += 3;
  }
  if (v[v.length - 1] - v[0] > 19) p += 6;
  return p;
}

const sorted = (v: number[]) => v.slice().sort((a, b) => a - b);

/**
 * The voicing of `chord` nearest to `prev` (smooth voice leading). With no previous chord, the
 * one closest to `centre`. `r` breaks near-ties so repeats aren't always identical.
 */
export function voiceChord(chord: Chord, prev: number[] | null, r: Rng, centre = 64): number[] {
  const tones = chordTones(chord);
  const all = [...candidates(tones, VOICE_LO - 2), ...candidates(tones, VOICE_LO + 4)];
  let best: number[] = all[0];
  let bestCost = Infinity;
  for (const raw of all) {
    const v = sorted(raw);
    let cost = penalty(v);
    if (prev) {
      const p = sorted(prev);
      for (let i = 0; i < Math.min(p.length, v.length); i++) cost += Math.abs(v[i] - p[i]);
      // A top voice that leaps is heard as a melody that leaps.
      const top = Math.abs(v[v.length - 1] - p[p.length - 1]);
      if (top > 4) cost += (top - 4) * 1.5;
    } else {
      const mean = v.reduce((a, b) => a + b, 0) / v.length;
      cost += Math.abs(mean - centre) * 1.2;
    }
    // Drift back towards the middle of the keyboard over time.
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    cost += Math.abs(mean - centre) * 0.25;
    cost += r() * 0.8;
    if (cost < bestCost) {
      bestCost = cost;
      best = v;
    }
  }
  return best;
}

/**
 * The bass note for a root: A1–G#2 (55–104 Hz), as near as possible to the last one. Lower
 * than that is only felt, and laptop speakers can't play it at all.
 */
export function bassNote(root: number, prev: number | null): number {
  const options = [33, 45].map((o) => o + ((root - (o % 12) + 12) % 12));
  const ok = options.filter((n) => n >= 33 && n <= 47);
  const target = prev ?? 40;
  return ok.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a), ok[0] ?? 40);
}

/** The scale of a key, as pitch classes. */
export const scaleOf = (tonic: number, minor: boolean): number[] => (minor ? MINOR_STEPS : MAJOR_STEPS).map((s) => (tonic + s) % 12);

/** Major (or minor) pentatonic: melodies made of these never clash. */
export const pentatonicOf = (tonic: number, minor: boolean): number[] => (minor ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9]).map((s) => (tonic + s) % 12);

/** Comfortable keys for the e-piano (pitch class of the tonic). */
export const KEYS = [3, 5, 8, 10, 1, 0, 7, 2];

/** A related key for the next tune: near on the circle, so the hand-off feels natural. */
export function nextKey(r: Rng, tonic: number): number {
  const step = pick(r, [0, 5, 7, 5, 7, -2, 2, 3, -3]);
  let k = (tonic + step + 12) % 12;
  // Stay among the warm-sounding keys.
  if (!KEYS.includes(k)) k = pick(r, KEYS);
  return k;
}

export const midiHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
