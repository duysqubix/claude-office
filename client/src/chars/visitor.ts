// Someone out in the yard on their break (#48). They come in by the garden gate, lounge on a
// bench, a lounger, the hammock, the picnic blanket or the pond's edge, stroll the trail
// (sometimes side by side, chatting), stand about with a stretch, a coffee, a call or a book,
// and leave by the gate again. They're regulars without a desk (chars/npc.ts): the yard crew
// (chars/yardfolk.ts) decides what they do next and with whom. Walking, sitting down and
// getting up, quips, waves, the crowd (#30) and daydreams all come with RegularChar; a seat is
// a stand-in desk, like the front desk's.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { DeskSlot, World } from '../world/types';
import { angleDelta, clamp, damp, smoothstep } from './spring';
import { Chair } from './employee';
import { kitBackDepth } from './kit';
import { RegularChar, pulse, type RegularProfile } from './npc';
import { DIM } from './rig';

/** How they sit: on a seat, lying back, or cross-legged on the ground. */
export type SeatPose = 'sit' | 'lie' | 'ground';

/** A seat in the yard (world.yard), as somewhere a visitor can sit. */
export interface YardSeatSpot {
  kind: string;
  pose: SeatPose;
  /** Seats that belong together (the picnic table, one bench): neighbours chat. */
  group?: string;
  /** Under the string lights (the night owls only sit here). */
  lit?: boolean;
  slot: DeskSlot;
  chair: Chair;
  /** The hammock's bed, and the seat point in its space: whoever lies in it rides along. */
  carrier?: { bed: THREE.Object3D; local: THREE.Vector3 };
  by: YardVisitor | null;
}

/** Somewhere to stand about in the yard. */
export interface YardStandSpot {
  at: THREE.Vector3;
  yaw: number;
  group?: string;
  lit?: boolean;
  by: RegularChar | null;
}

/** On their feet at a stand. */
export type StandTask = 'stretch' | 'sip' | 'phone' | 'read' | 'look';
/** Sitting or lying down. */
type SeatTask = 'relax' | 'read' | 'phone' | 'sip' | 'doze';

export type YardActivity =
  | { kind: 'seat'; seat: YardSeatSpot; seconds: number }
  | { kind: 'stand'; stand: YardStandSpot; task: StandTask; seconds: number }
  | { kind: 'stroll'; trail: readonly THREE.Vector3[]; from: number; dir: 1 | -1; points: number };

const BOOK_COVERS = ['#E94F37', '#3F88C5', '#44BBA4', '#F6AE2D', '#8E5572', '#393E41'];
/**
 * Lying down, the body goes flat (legs out along the seat) and the back bends up from the hips:
 * up the lounger's raised back, a little sag in the hammock (radians of torso lean).
 */
const RECLINE_LOUNGER = 0.8;
const RECLINE_FLAT = 0.3;
/** Sitting up, EmployeeChar has the pelvis this far above the seat point and this far forward of it (SEAT_LIFT, SEAT_FORWARD); lying down it's right on it. */
const SEAT_LIFT = 0.13;
const SEAT_FORWARD = 0.13;
/** How many trail points ahead a stroller aims for (the trail's points are about 1 m apart). */
const STRIDE = 2;

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();


/** A yard seat as a stand-in desk (never one of the office's: no screen, no nameplate). */
export function seatSlot(index: number, position: THREE.Vector3, yaw: number, approach: THREE.Vector3): { slot: DeskSlot; chair: Chair } {
  const stand = new THREE.Object3D();
  stand.position.copy(position).setY(0);
  stand.rotation.y = yaw + Math.PI;
  const slot: DeskSlot = {
    index,
    seat: position,
    yaw,
    approach,
    internSpots: [],
    chair: stand,
    screen: new THREE.Object3D(),
    setScreen() {},
    setNameplate() {},
    accent: '#7BD389',
  };
  return { slot, chair: new Chair(slot) };
}

