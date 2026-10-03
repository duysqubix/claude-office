// Everyone on foot steps around everyone else (#30): sessions, interns, regulars, the receptionist,
// and the manager (someone to step around: the crowd never moves the boss). A spatial hash is
// rebuilt every frame. Each walker looks a second or so ahead and bends its next step around
// anyone it would otherwise walk into: round the side they won't be on, keeping right when it's
// dead ahead, the way they commit to for the whole encounter so nobody dithers. Walkers ease off
// behind slower people and let people with the right of way cross first, and keep a little
// personal space. After everyone has moved, a last pass pulls apart anyone still touching. A
// brush gets a light shove and a "Sorry!" (with cooldowns, so it stays charming, not chatty).
// In a tight spot the lower-priority walker steps out of the way and waits ("After you!"):
// departures go first, then sessions, then whoever came in first. Someone who still can't make
// headway for a few seconds plans their way again and pushes gently through instead of waiting
// for ever, so arrivals and departures stay on time. `?crowd=0` turns it all off (A/B checks).
//
// Walkers call lost(), endReach(), past(), steer() and keepClear() from their path following
// (EmployeeChar.followPath, InternChar.follow); main.ts calls begin() before anyone moves and
// settle() after.
import * as THREE from 'three';
import type { AABB } from '../world/types';
import type { Body } from './body';
import { pushOutOfBoxes } from './collide';
import type { EmployeeChar } from './employee';
import type { InternChar } from './intern';
import type { Manager } from './manager';
import { damp } from './spring';

/** walk: following a path; stand: on their feet, not going anywhere; fixed: seated, or getting in or out of a seat. */
type Role = 'walk' | 'stand' | 'fixed';

interface Agent {
  who: object;
  pos: THREE.Vector3;
  r: number;
  role: Role;
  /** Velocity over the last frame (m/s). */
  vx: number;
  vz: number;
  /** The manager: stepped around, never moved (their own collision does that). */
  boss: boolean;
  /** Higher goes first in a tight spot. */
  prio: number;
  body: Body;
  /** Who can say sorry (interns don't talk; the boss is you). */
  talker: EmployeeChar | null;
  pushed: boolean;
}

/** What the crowd remembers about each person from frame to frame. */
interface Memo {
  rank: number;
  seen: boolean;
  /** Where they were when the frame began. */
  x0: number;
  z0: number;
  /** Measured velocity (m/s), lightly smoothed. */
  vx: number;
  vz: number;
  /** Sideways steering, smoothed (+ is to their right). */
  side: number;
  /** How far off their path they're heading right now (radians, + to their left), and where that's easing to. */
  defl: number;
  wantDefl: number;
  /** Where their walk ends (set by endReach), to spot a queue for the same spot. */
  endX: number;
  endZ: number;
  endAt: number;
  /** Who they're passing and which way round (kept for the whole encounter). */
  passing: object | null;
  passWay: number;
  passUntil: number;
  /** Frame of their last steer(): they're trying to get somewhere. */
  steered: number;
  /** When the crowd first saw them. */
  since: number;
  /** Their agent (reused every frame). */
  agent: Agent | null;
  stuckT: number;
  freeT: number;
  stuckCount: number;
  /** Stuck long enough to plan the way again (read once by lost()), and when they last did. */
  lost: boolean;
  lostAt: number;
  /** Where they last made real headway from (the stuck watchdog's yardstick). */
  anchorX: number;
  anchorZ: number;
  /** Rubbing along the furniture: how long. */
  scrapeT: number;
  /** Walking into someone (or something) and not getting anywhere: how long. */
  pressT: number;
  /** How fast they really got anywhere lately, pushes and all (m/s, smoothed). */
  net: number;
  /** The speed steer() last asked for. */
  cmd: number;
  /** Pushing through (no stepping aside, no waiting) until then. */
  pushUntil: number;
  /** The very last resort: squeezing past (no collisions) until then. */
  ghostUntil: number;
  blockedT: number;
  yieldFor: Agent | null;
  yieldUntil: number;
  saidAt: number;
}

