// Shapes of client/public/models/catalog.json (written by scripts/catalog.mjs), plus the page's
// fixed vocabulary: the four artists, what each priority means and the colours each tint offers.
import { PALETTE } from '../style/palette';

export type Status = 'done' | 'wip' | 'planned';
export type Vec3 = [number, number, number];

export interface Dims {
  w: number;
  h: number;
  d: number;
}

export interface CatalogItem {
  id: string;
  name: string;
  category: string | null;
  artist: string | null;
  group: string | null;
  priority: string | null;
  description: string;
  tags: string[];
  tintable: string[];
  anchors: Record<string, Vec3>;
  status: Status;
  file: string | null;
  thumb: string | null;
  dims?: Dims | null;
  bbox?: { min: Vec3; max: Vec3 } | null;
  tris?: number;
  bytes?: number;
  materials?: string[];
  nodes?: string[];
  textures?: number;
  error?: string;
}

export interface Catalog {
  generated: string;
  totals: Partial<Record<Status | 'all', number>>;
  byArtist: Record<string, number>;
  items: CatalogItem[];
}

export type Silhouette = 'chair' | 'table' | 'lamp' | 'screen' | 'mug' | 'tree' | 'cloud' | 'board' | 'person' | 'box';

export interface Artist {
  name: string;
  short: string;
  /** What they make, as the brief puts it. */
  dept: string;
  color: string;
  skin: string;
  /** Placeholder shape for their planned models when the id doesn't suggest one. */
  shape: Silhouette;
  /** Floor colour of the viewer's ground disc: where their models live in the game. */
  floor: string;
}

export const ARTISTS: readonly Artist[] = [
  { name: 'Claude Monet', short: 'Monet', dept: 'Furniture', color: PALETTE.deskAccents[1], skin: PALETTE.skins[0], shape: 'box', floor: PALETTE.floorWood },
  { name: 'Claude Cézanne', short: 'Cézanne', dept: 'Small props', color: PALETTE.deskAccents[5], skin: PALETTE.skins[2], shape: 'box', floor: PALETTE.floorWood },
  { name: 'Claude Lorrain', short: 'Lorrain', dept: 'Environment', color: PALETTE.deskAccents[3], skin: PALETTE.skins[3], shape: 'tree', floor: PALETTE.grass },
  { name: 'Claude Rodin', short: 'Rodin', dept: 'Characters', color: PALETTE.deskAccents[4], skin: PALETTE.skins[1], shape: 'person', floor: PALETTE.floorWood },
];

const NOBODY: Artist = {
  name: 'Unassigned',
  short: 'Unassigned',
  dept: 'Other',
  color: PALETTE.stateStarting,
  skin: PALETTE.skins[0],
  shape: 'box',
  floor: PALETTE.floorWood,
};

/** The artist behind a name. Work lists like "Claude Monet (round 2)" belong to Claude Monet. */
export function artistOf(name: string | null): Artist {
  const base = name?.replace(/\s*\(.*\)\s*$/, '').trim();
  if (!base) return NOBODY;
  return ARTISTS.find((a) => a.name === base) ?? { ...NOBODY, name: base, short: base.replace(/^Claude /, '') };
}

/** Sidecar categories (docs/ASSETS.md), as the page names them. */
const CATEGORY_LABEL: Record<string, string> = {
  furniture: 'Furniture',
  appliance: 'Appliances',
  decor: 'Decor',
  'desk-item': 'Desk items',
  food: 'Food',
  building: 'Building',
  outdoor: 'Outdoors',
  plant: 'Plants',
  'character-body': 'Character bodies',
  'character-hair': 'Hair',
  'character-hat': 'Hats',
  'character-face': 'Faces',
  'character-accessory': 'Accessories',
  'character-held': 'Things to hold',
  'character-outfit': 'Outfits',
  pet: 'Pets',
  preset: 'Ready-made characters',
};

export function categoryLabel(c: string | null): string {
  if (!c) return 'No category yet';
  return CATEGORY_LABEL[c] ?? c.replace(/-/g, ' ').replace(/^\w/, (x) => x.toUpperCase());
}

export const PRIORITY: Record<string, string> = {
  P0: 'The game uses it now',
  P1: 'For a richer office',
  P2: 'Fun extra for later',
};

const PRIORITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2 };
const STATUS_RANK: Record<Status, number> = { done: 0, wip: 1, planned: 2 };

/** Stable shelf order: priority, then name. A model keeps its slot when it gets built. */
export function byShelf(a: CatalogItem, b: CatalogItem): number {
  return (PRIORITY_RANK[a.priority ?? ''] ?? 9) - (PRIORITY_RANK[b.priority ?? ''] ?? 9) || a.name.localeCompare(b.name);
}

/** Progress order for the artist studs: built first, so each grid fills like a progress bar. */
export function byProgress(a: CatalogItem, b: CatalogItem): number {
  return STATUS_RANK[a.status] - STATUS_RANK[b.status] || byShelf(a, b);
}

/** Palette colours offered for each tintable material name (docs/ASSETS.md). */
export const TINTS: Record<string, readonly string[]> = {
  Skin: PALETTE.skins,
  Shirt: PALETTE.shirts,
  Pants: PALETTE.pants,
  Shoes: PALETTE.shoes,
  Hair: PALETTE.hair,
  Accent: PALETTE.deskAccents,
  Seat: PALETTE.chairs,
  Screen: [PALETTE.screenGlow, PALETTE.stateWorking, PALETTE.stateNeedsYou, PALETTE.carpetAlt, PALETTE.stateSleeping],
};

/**
 * Materials the swatches can recolour: the sidecar's list, else any material named like one of
 * the game's tints. Surfaces the game draws on (`Board`, `Label`) have no palette, so they're left out.
 */
export function tintNames(item: CatalogItem): string[] {
  const mats = item.materials ?? [];
  const listed = item.tintable.length ? item.tintable : mats;
  return listed.filter((m) => m in TINTS && (!mats.length || mats.includes(m)));
}

/** Cache key for an item's files, so a re-export shows up without a hard reload. */
export function version(item: CatalogItem): string {
  return `${item.bytes ?? 0}-${item.tris ?? 0}`;
}
