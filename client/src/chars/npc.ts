// A regular: an NPC coworker (the crew that runs them is chars/regulars.ts). Not a Claude
// session and never in the director's roster. They work at a free desk (typing, reading, phone
// calls, coffee), take breaks at the coffee machine and the water cooler, chat, go home at the
// end of their shift, and give their desk up to any session that needs it: "All yours!".
// Walking, the chair, sitting down, standing up, leaving, bumps, waves and quips are all
// EmployeeChar's; this class adds their desk habits and the 'away' phase through its extension
// points (seatedExtra, extraPose, stoodUp, away).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { ActivityKind, Employee, EmployeeState } from '../../../shared/protocol';
import { hash32 } from '../style/palette';
import type { DeskSlot, OfficeApp, ScreenState, World } from '../world/types';
import { EmployeeChar, type Chair, type Phase } from './employee';
import { regularLooks, type Looks } from './looks';
import { Glancer } from './manager';
import { clamp, damp, smoothstep } from './spring';

export interface RegularProfile {
  /** `regular:<name>`, never a session id. */
  id: string;
  name: string;
  dept: string;
}

/** Somewhere to stand on a break: at the coffee machine or the water cooler, or chatting nearby. */
export interface BreakSpot {
  at: THREE.Vector3;
  /** Facing when there's nobody to talk to. */
  yaw: number;
}

export type DeskTask = 'type' | 'read' | 'mouse' | 'think' | 'notes' | 'idle' | 'phone' | 'sip';

/** Why they're up: a break (they'll be back), home time, or making room for a session. */
type Plan = 'break' | 'home' | 'yield';
/** The 'away' phase, step by step. */
type Step = 'yield' | 'grab' | 'walk' | 'fill' | 'hang';

/** [task, weight, shortest s, longest s]. */
export type TaskRow = readonly [DeskTask, number, number, number];

/** What sets one regular apart (the receptionist, chars/receptionist.ts). */
export interface RegularOptions {
  looks?: Looks;
  /** Their desk habits (default: an ordinary office worker's). */
  tasks?: readonly TaskRow[];
}

const TASKS: readonly TaskRow[] = [
  ['type', 30, 9, 22],
  ['read', 13, 7, 16],
  ['mouse', 12, 6, 14],
  ['think', 6, 4, 8],
  ['notes', 6, 5, 10],
  ['idle', 9, 4, 9],
  ['phone', 10, 10, 20],
  ['sip', 9, 6, 9],
];

/** Desk tasks that borrow a session's pose (EmployeeChar poses from its record's state and activity). */
const BORROWED: Partial<Record<DeskTask, [EmployeeState, ActivityKind?]>> = {
  type: ['working', 'typing'],
  read: ['working', 'reading'],
  mouse: ['working', 'browsing'],
  think: ['working', 'thinking'],
  notes: ['working', 'planning'],
  // Going idle after work is when EmployeeChar does its big stretch.
  idle: ['idle'],
};

const PHONE_CASES = ['#FF6B6B', '#4D96FF', '#FFD93D', '#6BCB77', '#B983FF', '#FF9F45'];
const BUMP_LINES = ['Oof!', 'Whoa!', 'Easy there!', 'Hey!'];
const BUMP_LINES_MUG = ['Whoa, my coffee!', 'Careful!', 'Oof!'];

const _to = new THREE.Vector3();
const _head = new THREE.Vector3();

/** 0 → 1 → 0 across [a, b], smooth at both ends. */
export const pulse = (t: number, a: number, b: number): number => (t <= a || t >= b ? 0 : Math.sin(((t - a) / (b - a)) * Math.PI));

/** The roster-shaped record EmployeeChar animates from. Never sent anywhere. */
function deskRecord(p: RegularProfile): Employee {
  const now = Date.now();
  return {
    sessionId: p.id,
    pid: 0,
    name: p.id,
    displayName: p.name,
    cwd: '',
    project: p.dept,
    kind: 'regular',
    hosted: false,
    state: 'working',
    stateSince: now,
    activity: { kind: 'typing', label: '' },
    interns: [],
    startedAt: now,
  };
}

