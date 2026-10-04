// The yard (#48): a paved trail that loops round the south lawn from the door, with places to
// take a break along it (benches under trees, the picnic table and a blanket under string lights,
// two loungers under a parasol, a hammock, the pond and the birdbath); shade trees along the
// hedge with flowering bushes and ferns beneath; flower borders; and a wildflower meadow on every
// empty garden pod slot, which clears when a pod moves in. `Yard` tells the people outside where
// the trail runs and where to sit or stand.
import * as THREE from 'three';
import { PALETTE } from '../style/palette';
import { Batch, pickR, rng, shade } from './kit';
import { INTERN_BENCHES, POD_SLOTS, type PodSlot } from './layout';
import { aabb, footprint, type WorldCtx } from './ctx';
import type { AABB, Yard, YardSeat, YardStand } from './types';
import type { Decor } from './decor';
import { staticProp, sway, tallProp } from './props';
import { findNode } from '../models';
import { disposeGroup, instancedModel, placement, swapModel, type InstancedModel, type InstancedOptions } from './modelkit';
import { buildBush, buildGrassTuft, buildParkBench, buildTree } from './outdoor';

/** Half the trail's paved width (m). */
const TRAIL_HALF = 0.56;
/**
 * The catalog's stepping stones ([w, d] in metres): two big shapes and a small one. Their tops are
 * 3.1 cm up and their sides sink 3 cm; sunk 1.5 cm here, the tops sit 3.6 cm clear of the lawn
 * (y = -0.02), so the two never fight for depth, and the sides still reach below it.
 */
const STONES = { stepping_stone_a: [0.6, 0.48], stepping_stone_b: [0.48, 0.343], stepping_stone_c: [0.607, 0.48] } as const;
const STONE_SINK = 0.015;
/** The main path's paving (outdoor.ts): the trail crosses it on that paving, not its own. */
const MAIN_PATH_HALF = 1.75;
/** How far from the trail planting ever needs to look (m): past this, it's just "far". */
const TRAIL_REACH = 2.5;

/**
 * The trail's centre line, a closed loop: from the door east along the building, down the east
 * lawn past the loungers and the picnic, back along the hedge (across the main path just inside
 * the gate), up the west lawn past the hammock and the pond, and along the building to the door.
 * It keeps clear of every garden pod slot (decks are 4.2 × 4.8 m round POD_SLOTS).
 */
const TRAIL: readonly (readonly [number, number])[] = [
  [0, 12.2],
  [2.6, 12.2],
  [6.5, 12.18],
  [10.5, 12.2],
  [14.0, 12.15],
  [16.6, 11.85],
  [18.8, 11.95],
  [20.25, 12.7],
  [20.55, 14.4],
  [20.8, 15.6],
  [20.45, 17.4],
  [20.9, 19.6],
  [20.6, 22.0],
  [20.35, 23.55],
  [19.2, 24.45],
  [16.5, 24.35],
  [13.5, 24.6],
  [10.4, 24.75],
  [7.3, 24.35],
  [4.3, 24.5],
  [2.4, 24.55],
  [0, 24.55],
  [-2.4, 24.5],
  [-4.6, 24.4],
  [-7.6, 24.7],
  [-10.6, 24.75],
  [-13.6, 24.35],
  [-16.6, 24.55],
  [-19.25, 24.4],
  [-20.4, 23.5],
  [-20.65, 21.6],
  [-20.95, 20.0],
  [-20.4, 18.0],
  [-20.95, 16.0],
  [-20.5, 14.2],
  [-20.3, 12.75],
  [-18.7, 11.9],
  [-16.5, 11.85],
  [-14.0, 12.2],
  [-10.5, 12.18],
  [-6.5, 12.2],
  [-2.6, 12.2],
];

/** Garden trees cycle through the catalog's three kinds. */
const TREE_IDS = ['tree_round', 'tree_pine', 'tree_round', 'tree_blossom', 'tree_round'];

/**
 * Shade trees: along the hedge all round, two over the trail's benches, one each side of the
 * gate, and the ones by the door and the building's corners. [x, z, size, catalog id]: big oaks
 * (6 m across, a canopy you walk under) shade the yoga corner and both benches.
 */
const TREES: readonly (readonly [number, number, number, string?])[] = [
  [16.2, 10.55, 0.95],
  [-16.2, 10.55, 0.9],
  [23.0, 12.5, 1.15],
  [23.3, 16.95, 1.0],
  [23.0, 26.3, 1.0, 'tree_oak'],
  [-23.0, 12.6, 1.0],
  [-23.4, 18.95, 1.05],
  [-22.6, 25.95, 1.2],
  [3.6, 26.35, 1.0],
  [8.2, 26.5, 1.0, 'tree_oak'],
  [14.5, 26.5, 1.0],
  [18.6, 26.6, 1.15],
  [-8.4, 26.5, 1.0, 'tree_oak'],
  [-14.8, 26.45, 1.1],
  [-18.4, 26.65, 0.95],
  [-22.4, -1.6, 1.05],
  [22.6, -1.8, 0.95],
  [23.3, 5.4, 1.0],
  [-23.3, 5.6, 1.05],
  [23.4, -8.6, 1.0],
  [-23.4, -8.4, 0.95],
  [-21.6, -12.4, 1.2],
  [21.8, -12.8, 1.1],
  [-15.2, -13.7, 1.0],
  [-11.3, -14.2, 0.95],
  [-7.2, -13.6, 1.15],
  [-3.3, -14.3, 1.05],
  [0.6, -13.9, 0.95],
  [4.3, -14.2, 0.9],
  [8.0, -13.7, 1.1],
  [11.8, -14.25, 1.0],
  [15.6, -13.5, 1.0],
];

/** Petal colours for the procedural flowers (the catalog's come mixed too). */
const PETALS = ['#FF9DCB', '#FFE066', '#FFFDF7', '#B983FF', '#FF6B6B'];

/** The office clock (local time, as the HUD shows); `?hour=21` pretends, as the audio and the regulars do. */
const FORCED_HOUR = (() => {
  const h = Number(new URLSearchParams(location.search).get('hour') ?? NaN);
  return Number.isInteger(h) && h >= 0 && h < 24 ? h : null;
})();

/** How lit the garden's lights are on the office clock: 0 by day, 1 from 19:00 (the HUD's moon) to 06:00, easing over the hour either side. */
export function duskLevel(now = new Date()): number {
  const h = FORCED_HOUR !== null ? FORCED_HOUR + 0.5 : now.getHours() + now.getMinutes() / 60;
  if (h >= 19 || h < 6) return 1;
  if (h >= 18) return h - 18;
  if (h < 7) return 7 - h;
  return 0;
}

export interface Outdoor {
  /** The break spots for the people outside (World.yard). */
  yard: Yard;
  /** The meadow on an empty garden pod slot, cleared when a pod moves in (DeskSystem.reserve). */
  patch(slot: PodSlot): Decor | undefined;
}

interface Scatters {
  /** The trail's stepping stones, one scatter per catalog shape. */
  stones: Record<keyof typeof STONES, Scatter>;
  tufts: Scatter;
  tallGrass: Scatter;
  wildflowers: Scatter;
  ferns: Scatter;
  bushes: Scatter;
  blooms: Scatter;
  hydrangeas: Scatter;
  lavender: Scatter;
  sunflowers: Scatter;
  rocks: Scatter;
}