export class YardVisitor extends RegularChar {
  /** What they're doing now. */
  activity: YardActivity | null = null;
  /** Their activity has run its course: the crew gives them the next one. */
  done = false;
  /** Walking side by side with (strolls), or chatting with from the next seat or stand. */
  buddy: YardVisitor | null = null;
  /** What's next once they're up out of their seat. */
  private pending: YardActivity | null = null;
  /** Lying down: sit up first, then this (standing up for the next thing, or home). */
  private afterSittingUp: (() => void) | null = null;
  /** Seconds into the current activity. */
  private actT = 0;
  private seatTask: SeatTask = 'relax';
  private seatTaskT = 0;
  private seatTaskFor = 8;
  /** 0 sitting up → 1 lying back (eased). */
  private lieK = 0;
  /** Lying back counts as asleep to EmployeeChar (no look up at the boss: a gaze assumes an upright body). */
  private lyingState = false;
  private blobHidden = false;
  private recline = RECLINE_LOUNGER;
  /** Strolling: where they are on the trail and how many points are left. */
  private trailAt = 0;
  private trailLeft = 0;
  /** Barely moving on a stroll (someone on the trail ahead, a bush in the way): how long. */
  private slowT = 0;
  /** Fading in at the gate in the 'away' phase (EmployeeChar only fades walking in to sit down). */
  private fadeIn = -1;
  private readonly book: THREE.Mesh;
  private readonly bookMat: THREE.MeshStandardMaterial;