export class RegularChar extends EmployeeChar {
  /** Night owls yawn and reach for the coffee more (the crew sets it after 9 pm). */
  night = false;
  /** On a break the crew pairs them up for a chat; `talking` says whose turn it is. */
  partner: RegularChar | null = null;
  /** Already had their chat this break (the crew pairs people once per break, then they go back). */
  chatted = false;
  talking = false;
  /** Their current line carries farther than chatter ("All yours!"). */
  quipLoud = false;
  /** Holding their mug: walking in with a coffee, on a break, sipping at the desk, heading home. */
  mugInHand = false;
  task: DeskTask = 'type';
  /** Counts desk tasks, so the crew can tell one phone call from the next. */
  taskSerial = 0;
  app: OfficeApp;
  /** Bumped whenever their nameplate or monitor should change. */
  deskVersion = 0;

  private plan: Plan | null = null;
  private step: Step = 'walk';
  private stepT = 0;
  private fillSpot: BreakSpot | null = null;
  private hangSpot: BreakSpot | null = null;
  private hangFor = 0;
  private yieldLine = 'All yours!';
  protected taskT = 0;
  protected taskFor = 10;
  private sipPickup = true;
  private sipIn = 1.5;
  private sipT = -1;
  private laughT = -1;
  private phoneUp = false;
  private arrived: boolean;
  private lastPhase: Phase;
  private readonly glancer = new Glancer(0.8);
  private readonly phone: THREE.Mesh;
  private readonly phoneMat: THREE.MeshStandardMaterial;
  private readonly tasks: readonly TaskRow[];
  /** Waving at someone (waveAt): how far into it, how long, and at whom. */
  private waveAtT = -1;
  private waveFor = 1.4;
  private waveTarget: THREE.Vector3 | null = null;
  /** How fast they're really moving (measured), and the speed their legs are stepping at. */
  private ground = 0;
  private gaitSpeed = 0;
  private readonly lastPos = new THREE.Vector3();
  /** Unsticking: where they last made progress, how long since, re-paths tried, and to where. */
  private readonly progressAt = new THREE.Vector3();
  private stuckT = 0;
  private repaths = 0;
  private walkTarget: THREE.Vector3 | null = null;
  /** Per-person offset so a room of regulars never yawns in unison. */
  protected readonly offset: number;
  /** EmployeeChar's constructor poses them before this class exists: the hooks wait for this. */
  private readonly ready: boolean;

  constructor(
    readonly profile: RegularProfile,
    desk: DeskSlot,
    chair: Chair,
    private readonly office: World,
    scene: THREE.Object3D,
    seated: boolean,
    protected readonly rand: () => number,
    private readonly apps: readonly OfficeApp[],
    opts: RegularOptions = {},
  ) {
    super(deskRecord(profile), desk, chair, office, scene, seated, opts.looks ?? regularLooks(profile.id));
    this.tasks = opts.tasks ?? TASKS;
    this.offset = (hash32(profile.id) % 1000) / 41;
    this.app = apps[0];
    // A phone for calls (a bright case, so it reads at a glance), in the right hand.
    this.phoneMat = new THREE.MeshStandardMaterial({ color: PHONE_CASES[hash32(profile.id) % PHONE_CASES.length], roughness: 0.4 });
    this.phone = new THREE.Mesh(new RoundedBoxGeometry(0.075, 0.15, 0.026, 2, 0.01), this.phoneMat);
    // In the mitten, flat against the cheek, running from the ear toward the mouth when the
    // hand is up at the ear (in that pose the hand's local +Y points down-forward).
    this.phone.position.set(0.035, 0, -0.036);
    this.phone.rotation.set(-0.64, Math.PI / 2, 0);
    this.phone.visible = false;
    this.rig.handR.add(this.phone);
    this.arrived = seated;
    this.lastPhase = this.phase;
    this.lastPos.copy(this.position);
    this.progressAt.copy(this.position);
    // Walking in from the door (EmployeeChar set that walk off before this class was ready).
    if (!seated) this.walkTarget = desk.approach.clone();
    this.ready = true;
    if (seated) this.nextTask();
  }

  get name(): string {
    return this.profile.name;
  }

  /** Holds their desk: at it, on a break, or on the way to it. Not once they're off home. */
  get holdsDesk(): boolean {
    return this.phase !== 'leaving' && this.phase !== 'gone' && this.plan !== 'home' && this.plan !== 'yield';
  }

  get onBreak(): boolean {
    return this.plan === 'break' && this.phase !== 'gone';
  }

  /** Gave their desk up to a session. */
  get yielded(): boolean {
    return this.plan === 'yield';
  }

