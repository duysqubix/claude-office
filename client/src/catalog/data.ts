// Loading catalog.json, spotting what changed between two loads, and remembering which built
// models this browser has already seen (for the "New!" stickers).
import type { Catalog, CatalogItem } from './types';

/** No catalog.json yet (or the server answered with something else). */
export class CatalogMissing extends Error {}

export async function fetchCatalog(): Promise<Catalog> {
  const res = await fetch(`models/catalog.json?t=${Date.now()}`, { cache: 'no-store' });
  // The dev server answers unknown paths with the game's index.html, so check the type too.
  if (res.status === 404 || !(res.headers.get('content-type') ?? '').includes('json')) throw new CatalogMissing();
  if (!res.ok) throw new Error(`the server said ${res.status}`);
  const json = (await res.json()) as Catalog;
  if (!Array.isArray(json.items)) throw new Error('catalog.json has no items list');
  return json;
}

/** Everything a card or the detail panel shows; when it changes, they redraw. */
export function signature(i: CatalogItem): string {
  return JSON.stringify([i.status, i.name, i.priority, i.description, i.thumb, i.file, i.bytes, i.tris, i.dims, i.category, i.tags, i.tintable, i.anchors, i.materials, i.error]);
}

/** Models that became built between two loads (or arrived already built). */
export function landed(prev: Catalog, next: Catalog): CatalogItem[] {
  const before = new Map(prev.items.map((i) => [i.id, i.status]));
  return next.items.filter((i) => i.status === 'done' && before.get(i.id) !== 'done');
}

const SEEN_KEY = 'office.catalog.seen';

/** Built ids this browser saw last time, or null on the first visit. */
export function loadSeen(): Set<string> | null {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

export function saveSeen(ids: Iterable<string>): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...ids]));
  } catch {
    // storage may be unavailable (private mode); the stickers just won't carry over
  }
}