export function buildYard(world: WorldCtx): Outdoor {
  // Everything the yard draws goes in one group (colliders, fades and tickers are the world's).
  const root = new THREE.Group();
  root.name = 'yard';
  world.root.add(root);
  const ctx: WorldCtx = { ...world, root };
  const curve = new THREE.CatmullRomCurve3(
    TRAIL.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    true,
    'centripetal',
  );
  const plot = new Plot(ctx, curve);
  const seats: YardSeat[] = [];
  const stands: YardStand[] = [];
  // Nothing planted out here casts: the sun's shadow map only covers the building.
  const stone = (id: keyof typeof STONES) =>
    new Scatter(ctx, id, id, (b) => b.add(paverGeometry(STONES[id][0], STONES[id][1], 0.06, 0.09, 0.014), '#F4E6CC', { cast: false, finish: 'matte', flat: true }), { shadows: false });
  const scatter: Scatters = {
    stones: { stepping_stone_a: stone('stepping_stone_a'), stepping_stone_b: stone('stepping_stone_b'), stepping_stone_c: stone('stepping_stone_c') },
    tufts: new Scatter(ctx, 'yard-tufts', 'grass_tuft', (b) => buildGrassTuft(b, rng(5)), { shadows: false, bend: true, chunk: CHUNK }),
    tallGrass: new Scatter(ctx, 'tall-grass', 'tall_grass', (b) => buildTallGrass(b, rng(17)), { shadows: false, fit: { h: 0.75, uniform: true }, bend: true, chunk: CHUNK }),
    wildflowers: new Scatter(ctx, 'wildflowers', 'wildflowers', (b) => buildWildflowers(b, rng(40)), { shadows: false, fit: { w: 0.5, uniform: true }, bend: true, chunk: CHUNK }),
    ferns: new Scatter(ctx, 'ground-ferns', null, (b) => buildGroundFern(b, rng(23)), { shadows: false, bend: true }),
    bushes: new Scatter(ctx, 'yard-bushes', 'bush_round', (b) => buildBush(b, 0.62, rng(31)), { shadows: false }),
    blooms: new Scatter(ctx, 'flowering-bushes', 'bush_flowering', (b) => buildFloweringBush(b, rng(60)), { shadows: false, fit: { w: 1.3, uniform: true } }),
    hydrangeas: new Scatter(ctx, 'hydrangeas', 'hydrangea_bush', (b) => buildHydrangea(b, rng(64)), { shadows: false }),
    lavender: new Scatter(ctx, 'lavender', 'lavender_row', (b) => buildLavenderRow(b, rng(66)), { shadows: false, bend: true }),
    sunflowers: new Scatter(ctx, 'sunflowers', 'sunflower_clump', (b) => buildSunflowers(b, rng(68)), { shadows: false }),
    rocks: new Scatter(ctx, 'yard-rocks', 'rock_cluster', (b) => buildRocks(b, rng(77)), { shadows: false }),
  };

  // ---- Stops ---------------------------------------------------------------------------------
  // Seats sharing a `group` belong together, so two people out on a break can sit and chat;
  // `lit` ones are under the string lights, where the night owls go.
  // East lawn: two loungers under a parasol, then the picnic table and a blanket under string lights.
  const loungers: [number, number, string, number][] = [
    [21.9, 15.1, '#5CC8FF', 21.12],
    [23.6, 15.1, '#FFC94A', 22.88],
  ];
  for (const [x, z, cushion, ax] of loungers) {
    const g = staticProp(ctx, 'sun-lounger', (b) => buildSunLounger(b, cushion), { at: [x, z] });
    void swapModel(ctx, g, 'sun_lounger', { tint: { Cushion: cushion } });
    ctx.colliders.push(footprint(x, z, 0.77, 1.9));
    ctx.blobs.add(x, z, 0.95, 2.1);
    // The catalog lounger's `lie` anchor: the pelvis joint of someone on their back, head end raised at -Z.
    seats.push({ kind: 'lounger', pose: 'lie', group: 'loungers', position: new THREE.Vector3(x, 0.568, z - 0.12), yaw: 0, approach: new THREE.Vector3(ax, 0, z + 0.35) });
  }
  plot.keepOut(aabb(21.4, 24.1, 13.6, 16.5));
  const parasol = tallProp(ctx, 'parasol', (b) => buildParasol(b), { at: [22.75, 14.25], yaw: 0.25 });
  void swapModel(ctx, parasol, 'parasol');
  ctx.colliders.push(footprint(22.75, 14.25, 0.5, 0.5));
  ctx.blobs.add(22.75, 14.4, 2.4, 2.4, { shape: 'round' });

  const table = staticProp(ctx, 'picnic-table', (b) => buildPicnicTable(b), { at: [22.75, 19.0] });
  void swapModel(ctx, table, 'picnic_table', { fit: { w: 1.8, uniform: true } });
  ctx.colliders.push(footprint(22.75, 19.0, 1.8, 1.6));
  ctx.blobs.add(22.75, 19.0, 2.2, 2.0);
  for (const sx of [-0.45, 0.45]) {
    for (const side of [-1, 1]) {
      seats.push({
        kind: 'picnic',
        pose: 'sit',
        group: 'picnic',
        lit: true,
        position: new THREE.Vector3(22.75 + sx, 0.45, 19.0 + side * 0.62),
        yaw: side < 0 ? 0 : Math.PI,
        approach: new THREE.Vector3(22.75 + sx, 0, 19.0 + side * 1.2),
      });
    }
  }
  // The blanket south of the table, the basket and thermos at its back corner (the catalog's),
  // with room to walk between it and the table's light posts: the way out from the table's
  // south side.
  const blanketAt: [number, number] = [22.6, 22.5];
  const blanketYaw = 0.08;
  const onBlanket = (x: number, z: number) => {
    const c = Math.cos(blanketYaw);
    const s = Math.sin(blanketYaw);
    return new THREE.Vector3(blanketAt[0] + x * c + z * s, 0, blanketAt[1] - x * s + z * c);
  };
  const blanket = staticProp(ctx, 'picnic-blanket', (b) => buildPicnicBlanket(b), { at: blanketAt, yaw: blanketYaw });
  void swapModel(ctx, blanket, 'picnic_blanket');
  // Its sit anchors, everyone facing the plate.
  const sits = (
    [
      [-0.56, 0.38],
      [0.5, 0.4],
      [0.64, -0.38],
    ] as const
  ).map(([x, z]) => ({ at: onBlanket(x, z), yaw: Math.atan2(0.1 - x, -0.02 - z) + blanketYaw }));
  // Where they sit is solid, like a table: the three spots and the plate between them, 0.2 m
  // round, so no walk is ever planned through someone sitting there (#88).
  const xs = sits.map((s) => s.at.x);
  const zs = sits.map((s) => s.at.z);
  const zone = aabb(Math.min(...xs) - 0.2, Math.max(...xs) + 0.2, Math.min(...zs) - 0.2, Math.max(...zs) + 0.2);
  ctx.colliders.push(zone);
  for (const { at, yaw } of sits) {
    // They sit down from straight behind their spot, 0.3 m out from the solid part (the nav's own
    // margin): a short hop forward, as at the table.
    const bx = -Math.sin(yaw);
    const bz = -Math.cos(yaw);
    const toX = bx < 0 ? (at.x - zone.minX + 0.3) / -bx : (zone.maxX + 0.3 - at.x) / bx;
    const toZ = bz < 0 ? (at.z - zone.minZ + 0.3) / -bz : (zone.maxZ + 0.3 - at.z) / bz;
    const back = Math.min(toX, toZ);
    seats.push({
      kind: 'blanket',
      pose: 'ground',
      group: 'blanket',
      lit: true,
      position: at.clone().setY(0.1),
      yaw,
      approach: new THREE.Vector3(at.x + bx * back, 0, at.z + bz * back),
    });
  }
  plot.keepOut(aabb(21.4, 24.1, 17.0, 23.5));
  // String lights in an X over the table: two strands, each between its own pair of posts.
  const lights = buildStringLights(ctx, [
    [
      [21.5, 17.15],
      [23.95, 20.31],
    ],
    [
      [23.95, 17.15],
      [21.5, 20.31],
    ],
  ]);

  // West lawn: the pond with the birdbath and a boulder to sit on, then the hammock.
  const pondAt: [number, number] = [-22.85, 15.6];
  const pond = staticProp(ctx, 'pond', (b) => buildPond(b), { at: pondAt, yaw: Math.PI / 2 });
  void swapModel(ctx, pond, 'pond', { fit: { w: 3.1, uniform: true } });
  ctx.colliders.push(footprint(pondAt[0], pondAt[1], 1.8, 2.9));
  for (const dz of [-0.65, 0.65]) {
    seats.push({ kind: 'pond', pose: 'ground', group: 'pond', position: new THREE.Vector3(-21.62, 0.1, pondAt[1] + dz), yaw: -Math.PI / 2, approach: new THREE.Vector3(-21.2, 0, pondAt[1] + dz) });
  }
  // The catalog boulder's flat top (`seat` anchor) at the pond's north end, looking over the water.
  const boulderAt: [number, number] = [-22.1, 13.35];
  const boulder = staticProp(ctx, 'boulder', (b) => buildBoulder(b), { at: boulderAt, yaw: 0.4 });
  void swapModel(ctx, boulder, 'rock_large');
  ctx.colliders.push(footprint(boulderAt[0], boulderAt[1], 1.0, 0.85));
  ctx.blobs.add(boulderAt[0], boulderAt[1], 1.4, 1.2, { shape: 'round' });
  seats.push({ kind: 'pond', pose: 'sit', group: 'pond', position: new THREE.Vector3(boulderAt[0], 0.46, boulderAt[1] + 0.05), yaw: Math.atan2(pondAt[0] - boulderAt[0], pondAt[1] - boulderAt[1]), approach: new THREE.Vector3(-21.25, 0, 13.75) });
  plot.keepOut(aabb(-24.1, -21.4, 12.8, 17.3));
  const bath = staticProp(ctx, 'birdbath', (b) => buildBirdbath(b), { at: [-23.3, 17.85] });
  void swapModel(ctx, bath, 'birdbath', { fit: { h: 1.0, uniform: true } });
  ctx.colliders.push(footprint(-23.3, 17.85, 0.6, 0.6));
  ctx.blobs.add(-23.3, 17.85, 0.9, 0.9, { shape: 'round' });
  plot.keepOut(aabb(-24.1, -22.6, 17.3, 18.5));

  const hammockAt: [number, number] = [-22.75, 21.25];
  const hammock = buildHammock(ctx, hammockAt);
  // The catalog hammock's `lie` anchor; its head end (-X) lies to the south, so feet point north.
  seats.push({
    kind: 'hammock',
    pose: 'lie',
    position: new THREE.Vector3(hammockAt[0], 0.725, hammockAt[1] - 0.1),
    yaw: Math.PI,
    approach: new THREE.Vector3(-21.7, 0, hammockAt[1] + 0.2),
    carrier: hammock.carrier,
  });
  plot.keepOut(aabb(-24.1, -21.4, 19.4, 23.1));

  // Back hedge: a bench under an oak each side of the gate, looking back up the lawn.
  for (const [x, group] of [
    [10.9, 'bench-east'],
    [-10.9, 'bench-west'],
  ] as const) {
    const z = 25.85;
    const bench = staticProp(ctx, 'park-bench', (pb) => buildParkBench(pb), { at: [x, z], yaw: Math.PI });
    void swapModel(ctx, bench, 'park_bench', { fit: { w: 1.6, uniform: true } });
    ctx.colliders.push(footprint(x, z, 1.7, 0.7));
    ctx.blobs.add(x, z, 2.0, 1.0);
    for (const sx of [-0.45, 0.45]) {
      seats.push({ kind: 'bench', pose: 'sit', group, position: new THREE.Vector3(x + sx, 0.45, z - 0.02), yaw: Math.PI, approach: new THREE.Vector3(x + sx, 0, z - 0.7) });
    }
    plot.keepOut(aabb(x - 1.1, x + 1.1, 25.25, 26.35));
  }
  // The bench by the main path (outdoor.ts) faces the path.
  for (const dz of [-0.45, 0.45]) {
    seats.push({ kind: 'bench', pose: 'sit', group: 'bench-path', position: new THREE.Vector3(2.53, 0.47, 17.2 + dz), yaw: -Math.PI / 2, approach: new THREE.Vector3(1.95, 0, 17.2 + dz) });
  }

  // Rose arches where the trail leaves the main path by the door, the trail running through them.
  for (const x of [3.3, -3.3]) {
    const arch = tallProp(ctx, 'rose-arch', (b) => buildRoseArch(b), { at: [x, 12.2], yaw: Math.PI / 2 });
    void swapModel(ctx, arch, 'rose_arch');
    // Only the posts are solid: 0.75 m either side of the walk-through.
    for (const s of [-1, 1]) ctx.colliders.push(aabb(x - 0.28, x + 0.28, 12.2 + s * 0.75 - 0.07, 12.2 + s * 0.75 + 0.07));
    plot.keepOut(aabb(x - 0.45, x + 0.45, 11.0, 13.4));
  }

  // Two yoga mats side by side in the shade of the oak in the south-east corner.
  for (const [z, accent] of [
    [24.25, '#5CC8FF'],
    [25.1, '#FF9DCB'],
  ] as const) {
    const mat = staticProp(ctx, 'yoga-mat', (b) => buildYogaMat(b, accent), { at: [22.75, z], yaw: Math.PI });
    void swapModel(ctx, mat, 'yoga_mat', { tint: { Accent: accent } });
    stands.push({ position: new THREE.Vector3(22.75, 0, z), yaw: -Math.PI / 2, group: 'yoga' });
  }
  plot.keepOut(aabb(21.6, 24.1, 23.5, 25.6));

  // Places to stand about, just off the trail, each looking at something; pairs face each other
  // for a chat, and some join a group of seats.
  const stand = (x: number, z: number, tx: number, tz: number, group?: string, lit?: boolean) => {
    stands.push({ position: new THREE.Vector3(x, 0, z), yaw: Math.atan2(tx - x, tz - z), group, lit });
    plot.taken(x, z, 0.45);
  };
  stand(21.45, 18.7, 22.75, 18.7, 'picnic', true);
  stand(21.3, 13.25, 22.4, 14.6, 'loungers');
  stand(-21.25, 17.75, -23.3, 17.85, 'pond');
  stand(12.8, 25.45, 10.9, 25.85, 'bench-east');
  stand(-12.8, 25.45, -10.9, 25.85, 'bench-west');
  stand(16.85, 10.85, 17.85, 10.85, 'chat-east');
  stand(17.85, 10.85, 16.85, 10.85, 'chat-east');
  stand(-16.85, 10.85, -17.85, 10.85, 'chat-west');
  stand(-17.85, 10.85, -16.85, 10.85, 'chat-west');
  stand(-22.2, 23.6, -18.0, 19.0);
  stand(2.95, 25.9, 0, 18.0);

  // ---- Trees (each fades on its own, so none can hide the manager) --------------------------
  TREES.forEach(([x, z, s, id], i) => {
    const r = rng(900 + i);
    // The oak is the catalog's at its own size (4.9 m tall, 6 m across); the rest fit 3.9 m.
    const oak = id === 'tree_oak';
    const t = tallProp(ctx, `tree-${i}`, (tb) => buildTree(tb, oak ? 1.3 : s, r), { at: [x, z] });
    void swapModel(ctx, t, id ?? TREE_IDS[i % TREE_IDS.length], { fit: { h: (oak ? 4.9 : 3.9) * s, uniform: true }, yaw: r() * 6 });
    sway(ctx, t, oak ? 0.008 : 0.012, r());
    const trunk = oak ? 0.7 : 0.5 * s;
    ctx.colliders.push(footprint(x, z, trunk, trunk));
    ctx.blobs.add(x, z, (oak ? 5.2 : 3.6) * s, (oak ? 5.2 : 3.6) * s, { shape: 'round' });
    plot.taken(x, z, oak ? 0.7 : 0.45 * s);
  });

  // ---- The trail -----------------------------------------------------------------------------
  layPavers(curve, scatter, plot);
  const loopLen = curve.getLength();
  const trail = curve.getSpacedPoints(Math.round(loopLen)).slice(0, -1);

  // ---- Planting ------------------------------------------------------------------------------
  const pr = rng(4848);
  // Under each tree: flowering bushes, ferns and the odd rock, wherever there's room.
  for (const [x, z, s, id] of TREES) {
    if (id === 'tree_oak') continue;
    const n = 4 + Math.floor(pr() * 4);
    for (let k = 0; k < n; k++) {
      const a = pr() * Math.PI * 2;
      const d = (0.95 + pr() * 1.0) * s;
      understory(ctx, scatter, plot, pr, pickUnderstory(pr, k > 0), x + Math.cos(a) * d, z + Math.sin(a) * d);
    }
  }
  // Sunflowers against the back hedge, turned to face up the lawn.
  const sr = rng(5313);
  for (let x = -23; x <= 23; x += 2.2 + sr() * 1.6) {
    const z = 27.1 - 0.4 - sr() * 0.25;
    if (plot.free(x, z, 0.4)) {
      scatter.sunflowers.add(x, z, Math.PI + (sr() - 0.5) * 0.5, 0.9 + sr() * 0.2);
      plot.taken(x, z, 0.4);
    }
  }
  // Then along the hedge, all the way round: each plant set in from it by its own room, so the
  // big flowering bushes fit as well as the ferns.
  const edge = 0.35;
  for (let t = -24; t <= 24; t += 1.0) {
    const south = pickUnderstory(pr, true);
    understory(ctx, scatter, plot, pr, south, t + pr() * 0.4, 27.1 - UNDERSTORY_ROOM[south] - pr() * edge);
    const north = pickUnderstory(pr, true);
    understory(ctx, scatter, plot, pr, north, t + pr() * 0.4, -15.1 + UNDERSTORY_ROOM[north] + pr() * edge);
  }
  for (let t = -14.5; t <= 26.5; t += 1.0) {
    for (const side of [-1, 1]) {
      const kind = pickUnderstory(pr, true);
      understory(ctx, scatter, plot, pr, kind, side * (24.1 - UNDERSTORY_ROOM[kind] - pr() * edge), t + pr() * 0.4);
    }
  }
  // Lavender rows either side of the main path, end to end from the door to the gate.
  for (const side of [-1, 1]) {
    for (let z = 13.9; z + 0.85 < 23.6; z += 1.8) {
      const x = side * 3.45;
      const zc = z + 0.85;
      if (plot.solid(x, zc, 0.3) || plot.solid(x, zc - 0.85, 0.3) || plot.solid(x, zc + 0.85, 0.3)) continue;
      scatter.lavender.add(x, zc, Math.PI / 2 + (side < 0 ? Math.PI : 0), 1);
      plot.keepOut(aabb(x - 0.3, x + 0.3, zc - 0.9, zc + 0.9));
    }
  }
  // Flowers along the trail's edges.
  const fr = rng(5150);
  for (let s = 0; s < loopLen; s += 0.7 + fr() * 0.6) {
    const u = s / loopLen;
    const p = curve.getPointAt(u);
    const tan = curve.getTangentAt(u);
    const side = fr() < 0.5 ? -1 : 1;
    const off = (TRAIL_HALF + 0.36 + fr() * 0.25) * side;
    flowers(scatter, plot, fr, p.x + tan.z * off, p.z - tan.x * off);
  }

  // ---- The meadow ---------------------------------------------------------------------------
  const all = allOf(scatter);
  const patches = sowMeadow(ctx, scatter, all, plot);

  for (const s of all) s.build();

  // The string lights come up at dusk on the office clock; the hammock rocks in the breeze.
  let level = duskLevel();
  let checked = 0;
  ctx.tickers.push((dt, t) => {
    if (t - checked > 5) {
      checked = t;
      level = duskLevel();
    }
    lights.setLevel(level, dt);
    hammock.update(t);
    for (const s of all) s.bend(ctx.focus, dt);
  });

  return {
    // The gate stays shut: people out on a break come and go just inside it, on the main path.
    yard: { trail, trailWidth: TRAIL_HALF * 2, seats, stands, gate: new THREE.Vector3(0, 0, 26.6) },
    patch: (slot) => patches.get(slot),
  };
}