  /** Standing at their break spot (where chats happen). */
  get hanging(): boolean {
    return this.phase === 'away' && this.step === 'hang';
  }

  /** How far through the current desk task, 0..1. */
  get taskProgress(): number {
    return Math.min(1, this.taskT / this.taskFor);
  }

  /** What their monitor shows: their app at the desk, the screensaver while they're up. */
  get screen(): ScreenState {
    if (!this.arrived) return 'off';
    return this.atDesk ? 'working' : 'idle';
  }

  /** This break spot is theirs right now (the crew frees it when not). */
  usingSpot(s: BreakSpot): boolean {
    return this.plan === 'break' && this.phase !== 'gone' && (s === this.fillSpot || s === this.hangSpot);
  }

  /** Say something; `loud` lines carry farther than chatter. */
  say(text: string, seconds = 2.6, loud = false): void {
    this.quipLoud = loud;
    this.quip(text, seconds);
  }

  /**
   * Coffee or water-cooler break: up out of the chair, grab the mug, fill it at `fill` (if
   * there's one free), then stand at `hang` for about `seconds` (longer when someone stops to
   * chat) and come back.
   */
  takeBreak(fill: BreakSpot | null, hang: BreakSpot, seconds: number): boolean {
    if (this.phase !== 'seated' || this.plan) return false;
    this.setPlan('break');
    this.chatted = false;
    this.fillSpot = fill;
    this.hangSpot = hang;
    this.hangFor = seconds;
    this.leave();
    return true;
  }

  /** Keep chatting for at least `seconds` more. */
  stayFor(seconds: number): void {
    this.hangFor = Math.max(this.hangFor, this.stepT + seconds);
  }

  /** The chat's over: drift back to the desk in a moment. */
  wrapUp(seconds: number): void {
    this.hangFor = Math.min(this.hangFor, this.stepT + seconds);
  }

  /** End of their shift. `line` is said on the way out. */
  goHome(line?: string): void {
    if (!this.holdsDesk) return;
    this.setPlan('home');
    if (line) this.say(line, 2.6);
    // At the desk they stand up and grab the mug first (stoodUp); anywhere else, straight out.
    if (!this.atDesk) this.mugInHand = true;
    this.leave();
  }

  /**
   * Called back on the way out (only the receptionist, when her switch flips on again): she's
   * not off home any more, so she holds the desk again and a second Off turns her round.
   */
  override comeBack(): void {
    if (this.plan === 'home') this.plan = null;
    super.comeBack();
  }

  /**
   * A session needs this desk. At the desk: up, "All yours!" with a wave toward the door the
   * newcomer comes in by, grab the mug, off home. Anywhere else they just head home from there.
   */
  giveUp(line = 'All yours!', elsewhere = 'Oh! All yours!'): void {
    if (!this.holdsDesk) return;
    this.setPlan('yield');
    this.yieldLine = line;
    if (this.atDesk) {
      this.leave();
      return;
    }
    this.say(elsewhere, 2.6, true);
    this.mugInHand = true;
    this.leave();
  }

  /** The manager stopped by to chat (E): a line, a happy little bounce, eyes on the boss. */
  chatWith(line: string): void {
    this.say(line, 3.6);
    this.body.spring('squash').kick(1.6);
    this.body.spring('brow').kick(6);
    if (this.seated && this.task !== 'phone' && !this.mugInHand) this.wave(0.9);
  }

  /** Something funny was said. */
  laugh(): void {
    this.laughT = 0;
  }

  /** Wave at someone (their live position), looking at them, for `seconds`. */
  waveAt(who: THREE.Vector3, seconds = 1.4): void {
    this.waveTarget = who;
    this.waveFor = seconds;
    this.waveAtT = 0;
  }

  /** Waving at someone right now (waveAt). */
  get wavingAt(): boolean {
    return this.waveAtT >= 0;
  }

  /** The speed their legs are stepping at (0 sitting or standing still), for checks. */
  get gait(): number {
    if (this.phase === 'away') return this.gaitSpeed;
    return this.phase === 'entering' || this.phase === 'leaving' ? this.speed : 0;
  }

  /** How fast they're really moving across the floor (measured). */
  get groundSpeed(): number {
    return this.ground;
  }

