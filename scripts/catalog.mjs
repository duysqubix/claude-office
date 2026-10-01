// Builds client/public/models/catalog.json from the models themselves:
//   - every *.glb in client/public/models (size, triangles, materials, nodes, real bounding box)
//   - sidecar metadata in assets/catalog/<id>.json (name, category, artist, tags, tintable, anchors)
//   - planned-but-not-built ids from docs/ASSETS.md (so the catalog shows progress)
//   - thumbnails derived from snaps/blender/<id>.png (macOS `sips`)
//   npm run catalog
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const MODELS = join(ROOT, 'client/public/models');
const THUMBS = join(MODELS, 'thumbs');
const SIDECARS = join(ROOT, 'assets/catalog');
const PREVIEWS = join(ROOT, 'snaps/blender');
mkdirSync(THUMBS, { recursive: true });

// ── GLB inspection ─────────────────────────────────────────────────────────────

function readGlb(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB');
  const jsonLen = buf.readUInt32LE(12);
  return { json: JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8')), bytes: buf.length };
}

const mul = (a, b) => {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
};
function trs(node) {
  if (node.matrix) return node.matrix;
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
const apply = (m, [x, y, z]) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];

function inspect(gltf) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let tris = 0;
  const nodeNames = [];
  const visit = (index, parent) => {
    const node = gltf.nodes[index];
    if (node.name) nodeNames.push(node.name);
    const m = mul(parent, trs(node));
    if (node.mesh !== undefined) {
      for (const prim of gltf.meshes[node.mesh].primitives) {
        const pos = gltf.accessors[prim.attributes.POSITION];
        if (prim.mode === undefined || prim.mode === 4) {
          tris += Math.floor((prim.indices !== undefined ? gltf.accessors[prim.indices].count : pos.count) / 3);
        }
        if (!pos.min || !pos.max) continue;
        for (let i = 0; i < 8; i++) {
          const p = apply(m, [i & 1 ? pos.max[0] : pos.min[0], i & 2 ? pos.max[1] : pos.min[1], i & 4 ? pos.max[2] : pos.min[2]]);
          for (let a = 0; a < 3; a++) {
            min[a] = Math.min(min[a], p[a]);
            max[a] = Math.max(max[a], p[a]);
          }
        }
      }
    }
    for (const child of node.children ?? []) visit(child, m);
  };
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const scene = gltf.scenes?.[gltf.scene ?? 0];
  for (const root of scene?.nodes ?? []) visit(root, identity);
  const r = (v) => Math.round(v * 1000) / 1000;
  return {
    dims: Number.isFinite(min[0]) ? { w: r(max[0] - min[0]), h: r(max[1] - min[1]), d: r(max[2] - min[2]) } : null,
    bbox: Number.isFinite(min[0]) ? { min: min.map(r), max: max.map(r) } : null,
    tris,
    materials: (gltf.materials ?? []).map((m) => m.name ?? '?'),
    nodes: nodeNames,
    textures: (gltf.images ?? []).length,
  };
}

// ── Planned ids from docs/ASSETS.md ────────────────────────────────────────────

