// Bootstrap + game loop: engine, world, characters, camera, input, network and UI.
//
// Debug URL params (handy for screenshots and filmstrips):
//   demo=1                 pretend office, no server (quiet=1 freezes the cast)
//   autowalk=1             the manager walks, runs, stops dead, turns and jumps on a loop
// Params marked (dev) only work in dev builds (import.meta.env.DEV): in production they could
// deep-link straight into someone's terminal or panels.
//   cam=closeup&focus=N    frame desk N's person up close (focus=<name>|manager, dev; cy/cd/ch tweak the angle)
//   cam=overview|door      fixed wide shots
//   panel=hire|archive|roster|help|stats|interns|employee|ask   open a panel (dev)
//   term=1                 sit at the focused person's computer (dev)
//   pose=walk|run|jump     freeze the manager mid-motion (dev)
//   near=N (dev)  at=x,z  yaw=deg pitch=deg dist=m   manager / camera placement
//   view=first|third       camera mode
//   debug=1 (dev)          window.office = { manager, director, camera, world, panels, store, regulars, engine, crowd }
//   lineup=1               every look in a row (character tuning)
//   regulars=off|some|lively|<n>   NPC coworkers for this visit (<n>: that many, all seated)
//   seed=<n>               seed Math.random, so the same people sit at the same desks
//   hour=<h>               pretend it's that hour (regulars' night-owl mode after 21)
import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import './ui/ui.css';
import * as THREE from 'three';
import { CameraRig, type CameraShot } from './camera';
import { Director } from './chars/director';
import type { EmployeeChar } from './chars/employee';
import { KIT_ENABLED, kitReport, updateKit } from './chars/kit';
import { createLineup } from './chars/lineup';
import { Manager, type DebugPose, type MoveIntent } from './chars/manager';
import type { RegularChar } from './chars/npc';
import { Regulars, mulberry32 } from './chars/regulars';
import { crowd } from './chars/crowd';
import { ViewModel } from './chars/viewmodel';
import { createDemoBackend } from './demo';
import { createEngine } from './engine/index';
import { HotDesks, USE_COMPUTER } from './hotdesk';
import { Input } from './input';
import { RosterStore, createBackend } from './net';
import { DeskTerminal } from './ui/deskterm';
import { h, truncate, waitingText } from './ui/dom';
import { Hud } from './ui/hud';
import { LabelLayer } from './ui/labels';
import { PanelHost, type PanelId } from './ui/panels';
import { Sfx } from './ui/sfx';
import { TerminalOverlay } from './ui/terminal';
import { Toasts } from './ui/toasts';
import { createWorld } from './world/index';
import type { DeskSlot, Interactable } from './world/types';