/** How far ahead (in seconds) a walker sees someone coming. */
const HORIZON = 1.6;
/** Room to spare when passing someone. */
const MARGIN = 0.14;
/** Personal space beyond touching. */
const SPACE = 0.2;
/** Hash cell: the 3×3 cells around anyone cover at least this far. */
const CELL = 2.5;
/** Seconds without headway before pushing through. */
const STUCK = 3;
/** The nav grid's own clearance round the furniture (world/nav.ts): a walk planned from inside it finds no way out. */
const NAV_CLEAR = 0.3;
/** The longest anyone waits for someone else to get by (s). */
const YIELD = 1.6;
/** How fast someone can swing their way off (or back onto) their path, rad/s. */
const TURN = 2.5;
const SORRY = ['Sorry!', 'Oops, sorry!', 'Pardon me!', "'Scuse me!", 'Whoops!'];
const SORRY_BOSS = ['Sorry, boss!', "'Scuse me, boss!", 'Oops! Sorry, boss!'];
const EXCUSE_BOSS = ["'Scuse me, boss!"];
const AFTER_YOU = ['After you!', 'Go ahead!', 'You first!'];

const _n = new THREE.Vector3();

function enabledByUrl(): boolean {
  try {
    return new URLSearchParams(location.search).get('crowd') !== '0';
  } catch {
    return true;
  }
}

const pick = (lines: readonly string[]) => lines[Math.floor(Math.random() * lines.length)];

export class Crowd {
  enabled = enabledByUrl();
  private agents: Agent[] = [];
  private byWho = new Map<object, Agent>();
  private cells = new Map<number, Agent[]>();
  private found: Agent[] = [];
  private memos = new WeakMap<object, Memo>();
  private ranks = 0;
  private frame = 0;
  private clock = 0;
  private dt = 1 / 60;
  private colliders: readonly AABB[] = [];
  private lastSorry = -1e9;
  private lastAfterYou = -1e9;
  private pairs = new Map<string, number>();

  /** Before anyone moves: who's where, and how fast they were going. */
  begin(dt: number, manager: Manager, sessions: readonly EmployeeChar[], interns: readonly InternChar[], regulars: readonly EmployeeChar[], colliders: readonly AABB[]): void {
    this.frame++;
    this.clock += dt;
    this.dt = Math.max(dt, 1e-3);
    this.colliders = colliders;
    this.agents.length = 0;
    this.byWho.clear();
    if (!this.enabled) return;
    this.add(manager, manager.position, 0.3, 'stand', 100, manager.body, null, true);
    for (const e of sessions) this.addEmployee(e, 1);
    for (const e of regulars) this.addEmployee(e, 0);
    for (const i of interns) {
      const role = internRole(i);
      if (role) this.add(i, i.position, 0.22, role, i.phase === 'leaving' ? 2 : 0, i.body, null, false);
    }
    this.rehash();
    if (this.pairs.size > 64) for (const [k, at] of this.pairs) if (this.clock - at > 30) this.pairs.delete(k);
  }

  /**
   * Bend a walker's next step (`dir`, a unit vector, changed in place) around the people in
   * the way; `speed` is how fast they'd like to go. Returns a speed factor: 1 is a clear road,
   * less when stepping aside or easing off, 0 while waiting for someone to get by.
   */
  steer(who: object, dir: THREE.Vector3, speed = 1.5): number {
    const a = this.byWho.get(who);
    if (!a || !this.enabled) return 1;
    const m = this.memo(who);
    // A fresh walk starts on its path.
    if (m.steered !== this.frame - 1) m.defl = m.wantDefl = 0;
    m.steered = this.frame;
    const sp = Math.max(0.8, speed);
    const along = Math.atan2(dir.x, dir.z);
    let k = this.clock < m.pushUntil || this.clock < m.ghostUntil ? 1 : m.yieldFor ? this.makeRoom(a, m, dir, sp) : this.bend(a, m, dir, sp);
    // Pressing on someone (or something) and getting nowhere: a shuffle, never a stride on the spot.
    if (m.pressT > 0.25) k = Math.min(k, (m.net + 0.3) / sp);
    // How far off their path they're heading turns no faster than people turn (no twitching
    // from frame to frame). The path's own corners are untouched.
    let want = Math.atan2(dir.x, dir.z) - along;
    want -= Math.round(want / (2 * Math.PI)) * 2 * Math.PI;
    m.wantDefl += (want - m.wantDefl) * damp(6, this.dt);
    const step = TURN * this.dt;
    m.defl += Math.max(-step, Math.min(step, m.wantDefl - m.defl));
    if (m.defl) dir.set(Math.sin(along + m.defl), 0, Math.cos(along + m.defl));
    m.cmd = sp * k;
    return k;
  }

