// Runs the floor: turns roster updates into people walking in, sitting down, getting up
// and going home. Owns desk assignment (stable per session, remembered in localStorage),
// chairs, interns, desk monitors/nameplates, whiteboard stats and the front door.
import * as THREE from 'three';
import type { Employee, EmployeeState } from '../../../shared/protocol';
import type { DeskSlot, OfficeStats, ScreenState, World } from '../world/types';
import { Chair, EmployeeChar, distXZ } from './employee';
import { InternChar } from './intern';
import type { Bumpable } from './manager';

export interface DirectorHooks {
  added?(e: EmployeeChar, initial: boolean): void;
  leaving?(e: EmployeeChar): void;
  removed?(e: EmployeeChar): void;
  stateChanged?(e: EmployeeChar, prev: EmployeeState): void;
  bumped?(e: EmployeeChar): void;
}

const DESK_KEY = 'claude-office:desks';
const DESK_TTL = 14 * 24 * 3600 * 1000;
const MAX_INTERNS_SHOWN = 4;

type DeskMemory = Record<string, [number, number]>; // sessionId → [desk index, last seen ms]

function loadMemory(): DeskMemory {
  try {
    const raw = localStorage.getItem(DESK_KEY);
    const m = raw ? (JSON.parse(raw) as DeskMemory) : {};
    return m && typeof m === 'object' ? m : {};
  } catch {
    return {};
  }
}

function screenFor(e: EmployeeChar): ScreenState {
  if (!e.seated) return 'off';
  switch (e.state) {
    case 'working':
      return 'working';
    case 'needs-you':
      return 'alert';
    case 'sleeping':
      return 'sleeping';
    default:
      return 'idle';
  }
}

interface Crew {
  interns: Map<string, InternChar>;
  overflow: number;
}

export class Director {
  readonly employees = new Map<string, EmployeeChar>();
  private chairs = new Map<number, Chair>();
  private crews = new Map<string, Crew>();
  private leftovers: InternChar[] = [];
  private memory = loadMemory();
  private memoryDirty = false;
  private memorySavedAt = 0;
  private hadRoster = false;
  private deskKeys = new Map<number, string>();
  private desksDirty = true;
  private lastStats = '';
  private doorOpen: boolean | null = null;
  private door: THREE.Vector3;

  constructor(
    private world: World,
    private scene: THREE.Object3D,
    private hooks: DirectorHooks = {},
  ) {
    const { inside, outside } = world.entrance;
    // The door sits in the wall between the two entrance points, ~1.4 m in from `inside`.
    this.door = outside.clone().sub(inside).setY(0).normalize().multiplyScalar(1.4).add(inside).setY(0);
  }

  get doorPosition(): THREE.Vector3 {
    return this.door;
  }

  /** Number of active interns hidden behind a "+N" bubble for this employee. */
  internOverflow(sessionId: string): number {
    return this.crews.get(sessionId)?.overflow ?? 0;
  }

  byDesk(index: number): EmployeeChar | undefined {
    for (const e of this.employees.values()) if (e.desk.index === index && e.atDesk) return e;
    return undefined;
  }

  list(): EmployeeChar[] {
    return [...this.employees.values()];
  }

  /** Everyone the manager can bump into. */
  bumpables(): Bumpable[] {
    const out: Bumpable[] = [];
    for (const e of this.employees.values()) if (e.phase !== 'gone') out.push(e);
    for (const c of this.crews.values()) for (const i of c.interns.values()) if (i.phase !== 'gone') out.push(i);
    return out;
  }

