// The yard crew (#48): people on their break out in the garden. About 10 when the office is
// lively, 5 when it's some, none when it's off; after 9 pm two or three night owls under the
// string lights. They come in by the gate and leave by it, and in between they lounge (a bench,
// a lounger, the hammock, the picnic table and blanket, the pond's edge), stroll the trail (now
// and then side by side, chatting), and stand about with a stretch, a coffee, a call or a book.
// Neighbours on a bench or a blanket chat. Nobody here holds a desk, so nobody's ever in a
// session's way. The spots come from world.yard (world/yard.ts); regulars on a coffee break
// sometimes take it outside to one of the stands (chars/regulars.ts asks for one).
import * as THREE from 'three';
import type { World, Yard } from '../world/types';
import type { RegularChar, RegularProfile } from './npc';
import { seatSlot, YardVisitor, type StandTask, type YardActivity, type YardSeatSpot, type YardStandSpot } from './visitor';

export interface YardfolkHooks {
  added?(r: RegularChar): void;
  removed?(r: RegularChar): void;
  bumped?(r: RegularChar): void;
}

interface Visit {
  v: YardVisitor;
  /** Crew clock (s) when their break is over and they head for the gate. */
  leaveAt: number;
  /** Told to go early because there were too many (counted out from then on). */
  trimmed?: boolean;
}

interface Chat {
  a: YardVisitor;
  b: YardVisitor;
  until: number;
  turnAt: number;
}

/** Two settled side by side get chatting at this rate (per second). */
const CHAT_START = 0.6;

/** The most people the yard ever has (frame budget: #48 allows about 1 ms for all of them). */
export const MAX_VISITORS = 10;

const QUIPS = [
  "I'm not slacking, I'm photosynthesizing.",
  'Fresh air: the best debugger.',
  'Out here my inbox can’t find me.',
  'Touching grass, as prescribed.',
  'The bees are very productive today.',
  'Best seat in the whole office.',
  'Five more minutes. Then emails.',
  'That cloud looks like a pie chart.',
  'The pond fish have stand-ups too.',
  "Don't tell my manager. Oh! Hi, boss!",
  'Is it lunch? It feels like lunch.',
  'I could get used to this.',
  'Somebody planted a lot of flowers!',
  'The hammock and I have an understanding.',
];
const NIGHT_QUIPS = ['The string lights are so cosy.', 'Stargazing counts as a break, right?', 'Night air, best air.', 'Shh, the frogs are singing.'];
const CHAT = [
  'Did you see the ducks?',
  'Best bench in town.',
  'I could nap right here.',
  'How long have we been out here?',
  'Is that a new flower bed?',
  'Lovely day for it!',
  "Don't look, but the boss is outside too.",
  'Ten more minutes?',
  'My plants at home are jealous.',
  'Coffee tastes better outside.',
];
const NIGHT_CHAT = ['So quiet out here.', 'Look, the moon!', "One more minute, then I'm off.", 'Those lights are so pretty.'];
const STAND_TASKS: readonly StandTask[] = ['stretch', 'stretch', 'sip', 'phone', 'read', 'look', 'look'];

const _m = new THREE.Matrix4();
const _frustum = new THREE.Frustum();
const _sphere = new THREE.Sphere(new THREE.Vector3(), 2.2);

export class Yardfolk {
  private visits: Visit[] = [];
  private seats: YardSeatSpot[] = [];
  private stands: YardStandSpot[] = [];
  private trail: THREE.Vector3[] = [];
  private gate: THREE.Vector3 | null = null;
  private source: Yard | null = null;
  private chats: Chat[] = [];
  /** Seats and stands that belong together (a bench, the picnic table, a chat spot), by group. */
  private groups: { by: RegularChar | null }[][] = [];
  private clock = 0;
  private arriveIn = 0;
  private started = false;
  private want = 0;
  private night = false;

  constructor(
    private world: World,
    private scene: THREE.Object3D,
    private rand: () => number,
    private hooks: YardfolkHooks,
    /** A name and department nobody in the building is using right now. */
    private profiles: () => RegularProfile | null,
    /** The view: anyone out of it isn't drawn at all (nor are their matrices worked out). */
    private camera: THREE.Camera | null = null,
  ) {}

  /** Everyone out in the yard. */
  list(): YardVisitor[] {
    return this.visits.map((s) => s.v);
  }

  names(): Set<string> {
    return new Set(this.visits.map((s) => s.v.name));
  }