  /** Waiting for someone to get by in a tight spot: a step aside (or back) out of their way, then stand. */
  private makeRoom(a: Agent, m: Memo, dir: THREE.Vector3, sp: number): number {
    const o = m.yieldFor!;
    const dx = o.pos.x - a.pos.x;
    const dz = o.pos.z - a.pos.z;
    const dist = Math.hypot(dx, dz) || 1e-4;
    const ux = dx / dist;
    const uz = dz / dist;
    // Until they're by (level with us or behind), well clear or not coming our way, or it's been long enough.
    const coming = -(o.vx * ux + o.vz * uz);
    if (this.clock >= m.yieldUntil || dist > a.r + o.r + 0.5 || dx * dir.x + dz * dir.z <= -0.1 || o.role !== 'walk' || (coming < 0.05 && this.clock > m.yieldUntil - YIELD + 0.6)) {
      m.yieldFor = null;
      return this.bend(a, m, dir, sp);
    }
    // Just the one step out of the way, then stand.
    if (dist > a.r + o.r + 0.25 || this.clock > m.yieldUntil - YIELD + 0.6) return 0;
    // Off the line they're walking along, on the side we're already on (dead on it: their left,
    // as they'll keep right); else the other side; else straight back.
    const os = Math.hypot(o.vx, o.vz);
    let px = -uz;
    let pz = ux;
    if (os > 0.2) {
      // Their right, then which side of their line we're on.
      px = -o.vz / os;
      pz = o.vx / os;
      if (-(dx * px + dz * pz) <= 0.05) {
        px = -px;
        pz = -pz;
      }
    }
    for (const [sx, sz] of [[px, pz], [-px, -pz], [-ux, -uz]]) {
      if (this.blocked(a.pos.x + sx * 0.5, a.pos.z + sz * 0.5, a.r * 0.8)) continue;
      dir.set(sx, 0, sz);
      return 0.45 / sp;
    }
    return 0;
  }

