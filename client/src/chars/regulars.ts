// Regulars: NPC coworkers who keep the office from ever feeling empty (docs/GAMEPLAY.md
// "Regulars"). They are not Claude sessions: never in the director's roster, the stats, the
// HUD, toasts, Q/go-to, the Team Room board or any server request. This crew decides how many
// there are (Off / Some / Lively), who walks in and when, shifts, coffee breaks and who chats
// with whom, and hands a desk back when a session needs it ("All yours!"). The people
// themselves are RegularChar (chars/npc.ts). It also runs Mabel on the front desk
// (chars/receptionist.ts), who has her own switch and is never part of the crowd.
import * as THREE from 'three';
import { hash32 } from '../style/palette';
import type { DeskSlot, OfficeApp, World } from '../world/types';
import type { DeskSharers, Director } from './director';
import { Chair } from './employee';
import { RegularChar, type BreakSpot, type RegularProfile } from './npc';
import { ReceptionistChar } from './receptionist';
import { onReceptionist, onRegularsDensity, readReceptionist, readRegularsDensity, type RegularsDensity } from './regulars-setting';

/** Never more than this many (frame budget). */
export const MAX_REGULARS = 14;
/** At most this many on a break at once: the break area is small. */
const MAX_AWAY = 4;

// ---------------------------------------------------------------------------------------
// Who they are and what they say

const NAMES = [
  'Priya', 'Marcus', 'Ingrid', 'Tomás', 'Aisha', 'Kenji', 'Olu', 'Frida', 'Mateo', 'Noor',
  'Dmitri', 'Sunny', 'Bea', 'Hugo', 'Leila', 'Rafael', 'Mei', 'Jonas', 'Amara', 'Theo',
  'Zara', 'Felix', 'Yuki', 'Omar', 'Greta', 'Ravi', 'Lucia', 'Sven', 'Nadia', 'Kofi',
  'Elif', 'Bruno', 'Ines', 'Wren', 'Tariq', 'Juno', 'Otto', 'Pia', 'Dex', 'Rosa',
];

/** Departments and the apps on their screens. */
const DEPTS: readonly (readonly [string, readonly OfficeApp[]])[] = [
  ['Sales', ['sheet', 'mail', 'calendar']],
  ['Design', ['slides', 'doc', 'mail']],
  ['Finance', ['sheet', 'chart', 'sheet']],
  ['Marketing', ['slides', 'chart', 'mail']],
  ['People Ops', ['mail', 'calendar', 'doc']],
  ['Legal', ['doc', 'doc', 'mail']],
  ['Support', ['mail', 'mail', 'doc']],
  ['Research', ['chart', 'doc', 'sheet']],
  ['Facilities', ['calendar', 'sheet', 'mail']],
  ['Accounts', ['sheet', 'sheet', 'mail']],
];

/** E near a regular. Office and dev humour, warm, never mean. */
const QUIPS = [
  'Have you tried turning it off and on again?',
  "Inbox zero! Don't tell anyone.",
  'The printer and I are on a break.',
  'I alphabetised the snack drawer.',
  'Quick sync? Kidding. Never.',
  'Your agents type faster than me. Rude.',
  'I heard the coffee machine got promoted.',
  'Per my last email… just kidding, hi!',
  'This meeting could have been an email.',
  'I named my plant Kubernetes.',
  'Spreadsheets are just cosy little grids.',
  'Ctrl+S. Ctrl+S. You can never be too careful.',
  'Is it Friday? It feels like a Friday.',
  "I'm on mute in three meetings right now.",
  'Someone microwaved fish again.',
  'Nice tie, boss!',
  'I sit here because the chair is lucky.',
  'The Wi-Fi works best on one leg.',
  "Let's take this offline. Like, outside.",
  'I put a sticky note on my sticky note.',
  'Love the buzz in here today!',
  "Don't mind me, just looking busy.",
  'Sales are up! Probably. I should check.',
  "I've been in this meeting since Tuesday.",
  'Reply-all is a dangerous button.',
  'Team motto: it works on my machine.',
  'I brought donuts. They lasted four minutes.',
  'Keyboard shortcuts are my love language.',
  'Who are the new folks with the orange lanyards?',
  'Hydration check! Drink some water, boss.',
  "I'm about forty percent coffee right now.",
  'Slides done. Only took 47 versions.',
  'The fridge has a strongly worded note again.',
  'Quick five-minute task. Started at nine.',
  "You're doing great, boss. Really.",
  'Fixed the printer jam! Mostly.',
  'Lunch is the most important meeting.',
  'My cat sent an email to the whole team.',
  'Best office in town, honestly.',
  'Final_v2_FINAL_really.docx is the one.',
];