function allOf(s: Scatters): Scatter[] {
  return [...Object.values(s.stones), s.tufts, s.tallGrass, s.ferns, s.bushes, s.rocks, s.wildflowers, s.blooms, s.hydrangeas, s.lavender, s.sunflowers];
}

// ---------------------------------------------------------------------------------------------
// Placement

/** True if (x, z) is on (or within `pad` of) a garden pod slot's deck. */
function inSlot(x: number, z: number, pad: number): boolean {
  return POD_SLOTS.some((s) => s.outdoor && Math.abs(x - s.x) < 2.1 + pad && Math.abs(z - s.z) < 2.4 + pad);
}

/** Key of a 1 m grid cell. */
function cell(gx: number, gz: number): number {
  return (gx + 512) * 1024 + (gz + 512);
}

/**
 * What's already on the ground, so new planting never lands on the trail, a stop, a pod slot, a
 * collider or another plant. Planted things and the trail's segments are hashed by 1 m cell, so
 * the thousands of meadow checks stay quick.
 */
class Plot {
  private readonly rects: AABB[] = [];
  /** Planted things by 1 m cell. */
  private readonly round = new Map<number, { x: number; z: number; r: number }[]>();
  private biggest = 0;
  /** The trail's centre line as a polyline (x, z pairs), and its segments near each 1 m cell. */
  private readonly line: number[] = [];
  private readonly near = new Map<number, number[]>();

  constructor(
    private readonly ctx: WorldCtx,
    curve: THREE.CatmullRomCurve3,
  ) {
    for (const p of curve.getSpacedPoints(Math.round(curve.getLength() / 0.25))) this.line.push(p.x, p.z);
    const l = this.line;
    for (let i = 0; i < l.length; i += 2) {
      const j = (i + 2) % l.length;
      const reach = TRAIL_REACH;
      for (let gx = Math.floor(Math.min(l[i], l[j]) - reach); gx <= Math.floor(Math.max(l[i], l[j]) + reach); gx++) {
        for (let gz = Math.floor(Math.min(l[i + 1], l[j + 1]) - reach); gz <= Math.floor(Math.max(l[i + 1], l[j + 1]) + reach); gz++) {
          const k = cell(gx, gz);
          const list = this.near.get(k);
          if (list) list.push(i);
          else this.near.set(k, [i]);
        }
      }
    }
    // The outdoor intern benches' decks, at their full length.
    for (const b of INTERN_BENCHES) {
      if (b.outdoor) this.rects.push(aabb(b.x0 - 0.8, b.x0 + b.maxPairs * 1.6 + 0.5, b.z - 2.0, b.z + 2.0));
    }
  }

  keepOut(box: AABB): void {
    this.rects.push(box);
  }

  taken(x: number, z: number, r: number): void {
    const k = cell(Math.floor(x), Math.floor(z));
    const list = this.round.get(k);
    if (list) list.push({ x, z, r });
    else this.round.set(k, [{ x, z, r }]);
    this.biggest = Math.max(this.biggest, r);
  }

  /** Distance from (x, z) to the trail's centre line; anything over TRAIL_REACH comes back as TRAIL_REACH. */
  trailDistance(x: number, z: number): number {
    const l = this.line;
    let best = TRAIL_REACH;
    for (const i of this.near.get(cell(Math.floor(x), Math.floor(z))) ?? []) {
      const ax = l[i];
      const az = l[i + 1];
      const dx = l[(i + 2) % l.length] - ax;
      const dz = l[(i + 3) % l.length] - az;
      const k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      best = Math.min(best, Math.hypot(x - ax - dx * k, z - az - dz * k));
    }
    return best;
  }

  /** Inside something solid (a collider). */
  solid(x: number, z: number, r = 0): boolean {
    return this.ctx.colliders.some((b) => x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r);
  }