  /** How many there should be (the crew works it out from Off / Some / Lively and the hour). */
  setTarget(n: number, night: boolean): void {
    this.want = Math.min(MAX_VISITORS, n);
    this.night = night;
    if (!this.started) return;
    // Too many (the setting went down, or it got late): the extras head for the gate. Only
    // those staying count: someone already on their way out isn't one too many (counting them
    // sent one more home every frame until the yard was empty).
    const staying = this.staying();
    for (let k = 0; k < staying.length - this.want; k++) {
      const s = staying[staying.length - 1 - k];
      s.trimmed = true;
      s.leaveAt = Math.min(s.leaveAt, this.clock + 0.5 + k * (0.8 + this.rand()));
    }
  }

  /** On their break and staying a while yet (not on their way out, nor told to go). */
  private staying(): Visit[] {
    return this.visits.filter((s) => s.v.holdsDesk && !s.trimmed && s.leaveAt > this.clock);
  }

  /** E near a visitor: a yard line. */
  line(): string {
    const pool = this.night && this.rand() < 0.6 ? NIGHT_QUIPS : QUIPS;
    return pool[Math.floor(this.rand() * pool.length)];
  }

  /** A free stand for a regular taking their coffee outside, or null. */
  borrowStand(): YardStandSpot | null {
    this.load();
    const free = this.stands.filter((s) => !s.by && (!this.night || s.lit));
    return free.length ? free[Math.floor(this.rand() * free.length)] : null;
  }