/** Mixed in after 9 pm. */
const NIGHT_QUIPS = [
  'Is it dark out already?',
  'One more email, then home. Probably.',
  'Night shift crew, assemble!',
  'The office is so peaceful at night.',
  'Coffee number six. Or seven?',
  'Who needs sleep when you have spreadsheets?',
  "Don't tell my cat I'm still here.",
  'Burning the midnight oil, boss?',
];

const HELLO = ['Morning!', 'Morning, boss!', 'Hello hello!', 'Hey hey!'];
const HELLO_LATER = ['Hi!', 'Afternoon!', 'Hey, boss!'];
const HELLO_NIGHT = ['Evening!', 'Night shift, reporting in!'];
const BYE = ['Night all!', 'See you tomorrow!', "That's me done!", 'Bye, boss!', 'Off I pop!'];
const BYE_NIGHT = ['Finally, bed!', 'Night, night owls!', 'See you in the morning!'];
const AWAY_YIELD = "Oh! Guess I'm working from home!";
/** Passing the newcomer on the way out. */
const HANDOVER = ['Enjoy the desk!', "It's a lucky chair!", 'Have fun!', 'Go get them!'];
/** At the water cooler, when you're close enough to hear. */
const CHAT = [
  'Did you see the game?',
  'Who keeps taking my yoghurt?',
  'Friday cannot come soon enough.',
  'The new coffee beans are wild.',
  'Have you tried the oat milk?',
  'Is it cold in here or is it me?',
  'Pizza on Thursday, apparently!',
  'My plant finally flowered!',
  'Weekend plans?',
  'No way. Really?',
  'Ha! Classic.',
  'I know, right?',
];
/** Half a phone call. */
const PHONE = ['Mm-hm… yep…', "Sorry, you're on mute!", "Let's circle back on that.", 'No, the OTHER spreadsheet.', 'Can you hear me now?', 'Totally, totally.'];

// The front desk (Mabel).
/** E near her. */
const DESK_QUIPS = [
  'Welcome back, boss!',
  "Your 3 o'clock is here… just kidding, it's another Claude.",
  'Shall I hold your calls?',
  'Front desk, how can I help?',
  "Mail's on your desk. Mostly pizza menus.",
  'Another Claude just walked in. They grow up so fast.',
  "Nobody's waiting. Unless you count the Claudes.",
  "I've memorised everyone's coffee order.",
  'The phones have been ringing off the hook!',
  'I told the printer you were busy.',
  "Sign the visitor book! Kidding, we don't have one.",
  'Want me to book the Team Room?',
  "Smile! You're on the guest list.",
  "The plant's been watered. Twice, actually.",
  "If anyone asks, you're in a meeting.",
  "Big day? I'll keep the coffee coming.",
];
/** Waving people in and out of the front door. */
const DESK_HELLO = ['Welcome!', 'Morning!', 'Hi there!', 'Welcome in!', 'Hello!'];
const DESK_HELLO_NIGHT = ['Evening!', 'Welcome!', 'Hi there!', 'Working late?'];
const DESK_BYE = ['Bye!', 'See you!', 'Take care!', 'Bye bye!'];
/** The boss walks up to the desk. */
const DESK_GREET = ['Hi, boss!', 'Welcome back, boss!', 'Need anything, boss?', 'Hello, boss!'];
/** Hiring at the front desk. */
const DESK_HIRE = ['Ooh, who are we hiring?', "I'll get a desk ready!", 'Another one? Love it.', 'Fresh hire, coming up!'];
/** Half a headset call. */
const DESK_CALLS = ['Claude Office, how can I help?', 'Please hold!', 'One moment, putting you through.', 'Can I take a message?', "They're in a meeting. With themselves."];
const DESK_OFF = ['Off home early! Bye!', 'Phones are all yours, boss!'];

// ---------------------------------------------------------------------------------------

interface Member {
  r: RegularChar;
  /** Crew clock (s) when they head home. */
  shiftEnds: number;
  nextBreak: number;
  /** Said hello to the boss on the way in. */
  greeted: boolean;
  /** The phone call (task serial) they've already said a line on. */
  phoned: number;
  /** Waved at whoever took their desk, passing them on the way out. */
  handedOver: boolean;
}

interface Spot extends BreakSpot {
  by: RegularChar | null;
  /** The chat partner's spot: hang spots come in facing pairs. */
  mate: Spot | null;
}

interface Chat {
  a: RegularChar;
  b: RegularChar;
  until: number;
  turnAt: number;
}