  /** Switch to a desk task now (tests and screenshots; the regular picks their own otherwise). */
  startTask(task: DeskTask, seconds?: number): void {
    if (this.phase !== 'seated' || this.plan) return;
    if (task !== 'sip') this.mugInHand = false;
    this.nextTask(task);
    if (seconds) this.taskFor = seconds;
  }

  override bump(dir: THREE.Vector3, strength: number): void {
    this.body.shove(dir, strength);
    if (!this.quipping) {
      const lines = this.mugInHand ? BUMP_LINES_MUG : BUMP_LINES;
      this.say(lines[Math.floor(this.rand() * lines.length)], 1.8);
    }
    this.hooks.onBump?.(this);
  }

  override dispose(): void {
    this.phone.removeFromParent();
    this.phone.geometry.dispose();
    this.phoneMat.dispose();
    super.dispose();
  }

  // -------------------------------------------------------------------------------------
  // EmployeeChar extension points

  protected override stoodUp(): void {
    if (this.plan === 'yield') {
      this.setPhase('away');
      this.setStep('yield');
    } else if (this.plan === 'break' || this.plan === 'home') {
      this.setPhase('away');
      this.setStep('grab');
    } else {
      super.stoodUp();
    }
  }

  protected override seatedExtra(tt: number, dt: number): boolean {
    if (!this.ready || this.plan) return false;
    this.taskT += dt;
    if (this.phase === 'seated' && this.taskT >= this.taskFor) this.nextTask();
    if (this.task === 'phone') {
      this.phonePose(tt);
      return true;
    }
    if (this.task === 'sip') {
      this.deskSip(dt);
      return true;
    }
    if (this.night) this.yawn(tt, 0.8);
    return false;
  }

  protected override extraPose(dt: number, t: number): void {
    if (!this.ready) return;
    if (this.phase !== this.lastPhase) this.changedPhase();
    const T = this.body.target;
    const walking = this.phase === 'entering' || this.phase === 'leaving' || (this.phase === 'away' && this.step === 'walk');
    // How fast they're really going (the gait never outpaces it), and the stuck watchdog.
    const pos = this.position;
    const moved = dt > 0 ? Math.hypot(pos.x - this.lastPos.x, pos.z - this.lastPos.z) / dt : 0;
    this.ground += (Math.min(moved, 4) - this.ground) * damp(14, dt);
    this.lastPos.copy(pos);
    if (walking) this.watchProgress(dt);
    else {
      this.progressAt.copy(pos);
      this.stuckT = 0;
      this.repaths = 0;
    }
    if (walking && this.mugInHand) {
      // Mug out in front, the way the boss carries theirs.
      T.armRPitch += 0.35;
      T.armRRoll -= 0.12;
      T.elbowR += 0.95;
    }
    if (this.waveAtT >= 0) {
      // A big wave from the elbow, eyes on whoever it's for (EmployeeChar's wave looks at the
      // boss). Seated, they pop up off the seat a little to be seen over the desk.
      this.waveAtT += dt;
      const k = Math.sin(clamp(this.waveAtT / this.waveFor, 0, 1) * Math.PI);
      const O = this.body.over;
      T.armRRoll += 2.25 * k;
      T.armRPitch += 0.3 * k;
      T.armRStretch += 0.18 * k;
      T.elbowR += 0.3 * k;
      O.elbowR += Math.sin(t * 11) * 0.42 * k;
      O.armRRoll += Math.sin(t * 11 + 0.6) * 0.1 * k;
      T.brow += 0.3 * k;
      if (this.seated) T.crouch += 0.08 * k;
      if (this.waveTarget) this.body.lookAt(_head.copy(this.waveTarget).setY(this.waveTarget.y + 0.95), 1.1 * k);
      if (this.waveAtT >= this.waveFor) {
        this.waveAtT = -1;
        this.waveTarget = null;
      }
    }
    if (this.phase !== 'away' && !(this.task === 'sip' && this.atDesk)) this.body.sip = 0;
    if (!this.atDesk) this.phoneUp = false;
    if (this.rig.mug) this.rig.mug.visible = this.mugInHand;
    this.phone.visible = this.phoneUp;
  }