  constructor(
    profile: RegularProfile,
    first: { slot: DeskSlot; chair: Chair },
    private readonly yard: World,
    scene: THREE.Object3D,
    seated: boolean,
    rand: () => number,
    /** The garden gate's far side: where they come in and go home. */
    private readonly gate: THREE.Vector3,
  ) {
    super(profile, first.slot, first.chair, yard, scene, seated, rand, ['doc']);
    this.bookMat = new THREE.MeshStandardMaterial({ color: BOOK_COVERS[Math.floor(rand() * BOOK_COVERS.length)], roughness: 0.6 });
    this.book = new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.17, 0.035, 2, 0.008), this.bookMat);
    // Open in front of them, held from below by the right mitten.
    this.book.position.set(0.04, -0.06, 0.05);
    this.book.rotation.set(-1.2, 0, 0.25);
    this.book.visible = false;
    this.rig.handR.add(this.book);
  }

  /** Here from page load: already doing `a` (seated at its seat, standing at its spot, or on the trail). */
  startAt(a: YardActivity): void {
    if (a.kind === 'seat') {
      // Built seated at this seat already.
      this.activity = a;
      a.seat.by = this;
      this.setPlan('yard');
      this.recline = a.seat.kind === 'hammock' ? RECLINE_FLAT : RECLINE_LOUNGER;
      if (a.seat.pose === 'lie') this.lieK = 1;
      this.nextSeatTask(a.seat.pose);
      return;
    }
    this.position.copy(a.kind === 'stand' ? a.stand.at : a.trail[a.from]).setY(0);
    if (a.kind === 'stand') this.body.heading.snap(a.stand.yaw);
    this.begin(a);
  }

  /** Walking in by the gate to do `a`. */
  arriveByGate(a: YardActivity): void {
    this.position.copy(this.gate).setY(0);
    this.begin(a);
    // Walking to a seat, EmployeeChar fades them in; anywhere else, this class does.
    if (a.kind !== 'seat') this.fadeIn = 0;
  }

  /** On to the next thing (the crew only asks once they're `done`). */
  go(a: YardActivity): void {
    this.done = false;
    this.actT = 0;
    // Theirs from now on, even while they're still getting up (nobody else gets sent there).
    if (a.kind === 'seat') a.seat.by = this;
    if (a.kind === 'stand') a.stand.by = this;
    if (this.atDesk) {
      if (this.phase === 'standing-up') {
        this.pending = a;
        return;
      }
      this.upFirst(() => {
        this.pending = a;
        this.release();
        this.leave();
      });
      return;
    }
    this.release();
    this.begin(a);
  }

  /** Off home by the gate, from wherever they are. */
  goHomeByGate(): void {
    this.upFirst(() => {
      this.release();
      this.activity = this.pending = null;
      this.setPlan('home');
      this.leave();
    });
  }

  /** At a seat or a stand (where chats happen), not walking anywhere. */
  get settled(): boolean {
    return (this.seated && this.activity?.kind === 'seat') || (this.phase === 'away' && this.step === 'stand' && this.activity?.kind === 'stand');
  }

  /** Always: they're out in the yard (garden daydreams, ui/thoughts.ts). */
  override get outdoors(): boolean {
    return true;
  }

  /** Standing about at their spot (labels let them daydream there, as at the water cooler). */
  override get hanging(): boolean {
    return this.phase === 'away' && this.step === 'stand' && this.activity?.kind === 'stand';
  }

  /** Strolling the trail (and at which point of it). */
  get strolling(): boolean {
    return this.phase === 'away' && this.step === 'stroll';
  }

  get trailIndex(): number {
    return this.trailAt;
  }

  /** Lying back right now (0..1). */
  get lying(): number {
    return this.lieK;
  }

  /** How faded in they are (0 at the gate before they fade in, or once they've faded out). */
  get shown(): number {
    return this.opacity;
  }

  /**
   * After update(): someone lying back has their bubble over their head, not past it along the
   * body (EmployeeChar's label anchor follows the head in the body's own up).
   */
  fixLabel(): void {
    if (this.lieK < 0.02) return;
    this.headWorld(_v);
    _v.y += DIM.headR + 0.3;
    this.rig.root.worldToLocal(_v);
    this.labelAnchor.position.copy(_v);
  }

  override dispose(): void {
    this.release();
    this.book.removeFromParent();
    this.book.geometry.dispose();
    this.bookMat.dispose();
    super.dispose();
  }

  // -------------------------------------------------------------------------------------

  private begin(a: YardActivity): void {
    this.activity = a;
    this.pending = null;
    this.actT = 0;
    this.done = false;
    this.setPlan('yard');
    if (a.kind === 'seat') {
      a.seat.by = this;
      this.desk = a.seat.slot;
      this.chair = a.seat.chair;
      this.recline = a.seat.kind === 'hammock' ? RECLINE_FLAT : RECLINE_LOUNGER;
      this.nextSeatTask(a.seat.pose);
      this.setPhase('entering');
      this.walkTo(a.seat.slot.approach);
      return;
    }
    this.setPhase('away');
    if (a.kind === 'stand') {
      a.stand.by = this;
      this.setStep('walk');
      this.walkTo(a.stand.at);
      return;
    }
    this.trailAt = a.from;
    this.trailLeft = a.points;
    this.setStep('stroll');
    this.walkTo(a.trail[this.trailAt]);
  }

  /** Lying down: sit up, then `then`; otherwise straight away. */
  private upFirst(then: () => void): void {
    if (this.lieK > 0.02 && this.seated) this.afterSittingUp = then;
    else then();
  }

  /** Give back the seat or stand they're using (the crew hands it out again). */
  private release(): void {
    const a = this.activity;
    if (a?.kind === 'seat' && a.seat.by === this) a.seat.by = null;
    if (a?.kind === 'stand' && a.stand.by === this) a.stand.by = null;
    if (this.buddy?.buddy === this) this.buddy.buddy = null;
    this.buddy = null;
    this.talking = false;
  }

  // -------------------------------------------------------------------------------------
  // RegularChar's hooks

  protected override walkTo(target: THREE.Vector3): void {
    // EmployeeChar sends everyone going home to the front door; visitors use the gate. (Its
    // constructor walks before this class has its fields: that first walk is redone anyway.)
    const w = this.yard as World | undefined;
    super.walkTo(w && target === w.entrance.outside ? this.gate : target);
  }

  protected override stoodUp(): void {
    this.setPhase('away');
    if (this.plan === 'home') {
      this.leave();
      return;
    }
    const next = this.pending;
    if (next) {
      this.begin(next);
      return;
    }
    // Nothing lined up yet: stand about here until the crew decides.
    this.activity = null;
    this.done = true;
    this.setStep('stand');
  }

  protected override stuckWalking(): boolean {
    // Can't get to their seat: give it back and let the crew think of something else.
    if (this.phase !== 'entering' || this.activity?.kind !== 'seat') return false;
    this.release();
    this.activity = null;
    this.done = true;
    this.setPhase('away');
    this.setStep('stand');
    return true;
  }

  protected override stuckAway(): void {
    // Can't get there: give the spot back and let the crew think of something else.
    this.release();
    this.activity = null;
    this.done = true;
    this.setStep('stand');
  }

  protected override seatedExtra(tt: number, dt: number): boolean {
    const a = this.activity;
    if (a?.kind !== 'seat') return super.seatedExtra(tt, dt);
    const pose = a.seat.pose;
    this.actT += dt;
    if (this.actT >= a.seconds) this.done = true;
    this.seatTaskT += dt;
    if (this.seatTaskT >= this.seatTaskFor) this.nextSeatTask(pose);
    const b = this.body;
    const T = b.target;
    if (pose === 'lie') this.liePose(tt);
    else if (pose === 'ground') this.groundPose(tt);
    else this.benchPose(tt);
    // Sitting up again (to get up): nothing in the hands.
    const task = this.afterSittingUp ? 'relax' : this.seatTask;
    this.task = task === 'sip' ? 'sip' : task === 'phone' ? 'phone' : task === 'read' ? 'read' : 'idle';
    switch (task) {
      case 'read':
        this.readPose(pose === 'lie' ? smoothstep(this.lieK) : 0, tt);
        break;
      case 'phone':
        this.phoneArm(1, tt);
        break;
      case 'sip':
        this.mugInHand = true;
        this.holdMug(dt, !this.talking);
        break;
      case 'doze':
        T.eyesClosed += 0.9;
        b.over.squash += Math.sin(tt * 1.1) * 0.02;
        break;
      case 'relax':
        this.glancer.update(dt);
        T.headYaw += this.glancer.yaw;
        T.headPitch += this.glancer.pitch - 0.1;
        break;
    }
    if (task !== 'sip') this.mugInHand = false;
    // A chat with the person on the next seat: heads turned to each other, taking turns.
    const p = this.buddy;
    if (p?.settled) {
      if (this.lieK < 0.05) b.lookAt(p.headWorld(_v), 0.8);
      else {
        // Lying back: just the head turned their way (a gaze assumes an upright body).
        _v.copy(p.position).sub(this.position);
        T.headYaw += clamp(angleDelta(b.heading.value, Math.atan2(_v.x, _v.z)), -1.1, 1.1) * 0.7;
      }
      if (this.talking) this.talk(tt);
      else this.listen(tt);
    }
    this.laughing(dt);
    if (this.night) this.yawn(tt, 0.8);
    return true;
  }

  protected override away(dt: number, t: number, mgrDist: number, managerHead: THREE.Vector3): void {
    if (this.plan !== 'yard') {
      super.away(dt, t, mgrDist, managerHead);
      return;
    }
    const b = this.body;
    const T = b.target;
    const s = this.rig.root.scale.y;
    const tt = t + this.offset;
    this.stepT += dt;
    b.sip = 0;
    const a = this.activity;
    if (this.step === 'walk' || this.step === 'stroll') {
      const arrived = this.followPath(dt);
      // Legs step no faster than they're really moving (#33).
      this.gaitSpeed = Math.min(this.speed, this.ground + 0.15);
      b.locomote(dt, this.gaitSpeed, 0, s);
      const p = this.buddy;
      if (this.step === 'stroll' && p?.strolling) {
        // Side by side: chatting on the move, heads turned to each other.
        b.lookAt(p.headWorld(_v), 0.55);
        if (this.talking) this.talk(tt);
      } else if (mgrDist < 4) {
        b.lookAt(managerHead, 0.6);
      }
      // A point of the trail they can't get to: on to the one after.
      this.slowT = this.ground < 0.15 ? this.slowT + dt : 0;
      const skip = this.step === 'stroll' && this.slowT > 1.6;
      if (!arrived && !skip) return;
      this.slowT = 0;
      if (this.step === 'walk') {
        this.setStep('stand');
        return;
      }
      // On round the trail, a couple of points at a time.
      if (a?.kind === 'stroll' && this.trailLeft > 0) {
        const n = a.trail.length;
        const k = Math.min(STRIDE, this.trailLeft);
        this.trailLeft -= k;
        this.trailAt = (((this.trailAt + a.dir * k) % n) + n) % n;
        this.walkTo(a.trail[this.trailAt]);
      } else {
        this.done = true;
        this.setStep('stand');
      }
      return;
    }
    // Standing about.
    this.speed += (0 - this.speed) * damp(12, dt);
    this.gaitSpeed = this.speed;
    b.locomote(dt, this.gaitSpeed, 0, s);
    b.idle(dt, t);
    this.actT += dt;
    if (a?.kind === 'stand') {
      if (this.actT >= a.seconds) this.done = true;
      const p = this.buddy;
      if (p?.settled) {
        _v.copy(p.position).sub(this.position);
        b.heading.setTarget(Math.atan2(_v.x, _v.z));
        b.lookAt(p.headWorld(_w), 0.85);
        if (this.talking) this.talk(tt);
        else this.listen(tt);
      } else {
        b.heading.setTarget(a.stand.yaw);
      }
      this.standTask(a.task, dt, tt);
    } else {
      // Between things: a look around.
      this.done = true;
      this.glancer.update(dt);
      T.headYaw += this.glancer.yaw;
      T.headPitch += this.glancer.pitch;
      this.mugInHand = false;
    }
    this.laughing(dt);
    if (this.night) this.yawn(tt, 1);
  }

  protected override extraPose(dt: number, t: number): void {
    super.extraPose(dt, t);
    const a = this.activity;
    const lieHere = a?.kind === 'seat' && a.seat.pose === 'lie' && this.phase === 'seated' && !this.afterSittingUp;
    this.lieK += ((lieHere ? 1 : 0) - this.lieK) * damp(lieHere ? 2.4 : 4, dt);
    const root = this.rig.root;
    if (this.lieK > 1e-3 && this.phase === 'seated' && a?.kind === 'seat') {
      // Lying back: the whole body tips back flat round the pelvis, which settles onto the seat
      // point (in the hammock, on its swinging bed). EmployeeChar has just sat them upright.
      root.rotation.order = 'YXZ';
      const k = smoothstep(this.lieK);
      const pitch = (Math.PI / 2) * k;
      root.rotation.x = -pitch;
      const L = DIM.pelvisY * root.scale.y;
      const yaw = this.body.heading.value;
      if (a.seat.carrier) {
        // Ride the hammock: its seat point in its own space, back out to the world.
        const { bed, local } = a.seat.carrier;
        bed.updateWorldMatrix(true, false);
        _v.copy(local).applyMatrix4(bed.matrixWorld).sub(a.seat.slot.seat);
        root.position.add(_v);
      }
      root.position.x += Math.sin(yaw) * (L * Math.sin(pitch) - SEAT_FORWARD * k);
      root.position.z += Math.cos(yaw) * (L * Math.sin(pitch) - SEAT_FORWARD * k);
      root.position.y += L * (1 - Math.cos(pitch)) - SEAT_LIFT * root.scale.y * k;
    } else if (root.rotation.x !== 0) {
      root.rotation.x = 0;
    }
    // The floor blob would stand up behind someone lying down (the sun's shadow still draws theirs).
    const hide = this.lieK >= 0.05;
    if (hide !== this.blobHidden) {
      this.blobHidden = hide;
      this.rig.shadow.visible = !hide;
    }
    const asleep = this.lieK > 0.3 && this.phase === 'seated';
    if (asleep !== this.lyingState) {
      this.lyingState = asleep;
      this.setData({ ...this.data, state: asleep ? 'sleeping' : 'idle', activity: undefined, stateSince: Date.now() });
    }
    // Sat up: now they can get up.
    if (this.afterSittingUp && this.lieK < 0.02) {
      const then = this.afterSittingUp;
      this.afterSittingUp = null;
      then();
    }
    const reading = (this.phase === 'seated' && a?.kind === 'seat' && this.seatTask === 'read' && !this.afterSittingUp) || (this.step === 'stand' && this.phase === 'away' && a?.kind === 'stand' && a.task === 'read');
    this.book.visible = reading;
    // Standing on the phone (RegularChar only shows the phone at a desk).
    if (this.phase === 'away' && this.step === 'stand' && a?.kind === 'stand' && a.task === 'phone' && this.actT > 0.4) this.phone.visible = true;
    if (this.fadeIn >= 0) {
      this.fadeIn = Math.min(1, this.fadeIn + dt / 0.6);
      this.opacity = this.fadeIn;
      if (this.fadeIn >= 1) this.fadeIn = -1;
    }
  }

  // -------------------------------------------------------------------------------------
  // Poses

  private nextSeatTask(pose: SeatPose): void {
    // Lying down is for dozing and reading; sitting up, for anything.
    const tasks: readonly SeatTask[] = pose === 'lie' ? ['doze', 'doze', 'read', 'relax', 'phone'] : ['relax', 'relax', 'read', 'sip', 'phone'];
    let task = tasks[Math.floor(this.rand() * tasks.length)];
    if (this.night && task === 'phone') task = 'relax';
    this.seatTask = task;
    this.seatTaskT = 0;
    this.seatTaskFor = 7 + this.rand() * 12;
  }

  /** On a bench or at the picnic table: leaning back, hands in the lap, feet out a little. */
  private benchPose(tt: number): void {
    const T = this.body.target;
    T.lean -= 0.16;
    T.armLPitch += 0.45;
    T.armRPitch += 0.45;
    T.elbowL += 0.7;
    T.elbowR += 0.7;
    T.armLRoll -= 0.05;
    T.armRRoll -= 0.05;
    T.kneeL -= 0.35;
    T.kneeR -= 0.35;
    this.body.over.squash += Math.sin(tt * 1.4) * 0.01;
  }

  /** Cross-legged on the blanket or the stones by the pond, leaning back on their hands. */
  private groundPose(tt: number): void {
    const T = this.body.target;
    T.legLPitch += 0.15;
    T.legRPitch += 0.15;
    T.legLRoll += 0.85;
    T.legRRoll += 0.85;
    T.kneeL += 0.95;
    T.kneeR += 0.95;
    T.lean -= 0.22;
    T.armLPitch -= 0.55;
    T.armRPitch -= 0.55;
    T.armLRoll += 0.25;
    T.armRRoll += 0.25;
    this.body.over.side += Math.sin(tt * 0.6) * 0.03;
  }

  /** Lying back: legs out straight, arms folded behind the head, the odd toe wiggle. */
  private liePose(tt: number): void {
    const T = this.body.target;
    const k = smoothstep(this.lieK);
    // A big hairdo (or a backwards cap) props the head up off the seat (the kit measures how
    // far whatever they're wearing reaches behind the skull).
    T.headPitch += clamp(kitBackDepth(this.rig) * 2.5, 0, 0.55) * k;
    // Legs out along the seat (undoing EmployeeChar's bent sitting legs), knees soft.
    T.legLPitch -= 1.4 * k;
    T.legRPitch -= 1.4 * k;
    T.kneeL -= 1.25 * k;
    T.kneeR -= 1.25 * k;
    // Back up the lounger's raised back; in the hammock, a gentle sag.
    T.lean += this.recline * k;
    T.headPitch += 0.25 * k;
    T.armLPitch += 2.5 * k;
    T.armRPitch += 2.5 * k;
    T.armLRoll += 0.55 * k;
    T.armRRoll += 0.55 * k;
    T.elbowL += 2.1 * k;
    T.elbowR += 2.1 * k;
    this.body.over.kneeL += Math.max(0, Math.sin(tt * 0.7)) ** 6 * 0.25 * k;
  }

  /** A book in front of them (held up over their face, lying down): a page turn now and then. */
  private readPose(lying: number, tt: number): void {
    const T = this.body.target;
    // Lying down, the arms come off the back of the head to hold the book up.
    T.armLPitch += 0.95 - 2.2 * lying;
    T.armRPitch += 0.95 - 2.2 * lying;
    T.elbowL += 1.3 - 1.9 * lying;
    T.elbowR += 1.3 - 1.9 * lying;
    T.armLRoll -= 0.2;
    T.armRRoll -= 0.2;
    T.armLYaw += 0.3;
    T.armRYaw += 0.3;
    T.headPitch += 0.35 * (1 - lying);
    const flip = pulse((tt + this.offset) % 9, 0, 0.6);
    T.armLRoll += 0.35 * flip;
    T.elbowL -= 0.3 * flip;
  }

  /** The phone up at the right ear (k: how far up), mouth going while they talk. */
  private phoneArm(k: number, tt: number): void {
    const b = this.body;
    const T = b.target;
    this.phoneUp = k > 0.6;
    T.armRPitch += 2.6 * k;
    T.armRRoll += 0.26 * k;
    T.elbowR += 1.5 * k;
    T.headRoll += 0.2 * k;
    if (k > 0.6 && Math.sin(tt * 0.8) > -0.15) {
      b.say(Math.sin(tt * 10.5) > -0.1 ? 'open' : 'flat', 0.1);
      b.over.armLRoll += Math.sin(tt * 2.1) * 0.12;
    }
  }

  /** At a stand: what they're up to. */
  private standTask(task: StandTask, dt: number, tt: number): void {
    const b = this.body;
    const T = b.target;
    const t = this.actT;
    if (task !== 'sip') this.mugInHand = false;
    switch (task) {
      case 'stretch': {
        // Arms right up and a lean back, then a twist each way, on a loop.
        const up = pulse(t % 7, 0.2, 3.2);
        T.armLRoll += 2.3 * up;
        T.armRRoll += 2.3 * up;
        T.armLPitch += 0.3 * up;
        T.armRPitch += 0.3 * up;
        T.armLStretch += 0.25 * up;
        T.armRStretch += 0.25 * up;
        T.lean -= 0.25 * up;
        T.headPitch -= 0.3 * up;
        T.eyesClosed += 0.8 * up;
        if (up > 0.6) b.say('open', 0.1);
        const twist = pulse(t % 7, 3.4, 6.4);
        T.twist += Math.sin((t % 7) * 2.1) * 0.35 * twist;
        T.armLPitch += 0.6 * twist;
        T.armRPitch += 0.6 * twist;
        T.elbowL += 1.2 * twist;
        T.elbowR += 1.2 * twist;
        break;
      }
      case 'sip':
        this.mugInHand = true;
        this.holdMug(dt, !this.talking);
        break;
      case 'phone':
        this.phoneArm(smoothstep((t - 0.1) / 0.45), tt);
        break;
      case 'read':
        this.readPose(0, tt);
        T.lean += 0.05;
        break;
      case 'look':
        this.glancer.update(dt);
        T.headYaw += this.glancer.yaw * 1.4;
        T.headPitch += this.glancer.pitch - 0.15;
        T.armLPitch -= 0.3;
        T.armRPitch -= 0.3;
        T.armLRoll -= 0.15;
        T.armRRoll -= 0.15;
        break;
    }
  }
}