export interface RegularsHooks {
  added?(r: RegularChar): void;
  removed?(r: RegularChar): void;
  bumped?(r: RegularChar): void;
}

export interface RegularsOptions {
  /** Default: the saved setting (`?regulars` overrides it). */
  density?: RegularsDensity;
  /** Same seed, same people at the same desks (screenshots). */
  seed?: number;
  /** Mabel on the front desk. Default: her saved switch (`?receptionist` overrides it). */
  receptionist?: boolean;
  hooks?: RegularsHooks;
}

/** `?hour=22` pretends it's that hour (night owls on demand). */
const FORCED_HOUR = (() => {
  const h = Number(new URLSearchParams(location.search).get('hour') ?? NaN);
  return Number.isInteger(h) && h >= 0 && h < 24 ? h : null;
})();
const hourNow = () => FORCED_HOUR ?? new Date().getHours();

export class Regulars implements DeskSharers {
  private members: Member[] = [];
  private rand: () => number;
  private density: RegularsDensity;
  private hooks: RegularsHooks;
  private started = false;
  private clock = 0;
  private arriveIn = 0;
  /** The switch went up: they arrive faster until the room is full. */
  private rush = false;
  private fills: Spot[];
  private hangs: Spot[];
  private chats: Chat[] = [];
  /** Crew clock when each regular last left (so nobody's back two minutes later). */
  private leftAt = new Map<string, number>();
  private deck: string[] = [];
  private night = false;
  private nightAt = -1;
  private unsubscribers: (() => void)[];
  // The front desk: Mabel, her switch, her spot, and whom she's already waved at.
  private receptionist: ReceptionistChar | null = null;
  private receptionOn: boolean;
  private receptionSpot: { slot: DeskSlot; chair: Chair } | null;
  private wavedIn = new WeakSet<object>();
  private wavedOut = new WeakSet<object>();
  private bossAway = true;
  private bossGreetedAt = -1e9;
  private deskDeck: string[] = [];
  private deskCall = -1;
  /** Break spots that failed a check (furniture moved onto them), and when. */
  private badSpots = new Map<Spot, number>();

  constructor(
    private world: World,
    private scene: THREE.Object3D,
    private director: Director,
    opts: RegularsOptions = {},
  ) {
    this.density = opts.density ?? readRegularsDensity();
    this.rand = mulberry32(opts.seed ?? Math.floor(Math.random() * 2 ** 32));
    this.hooks = opts.hooks ?? {};
    ({ fills: this.fills, hangs: this.hangs } = breakSpots(world));
    this.receptionSpot = receptionSpot(world);
    this.receptionOn = opts.receptionist ?? readReceptionist();
    // She's at her desk from the moment the page loads.
    if (this.receptionOn && this.receptionSpot) this.receptionist = this.hireReceptionist(true);
    this.unsubscribers = [onRegularsDensity((d) => this.setDensity(d)), onReceptionist((on) => (this.receptionOn = on))];
  }

  /** Everyone here right now (walking in and heading home included), the receptionist too. */
  list(): RegularChar[] {
    const out: RegularChar[] = this.members.map((m) => m.r);
    if (this.receptionist) out.push(this.receptionist);
    return out;
  }

  /** The crowd only (what Off / Some / Lively counts): never the receptionist. */
  crew(): RegularChar[] {
    return this.members.map((m) => m.r);
  }

  /** Mabel, if she's in. */
  get frontDesk(): ReceptionistChar | null {
    return this.receptionist;
  }

  /**
   * E at the front desk opens Now hiring, and Mabel has a word: mostly her front-desk lines (the
   * counter is between you, so this is how you chat with her), sometimes about the hire.
   */
  atReception(): void {
    const rc = this.receptionist;
    if (!rc?.seated) return;
    if (this.rand() < 0.3) rc.chatWith(pick(DESK_HIRE, this.rand));
    else this.chat(rc);
  }

  /** The manager can bump into any of them. */
  bumpables(): RegularChar[] {
    return this.list();
  }

  /** Off / Some / Lively (or a headcount). Extras head home over a few seconds; more trickle in. */
  setDensity(d: RegularsDensity): void {
    this.density = d;
    if (!this.started) return;
    const want = this.target();
    const here = this.members.filter((m) => m.r.holdsDesk);
    if (here.length > want) {
      shuffle(here, this.rand)
        .slice(0, here.length - want)
        .forEach((m, k) => (m.shiftEnds = Math.min(m.shiftEnds, this.clock + 0.4 + k * (0.6 + this.rand()))));
    } else if (here.length < want) {
      this.rush = true;
      this.arriveIn = Math.min(this.arriveIn, 1 + this.rand() * 2);
    }
  }