  protected override away(dt: number, t: number, mgrDist: number, managerHead: THREE.Vector3): void {
    const b = this.body;
    const T = b.target;
    const s = this.rig.root.scale.y;
    const tt = t + this.offset;
    this.stepT += dt;
    b.sip = 0;
    if (this.step === 'walk') {
      const arrived = this.followPath(dt);
      // Legs step no faster than they're really moving, so a stall never walks in place.
      this.gaitSpeed = Math.min(this.speed, this.ground + 0.15);
      b.locomote(dt, this.gaitSpeed, 0, s);
      if (mgrDist < 4) b.lookAt(managerHead, 0.6);
      if (arrived) this.setStep(this.fillSpot ? 'fill' : 'hang');
      return;
    }
    // Standing about: the gait winds down and the feet come together; breathing, weight shifts.
    this.speed += (0 - this.speed) * damp(12, dt);
    this.gaitSpeed = this.speed;
    b.locomote(dt, this.gaitSpeed, 0, s);
    b.idle(dt, t);
    switch (this.step) {
      case 'yield': {
        // Turn to the door the newcomer is coming in by: "All yours!", with a big wave.
        _to.copy(this.office.entrance.inside).sub(this.position);
        b.heading.setTarget(Math.atan2(_to.x, _to.z));
        if (this.stepT >= 0.12 && this.stepT - dt < 0.12) {
          this.say(this.yieldLine, 2.8, true);
          this.wave(1.3);
          b.spring('squash').kick(2.2);
        }
        T.brow += 0.4;
        if (this.stepT >= 1.35) this.setStep('grab');
        break;
      }
      case 'grab': {
        // A quick reach back to the desk for the mug.
        b.heading.setTarget(this.desk.yaw);
        const k = pulse(this.stepT, 0, 0.7);
        T.armRPitch += 1.25 * k;
        T.elbowR -= 0.1 * k;
        T.lean += 0.18 * k;
        T.headPitch += 0.2 * k;
        if (this.stepT >= 0.35) this.mugInHand = true;
        if (this.stepT < 0.7) break;
        if (this.plan === 'break' && this.hangSpot) {
          this.walkTo((this.fillSpot ?? this.hangSpot).at);
          this.setStep('walk');
        } else {
          this.leave();
        }
        break;
      }
      case 'fill': {
        // Up on tiptoes at the machine, mug under the spout, a happy bounce while it pours.
        b.heading.setTarget(this.fillSpot!.yaw);
        const k = smoothstep(this.stepT / 0.35) * (1 - smoothstep((this.stepT - 2.1) / 0.35));
        T.armRPitch += 1.6 * k;
        T.armRRoll -= 0.1 * k;
        T.elbowR += 0.3 * k;
        T.armRStretch += 0.2 * k;
        T.headPitch -= 0.3 * k;
        T.brow += 0.3 * k;
        b.over.crouch += (0.025 + Math.abs(Math.sin(tt * 6)) * 0.012) * k;
        if (this.stepT >= 2.5) {
          this.fillSpot = null;
          this.walkTo(this.hangSpot!.at);
          this.setStep('walk');
        }
        break;
      }
      case 'hang': {
        const p = this.partner;
        if (p) {
          _to.copy(p.position).sub(this.position);
          b.heading.setTarget(Math.atan2(_to.x, _to.z));
          b.lookAt(p.headWorld(_head), 0.85);
          if (this.talking) this.talk(tt);
          else this.listen(tt);
        } else {
          b.heading.setTarget(this.hangSpot!.yaw);
          this.glancer.update(dt);
          T.headYaw += this.glancer.yaw;
          T.headPitch += this.glancer.pitch;
          if (mgrDist < 4) b.lookAt(managerHead, 0.7);
          if (this.night) this.yawn(tt, 1);
        }
        this.holdMug(dt, !this.talking);
        this.laughing(dt);
        if (!p && this.stepT >= this.hangFor) {
          // Back to the desk (EmployeeChar walks them there and sits them down).
          this.hangSpot = null;
          this.setPhase('entering');
          this.walkTo(this.desk.approach);
        }
        break;
      }
    }
  }

  // -------------------------------------------------------------------------------------

  private setStep(s: Step): void {
    this.step = s;
    this.stepT = 0;
  }

  /** Every walk remembers where it's going, so a stalled one can find its way again. */
  protected override walkTo(target: THREE.Vector3): void {
    if (this.ready) {
      this.walkTarget = target.clone();
      this.progressAt.copy(this.position);
      this.stuckT = 0;
    }
    super.walkTo(target);
  }