  /**
   * Room for a plant of radius `r` at (x, z): in the garden, off the trail, the stops, the pod
   * slots (unless `onSlots`: the meadow grows there, and goes when a pod moves in) and everything
   * planted.
   */
  free(x: number, z: number, r: number, onSlots = false): boolean {
    if (Math.abs(x) > 24.1 - r || z > 27.1 - r || z < -15.1 + r) return false;
    // The building and its paved apron, and the main path out to the gate.
    if (Math.abs(x) < 15.1 + r && Math.abs(z) < 11.1 + r) return false;
    if (Math.abs(x) < MAIN_PATH_HALF + 0.15 + r && z > 10) return false;
    if (!onSlots && inSlot(x, z, r + 0.1)) return false;
    for (const b of this.rects) if (x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r) return false;
    if (this.solid(x, z, r)) return false;
    const reach = Math.ceil(r + this.biggest);
    for (let gx = Math.floor(x) - reach; gx <= Math.floor(x) + reach; gx++) {
      for (let gz = Math.floor(z) - reach; gz <= Math.floor(z) + reach; gz++) {
        for (const o of this.round.get(cell(gx, gz)) ?? []) if (Math.hypot(x - o.x, z - o.z) < r + o.r) return false;
      }
    }
    return this.trailDistance(x, z) > TRAIL_HALF + r + 0.12;
  }
}

type Understory = 'bloom' | 'fern' | 'bush' | 'rock';

/** The room each understory plant needs (m). */
const UNDERSTORY_ROOM: Record<Understory, number> = { bloom: 0.62, fern: 0.4, bush: 0.55, rock: 0.5 };

/** Which understory plant comes next: a flowering bush or a fern mostly, a round bush, and (with `rock`) now and then a rock. */
function pickUnderstory(r: () => number, rock: boolean): Understory {
  const roll = r();
  return roll < 0.46 ? 'bloom' : roll < 0.76 ? 'fern' : roll < 0.9 || !rock ? 'bush' : 'rock';
}

/** Plant `kind` at (x, z) if there's room: blooms are flowering bushes or hydrangeas; bushes and rocks are solid. */
function understory(ctx: WorldCtx, scatter: Scatters, plot: Plot, r: () => number, kind: Understory, x: number, z: number): void {
  const room = UNDERSTORY_ROOM[kind];
  if (!plot.free(x, z, room)) return;
  plot.taken(x, z, room);
  if (kind === 'bloom') {
    (r() < 0.5 ? scatter.blooms : scatter.hydrangeas).add(x, z, r() * 6, 0.8 + r() * 0.35);
    ctx.colliders.push(footprint(x, z, 0.8, 0.8));
  } else if (kind === 'fern') {
    scatter.ferns.add(x, z, r() * 6, 0.85 + r() * 0.4);
  } else if (kind === 'bush') {
    scatter.bushes.add(x, z, r() * 6, 0.6 + r() * 0.3);
    ctx.colliders.push(footprint(x, z, 0.75, 0.75));
  } else {
    const s = 0.45 + r() * 0.4;
    scatter.rocks.add(x, z, r() * 6, s);
    ctx.colliders.push(footprint(x, z, 1.1 * s, 1.1 * s));
  }
}

/** A clump of wildflowers (now and then tall grass) at (x, z), if there's room. */
function flowers(scatter: Scatters, plot: Plot, r: () => number, x: number, z: number): void {
  if (!plot.free(x, z, 0.22)) return;
  if (r() < 0.2) scatter.tallGrass.add(x, z, r() * 6, 0.75 + r() * 0.35);
  else scatter.wildflowers.add(x, z, r() * 6, 0.9 + r() * 0.5);
  plot.taken(x, z, 0.22);
}

/** Smooth value noise, about `size` metres a bump, on a grid turned by `turn` so its bumps never line up with the pod slots. */
function noise2(seed: number, size: number, turn: number): (x: number, z: number) => number {
  const r = rng(seed);
  const n = 64;
  const grid = Array.from({ length: n * n }, () => r());
  const at = (i: number, j: number) => grid[(((j % n) + n) % n) * n + (((i % n) + n) % n)];
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  return (x, z) => {
    const u = (x * c - z * s) / size + 17.3;
    const v = (x * s + z * c) / size + 9.1;
    const i = Math.floor(u);
    const j = Math.floor(v);
    let fu = u - i;
    let fv = v - j;
    fu = fu * fu * (3 - 2 * fu);
    fv = fv * fv * (3 - 2 * fv);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * fu;
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fu;
    return a + (b - a) * fv;
  };
}

/** 0 below `a`, 1 above `b`, smooth between. */
function smooth(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * The meadow: one field of wildflowers, tall grass and tufts over the lawns inside the trail and
 * beside the building, drifting thick and thin (and tall and short) on slow noise, turned so it
 * never lines up with the garden pod grid, with a few low mounds and rocks. A plant on or
 * overhanging a pod slot's deck belongs to that slot and goes when a pod moves in; the rest stay.
 * Mounds and rocks only grow well inside a slot, so they always go with it and never stand in a
 * neighbouring pod's way.
 */
function sowMeadow(ctx: WorldCtx, scatter: Scatters, all: Scatter[], plot: Plot): Map<PodSlot, Decor> {
  const r = rng(7001);
  const drift = noise2(71, 6.5, 0.6);
  const fine = noise2(73, 2.3, 1.1);
  const kinds = noise2(79, 4.2, -0.4);
  const slots = POD_SLOTS.filter((s) => s.outdoor);
  const solid = new Map<PodSlot, AABB[]>(slots.map((s) => [s, []]));
  /** The slot whose deck something reaching `reach` from (x, z) touches: null for none, undefined for two. */
  const owner = (x: number, z: number, reach: number): PodSlot | null | undefined => {
    const hit = slots.filter((s) => Math.abs(x - s.x) < 2.1 + reach && Math.abs(z - s.z) < 2.4 + reach);
    return hit.length > 1 ? undefined : (hit[0] ?? null);
  };
  // Low mounds (the round bush squashed) and the odd rock, well inside a slot, more where it's thick.
  for (const s of slots) {
    const n = 1 + Math.floor(drift(s.x, s.z) * 3 + r() * 1.2);
    for (let k = 0; k < n; k++) {
      const x = s.x + (r() - 0.5) * 2.4;
      const z = s.z + (r() - 0.5) * 3.0;
      if (!plot.free(x, z, 0.6, true)) continue;
      if (r() < 0.75) {
        const w = 0.65 + r() * 0.4;
        const d = 0.65 + r() * 0.4;
        scatter.bushes.add(x, z, r() * 6, new THREE.Vector3(w, 0.32 + r() * 0.2, d), s);
        solid.get(s)!.push(footprint(x, z, 1.15 * Math.max(w, d), 1.15 * Math.max(w, d)));
      } else {
        const k2 = 0.35 + r() * 0.3;
        scatter.rocks.add(x, z, r() * 6, k2, s);
        solid.get(s)!.push(footprint(x, z, 1.1 * k2, 1.1 * k2));
      }
      plot.taken(x, z, 0.55);
    }
  }
  ctx.colliders.push(...[...solid.values()].flat());
  // Then the field, inside the trail's loop and either side of the building.
  for (const box of [aabb(-20.7, 20.7, 12.2, 24.5), aabb(15.9, 23.7, -8.4, 5.4), aabb(-23.7, -15.9, -8.4, 5.4)]) {
    const tries = (box.maxX - box.minX) * (box.maxZ - box.minZ) * 11;
    for (let k = 0; k < tries; k++) {
      const x = box.minX + r() * (box.maxX - box.minX);
      const z = box.minZ + r() * (box.maxZ - box.minZ);
      // Thick in the drifts, a sprinkle between them.
      const d = drift(x, z) * 0.75 + fine(x, z) * 0.25;
      if (r() > 0.08 + 0.92 * smooth(0.34, 0.58, d)) continue;
      const lush = smooth(0.45, 0.8, d);
      const kind = kinds(x, z) + (r() - 0.5) * 0.25;
      let scat: Scatter;
      let room: number;
      let size: number;
      let reach: number;
      if (kind > 0.7) {
        // Tall grass stays under 0.8 m: it springs aside underfoot rather than fading.
        scat = scatter.tallGrass;
        size = 0.8 + 0.27 * lush * r();
        room = 0.26;
        reach = 0.33 * size;
      } else if (kind > 0.3) {
        scat = scatter.wildflowers;
        size = 0.95 + 0.85 * lush * (0.5 + r() * 0.5);
        room = 0.2;
        reach = 0.26 * size;
      } else {
        scat = scatter.tufts;
        size = 0.6 + r() * 0.4;
        room = 0.12;
        reach = 0.31 * size;
      }
      const slot = owner(x, z, reach);
      if (slot === undefined || !plot.free(x, z, room, true)) continue;
      scat.add(x, z, r() * 6, size, slot ?? undefined);
      plot.taken(x, z, room);
    }
  }
  return new Map(
    slots.map((s) => [
      s,
      {
        objects: [],
        colliders: solid.get(s)!,
        dispose() {
          for (const sc of all) sc.clear(s);
        },
      },
    ]),
  );
}

/** An oriented box on the ground (paver footprint). */
interface Box2 {
  x: number;
  z: number;
  yaw: number;
  hw: number;
  hd: number;
}

/** The two boxes overlap, or come closer than `gap` (separating axis test on their four axes). */
function overlaps(a: Box2, b: Box2, gap: number): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  for (const o of [a, b]) {
    const c = Math.cos(o.yaw);
    const s = Math.sin(o.yaw);
    for (const [ax, az] of [
      [c, -s],
      [s, c],
    ]) {
      const ra = a.hw * Math.abs(Math.cos(a.yaw) * ax - Math.sin(a.yaw) * az) + a.hd * Math.abs(Math.sin(a.yaw) * ax + Math.cos(a.yaw) * az);
      const rb = b.hw * Math.abs(Math.cos(b.yaw) * ax - Math.sin(b.yaw) * az) + b.hd * Math.abs(Math.sin(b.yaw) * ax + Math.cos(b.yaw) * az);
      if (Math.abs(dx * ax + dz * az) > ra + rb + gap) return false;
    }
  }
  return true;
}

/** Paver rows across the trail: [offset from the centre line, width]. Two, then one between two halves. */
const PAVER_ROWS: readonly (readonly (readonly [number, number])[])[] = [
  [
    [-0.285, 0.52],
    [0.285, 0.52],
  ],
  [
    [-0.42, 0.25],
    [0, 0.52],
    [0.42, 0.25],
  ],
];

/**
 * Pave the trail: staggered rows of stepping stones along the curve (the catalog's big shapes in
 * the whole slots, the small one turned a quarter in the halves), never overlapping (a stone that
 * would crowd its neighbour on a bend is left out), with grass tufts creeping in at the edges and
 * into the odd gap where an edge stone is missing. The main path's own paving carries the trail
 * across it.
 */