  /** The everyday steering: round people, behind slower ones, after those with the right of way. */
  private bend(a: Agent, m: Memo, dir: THREE.Vector3, sp: number): number {
    const ax = dir.x * sp;
    const az = dir.z * sp;
    const rx = -dir.z;
    const rz = dir.x;
    let sepX = 0;
    let sepZ = 0;
    let side = 0;
    let slow = 1;
    let urgent = 0;
    let blocker: Agent | null = null;
    let blockerAhead = Infinity;
    for (const n of this.near(a.pos)) {
      if (n === a || this.clock < this.memo(n.who).ghostUntil) continue;
      const dx = n.pos.x - a.pos.x;
      const dz = n.pos.z - a.pos.z;
      const dist = Math.hypot(dx, dz) || 1e-4;
      const touch = a.r + n.r;
      if (dist < touch + SPACE) {
        // Personal space: a gentle push away, stronger the closer they are.
        const w = (touch + SPACE - dist) / SPACE;
        sepX -= (dx / dist) * w;
        sepZ -= (dz / dist) * w;
      }
      const ahead = dx * dir.x + dz * dir.z;
      if (ahead > 0 && ahead < touch + 0.3 && Math.abs(dx * rx + dz * rz) < touch && ahead < blockerAhead) {
        blocker = n;
        blockerAhead = ahead;
      }
      // Closest approach if we go where we want and they keep going the way they are.
      const wx = ax - n.vx;
      const wz = az - n.vz;
      const w2 = wx * wx + wz * wz;
      const tc = w2 > 1e-4 ? (dx * wx + dz * wz) / w2 : 0;
      if (tc <= 0 || tc > HORIZON) continue;
      const cx = dx - wx * tc;
      const cz = dz - wz * tc;
      const need = touch + MARGIN;
      const miss = Math.hypot(cx, cz);
      if (miss >= need) continue;
      // Sooner and closer is more urgent.
      const u = (1 - tc / HORIZON) * (1.15 - miss / need);
      let way: number;
      if (m.passing === n.who && this.clock < m.passUntil) way = m.passWay;
      else {
        // Round the side they won't be on; dead ahead, keep right.
        const lat = cx * rx + cz * rz;
        way = Math.abs(lat) < 0.1 ? 1 : lat > 0 ? -1 : 1;
        if (u > urgent) {
          m.passing = n.who;
          m.passWay = way;
        }
      }
      if (m.passing === n.who) m.passUntil = this.clock + 0.6;
      urgent = Math.max(urgent, u);
      const nSpeed = Math.hypot(n.vx, n.vz);
      const along = n.vx * dir.x + n.vz * dir.z;
      if (nSpeed > 0.3 && along > 0.5 * nSpeed && ahead > 0) {
        // Going our way, only slower: tag along behind them (or slip past if there's room).
        // Only whoever is behind along the way they're both going eases off: two walking side
        // by side mustn't each wait for the other.
        side += way * u * 0.6;
        const behind = dx * (dir.x + n.vx / nSpeed) + dz * (dir.z + n.vz / nSpeed) > 0.2;
        if (behind && ahead < touch + 0.6) slow = Math.min(slow, Math.max(0.25, along / sp));
      } else if (nSpeed > 0.3 && Math.abs(n.vx * rx + n.vz * rz) > 0.5 * nSpeed) {
        // Crossing paths: whoever's turn it isn't eases off and lets the other go first; the one
        // going first only bends a little (both swerving is how two people end up dancing).
        if (n.prio > a.prio) {
          side += way * u * 1.6;
          slow = Math.min(slow, 0.35 + 0.65 * (tc / HORIZON));
        } else {
          side += way * u * 0.5;
        }
      } else {
        side += way * u * 1.6;
      }
    }
    m.side += (side - m.side) * damp(side ? 10 : 6, this.dt);
    if (!sepX && !sepZ && slow === 1 && Math.abs(m.side) < 0.02) {
      m.blockedT = 0;
      return 1;
    }
    let vx = dir.x + rx * m.side + sepX * 0.9;
    let vz = dir.z + rz * m.side + sepZ * 0.9;
    let len = Math.hypot(vx, vz) || 1;
    vx /= len;
    vz /= len;
    let forward = vx * dir.x + vz * dir.z;
    if (forward < 0) {
      // Never back along the path: a sidestep at most.
      vx -= forward * dir.x;
      vz -= forward * dir.z;
      len = Math.hypot(vx, vz);
      if (len < 1e-3) {
        vx = rx;
        vz = rz;
      } else {
        vx /= len;
        vz /= len;
      }
      forward = 0;
    }
    let k = slow * (0.4 + 0.6 * forward);
    // Stepping aside into the furniture (or a door frame): the other way round, or hold the line and ease off.
    if (forward < 0.98 && this.blocked(a.pos.x + vx * 0.45, a.pos.z + vz * 0.45, a.r * 0.8)) {
      const lat = vx * rx + vz * rz;
      const fx = vx - 2 * lat * rx;
      const fz = vz - 2 * lat * rz;
      if (!this.blocked(a.pos.x + fx * 0.45, a.pos.z + fz * 0.45, a.r * 0.8)) {
        vx = fx;
        vz = fz;
        m.side = -m.side;
        m.passWay = -m.passWay;
      } else {
        // (forward stays as it was: no room either side is just when someone should give way.)
        vx = dir.x;
        vz = dir.z;
        k = Math.min(k, 0.4);
      }
    }
    // Face to face and getting nowhere: the lower priority waits for the other to pass.
    if (blocker && forward * k < 0.3) {
      m.blockedT += this.dt;
      if (m.blockedT > 0.5) {
        m.blockedT = 0;
        // (The boss in the way gets an "'Scuse me": same family as a "Sorry!", same shared pause.)
        if (blocker.boss) {
          if (this.clock - this.lastSorry >= 2.5 && this.say(a, EXCUSE_BOSS, 12)) this.lastSorry = this.clock;
        }
        else if (blocker.role !== 'fixed' && a.prio < blocker.prio && this.memo(blocker.who).yieldFor !== a) {
          m.yieldFor = blocker;
          m.yieldUntil = this.clock + YIELD;
          // (Not two "After you!"s at once.)
          if (this.clock - this.lastAfterYou > 3 && this.say(a, AFTER_YOU, 10)) this.lastAfterYou = this.clock;
        }
      }
    } else {
      m.blockedT = Math.max(0, m.blockedT - this.dt);
    }
    dir.set(vx, 0, vz);
    return k;
  }