  sync(roster: Employee[]): void {
    const initial = !this.hadRoster;
    this.hadRoster = true;
    const seen = new Set<string>();
    const now = Date.now();
    for (const data of roster) {
      seen.add(data.sessionId);
      let e = this.employees.get(data.sessionId);
      if (!e) {
        const desk = this.assignDesk(data.sessionId);
        e = new EmployeeChar(data, desk, this.chairFor(desk), this.world, this.scene, initial);
        e.hooks.onBump = (x) => this.hooks.bumped?.(x);
        this.employees.set(data.sessionId, e);
        this.hooks.added?.(e, initial);
      } else {
        if (e.phase === 'leaving' || e.phase === 'standing-up') e.comeBack();
        const prev = e.data.state;
        e.setData(data);
        if (prev !== data.state) this.hooks.stateChanged?.(e, prev);
      }
      if (this.memory[data.sessionId]?.[0] !== e.desk.index) this.memoryDirty = true;
      this.memory[data.sessionId] = [e.desk.index, now];
      this.syncCrew(e, initial);
    }
    for (const e of this.employees.values()) {
      if (seen.has(e.data.sessionId)) continue;
      if (e.phase === 'leaving' || e.phase === 'gone' || e.phase === 'standing-up') continue;
      e.leave();
      this.hooks.leaving?.(e);
      const crew = this.crews.get(e.data.sessionId);
      if (crew) for (const i of crew.interns.values()) i.leave();
    }
    this.saveMemory();
    this.desksDirty = true;
    this.syncDesks();
  }

  update(dt: number, t: number, manager: THREE.Vector3, managerHead: THREE.Vector3): void {
    const head = new THREE.Vector3();
    let doorBusy = distXZ(manager, this.door) < 2.5;
    for (const [id, e] of this.employees) {
      const before = e.phase;
      e.update(dt, t, manager, managerHead);
      if (e.phase !== before) this.desksDirty = true;
      if (e.phase === 'gone') {
        this.employees.delete(id);
        this.hooks.removed?.(e);
        e.dispose();
        const crew = this.crews.get(id);
        if (crew) {
          for (const i of crew.interns.values()) {
            i.leave();
            this.leftovers.push(i);
          }
          this.crews.delete(id);
        }
        continue;
      }
      if (!doorBusy && distXZ(e.position, this.door) < 2.5) doorBusy = true;
      const crew = this.crews.get(id);
      if (!crew) continue;
      e.headWorld(head);
      let n = 0;
      const focus = new THREE.Vector3();
      for (const [iid, i] of crew.interns) {
        i.update(dt, t, head, managerHead);
        if (i.phase === 'gone') {
          crew.interns.delete(iid);
          i.dispose();
          continue;
        }
        if (!doorBusy && distXZ(i.position, this.door) < 2.5) doorBusy = true;
        if (i.phase === 'present') {
          focus.add(i.position);
          n++;
        }
      }
      e.internFocus = n ? focus.divideScalar(n) : null;
    }
    for (let k = this.leftovers.length - 1; k >= 0; k--) {
      const i = this.leftovers[k];
      i.update(dt, t, this.door, managerHead);
      if (i.phase === 'gone') {
        i.dispose();
        this.leftovers.splice(k, 1);
      } else if (!doorBusy && distXZ(i.position, this.door) < 2.5) doorBusy = true;
    }
    if (doorBusy !== this.doorOpen) {
      this.doorOpen = doorBusy;
      this.world.setDoorOpen(doorBusy);
    }
    if (this.desksDirty) this.syncDesks();
  }

  stats(): OfficeStats {
    const s: OfficeStats = { staff: 0, working: 0, needsYou: 0, idle: 0, interns: 0 };
    for (const e of this.employees.values()) {
      if (e.phase === 'leaving' || e.phase === 'gone' || e.phase === 'standing-up') continue;
      s.staff++;
      if (e.state === 'working') s.working++;
      else if (e.state === 'needs-you') s.needsYou++;
      else s.idle++;
      s.interns += e.data.interns.filter((i) => i.active).length;
    }
    return s;
  }

  // -------------------------------------------------------------------------------------

  private chairFor(desk: DeskSlot): Chair {
    let c = this.chairs.get(desk.index);
    if (!c || c.desk !== desk) {
      c = new Chair(desk);
      this.chairs.set(desk.index, c);
    }
    return c;
  }

  private assignDesk(sessionId: string): DeskSlot {
    const taken = new Set<number>();
    for (const e of this.employees.values()) if (e.phase !== 'gone' && e.phase !== 'leaving') taken.add(e.desk.index);
    const desks = this.world.desks;
    const saved = this.memory[sessionId];
    if (saved && saved[0] < desks.length && !taken.has(saved[0])) return desks[saved[0]];
    // Prefer desks nobody else has a recent claim on, so people who come back keep their spot.
    const claimed = new Set<number>();
    const now = Date.now();
    for (const [id, [idx, seenAt]] of Object.entries(this.memory)) {
      if (id !== sessionId && now - seenAt < 3 * 24 * 3600 * 1000) claimed.add(idx);
    }
    const free = desks.filter((d) => !taken.has(d.index));
    const pick = free.find((d) => !claimed.has(d.index)) ?? free[0];
    if (pick) return pick;
    this.world.ensureDesks(desks.length + 1);
    return this.world.desks[this.world.desks.length - 1];
  }

