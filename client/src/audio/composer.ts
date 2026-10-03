// The café music's songwriter: a seed in, a whole tune out (key, tempo, form, chords, voicings,
// a lazy swung beat, a round bass line and now and then a little vibes melody). Pure data: the
// player (music.ts) turns it into sound. Same seed, same tune, so renders and tests repeat.
import { between, chance, jitter, mix, pick, rng, weighted, type Rng } from './rng';
import {
  KEYS,
  MAJOR_PROGRESSIONS,
  MINOR_PROGRESSIONS,
  NIGHT_PROGRESSIONS,
  bassNote,
  landingTones,
  nextKey,
  parseProgression,
  pentatonicOf,
  voiceChord,
  type Chord,
} from './theory';

export type Hit = 'kick' | 'snare' | 'rim' | 'brush' | 'swirl' | 'hat' | 'ohat' | 'shaker';

/** Times are in beats from the start of their bar (they may start a little before it: pushes). */
export type MusicEvent =
  | { type: 'keys'; at: number; dur: number; notes: number[]; vel: number; /** Strum, seconds bottom to top. */ spread: number }
  | { type: 'bass'; at: number; dur: number; note: number; vel: number }
  | { type: 'lead'; at: number; dur: number; note: number; vel: number }
  | { type: 'drum'; at: number; hit: Hit; vel: number; /** Brush swirls last a while. */ dur?: number };

export type Section = 'intro' | 'A' | 'B' | 'outro';

export interface Bar {
  index: number;
  section: Section;
  chords: { at: number; chord: Chord }[];
  events: MusicEvent[];
}

export interface Tune {
  seed: number;
  night: boolean;
  tonic: number;
  minor: boolean;
  bpm: number;
  bars: Bar[];
  /** For the lab page and logs: "Eb major, 78 bpm, rim + 8ths, vibes". */
  label: string;
}

export interface TuneOptions {
  night: boolean;
  /** Key to start in (the previous tune's neighbour). */
  tonic?: number;
}

type KeysStyle = 'hold' | 'pulse' | 'push' | 'stabs';
type BassStyle = 'kick' | 'hold' | 'walk';
type HatStyle = '8ths' | '16ths' | 'shaker' | 'offbeats' | 'none';
type Backbeat = 'rim' | 'snare' | 'brush';

interface Feel {
  swing8: number;
  swing16: number;
  kick: number[];
  backbeat: Backbeat;
  hats: HatStyle;
  swirls: boolean;
  keys: KeysStyle;
  bass: BassStyle;
  keysVel: number;
  lead: boolean;
}

/** Kick patterns in 16th steps: lazy boom-bap shapes. */
const KICKS: number[][] = [
  [0, 10],
  [0, 7, 10],
  [0, 10, 13],
  [0, 8],
  [0, 3, 10],
  [0, 6, 10],
];

const NOTE = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Where a 16th step lands once swung (beats from the bar start). */
function stepAt(step: number, f: Feel): number {
  const beat = Math.floor(step / 4);
  const s = step % 4;
  const and = f.swing8;
  const pos = s === 0 ? 0 : s === 1 ? f.swing16 * and : s === 2 ? and : and + f.swing16 * (1 - and);
  return beat + pos;
}

