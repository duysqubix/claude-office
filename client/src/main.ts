// Bootstrap + game loop: engine, world, characters, camera, input, network and UI.
//
// Debug URL params (handy for screenshots):
//   demo=1                 pretend office, no server (quiet=1 freezes the cast)
//   cam=closeup&focus=N    frame desk N's person up close (focus=<name> works too; cy/cd/ch tweak the angle)
//   cam=overview|door      fixed wide shots
//   panel=hire|archive|roster|help|employee   open a panel
//   term=1                 sit at the focused person's computer
//   pose=walk|run|jump     freeze the manager mid-motion
//   at=x,z  yaw=deg pitch=deg dist=m           manager / camera placement
//   lineup=1               every look in a row (character tuning)
import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import './ui/ui.css';
import * as THREE from 'three';
import { CameraRig, type CameraShot } from './camera';
import { Director } from './chars/director';
import type { EmployeeChar } from './chars/employee';
import { createLineup } from './chars/lineup';
import { Manager, type DebugPose } from './chars/manager';
import { createDemoBackend } from './demo';
import { createEngine } from './engine/index';
import { Input } from './input';
import { RosterStore, createBackend } from './net';
import { truncate, waitingText } from './ui/dom';
import { Hud } from './ui/hud';
import { LabelLayer } from './ui/labels';
import { PanelHost, type PanelId } from './ui/panels';
import { Sfx } from './ui/sfx';
import { TerminalOverlay } from './ui/terminal';
import { Toasts } from './ui/toasts';
import { createWorld } from './world/index';
import type { Interactable } from './world/types';

const params = new URLSearchParams(location.search);
const DEG = Math.PI / 180;

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui') as HTMLElement;
canvas.tabIndex = 0;

const engine = createEngine(canvas);
const world = createWorld(engine);
const scene = engine.scene;

if (params.has('lineup')) runLineup();
else runOffice();

// ---------------------------------------------------------------------------------------

