// Runs the floor: turns roster updates into people walking in, sitting down, getting up
// and going home. Owns desk assignment (stable per session, remembered in localStorage),
// chairs, the intern bench (stable stations per intern), desk monitors/nameplates,
// whiteboard stats and the front door.
import * as THREE from 'three';
import type { Employee, EmployeeState } from '../../../shared/protocol';
import type { DeskSlot, InternSlot, OfficeStats, ScreenState, World } from '../world/types';
import { Chair, EmployeeChar, distXZ } from './employee';
import { InternChar } from './intern';
import type { Bumpable } from './manager';

/** Uniformly random element, or undefined for an empty list. */
const pickRandom = <T>(xs: readonly T[]): T | undefined => (xs.length ? xs[Math.floor(Math.random() * xs.length)] : undefined);

export interface DirectorHooks {
  added?(e: EmployeeChar, initial: boolean): void;
  leaving?(e: EmployeeChar): void;
  removed?(e: EmployeeChar): void;
  stateChanged?(e: EmployeeChar, prev: EmployeeState): void;
  bumped?(e: EmployeeChar): void;
  internAdded?(i: InternChar): void;
  internRemoved?(i: InternChar): void;
}

/**
 * Regulars (NPC coworkers, chars/regulars.ts) borrow desks no session is using and give them
 * back the moment a session needs one. They are never in `employees`.
 */
export interface DeskSharers {
  /** Desks they hold right now (at it, on a break, or walking to it). */
  holding(): ReadonlySet<number>;
  /** A session is taking this desk: whoever holds it gives it up ("All yours!"). */
  makeRoom(deskIndex: number): void;
  /** Put up the nameplate and screen of a desk one of them holds; false if none does. */
  paintDesk(desk: DeskSlot): boolean;
  /** One of them is within `r` of `p` (keeps the door open). */
  near(p: THREE.Vector3, r: number): boolean;
}

const NO_DESKS: ReadonlySet<number> = new Set();

const DESK_KEY = 'claude-office:desks';
const SLOT_KEY = 'claude-office:intern-slots';
const MEMORY_TTL = 14 * 24 * 3600 * 1000;

/** id → [index, last seen ms] */
type Memory = Record<string, [number, number]>;

function loadMemory(key: string): Memory {
  try {
    const raw = localStorage.getItem(key);
    const m = raw ? (JSON.parse(raw) as Memory) : {};
    return m && typeof m === 'object' ? m : {};
  } catch {
    return {};
  }
}

/** Remembers which desk/station each id had, so people come back to the same spot. */
class SpotMemory {
  private data: Memory;
  private dirty = false;
  private savedAt = 0;

  constructor(private key: string) {
    this.data = loadMemory(key);
  }

  get(id: string): number | undefined {
    return this.data[id]?.[0];
  }

  /** Indices claimed by other ids seen recently (so returners find their spot free). */
  claimedByOthers(id: string, withinMs: number): Set<number> {
    const now = Date.now();
    const out = new Set<number>();
    for (const [k, [idx, seen]] of Object.entries(this.data)) if (k !== id && now - seen < withinMs) out.add(idx);
    return out;
  }

  set(id: string, index: number): void {
    if (this.data[id]?.[0] !== index) this.dirty = true;
    this.data[id] = [index, Date.now()];
  }