function layPavers(curve: THREE.CatmullRomCurve3, scatter: Scatters, plot: Plot): void {
  const r = rng(1848);
  const rows = Math.round(curve.getLength() / 0.44);
  const recent: Box2[] = [];
  const onPath = (x: number, z: number, reach: number) => Math.abs(x) - reach < MAIN_PATH_HALF + 0.04 && z > 10;
  // Garden pod decks: no stone may touch one, or a pod moving in would land on the trail.
  const decks: Box2[] = POD_SLOTS.filter((s) => s.outdoor).map((s) => ({ x: s.x, z: s.z, yaw: 0, hw: 2.1, hd: 2.4 }));
  for (let i = 0; i < rows; i++) {
    const u = i / rows;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    const yaw = Math.atan2(t.x, t.z);
    // Left of the direction of travel.
    const nx = t.z;
    const nz = -t.x;
    for (const [off, w] of PAVER_ROWS[i % 2]) {
      const o = off + (r() - 0.5) * 0.03;
      const along = (r() - 0.5) * 0.03;
      const x = p.x + nx * o + t.x * along;
      const z = p.z + nz * o + t.z * along;
      const box: Box2 = { x, z, yaw: yaw + (r() - 0.5) * 0.08, hw: (w / 2) * (0.95 + r() * 0.05), hd: 0.19 * (0.93 + r() * 0.08) };
      if (onPath(x, z, Math.hypot(box.hw, box.hd)) || decks.some((d) => overlaps(box, d, 0.03))) continue;
      const edge = Math.abs(off) > 0.3;
      if ((edge && r() < 0.08) || recent.some((q) => overlaps(box, q, 0.025))) {
        // Grass creeps into the gap a missing edge stone leaves.
        if (edge && !plot.solid(x, z) && !onPath(x, z, 0.3) && !inSlot(x, z, 0.3)) scatter.tufts.add(x, z, r() * 6, 0.4 + r() * 0.2);
        continue;
      }
      recent.push(box);
      if (recent.length > 10) recent.shift();
      // A half slot takes the small stone turned a quarter (its long side along the trail).
      const half = w < 0.4;
      const id: keyof typeof STONES = half ? 'stepping_stone_b' : r() < 0.5 ? 'stepping_stone_a' : 'stepping_stone_c';
      const [sw, sd] = STONES[id];
      const turn = half ? Math.PI / 2 : r() < 0.5 ? 0 : Math.PI;
      // The stone's own X runs across the trail, or along it once turned a quarter.
      const k = half ? new THREE.Vector3((box.hd * 2) / sw, 1, (box.hw * 2) / sd) : new THREE.Vector3((box.hw * 2) / sw, 1, (box.hd * 2) / sd);
      scatter.stones[id].add(x, z, box.yaw + turn, k, undefined, -STONE_SINK);
    }
    // Tufts along the edges.
    if (r() < 0.24) {
      const side = r() < 0.5 ? -1 : 1;
      const off = side * (TRAIL_HALF + 0.08 + r() * 0.16);
      const x = p.x + nx * off;
      const z = p.z + nz * off;
      // Clear of the pod decks by a tuft's reach, so none ever pokes through one.
      if (!onPath(x, z, 0.3) && !inSlot(x, z, 0.3) && !plot.solid(x, z, 0.1)) scatter.tufts.add(x, z, r() * 6, 0.5 + r() * 0.35);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Instanced scenery

/**
 * Side of the square cells the big scatters (the meadow's flowers, grass and tufts) draw in (m).
 * Each cell is its own set of instanced meshes with its own bounds, so only the cells in view
 * draw; a cell with only a few copies joins its nearest big neighbour, to keep draw calls down.
 */
const CHUNK = 12;
const CHUNK_MIN = 16;

interface Spot {
  m: THREE.Matrix4;
  /** The garden pod slot it grows on (meadows), cleared when a pod moves in. */
  slot?: PodSlot;
  /** The cell it's drawn in, and its copy's index there. */
  chunk: Chunk;
  at: number;
}

/** One cell of a scatter: its copies, drawn procedurally until the catalog model's take over. */
interface Chunk {
  /** Cell centre (x, z). */
  x: number;
  z: number;
  spots: Spot[];
  procedural: THREE.InstancedMesh[];
  model: InstancedModel | null;
}

/** Soft plants within this reach of the manager lean away as they pass (m). */
const BEND_REACH = 0.8;
/** How far a plant right at the manager's feet leans (rad). */
const BEND_MAX = 0.65;

const _t = new THREE.Matrix4();
const _r = new THREE.Matrix4();
const _m = new THREE.Matrix4();
const _axis = new THREE.Vector3();

/**
 * Repeated garden scenery, every copy drawn instanced: a procedural clump (built once by `fill`)
 * at each spot, replaced by catalog model `id` when (and only if) it loads. With `chunk`, the
 * copies draw in square cells of that size that cull on their own (the merged model geometry is
 * shared by every cell). Copies on a garden pod slot go when a pod moves in. Soft plants (`bend`)
 * lean away from the manager walking through them and spring back after, so legs never just pass
 * through the leaves.
 */
class Scatter {
  private spots: Spot[] = [];
  private readonly chunks = new Map<number, Chunk>();
  /** Spot indices by 1 m cell, for finding the plants round the manager. */
  private grid = new Map<number, number[]>();
  /** Copies leaning right now: the lean and its speed, which way, where it's headed, and the lean last drawn. */
  private bent = new Map<number, { angle: number; vel: number; ax: number; az: number; goal: number; drawn: number; drawnAx: number; drawnAz: number }>();

  constructor(
    private readonly ctx: WorldCtx,
    private readonly name: string,
    private readonly id: string | null,
    private readonly fill: (b: Batch) => void,
    private readonly opts: InstancedOptions & { bend?: boolean; chunk?: number } = {},
  ) {}

  /** A copy at (x, z) turned by `yaw` and scaled by `s` (uniform or per axis). */
  add(x: number, z: number, yaw: number, s: number | THREE.Vector3, slot?: PodSlot, y = 0): void {
    const k = typeof s === 'number' ? new THREE.Vector3(s, s, s) : s;
    const size = this.opts.chunk ?? 0;
    const gx = size > 0 ? Math.floor(x / size) : 0;
    const gz = size > 0 ? Math.floor(z / size) : 0;
    const key = cell(gx, gz);
    let chunk = this.chunks.get(key);
    if (!chunk) this.chunks.set(key, (chunk = { x: (gx + 0.5) * size, z: (gz + 0.5) * size, spots: [], procedural: [], model: null }));
    const spot: Spot = { m: placement(x, y, z, yaw).scale(k), slot, chunk, at: chunk.spots.length };
    chunk.spots.push(spot);
    this.spots.push(spot);
  }

  /** Draw every copy: procedural now, the catalog model's once it loads. */
  build(): void {
    if (this.spots.length === 0) return;
    this.mergeSmallChunks();
    const b = new Batch();
    this.fill(b);
    const proto = b.build({ name: this.name });
    const chunks = [...this.chunks.values()];
    for (const chunk of chunks) {
      for (const child of proto.children) {
        const src = child as THREE.Mesh;
        const inst = new THREE.InstancedMesh(src.geometry, src.material, chunk.spots.length);
        inst.name = src.name;
        inst.castShadow = src.castShadow && this.opts.shadows !== false;
        inst.receiveShadow = true;
        chunk.procedural.push(inst);
        this.ctx.root.add(inst);
      }
      this.syncChunk(chunk);
    }
    this.syncGrid();
    if (!this.id) return;
    // The clump's geometry is shared by every chunk: it goes once the last one has its model.
    let procedural = chunks.length;
    for (const chunk of chunks) {
      void instancedModel(this.id, chunk.spots.map((s) => s.m), this.opts).then((m) => {
        if (!m) return;
        for (const inst of chunk.procedural) {
          inst.dispose();
          inst.removeFromParent();
        }
        chunk.procedural = [];
        if (--procedural === 0) for (const child of proto.children) (child as THREE.Mesh).geometry.dispose();
        chunk.model = m;
        this.ctx.root.add(m.group);
        this.syncChunk(chunk);
      });
    }
  }

  /** Drop the copies growing on `slot` (a pod moved in). Only the chunks they were in redraw. */
  clear(slot: PodSlot): void {
    if (!this.spots.some((s) => s.slot === slot)) return;
    // Anything mid-lean stands up first: the spots are about to be renumbered.
    for (const [i, b] of this.bent) if (b.drawn !== 0) this.place(this.spots[i], this.spots[i].m);
    const hit = new Set<Chunk>();
    this.spots = this.spots.filter((s) => {
      if (s.slot !== slot) return true;
      hit.add(s.chunk);
      return false;
    });
    for (const chunk of hit) {
      chunk.spots = chunk.spots.filter((s) => s.slot !== slot);
      chunk.spots.forEach((s, i) => (s.at = i));
      this.syncChunk(chunk);
    }
    this.syncGrid();
  }

  /**
   * Lean the copies near `focus` away from it; they spring back (with a little jiggle) once it
   * moves on. A plant that has settled isn't redrawn, so standing still costs nothing.
   */
  bend(focus: THREE.Vector3, dt: number): void {
    if (!this.opts.bend || this.spots.length === 0) return;
    for (const b of this.bent.values()) b.goal = 0;
    const cx = Math.floor(focus.x);
    const cz = Math.floor(focus.z);
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gz = cz - 1; gz <= cz + 1; gz++) {
        for (const i of this.grid.get(cell(gx, gz)) ?? []) {
          const e = this.spots[i].m.elements;
          const dx = e[12] - focus.x;
          const dz = e[14] - focus.z;
          const d = Math.hypot(dx, dz);
          if (d > BEND_REACH) continue;
          let b = this.bent.get(i);
          if (!b) this.bent.set(i, (b = { angle: 0, vel: 0, ax: 1, az: 0, goal: 0, drawn: 0, drawnAx: 1, drawnAz: 0 }));
          b.goal = BEND_MAX * (1 - d / BEND_REACH);
          if (d > 1e-3) {
            b.ax = dx / d;
            b.az = dz / d;
          }
        }
      }
    }
    if (this.bent.size === 0) return;
    const steps = Math.max(1, Math.ceil(dt * 120));
    const h = dt / steps;
    for (const [i, b] of this.bent) {
      const spot = this.spots[i];
      const m = spot.m;
      if (Math.abs(b.angle - b.goal) < 1e-3 && Math.abs(b.vel) < 1e-2) {
        // Settled: upright again (and done with), or holding its lean while the manager stands there.
        if (b.goal === 0) {
          this.bent.delete(i);
          if (b.drawn !== 0) this.place(spot, m);
          continue;
        }
        if (Math.abs(b.ax - b.drawnAx) + Math.abs(b.az - b.drawnAz) < 0.02) continue;
      } else {
        for (let k = 0; k < steps; k++) {
          b.vel += (b.goal - b.angle) * 160 * h - b.vel * 14 * h;
          b.angle += b.vel * h;
        }
      }
      b.drawn = b.angle;
      b.drawnAx = b.ax;
      b.drawnAz = b.az;
      // Tip the plant about its root, top away from the manager.
      const x = m.elements[12];
      const z = m.elements[14];
      _r.makeRotationAxis(_axis.set(b.az, 0, -b.ax), b.angle);
      _m.copy(_t.makeTranslation(x, 0, z)).multiply(_r).multiply(_t.makeTranslation(-x, 0, -z)).multiply(m);
      this.place(spot, _m);
    }
  }

  private place(spot: Spot, m: THREE.Matrix4): void {
    for (const inst of spot.chunk.procedural) {
      inst.setMatrixAt(spot.at, m);
      inst.instanceMatrix.needsUpdate = true;
    }
    spot.chunk.model?.setPlacement(spot.at, m);
  }

  /** A cell with only a few copies joins the nearest cell with plenty: fewer, fuller draws. */
  private mergeSmallChunks(): void {
    if (!this.opts.chunk) return;
    const big = [...this.chunks.values()].filter((c) => c.spots.length >= CHUNK_MIN);
    if (big.length === 0) return;
    for (const [key, chunk] of this.chunks) {
      if (chunk.spots.length >= CHUNK_MIN) continue;
      const into = big.reduce((best, c) => (Math.hypot(c.x - chunk.x, c.z - chunk.z) < Math.hypot(best.x - chunk.x, best.z - chunk.z) ? c : best));
      for (const s of chunk.spots) {
        s.chunk = into;
        s.at = into.spots.length;
        into.spots.push(s);
      }
      this.chunks.delete(key);
    }
  }

  /** Every copy of `chunk` at rest, sized and bounded to what it holds now. */
  private syncChunk(chunk: Chunk): void {
    const n = chunk.spots.length;
    for (const inst of chunk.procedural) {
      chunk.spots.forEach((s, i) => inst.setMatrixAt(i, s.m));
      inst.count = n;
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingSphere();
    }
    const model = chunk.model;
    if (!model) return;
    chunk.spots.forEach((s, i) => model.setPlacement(i, s.m));
    model.group.traverse((o) => {
      const inst = o as THREE.InstancedMesh;
      if (!inst.isInstancedMesh) return;
      inst.count = n;
      inst.computeBoundingSphere();
    });
  }

  /** Spot indices by 1 m cell, for the plants round the manager (leans in progress start over). */
  private syncGrid(): void {
    this.bent.clear();
    this.grid.clear();
    if (!this.opts.bend) return;
    this.spots.forEach((s, i) => {
      const k = cell(Math.floor(s.m.elements[12]), Math.floor(s.m.elements[14]));
      const list = this.grid.get(k);
      if (list) list.push(i);
      else this.grid.set(k, [i]);
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Lights and the hammock

/**
 * Festoon lights: strands of warm bulbs sagging between pairs of wooden posts (the catalog's
 * string_lights where it loads, 4 m post to post), coming up bright from dusk.
 */
function buildStringLights(ctx: WorldCtx, strands: [number, number][][]): { setLevel(level: number, dt: number): void } {
  const bulbMat = new THREE.MeshStandardMaterial({ color: '#FFE9BF', emissive: '#FFB85C', emissiveIntensity: 0.3, roughness: 0.35 });
  const glass = new Set<THREE.MeshStandardMaterial>([bulbMat]);
  let lit = -1;
  for (const [[ax, az], [bx, bz]] of strands) {
    const len = Math.hypot(bx - ax, bz - az);
    // The strand runs along its local X, post to post.
    const bulbs: THREE.Matrix4[] = [];
    const g = staticProp(ctx, 'string-lights', (b) => buildStrand(b, len, bulbs), { at: [(ax + bx) / 2, (az + bz) / 2], yaw: Math.atan2(az - bz, bx - ax) });
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.042, 10, 8), bulbMat, bulbs.length);
    mesh.name = 'string-light-bulbs';
    bulbs.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.computeBoundingSphere();
    g.add(mesh);
    // The catalog strand's bulbs stay their own material, so they can come up at dusk.
    void swapModel(ctx, g, 'string_lights', { separate: ['Bulb', 'BulbGlow'] }).then((m) => {
      m?.traverse((o) => {
        const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (!mat || Array.isArray(mat) || (mat.name !== 'Bulb' && mat.name !== 'BulbGlow')) return;
        if (mat.emissive.getHex() === 0) mat.emissive.set('#FFB85C');
        glass.add(mat);
        lit = -1;
      });
    });
    for (const [x, z] of [
      [ax, az],
      [bx, bz],
    ]) {
      ctx.colliders.push(footprint(x, z, 0.3, 0.3));
      ctx.blobs.add(x, z, 0.4, 0.4, { shape: 'round' });
    }
  }
  let level = 0;
  return {
    setLevel(target, dt) {
      const next = lit < 0 ? target : level + (target - level) * (1 - Math.exp(-dt * 0.8));
      if (lit >= 0 && Math.abs(next - level) < 1e-4) return;
      level = next;
      lit = level;
      // By day the bulbs are warm glass; from dusk they bloom.
      for (const m of glass) m.emissiveIntensity = 0.3 + level * 2.7;
    },
  };
}

/** Height of the hammock's hang line (the hooks on its stand; the catalog's `bedPivot`). */
const HANG_Y = 1.1;

/**
 * The hammock on its stand, along the lawn, with a bed that rocks gently. The bed hangs from
 * `carrier`, a pivot on the hang line; the catalog model's `Bed` node (pivoted on the same line)
 * moves onto it when the model loads, so whoever lies in it rocks the same before and after.
 */
function buildHammock(ctx: WorldCtx, at: [number, number]): { carrier: THREE.Object3D; update(t: number): void } {
  const carrier = new THREE.Group();
  carrier.name = 'hammock-swing';
  carrier.position.y = HANG_Y;
  carrier.userData.keep = true;
  const cb = new Batch();
  buildHammockBed(cb);
  const cloth = cb.build({ name: 'hammock-bed' });
  carrier.add(cloth);
  // The stand is long along X; turned a quarter so it runs along the lawn.
  const g = tallProp(ctx, 'hammock', (b) => buildHammockStand(b), { at, yaw: Math.PI / 2, extra: [carrier] });
  void swapModel(ctx, g, 'hammock').then((m) => {
    if (!m) return;
    disposeGroup(cloth);
    const bed = findNode(m, 'Bed');
    if (!bed) return;
    // Hang it at rest: attach() keeps the bed's world pose, so a swing caught mid-rock would stay
    // baked into it. The ticker picks the rocking back up next frame.
    carrier.rotation.x = 0;
    g.updateMatrixWorld(true);
    carrier.attach(bed);
  });
  ctx.colliders.push(footprint(at[0], at[1], 0.95, 3.25));
  ctx.blobs.add(at[0], at[1], 1.1, 3.0);
  return {
    carrier,
    update(t) {
      carrier.rotation.x = Math.sin(t * 0.9) * 0.06 + Math.sin(t * 0.37 + 1.3) * 0.025;
    },
  };
}

/**
 * One paver, w × d with rounded corners and a bevelled top edge, its sides running down into the
 * lawn (no underside: it's never seen). About 60 triangles, as there are hundreds of them.
 */
function paverGeometry(w: number, d: number, h: number, corner: number, bevel: number): THREE.BufferGeometry {
  // The outline at an inset, 3 points per corner, going round from +X toward +Z.
  const ring = (inset: number, y: number) => {
    const cw = w / 2 - corner;
    const cd = d / 2 - corner;
    const r = corner - inset;
    const out: THREE.Vector3[] = [];
    for (const [cx, cz, a0] of [
      [cw, cd, 0],
      [-cw, cd, Math.PI / 2],
      [-cw, -cd, Math.PI],
      [cw, -cd, Math.PI * 1.5],
    ]) {
      for (let k = 0; k <= 2; k++) {
        const a = a0 + (k / 2) * (Math.PI / 2);
        out.push(new THREE.Vector3(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r));
      }
    }
    return out;
  };
  const top = ring(bevel, h / 2);
  const rim = ring(0, h / 2 - bevel);
  const foot = ring(0, -h / 2);
  const tri: THREE.Vector3[] = [];
  for (let i = 1; i + 1 < top.length; i++) tri.push(top[0], top[i + 1], top[i]);
  const band = (hi: THREE.Vector3[], lo: THREE.Vector3[]) => {
    for (let i = 0; i < hi.length; i++) {
      const j = (i + 1) % hi.length;
      tri.push(hi[i], lo[j], lo[i], hi[i], hi[j], lo[j]);
    }
  };
  band(top, rim);
  band(rim, foot);
  return new THREE.BufferGeometry().setFromPoints(tri);
}

// ---------------------------------------------------------------------------------------------
// Builders (local frame: pivot at the floor contact point, front facing +Z)

/** A clump of tall meadow grass: long tapered blades fanning out, a few with seed heads. About 0.6 m across, 0.75 m tall. */
export function buildTallGrass(b: Batch, r: () => number): void {
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.5;
    const h = 0.48 + r() * 0.3;
    const lean = 0.12 + r() * 0.3;
    // Tilt about the blade's root, not its middle, so every blade grows from the clump's heart.
    const ox = Math.cos(a);
    const oz = Math.sin(a);
    const root = 0.05;
    b.cyl(0, 0.026, h, pickR(r, ['#4E9F3D', '#5FB548', '#76C957', '#8BD562']), {
      at: [ox * (root + (h / 2) * Math.sin(lean)), (h / 2) * Math.cos(lean), oz * (root + (h / 2) * Math.sin(lean))],
      rot: [oz * lean, 0, -ox * lean],
      seg: 3,
      cast: false,
      flat: true,
      finish: 'matte',
    });
    if (i % 4 === 0) {
      const tip = h + 0.02;
      b.ball([0.022, 0.06, 0.022], '#D9C27A', {
        at: [ox * (root + tip * Math.sin(lean)), tip * Math.cos(lean), oz * (root + tip * Math.sin(lean))],
        rot: [oz * lean, 0, -ox * lean],
        ws: 5,
        hs: 4,
        cast: false,
        flat: true,
        finish: 'matte',
      });
    }
  }
}

/** A clump of wildflowers: a leafy tuft with daisy heads in mixed colours on short stems. About 0.5 m across, 0.36 m tall. */
export function buildWildflowers(b: Batch, r: () => number): void {
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + r();
    b.ball([0.11, 0.07, 0.09], shade('#4FA83D', (r() - 0.5) * 0.08), { at: [Math.cos(a) * 0.09, 0.04, Math.sin(a) * 0.09], rot: [0, r() * 6, 0], ws: 7, hs: 4, flat: true, cast: false, finish: 'matte' });
  }
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.6;
    const d = 0.06 + r() * 0.15;
    const h = 0.2 + r() * 0.16;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const petal = PETALS[i % PETALS.length];
    b.cyl(0.007, 0.009, h, '#4FA83D', { at: [x, h / 2, z], seg: 4, cast: false, flat: true, finish: 'matte' });
    b.ball([0.052, 0.016, 0.052], petal, { at: [x, h, z], rot: [(r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5], ws: 8, hs: 3, cast: false, flat: true, finish: 'matte' });
    b.ball(0.019, petal === '#FFE066' ? '#E9893A' : '#FFC93C', { at: [x, h + 0.013, z], ws: 5, hs: 3, cast: false, flat: true });
  }
}

/** A ground fern: broad arching fronds, two leaflets each, from a low crown. About 0.9 m across, 0.4 m tall. */
export function buildGroundFern(b: Batch, r: () => number): void {
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.3;
    const col = pickR(r, ['#3FA65A', '#4CB865', '#5CC46F']);
    const tilt = 0.35 + r() * 0.2;
    // Local +Z points out along the frond: a broad inner leaflet, then a narrower tip drooping lower.
    b.place(Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08, Math.atan2(Math.cos(a), Math.sin(a)), () => {
      b.ball([0.11, 0.025, 0.2], col, { at: [0, 0.27, 0.13], rot: [tilt, 0, 0], ws: 7, hs: 4, flat: true, finish: 'matte' });
      b.ball([0.08, 0.02, 0.17], shade(col, 0.05), { at: [0, 0.16, 0.36], rot: [tilt + 0.45, 0, 0], ws: 6, hs: 4, flat: true, finish: 'matte' });
    });
  }
  b.ball([0.13, 0.12, 0.13], '#3B8F4E', { at: [0, 0.08, 0], ws: 6, hs: 4, flat: true, finish: 'matte', cast: false });
}