  /** E near a regular: a line from the shuffled deck. Never a panel, never the server. */
  chat(r: RegularChar): void {
    if (r === this.receptionist) {
      if (!this.deskDeck.length) this.deskDeck = shuffle([...DESK_QUIPS], this.rand);
      r.chatWith(this.deskDeck.pop()!);
      return;
    }
    if (this.isNight() && this.rand() < 0.4) {
      r.chatWith(pick(NIGHT_QUIPS, this.rand));
      return;
    }
    if (!this.deck.length) this.deck = shuffle([...QUIPS], this.rand);
    r.chatWith(this.deck.pop()!);
  }

  update(dt: number, t: number, manager: THREE.Vector3, managerHead: THREE.Vector3): void {
    this.clock += dt;
    this.frontDeskUpdate(dt, t, manager, managerHead);
    if (!this.started) {
      // Wait for the first roster, so nobody sits at a desk a session is about to come back
      // to; an office whose server is down still fills up after a few seconds.
      if (!this.director.hasRoster && this.clock < 6) return;
      this.start();
    }
    const night = this.isNight();
    let changed = false;
    for (let i = this.members.length - 1; i >= 0; i--) {
      const m = this.members[i];
      const r = m.r;
      r.night = night;
      const version = r.deskVersion;
      r.update(dt, t, manager, managerHead);
      if (r.phase === 'gone') {
        this.members.splice(i, 1);
        this.leftAt.set(r.name, this.clock);
        this.hooks.removed?.(r);
        r.dispose();
        changed = true;
        continue;
      }
      if (r.deskVersion !== version) changed = true;
      this.tend(m, manager, night);
    }
    this.tendChats(manager);
    for (const s of this.fills) if (s.by && !s.by.usingSpot(s)) s.by = null;
    for (const s of this.hangs) if (s.by && !s.by.usingSpot(s)) s.by = null;
    this.arrivals(dt);
    if (changed) this.director.refreshDesks();
  }

  dispose(): void {
    for (const off of this.unsubscribers) off();
    for (const r of this.list()) {
      this.hooks.removed?.(r);
      r.dispose();
    }
    this.members = [];
    this.receptionist = null;
  }

  // -------------------------------------------------------------------------------------
  // DeskSharers: what the director needs to share desks and the door with them

  holding(): Set<number> {
    const out = new Set<number>();
    for (const m of this.members) if (m.r.holdsDesk) out.add(m.r.desk.index);
    return out;
  }

  makeRoom(deskIndex: number): void {
    const r = this.holderOf(deskIndex);
    if (!r) return;
    r.giveUp('All yours!', AWAY_YIELD);
    // A session just took a desk; no one rushes in to replace them.
    this.arriveIn = Math.max(this.arriveIn, 15 + this.rand() * 20);
  }

  paintDesk(desk: DeskSlot): boolean {
    const r = this.holderOf(desk.index);
    if (!r) return false;
    desk.setNameplate(r.name, r.profile.dept);
    const working = r.screen === 'working';
    desk.setScreen(r.screen, working ? appLines(r.app, r.profile) : undefined, working ? r.app : undefined);
    return true;
  }

  near(p: THREE.Vector3, radius: number): boolean {
    for (const r of this.list()) if (Math.hypot(r.position.x - p.x, r.position.z - p.z) < radius) return true;
    return false;
  }

  // -------------------------------------------------------------------------------------

  // -------------------------------------------------------------------------------------
  // The front desk

  private hireReceptionist(seated: boolean): ReceptionistChar {
    const { slot, chair } = this.receptionSpot!;
    const rc = new ReceptionistChar(slot, chair, this.world, this.scene, seated, mulberry32(Math.floor(this.rand() * 2 ** 32)));
    rc.hooks.onBump = () => this.hooks.bumped?.(rc);
    // Back in with a cup of tea.
    if (!seated) rc.mugInHand = true;
    this.hooks.added?.(rc);
    return rc;
  }

