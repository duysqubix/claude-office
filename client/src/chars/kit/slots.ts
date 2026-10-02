// Where a built Rig keeps each part's procedural visuals, and where the kit part goes.
//
// The Rig exposes its joints but not the meshes built on them, so this finds them from the
// rig's structure (see Rig's constructor) and checks each assumption. Parts it can't find
// are left out, so they simply stay procedural; a changed rig never breaks the kit.
import type * as THREE from 'three';
import type { MouthShape, Rig, Side } from '../rig';

/** A kit part goes into `holder`; `procedural` is what it replaces (hidden, not removed). */
export interface Slot {
  holder: THREE.Object3D;
  procedural: THREE.Object3D[];
}

export type SlotName =
  | 'head'
  | 'eyeL'
  | 'eyeR'
  | 'browL'
  | 'browR'
  | 'smile'
  | 'open'
  | 'flat'
  | 'hair'
  | 'glasses'
  | 'face'
  | 'torso'
  | 'chest'
  | 'tie'
  | 'lanyard'
  | 'upperL'
  | 'upperR'
  | 'foreL'
  | 'foreR'
  | 'handL'
  | 'handR'
  | 'thighL'
  | 'thighR'
  | 'shinL'
  | 'shinR'
  | 'shoeL'
  | 'shoeR'
  | 'mug'
  | 'laptop';

export type Slots = Partial<Record<SlotName, Slot>>;

const SHAPES: MouthShape[] = ['smile', 'open', 'flat'];

/**
 * The mouth groups, found by flipping through the shapes with setMouth: each group is
 * visible for exactly its own shape. Leaves the shape that was showing.
 */
function probeMouths(rig: Rig): Partial<Record<MouthShape, THREE.Object3D>> {
  const kids = rig.head.children;
  const before = kids.map((c) => c.visible);
  const seen = {} as Record<MouthShape, boolean[]>;
  for (const s of [...SHAPES].reverse()) {
    rig.setMouth(s);
    seen[s] = kids.map((c) => c.visible);
  }
  const out: Partial<Record<MouthShape, THREE.Object3D>> = {};
  for (const s of SHAPES) {
    const i = kids.findIndex((_, k) => seen[s][k] && SHAPES.every((o) => o === s || !seen[o][k]));
    if (i >= 0) out[s] = kids[i];
  }
  const showing = SHAPES.find((s) => out[s] && before[kids.indexOf(out[s]!)]);
  rig.setMouth(showing ?? 'smile');
  return out;
}

/**
 * The private stretch groups (upper arm, forearm) of one arm, found by stretching it to a
 * marker value with setArmStretch; every touched transform is put back.
 */
function probeStretch(rig: Rig, side: Side): { upper: THREE.Object3D | null; lower: THREE.Object3D | null } {
  const [arm, elbow, hand] = side === 1 ? [rig.armL, rig.elbowL, rig.handL] : [rig.armR, rig.elbowR, rig.handR];
  const touched = [...arm.children, ...elbow.children];
  const saved = touched.map((o) => [o.scale.clone(), o.position.clone()] as const);
  const MARK = 1.2345;
  rig.setArmStretch(side, MARK);
  const marked = (o: THREE.Object3D) => Math.abs(o.scale.y - MARK) < 1e-6;
  const upper = arm.children.filter((c) => c !== elbow && marked(c));
  const lower = elbow.children.filter((c) => c !== hand && marked(c));
  touched.forEach((o, i) => {
    o.scale.copy(saved[i][0]);
    o.position.copy(saved[i][1]);
  });
  return { upper: upper.length === 1 ? upper[0] : null, lower: lower.length === 1 ? lower[0] : null };
}

/** Everything inside `holder` (for joint-owned groups like the mug, where the group itself must stay visible). */
const contents = (holder: THREE.Object3D): Slot => ({ holder, procedural: [...holder.children] });

/**
 * The part Rig built on `joint`: its first child. Rig adds each part before any child joint,
 * and game code can only attach props later (a regular's phone on the right hand), so build
 * order finds the part however many props hang there. Null if a joint comes first instead.
 */