  /** Persist desk claims: right away when one changes, otherwise once a minute (last-seen times). */
  private saveMemory(): void {
    const now = Date.now();
    if (!this.memoryDirty && now - this.memorySavedAt < 60_000) return;
    this.memoryDirty = false;
    this.memorySavedAt = now;
    const entries = Object.entries(this.memory)
      .filter(([, [, seen]]) => now - seen < DESK_TTL)
      .sort((a, b) => b[1][1] - a[1][1])
      .slice(0, 300);
    this.memory = Object.fromEntries(entries);
    try {
      localStorage.setItem(DESK_KEY, JSON.stringify(this.memory));
    } catch {
      // Private mode or storage full: desks just won't be remembered.
    }
  }

  private syncCrew(e: EmployeeChar, initial: boolean): void {
    const id = e.data.sessionId;
    let crew = this.crews.get(id);
    const active = e.data.interns.filter((i) => i.active);
    if (!crew) {
      if (!active.length) return;
      crew = { interns: new Map(), overflow: 0 };
      this.crews.set(id, crew);
    }
    const shown = active.slice(0, MAX_INTERNS_SHOWN);
    crew.overflow = Math.max(0, active.length - shown.length);
    const keep = new Set(shown.map((i) => i.id));
    for (const [iid, i] of crew.interns) if (!keep.has(iid)) i.leave();
    const spots = this.internSpots(e.desk);
    let k = 0;
    for (const data of shown) {
      const spot = spots[k++ % spots.length];
      let i = crew.interns.get(data.id);
      if (!i || i.phase === 'leaving') {
        // A leaving one keeps walking out on its own; a fresh one comes in.
        if (i) this.leftovers.push(i);
        i = new InternChar(data, spot, this.world, this.scene, initial);
        crew.interns.set(data.id, i);
      } else {
        i.data = data;
        i.moveTo(spot);
      }
    }
  }

  /** Up to four places to stand: the desk's own spots, plus a nudge if it has fewer. */
  private internSpots(desk: DeskSlot): THREE.Vector3[] {
    const spots = desk.internSpots.map((p) => p.clone());
    if (!spots.length) spots.push(desk.approach.clone());
    const base = spots.length;
    for (let i = base; i < MAX_INTERNS_SHOWN; i++) {
      const src = spots[i % base];
      const away = src.clone().sub(desk.seat).setY(0).normalize().multiplyScalar(0.55);
      spots.push(src.clone().add(away));
    }
    return spots;
  }

  /** Keep every desk's monitor and nameplate in step with whoever is (or isn't) there. */
  private syncDesks(): void {
    this.desksDirty = false;
    const at = new Map<number, EmployeeChar>();
    for (const e of this.employees.values()) {
      if (e.phase === 'leaving' || e.phase === 'gone') continue;
      at.set(e.desk.index, e);
    }
    for (const desk of this.world.desks) {
      const e = at.get(desk.index);
      let key: string;
      if (!e) key = 'vacant';
      else {
        const screen = screenFor(e);
        const lines = e.data.screen ?? [];
        key = `${e.data.displayName}|${e.data.project}|${screen}|${lines.join('\n')}`;
      }
      if (this.deskKeys.get(desk.index) === key) continue;
      this.deskKeys.set(desk.index, key);
      if (!e) {
        desk.setNameplate('');
        desk.setScreen('off');
      } else {
        desk.setNameplate(e.data.displayName, e.data.project);
        const lines = e.data.screen?.length ? e.data.screen : undefined;
        desk.setScreen(screenFor(e), lines);
      }
    }
    const stats = this.stats();
    const sk = JSON.stringify(stats);
    if (sk !== this.lastStats) {
      this.lastStats = sk;
      this.world.setStats(stats);
    }
  }
}