/** A flowering bush: faceted lobes dotted with pink, cream and coral blossoms. About 1.3 m across, 0.95 m tall. */
export function buildFloweringBush(b: Batch, r: () => number): void {
  const leaf = shade(PALETTE.treeLeaf[1], (r() - 0.5) * 0.06);
  b.ball([0.6, 0.48, 0.55], leaf, { at: [0, 0.46, 0], rot: [0, r() * 6, 0], ws: 9, hs: 6, flat: true, finish: 'matte' });
  b.ball([0.4, 0.33, 0.38], shade(leaf, 0.05), { at: [0.36, 0.33, 0.18], rot: [0, r() * 6, 0], ws: 8, hs: 5, flat: true, finish: 'matte' });
  b.ball([0.36, 0.3, 0.34], shade(leaf, -0.04), { at: [-0.32, 0.3, -0.2], rot: [0, r() * 6, 0], ws: 8, hs: 5, flat: true, finish: 'matte' });
  for (let i = 0; i < 18; i++) {
    const a = r() * Math.PI * 2;
    const up = 0.2 + r() * 0.9;
    b.ball(0.065, ['#FF7EB6', '#FFFDF7', '#FF6B6B'][i % 3], { at: [Math.cos(a) * Math.cos(up) * 0.58, 0.46 + Math.sin(up) * 0.46, Math.sin(a) * Math.cos(up) * 0.53], ws: 6, hs: 4, flat: true, cast: false });
  }
}