function built(joint: THREE.Object3D, ...joints: (THREE.Object3D | null)[]): THREE.Object3D | null {
  const c = joint.children[0];
  return c && !joints.includes(c) ? c : null;
}

/** Slots of a built rig, read against the looks it was built from. */
export function findSlots(rig: Rig): Slots {
  const s: Slots = {};
  const { head, looks } = rig;

  // Face: eyes and brows keep their joints (blink, look, raise, worry); only the meshes change.
  s.eyeL = contents(rig.eyeL);
  s.eyeR = contents(rig.eyeR);
  s.browL = contents(rig.browL);
  s.browR = contents(rig.browR);
  const mouths = probeMouths(rig);
  for (const shape of SHAPES) {
    const g = mouths[shape];
    if (g) s[shape] = contents(g);
  }

  // Head children, in build order: shell, eyes, brow holders, cheeks, hair, glasses?, mouths.
  const cheeks = head.children.filter((c) => (c as THREE.Mesh).isMesh && c.userData.fadeOrder === 4);
  const shell = built(head, rig.eyes, rig.hair, rig.browL.parent, rig.browR.parent, ...cheeks, ...Object.values(mouths));
  if ((shell as THREE.Mesh | null)?.isMesh) s.head = { holder: head, procedural: [shell!, ...cheeks] };
  const hairAt = head.children.indexOf(rig.hair);
  const glasses = hairAt >= 0 ? head.children[hairAt + 1] : undefined;
  if (looks.glasses && glasses && !Object.values(mouths).includes(glasses)) s.glasses = { holder: head, procedural: [glasses] };
  // Facial hair is new: nothing procedural to hide.
  s.face = { holder: head, procedural: [] };

  // Hair and hat share the hair joint (it squashes and tilts with the hair springs).
  s.hair = contents(rig.hair);

  // Spine: the lower bean on the torso joint, the upper bean on the chest joint; the tie, then
  // the lanyard, follow the arms on the chest.
  const lower = built(rig.torso, rig.chest);
  if (lower) s.torso = { holder: rig.torso, procedural: [lower] };
  const chestShell = built(rig.chest, rig.neck, rig.armL, rig.armR);
  if (chestShell) s.chest = { holder: rig.chest, procedural: [chestShell] };
  const afterArms = rig.chest.children.indexOf(rig.armR) + 1;
  if (afterArms > 0) {
    const tie = looks.tie ? rig.chest.children[afterArms] : undefined;
    const lanyard = looks.lanyard ? rig.chest.children[afterArms + Number(looks.tie)] : undefined;
    if (tie) s.tie = { holder: rig.chest, procedural: [tie] };
    if (lanyard) s.lanyard = { holder: rig.chest, procedural: [lanyard] };
  }

  // Limbs.
  for (const side of [1, -1] as const) {
    const L = side === 1;
    const { upper, lower: fore } = probeStretch(rig, side);
    if (upper) s[L ? 'upperL' : 'upperR'] = contents(upper);
    if (fore) s[L ? 'foreL' : 'foreR'] = contents(fore);
    const hand = L ? rig.handL : rig.handR;
    const mitten = built(hand, rig.mug);
    if (mitten) s[L ? 'handL' : 'handR'] = { holder: hand, procedural: [mitten] };
    const [leg, knee, foot] = L ? [rig.legL, rig.kneeL, rig.footL] : [rig.legR, rig.kneeR, rig.footR];
    const thigh = built(leg, knee);
    if (thigh) s[L ? 'thighL' : 'thighR'] = { holder: leg, procedural: [thigh] };
    const shin = built(knee, foot);
    if (shin) s[L ? 'shinL' : 'shinR'] = { holder: knee, procedural: [shin] };
    const shoe = built(foot);
    if (shoe) s[L ? 'shoeL' : 'shoeR'] = { holder: foot, procedural: [shoe] };
  }

  // Held items: the rig moves these groups (the mug stays upright), so keep them and swap their contents.
  if (rig.mug) s.mug = contents(rig.mug);
  if (rig.laptop) s.laptop = contents(rig.laptop);
  return s;
}