const params = new URLSearchParams(location.search);
/** Deep-link debug params (panel, term, focus, near, pose, debug): dev builds only. */
const devParam = (name: string): string | null => (import.meta.env.DEV ? params.get(name) : null);
/** A number from the URL, or null if it's missing or not a number (a NaN would break the camera). */
const numParam = (name: string): number | null => {
  const n = Number(params.get(name) || NaN);
  return Number.isFinite(n) ? n : null;
};
const DEG = Math.PI / 180;
/** Longest simulation step: a slower frame is split into several (springs and walks stay real-time). */
const MAX_STEP = 1 / 20;
/** Most time one frame may cover, so a stall (a hidden tab, a hitch) never jumps far. */
const MAX_FRAME = 0.25;
// ?seed=<n>: every Math.random() in the page is seeded, so screenshots repeat (who sits where).
const seedParam = Number(params.get('seed') ?? NaN);
if (Number.isFinite(seedParam)) Math.random = mulberry32(seedParam);

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
  const camera = new CameraRig(engine.camera, canvas, world);
  const terminal = new TerminalOverlay(uiRoot, backend, () => store.home);
  // An empty desk's computer: your own shell there (hotdesk.ts).
  const deskTerm = new DeskTerminal(uiRoot, backend);
  const viewModel = new ViewModel(manager.rig.looks.skin);
  // The camera carries the first-person hand + mug, so it has to be in the scene.
  scene.add(engine.camera);
  engine.camera.add(viewModel.group);
  const crosshair = h('div', { id: 'crosshair', hidden: true });
  document.body.append(crosshair);
  manager.onStep = (k) => {
    sfx.step(k);
    // Locks the first-person arm's bob to the real footfalls.
    viewModel.step(k);
  };
  manager.onJump = () => sfx.play('boing');
  manager.onLand = (k) => sfx.play('thud', { strength: k });

  const director = new Director(world, scene, {
    added(e, initial) {
      labels.attach(e);
      if (initial) return;
      toasts.show(`${e.data.displayName} clocked in for ${e.data.project}`, 'arrive', 3800, undefined, { who: e.data });
      sfx.chime();
    },
    leaving(e) {
      toasts.show(`${e.data.displayName} clocked out of ${e.data.project}`, 'leave', 3800, undefined, { who: e.data });
      sfx.play('chime-out');
    },
    removed(e) {
      labels.detach(e);
      sfx.forget(e.data.sessionId);
    },
    stateChanged(e, prev) {
      // Answered (here or in their own terminal): one pop-up, and the reminders stop.
      if (prev === 'needs-you') sfx.answered(e.data.sessionId);
      if (e.state !== 'needs-you') return;
      sfx.ding(e.data.sessionId);
      toasts.show(`${e.data.displayName} needs you`, 'warn', 6000, e.data.ask?.title ?? waitingText(e.data), {
        who: e.data,
        action: {
          label: 'Go',
          run: () => {
            if (!sitting) walkTo(e.data.sessionId);
          },
        },
      });
    },
    bumped(e) {
      labels.bumped(e);
      sfx.play('boop');
    },
    internAdded: (i) => labels.attachIntern(i),
    internRemoved: (i) => labels.detachIntern(i),
  });

  // Regulars: NPC coworkers at the desks no session is using (chars/regulars.ts). Never in the
  // roster, stats, toasts or Q; E gets a quip, never a panel. `?regulars=` and `?seed=` for tests.
  const regulars = new Regulars(world, scene, director, {
    seed: Number.isFinite(seedParam) ? seedParam : undefined,
    // People out in the yard and out of view aren't drawn (#48).
    camera: engine.camera,
    hooks: {
      added: (r) => labels.attachRegular(r),
      removed: (r) => labels.detachRegular(r),
      bumped: (r) => {
        labels.bumpedRegular(r);
        sfx.play('boop');
      },
    },
  });
  director.regulars = regulars;
  // Hot desks: any desk nobody is using has a computer you can sit at, your own shell (hotdesk.ts).
  const hotDesks = new HotDesks(world, director, regulars);
  director.hotDesks = hotDesks;

  // Sitting at someone's computer: walk behind the chair → ease the camera → open the terminal.
  // Until the bezel is open, Esc (or any move key) cancels. At an empty desk, `id` is `desk:<index>`.
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
        director.employees.get(id)?.answered();
        // The pop-up now; reminders stop when their state leaves needs-you (stateChanged).
        sfx.answered(id, false);
      },
    },
  });

  const hud = new Hud(
    uiRoot,
    {
      needsYou: () => goToNextNeedsYou(),
      stats: () => panels.toggle('stats'),
      roster: () => panels.toggle('roster'),
      hire: () => panels.toggle('hire'),
      mute: () => hud.setMuted(sfx.toggle()),
      help: () => panels.toggle('help'),
    },
    store,
  );
  hud.setMuted(sfx.muted);
  hud.setDemo(backend.demo);
  window.setInterval(() => hud.tick(), 1000);

  input.onMoveKey = () => {
    if (panels.openId) panels.close();
    if (sitting && sitting.phase !== 'open') cancelSit();
  };
  panels.onChange = (open) => {
    camera.locked = open;
    if (open) camera.releasePointer();
    // A panel (R, H, the chip) on the way to a computer: never mind the computer.
    if (open && sitting && sitting.phase !== 'open') cancelSit();
  };
  camera.onMode = (mode) => {
    crosshair.hidden = mode !== 'first';
    toasts.show(mode === 'first' ? 'First person' : 'Third person', 'info', 1600, mode === 'first' ? 'Click to look around. V to switch back.' : undefined);
  };
  crosshair.hidden = camera.mode !== 'first';

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
  backend.onNotice = (level, text) => toasts.show(text, level === 'warn' ? 'warn' : 'info', 6000);
  backend.onDesks = (open) => hotDesks.set(open);
  backend.onStats = (stats) => {
    store.setStats(stats);
    hud.setUsage(stats, store.now());
    try {
      world.setTeamBoard?.(stats);
    } catch (err) {
      console.warn('Team board unavailable:', err);
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

  // --- going places ----------------------------------------------------------------------
  const yawToward = (from: THREE.Vector3, to: THREE.Vector3) => Math.atan2(to.x - from.x, to.z - from.z);

  /** Who the current "go to" is heading for (Q again retargets to the next one). */
  let goingTo: string | null = null;

  /** Their question if they have one, otherwise their panel. A go-to passes focus: false. */
  function openFor(id: string, opts: { focus?: boolean } = {}): void {
    if (store.get(id)?.ask) panels.openAsk(id, opts);
    else panels.openEmployee(id, opts);
  }

  /**
   * Go to someone: open their panel (or their question) as you set off, hustle to their
   * desk (any trip takes about 3.5 s) and face them. Used by Q, the needs-you chip, toasts
   * and the roster.
   */
  function walkTo(id: string): void {
    const e = director.employees.get(id);
    if (!e) return;
    // Off somewhere else on the way to a computer: never mind the computer (and its desk).
    if (sitting) cancelSit();
    const target = e.atDesk ? e.desk.approach : e.position;
    // In first person, half a step further back: their head and screen in view, not the back of their head.
    const back = e.atDesk && camera.firstPerson > 0.5 ? target.clone().sub(e.position).setY(0).normalize().multiplyScalar(0.55).add(target).setY(0) : null;
    const path = (back && world.findPath(manager.position.clone(), back)) || world.findPath(manager.position.clone(), target.clone().setY(0));
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
    openFor(id, { focus: false });
    manager.walkPath(path, {
      onArrive: () => {
        goingTo = null;
        const now = director.employees.get(id);
        if (!now) return;
        manager.face(yawToward(manager.position, now.position));
      },
      speed: THREE.MathUtils.clamp(length / 3.5, 4.5, 9),
      // Turned to them on the way in, so you arrive facing them.
      faceAt: e.position,
    });
  }

  /** T (quick terminal): whoever the E prompt points at, else the nearest person in the office. */
  function peekTarget(): string | undefined {
    const near = nearestInteractable();
    if (near && 'it' in near && near.it.kind === 'desk' && near.it.deskIndex !== undefined) {
      const e = director.byDesk(near.it.deskIndex);
      if (e) return e.data.sessionId;
    }
    let best: EmployeeChar | undefined;
    let bestD = Infinity;
    for (const e of director.list()) {
      if (e.phase === 'leaving' || e.phase === 'gone') continue;
      const d = manager.distanceTo(e.position);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best?.data.sessionId;
  }

  /** Q / N / the chip: the next person with their hand up, longest-waiting first. */
  function goToNextNeedsYou(): void {
    const waiting = director
      .list()
      .filter((e) => e.handUp && e.phase !== 'leaving' && e.phase !== 'gone')
      .sort((a, b) => a.data.stateSince - b.data.stateSince);
    if (!waiting.length) {
      toasts.show('Nobody needs you right now', 'good', 2200);
      return;
    }
    const i = goingTo ? waiting.findIndex((e) => e.data.sessionId === goingTo) : -1;
    panels.close();
    walkTo(waiting[(i + 1) % waiting.length].data.sessionId);
  }

  // These four only need the desk: someone's (sitAt) or an empty one's (sitAtDesk).
  function behindChair(e: { desk: DeskSlot }): THREE.Vector3 {
    const yaw = e.desk.yaw;
    return e.desk.seat.clone().setY(0).add(new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)).multiplyScalar(0.95));
  }

  /** Where the desk monitor is (its screen mesh when the world provides one). */
  function monitorOf(e: { desk: DeskSlot }): THREE.Vector3 {
    const screen = e.desk.screen as THREE.Object3D | undefined;
    if (screen) return screen.getWorldPosition(new THREE.Vector3());
    const yaw = e.desk.yaw;
    return e.desk.seat.clone().add(new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(0.9)).setY(1.0);
  }

  /** Over the manager's shoulder, looking at the screen (UX.md §3.3). */
  function shoulderShot(e: { desk: DeskSlot }): CameraShot {
    const yaw = e.desk.yaw;
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const right = new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw));
    const head = manager.rig.head.getWorldPosition(new THREE.Vector3());
    return {
      position: head.addScaledVector(fwd, -0.5).addScaledVector(right, 0.35).add(new THREE.Vector3(0, 0.25, 0)),
      look: monitorOf(e),
    };
  }

  /** The desk monitor's rectangle on screen, for the bezel to grow out of. */
  function monitorRect(e: { desk: DeskSlot }): DOMRect | undefined {
    const screen = e.desk.screen as THREE.Object3D | undefined;
    if (!screen) return undefined;
    const box = new THREE.Box3().setFromObject(screen);
    if (box.isEmpty()) return undefined;
    const r = canvas.getBoundingClientRect();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < 8; i++) {
      const p = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(engine.camera);
      const x = r.left + ((p.x + 1) / 2) * r.width;
      const y = r.top + ((1 - p.y) / 2) * r.height;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    return new DOMRect(minX, minY, maxX - minX, maxY - minY);
  }

  function sitAt(id: string, instant = false): void {
    const e = director.employees.get(id);
    if (!e) return;
    // Someone who runs in your own terminal: their computer is just their Shell tab.
    panels.close();
    camera.releasePointer();
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
    manager.walkPath(path, { onArrive: () => beginTerminal(id), faceYaw: yaw });
  }

  function beginTerminal(id: string): void {
    const e = director.employees.get(id);
    if (!e || sitting?.id !== id) return;
    // This sit-down only: Esc mid-ease and E again starts another one (same id), and these
    // timers must leave that one alone.
    const me = sitting;
    me.phase = 'easing';
    manager.frozen = true;
    manager.face(e.desk.yaw);
    hud.setPrompt(null);
    // Swing the follow camera round behind the manager too, so easing in and out never flips sides.
    camera.yaw = e.desk.yaw + Math.PI;
    e.quip('Hey, boss!', 1.8);
    window.setTimeout(() => {
      const now = director.employees.get(id);
      if (!now || sitting !== me) return;
      camera.setShot(shoulderShot(now));
      labels.setVisible(false);
      window.setTimeout(() => {
        if (sitting !== me) return;
        me.phase = 'open';
        input.blocked = true;
        input.clear();
        terminal.open(now.data, monitorRect(now));
      }, 780);
    }, 250);
  }

  /** E at a desk nobody is using: walk behind its chair and sit down at its computer, your own shell there. */
  function sitAtDesk(index: number): void {
    const desk = world.desks[index];
    if (!desk) return;
    panels.close();
    camera.releasePointer();
    const path = world.findPath(manager.position.clone(), behindChair({ desk })) ?? world.findPath(manager.position.clone(), desk.approach);
    if (!path) {
      toasts.show("Can't get to that desk", 'bad');
      return;
    }
    sitting = { id: `desk:${index}`, phase: 'walking' };
    // It's yours from now until you stand up: nobody else is given it.
    hotDesks.sit(index);
    manager.walkPath(path, { onArrive: () => beginDeskTerminal(index), faceYaw: desk.yaw });
  }

  function beginDeskTerminal(index: number): void {
    const desk = world.desks[index];
    const id = `desk:${index}`;
    if (!desk || sitting?.id !== id) return;
    // This sit-down only (see beginTerminal).
    const me = sitting;
    me.phase = 'easing';
    manager.frozen = true;
    manager.face(desk.yaw);
    hud.setPrompt(null);
    // As at someone's computer: the follow camera swings round behind you, so easing never flips sides.
    camera.yaw = desk.yaw + Math.PI;
    window.setTimeout(() => {
      if (sitting !== me) return;
      camera.setShot(shoulderShot({ desk }));
      labels.setVisible(false);
      window.setTimeout(() => {
        if (sitting !== me) return;
        me.phase = 'open';
        input.blocked = true;
        input.clear();
        deskTerm.open(index, monitorRect({ desk }));
      }, 780);
    }, 250);
  }

  /** Esc or a move key before the bezel opened: never mind. */
  function cancelSit(): void {
    if (!sitting || sitting.phase === 'open') return;
    sitting = null;
    manager.cancelWalk();
    standUp();
  }

  function standUp(): void {
    sitting = null;
    hotDesks.stand();
    manager.frozen = false;
    camera.setShot(null);
    labels.setVisible(true);
    input.blocked = false;
    input.clear();
    canvas.focus();
  }

  terminal.events = {
    onClose: standUp,
    onNotice: (text, kind) => toasts.show(text, kind, kind === 'bad' ? 7000 : 4000),
  };
  deskTerm.events = terminal.events;

  labels.onBubbleClick = (e) => {
    if (sitting) return;
    openFor(e.data.sessionId);
  };

  // --- interacting -------------------------------------------------------------------------
  function interact(it: Interactable): void {
    switch (it.kind) {
      case 'reception':
        panels.open('hire');
        // Mabel on the front desk has a word about it.
        regulars.atReception();
        break;
      case 'archive':
        panels.open('archive');
        break;
      case 'whiteboard':
        panels.open('roster');
        break;
      case 'teamboard':
        panels.open('stats');
        break;
      case 'interns':
        panels.open('interns');
        break;
      case 'coffee':
        manager.sip(true);
        sfx.slurp();
        toasts.show('Fresh coffee!', 'good', 3000, 'You feel zippy. Walking speed up for a bit.');
        break;
      case 'desk': {
        const e = it.deskIndex !== undefined ? director.byDesk(it.deskIndex) : undefined;
        if (e) openFor(e.data.sessionId);
        else if (it.deskIndex !== undefined && hotDesks.canSit(it.deskIndex)) sitAtDesk(it.deskIndex);
        break;
      }
    }
  }

  /** What E would use: a world interactable, or a regular to chat with (a quip, never a panel). */
  type Target = { it: Interactable; label: string } | { regular: RegularChar; label: string };
  /** Third-person reach for chatting with a regular. */
  const CHAT_REACH = 1.7;

  function labelFor(it: Interactable): string | null {
    if (it.kind !== 'desk') return it.label;
    const e = it.deskIndex !== undefined ? director.byDesk(it.deskIndex) : undefined;
    // Nobody there: its computer is yours to use (a hot desk if your shell is still running).
    if (!e) return it.deskIndex !== undefined && hotDesks.canSit(it.deskIndex) ? USE_COMPUTER : null;
    if (!e.seated) return null;
    const name = e.data.displayName;
    if (e.handUp) return e.data.ask ? `Answer ${name}` : `Help ${name}`;
    return e.state === 'idle' ? `Talk to ${name}` : `Check on ${name}`;
  }

  const _eye = new THREE.Vector3();
  const _view = new THREE.Vector3();
  const _to = new THREE.Vector3();
  const _head = new THREE.Vector3();
  /**
   * What E would use. First person: whatever the crosshair points at within 2.5 m (else the
   * nearest thing in front). Third person: the nearest in reach, preferring what you face.
   */
  function nearestInteractable(): Target | null {
    const fp = camera.firstPerson > 0.5;
    if (fp) {
      engine.camera.getWorldPosition(_eye);
      camera.viewDir(_view);
    }
    /** Lower is better; null when it's out of the crosshair's reach. */
    const aim = (pos: THREE.Vector3, d: number): number | null => {
      if (fp) {
        const angle = _to.copy(pos).sub(_eye).normalize().angleTo(_view);
        if (angle > 70 * DEG) return null;
        return angle < 22 * DEG ? angle : 1 + d;
      }
      const facing = Math.abs(THREE.MathUtils.euclideanModulo(yawToward(manager.position, pos) - manager.yaw + Math.PI, Math.PI * 2) - Math.PI);
      return d + (facing > 100 * DEG ? 10 : 0);
    };
    let best: Target | null = null;
    let bestScore = Infinity;
    for (const it of world.interactables) {
      const d = manager.distanceTo(it.position);
      const reach = fp ? Math.max(2.5, it.radius) : it.radius;
      if (d > reach) continue;
      const label = labelFor(it);
      if (!label) continue;
      let score = aim(it.position, d);
      // Third person: someone you're standing by (or their desk) wins E over an empty computer beside them.
      if (score !== null && !fp && label === USE_COMPUTER) score += 0.5;
      if (score !== null && score < bestScore) {
        best = { it, label };
        bestScore = score;
      }
    }
    for (const r of regulars.list()) {
      if (r.phase === 'leaving' || r.phase === 'gone') continue;
      const d = manager.distanceTo(r.position);
      if (d > (fp ? 2.5 : CHAT_REACH)) continue;
      const score = aim(r.headWorld(_head), d);
      if (score !== null && score < bestScore) {
        best = { regular: r, label: `Chat with ${r.name}` };
        bestScore = score;
      }
    }
    return best;
  }

  // --- debug params --------------------------------------------------------------------
  const pose = devParam('pose') as DebugPose | null;
  if (pose === 'walk' || pose === 'run' || pose === 'jump') manager.debugPose = pose;
  const at = params.get('at')?.split(',').map(Number);
  if (at && at.length === 2 && at.every(Number.isFinite)) manager.teleport(new THREE.Vector3(at[0], 0, at[1]), manager.yaw);
  if (world.isInside?.(manager.position.clone().setY(1))) {
    camera.pitch = camera.indoorDefaults.pitch;
    camera.dist = camera.indoorDefaults.dist;
  }
  const yaw = numParam('yaw');
  if (yaw !== null) camera.yaw = yaw * DEG;
  const pitch = numParam('pitch');
  if (pitch !== null) camera.pitch = pitch * DEG;
  const dist = numParam('dist');
  if (dist !== null) camera.dist = dist;
  const view = params.get('view');
  if (view === 'first' || view === 'third') camera.setMode(view);
  const near = devParam('near');
  const autowalk = params.has('autowalk');
  if (devParam('debug') !== null) Object.assign(window, { office: { manager, director, camera, world, panels, store, regulars, engine, crowd } });

  const findFocus = (): EmployeeChar | undefined => {
    const f = devParam('focus');
    if (f === null) return undefined;
    const n = Number(f);
    if (f !== '' && Number.isInteger(n)) return director.list().find((e) => e.desk.index === n && e.phase !== 'gone');
    return director.list().find((e) => e.data.displayName.toLowerCase() === f.toLowerCase());
  };
  const camMode = params.get('cam');
  const debugShot = (): CameraShot | null => {
    // The building has a roof now, so the wide shot looks up the room from just under the ceiling.
    if (camMode === 'overview') return { position: new THREE.Vector3(0, 3.6, 9.6), look: new THREE.Vector3(0, 0.2, -3.5) };
    if (camMode === 'door') return { position: new THREE.Vector3(5.5, 4.2, 17.5), look: new THREE.Vector3(0, 1, 10) };
    if (camMode === 'closeup') {
      const isManager = devParam('focus') === 'manager';
      // focus=<name> frames a regular too (camera only: never their panel).
      const name = devParam('focus')?.toLowerCase();
      const e = isManager ? undefined : (findFocus() ?? regulars.list().find((r) => r.name.toLowerCase() === name));
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
    const p = devParam('panel') as PanelId | null;
    const focus = findFocus() ?? director.list().find((e) => e.data.ask) ?? director.list()[0];
    if (p === 'employee' && focus) panels.openEmployee(focus.data.sessionId);
    else if (p === 'ask' && focus) panels.openAsk(focus.data.sessionId);
    else if (p === 'chat' && focus) panels.openChat(focus.data.sessionId);
    else if (p === 'hire' || p === 'archive' || p === 'roster' || p === 'help' || p === 'stats' || p === 'interns') panels.open(p);
    if (devParam('term') !== null) {
      const hosted = focus?.data.hosted ? focus : director.list().find((e) => e.data.hosted && e.seated);
      if (hosted) sitAt(hosted.data.sessionId, true);
    }
  }, 600);

  /** `?autowalk=1`: walk, run, stop dead, turn back, run, stop, jump, sidestep — on a loop. */
  function autowalkIntent(t: number): MoveIntent {
    const T = t % 12;
    const go = (x: number, y: number, run = false, jump = false): MoveIntent => ({ x, y, run, jump });
    if (T < 1.5) return go(0, 1);
    if (T < 2.7) return go(0, 1, true);
    if (T < 3.9) return go(0, 0);
    if (T < 5.4) return go(0, -1);
    if (T < 6.6) return go(0, -1, true);
    if (T < 7.8) return go(0, 0);
    if (T < 7.9) return go(0, 0, false, true);
    if (T < 9.0) return go(0, 0);
    if (T < 9.6) return go(1, 0);
    if (T < 10.2) return go(-1, 0);
    return go(0, 0);
  }

  // --- loop ----------------------------------------------------------------------------
  const timer = new THREE.Timer();
  // Time spent in a hidden tab doesn't arrive as one huge step when you come back.
  timer.connect(document);
  const managerHead = new THREE.Vector3();
  let t = 0;
  let frames = 0;
  let splashUp = true;
  const loopStart = performance.now();
  let lastStats = '';
  let managerFade = 1;
  let managerHidden = false;
  /** Someone here is still waiting for their kit parts (chars/kit), so would change clothes on screen. */
  const kitPending = (): boolean =>
    KIT_ENABLED &&
    [manager.rig, ...director.list().map((e) => e.rig), ...director.interns().map((i) => i.rig), ...regulars.list().map((r) => r.rig)].some(
      (rig) => kitReport(rig)?.worn.length === 0,
    );

  window.addEventListener('resize', () => {
    engine.resize();
    labels.resize();
  });

  /** One simulation step (at most MAX_STEP): you, everyone else, the building. */
  function step(dt: number, jump: boolean): void {
    t += dt;
    const busy = !!panels.openId || !!sitting;
    const axis = busy ? { x: 0, y: 0 } : input.axis();
    const intent: MoveIntent = autowalk && !busy ? autowalkIntent(t) : { x: axis.x, y: axis.y, run: input.running, jump };
    // Everyone on foot steps around everyone else (#30): who is where, before anyone moves...
    crowd.begin(dt, manager, director.list(), director.interns(), regulars.list(), world.colliders);
    manager.update(dt, t, intent, camera.yaw, director.bumpables().concat(regulars.bumpables()));
    manager.rig.head.getWorldPosition(managerHead);
    director.update(dt, t, manager.position, managerHead);
    regulars.update(dt, t, manager.position, managerHead);
    // ...and after: nobody left standing inside anybody.
    crowd.settle();
    world.update(dt, t);
  }

  function frame(time?: number): void {
    requestAnimationFrame(frame);
    timer.update(time);
    const elapsed = Math.min(timer.getDelta(), MAX_FRAME);
    // Two frames on the same timestamp would divide by zero downstream; just skip.
    if (elapsed <= 1e-5) return;

    let jump = false;
    for (const a of input.drain()) {
      switch (a) {
        case 'interact': {
          if (panels.openId) {
            if (!panels.pressE()) panels.close();
          } else if (!sitting) {
            const near = nearestInteractable();
            if (near && 'regular' in near) regulars.chat(near.regular);
            else if (near) interact(near.it);
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
        case 'view':
          camera.toggleMode();
          break;
        case 'jump':
          jump = !panels.openId;
          break;
        case 'close':
          if (sitting && sitting.phase !== 'open') cancelSit();
          else if (panels.openId) panels.close();
          else if (manager.autoWalking) {
            manager.cancelWalk();
            goingTo = null;
          }
          break;
        case 'next':
          if (!sitting) goToNextNeedsYou();
          break;
        case 'peek':
          if (!sitting) panels.peek(peekTarget());
          break;
      }
    }

    // Real time in steps of at most 1/20 s: on a slow machine (8–15 fps) the office keeps its
    // pace, just choppier, instead of going into slow motion.
    const n = Math.ceil(elapsed / MAX_STEP - 1e-9);
    for (let i = 0; i < n; i++) step(elapsed / n, jump && i === 0);
    const busy = !!panels.openId || !!sitting;

    const shot = debugShot();
    if (shot) camera.snapShot(shot);
    // First person, auto-walking: look where you're going (then at them, once there).
    if (manager.walkSettling) camera.lookAlong(manager.facingGoal, elapsed);
    camera.update(elapsed, manager.position, manager.hop);
    // First person hides your body and shows your hand + mug. A third-person camera crowded
    // right up to you dissolves you completely, quickly, never hanging half-faded; hysteresis
    // (hide under 1.05 m, back over 1.25 m) so a camera hovering near 1 m can't flicker.
    // Shots frame you from their own place, so they never hide you.
    const fp = camera.firstPerson;
    viewModel.update(elapsed, manager.speed, manager.sipping, fp > 0.5 && camera.shotBlend < 0.1 ? fp : 0);
    // Coming back out of first person brings you back; going into it doesn't (from a crowded
    // camera he'd fade in right in front of the lens on the way to your eyes).
    if ((fp > 0 && camera.mode === 'third') || camera.shotBlend > 0.5 || camera.distance > 1.25) managerHidden = false;
    else if (camera.distance < 1.05) managerHidden = true;
    managerFade = THREE.MathUtils.clamp(managerFade + (managerHidden ? -elapsed : elapsed) / 0.15, 0, 1);
    manager.rig.setOpacity(managerFade);
    // After the fade: setOpacity shows him whenever it changes, and first person must still win.
    manager.rig.root.visible = fp < 0.5 || camera.shotBlend > 0.5;
    // Fully dissolved: skip drawing altogether (every pixel would be discarded anyway).
    if (managerFade <= 0) manager.rig.root.visible = false;
    world.updateOcclusion(engine.camera, manager.position);
    // Newly dressed characters merged into one mesh each (a couple a frame); far ones in one draw.
    updateKit(engine.camera);

    const stats = director.stats();
    const sk = JSON.stringify(stats);
    if (sk !== lastStats) {
      lastStats = sk;
      hud.setStats(stats);
    }
    const near = busy ? null : nearestInteractable();
    hud.setPrompt(near ? truncate(near.label, 40) : null);
    crosshair.classList.toggle('aim', !!near && fp > 0.5);
    labels.update(manager.position, engine.camera);

    engine.render();
    labels.render(scene, engine.camera);
    // The splash lifts after a few frames, once everyone here is dressed (2.5 s at most).
    if (splashUp && ++frames >= 3 && (!kitPending() || performance.now() - loopStart > 2500)) {
      splashUp = false;
      document.getElementById('splash')?.classList.add('gone');
    }
  }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------------------

function runLineup(): void {
  const pose = (devParam('pose') as DebugPose | null) ?? null;
  const centre = new THREE.Vector3(0, 0, 0.5);
  const lineup = createLineup(scene, centre, 0, pose);
  const cam = engine.camera;
  const dist = numParam('dist') ?? 6.5;
  const lx = numParam('lx') ?? 0;
  const ly = numParam('ly') ?? 0.75;
  cam.position.set(lx, ly + 0.6, centre.z + dist);
  cam.lookAt(lx, ly, centre.z);
  const timer = new THREE.Timer();
  timer.connect(document);
  let t = 0;
  window.addEventListener('resize', () => engine.resize());
  document.getElementById('splash')?.classList.add('gone');
  const frame = (time?: number) => {
    requestAnimationFrame(frame);
    timer.update(time);
    const elapsed = Math.min(timer.getDelta(), MAX_FRAME);
    if (elapsed <= 1e-5) return;
    const n = Math.ceil(elapsed / MAX_STEP - 1e-9);
    for (let i = 0; i < n; i++) {
      t += elapsed / n;
      lineup.update(elapsed / n, t, cam.position);
      world.update(elapsed / n, t);
    }
    updateKit(cam);
    engine.render();
  };
  frame();
}