  /** Right away when a claim changes, otherwise once a minute (last-seen times). */
  save(): void {
    const now = Date.now();
    if (!this.dirty && now - this.savedAt < 60_000) return;
    this.dirty = false;
    this.savedAt = now;
    const entries = Object.entries(this.data)
      .filter(([, [, seen]]) => now - seen < MEMORY_TTL)
      .sort((a, b) => b[1][1] - a[1][1])
      .slice(0, 400);
    this.data = Object.fromEntries(entries);
    try {
      localStorage.setItem(this.key, JSON.stringify(this.data));
    } catch {
      // Private mode or storage full: spots just won't be remembered.
    }
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

export class Director {
  readonly employees = new Map<string, EmployeeChar>();
  /** NPC coworkers sharing the desks and the door (set by main.ts). */
  regulars: DeskSharers | null = null;
  private chairs = new Map<number, Chair>();
  /** Each boss's interns, by intern id. */
  private crews = new Map<string, Map<string, InternChar>>();
  /** Interns on their way out after their boss (or their entry) went away. */
  private leftovers: InternChar[] = [];
  private desks = new SpotMemory(DESK_KEY);
  private stations = new SpotMemory(SLOT_KEY);
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

  /** The first roster has arrived (regulars wait for it before sitting anywhere). */
  get hasRoster(): boolean {
    return this.hadRoster;
  }

  /** Desks sessions came back to in the last few days (regulars leave these for them if they can). */
  rememberedDesks(): Set<number> {
    return this.desks.claimedByOthers('', 3 * 24 * 3600 * 1000);
  }

  /** Repaint desk nameplates and monitors on the next update (a regular sat, stood or switched apps). */
  refreshDesks(): void {
    this.desksDirty = true;
  }

  byDesk(index: number): EmployeeChar | undefined {
    for (const e of this.employees.values()) if (e.desk.index === index && e.atDesk) return e;
    return undefined;
  }

  list(): EmployeeChar[] {
    return [...this.employees.values()];
  }

  interns(): InternChar[] {
    const out: InternChar[] = [...this.leftovers];
    for (const crew of this.crews.values()) out.push(...crew.values());
    return out;
  }

  /** Everyone the manager can bump into. */
  bumpables(): Bumpable[] {
    const out: Bumpable[] = [];
    for (const e of this.employees.values()) if (e.phase !== 'gone') out.push(e);
    for (const i of this.interns()) if (i.phase !== 'gone') out.push(i);
    return out;
  }

  sync(roster: Employee[]): void {
    const initial = !this.hadRoster;
    this.hadRoster = true;
    // A hidden tab draws no frames, so nobody would finish getting up or walk anywhere, and
    // leavers would keep their desks (arrivals would grow the office for good). So there,
    // leavers are simply gone and arrivals are at their desks, as a page load finds them.
    const hidden = document.hidden;
    const seen = new Set(roster.map((d) => d.sessionId));
    // Leavers first, so this update's arrivals can have their desks.
    for (const e of this.employees.values()) {
      if (seen.has(e.data.sessionId)) continue;
      const going = e.phase === 'leaving' || e.phase === 'gone' || e.phase === 'standing-up';
      if (hidden) {
        if (!going) this.hooks.leaving?.(e);
        this.remove(e);
      } else if (!going) {
        e.leave();
        this.hooks.leaving?.(e);
        for (const i of this.crews.get(e.data.sessionId)?.values() ?? []) i.leave();
      }
    }
    for (const data of roster) {
      let e = this.employees.get(data.sessionId);
      if (!e) {
        const { desk, displaced } = this.assignDesk(data.sessionId);
        // A regular is still getting out of that chair: walk in rather than appear in it.
        e = new EmployeeChar(data, desk, this.chairFor(desk), this.world, this.scene, (initial || hidden) && !displaced);
        e.hooks.onBump = (x) => this.hooks.bumped?.(x);
        this.employees.set(data.sessionId, e);
        this.hooks.added?.(e, initial);
      } else {
        if (e.phase === 'leaving') this.reclaimDesk(e);
        if (e.phase === 'leaving' || e.phase === 'standing-up') e.comeBack();
        const prev = e.data.state;
        e.setData(data);
        if (prev !== data.state) this.hooks.stateChanged?.(e, prev);
      }
      this.desks.set(data.sessionId, e.desk.index);
      this.syncCrew(e, initial || hidden);
    }
    this.desks.save();
    this.stations.save();
    this.desksDirty = true;
    this.syncDesks();
  }

  update(dt: number, t: number, manager: THREE.Vector3, managerHead: THREE.Vector3): void {
    const head = new THREE.Vector3();
    const focus = new THREE.Vector3();
    let doorBusy = distXZ(manager, this.door) < 2.5 || !!this.regulars?.near(this.door, 2.5);
    for (const [id, e] of this.employees) {
      const before = e.phase;
      e.update(dt, t, manager, managerHead);
      if (e.phase !== before) this.desksDirty = true;
      if (e.phase === 'gone') {
        this.remove(e);
        continue;
      }
      if (!doorBusy && distXZ(e.position, this.door) < 2.5) doorBusy = true;
      const crew = this.crews.get(id);
      if (!crew) continue;
      e.headWorld(head);
      let n = 0;
      focus.set(0, 0, 0);
      for (const [iid, i] of crew) {
        i.update(dt, t, head, managerHead);
        if (i.phase === 'gone') {
          crew.delete(iid);
          this.retire(i);
          continue;
        }
        if (!doorBusy && distXZ(i.position, this.door) < 2.5) doorBusy = true;
        if (i.phase === 'seated') {
          focus.add(i.position);
          n++;
        }
      }
      // The boss points at where their interns are working (the bench, usually).
      e.internFocus = n ? (e.internFocus ?? new THREE.Vector3()).copy(focus.divideScalar(n)) : null;
    }
    for (let k = this.leftovers.length - 1; k >= 0; k--) {
      const i = this.leftovers[k];
      i.update(dt, t, this.door, managerHead);
      if (i.phase === 'gone') {
        this.leftovers.splice(k, 1);
        this.retire(i);
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
      if (e.state === 'needs-you') s.needsYou++;
      else if (e.state === 'working') s.working++;
      else s.idle++;
      s.interns += e.data.interns.length;
    }
    return s;
  }

  // -------------------------------------------------------------------------------------

  private retire(i: InternChar): void {
    this.hooks.internRemoved?.(i);
    i.dispose();
  }

  /** Off the floor for good. Their interns walk out after them (in a hidden tab, they go too). */
  private remove(e: EmployeeChar): void {
    const id = e.data.sessionId;
    this.employees.delete(id);
    this.hooks.removed?.(e);
    e.dispose();
    for (const i of this.crews.get(id)?.values() ?? []) {
      if (document.hidden) {
        this.retire(i);
      } else {
        i.leave();
        this.leftovers.push(i);
      }
    }
    this.crews.delete(id);
  }

  /** The desk's one Chair, whoever sits there (sessions and regulars share it). */
  chairFor(desk: DeskSlot): Chair {
    let c = this.chairs.get(desk.index);
    if (!c || c.desk !== desk) {
      c = new Chair(desk);
      this.chairs.set(desk.index, c);
    }
    return c;
  }

  /**
   * A desk for a new session: their remembered one if no other session has it, else a truly
   * free desk, else a random regular's. Whichever it is, a regular sitting there makes room
   * ("All yours!"). The office only grows once every desk has a real session at it.
   */
  private assignDesk(sessionId: string): { desk: DeskSlot; displaced: boolean } {
    const taken = new Set<number>();
    for (const e of this.employees.values()) if (e.phase !== 'gone' && e.phase !== 'leaving') taken.add(e.desk.index);
    const held = this.regulars?.holding() ?? NO_DESKS;
    const take = (desk: DeskSlot) => {
      const displaced = held.has(desk.index);
      if (displaced) this.regulars?.makeRoom(desk.index);
      return { desk, displaced };
    };
    let desks = this.world.desks;
    const saved = this.desks.get(sessionId);
    if (saved !== undefined && saved < desks.length && !taken.has(saved)) return take(desks[saved]);
    // Prefer desks nobody else has a recent claim on, so people who come back keep their spot.
    const claimed = this.desks.claimedByOthers(sessionId, 3 * 24 * 3600 * 1000);
    let free = desks.filter((d) => !taken.has(d.index) && !held.has(d.index));
    if (!free.length) {
      // Every desk without a session has a regular at it: one of them gives theirs up.
      const theirs = desks.filter((d) => !taken.has(d.index));
      const desk = pickRandom(theirs.filter((d) => !claimed.has(d.index))) ?? pickRandom(theirs);
      if (desk) return take(desk);
      this.world.ensureDesks(desks.length + 1);
      desks = this.world.desks;
      free = desks.filter((d) => !taken.has(d.index));
    }
    // New arrivals pick a random free desk (not always the first one), avoiding desks someone
    // else came back to recently. A full office doubles people up rather than failing.
    return take(pickRandom(free.filter((d) => !claimed.has(d.index))) ?? pickRandom(free) ?? desks[taken.size % desks.length]);
  }

  /**
   * A session came back while walking out, and leavers' desks count as free, so theirs may
   * have been handed out meanwhile. If another session has it, they get a fresh desk; if a
   * regular has it, the regular makes room (sessions win).
   */
  private reclaimDesk(e: EmployeeChar): void {
    const index = e.desk.index;
    const taken = this.list().some((x) => x !== e && x.desk.index === index && x.phase !== 'leaving' && x.phase !== 'gone');
    if (taken) {
      const { desk } = this.assignDesk(e.data.sessionId);
      e.desk = desk;
      e.chair = this.chairFor(desk);
    } else if (this.regulars?.holding().has(index)) {
      this.regulars.makeRoom(index);
    }
  }

  /** A free station at the intern bench (stable per intern), growing the bench if it's full. */
  private claimStation(internId: string): InternSlot | null {
    let slots = this.world.internSlots ?? [];
    const used = new Set<number>();
    for (const i of this.interns()) if (i.slot && i.phase !== 'leaving' && i.phase !== 'gone') used.add(i.slot.index);
    const saved = this.stations.get(internId);
    if (saved !== undefined && saved < slots.length && !used.has(saved)) return slots[saved];
    let free = slots.filter((s) => !used.has(s.index));
    if (!free.length && this.world.ensureInternSlots) {
      this.world.ensureInternSlots(slots.length + 4);
      slots = this.world.internSlots ?? [];
      free = slots.filter((s) => !used.has(s.index));
    }
    const claimed = this.stations.claimedByOthers(internId, 24 * 3600 * 1000);
    const pick = pickRandom(free.filter((s) => !claimed.has(s.index))) ?? pickRandom(free) ?? null;
    if (pick) this.stations.set(internId, pick.index);
    return pick;
  }

  /** `present`: new interns are already at their stations (a page load, or a hidden tab). */
  private syncCrew(e: EmployeeChar, present: boolean): void {
    const id = e.data.sessionId;
    const listed = e.data.interns;
    // In a hidden tab (see sync) an intern who's done goes at once instead of walking out.
    const hidden = document.hidden;
    let crew = this.crews.get(id);
    if (!crew) {
      if (!listed.length) return;
      crew = new Map();
      this.crews.set(id, crew);
    }
    const keep = new Set(listed.map((i) => i.id));
    for (const [iid, i] of crew) {
      if (keep.has(i.data.id)) continue;
      if (hidden) {
        crew.delete(iid);
        this.retire(i);
      } else {
        i.leave();
      }
    }
    const boss = { name: e.data.displayName, shirt: e.rig.looks.shirt };
    listed.forEach((data, k) => {
      let i = crew.get(data.id);
      if (i && (i.phase === 'leaving' || i.phase === 'standing')) {
        // Came back while heading out: that one keeps walking (hidden: just goes), a fresh one sits down.
        crew.delete(data.id);
        if (hidden) this.retire(i);
        else this.leftovers.push(i);
        i = undefined;
      }
      if (!i) {
        const slot = this.claimStation(data.id);
        const spots = e.desk.internSpots;
        const spot = spots.length ? spots[k % spots.length] : e.desk.approach;
        i = new InternChar(data, boss, slot, spot.clone(), this.world, this.scene, present);
        crew.set(data.id, i);
        this.hooks.internAdded?.(i);
      } else {
        i.setData(data);
      }
    });
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
      // A regular's desk: their name and department, ordinary office work on the screen.
      if (!e && this.regulars?.paintDesk(desk)) {
        this.deskKeys.set(desk.index, 'regular');
        continue;
      }
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