  /** Mabel's day: her switch, waving at the front door, hellos for the boss, half a call. */
  private frontDeskUpdate(dt: number, t: number, manager: THREE.Vector3, managerHead: THREE.Vector3): void {
    let rc = this.receptionist;
    // Off sends her home; on brings her in (or turns her round if she's on her way out).
    if (this.receptionOn) {
      if (!rc && this.receptionSpot) rc = this.receptionist = this.hireReceptionist(false);
      else if (rc?.phase === 'leaving') rc.comeBack();
    } else if (rc?.holdsDesk) {
      rc.goHome(pick(DESK_OFF, this.rand));
    }
    if (!rc) return;
    rc.night = this.isNight();
    rc.boss = managerHead;
    rc.update(dt, t, manager, managerHead);
    if (rc.phase === 'gone') {
      this.hooks.removed?.(rc);
      rc.dispose();
      this.receptionist = null;
      return;
    }
    if (!rc.seated) return;
    this.watchDoor(rc);
    const near = Math.hypot(manager.x - rc.position.x, manager.z - rc.position.z);
    // The boss walks up: a hello (once per visit, not every time they pass).
    if (near > 7) this.bossAway = true;
    else if (near < 3.5 && this.bossAway && this.clock - this.bossGreetedAt > 25) {
      this.bossAway = false;
      this.bossGreetedAt = this.clock;
      if (!rc.quipping) rc.say(pick(DESK_GREET, this.rand), 2.4);
      if (!rc.wavingAt && this.rand() < 0.5) rc.waveAt(manager, 1.1);
    }
    if (rc.task === 'phone' && this.deskCall !== rc.taskSerial && near < 6 && rc.taskProgress > 0.2 && !rc.quipping) {
      this.deskCall = rc.taskSerial;
      rc.say(pick(DESK_CALLS, this.rand), 2.6);
    }
  }

  /** She waves at whoever walks in or out of the front door, sessions and regulars alike. */
  private watchDoor(rc: ReceptionistChar): void {
    if (rc.wavingAt) return;
    const door = this.director.doorPosition;
    const atDoor = (p: THREE.Vector3) => Math.hypot(p.x - door.x, p.z - door.z) < 3.2;
    const passing: { who: object; at: THREE.Vector3; out: boolean }[] = [];
    for (const e of this.director.list()) if ((e.phase === 'entering' || e.phase === 'leaving') && atDoor(e.position)) passing.push({ who: e, at: e.position, out: e.phase === 'leaving' });
    for (const { r } of this.members) {
      // Walking in for the day (not back from the coffee machine), or off home.
      if (((r.phase === 'entering' && !r.onBreak) || r.phase === 'leaving') && atDoor(r.position)) passing.push({ who: r, at: r.position, out: r.phase === 'leaving' });
    }
    for (const p of passing) {
      const seen = p.out ? this.wavedOut : this.wavedIn;
      if (seen.has(p.who)) continue;
      seen.add(p.who);
      rc.waveAt(p.at, 1.5);
      if (!rc.quipping && this.rand() < 0.65) rc.say(pick(p.out ? DESK_BYE : this.isNight() ? DESK_HELLO_NIGHT : DESK_HELLO, this.rand), 2);
      return;
    }
  }

  private holderOf(deskIndex: number): RegularChar | undefined {
    return this.members.find((m) => m.r.holdsDesk && m.r.desk.index === deskIndex)?.r;
  }

  private isNight(): boolean {
    if (this.clock - this.nightAt > 5 || this.nightAt < 0) {
      this.nightAt = this.clock;
      const h = hourNow();
      this.night = h >= 21 || h < 5;
    }
    return this.night;
  }

  /** Desks sessions are at (or walking to). */
  private sessionDesks(): Set<number> {
    const out = new Set<number>();
    for (const e of this.director.list()) if (e.phase !== 'leaving' && e.phase !== 'gone') out.add(e.desk.index);
    return out;
  }

  /** How many regulars this office wants. They only ever use desks no session is using. */
  private target(): number {
    const d = this.density;
    if (d === 'off' || d === 0) return 0;
    const capacity = this.world.desks.length - this.sessionDesks().size;
    const want = d === 'lively' ? capacity - 1 : d === 'some' ? Math.round(capacity / 2) : Math.min(d, capacity);
    return Math.max(0, Math.min(MAX_REGULARS, want));
  }

  private start(): void {
    this.started = true;
    // About 70% are already at work when you arrive; a headcount from the URL is all seated.
    const want = this.target();
    const seatNow = typeof this.density === 'number' ? want : Math.round(want * 0.7);
    for (let i = 0; i < seatNow; i++) if (!this.spawn(true)) break;
    this.arriveIn = 6 + this.rand() * 10;
  }