  /** No headway for 2 s: plan the route again; after two tries on a break, go back to the desk. */
  private watchProgress(dt: number): void {
    const pos = this.position;
    if (Math.hypot(pos.x - this.progressAt.x, pos.z - this.progressAt.z) > 0.25) {
      this.progressAt.copy(pos);
      this.stuckT = 0;
      this.repaths = 0;
      return;
    }
    this.stuckT += dt;
    if (this.stuckT < 2) return;
    this.stuckT = 0;
    if (this.phase === 'away' && this.repaths >= 2) {
      this.fillSpot = this.hangSpot = null;
      this.setPhase('entering');
      this.walkTo(this.desk.approach);
    } else if (this.walkTarget) {
      this.walkTo(this.walkTarget);
    }
    this.repaths++;
  }

  /** Off somewhere: hang up the phone; anywhere but a break, the chat's over too. */
  private setPlan(p: Plan): void {
    this.plan = p;
    this.phoneUp = false;
    if (p !== 'break') this.partner = null;
  }

  private changedPhase(): void {
    this.lastPhase = this.phase;
    this.deskVersion++;
    if (this.phase === 'seated') {
      this.arrived = true;
      this.plan = null;
      this.fillSpot = this.hangSpot = null;
      // Back with a coffee (or walked in with one): drink it first.
      this.nextTask(this.mugInHand ? 'sip' : undefined);
    } else if (this.phase === 'leaving') {
      this.mugInHand = true;
    }
  }

  private nextTask(force?: DeskTask): void {
    let task = force;
    if (!task) {
      // Night owls stretch and drink more coffee.
      const w = this.tasks.map(([k, weight]) => (k === this.task ? 0 : weight * (this.night && (k === 'idle' || k === 'sip') ? 1.8 : 1)));
      let r = this.rand() * w.reduce((a, b) => a + b, 0);
      let i = 0;
      while (i < w.length - 1 && r >= w[i]) r -= w[i++];
      task = this.tasks[i][0];
    }
    const [, , lo, hi] = this.tasks.find(([k]) => k === task) ?? TASKS.find(([k]) => k === task)!;
    this.task = task;
    this.taskSerial++;
    this.taskT = 0;
    this.taskFor = lo + this.rand() * (hi - lo);
    this.sipPickup = !this.mugInHand;
    if (task === 'sip') this.sipIn = 0.8 + this.rand() * 0.6;
    this.phoneUp = false;
    const [state, kind] = BORROWED[task] ?? ['working'];
    this.setData({ ...this.data, state, activity: kind ? { kind, label: '' } : undefined, stateSince: Date.now() });
    const app = task === 'phone' && this.apps.includes('calendar') ? 'calendar' : this.apps[Math.floor(this.rand() * this.apps.length)];
    if (app !== this.app) {
      this.app = app;
      this.deskVersion++;
    }
  }

  /** On the phone: pick up, phone to the right ear with the head tilted into it, talk, listen, hang up. */
  protected phonePose(tt: number): void {
    const b = this.body;
    const T = b.target;
    const O = b.over;
    const t = this.taskT;
    const end = this.taskFor;
    const reach = pulse(t, 0, 0.55) + pulse(t, end - 0.55, end);
    const up = smoothstep((t - 0.3) / 0.45) * (1 - smoothstep((t - (end - 0.75)) / 0.45));
    this.phoneUp = t > 0.3 && t < end - 0.3;
    // Upper arm up and forward, forearm folded back so the hand reaches the side of the head.
    T.armRPitch += 0.9 * reach + 2.1 * up;
    T.armRRoll += 0.26 * up;
    T.elbowR += 1.4 * up;
    T.headRoll += 0.22 * up;
    T.lean -= 0.1 * up;
    this.handsOnDesk(T, 'L');
    if (up > 0.5) {
      if (Math.sin(tt * 0.8) > -0.15) {
        // Talking: mouth going, the free hand joining in.
        b.say(Math.sin(tt * 10.5) > -0.1 ? 'open' : 'flat', 0.1);
        O.armLRoll += Math.sin(tt * 2.1) * 0.12;
        O.elbowL += Math.max(0, Math.sin(tt * 3.3)) * 0.25;
        T.brow += 0.2;
      } else {
        // Listening: little nods.
        O.headPitch += Math.max(0, Math.sin(tt * 2.3)) * 0.12;
        T.brow -= 0.1;
      }
    }
    // A lazy swivel in the chair while they talk.
    b.heading.setTarget(this.desk.yaw + Math.sin(tt * 0.45) * 0.3 * up);
  }