  /**
   * How close to `end` counts as there: `normal`, or near enough when someone else is on it
   * (everyone walking out heads for the same spot outside the door).
   */
  endReach(who: object, end: THREE.Vector3 | undefined, normal: number): number {
    const a = this.byWho.get(who);
    if (!a || !end || !this.enabled) return normal;
    const m = this.memo(who);
    m.endX = end.x;
    m.endZ = end.z;
    m.endAt = this.frame;
    let reach = normal;
    // Walking into the furniture right by it (an end point tucked in close to a table, say):
    // as near as they can get is there.
    if (m.pressT > 0.4 && Math.hypot(a.pos.x - end.x, a.pos.z - end.z) < 0.35) reach = 0.35;
    for (const n of this.near(end)) {
      if (n === a) continue;
      const touch = a.r + n.r;
      if (Math.hypot(n.pos.x - end.x, n.pos.z - end.z) < touch) reach = Math.max(reach, touch + 0.15);
      // Others close by heading for the very same spot (the way out, say): near enough is there,
      // or they'd mill about it waiting for a turn.
      const o = this.memo(n.who);
      if (o.endAt >= this.frame - 1 && Math.hypot(o.endX - end.x, o.endZ - end.z) < 0.5 && Math.hypot(n.pos.x - end.x, n.pos.z - end.z) < 2) reach = Math.max(reach, 1.2);
    }
    return reach;
  }

  /** The next corner of `path` is behind us (we were steered past it) and the one after is in plain sight: skip it. */
  past(pos: THREE.Vector3, path: readonly THREE.Vector3[]): boolean {
    if (!this.enabled || path.length < 2) return false;
    const p = path[0];
    const q = path[1];
    const dx = pos.x - p.x;
    const dz = pos.z - p.z;
    return dx * dx + dz * dz < 1.2 * 1.2 && dx * (q.x - p.x) + dz * (q.z - p.z) > 0 && this.clearLine(pos.x, pos.z, q.x, q.z, 0.25);
  }

  /** Stuck in a jam for a while: true (once) when they should plan their way again from where they are. */
  lost(who: object): boolean {
    const m = this.memos.get(who);
    if (!m?.lost || !this.enabled) return false;
    m.lost = false;
    m.lostAt = this.clock;
    return true;
  }

  /**
   * Someone who stepped aside stays out of the furniture. Scraping along it for a moment means
   * they were pushed off their way (round a door frame, say): time to plan the way again.
   */
  keepClear(who: object, r: number, colliders: readonly AABB[]): void {
    const a = this.byWho.get(who);
    if (!a || !this.enabled) return;
    const m = this.memo(who);
    // Never into the nav's own margin, or planning the way again from there would find none.
    m.scrapeT = pushOutOfBoxes(a.pos, Math.max(r, NAV_CLEAR), colliders) ? m.scrapeT + this.dt : 0;
    // (Planning a route isn't free: once every couple of seconds at most.)
    if (m.scrapeT > 0.3 && this.clock - m.lostAt > 2) {
      m.scrapeT = 0;
      m.lost = true;
    }
  }