export function composeTune(seed: number, opts: TuneOptions): Tune {
  const r = rng(seed);
  const night = opts.night;
  const minor = !night && chance(r, 0.3);
  // Keys are named by their major tonic; a minor tune sits on its relative minor.
  const home = opts.tonic ?? pick(r, KEYS);
  const tonic = minor ? (home + 9) % 12 : home;
  const bpm = Math.round(night ? between(r, 64, 70) : weighted(r, [[between(r, 72, 76), 2], [between(r, 76, 81), 3], [between(r, 81, 85), 1]] as const));

  const feel: Feel = night
    ? {
        swing8: between(r, 0.53, 0.58),
        swing16: between(r, 0.55, 0.6),
        kick: pick(r, [[0, 8], [0, 10]]),
        backbeat: 'brush',
        hats: 'none',
        swirls: true,
        keys: weighted(r, [['hold', 3], ['pulse', 1]] as const),
        bass: 'hold',
        keysVel: between(r, 0.36, 0.44),
        lead: chance(r, 0.35),
      }
    : {
        swing8: between(r, 0.5, 0.56),
        swing16: between(r, 0.56, 0.64),
        kick: pick(r, KICKS),
        backbeat: weighted(r, [['rim', 3], ['snare', 2], ['brush', 2]] as const),
        hats: weighted(r, [['8ths', 4], ['16ths', 1], ['shaker', 2], ['offbeats', 2]] as const),
        swirls: false,
        keys: weighted(r, [['hold', 2], ['pulse', 3], ['push', 3], ['stabs', 0.5]] as const),
        bass: weighted(r, [['kick', 4], ['hold', 1], ['walk', 1]] as const),
        keysVel: between(r, 0.5, 0.62),
        lead: chance(r, 0.75),
      };
  // Brush swirls fill the space sparse hats leave; over busy hats they're just hiss.
  if (feel.backbeat === 'brush' && !night) feel.swirls = (feel.hats === 'offbeats' || feel.hats === '8ths') && chance(r, 0.5);

  // Two progressions: A (eight bars, from one or two four-bar shapes) and a contrasting B.
  const pool = night ? NIGHT_PROGRESSIONS : minor ? MINOR_PROGRESSIONS : MAJOR_PROGRESSIONS;
  const a1 = pick(r, pool);
  const a2 = chance(r, 0.5) ? a1 : pick(r, pool);
  let b1 = pick(r, pool);
  for (let i = 0; i < 4 && (b1 === a1 || b1 === a2); i++) b1 = pick(r, pool);
  const progA = [...parseProgression(a1, tonic), ...parseProgression(a2, tonic)];
  const progB = [...parseProgression(b1, tonic), ...parseProgression(chance(r, 0.6) ? b1 : a1, tonic)];

  const form: Section[] = night
    ? pick(r, [
        ['intro', 'A', 'A', 'B', 'A', 'outro'],
        ['intro', 'A', 'B', 'A', 'outro'],
      ])
    : pick(r, [
        ['intro', 'A', 'A', 'B', 'A', 'outro'],
        ['intro', 'A', 'B', 'A', 'B', 'outro'],
        ['intro', 'A', 'A', 'B', 'B', 'A', 'outro'],
      ]);

  // The bar-by-bar plan: section, chords.
  const plan: { section: Section; chords: Chord[]; inSection: number; sectionLen: number; pass: number }[] = [];
  const passes: Record<Section, number> = { intro: 0, A: 0, B: 0, outro: 0 };
  for (const section of form) {
    const pass = passes[section]++;
    if (section === 'intro') for (let i = 0; i < 4; i++) plan.push({ section, chords: progA[i], inSection: i, sectionLen: 4, pass });
    else if (section === 'outro') {
      const last = parseProgression(minor ? 'i9' : night ? 'Imaj9' : pick(r, ['Imaj9', 'I69']), tonic)[0];
      for (let i = 0; i < 4; i++) plan.push({ section, chords: i < 2 ? progA[i] : last, inSection: i, sectionLen: 4, pass });
    } else {
      const prog = section === 'A' ? progA : progB;
      for (let i = 0; i < 8; i++) plan.push({ section, chords: prog[i], inSection: i, sectionLen: 8, pass });
    }
  }

  const motif = feel.lead ? makeMotif(r) : null;
  let voicing: number[] | null = null;
  let bass: number | null = null;
  let leadStart: number | null = null;
  const bars: Bar[] = [];

  for (let i = 0; i < plan.length; i++) {
    const p = plan[i];
    const br = rng(mix(seed, i + 1));
    const events: MusicEvent[] = [];
    const span = 4 / p.chords.length;
    const chords = p.chords.map((chord, k) => ({ at: k * span, chord }));
    const next = plan[i + 1];
    const drums = p.section !== 'intro' && !(p.section === 'outro' && p.inSection >= 2);
    const phraseEnd = p.inSection === p.sectionLen - 1;

    // --- keys ------------------------------------------------------------------------
    const voicings = chords.map(({ chord }) => (voicing = voiceChord(chord, voicing, br)));
    const keysVel = feel.keysVel * (p.section === 'intro' ? 0.9 : p.section === 'outro' ? 0.85 : p.section === 'B' ? 1.05 : 1);
    const style: KeysStyle = p.section === 'intro' || p.section === 'outro' ? 'hold' : p.section === 'B' && feel.keys === 'hold' ? 'pulse' : feel.keys;
    chords.forEach((c, k) => {
      const notes = voicings[k];
      const end = k + 1 < chords.length ? chords[k + 1].at : 4;
      const len = end - c.at;
      const v = () => keysVel * (1 + jitter(br, 0.12));
      const spread = between(br, 0.008, night ? 0.035 : 0.026);
      const hit = (at: number, dur: number, vel: number) => events.push({ type: 'keys', at: at + jitter(br, 0.012), dur, notes, vel, spread });
      if (p.section === 'outro' && p.inSection >= 2) {
        // The last chord rings out; the next tune starts after it fades.
        if (p.inSection === 2) hit(0, 8.5, v() * 0.95);
        return;
      }
      if (style === 'hold' || len < 2) hit(c.at, len - 0.12, v());
      else if (style === 'pulse') {
        // Struck again later in the chord (a short chord: on its second beat).
        const again = len >= 4 ? pick(br, [2, 1 + feel.swing8, 2 + feel.swing8]) : feel.swing8;
        hit(c.at, again - 0.15, v());
        hit(c.at + again, len - again - 0.12, v() * 0.75);
      } else if (style === 'push') {
        // Anticipate the change by an 8th now and then: the chord arrives on the "and" of 4.
        const early = k === 0 && i > 0 && chance(br, 0.55) ? feel.swing8 - 1 : 0;
        if (early < 0) cutKeys(bars[i - 1], 4 + early - 0.06);
        const again = len >= 4 && chance(br, 0.5) ? 2 + feel.swing8 : 0;
        hit(c.at + early, (again || len) - early - 0.15, v());
        if (again) hit(c.at + again, len - again - 0.12, v() * 0.7);
      } else {
        // Stabs: short and rhythmic (16th steps within the chord's span).
        const shape = pick(br, [
          [0, 6, 10],
          [0, 3, 8],
          [0, 8, 14],
        ]).map((st) => stepAt(st, feel));
        shape.forEach((s, j) => {
          if (s >= len) return;
          const last = j === shape.length - 1 || shape[j + 1] >= len;
          hit(c.at + s, last ? len - s - 0.1 : Math.min(0.6, shape[j + 1] - s - 0.08), v() * (j === 0 ? 1 : 0.8));
        });
      }
    });
    // A little run up the keyboard at the end of a phrase.
    if (!night && phraseEnd && (p.section === 'A' || p.section === 'B') && chance(br, 0.35)) {
      const last = chords[chords.length - 1].chord;
      const top = voicings[voicings.length - 1];
      const tones = landingTones(last);
      let n = top[top.length - 1];
      const steps = [stepAt(10, feel), stepAt(12, feel), stepAt(13, feel), stepAt(14, feel)];
      for (const at of steps) {
        n = upTo(n + 1, tones);
        if (n > 86) break;
        events.push({ type: 'keys', at, dur: 0.45, notes: [n], vel: feel.keysVel * 0.7 * (1 + jitter(br, 0.1)), spread: 0 });
      }
    }

    // --- bass ------------------------------------------------------------------------
    const bassVel = night ? 0.62 : 0.78;
    const nextRoot = next ? next.chords[0].root : null;
    if (!(p.section === 'outro' && p.inSection === 3)) {
      chords.forEach((c, k) => {
        const end = k + 1 < chords.length ? chords[k + 1].at : 4;
        const len = end - c.at;
        const root = (bass = bassNote(c.chord.root, bass));
        const v = () => bassVel * (1 + jitter(br, 0.08));
        const outroHold = p.section === 'outro' && p.inSection === 2;
        const bstyle: BassStyle = outroHold || p.section === 'intro' ? 'hold' : p.section === 'B' && feel.bass === 'kick' && chance(br, 0.3) ? 'walk' : feel.bass;
        if (p.section === 'intro' && p.inSection < 2) return;
        if (bstyle === 'hold' || len < 2) {
          events.push({ type: 'bass', at: c.at, dur: outroHold ? 7 : len - 0.15, note: root, vel: v() * (outroHold ? 0.9 : 1) });
          return;
        }
        if (bstyle === 'walk') {
          // Quarter notes through the chord, the last one leaning into the next root.
          const third = root + (isMinor(c.chord) ? 3 : 4);
          const fifth = root + 7;
          const line = pick(br, [
            [root, third, fifth],
            [root, fifth, root + (isMinor(c.chord) ? 10 : 9)],
            [root, root + 2, third],
          ]).slice(0, len - 1);
          line.forEach((n, j) => events.push({ type: 'bass', at: c.at + j, dur: 0.85, note: n > 47 ? n - 12 : n, vel: v() * (j === 0 ? 1 : 0.85) }));
          const target = k + 1 < chords.length ? chords[k + 1].chord.root : nextRoot;
          events.push({ type: 'bass', at: c.at + len - 1, dur: 0.85, note: approach(target, root, br), vel: v() * 0.8 });
          return;
        }
        // Locked to the kick: root on the kick hits, an approach note into the next chord.
        const hits = feel.kick.map((s) => stepAt(s, feel)).filter((t) => t >= c.at && t < end);
        if (!hits.length || hits[0] > c.at) hits.unshift(c.at);
        hits.forEach((t, j) => {
          const until = j + 1 < hits.length ? hits[j + 1] : end;
          const n = j === 0 ? root : chance(br, 0.25) ? (root + 12 <= 47 ? root + 12 : root) : chance(br, 0.25) ? (root + 7 <= 47 ? root + 7 : root - 5) : root;
          events.push({ type: 'bass', at: t, dur: Math.max(0.3, until - t - 0.12), note: n, vel: v() * (j === 0 ? 1 : 0.88) });
        });
        const target = k + 1 < chords.length ? chords[k + 1].chord.root : nextRoot;
        if (target !== null && target !== c.chord.root && chance(br, 0.45)) {
          const at = end - 1 + feel.swing8;
          // The approach note replaces whatever was ringing (or about to start) there.
          for (let j = events.length - 1; j >= 0; j--) {
            const ev = events[j];
            if (ev.type !== 'bass' || ev.at < c.at) continue;
            if (ev.at >= at - 0.1) events.splice(j, 1);
            else if (ev.at + ev.dur > at) ev.dur = Math.max(0.25, at - ev.at - 0.05);
          }
          events.push({ type: 'bass', at, dur: end - at - 0.08, note: approach(target, root, br), vel: v() * 0.78 });
        }
      });
    }

    // --- drums -----------------------------------------------------------------------
    if (drums) {
      const d = (hit: Hit, at: number, vel: number, dur?: number) => events.push({ type: 'drum', hit, at, vel: Math.max(0.05, vel * (1 + jitter(br, 0.14))), dur });
      const thin = p.section === 'outro';
      // The bar before a new section takes a breath: no kick on 3 and 4.
      const breath = phraseEnd && next && next.section !== p.section && chance(br, 0.5);
      if (!thin) {
        for (const s of feel.kick) if (!(breath && s >= 8)) d('kick', stepAt(s, feel) + jitter(br, 0.006), night ? 0.55 : 0.85);
        if (phraseEnd && !breath && chance(br, 0.3)) d('kick', stepAt(15, feel), 0.5);
      }
      const lazy = 0.018;
      if (!thin || p.inSection === 0) {
        const bb = feel.backbeat;
        for (const s of [4, 12]) d(bb, stepAt(s, feel) + lazy + jitter(br, 0.008), night ? 0.5 : bb === 'brush' ? 0.75 : 0.7);
        // Ghost notes.
        for (const s of [7, 9, 15]) if (chance(br, night ? 0.12 : 0.2)) d(bb === 'rim' ? 'rim' : 'brush', stepAt(s, feel) + lazy, 0.18);
      }
      if (feel.swirls) for (let b = 0; b < 4; b++) d('swirl', b + 0.02, night ? 0.3 : 0.4, 0.95);
      const hats = thin && p.inSection > 0 ? 'none' : feel.hats;
      const hatVel = night ? 0.35 : 0.5;
      if (hats === '8ths') for (let s = 0; s < 16; s += 2) d('hat', stepAt(s, feel) + jitter(br, 0.01), hatVel * (s % 4 === 0 ? 1 : 0.72));
      if (hats === '16ths') for (let s = 0; s < 16; s++) d('hat', stepAt(s, feel) + jitter(br, 0.01), hatVel * (s % 4 === 0 ? 0.95 : s % 2 === 0 ? 0.7 : 0.42));
      if (hats === 'shaker') for (let s = 0; s < 16; s++) d('shaker', stepAt(s, feel) + jitter(br, 0.01), hatVel * (s % 2 === 0 ? 0.9 : 0.55));
      if (hats === 'offbeats') for (let s = 2; s < 16; s += 4) d('hat', stepAt(s, feel) + jitter(br, 0.01), hatVel * 0.85);
      if (!thin && phraseEnd && hats !== 'none' && chance(br, 0.35)) d('ohat', stepAt(14, feel), hatVel * 0.7);
    }
    // A pickup into the groove at the end of the intro.
    if (p.section === 'intro' && p.inSection === 3) {
      events.push({ type: 'drum', hit: feel.backbeat === 'rim' ? 'rim' : 'brush', at: stepAt(14, feel) + 0.02, vel: 0.3 });
      events.push({ type: 'drum', hit: feel.backbeat === 'rim' ? 'rim' : 'brush', at: stepAt(15, feel) + 0.02, vel: 0.42 });
    }

    // --- lead (vibes) ----------------------------------------------------------------
    if (motif && p.section === 'A' && p.pass > 0 && (p.inSection % 4 === 0 || p.inSection % 4 === 1)) {
      const answer = p.inSection >= 4;
      const half = p.inSection % 4; // 0: first bar of the phrase, 1: second
      if (half === 0 || leadStart !== null) {
        if (half === 0) leadStart = startNote(chords[0].chord, leadStart, br);
        const scale = pentatonicOf(tonic, minor);
        for (const m of motif) {
          const beat = m.at - half * 4;
          if (beat < 0 || beat >= 4) continue;
          const chord = chordAt(chords, beat);
          let note = stepScale(leadStart!, m.step + (answer && m.last ? m.answer : 0), scale);
          if (m.dur >= 1 || m.last) note = nearestOf(note, landingTones(chord));
          // Keep the vibes between E4 and E6.
          while (note > 88) note -= 12;
          while (note < 64) note += 12;
          events.push({ type: 'lead', at: beat + (beat % 1 === 0.5 ? feel.swing8 - 0.5 : 0), dur: m.dur, note, vel: (night ? 0.4 : 0.55) * (1 + jitter(br, 0.1)) });
        }
      }
    }

    events.sort((a, b) => a.at - b.at);
    bars.push({ index: i, section: p.section, chords, events });
  }

  const label = `${NOTE[minor ? tonic : home]} ${minor ? 'minor' : 'major'}, ${bpm} bpm, ${feel.backbeat} + ${feel.hats}${feel.swirls ? ' + swirls' : ''}, keys ${feel.keys}, bass ${feel.bass}${motif ? ', vibes' : ''}${night ? ', night' : ''}`;
  return { seed, night, tonic, minor, bpm, bars, label };
}

