// Building blocks for the toy-box office: soft plastic materials, rounded primitives,
// a vertex-colour batcher that merges static parts into a few draw calls, and canvas
// textures that redraw themselves once the Fredoka font has loaded.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type Vec3 = [number, number, number];

/** Surface finish of merged parts (per-vertex roughness). All are metalness 0. */
export type Finish = 'matte' | 'soft' | 'gloss';

const ROUGHNESS: Record<Finish, number> = { matte: 0.9, soft: 0.75, gloss: 0.6 };

/**
 * Vertex-coloured soft plastic. Roughness comes from a per-vertex `rough` attribute, so one
 * material (and one draw call per merged batch) covers every finish. A subclass rather than an
 * onBeforeCompile property so that clone() — used when an object fades on its own — keeps it.
 */
export class PlasticMaterial extends THREE.MeshStandardMaterial {
  constructor() {
    super({ vertexColors: true, roughness: 1, metalness: 0 });
    this.name = 'plastic';
  }

  override onBeforeCompile(shader: THREE.WebGLProgramParametersWithUniforms): void {
    shader.vertexShader =
      'attribute float rough;\nvarying float vRough;\n' +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvRough = rough;');
    shader.fragmentShader =
      'varying float vRough;\n' +
      shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor *= vRough;');
  }

  override customProgramCacheKey(): string {
    return 'office-plastic';
  }
}

let plastic: PlasticMaterial | null = null;

/** The shared plastic material. Clone it if an object needs to fade on its own. */
export function plasticMaterial(): PlasticMaterial {
  plastic ??= new PlasticMaterial();
  return plastic;
}