  /** After everyone has moved: pull apart anyone still touching, and the odd "Sorry!". */
  settle(): void {
    if (!this.enabled || !this.agents.length) return;
    // How everyone moved this frame on their own (before any pulling apart).
    for (const a of this.agents) {
      const m = this.memo(a.who);
      m.vx += ((a.pos.x - m.x0) / this.dt - m.vx) * 0.5;
      m.vz += ((a.pos.z - m.z0) / this.dt - m.vz) * 0.5;
      a.vx = m.vx;
      a.vz = m.vz;
    }
    this.rehash();
    for (let pass = 0; pass < 2; pass++) {
      for (const a of this.agents) {
        if (a.role === 'fixed' || a.boss) continue;
        const ma = this.memo(a.who);
        if (this.clock < ma.ghostUntil) continue;
        for (const b of this.near(a.pos)) {
          if (b === a) continue;
          const mb = this.memo(b.who);
          // Two people on their feet are handled once (from the lower rank); the seated and the boss from our side.
          if (b.role !== 'fixed' && !b.boss && mb.rank < ma.rank) continue;
          if (this.clock < mb.ghostUntil) continue;
          const dx = a.pos.x - b.pos.x;
          const dz = a.pos.z - b.pos.z;
          const dist = Math.hypot(dx, dz);
          const touch = a.r + b.r;
          if (dist >= touch + 0.05) continue;
          if (pass === 0) this.brush(a, b, dx, dz, dist);
          if (dist >= touch) continue;
          const nx = dist > 1e-4 ? dx / dist : 1;
          const nz = dist > 1e-4 ? dz / dist : 0;
          // (A big overlap, two people turning up on the same spot, comes apart over a few frames, not in one pop.)
          const over = Math.min(touch - dist, 0.06);
          const wa = this.weight(a, ma);
          const wb = this.weight(b, mb);
          const sa = wa / (wa + wb);
          a.pos.x += nx * over * sa;
          a.pos.z += nz * over * sa;
          a.pushed = true;
          if (sa < 1) {
            b.pos.x -= nx * over * (1 - sa);
            b.pos.z -= nz * over * (1 - sa);
            b.pushed = true;
          }
        }
      }
    }
    for (const a of this.agents) {
      if (a.pushed) pushOutOfBoxes(a.pos, NAV_CLEAR, this.colliders);
      const m = this.memo(a.who);
      const net = Math.hypot(a.pos.x - m.x0, a.pos.z - m.z0) / this.dt;
      m.net += (net - m.net) * damp(8, this.dt);
      if (a.role !== 'walk' || m.steered !== this.frame) {
        m.stuckT = 0;
        m.pressT = 0;
        m.anchorX = a.pos.x;
        m.anchorZ = a.pos.z;
        continue;
      }
      m.pressT = m.cmd > 0.25 && net < 0.4 * m.cmd ? m.pressT + this.dt : Math.max(0, m.pressT - 2 * this.dt);
      // Trying to walk and not getting anywhere (a jam nobody could sort out): plan the way
      // again and push through; the third time running, squeeze past.
      if (Math.hypot(a.pos.x - m.anchorX, a.pos.z - m.anchorZ) > 0.4) {
        m.anchorX = a.pos.x;
        m.anchorZ = a.pos.z;
        m.stuckT = 0;
      } else {
        m.stuckT += this.dt;
      }
      m.freeT = net > 0.6 ? m.freeT + this.dt : 0;
      if (m.freeT > 1) m.stuckCount = 0;
      if (m.stuckT > STUCK) {
        m.stuckT = 0;
        m.yieldFor = null;
        m.lost = true;
        if (++m.stuckCount >= 3) {
          m.stuckCount = 0;
          m.ghostUntil = this.clock + 1.5;
        } else {
          m.pushUntil = this.clock + 2;
        }
      }
    }
  }

  // -------------------------------------------------------------------------------------