/** The home key (as a major tonic) a tune was in, for choosing the next one. */
export const homeKey = (t: Tune): number => (t.minor ? (t.tonic + 3) % 12 : t.tonic);

interface MotifNote {
  /** Beats from the start of the two-bar phrase. */
  at: number;
  dur: number;
  /** Pentatonic steps from the phrase's first note. */
  step: number;
  last: boolean;
  /** How the answer phrase bends the last note. */
  answer: number;
}

/** A short two-bar idea, mostly off the beat, with room to breathe. */
function makeMotif(r: Rng): MotifNote[] {
  const shapes = [
    [0.5, 1, 1.5, 2.5, 4.5],
    [1, 1.5, 2, 3.5, 5],
    [0.5, 1.5, 2, 3, 4.5, 5],
    [1.5, 2, 2.5, 4, 5.5],
    [0, 0.5, 1.5, 3.5, 4.5],
  ];
  const at = pick(r, shapes);
  let step = 0;
  return at.map((t, i) => {
    const last = i === at.length - 1;
    const nextAt = last ? t + 2.5 : at[i + 1];
    if (i > 0) step += weighted(r, [[1, 4], [-1, 4], [2, 1], [-2, 1], [0, 1]] as const);
    step = Math.max(-3, Math.min(4, step));
    return { at: t, dur: Math.min(last ? 2.5 : 1.5, nextAt - t - 0.05), step, last, answer: pick(r, [-1, -2, 1]) };
  });
}