/** A cluster of faceted boulders half sunk in the lawn, moss on top. About 1.4 × 1.0 m. */
export function buildRocks(b: Batch, r: () => number): void {
  b.ball([0.5, 0.36, 0.42], '#B9B4AC', { at: [0, 0.12, 0], rot: [0, r() * 6, 0.1], ws: 7, hs: 5, flat: true, finish: 'matte' });
  b.ball([0.3, 0.24, 0.28], '#C9C3BA', { at: [0.5, 0.06, 0.25], rot: [0.2, r() * 6, 0], ws: 6, hs: 4, flat: true, finish: 'matte' });
  b.ball([0.22, 0.17, 0.2], '#A9A49C', { at: [-0.48, 0.03, -0.2], rot: [0, r() * 6, 0.15], ws: 6, hs: 4, flat: true, finish: 'matte' });
  b.ball([0.34, 0.09, 0.28], '#7BC95A', { at: [0.02, 0.41, -0.02], rot: [0.08, r() * 6, 0], ws: 7, hs: 4, flat: true, finish: 'matte', cast: false });
}

/** A hydrangea: a low leafy mound crowned with blue, lilac and pink mopheads. About 1.2 m across, 0.8 m tall. */
export function buildHydrangea(b: Batch, r: () => number): void {
  b.ball([0.58, 0.4, 0.55], shade(PALETTE.treeLeaf[1], -0.04), { at: [0, 0.38, 0], rot: [0, r() * 6, 0], ws: 9, hs: 6, flat: true, finish: 'matte' });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + r() * 0.4;
    const out = i % 3 === 0 ? 0.1 : 0.38;
    b.ball(0.17, ['#7FA8FF', '#B48CFF', '#FF9DCB'][i % 3], { at: [Math.cos(a) * out, 0.62 + r() * 0.08, Math.sin(a) * out], ws: 7, hs: 5, flat: true, finish: 'matte' });
  }
}

/** A row of lavender along X, 1.7 m long: grey-green mounds under purple spikes, in a soil strip. */
export function buildLavenderRow(b: Batch, r: () => number): void {
  b.box(1.7, 0.03, 0.5, '#8A6A4A', { at: [0, 0.0, 0], r: 0.01, seg: 1, cast: false, finish: 'matte' });
  for (let i = 0; i < 6; i++) {
    const x = -0.72 + i * 0.29;
    b.ball([0.17, 0.14, 0.19], '#7FA38A', { at: [x, 0.1, 0], rot: [0, r() * 6, 0], ws: 7, hs: 4, flat: true, finish: 'matte', cast: false });
    for (let k = 0; k < 5; k++) {
      const a = r() * Math.PI * 2;
      b.capsule(0.022, 0.12, '#9B7BD8', { at: [x + Math.cos(a) * 0.1, 0.3 + r() * 0.06, Math.sin(a) * 0.12], rot: [Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25], cast: false });
    }
  }
}

/** Three sunflowers on tall stems, faces toward +Z. About 0.75 m across, 1.05 m tall. */
export function buildSunflowers(b: Batch, r: () => number): void {
  for (const [x, z, h] of [
    [-0.22, 0.02, 0.95],
    [0.02, -0.08, 1.02],
    [0.25, 0.05, 0.88],
  ] as const) {
    b.cyl(0.018, 0.024, h, '#4FA83D', { at: [x, h / 2, z], seg: 6, cast: false });
    b.ball([0.12, 0.05, 0.08], '#4FA83D', { at: [x + 0.06, h * 0.55, z], rot: [0, r() * 6, 0.4], ws: 6, hs: 4, flat: true, cast: false });
    b.puck(0.13, 0.03, '#FFC93C', { at: [x, h, z + 0.03], rot: [Math.PI / 2 - 0.25, 0, 0], cast: false });
    b.puck(0.065, 0.04, '#7A4A28', { at: [x, h + 0.008, z + 0.05], rot: [Math.PI / 2 - 0.25, 0, 0], cast: false });
  }
}

/** A big flat-topped boulder to sit on, 1.2 × 1.0 m, the top 0.46 m up. */
export function buildBoulder(b: Batch): void {
  b.ball([0.6, 0.5, 0.5], '#B9B4AC', { at: [0, -0.04, 0], ws: 8, hs: 5, flat: true, finish: 'matte' });
  b.ball([0.42, 0.06, 0.36], '#C9C3BA', { at: [0, 0.43, 0.04], ws: 7, hs: 3, flat: true, finish: 'matte' });
}

/** A painted rose arch to walk through along Z: two pairs of posts 1.4 m apart, a curved top, climbing roses. */
export function buildRoseArch(b: Batch): void {
  for (const sx of [-0.76, 0.76]) {
    for (const sz of [-0.2, 0.2]) b.box(0.07, 2.2, 0.07, '#FFFDF7', { at: [sx, 1.1, sz], r: 0.02 });
    for (let k = 0; k < 4; k++) b.ball(0.2, '#3F9A4E', { at: [sx * 1.05, 0.45 + k * 0.5, 0], ws: 7, hs: 5, flat: true, finish: 'matte' });
    b.ball(0.05, '#FF6B6B', { at: [sx * 1.2, 1.2, 0.12], ws: 6, hs: 4 });
    b.ball(0.05, '#FF9DCB', { at: [sx * 1.18, 1.8, -0.1], ws: 6, hs: 4 });
  }
  for (const sz of [-0.2, 0.2]) b.torus(0.76, 0.035, '#FFFDF7', { at: [0, 2.2, sz], arc: Math.PI });
  for (let k = 0; k < 3; k++) b.ball(0.22, '#3F9A4E', { at: [(k - 1) * 0.42, 2.85 - Math.abs(k - 1) * 0.12, 0], ws: 7, hs: 5, flat: true, finish: 'matte' });
}

/** A yoga mat, 1.8 × 0.6 m along X, its end rolled up a little at +X. */
export function buildYogaMat(b: Batch, color: string): void {
  b.box(1.72, 0.012, 0.6, color, { at: [-0.04, 0.006, 0], r: 0.004, seg: 1, cast: false, finish: 'soft' });
  b.cyl(0.04, 0.04, 0.6, shade(color, -0.08), { at: [0.86, 0.04, 0], rot: [Math.PI / 2, 0, 0], seg: 10 });
}

/** Sun lounger, 0.68 × 1.45 m: a white frame on short legs, a striped cushion with the back raised at -Z. Feet toward +Z. */
export function buildSunLounger(b: Batch, cushion: string): void {
  const frame = '#FFFDF7';
  for (const sx of [-0.29, 0.29]) {
    b.box(0.06, 0.06, 1.42, frame, { at: [sx, 0.22, 0], r: 0.025 });
    for (const sz of [-0.6, 0.6]) b.box(0.06, 0.2, 0.06, frame, { at: [sx, 0.1, sz], r: 0.02 });
  }
  // Seat cushion in stripes (abutting blocks, so no faces overlap), hinged at z = -0.18.
  const stripes = 4;
  const len = 0.88 / stripes;
  for (let k = 0; k < stripes; k++) b.box(0.62, 0.08, len, k % 2 ? '#FFFDF7' : cushion, { at: [0, 0.29, -0.18 + len * (k + 0.5)], r: 0.004, seg: 1, finish: 'cloth' });
  // The back cushion, raised 0.8 rad about the hinge, with a rolled towel at the top.
  const tilt = 0.8;
  const L = 0.55;
  const back = (d: number): [number, number, number] => [0, 0.29 + Math.sin(tilt) * d, -0.18 - Math.cos(tilt) * d];
  b.box(0.62, 0.08, L, cushion, { at: back(L / 2), rot: [tilt, 0, 0], r: 0.03, finish: 'cloth' });
  // Props from the rails' ends up under the back.
  for (const sx of [-0.22, 0.22]) b.box(0.04, 0.04, 0.3, frame, { at: [sx, 0.35, -0.55], rot: [-0.9, 0, 0], r: 0.015 });
  const towel = back(L - 0.08);
  b.capsule(0.06, 0.4, '#FFFDF7', { at: [0, towel[1] + 0.06, towel[2]], rot: [0, 0, Math.PI / 2], finish: 'cloth' });
}