  private addEmployee(e: EmployeeChar, session: number): void {
    const role = employeeRole(e);
    if (role) this.add(e, e.position, 0.3, role, (e.phase === 'leaving' ? 2 : 0) + session, e.body, e, false);
  }

  private add(who: object, pos: THREE.Vector3, r: number, role: Role, prio: number, body: Body, talker: EmployeeChar | null, boss: boolean): void {
    const m = this.memo(who);
    if (!m.seen) {
      m.vx = 0;
      m.vz = 0;
      m.seen = true;
      m.since = this.clock;
    }
    m.x0 = pos.x;
    m.z0 = pos.z;
    // One agent per person, reused every frame. Ties go to whoever came in first.
    const a = (m.agent ??= { who, pos, r, role, vx: 0, vz: 0, boss, prio: 0, body, talker, pushed: false });
    a.pos = pos;
    a.r = r;
    a.role = role;
    a.vx = m.vx;
    a.vz = m.vz;
    a.prio = prio + 0.5 / (1 + m.rank);
    a.pushed = false;
    this.agents.push(a);
    this.byWho.set(who, a);
  }

  /** A circle of radius r at (x, z) would be inside the furniture or a wall. */
  private blocked(x: number, z: number, r: number): boolean {
    for (const b of this.colliders) if (x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r) return true;
    return false;
  }

  /** Nothing in the way (furniture or walls, grown by r) on the straight line from a to b. */
  private clearLine(ax: number, az: number, bx: number, bz: number, r: number): boolean {
    const dx = bx - ax;
    const dz = bz - az;
    for (const b of this.colliders) {
      const x0 = b.minX - r;
      const x1 = b.maxX + r;
      const z0 = b.minZ - r;
      const z1 = b.maxZ + r;
      if (Math.max(ax, bx) < x0 || Math.min(ax, bx) > x1 || Math.max(az, bz) < z0 || Math.min(az, bz) > z1) continue;
      // Slabs: the part of the segment inside the box's x range, then its z range.
      let t0 = 0;
      let t1 = 1;
      if (Math.abs(dx) > 1e-9) {
        const u = (x0 - ax) / dx;
        const v = (x1 - ax) / dx;
        t0 = Math.max(t0, Math.min(u, v));
        t1 = Math.min(t1, Math.max(u, v));
      } else if (ax < x0 || ax > x1) continue;
      if (Math.abs(dz) > 1e-9) {
        const u = (z0 - az) / dz;
        const v = (z1 - az) / dz;
        t0 = Math.max(t0, Math.min(u, v));
        t1 = Math.min(t1, Math.max(u, v));
      } else if (az < z0 || az > z1) continue;
      if (t0 <= t1) return false;
    }
    return true;
  }

  /** Share of an overlap someone takes: the seated and the boss none, walkers most, pushing through less. */
  private weight(a: Agent, m: Memo): number {
    if (a.role === 'fixed' || a.boss) return 0;
    if (a.role === 'stand') return 1;
    return this.clock < m.pushUntil ? 0.6 : 2;
  }

  private memo(who: object): Memo {
    let m = this.memos.get(who);
    if (!m) {
      m = { rank: this.ranks++, seen: false, x0: 0, z0: 0, vx: 0, vz: 0, side: 0, defl: 0, wantDefl: 0, endX: 0, endZ: 0, endAt: -1, passing: null, passWay: 1, passUntil: 0, steered: -1, since: this.clock, agent: null, stuckT: 0, freeT: 0, stuckCount: 0, lost: false, lostAt: -1e9, anchorX: 0, anchorZ: 0, scrapeT: 0, pressT: 0, net: 0, cmd: 0, pushUntil: 0, ghostUntil: 0, blockedT: 0, yieldFor: null, yieldUntil: 0, saidAt: -1e9 };
      this.memos.set(who, m);
    }
    return m;
  }

  private rehash(): void {
    for (const list of this.cells.values()) list.length = 0;
    for (const a of this.agents) {
      const k = Math.floor(a.pos.x / CELL) * 4096 + Math.floor(a.pos.z / CELL);
      const list = this.cells.get(k);
      if (list) list.push(a);
      else this.cells.set(k, [a]);
    }
  }