  /** Coffee at the desk: pick the mug up (unless it's already in hand), sip, ahh, put it down. */
  private deskSip(dt: number): void {
    const T = this.body.target;
    const t = this.taskT;
    const end = this.taskFor;
    const reach = (this.sipPickup ? pulse(t, 0, 0.6) : 0) + pulse(t, end - 0.6, end);
    this.mugInHand = !(this.sipPickup && t < 0.3) && t < end - 0.3;
    this.handsOnDesk(T, 'L');
    T.lean -= 0.1;
    T.armRPitch += 0.55 + 0.5 * reach;
    T.elbowR += 1.15 * (1 - reach);
    T.armRRoll -= 0.15;
    this.sipCycle(dt, reach < 0.05 && this.mugInHand);
  }

  /** Mug held out in front while standing, with a sip now and then. */
  private holdMug(dt: number, allowSip: boolean): void {
    const T = this.body.target;
    T.armRPitch += 0.35;
    T.armRRoll -= 0.12;
    T.elbowR += 0.95;
    this.sipCycle(dt, allowSip);
  }

  /** Mug up to the mouth, eyes closed, back down: the boss's sip (chars/manager.ts). */
  private sipCycle(dt: number, allow: boolean): void {
    const b = this.body;
    const T = b.target;
    if (this.sipT < 0) {
      this.sipIn -= dt;
      b.sip = 0;
      if (this.sipIn > 0 || !allow) return;
      this.sipT = 0;
      this.sipIn = 2.5 + this.rand() * 3.5;
    }
    this.sipT += dt;
    const up = this.sipT < 0.35 ? this.sipT / 0.35 : this.sipT < 1.1 ? 1 : Math.max(0, 1 - (this.sipT - 1.1) / 0.35);
    T.armRPitch += up * 0.95;
    T.elbowR += up * 0.7;
    T.armRRoll -= up * 0.38;
    T.armRYaw += up * 0.3;
    T.headPitch -= up * 0.22;
    T.eyesClosed += up * 0.6;
    b.sip = up * 0.95;
    if (this.sipT > 1.5) {
      this.sipT = -1;
      // Ahh.
      b.spring('squash').kick(0.9);
    }
  }

  /** Their turn in a chat: the free (left) hand does the talking. */
  private talk(tt: number): void {
    const b = this.body;
    const T = b.target;
    const O = b.over;
    T.armLPitch += 0.6 + Math.sin(tt * 2.4) * 0.25;
    T.armLRoll += 0.2 + Math.sin(tt * 1.7 + 1) * 0.15;
    T.elbowL += 1.15 + Math.sin(tt * 3.9) * 0.3;
    O.headPitch += Math.sin(tt * 5) * 0.035;
    O.headRoll += Math.sin(tt * 1.6) * 0.06;
    T.brow += 0.35;
    b.say(Math.sin(tt * 11) > -0.25 ? 'open' : 'smile', 0.1);
  }

  /** Listening: nods, head tilted. */
  private listen(tt: number): void {
    const T = this.body.target;
    this.body.over.headPitch += Math.max(0, Math.sin(tt * 2.5)) * 0.13;
    T.headRoll += 0.09;
    T.brow += 0.12;
  }

  private laughing(dt: number): void {
    if (this.laughT < 0) return;
    this.laughT += dt;
    const k = pulse(this.laughT, 0, 0.9);
    const T = this.body.target;
    const O = this.body.over;
    T.headPitch -= 0.25 * k;
    T.eyesClosed += 0.85 * k;
    T.lean -= 0.08 * k;
    O.squash += Math.abs(Math.sin(this.laughT * 14)) * 0.05 * k;
    O.crouch += Math.abs(Math.sin(this.laughT * 14)) * 0.012 * k;
    if (k > 0.2) this.body.say('open', 0.1);
    if (this.laughT > 0.9) this.laughT = -1;
  }

  /** A big night-owl yawn every 20-odd seconds. */
  private yawn(tt: number, amount: number): void {
    const k = pulse((tt + this.offset) % 23, 0, 2.4) * amount;
    if (k <= 0) return;
    const T = this.body.target;
    T.headPitch -= 0.3 * k;
    T.eyesClosed += 0.85 * k;
    T.squash += 0.04 * k;
    if (k > 0.35) this.body.say('open', 0.1);
  }
}
