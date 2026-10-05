// Graphics presets (Help panel): Potato / Low / Medium / High / Ultra, saved per browser,
// default High (the look the office shipped with). `?gfx=potato|low|medium|high|ultra`
// overrides it for one visit (screenshots, tests). No three.js here, so the Help panel can
// import it without pulling in the engine.

export type GraphicsPreset = 'potato' | 'low' | 'medium' | 'high' | 'ultra';

export const GRAPHICS_PRESETS: readonly GraphicsPreset[] = ['potato', 'low', 'medium', 'high', 'ultra'];

/** What a preset turns on. The engine applies these live. */
export interface GraphicsSettings {
  /** Highest device pixel ratio rendered; potato renders below 1 and lets the browser scale up. */
  maxPixelRatio: number;
  /** Sun shadow map size in pixels, or 0 for no shadows. */
  shadowMap: number;
  /** Post-processing at all (bloom, colour grade, anti-aliasing). Off renders straight to the screen. */
  post: boolean;
  /** Ambient occlusion: off, half resolution (Medium), or full resolution (High). */
  ao: 'off' | 'half' | 'full';
  bloom: boolean;
  /** SMAA edge smoothing. */
  smaa: boolean;
}

export const GRAPHICS: Record<GraphicsPreset, GraphicsSettings> = {
  potato: { maxPixelRatio: 0.75, shadowMap: 0, post: false, ao: 'off', bloom: false, smaa: false },
  low: { maxPixelRatio: 1, shadowMap: 1024, post: true, ao: 'off', bloom: false, smaa: true },
  medium: { maxPixelRatio: 1.5, shadowMap: 1024, post: true, ao: 'half', bloom: true, smaa: true },
  high: { maxPixelRatio: 2, shadowMap: 2048, post: true, ao: 'half', bloom: true, smaa: true },
  ultra: { maxPixelRatio: 3, shadowMap: 4096, post: true, ao: 'full', bloom: true, smaa: true },
};

const KEY = 'claude-office:graphics';
const DEFAULT: GraphicsPreset = 'high';
const listeners = new Set<(p: GraphicsPreset) => void>();
/** Picked this visit: wins over `?gfx` and storage, so Help shows what the engine runs. */
let current: GraphicsPreset | null = null;

const parse = (v: string | null): GraphicsPreset | null => (GRAPHICS_PRESETS as readonly string[]).includes(v ?? '') ? (v as GraphicsPreset) : null;

/** What this visit uses: `?gfx`, else the saved choice, else High. */
export function readGraphics(search = location.search): GraphicsPreset {
  if (current) return current;
  const fromUrl = parse(new URLSearchParams(search).get('gfx'));
  if (fromUrl) return fromUrl;
  try {
    return parse(localStorage.getItem(KEY)) ?? DEFAULT;
  } catch {
    return DEFAULT;
  }
}

/** Save a preset (the Help panel) and tell the engine, which switches live. */
export function setGraphics(p: GraphicsPreset): void {
  current = p;
  try {
    localStorage.setItem(KEY, p);
  } catch {
    // storage unavailable: this visit only
  }
  for (const fn of listeners) fn(p);
}

/** Subscribe to changes; returns the unsubscribe function. */
export function onGraphics(fn: (p: GraphicsPreset) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
