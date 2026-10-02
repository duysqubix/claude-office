// Dev-only world preview: /world-preview.html
//   ?view=overview|follow|entrance|desk|break|manager|reception|whiteboard|outside|low|top|south|waiting|reserved|screens|lines|cat|garden|inside|outside-roof|teamroom|teamroom-top|interns|interns-top
//   ?cutaway=0|1      hide the roof, ceiling and lamps (on by default for top-down layout views)
//   ?ao=0|1            ambient occlusion (persists)       ?door=open
//   ?target=x,z        stand-in manager position (occlusion test)
//   ?nav=1             show blocked nav cells             ?path=1   draw sample paths
//   ?desks=N           ensureDesks(N)                     ?interns=N  ensureInternSlots(N)
//   ?hud=0             hide the overlay                   ?cam=px,py,pz,lx,ly,lz  free camera
// Keys: O toggles AO, D toggles the door, N toggles the nav overlay, H toggles the HUD.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createEngine } from '../engine';
import { createWorld, worldDebug } from './index';
import type { ScreenState } from './types';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('c') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLDivElement;
if (params.get('hud') === '0') hud.classList.add('hidden');

const engine = createEngine(canvas);
const world = createWorld(engine);
const debug = worldDebug(world)!;
(window as unknown as { __debug: typeof debug }).__debug = debug;
// For headless probes: window.__world.findPath(...)
(window as unknown as { __world: typeof world; THREE: typeof THREE }).__world = world;
(window as unknown as { THREE: typeof THREE }).THREE = THREE;
const desksWanted = Number(params.get('desks') ?? 0);
if (desksWanted > 0) world.ensureDesks(desksWanted);
const internsWanted = Number(params.get('interns') ?? 0);
if (internsWanted > 0) world.ensureInternSlots(internsWanted);

// ---- Stand-in manager (for occlusion) ---------------------------------------------------------
const targetParam = params.get('target')?.split(',').map(Number);
const target = targetParam && targetParam.length === 2 ? new THREE.Vector3(targetParam[0], 0, targetParam[1]) : world.managerStart.position.clone();
const dummy = new THREE.Group();
const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.45, 6, 16), new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.7 }));
body.position.y = 0.6;
const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 24, 16), new THREE.MeshStandardMaterial({ color: '#FFDDBB', roughness: 0.7 }));
head.position.y = 1.0;
const tie = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.25, 0.04), new THREE.MeshStandardMaterial({ color: '#E63946' }));
tie.position.set(0, 0.62, 0.24);
dummy.add(body, head, tie);
dummy.traverse((o) => (o.castShadow = true));
dummy.position.copy(target);
dummy.rotation.y = world.managerStart.yaw;
engine.scene.add(dummy);

// ---- Camera ------------------------------------------------------------------------------------
type View = { pos: [number, number, number]; look: [number, number, number] };
// Layout views look in from above with the roof and ceiling cut away (?cutaway=0|1 overrides).
const CUTAWAY_VIEWS = new Set(['overview', 'top', 'desk', 'break', 'manager', 'reception', 'reserved', 'waiting', 'teamroom-top', 'interns-top']);
const views: Record<string, View> = {
  overview: { pos: [0, 25, 23], look: [0, 0, 0.5] },
  // Roughly what the gameplay camera does indoors: behind the manager, under the ceiling.
  follow: { pos: [target.x, 3.7, target.z + 5.8], look: [target.x, 1.0, target.z - 0.6] },
  inside: { pos: [0, 3.8, 9.2], look: [0, 1.2, -2] },
  'outside-roof': { pos: [13, 13, 27], look: [0, 3, 3] },
  entrance: { pos: [0, 6.5, 19.5], look: [0, 1, 8.5] },
  desk: { pos: [-1.9, 4.3, 7.6], look: [-4.6, 0.7, 2.6] },
  break: { pos: [-7.6, 6.2, -1.2], look: [-11.6, 0.6, -7.6] },
  manager: { pos: [7.4, 6.4, -0.6], look: [11.4, 0.6, -6.9] },
  reception: { pos: [1.4, 5.0, 2.8], look: [6.0, 1.0, 8.2] },
  whiteboard: { pos: [0, 4.2, -1.6], look: [0, 1.5, -9.6] },
  outside: { pos: [9, 9, 31], look: [0, 1, 12] },
  low: { pos: [3, 2.4, 22], look: [0, 3, 0] },
  top: { pos: [0, 48, 0.01], look: [0, 0, 0] },
  south: { pos: [-2, 4.6, -1.5], look: [-3, 1.3, 9.6] },
  waiting: { pos: [8.4, 5.2, 2.2], look: [12.4, 0.6, 7.4] },
  reserved: { pos: [-6.6, 5.6, 4.4], look: [-9.6, 0.4, -1.6] },
  screens: { pos: [-4.6, 1.75, 0.6], look: [-4.6, 0.95, -2.3] },
  teamroom: { pos: [0, 3.3, -1.2], look: [0, 1.6, -9.6] },
  'teamroom-top': { pos: [5.5, 9.5, -1.5], look: [0, 0.5, -7.6] },
  interns: { pos: [-5.6, 3.5, 2.6], look: [-8.6, 0.6, 7.8] },
  'interns-top': { pos: [-3.2, 8.5, 2.0], look: [-8.4, 0.4, 7.6] },
  lines: { pos: [5.35, 1.55, -5.4], look: [5.35, 1.0, -2.9] },
  cat: { pos: [-11.6, 1.6, -5.2], look: [-13.4, 0.55, -6.1] },
  garden: { pos: [-2, 3.2, 17.5], look: [-8, 0.9, 11.8] },
};
const viewName = params.get('view') ?? 'follow';
const cam = params.get('cam')?.split(',').map(Number);
const view: View = cam?.length === 6 ? { pos: [cam[0], cam[1], cam[2]], look: [cam[3], cam[4], cam[5]] } : (views[viewName] ?? views.follow);
const cutaway = params.has('cutaway') ? params.get('cutaway') === '1' : CUTAWAY_VIEWS.has(viewName);
if (cutaway) world.root.traverse((o) => {
  if (o.userData.overhead) o.visible = false;
});
engine.camera.position.set(...view.pos);
const controls = new OrbitControls(engine.camera, canvas);
controls.target.set(...view.look);
controls.enableDamping = true;
controls.update();