  /** A new regular: already at their desk, or walking in through the front door. */
  private spawn(seated: boolean): boolean {
    const profile = this.nextProfile();
    const desk = profile && this.freeDesk();
    if (!profile || !desk) return false;
    const apps = DEPTS.find(([d]) => d === profile.dept)?.[1] ?? ['mail'];
    const r = new RegularChar(profile, desk, this.director.chairFor(desk), this.world, this.scene, seated, mulberry32(Math.floor(this.rand() * 2 ** 32)), apps);
    r.hooks.onBump = () => this.hooks.bumped?.(r);
    // Some come in with a coffee.
    if (!seated) r.mugInHand = this.rand() < 0.55;
    const shift = 240 + this.rand() * 480;
    this.members.push({
      r,
      // Those already at work are partway through their shift, so they don't all leave at once.
      shiftEnds: this.clock + (seated ? shift * (0.12 + 0.88 * this.rand()) : shift),
      nextBreak: this.clock + 45 + this.rand() * 150,
      greeted: seated,
      phoned: -1,
      handedOver: false,
    });
    this.hooks.added?.(r);
    this.director.refreshDesks();
    return true;
  }

  private nextProfile(): RegularProfile | null {
    const here = new Set(this.members.map((m) => m.r.name));
    const rested = NAMES.filter((n) => !here.has(n) && this.clock - (this.leftAt.get(n) ?? -1e9) > 120);
    const pool = rested.length ? rested : NAMES.filter((n) => !here.has(n));
    if (!pool.length) return null;
    const name = pick(pool, this.rand);
    return { id: `regular:${name.toLowerCase()}`, name, dept: DEPTS[hash32(name) % DEPTS.length][0] };
  }

  /** A desk nobody is using, leaving the ones sessions came back to recently for them if possible. */
  private freeDesk(): DeskSlot | null {
    const taken = this.sessionDesks();
    for (const i of this.holding()) taken.add(i);
    const free = this.world.desks.filter((d) => !taken.has(d.index));
    if (!free.length) return null;
    const remembered = this.director.rememberedDesks();
    const fresh = free.filter((d) => !remembered.has(d.index));
    return pick(fresh.length ? fresh : free, this.rand);
  }

  /** Shift's end, coffee breaks, hellos and half a phone call for one regular. */
  private tend(m: Member, manager: THREE.Vector3, night: boolean): void {
    const r = m.r;
    if (!r.holdsDesk) {
      if (!m.handedOver && r.yielded && r.phase === 'leaving') this.handOver(m);
      return;
    }
    const near = Math.hypot(manager.x - r.position.x, manager.z - r.position.z);
    if (!m.greeted && r.phase === 'entering' && !r.onBreak && near < 5) {
      m.greeted = true;
      r.say(pick(night ? HELLO_NIGHT : hourNow() < 12 ? HELLO : HELLO_LATER, this.rand), 2.2);
    }
    if (this.clock >= m.shiftEnds) {
      r.goHome(near < 7 ? pick(night ? [...BYE_NIGHT, ...BYE] : BYE, this.rand) : undefined);
      return;
    }
    if (r.phase !== 'seated') return;
    if (r.task === 'phone' && m.phoned !== r.taskSerial && near < 6 && r.taskProgress > 0.25) {
      m.phoned = r.taskSerial;
      if (!r.quipping) r.say(pick(PHONE, this.rand), 2.8);
    }
    if (this.clock >= m.nextBreak) m.nextBreak = this.clock + (this.startBreak(r) ? 150 + this.rand() * 180 : 12 + this.rand() * 15);
  }

  /** Passing the session that took their desk on the way out: a wave each way, and a word. */
  private handOver(m: Member): void {
    const r = m.r;
    const e = this.director.list().find((x) => x.desk.index === r.desk.index && x.phase === 'entering');
    if (!e || Math.hypot(e.position.x - r.position.x, e.position.z - r.position.z) > 2.4) return;
    m.handedOver = true;
    r.wave(1.2);
    e.wave(1.2);
    if (!r.quipping) r.say(pick(HANDOVER, this.rand), 2.2, true);
  }

  /** Off to the coffee machine or the water cooler, if there's room over there. */
  private startBreak(r: RegularChar): boolean {
    if (this.members.filter((m) => m.r.onBreak).length >= MAX_AWAY) return false;
    const free = this.hangs.filter((s) => !s.by && this.clock - (this.badSpots.get(s) ?? -1e9) > 60);
    if (!free.length) return false;
    // Next to someone already standing there is a chat waiting to happen.
    const social = free.filter((s) => s.mate?.by?.hanging && !s.mate.by.partner && !s.mate.by.chatted);
    const hang = pick(social.length && this.rand() < 0.8 ? social : free, this.rand);
    // Furniture comes and goes (catalog models, new props): the spot must still be clear and
    // reachable from this desk, or it sits out a minute and they try again later.
    if (!this.spotOk(hang, r.desk.approach)) return false;
    const fills = this.fills.filter((s) => !s.by).sort((a, b) => a.at.distanceTo(hang.at) - b.at.distanceTo(hang.at));
    const fill = fills.length && this.rand() < 0.85 && this.spotOk(fills[0], hang.at) ? fills[0] : null;
    if (!r.takeBreak(fill, hang, 6 + this.rand() * 8)) return false;
    hang.by = r;
    if (fill) fill.by = r;
    return true;
  }