  update(dt: number, t: number, manager: THREE.Vector3, managerHead: THREE.Vector3): void {
    this.clock += dt;
    if (!this.load()) return;
    if (!this.started) this.start();
    const cam = this.camera;
    if (cam) _frustum.setFromProjectionMatrix(_m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    for (let i = this.visits.length - 1; i >= 0; i--) {
      const s = this.visits[i];
      const v = s.v;
      v.night = this.night;
      v.update(dt, t, manager, managerHead);
      v.fixLabel();
      // Out of view (with room for their shadow): out of the scene altogether until they're
      // back in it. Hidden, three.js would still work out all ~90 of their matrices each frame:
      // ten people in the yard would cost the office view half a millisecond for nothing.
      if (cam) {
        _sphere.center.set(v.position.x, 0.7, v.position.z);
        const show = v.shown > 0.001 && _frustum.intersectsSphere(_sphere);
        const root = v.rig.root;
        if (show && !root.parent) this.scene.add(root);
        else if (!show && root.parent) root.removeFromParent();
      }
      if (v.phase === 'gone') {
        this.visits.splice(i, 1);
        for (const sp of [...this.seats, ...this.stands]) if (sp.by === v) sp.by = null;
        this.hooks.removed?.(v);
        v.dispose();
        continue;
      }
      // (holdsDesk: still on their break, not on their way out.) Break over: home, whatever they're doing.
      if (!v.holdsDesk) continue;
      if (this.clock >= s.leaveAt) v.goHomeByGate();
      else if (v.done) this.next(s);
    }
    // Stands borrowed by regulars on a coffee break come back when they go back in.
    for (const st of this.stands) if (st.by && !(st.by instanceof YardVisitor) && !st.by.usingSpot(st)) st.by = null;
    this.tendChats(dt);
    this.arrivals(dt);
  }

  dispose(): void {
    for (const s of this.visits) {
      this.hooks.removed?.(s.v);
      s.v.dispose();
    }
    this.visits = [];
  }

  // -------------------------------------------------------------------------------------

  /** Read world.yard once it's there (worlds without a garden have none). */
  private load(): boolean {
    const yard = this.world.yard as Yard | undefined;
    if (!yard || yard === this.source) return !!this.source;
    this.source = yard;
    this.trail = yard.trail;
    const seats = yard.seats.map((seat, i) => {
      const { slot, chair } = seatSlot(-100 - i, seat.position, seat.yaw, seat.approach);
      const spot: YardSeatSpot = { kind: seat.kind, pose: seat.pose, group: seat.group, lit: seat.lit, slot, chair, by: null };
      if (seat.carrier) {
        seat.carrier.updateWorldMatrix(true, false);
        spot.carrier = { bed: seat.carrier, local: seat.carrier.worldToLocal(seat.position.clone()) };
      }
      return spot;
    });
    // No groups given: seats of a kind within a couple of metres of each other belong together.
    let g = 0;
    for (const s of seats) {
      if (s.group) continue;
      s.group = `${s.kind}-${g++}`;
      for (const o of seats) if (!o.group && o.kind === s.kind && o.slot.seat.distanceTo(s.slot.seat) < 2.4) o.group = s.group;
    }
    // No lights given: the string lights hang over the picnic table and the blanket (#48).
    for (const s of seats) s.lit ??= s.kind === 'picnic' || s.kind === 'blanket';
    this.seats = seats;
    this.stands = yard.stands.map((st) => ({ at: st.position, yaw: st.yaw, group: st.group, lit: st.lit ?? false, by: null }));
    const groups = new Map<string, { by: RegularChar | null }[]>();
    for (const sp of [...this.seats, ...this.stands]) if (sp.group) groups.set(sp.group, [...(groups.get(sp.group) ?? []), sp]);
    this.groups = [...groups.values()].filter((g) => g.length > 1);
    this.gate = yard.gate;
    return true;
  }

  private start(): void {
    this.started = true;
    // About 70% are already out there when you arrive, the rest trickle in through the gate.
    const now = Math.round(this.want * 0.7);
    for (let i = 0; i < now; i++) if (!this.spawn(true)) break;
    this.arriveIn = 4 + this.rand() * 8;
  }

  private arrivals(dt: number): void {
    this.arriveIn -= dt;
    if (this.arriveIn > 0) return;
    this.arriveIn = 12 + this.rand() * 25;
    if (this.staying().length < this.want) this.spawn(false);
  }

  /** Someone new: already out here (page load), or walking in by the gate. */
  private spawn(present: boolean): boolean {
    const gate = this.gate;
    const profile = this.profiles();
    if (!gate || !profile) return false;
    const a = this.pick(present ? null : gate);
    if (!a) return false;
    const first = a.kind === 'seat' ? { slot: a.seat.slot, chair: a.seat.chair } : seatSlot(-1, a.kind === 'stand' ? a.stand.at : a.trail[a.from], 0, a.kind === 'stand' ? a.stand.at : a.trail[a.from]);
    // Already out here standing or strolling: built "seated" (no fade) and stood straight up.
    const v = new YardVisitor(profile, first, this.world, this.scene, present, rand32(this.rand), gate);
    v.hooks.onBump = () => this.hooks.bumped?.(v);
    if (present) v.startAt(a);
    else {
      v.arriveByGate(a);
      // Some bring a coffee out with them.
      v.mugInHand = this.rand() < 0.4;
    }
    const stay = 180 + this.rand() * 300;
    this.visits.push({ v, leaveAt: this.clock + (present ? stay * (0.15 + 0.85 * this.rand()) : stay) });
    this.hooks.added?.(v);
    return true;
  }

  /** What they do next (or home, once their break is over). */
  private next(s: Visit): void {
    const v = s.v;
    if (this.staying().length > this.want) {
      v.goHomeByGate();
      return;
    }
    const a = this.pick(v.position, v);
    if (a) {
      v.go(a);
      // Off for a stroll: someone else at a loose end close by comes along.
      // (Not when they're still getting out of a seat: by the time they're up, the pair is off.)
      if (a.kind === 'stroll' && !this.night && !v.atDesk) this.strollBuddy(v, a);
    }
  }

  /** Something to do from `from` (a seat, a stand or a stroll), or null if the yard's full up. */
  private pick(from: THREE.Vector3 | null, v?: YardVisitor): YardActivity | null {
    const lit = (o: { lit?: boolean }) => !this.night || !!o.lit;
    const seats = this.seats.filter((s) => !s.by && lit(s));
    const stands = this.stands.filter((s) => !s.by && lit(s));
    const r = this.rand();
    // Night owls sit under the lights; days are a mix of lounging, strolling and standing about.
    const wantSeat = this.night ? r < 0.85 : r < 0.45;
    const wantStroll = !this.night && !wantSeat && r < 0.75 && this.trail.length > 4;
    if (wantSeat && seats.length) {
      // Next to someone already sitting there is a chat waiting to happen.
      const social = seats.filter((s) => this.seats.some((o) => o !== s && o.group === s.group && o.by?.settled && !o.by.buddy));
      const pool = social.length && this.rand() < 0.6 ? social : seats;
      return { kind: 'seat', seat: pool[Math.floor(this.rand() * pool.length)], seconds: 30 + this.rand() * 70 };
    }
    if (wantStroll || (!stands.length && !this.night && this.trail.length > 4)) {
      // Already out here at page load: anywhere along it.
      const from0 = from ? this.nearestTrail(from) : Math.floor(this.rand() * this.trail.length);
      return { kind: 'stroll', trail: this.trail, from: from0, dir: this.rand() < 0.5 ? 1 : -1, points: 10 + Math.floor(this.rand() * 20) };
    }
    if (stands.length) {
      // Next to someone already standing there (a chat spot) is a chat waiting to happen.
      const social = stands.filter((st) => st.group && this.stands.some((o) => o !== st && o.group === st.group && o.by instanceof YardVisitor && o.by.settled && !o.by.buddy));
      const pool = social.length && this.rand() < 0.6 ? social : stands;
      const stand = pool[Math.floor(this.rand() * pool.length)];
      // A yoga mat is for stretching.
      const task = this.night ? (this.rand() < 0.5 ? 'sip' : 'look') : stand.group === 'yoga' ? 'stretch' : STAND_TASKS[Math.floor(this.rand() * STAND_TASKS.length)];
      return { kind: 'stand', stand, task, seconds: 15 + this.rand() * 25 };
    }
    if (seats.length && v) return { kind: 'seat', seat: seats[Math.floor(this.rand() * seats.length)], seconds: 30 + this.rand() * 60 };
    return null;
  }

  private nearestTrail(p: THREE.Vector3): number {
    let best = 0;
    let bd = Infinity;
    this.trail.forEach((q, i) => {
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  /** Two strolling together: whoever's at a loose end within a few metres joins the walk. */
  private strollBuddy(v: YardVisitor, a: Extract<YardActivity, { kind: 'stroll' }>): void {
    if (this.rand() > 0.45) return;
    const mate = this.visits.find((s) => s.v !== v && s.v.done && !s.v.buddy && s.v.phase === 'away' && s.v.position.distanceTo(v.position) < 6 && this.clock < s.leaveAt);
    if (!mate) return;
    mate.v.go({ ...a });
    v.buddy = mate.v;
    mate.v.buddy = v;
    this.chats.push({ a: v, b: mate.v, until: this.clock + 30 + this.rand() * 20, turnAt: this.clock + 1.5 });
  }

  /** Neighbours on a bench, at the table, on the blanket or at a chat spot get chatting, a pair at a time. */
  private tendChats(dt: number): void {
    // Two settled in the same group (and neither chatting already): before long, a chat (the
    // same chance a second at any frame rate).
    for (const g of this.groups) {
      let a: YardVisitor | null = null;
      let b: YardVisitor | null = null;
      for (const sp of g) {
        const v = sp.by;
        if (!(v instanceof YardVisitor) || !v.settled || v.buddy) continue;
        if (!a) a = v;
        else if (!b && v !== a) b = v;
      }
      if (!a || !b || this.rand() >= CHAT_START * dt) continue;
      a.buddy = b;
      b.buddy = a;
      this.chats.push({ a, b, until: this.clock + 12 + this.rand() * 16, turnAt: this.clock + 0.5 });
    }
    for (let i = this.chats.length - 1; i >= 0; i--) {
      const c = this.chats[i];
      const together = c.a.buddy === c.b && c.b.buddy === c.a && c.a.phase !== 'gone' && c.b.phase !== 'gone';
      if (!together || this.clock >= c.until) {
        if (c.a.buddy === c.b) c.a.buddy = null;
        if (c.b.buddy === c.a) c.b.buddy = null;
        c.a.talking = c.b.talking = false;
        this.chats.splice(i, 1);
        continue;
      }
      if (this.clock < c.turnAt) continue;
      // Take turns: one line each, a laugh now and then.
      const speaker = c.a.talking ? c.b : c.a;
      const listener = speaker === c.a ? c.b : c.a;
      speaker.talking = true;
      listener.talking = false;
      const pool = this.night ? NIGHT_CHAT : CHAT;
      if (speaker.settled || speaker.strolling) speaker.say(pool[Math.floor(this.rand() * pool.length)], 2.6);
      if (this.rand() < 0.3) listener.laugh();
      c.turnAt = this.clock + 2.6 + this.rand() * 2;
    }
  }
}

/** A fresh seeded stream for one visitor. */
function rand32(rand: () => number): () => number {
  let a = Math.floor(rand() * 2 ** 32) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