/** Garden parasol: an eight-panel striped canopy on a white pole with a weighted base. Pivot at the pole's foot. */
export function buildParasol(b: Batch): void {
  b.puck(0.28, 0.1, '#E9DCC6', { at: [0, 0.05, 0], finish: 'matte' });
  b.cyl(0.03, 0.03, 2.25, '#FFFDF7', { at: [0, 1.17, 0], seg: 10 });
  const R = 1.2;
  const H = 0.42;
  const y0 = 2.02;
  for (let k = 0; k < 8; k++) {
    const panel = new THREE.CylinderGeometry(0.05, R, H, 1, 1, false, (k * Math.PI) / 4, Math.PI / 4);
    b.add(panel, k % 2 ? '#FFFDF7' : '#FF7A6B', { at: [0, y0 + H / 2, 0], flat: true, finish: 'cloth' });
    panel.dispose();
  }
  b.ball(0.06, '#FFFDF7', { at: [0, y0 + H + 0.04, 0] });
  for (let k = 0; k < 16; k++) {
    const a = ((k + 0.5) / 16) * Math.PI * 2;
    b.ball([0.13, 0.07, 0.03], k % 4 < 2 ? '#FF7A6B' : '#FFFDF7', { at: [Math.sin(a) * R * 0.97, y0 - 0.03, Math.cos(a) * R * 0.97], rot: [0, a, 0], ws: 8, hs: 4, cast: false, finish: 'cloth' });
  }
}

/** Picnic table: a slatted top and a bench each side on crossed legs. Long axis X, benches at z ±0.62. */
export function buildPicnicTable(b: Batch): void {
  const w = PALETTE.wood;
  const dark = shade(w, -0.1);
  for (let k = 0; k < 4; k++) b.box(1.8, 0.05, 0.19, w, { at: [0, 0.735, -0.3 + k * 0.2], r: 0.015, finish: 'wood' });
  for (const s of [-1, 1]) {
    for (let k = 0; k < 2; k++) b.box(1.8, 0.045, 0.14, w, { at: [0, 0.43, s * (0.55 + k * 0.15)], r: 0.015, finish: 'wood' });
    for (const x of [-0.7, 0.7]) b.box(0.06, 0.86, 0.07, dark, { at: [x, 0.36, s * 0.33], rot: [-s * 0.6, 0, 0], r: 0.02, finish: 'wood' });
  }
  for (const x of [-0.7, 0.7]) b.box(0.06, 0.06, 1.5, dark, { at: [x, 0.38, 0], r: 0.02, finish: 'wood' });
}

/** Picnic blanket: red gingham, 1.6 × 1.3 m, flat on the lawn, the basket and a thermos at its back corner. Pivot at its centre. */
export function buildPicnicBlanket(b: Batch): void {
  const cols = 6;
  const rows = 5;
  const cw = 1.6 / cols;
  const cd = 1.3 / rows;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const c = i % 2 === 0 && j % 2 === 0 ? '#E9505A' : i % 2 !== j % 2 ? '#FF9FA6' : '#FFFDF7';
      b.box(cw, 0.014, cd, c, { at: [-0.8 + (i + 0.5) * cw, 0.007, -0.65 + (j + 0.5) * cd], r: 0.002, seg: 1, cast: false, finish: 'cloth' });
    }
  }
  b.box(0.42, 0.22, 0.3, '#C98F5A', { at: [-0.4, 0.124, -0.33], r: 0.04, finish: 'wood' });
  b.box(0.44, 0.04, 0.32, '#A8723F', { at: [-0.4, 0.25, -0.33], r: 0.018, finish: 'wood' });
  b.torus(0.15, 0.016, '#A8723F', { at: [-0.4, 0.27, -0.33], arc: Math.PI });
  b.cyl(0.055, 0.055, 0.26, '#5CC8FF', { at: [-0.06, 0.144, -0.41], seg: 12, finish: 'plastic' });
  b.puck(0.16, 0.02, '#FFFDF7', { at: [0.08, 0.024, 0], finish: 'plastic' });
  for (let k = 0; k < 3; k++) b.box(0.09, 0.03, 0.07, '#F2C46B', { at: [0.02 + k * 0.06, 0.045, (k % 2) * 0.05 - 0.02], rot: [0, k * 0.5, 0], r: 0.012 });
}

/**
 * One strand of festoon lights along local X: a wooden post at each end (±len/2), a wire sagging
 * between them, and a socket wherever a bulb hangs (the bulbs' spots go in `bulbs`).
 */
export function buildStrand(b: Batch, len: number, bulbs: THREE.Matrix4[]): void {
  const H = 2.46;
  const SAG = 0.37;
  for (const s of [-1, 1]) {
    b.box(0.1, 2.55, 0.1, PALETTE.wood, { at: [(s * len) / 2, 1.275, 0], r: 0.025, finish: 'wood' });
    b.puck(0.07, 0.1, shade(PALETTE.wood, -0.15), { at: [(s * len) / 2, 2.6, 0] });
  }
  const span = len - 0.26;
  const at = (t: number) => new THREE.Vector3(-span / 2 + span * t, H - 4 * SAG * t * (1 - t), 0);
  const wire = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({ length: 13 }, (_, k) => at(k / 12))), 24, 0.008, 4, false);
  b.add(wire, '#3B4252', { cast: false });
  wire.dispose();
  const n = Math.max(2, Math.round(span / 0.42));
  for (let k = 1; k < n; k++) {
    const p = at(k / n);
    b.cyl(0.013, 0.013, 0.05, '#3B4252', { at: [p.x, p.y - 0.028, p.z], seg: 6, cast: false });
    bulbs.push(new THREE.Matrix4().makeTranslation(p.x, p.y - 0.085, p.z).scale(new THREE.Vector3(1, 1.25, 1)));
  }
}

/** Birdbath: a stone bowl of water on a pedestal. */
export function buildBirdbath(b: Batch): void {
  const stone = '#E9E4DA';
  b.puck(0.3, 0.1, stone, { at: [0, 0.05, 0], finish: 'matte' });
  b.cyl(0.09, 0.13, 0.62, stone, { at: [0, 0.41, 0], seg: 10, finish: 'matte' });
  b.puck(0.42, 0.12, stone, { at: [0, 0.78, 0], finish: 'matte' });
  b.puck(0.34, 0.02, '#7FD8FF', { at: [0, 0.845, 0], cast: false, finish: 'gloss' });
}

/** Pond: a pill of water just above the lawn ringed with pebbles. Long axis X (3.1 × 2.0 m). */
export function buildPond(b: Batch): void {
  b.slab(2.6, 1.6, 0.03, 0.75, '#4FB6E8', { at: [0, -0.005, 0], cast: false, finish: 'gloss' });
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 2;
    b.ball([0.16, 0.1, 0.13], k % 3 ? '#C9C3BA' : '#B0AAA1', { at: [Math.cos(a) * 1.38, 0.03, Math.sin(a) * 0.86], rot: [0, -a, 0], ws: 6, hs: 4, flat: true, finish: 'matte' });
  }
}

/** Hammock stand, long axis X: a wooden base with an arm rising to a hook at each end (±1.45, HANG_Y). */
export function buildHammockStand(b: Batch): void {
  const w = PALETTE.wood;
  b.box(2.5, 0.09, 0.1, w, { at: [0, 0.06, 0], r: 0.03, finish: 'wood' });
  for (const s of [-1, 1]) {
    b.box(0.1, 0.08, 0.9, w, { at: [s * 1.2, 0.04, 0], r: 0.03, finish: 'wood' });
    // The arm runs from the base's end (±1.2, 0.06) up and out to the hook.
    const dx = 0.25;
    const dy = HANG_Y + 0.05 - 0.06;
    b.box(0.09, Math.hypot(dx, dy), 0.09, w, { at: [s * (1.2 + dx / 2), 0.06 + dy / 2, 0], rot: [0, 0, -s * Math.atan2(dx, dy)], r: 0.03, finish: 'wood' });
    b.torus(0.04, 0.012, '#3B4252', { at: [s * 1.45, HANG_Y - 0.02, 0], rot: [0, 0, 0] });
  }
}

/**
 * The hammock's bed in the carrier's frame (origin on the hang line): a striped cloth sagging
 * between two spreader bars, roped up to the hooks. Each stripe is its own block bent along the
 * same curve, so neighbours meet face to face and nothing overlaps.
 */
export function buildHammockBed(b: Batch): void {
  const half = 1.0;
  const sag = (x: number) => -0.3 - 0.42 * (1 - (x / half) ** 2);
  const stripes = 8;
  for (let i = 0; i < stripes; i++) {
    const x0 = -half + (i / stripes) * 2 * half;
    const x1 = x0 + (2 * half) / stripes;
    const g = new THREE.BoxGeometry(x1 - x0, 0.035, 0.8, 3, 1, 1);
    const pos = g.getAttribute('position');
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v) + (x0 + x1) / 2;
      pos.setXYZ(v, x, pos.getY(v) + sag(x), pos.getZ(v));
    }
    g.computeVertexNormals();
    b.add(g, i % 2 ? '#FFC94A' : '#FF7A6B', { finish: 'cloth' });
    g.dispose();
  }
  const up = new THREE.Vector3(0, 1, 0);
  for (const s of [-1, 1]) {
    b.box(0.05, 0.05, 0.86, PALETTE.wood, { at: [s * half, sag(half) + 0.03, 0], r: 0.02, finish: 'wood' });
    for (const z of [-0.4, 0, 0.4]) {
      const from = new THREE.Vector3(s * half, sag(half) + 0.03, z);
      const to = new THREE.Vector3(s * 1.45, -0.03, 0);
      const dir = to.clone().sub(from);
      const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize()));
      const mid = from.clone().add(to).multiplyScalar(0.5);
      b.cyl(0.008, 0.008, dir.length(), '#F4ECDC', { at: [mid.x, mid.y, mid.z], rot: [e.x, e.y, e.z], seg: 4, cast: false });
    }
  }
}