  private spotOk(s: Spot, from: THREE.Vector3): boolean {
    const ok = roomyAt(this.world, s.at.x, s.at.z) && reaches(this.world, from, s.at);
    if (!ok) this.badSpots.set(s, this.clock);
    return ok;
  }

  /** Pair up neighbours at the water cooler, take turns talking, and let them go back after. */
  private tendChats(manager: THREE.Vector3): void {
    for (const s of this.hangs) {
      const a = s.by;
      const b = s.mate?.by;
      // One chat per break: once it's over they head back (else they'd pair up again forever).
      if (!a || !b || a.partner || b.partner || a.chatted || b.chatted || !a.hanging || !b.hanging || a.name > b.name) continue;
      const seconds = 8 + this.rand() * 7;
      a.partner = b;
      b.partner = a;
      a.chatted = b.chatted = true;
      a.talking = this.rand() < 0.5;
      b.talking = !a.talking;
      a.stayFor(seconds + 1);
      b.stayFor(seconds + 1);
      this.chats.push({ a, b, until: this.clock + seconds, turnAt: this.clock + 1.5 + this.rand() * 2 });
    }
    for (let i = this.chats.length - 1; i >= 0; i--) {
      const c = this.chats[i];
      const intact = c.a.partner === c.b && c.b.partner === c.a && c.a.hanging && c.b.hanging;
      if (!intact || this.clock >= c.until) {
        for (const [r, other] of [
          [c.a, c.b],
          [c.b, c.a],
        ] as const) {
          if (r.partner !== other) continue;
          r.partner = null;
          r.talking = false;
          r.wrapUp(0.4 + this.rand() * 1.4);
        }
        this.chats.splice(i, 1);
        continue;
      }
      if (this.clock < c.turnAt) continue;
      // Their turn: a laugh at what was just said, sometimes, then a line of their own.
      const speaker = c.a.talking ? c.b : c.a;
      const listener = speaker === c.a ? c.b : c.a;
      speaker.talking = true;
      listener.talking = false;
      if (this.rand() < 0.35) speaker.laugh();
      const near = Math.hypot(manager.x - speaker.position.x, manager.z - speaker.position.z) < 12;
      if (near && this.rand() < 0.5) speaker.say(pick(CHAT, this.rand), 2.6);
      c.turnAt = this.clock + 2.2 + this.rand() * 2.6;
    }
  }

  private arrivals(dt: number): void {
    const want = this.target();
    let here = 0;
    for (const m of this.members) if (m.r.holdsDesk) here++;
    if (here >= want) {
      this.rush = false;
      return;
    }
    this.arriveIn -= dt;
    if (this.arriveIn > 0) return;
    this.spawn(false);
    // Below target, one walks in every 20–60 s (faster right after the switch went up).
    this.arriveIn = this.rush ? 3 + this.rand() * 6 : 20 + this.rand() * 40;
  }
}

// ---------------------------------------------------------------------------------------

/** Room to stand at (x, z): clear of every collider by a body's width. */
function roomyAt(world: World, x: number, z: number): boolean {
  return world.colliders.every((b) => Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minZ - z, 0, z - b.maxZ)) >= 0.42);
}

/** There's a walkable route from `from` that ends right at `to`. */
function reaches(world: World, from: THREE.Vector3, to: THREE.Vector3): boolean {
  const path = world.findPath(from, to);
  const end = path?.[path.length - 1];
  return !!end && Math.hypot(end.x - to.x, end.z - to.z) < 0.25;
}

/**
 * Where breaks happen: one at a time in front of the coffee machine and the water cooler (found
 * by their prop names, else the coffee E spot), and up to three pairs of facing spots on the open
 * floor nearby for a chat. Spots keep clear of furniture, so when the kitchen is rearranged they
 * move with it; with no coffee machine at all there are no breaks.
 */