function runOffice(): void {
  const sfx = new Sfx();
  const toasts = new Toasts(uiRoot);
  const labels = new LabelLayer(document.body);
  const store = new RosterStore();
  const backend = params.has('demo') ? createDemoBackend(params) : createBackend();
  const input = new Input();
  const manager = new Manager(world, scene);
  const camera = new CameraRig(engine.camera, canvas);
  camera.blockers = world.cameraBlockers;
  camera.ceiling = (p) => (world.isInside(p) ? world.interior.ceilingY : null);
  const terminal = new TerminalOverlay(uiRoot, backend);
  manager.onStep = (k) => sfx.step(k);

  const director = new Director(world, scene, {
    added(e, initial) {
      labels.attach(e);
      if (initial) return;
      toasts.show(`${e.data.displayName} clocked in for ${e.data.project}`, 'arrive', 3800);
      sfx.chime();
    },
    leaving(e) {
      toasts.show(`${e.data.displayName} clocked out of ${e.data.project}`, 'leave', 3800);
    },
    removed(e) {
      labels.detach(e);
    },
    stateChanged(e) {
      if (e.state !== 'needs-you') return;
      sfx.ding();
      toasts.show(`${e.data.displayName} needs you`, 'warn', 4500, waitingText(e.data));
    },
    bumped(e) {
      labels.bumped(e);
      sfx.boing();
    },
  });

  // Sitting at someone's computer: walk behind the chair → ease the camera → open the terminal.
  let sitting: { id: string; phase: 'walking' | 'easing' | 'open' } | null = null;

  const panels = new PanelHost(uiRoot, {
    store,
    backend,
    toasts,
    sfx,
    actions: {
      walkTo: (id) => walkTo(id),
      sitAt: (id) => sitAt(id),
      answered: (id) => {
        // Lower their hand now; the next roster broadcast says what they actually do next.
        const e = director.employees.get(id);
        if (e?.data.state === 'needs-you') e.setData({ ...e.data, state: 'working', stateSince: Date.now(), ask: undefined, waitingFor: undefined });
      },
    },
  });

  const hud = new Hud(uiRoot, {
    needsYou: () => goToNextNeedsYou(),
    stats: () => panels.toggle('stats'),
    roster: () => panels.toggle('roster'),
    hire: () => panels.toggle('hire'),
    mute: () => hud.setMuted(sfx.toggle()),
    help: () => panels.toggle('help'),
  });
  hud.setMuted(sfx.muted);
  hud.setDemo(backend.demo);
  window.setInterval(() => hud.tick(), 1000);

  input.onMoveKey = () => {
    if (panels.openId) panels.close();
  };
  panels.onChange = (open) => {
    camera.locked = open;
  };

  // --- network -------------------------------------------------------------------------
  const bootAt = Date.now();
  let everOnline = false;
  let offlineTimer = 0;
  backend.onHello = (home) => (store.home = home);
  backend.onRoster = (list, now) => {
    store.set(list, now);
    director.sync(list);
    hud.setStats(director.stats());
  };
  backend.onNotice = (level, text) => toasts.show(text, level === 'warn' ? 'warn' : 'info', 5000);
  let boardWarned = false;
  backend.onStats = (stats) => {
    try {
      world.setTeamBoard(stats);
    } catch (err) {
      // An older world build without the Team Room board shouldn't take the roster down with it.
      if (!boardWarned) console.warn('Team board unavailable:', err);
      boardWarned = true;
    }
  };
  backend.onStatus = (online, retryAt) => {
    store.online = online;
    window.clearTimeout(offlineTimer);
    if (online) {
      everOnline = true;
      hud.setOffline(false);
      return;
    }
    // Don't flash the banner during the very first connect.
    const delay = everOnline || Date.now() - bootAt > 1500 ? 0 : 1500;
    offlineTimer = window.setTimeout(() => hud.setOffline(true, retryAt), delay);
  };
  backend.start();

  // --- actions -------------------------------------------------------------------------
  function yawToward(from: THREE.Vector3, to: THREE.Vector3): number {
    return Math.atan2(to.x - from.x, to.z - from.z);
  }

  /** Who the current "go to" is heading for (Q again retargets to the next one). */
  let goingTo: string | null = null;

  /**
   * Go to someone: hustle to their desk (any trip takes about 3.5 s), face them and open
   * their panel. Used by Q, the needs-you chip and the roster.
   */
  function walkTo(id: string): void {
    const e = director.employees.get(id);
    if (!e) return;
    const target = e.atDesk ? e.desk.approach : e.position;
    const path = world.findPath(manager.position.clone(), target.clone().setY(0));
    if (!path) {
      toasts.show(`Can't reach ${e.data.displayName} from here.`, 'bad');
      return;
    }
    let length = 0;
    let prev = manager.position;
    for (const p of path) {
      length += Math.hypot(p.x - prev.x, p.z - prev.z);
      prev = p;
    }
    goingTo = id;
    const speed = THREE.MathUtils.clamp(length / 3.5, 4.5, 9);
    manager.walkPath(
      path,
      () => {
        goingTo = null;
        const now = director.employees.get(id);
        if (!now) return;
        manager.face(yawToward(manager.position, now.position));
        if (!panels.openId) panels.openEmployee(id);
      },
      undefined,
      speed,
    );
  }

  /** Q / N / the chip: the next person with their hand up, longest-waiting first. */
  function goToNextNeedsYou(): void {
    const waiting = director
      .list()
      .filter((e) => e.state === 'needs-you' && e.phase !== 'leaving' && e.phase !== 'gone')
      .sort((a, b) => a.data.stateSince - b.data.stateSince);
    if (!waiting.length) {
      toasts.show('Nobody needs you right now', 'good', 2200);
      return;
    }
    const i = goingTo ? waiting.findIndex((e) => e.data.sessionId === goingTo) : -1;
    panels.close();
    walkTo(waiting[(i + 1) % waiting.length].data.sessionId);
  }

  function behindChair(e: EmployeeChar): THREE.Vector3 {
    const yaw = e.desk.yaw;
    return e.desk.seat.clone().setY(0).add(new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)).multiplyScalar(0.95));
  }

  function shoulderShot(e: EmployeeChar): CameraShot {
    const yaw = e.desk.yaw;
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const right = new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw));
    const head = manager.rig.head.getWorldPosition(new THREE.Vector3());
    const monitor = e.desk.seat.clone().addScaledVector(fwd, 0.9).setY(1.0);
    return {
      position: head.addScaledVector(fwd, -0.8).addScaledVector(right, 0.38).add(new THREE.Vector3(0, 0.32, 0)),
      look: monitor,
    };
  }

  function sitAt(id: string, instant = false): void {
    const e = director.employees.get(id);
    if (!e) return;
    if (!e.data.hosted) {
      toasts.show(`${e.data.displayName} works in your own terminal`, 'info', 4000, 'Only people hired here have a computer you can sit at.');
      return;
    }
    panels.close();
    const spot = behindChair(e);
    const yaw = e.desk.yaw;
    sitting = { id, phase: 'walking' };
    if (instant) {
      manager.teleport(spot, yaw);
      manager.face(yaw);
      beginTerminal(id);
      return;
    }
    const path = world.findPath(manager.position.clone(), spot) ?? world.findPath(manager.position.clone(), e.desk.approach);
    if (!path) {
      sitting = null;
      toasts.show(`Can't get to ${e.data.displayName}'s desk`, 'bad');
      return;
    }
    manager.walkPath(path, () => beginTerminal(id), yaw);
  }

  function beginTerminal(id: string): void {
    const e = director.employees.get(id);
    if (!e || sitting?.id !== id) return;
    sitting.phase = 'easing';
    manager.frozen = true;
    manager.face(e.desk.yaw);
    // Swing the follow camera round behind the manager too, so easing in and out never flips sides.
    camera.yaw = e.desk.yaw + Math.PI;
    hud.setPrompt(null);
    window.setTimeout(() => {
      const now = director.employees.get(id);
      if (!now || sitting?.id !== id) return;
      camera.setShot(shoulderShot(now));
      labels.setVisible(false);
      window.setTimeout(() => {
        if (sitting?.id !== id) return;
        sitting.phase = 'open';
        input.blocked = true;
        input.clear();
        terminal.open(now.data);
      }, 850);
    }, 250);
  }

  terminal.events.onClose = () => {
    sitting = null;
    manager.frozen = false;
    camera.setShot(null);
    labels.setVisible(true);
    input.blocked = false;
    input.clear();
    canvas.focus();
  };

  function interact(it: Interactable): void {
    switch (it.kind) {
      case 'reception':
        panels.open('hire');
        break;
      case 'archive':
        panels.open('archive');
        break;
      case 'whiteboard':
        panels.open('roster');
        break;
      case 'coffee':
        manager.sip(true);
        sfx.slurp();
        toasts.show('Fresh coffee!', 'good', 3000, 'You feel zippy. Walking speed up for a bit.');
        break;
      case 'desk': {
        const e = it.deskIndex !== undefined ? director.byDesk(it.deskIndex) : undefined;
        if (e) panels.openEmployee(e.data.sessionId);
        break;
      }
    }
  }

  function nearestInteractable(): { it: Interactable; label: string } | null {
    let best: { it: Interactable; label: string } | null = null;
    let bestD = Infinity;
    for (const it of world.interactables) {
      const d = manager.distanceTo(it.position);
      if (d > it.radius || d >= bestD) continue;
      let label = it.label;
      if (it.kind === 'desk') {
        const e = it.deskIndex !== undefined ? director.byDesk(it.deskIndex) : undefined;
        if (!e || !e.seated) continue;
        const name = e.data.displayName;
        label = e.state === 'needs-you' ? `Help ${name}` : e.state === 'idle' ? `Talk to ${name}` : `Check on ${name}`;
      }
      best = { it, label };
      bestD = d;
    }
    return best;
  }

  // --- debug params --------------------------------------------------------------------
  const pose = params.get('pose') as DebugPose | null;
  if (pose === 'walk' || pose === 'run' || pose === 'jump') manager.debugPose = pose;
  const at = params.get('at')?.split(',').map(Number);
  if (at && at.length === 2 && at.every(Number.isFinite)) manager.teleport(new THREE.Vector3(at[0], 0, at[1]), manager.yaw);
  if (params.has('yaw')) camera.yaw = Number(params.get('yaw')) * DEG;
  if (params.has('pitch')) camera.pitch = Number(params.get('pitch')) * DEG;
  if (params.has('dist')) camera.dist = Number(params.get('dist'));
  const near = params.get('near');

  const findFocus = (): EmployeeChar | undefined => {
    const f = params.get('focus');
    if (f === null) return undefined;
    const n = Number(f);
    if (f !== '' && Number.isInteger(n)) return director.list().find((e) => e.desk.index === n && e.phase !== 'gone');
    return director.list().find((e) => e.data.displayName.toLowerCase() === f.toLowerCase());
  };
  const camMode = params.get('cam');
  const debugShot = (): CameraShot | null => {
    if (camMode === 'overview') return { position: new THREE.Vector3(0, 25, 23), look: new THREE.Vector3(0, 0, 1.5) };
    if (camMode === 'door') return { position: new THREE.Vector3(5.5, 4.2, 17.5), look: new THREE.Vector3(0, 1, 10) };
    if (camMode === 'closeup') {
      const isManager = params.get('focus') === 'manager';
      const e = isManager ? undefined : findFocus();
      if (!e && !isManager) return null;
      const head = e ? e.headWorld() : manager.rig.head.getWorldPosition(new THREE.Vector3());
      const yaw = (e ? e.body.heading.value : manager.yaw) + Number(params.get('cy') ?? 50) * DEG;
      const d = Number(params.get('cd') ?? 2.1);
      const up = Number(params.get('ch') ?? 0.4);
      return {
        position: head.clone().add(new THREE.Vector3(Math.sin(yaw) * d, up, Math.cos(yaw) * d)),
        look: head.clone().add(new THREE.Vector3(0, -0.12, 0)),
      };
    }
    return null;
  };
  window.setTimeout(() => {
    const desk = near !== null ? world.desks[Number(near)] : undefined;
    if (desk) manager.teleport(desk.approach.clone().add(new THREE.Vector3(Math.sin(desk.yaw), 0, Math.cos(desk.yaw)).multiplyScalar(-0.5)), desk.yaw);
    const p = params.get('panel') as PanelId | null;
    const focus = findFocus() ?? director.list()[0];
    if (p === 'employee' && focus) panels.openEmployee(focus.data.sessionId);
    else if (p === 'hire' || p === 'archive' || p === 'roster' || p === 'help') panels.open(p);
    if (params.has('term')) {
      const hosted = focus?.data.hosted ? focus : director.list().find((e) => e.data.hosted && e.seated);
      if (hosted) sitAt(hosted.data.sessionId, true);
    }
  }, 600);

  // `?debug=1`: poke at the game from the console.
  if (params.has('debug')) Object.assign(window, { office: { manager, director, camera, world, panels } });

  // --- loop ----------------------------------------------------------------------------
  const clock = new THREE.Clock();
  const follow = new THREE.Vector3();
  const managerHead = new THREE.Vector3();
  let t = 0;
  let frames = 0;
  let lastStats = '';

  window.addEventListener('resize', () => {
    engine.resize();
    labels.resize();
  });

  function frame(): void {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 1 / 20);
    // Two frames on the same timestamp would divide by zero downstream; just skip.
    if (dt <= 1e-5) return;
    t += dt;

    let jump = false;
    for (const a of input.drain()) {
      switch (a) {
        case 'interact': {
          if (panels.openId) panels.close();
          else if (!sitting) {
            const near = nearestInteractable();
            if (near) interact(near.it);
          }
          break;
        }
        case 'roster':
          panels.toggle('roster');
          break;
        case 'hire':
          panels.toggle('hire');
          break;
        case 'help':
          panels.toggle('help');
          break;
        case 'mute':
          hud.setMuted(sfx.toggle());
          break;
        case 'jump':
          jump = !panels.openId;
          break;
        case 'close':
          if (panels.openId) panels.close();
          else if (manager.autoWalking && !sitting) {
            manager.cancelWalk();
            goingTo = null;
          }
          break;
        case 'next':
          if (!sitting) goToNextNeedsYou();
          break;
      }
    }

    const busy = !!panels.openId || !!sitting;
    const axis = busy ? { x: 0, y: 0 } : input.axis();
    manager.update(dt, t, { x: axis.x, y: axis.y, run: input.running, jump }, camera.yaw, director.bumpables());
    manager.rig.head.getWorldPosition(managerHead);
    director.update(dt, t, manager.position, managerHead);

    follow.copy(manager.position).add(new THREE.Vector3(0, 1.0, 0));
    const shot = debugShot();
    if (shot) camera.snapShot(shot);
    camera.update(dt, follow);
    world.update(dt, t);
    world.updateOcclusion(engine.camera, manager.position);

    const stats = director.stats();
    const sk = JSON.stringify(stats);
    if (sk !== lastStats) {
      lastStats = sk;
      hud.setStats(stats);
      // While anyone waits, the tab says so.
      document.title = stats.needsYou ? `(${stats.needsYou}) Claude Office` : 'Claude Office';
    }
    const near = busy ? null : nearestInteractable();
    hud.setPrompt(near ? truncate(near.label, 40) : null);
    labels.update(manager.position, engine.camera);

    engine.render();
    labels.render(scene, engine.camera);
    if (++frames === 3) document.getElementById('splash')?.classList.add('gone');
  }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------------------

function runLineup(): void {
  const pose = (params.get('pose') as DebugPose | null) ?? null;
  const centre = new THREE.Vector3(0, 0, 5.5);
  const lineup = createLineup(scene, centre, 0, pose);
  const cam = engine.camera;
  const dist = Number(params.get('dist') ?? 8);
  const lx = Number(params.get('lx') ?? 0);
  const ly = Number(params.get('ly') ?? 0.75);
  cam.position.set(lx, ly + 0.6, centre.z + dist);
  cam.lookAt(lx, ly, centre.z);
  const clock = new THREE.Clock();
  let t = 0;
  window.addEventListener('resize', () => engine.resize());
  document.getElementById('splash')?.classList.add('gone');
  const frame = () => {
    const dt = Math.min(clock.getDelta(), 0.05);
    t += dt;
    lineup.update(dt, t, cam.position);
    world.update(dt, t);
    engine.render();
    requestAnimationFrame(frame);
  };
  frame();
}