  /** Everyone in the 3×3 cells around a point (a shared list: done with it before asking again). */
  private near(p: THREE.Vector3): Agent[] {
    const out = this.found;
    out.length = 0;
    const cx = Math.floor(p.x / CELL);
    const cz = Math.floor(p.z / CELL);
    // (Someone flung to infinity would never leave this loop.)
    if (!Number.isFinite(cx) || !Number.isFinite(cz)) return out;
    for (let ix = cx - 1; ix <= cx + 1; ix++) {
      for (let iz = cz - 1; iz <= cz + 1; iz++) {
        const list = this.cells.get(ix * 4096 + iz);
        if (list) for (const a of list) out.push(a);
      }
    }
    return out;
  }

  /** Say one of `lines` unless they're mid-sentence or said something lately. */
  private say(a: Agent, lines: readonly string[], cooldown: number): boolean {
    const m = this.memo(a.who);
    const e = a.talker;
    if (!e || e.quipping || this.clock - m.saidAt < cooldown) return false;
    m.saidAt = this.clock;
    const line = pick(lines);
    // Regulars say it softly (their own bubble), sessions as a quip.
    const r = e as EmployeeChar & { say?: (text: string, seconds?: number, loud?: boolean) => void };
    if (r.say) r.say(line, 1.8, false);
    else e.quip(line, 1.8);
    return true;
  }

  /** Two people touched: a light shove each, and (now and then) a "Sorry!" from whoever walked into whom. */
  private brush(a: Agent, b: Agent, dx: number, dz: number, dist: number): void {
    const nx = dist > 1e-4 ? dx / dist : 1;
    const nz = dist > 1e-4 ? dz / dist : 0;
    // How fast each was heading into the other.
    const ca = -(a.vx * nx + a.vz * nz);
    const cb = b.vx * nx + b.vz * nz;
    if (Math.max(ca, cb) < 0.3) return;
    // Not the moment someone walks in (arrivals can turn up on top of each other outside).
    if (this.clock - this.memo(a.who).since < 0.8 || this.clock - this.memo(b.who).since < 0.8) return;
    const ra = this.memo(a.who).rank;
    const rb = this.memo(b.who).rank;
    const pair = ra < rb ? `${ra}:${rb}` : `${rb}:${ra}`;
    if (this.clock - (this.pairs.get(pair) ?? -1e9) < 25) return;
    this.pairs.set(pair, this.clock);
    const [bumper, bumped] = ca >= cb ? [a, b] : [b, a];
    // From the bumper to the one bumped.
    const s = bumper === a ? -1 : 1;
    // The light shove (not the boss: the manager's own bump does that).
    if (!bumped.boss) bumped.body.shove(_n.set(nx * s, 0, nz * s), 0.22);
    if (!bumper.boss) bumper.body.shove(_n.set(-nx * s, 0, -nz * s), 0.15);
    if (this.clock - this.lastSorry < 2.5) return;
    if (this.say(bumper, bumped.boss ? SORRY_BOSS : SORRY, 12)) this.lastSorry = this.clock;
  }
}

function employeeRole(e: EmployeeChar): Role | null {
  switch (e.phase) {
    case 'gone':
      return null;
    case 'entering':
    case 'leaving':
      return 'walk';
    case 'away':
      // A regular on a break: walking somewhere, or standing at their spot.
      return (e as EmployeeChar & { awayWalking?: boolean }).awayWalking ? 'walk' : 'stand';
    default:
      return 'fixed';
  }
}

function internRole(i: InternChar): Role | null {
  switch (i.phase) {
    case 'gone':
      return null;
    case 'entering':
    case 'leaving':
      return 'walk';
    case 'seated':
      // On a stool at the bench, or (no bench) standing by the boss with a laptop.
      return i.slot ? 'fixed' : 'stand';
    default:
      return 'fixed';
  }
}

/** The one crowd everyone walks in. */
export const crowd = new Crowd();