function breakSpots(world: World): { fills: Spot[]; hangs: Spot[] } {
  const coffee = world.interactables.find((i) => i.kind === 'coffee');
  if (!coffee) return { fills: [], hangs: [] };
  const roomy = (x: number, z: number) => roomyAt(world, x, z);
  const spot = (x: number, z: number, yaw: number): Spot => ({ at: new THREE.Vector3(x, 0, z), yaw, by: null, mate: null });
  const reachable = (s: Spot) => reaches(world, world.entrance.inside, s.at);
  /** Step out from the front (+Z side) of a prop until there's room to stand, facing it. */
  const facing = (name: string, fallback?: THREE.Vector3): Spot | null => {
    const prop = world.root.getObjectByName(name);
    const p = prop ? prop.getWorldPosition(new THREE.Vector3()) : fallback;
    if (!p) return null;
    for (let dz = 0.45; dz < 1.6; dz += 0.05) if (roomy(p.x, p.z + dz)) return spot(p.x, p.z + dz, Math.PI);
    return null;
  };
  const fills = [facing('coffee-machine', coffee.position.clone().setZ(coffee.position.z - 0.95)), facing('water-cooler')].filter((s): s is Spot => !!s && reachable(s));
  if (!fills.length) return { fills, hangs: [] };
  // Chat pairs side by side a metre apart, on the open floor just in front of the fill spots.
  const ax = fills.reduce((n, s) => n + s.at.x, 0) / fills.length;
  const az = fills.reduce((n, s) => n + s.at.z, 0) / fills.length;
  const taken: THREE.Vector3[] = fills.map((s) => s.at);
  const spaced = (x: number, z: number) => taken.every((p) => Math.hypot(p.x - x, p.z - z) >= 0.9);
  const centres: [number, number][] = [];
  for (let dz = 0.55; dz <= 1.9; dz += 0.3) for (let dx = -3; dx <= 3; dx += 0.5) centres.push([ax + dx, az + dz]);
  centres.sort((p, q) => Math.hypot(p[0] - ax, p[1] - az) - Math.hypot(q[0] - ax, q[1] - az));
  const hangs: Spot[] = [];
  for (const [cx, cz] of centres) {
    if (hangs.length >= 6) break;
    const [x1, x2] = [cx - 0.5, cx + 0.5];
    if (!roomy(x1, cz) || !roomy(x2, cz) || !spaced(x1, cz) || !spaced(x2, cz)) continue;
    // Alone, they look out over the office; with company, at each other.
    const a = spot(x1, cz, Math.atan2(-x1, -cz));
    const b = spot(x2, cz, Math.atan2(-x2, -cz));
    if (!reachable(a) || !reachable(b)) continue;
    a.mate = b;
    b.mate = a;
    hangs.push(a, b);
    taken.push(a.at, b.at);
  }
  return { fills, hangs };
}

/**
 * The front desk as a desk Mabel can sit at (world.reception is a seat on a stool, not one of
 * the office desks: no sessions there, ever). The stool stays put; this stand-in chair only
 * gives her a direction to push back in when she gets up, and her monitor is the world's own.
 */
function receptionSpot(world: World): { slot: DeskSlot; chair: Chair } | null {
  const r = world.reception as World['reception'] | undefined;
  if (!r) return null;
  const chair = new THREE.Object3D();
  chair.position.copy(r.seat).setY(0);
  chair.rotation.y = r.yaw + Math.PI;
  const slot: DeskSlot = {
    index: -1,
    seat: r.seat,
    yaw: r.yaw,
    approach: r.approach,
    internSpots: [],
    chair,
    screen: new THREE.Object3D(),
    setScreen() {},
    setNameplate() {},
    accent: '#5CC8FF',
  };
  return { slot, chair: new Chair(slot) };
}

/** The title bar of their app (world/screens.ts paints the rest), and for mail the subjects. */
function appLines(app: OfficeApp, p: RegularProfile): string[] {
  switch (app) {
    case 'sheet':
      return [`${p.dept} budget.xlsx`];
    case 'mail':
      return [`Inbox: ${p.name}`, 'Re: Q3 numbers', 'Lunch on Friday?', 'Printer fixed (again)', 'Team photo at 3!', 'Re: Re: the spreadsheet', 'Who took my stapler?', 'Cake in the kitchen!'];
    case 'slides':
      return [`${p.dept} review.pptx`];
    case 'doc':
      return [`${p.dept} plan.docx`];
    case 'chart':
      return [`${p.dept} dashboard`];
    case 'calendar':
      return [`${p.name}'s week`];
  }
}

/** Small deterministic PRNG (same as the demo's). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(list: readonly T[], rand: () => number): T {
  return list[Math.floor(rand() * list.length)];
}

function shuffle<T>(list: T[], rand: () => number): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