// ---- Demo content ------------------------------------------------------------------------------
const names = ['Claudette', 'Claudius', 'Clyde', 'Claudia', 'Klaus', 'Claudine', 'Clod', 'Claudio', 'Clawdia', 'Claudson', 'Clancy'];
const projects = ['blendscope', 'crateswipe', 'homebase', 'smaugfuss', 'claude-office', '~'];
const states: ScreenState[] = ['working', 'working', 'alert', 'idle', 'sleeping', 'working', 'idle', 'working', 'off', 'working', 'alert'];
world.desks.forEach((d, i) => {
  if (i < names.length) {
    d.setNameplate(names[i], projects[i % projects.length]);
    const lines =
      i === 5
        ? ['$ npm run typecheck', '> tsc --noEmit -p tsconfig.json', '', '✓ no errors', '$ npm test', ' PASS  src/world/nav.test.ts', ' PASS  src/world/desks.test.ts', '', 'Tests: 24 passed', '$ ']
        : undefined;
    d.setScreen(states[i], lines);
  } else {
    d.setNameplate('');
    d.setScreen('off');
  }
});
world.setStats({ staff: 9, working: 5, needsYou: 2, idle: 1, interns: 3 });
const now = Date.now();
world.setTeamBoard({
  plan: {
    limits: [
      { id: 'five_hour', label: '5-hour', usedPct: 42, resetsAt: now + 112 * 60000 },
      { id: 'seven_day', label: 'Weekly', usedPct: 71, resetsAt: now + 3 * 86400000 + 4 * 3600000 },
      { id: 'opus', label: 'Opus weekly', usedPct: 91, resetsAt: now + 2 * 86400000 },
    ],
    updatedAt: now - 23000,
  },
  team: { staff: 9, working: 5, needsYou: 2, idle: 1, interns: 3, costUSD: 18.42, linesAdded: 4210, linesRemoved: 1388, commitsToday: 14, sessionsToday: 11 },
  context: names.slice(0, 10).map((n, i) => ({ sessionId: String(i), displayName: n, tokens: 0, windowSize: 200000, pct: [88, 71, 64, 52, 47, 33, 21, 12, 9, 4][i] })),
});
const internTypes = ['Explore', 'executor', 'code-reviewer', 'Plan', 'verifier', 'designer'];
const internStates: ScreenState[] = ['working', 'working', 'idle', 'working', 'alert', 'working', 'sleeping'];
world.internSlots.forEach((s, i) => {
  if (i < 7) {
    s.setLabel(internTypes[i % internTypes.length], `for ${names[i % names.length]}`);
    s.setScreen(internStates[i]);
  } else {
    s.setLabel('');
    s.setScreen('off');
  }
});
world.setDoorOpen(params.get('door') === 'open');

// ---- Nav self-check ------------------------------------------------------------------------------
interface CheckResult {
  ok: boolean;
  lines: string[];
  ms: number;
}