function planned() {
  const out = new Map();
  const md = readFileSync(join(ROOT, 'docs/ASSETS.md'), 'utf8');
  let artist = '';
  let group = '';
  for (const line of md.split('\n')) {
    const h = line.match(/^## (Claude \w+|[^:]+): ([^·(]+)/);
    if (h) {
      artist = h[1].trim();
      group = h[2].trim();
      continue;
    }
    const row = line.match(/^\|\s*([a-z0-9_ /]+?)\s*\|\s*(P[012])\s*\|(.*)\|\s*$/);
    if (!row || !artist) continue;
    for (const id of row[1].split('/').map((s) => s.trim()).filter(Boolean)) {
      out.set(id, { id, artist, group, priority: row[2], notes: row[3].trim() });
    }
  }
  return out;
}

// ── Thumbnails ─────────────────────────────────────────────────────────────────

function thumb(id) {
  const src = join(PREVIEWS, `${id}.png`);
  const dst = join(THUMBS, `${id}.jpg`);
  if (!existsSync(src)) return existsSync(dst) ? `models/thumbs/${id}.jpg` : null;
  if (!existsSync(dst) || statSync(dst).mtimeMs < statSync(src).mtimeMs) {
    try {
      execFileSync('sips', ['-Z', '480', '-s', 'format', 'jpeg', '-s', 'formatOptions', '82', src, '--out', dst], { stdio: 'ignore' });
    } catch {
      return null;
    }
  }
  return `models/thumbs/${id}.jpg`;
}

// ── Merge ──────────────────────────────────────────────────────────────────────

const plan = planned();
const sidecars = new Map();
if (existsSync(SIDECARS)) {
  for (const f of readdirSync(SIDECARS).filter((f) => f.endsWith('.json'))) {
    try {
      const s = JSON.parse(readFileSync(join(SIDECARS, f), 'utf8'));
      sidecars.set(s.id ?? f.slice(0, -5), s);
    } catch (err) {
      console.warn(`skip bad sidecar ${f}: ${err.message}`);
    }
  }
}
const glbs = new Map(
  existsSync(MODELS) ? readdirSync(MODELS).filter((f) => f.endsWith('.glb')).map((f) => [f.slice(0, -4), join(MODELS, f)]) : [],
);

const items = [];
for (const id of new Set([...plan.keys(), ...sidecars.keys(), ...glbs.keys()])) {
  const p = plan.get(id) ?? {};
  const s = sidecars.get(id) ?? {};
  const item = {
    id,
    name: s.name ?? id.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
    category: s.category ?? null,
    artist: s.artist ?? p.artist ?? null,
    group: p.group ?? null,
    priority: s.priority ?? p.priority ?? null,
    description: s.description ?? p.notes ?? '',
    tags: s.tags ?? [],
    tintable: s.tintable ?? [],
    anchors: s.anchors ?? {},
    status: glbs.has(id) ? (s.status === 'wip' ? 'wip' : 'done') : 'planned',
    file: glbs.has(id) ? `models/${id}.glb` : null,
    thumb: thumb(id),
  };
  if (glbs.has(id)) {
    try {
      const { json, bytes } = readGlb(glbs.get(id));
      Object.assign(item, inspect(json), { bytes });
    } catch (err) {
      item.error = err.message;
    }
  }
  items.push(item);
}

const order = { done: 0, wip: 1, planned: 2 };
items.sort((a, b) => (a.artist ?? '').localeCompare(b.artist ?? '') || order[a.status] - order[b.status] || (a.priority ?? 'P9').localeCompare(b.priority ?? 'P9') || a.id.localeCompare(b.id));
const count = (k) => items.reduce((acc, i) => ((acc[i[k] ?? '?'] = (acc[i[k] ?? '?'] ?? 0) + 1), acc), {});
const catalog = {
  generated: new Date().toISOString(),
  totals: { all: items.length, ...count('status') },
  byArtist: count('artist'),
  items,
};
// Write-then-rename so a reader (or a concurrent run) never sees a half-written file.
const tmp = join(MODELS, `.catalog.${process.pid}.json`);
writeFileSync(tmp, JSON.stringify(catalog, null, 2) + '\n');
renameSync(tmp, join(MODELS, 'catalog.json'));
console.log(`catalog.json: ${items.length} items · ${JSON.stringify(catalog.totals)}`);
for (const i of items.filter((i) => i.status !== 'planned')) {
  console.log(`  ${i.status === 'done' ? '✔' : '…'} ${i.id.padEnd(22)} ${String(i.tris ?? '?').padStart(6)} tris  ${String(Math.round((i.bytes ?? 0) / 1024)).padStart(5)} KB  ${i.dims ? `${i.dims.w}×${i.dims.d}×${i.dims.h} m` : ''}`);
}
