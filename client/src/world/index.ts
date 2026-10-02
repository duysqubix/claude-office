// The office world: building, furniture, desks, navigation and per-frame animation.
// Implements the `World` contract in ./types.ts.
import * as THREE from 'three';
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import type { AABB, DeskSlot, Engine, Interactable, InternSlot, OfficeStats, World } from './types';
import { isOfficeEngine } from '../engine';
import { Batch } from './kit';
import { Fader } from './fader';
import { Blobs } from './blobs';
import { NavGrid } from './nav';
import { buildBuilding } from './building';
import { buildProps } from './props';
import { buildOutdoor } from './outdoor';
import { DeskSystem } from './desks';
import { buildDecor, buildReservedSpot } from './decor';
import { buildLights } from './lights';
import { buildTeamRoom } from './teamroom';
import { InternSystem } from './interns';
import type { ScreenView } from './screens';
import { AGENT_RADIUS, ENTRANCE, MANAGER_START, NAV_BOUNDS, NAV_CELL, OFFICE, POD_SLOTS } from './layout';
import type { WorldCtx } from './ctx';

const INITIAL_DESKS = 16;

/** Debug handles for tools like the world preview. Not part of the contract. */
export interface WorldDebug {
  nav: NavGrid;
  fader: Fader;
  podCount(): number;
  maxDesks: number;
  maxInterns: number;
}

const debugHandles = new WeakMap<World, WorldDebug>();

export function worldDebug(world: World): WorldDebug | undefined {
  return debugHandles.get(world);
}

export function createWorld(engine: Engine): World {
  const root = new THREE.Group();
  root.name = 'office-world';
  const colliders: AABB[] = [];
  const interactables: Interactable[] = [];
  const desks: DeskSlot[] = [];
  const fader = new Fader();
  const blobs = new Blobs();
  const ctx: WorldCtx = {
    root,
    colliders,
    interactables,
    fader,
    blobs,
    statics: new Batch(),
    tickers: [],
    cameraBlockers: [],
    focus: new THREE.Vector3(MANAGER_START.x, 0, MANAGER_START.z),
  };

  const building = buildBuilding(ctx);
  const props = buildProps(ctx);
  buildOutdoor(ctx);
  buildDecor(ctx);
  buildLights(ctx);
  const teamRoom = buildTeamRoom(ctx);
  const internSlots: InternSlot[] = [];
  const interns = new InternSystem(ctx, internSlots);
  const deskSystem = new DeskSystem(ctx, desks);
  while (desks.length < INITIAL_DESKS) deskSystem.addPod(POD_SLOTS[deskSystem.podCount]);
  POD_SLOTS.forEach((slot, i) => {
    if (i >= deskSystem.podCount && !slot.outdoor) deskSystem.reserve(slot, buildReservedSpot(ctx, slot, 500 + i));
  });

  root.add(ctx.statics.build({ name: 'statics' }));
  const addBlobs = () => {
    const mesh = blobs.build();
    if (mesh) root.add(mesh);
  };
  addBlobs();
  engine.scene.add(root);

  const nav = new NavGrid(NAV_BOUNDS, NAV_CELL, AGENT_RADIUS);
  nav.rebuild(colliders);

  // Shadows cover the building plus a margin; garden desks widen the fit when they appear.
  const shadowBox = new THREE.Box3(
    new THREE.Vector3(-OFFICE.halfW - 1.6, 0, -OFFICE.halfD - 1.6),
    new THREE.Vector3(OFFICE.halfW + 1.6, OFFICE.wallH + 0.2, OFFICE.halfD + 2.6),
  );
  const fitShadows = () => {
    if (isOfficeEngine(engine)) engine.fitShadows(shadowBox);
  };
  fitShadows();

  let lastCamera: THREE.Camera | null = null;
  const world: World = {
    root,
    desks,
    entrance: {
      outside: new THREE.Vector3(ENTRANCE.outside.x, 0, ENTRANCE.outside.z),
      inside: new THREE.Vector3(ENTRANCE.inside.x, 0, ENTRANCE.inside.z),
    },
    managerStart: { position: new THREE.Vector3(MANAGER_START.x, 0, MANAGER_START.z), yaw: MANAGER_START.yaw },
    interactables,
    colliders,
    findPath(from, to) {
      return nav.findPath(from, to);
    },
    update(dt, elapsed) {
      const step = Math.min(Math.max(dt, 0), 0.1);
      for (const t of ctx.tickers) t(step, elapsed);
      // Screens only repaint when the camera (as of the last updateOcclusion) can see them.
      const view = lastCamera ? screenView(lastCamera) : undefined;
      deskSystem.update(step, elapsed, view);
      interns.update(step, elapsed, view);
      teamRoom.update(view);
    },
    updateOcclusion(camera, target) {
      lastCamera = camera;
      ctx.focus.copy(target);
      fader.update(camera, target);
    },
    setDoorOpen(open) {
      building.setDoorOpen(open);
    },
    setStats(stats: OfficeStats) {
      props.setStats(stats);
    },
    setTeamBoard(stats) {
      teamRoom.setStats(stats);
    },
    internSlots,
    ensureInternSlots(n) {
      if (interns.ensure(n)) {
        // Garden benches widen the sun's shadow fit, like garden desk pods.
        for (const area of interns.areas()) shadowBox.union(area);
        addBlobs();
        nav.rebuild(colliders);
        fitShadows();
      }
      if (internSlots.length < n) warnOnce('interns', `intern desk is full: ${internSlots.length} stations (asked for ${n})`);
      return internSlots.length;
    },
    cameraBlockers: ctx.cameraBlockers,
    interior: building.interior,
    isInside(p) {
      const r = building.interior;
      return p.x > r.minX && p.x < r.maxX && p.z > r.minZ && p.z < r.maxZ && p.y < OFFICE.wallH;
    },
    ensureDesks(n) {
      const before = deskSystem.podCount;
      while (desks.length < n && deskSystem.podCount < POD_SLOTS.length) {
        const slot = POD_SLOTS[deskSystem.podCount];
        deskSystem.addPod(slot);
        if (slot.outdoor) shadowBox.union(new THREE.Box3(new THREE.Vector3(slot.x - 2.4, 0, slot.z - 2.6), new THREE.Vector3(slot.x + 2.4, 1.6, slot.z + 2.6)));
      }
      if (deskSystem.podCount !== before) {
        addBlobs();
        nav.rebuild(colliders);
        fitShadows();
      }
      if (desks.length < n) warnOnce('desks', `office is full: ${desks.length} desks (asked for ${n})`);
      return desks.length;
    },
  };

  debugHandles.set(world, { nav, fader, podCount: () => deskSystem.podCount, maxDesks: POD_SLOTS.length * 4, maxInterns: interns.capacity });
  return world;
}

const _frustumMatrix = new THREE.Matrix4();
const _view: ScreenView = { camera: new THREE.Vector3(), frustum: new THREE.Frustum() };

function screenView(camera: THREE.Camera): ScreenView {
  camera.getWorldPosition(_view.camera);
  _frustumMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _view.frustum.setFromProjectionMatrix(_frustumMatrix);
  return _view;
}

const warned = new Set<string>();
function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[world] ${message}`);
}