function selfCheck(): CheckResult {
  const t0 = performance.now();
  const nav = debug.nav;
  const pts: [string, THREE.Vector3][] = [
    ['managerStart', world.managerStart.position],
    ['entrance.inside', world.entrance.inside],
    ['entrance.outside', world.entrance.outside],
  ];
  for (const d of world.desks) pts.push([`desk${d.index}.approach`, d.approach]);
  for (const s of world.internSlots) pts.push([`intern${s.index}.approach`, s.approach]);
  const bad: string[] = [];
  for (const [name, p] of pts) {
    if (!nav.isWalkable(p.x, p.z)) bad.push(`${name} (${p.x.toFixed(2)}, ${p.z.toFixed(2)}) is not on a walkable cell`);
    for (const [fromName, from] of [
      ['managerStart', world.managerStart.position],
      ['entrance.outside', world.entrance.outside],
    ] as const) {
      const path = world.findPath(from, p);
      if (!path) bad.push(`${name} unreachable from ${fromName}`);
      else if (path[path.length - 1].distanceTo(new THREE.Vector3(p.x, 0, p.z)) > 0.05) bad.push(`${name}: path from ${fromName} ends short`);
    }
  }
  for (const it of world.interactables) {
    const c = nav.nearestFree(it.position.x, it.position.z, it.radius);
    if (c < 0) {
      bad.push(`interactable ${it.id} has no walkable floor within its radius`);
      continue;
    }
    const p = nav.centerOf(c);
    const dist = Math.hypot(p.x - it.position.x, p.z - it.position.z);
    if (dist > it.radius - 0.15) bad.push(`interactable ${it.id}: nearest floor ${dist.toFixed(2)} m, radius ${it.radius}`);
    const path = world.findPath(world.managerStart.position, new THREE.Vector3(p.x, 0, p.z));
    if (!path) bad.push(`interactable ${it.id} unreachable`);
  }
  // Seats: the pelvis point must sit on the chair cushion, and yaw must face the monitor.
  world.root.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  for (const s of world.internSlots) {
    ray.set(new THREE.Vector3(s.seat.x, 1.5, s.seat.z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(world.root, true).find((h) => h.object.visible && h.object.name !== 'camera-blocker');
    if (!hit || Math.abs(hit.point.y - s.seat.y) > 0.015) bad.push(`intern${s.index}: seat.y ${s.seat.y} vs stool ${hit?.point.y.toFixed(3) ?? 'none'} (${hit?.object.name})`);
    const screen = world.root.getObjectByName(`intern-screen-${s.index}`);
    if (screen) {
      const to = screen.getWorldPosition(new THREE.Vector3()).sub(s.seat).setY(0).normalize();
      if (to.x * Math.sin(s.yaw) + to.z * Math.cos(s.yaw) < 0.95) bad.push(`intern${s.index}: yaw does not face the screen`);
    }
  }
  for (const d of world.desks) {
    ray.set(new THREE.Vector3(d.seat.x, 2, d.seat.z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(d.chair, true)[0];
    if (!hit || Math.abs(hit.point.y - d.seat.y) > 0.01) bad.push(`desk${d.index}: seat.y ${d.seat.y} vs cushion ${hit?.point.y.toFixed(3) ?? 'none'}`);
    const screen = world.root.getObjectByName(`screen-${d.index}`);
    if (screen) {
      const to = screen.getWorldPosition(new THREE.Vector3()).sub(d.seat).setY(0).normalize();
      if (to.x * Math.sin(d.yaw) + to.z * Math.cos(d.yaw) < 0.95) bad.push(`desk${d.index}: yaw does not face the monitor`);
    }
  }
  const ms = performance.now() - t0;
  const ok = bad.length === 0;
  if (ok) console.log(`[world] nav self-check OK: ${pts.length} points, ${world.interactables.length} interactables (${ms.toFixed(0)} ms)`);
  else for (const b of bad) console.error('[world] nav self-check:', b);
  return { ok, lines: bad, ms };
}
const check = selfCheck();

// Triangle budget per top-level world object (debug: window.__triangles()).
(window as unknown as { __triangles: () => [string, number][] }).__triangles = () => {
  const out = new Map<string, number>();
  for (const child of world.root.children) {
    let tris = 0;
    child.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const g = m.geometry;
      const n = g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;
      tris += (m as THREE.InstancedMesh).isInstancedMesh ? n * (m as THREE.InstancedMesh).count : n;
    });
    const key = child.name.replace(/-\d+$/, '') || child.type;
    out.set(key, (out.get(key) ?? 0) + tris);
  }
  return [...out.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Math.round(v)] as [string, number]);
};

// ---- Debug overlays --------------------------------------------------------------------------------
let navOverlay: THREE.Points | null = null;
function toggleNavOverlay(): void {
  if (navOverlay) {
    engine.scene.remove(navOverlay);
    navOverlay = null;
    return;
  }
  const nav = debug.nav;
  const pos: number[] = [];
  for (let c = 0; c < nav.blocked.length; c++) {
    if (!nav.blocked[c]) continue;
    const p = nav.centerOf(c);
    pos.push(p.x, 0.05, p.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  navOverlay = new THREE.Points(g, new THREE.PointsMaterial({ color: '#FF3355', size: 4, sizeAttenuation: false }));
  engine.scene.add(navOverlay);
}
if (params.get('nav') === '1') toggleNavOverlay();

if (params.get('path') === '1') {
  const goals = [world.desks[0].approach, world.desks[world.desks.length - 1].approach, world.interactables.find((i) => i.id === 'coffee')!.position];
  for (const goal of goals) {
    const path = world.findPath(world.entrance.outside, goal);
    if (!path) continue;
    const g = new THREE.BufferGeometry().setFromPoints(path.map((p) => p.clone().setY(0.08)));
    engine.scene.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: '#2B2D42' })));
  }
}

