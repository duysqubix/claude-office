// The Regulars switch (docs/GAMEPLAY.md "Regulars"): Off / Some / Lively, saved per browser,
// default Lively. `?regulars=off|some|lively|<n>` overrides it for one visit (screenshots, tests).
// The receptionist has a switch of her own (on by default, `?receptionist=0|1`).
// No three.js here, so the Help panel can import it without pulling in the crew.

export type RegularsPreset = 'off' | 'some' | 'lively';
/** A preset, or an exact headcount from the URL. */
export type RegularsDensity = RegularsPreset | number;

export const REGULARS_PRESETS: readonly RegularsPreset[] = ['off', 'some', 'lively'];
const KEY = 'claude-office:regulars';
const DEFAULT: RegularsPreset = 'lively';
const listeners = new Set<(d: RegularsDensity) => void>();

function parse(v: string | null): RegularsDensity | null {
  if (v === 'off' || v === 'some' || v === 'lively') return v;
  if (v !== null && /^\d{1,3}$/.test(v.trim())) return Number(v);
  return null;
}

/** What this visit uses: `?regulars`, else the saved choice, else Lively. */
export function readRegularsDensity(search = location.search): RegularsDensity {
  const fromUrl = parse(new URLSearchParams(search).get('regulars'));
  if (fromUrl !== null) return fromUrl;
  try {
    return parse(localStorage.getItem(KEY)) ?? DEFAULT;
  } catch {
    return DEFAULT;
  }
}

/** Save a preset (the Help panel) and tell the crew, which adjusts live. */
export function setRegularsDensity(d: RegularsPreset): void {
  try {
    localStorage.setItem(KEY, d);
  } catch {
    // storage unavailable: this visit only
  }
  for (const fn of listeners) fn(d);
}

/** Subscribe to changes; returns the unsubscribe function. */
export function onRegularsDensity(fn: (d: RegularsDensity) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// The receptionist has her own switch (default on): Off above sends the crowd home, not her.
const DESK_KEY = 'claude-office:receptionist';
const deskListeners = new Set<(on: boolean) => void>();

/** `?receptionist=0|1` for this visit, else the saved choice, else on. */
export function readReceptionist(search = location.search): boolean {
  const fromUrl = new URLSearchParams(search).get('receptionist');
  if (fromUrl === '0' || fromUrl === '1') return fromUrl === '1';
  try {
    return localStorage.getItem(DESK_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setReceptionist(on: boolean): void {
  try {
    localStorage.setItem(DESK_KEY, on ? '1' : '0');
  } catch {
    // storage unavailable: this visit only
  }
  for (const fn of deskListeners) fn(on);
}

export function onReceptionist(fn: (on: boolean) => void): () => void {
  deskListeners.add(fn);
  return () => deskListeners.delete(fn);
}