export interface PartOpts {
  at?: Vec3;
  rot?: Vec3;
  scale?: Vec3 | number;
  finish?: Finish;
  /** Cast shadows (default true). Tiny details skip it. */
  cast?: boolean;
  /** Extra transform applied after at/rot/scale (build parts in a local frame). */
  parent?: THREE.Matrix4;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export function partMatrix(o: PartOpts, out = new THREE.Matrix4()): THREE.Matrix4 {
  const at = o.at ?? [0, 0, 0];
  const rot = o.rot ?? [0, 0, 0];
  const sc = o.scale ?? 1;
  _p.set(at[0], at[1], at[2]);
  _q.setFromEuler(_e.set(rot[0], rot[1], rot[2]));
  if (typeof sc === 'number') _s.setScalar(sc);
  else _s.set(sc[0], sc[1], sc[2]);
  return out.compose(_p, _q, _s);
}

const geoCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

/** Cached primitive geometries (never mutate them; Batch clones before transforming). */
export const G = {
  rbox(w: number, h: number, d: number, r = 0.04, seg = 3): THREE.BufferGeometry {
    const rr = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
    return cached(`rb${w},${h},${d},${rr},${seg}`, () => new RoundedBoxGeometry(w, h, d, seg, rr));
  },
  sphere(ws = 24, hs = 16): THREE.BufferGeometry {
    return cached(`sp${ws},${hs}`, () => new THREE.SphereGeometry(1, ws, hs));
  },
  hemisphere(ws = 24, hs = 10): THREE.BufferGeometry {
    return cached(`hs${ws},${hs}`, () => new THREE.SphereGeometry(1, ws, hs, 0, Math.PI * 2, 0, Math.PI / 2));
  },
  cyl(rt: number, rb: number, h: number, seg = 24): THREE.BufferGeometry {
    return cached(`cy${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
  },
  capsule(r: number, len: number, cap = 6, radial = 16): THREE.BufferGeometry {
    return cached(`ca${r},${len},${cap},${radial}`, () => new THREE.CapsuleGeometry(r, len, cap, radial));
  },
  torus(R: number, t: number, arc = Math.PI * 2, rs = 10, ts = 28): THREE.BufferGeometry {
    return cached(`to${R},${t},${arc},${rs},${ts}`, () => new THREE.TorusGeometry(R, t, rs, ts, arc));
  },
  /** Rounded "pill" disc: a short cylinder with soft edges (lathe profile), axis +Y, centred. */
  puck(r: number, h: number, edge = Math.min(r, h) * 0.45, seg = 32): THREE.BufferGeometry {
    return cached(`pk${r},${h},${edge},${seg}`, () => {
      const pts: THREE.Vector2[] = [];
      const hh = h / 2;
      pts.push(new THREE.Vector2(0, -hh));
      const steps = 5;
      for (let i = 0; i <= steps; i++) {
        const a = -Math.PI / 2 + (i / steps) * (Math.PI / 2);
        pts.push(new THREE.Vector2(r - edge + Math.cos(a) * edge, -hh + edge + Math.sin(a) * edge));
      }
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * (Math.PI / 2);
        pts.push(new THREE.Vector2(r - edge + Math.cos(a) * edge, hh - edge + Math.sin(a) * edge));
      }
      pts.push(new THREE.Vector2(0, hh));
      return new THREE.LatheGeometry(pts, seg);
    });
  },
  /** Flat rounded-rectangle slab (rugs, paths, mats): w × d footprint, h tall, centred, soft bevelled edge. */
  slab(w: number, d: number, h: number, corner: number, bevel = Math.min(h / 2, 0.012)): THREE.BufferGeometry {
    return cached(`sl${w},${d},${h},${corner},${bevel}`, () => {
      const cw = w / 2 - bevel;
      const cd = d / 2 - bevel;
      const r = Math.max(0.001, Math.min(corner, cw, cd));
      const s = new THREE.Shape();
      s.moveTo(-cw + r, -cd);
      s.lineTo(cw - r, -cd);
      s.absarc(cw - r, -cd + r, r, -Math.PI / 2, 0, false);
      s.lineTo(cw, cd - r);
      s.absarc(cw - r, cd - r, r, 0, Math.PI / 2, false);
      s.lineTo(-cw + r, cd);
      s.absarc(-cw + r, cd - r, r, Math.PI / 2, Math.PI, false);
      s.lineTo(-cw, -cd + r);
      s.absarc(-cw + r, -cd + r, r, Math.PI, Math.PI * 1.5, false);
      const g = new THREE.ExtrudeGeometry(s, {
        depth: Math.max(0.0005, h - bevel * 2),
        bevelEnabled: bevel > 0,
        bevelThickness: bevel,
        bevelSize: bevel,
        bevelSegments: 2,
        curveSegments: 10,
      });
      g.rotateX(-Math.PI / 2);
      g.translate(0, -h / 2 + bevel, 0);
      return g;
    });
  },
  lathe(key: string, pts: [number, number][], seg = 32): THREE.BufferGeometry {
    return cached(`la${key}`, () => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg));
  },
};

const KEEP = new Set(['position', 'normal', 'uv']);

function prepare(src: THREE.BufferGeometry, matrix: THREE.Matrix4, color: THREE.Color, rough: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const name of KEEP) {
    const a = src.getAttribute(name);
    if (a) g.setAttribute(name, (a as THREE.BufferAttribute).clone());
  }
  const n = g.getAttribute('position').count;
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (src.index) g.setIndex(src.index.clone());
  else {
    const idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  g.applyMatrix4(matrix);
  // A mirroring transform turns triangles inside out: restore the winding.
  if (matrix.determinant() < 0) {
    const idx = g.index!;
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i + 1);
      idx.setX(i + 1, idx.getX(i + 2));
      idx.setX(i + 2, a);
    }
  }
  const cols = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    cols[i * 3] = color.r;
    cols[i * 3 + 1] = color.g;
    cols[i * 3 + 2] = color.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.setAttribute('rough', new THREE.BufferAttribute(new Float32Array(n).fill(rough), 1));
  return g;
}

const _c = new THREE.Color();

/**
 * Collects coloured parts and merges them into one mesh per casts-shadow bucket. Every piece
 * of static furniture goes through here, so a whole desk pod is two draw calls.
 */
export class Batch {
  private buckets = new Map<boolean, THREE.BufferGeometry[]>();

  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, o: PartOpts = {}): this {
    const m = partMatrix(o, _m);
    if (o.parent) m.premultiply(o.parent);
    const g = prepare(geo, m, _c.set(color), ROUGHNESS[o.finish ?? 'soft']);
    const cast = o.cast !== false;
    let list = this.buckets.get(cast);
    if (!list) this.buckets.set(cast, (list = []));
    list.push(g);
    return this;
  }

  /** Rounded box centred at `at`. */
  box(w: number, h: number, d: number, color: THREE.ColorRepresentation, o: PartOpts & { r?: number; seg?: number } = {}): this {
    // Corner tessellation scales with the part: big furniture gets round corners, tiny bits a bevel.
    const r = o.r ?? Math.min(0.05, w * 0.25, h * 0.25, d * 0.25);
    const seg = o.seg ?? (r >= 0.04 ? 3 : r >= 0.012 ? 2 : 1);
    return this.add(G.rbox(w, h, d, r, seg), color, o);
  }

  /** Ellipsoid with radii `r` (number or per axis) centred at `at`. */
  ball(r: number | Vec3, color: THREE.ColorRepresentation, o: PartOpts & { ws?: number; hs?: number } = {}): this {
    const s: Vec3 = typeof r === 'number' ? [r, r, r] : r;
    const base = typeof o.scale === 'number' ? [o.scale, o.scale, o.scale] : (o.scale ?? [1, 1, 1]);
    const size = Math.max(s[0] * base[0], s[1] * base[1], s[2] * base[2]);
    const ws = o.ws ?? (size > 0.5 ? 24 : size > 0.12 ? 18 : 12);
    const hs = o.hs ?? Math.max(6, Math.round(ws * 0.66));
    return this.add(G.sphere(ws, hs), color, { ...o, scale: [s[0] * base[0], s[1] * base[1], s[2] * base[2]] });
  }

  cyl(rt: number, rb: number, h: number, color: THREE.ColorRepresentation, o: PartOpts & { seg?: number } = {}): this {
    return this.add(G.cyl(rt, rb, h, o.seg ?? 24), color, o);
  }

  /** Flat rounded-rectangle slab centred at `at` (see G.slab). */
  slab(w: number, d: number, h: number, corner: number, color: THREE.ColorRepresentation, o: PartOpts & { bevel?: number } = {}): this {
    return this.add(G.slab(w, d, h, corner, o.bevel), color, o);
  }

  puck(r: number, h: number, color: THREE.ColorRepresentation, o: PartOpts & { edge?: number; seg?: number } = {}): this {
    return this.add(G.puck(r, h, o.edge, o.seg ?? 32), color, o);
  }

  capsule(r: number, len: number, color: THREE.ColorRepresentation, o: PartOpts = {}): this {
    return this.add(G.capsule(r, len), color, o);
  }

  torus(R: number, t: number, color: THREE.ColorRepresentation, o: PartOpts & { arc?: number } = {}): this {
    return this.add(G.torus(R, t, o.arc ?? Math.PI * 2), color, o);
  }

  /** Merge everything into meshes (one per shadow bucket), sharing the plastic material. */
  build(opts: { name?: string; receive?: boolean } = {}): THREE.Group {
    const group = new THREE.Group();
    if (opts.name) group.name = opts.name;
    for (const [cast, list] of this.buckets) {
      const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (list.length > 1) for (const g of list) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mesh = new THREE.Mesh(merged, plasticMaterial());
      mesh.castShadow = cast;
      mesh.receiveShadow = opts.receive ?? true;
      mesh.name = `${opts.name ?? 'batch'}${cast ? '' : '-flat'}`;
      group.add(mesh);
    }
    this.buckets.clear();
    return group;
  }
}

// ---------------------------------------------------------------------------------------------
// Canvas textures and fonts

export const FONT_FAMILY = '"Fredoka", "Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif';
export const MONO_FAMILY = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

export function font(weight: number, px: number, family = FONT_FAMILY): string {
  return `${weight} ${px}px ${family}`;
}

// Every text canvas repaints whenever a web font finishes loading, so nothing stays stuck in
// the fallback font if Fredoka arrives late.
const textCanvases = new Set<CanvasTex>();
function repaintText(): void {
  for (const t of textCanvases) t.redraw();
}
if (typeof document !== 'undefined' && document.fonts) {
  Promise.all([500, 600, 700].map((w) => document.fonts.load(font(w, 32), 'Aa')))
    .catch(() => undefined)
    .then(repaintText);
  document.fonts.addEventListener('loadingdone', repaintText);
}

export type Draw2D = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

/** A CanvasTexture that knows how to repaint itself. */
export class CanvasTex {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly tex: THREE.CanvasTexture;

  constructor(
    readonly width: number,
    readonly height: number,
    private draw: Draw2D,
    anisotropy = 4,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = anisotropy;
    this.redraw();
    textCanvases.add(this);
  }

  redraw(draw?: Draw2D): void {
    if (draw) this.draw = draw;
    this.ctx.save();
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.draw(this.ctx, this.width, this.height);
    this.ctx.restore();
    this.tex.needsUpdate = true;
  }
}

/** Shrink the font until `text` fits in `maxWidth`. Returns the size used. */
export function fitText(ctx: CanvasRenderingContext2D, text: string, weight: number, px: number, maxWidth: number, min = 8): number {
  let size = px;
  ctx.font = font(weight, size);
  while (size > min && ctx.measureText(text).width > maxWidth) {
    size -= 1;
    ctx.font = font(weight, size);
  }
  return size;
}

/** Truncate with an ellipsis so `text` fits in `maxWidth` with the current font. */
export function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxWidth) s = s.slice(0, -1);
  return s + '…';
}

// ---------------------------------------------------------------------------------------------
// Misc

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickR<T>(r: () => number, list: readonly T[]): T {
  return list[Math.floor(r() * list.length) % list.length];
}

/** Lighten (amt > 0) or darken (amt < 0) a hex colour in sRGB space. */
export function shade(hex: string, amt: number): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl, THREE.SRGBColorSpace);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt)), THREE.SRGBColorSpace);
  return '#' + c.getHexString();
}