// ---- Loop ----------------------------------------------------------------------------------------------
window.addEventListener('resize', () => engine.resize());
window.addEventListener('keydown', (e) => {
  if (e.key === 'o') engine.setAO(!engine.aoEnabled);
  if (e.key === 'd') world.setDoorOpen(doorOpen = !doorOpen);
  if (e.key === 'n') toggleNavOverlay();
  if (e.key === 'h') hud.classList.toggle('hidden');
});
let doorOpen = params.get('door') === 'open';

// The composer renders several passes per frame; count them all.
engine.renderer.info.autoReset = false;

// GPU time of engine.render() via timer queries (where the browser exposes them).
const gl = engine.renderer.getContext() as WebGL2RenderingContext;
const timerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2') as { TIME_ELAPSED_EXT: number } | null;
const pending: WebGLQuery[] = [];
let gpuMs = -1;
function timedRender(): void {
  if (!timerExt || pending.length > 4) {
    engine.render();
    return;
  }
  const q = gl.createQuery()!;
  gl.beginQuery(timerExt.TIME_ELAPSED_EXT, q);
  engine.render();
  gl.endQuery(timerExt.TIME_ELAPSED_EXT);
  pending.push(q);
  while (pending.length && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) {
    const ms = gl.getQueryParameter(pending[0], gl.QUERY_RESULT) / 1e6;
    gpuMs = gpuMs < 0 ? ms : gpuMs * 0.9 + ms * 0.1;
    gl.deleteQuery(pending.shift()!);
  }
}
(window as unknown as { __perf: () => object }).__perf = () => ({
  gpuMs: +gpuMs.toFixed(2),
  calls: engine.renderer.info.render.calls,
  ao: engine.aoEnabled,
  dpr: engine.renderer.getPixelRatio(),
});
// Wall-clock cost of n back-to-back frames, synchronised with a one-pixel readback (timer queries
// are coarse on some ANGLE backends, and rAF in a headless browser doesn't wait for the GPU).
(window as unknown as { __bench: (n?: number) => object }).__bench = (n = 40) => {
  const px = new Uint8Array(4);
  engine.render();
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const t0 = performance.now();
  for (let i = 0; i < n; i++) engine.render();
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return { msPerFrame: +((performance.now() - t0) / n).toFixed(2), ao: engine.aoEnabled, dpr: engine.renderer.getPixelRatio() };
};
const timer = new THREE.Timer();
let frames = 0;
let fpsTime = 0;
let fps = 0;
let cpuMs = 0;
function frame(): void {
  timer.update();
  const dt = timer.getDelta();
  const t = timer.getElapsed();
  controls.update();
  engine.renderer.info.reset();
  const c0 = performance.now();
  world.update(dt, t);
  world.updateOcclusion(engine.camera, dummy.position);
  timedRender();
  cpuMs = cpuMs * 0.9 + (performance.now() - c0) * 0.1;
  frames++;
  fpsTime += dt;
  if (fpsTime > 0.5) {
    fps = frames / fpsTime;
    frames = 0;
    fpsTime = 0;
    const info = engine.renderer.info;
    hud.textContent = [
      `fps ${fps.toFixed(0)}  cpu ${cpuMs.toFixed(1)} ms  gpu ${gpuMs < 0 ? 'n/a' : gpuMs.toFixed(1) + ' ms'}  calls ${info.render.calls}  tris ${(info.render.triangles / 1000).toFixed(0)}k`,
      `AO ${engine.aoEnabled ? 'on' : 'off'} [o]  door ${doorOpen ? 'open' : 'closed'} [d]  nav [n]  desks ${world.desks.length}/${debug.maxDesks}  interns ${world.internSlots.length}/${debug.maxInterns}`,
      check.ok ? `nav self-check OK (${check.ms.toFixed(0)} ms)` : `nav self-check FAILED: ${check.lines.length}\n` + check.lines.slice(0, 6).join('\n'),
    ].join('\n');
  }
  requestAnimationFrame(frame);
}
frame();