const isMinor = (c: Chord): boolean => c.quality === 'm7' || c.quality === 'm9' || c.quality === 'm11' || c.quality === 'm6' || c.quality === 'm7b5';

function chordAt(chords: { at: number; chord: Chord }[], beat: number): Chord {
  let c = chords[0].chord;
  for (const x of chords) if (x.at <= beat) c = x.chord;
  return c;
}

/** The phrase's first note: a chord tone up around C5–A5, near the last phrase's. */
function startNote(chord: Chord, prev: number | null, r: Rng): number {
  const tones = landingTones(chord);
  const target = prev ?? 76 + Math.floor(r() * 4);
  let best = 76;
  let bestD = Infinity;
  for (let n = 70; n <= 83; n++) {
    if (!tones.includes(n % 12)) continue;
    const d = Math.abs(n - target) + r() * 1.5;
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

/** Move `steps` notes along the scale from `from`. */
function stepScale(from: number, steps: number, scale: number[]): number {
  let n = nearestOf(from, scale);
  const dir = Math.sign(steps);
  for (let i = 0; i < Math.abs(steps); i++) {
    n += dir;
    while (!scale.includes(((n % 12) + 12) % 12)) n += dir;
  }
  return n;
}

function nearestOf(n: number, pcs: number[]): number {
  for (let d = 0; d < 12; d++) {
    if (pcs.includes((((n - d) % 12) + 12) % 12)) return n - d;
    if (pcs.includes((((n + d) % 12) + 12) % 12)) return n + d;
  }
  return n;
}

/** The next note at or above `n` that's in `pcs`. */
function upTo(n: number, pcs: number[]): number {
  while (!pcs.includes(((n % 12) + 12) % 12)) n++;
  return n;
}

/** A chromatic or scale-step neighbour of the next root, near where the bass already is. */
function approach(targetRoot: number | null, from: number, r: Rng): number {
  if (targetRoot === null) return from;
  const target = bassNote(targetRoot, from);
  const offset = pick(r, [-1, 1, -2, 2, -1]);
  const n = target + offset;
  return n < 33 ? n + 12 : n > 47 ? n - 12 : n;
}

/** Shorten a bar's ringing chords so they end by `beat` (the next chord was pushed early). */
function cutKeys(bar: Bar | undefined, beat: number): void {
  for (const ev of bar?.events ?? []) if (ev.type === 'keys' && ev.at + ev.dur > beat) ev.dur = Math.max(0.2, beat - ev.at);
}

/** A fresh tune that follows `prev`: a neighbouring key, a new seed. */
export function followUp(prev: Tune | null, visitSeed: number, index: number, night: boolean): Tune {
  const seed = mix(visitSeed, index * 7919 + 13);
  const r = rng(seed ^ 0x5bd1e995);
  const tonic = prev ? nextKey(r, homeKey(prev)) : undefined;
  return composeTune(seed, { night, tonic });
}
