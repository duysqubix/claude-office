// Seeded randomness for the music: the same seed always plays the same tunes (renders, tests).

export interface Rng {
  /** 0 ≤ n < 1. */
  (): number;
}

/** A small, fast 32-bit generator. */
export function rng(seed: number): Rng {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mix two numbers into a new seed (song n of a visit, bar n of a song). */
export const mix = (a: number, b: number): number => {
  let h = Math.imul((a >>> 0) ^ 0x85ebca6b, 0xc2b2ae35) ^ Math.imul((b >>> 0) + 0x27d4eb2f, 0x165667b1);
  h ^= h >>> 16;
  return Math.imul(h, 0x45d9f3b) >>> 0;
};

export const pick = <T>(r: Rng, list: readonly T[]): T => list[Math.floor(r() * list.length)];

/** Pick by weight: [[value, weight], …]. */
export function weighted<T>(r: Rng, list: readonly (readonly [T, number])[]): T {
  let total = 0;
  for (const [, w] of list) total += w;
  let x = r() * total;
  for (const [v, w] of list) {
    x -= w;
    if (x < 0) return v;
  }
  return list[list.length - 1][0];
}

export const chance = (r: Rng, p: number): boolean => r() < p;

/** Uniform in [lo, hi). */
export const between = (r: Rng, lo: number, hi: number): number => lo + r() * (hi - lo);

/** Roughly normal around 0 with this spread (for human timing and touch). */
export const jitter = (r: Rng, spread: number): number => (r() + r() + r() - 1.5) * spread * 0.8;
