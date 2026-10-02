// The character kit (docs/MODEL-WIRING.md, "Characters"): dress a procedural Rig in the
// Blender kit's GLB parts.
//
// The rig keeps every joint, spring and pose; only what hangs on the joints changes. Each
// procedural part is hidden (not removed, so Rig.dispose still frees it) and its kit part is
// parented to the same joint object, so walking, sitting, typing, blinking, mouth shapes,
// hair jiggle and fading all keep working. A part whose GLB is missing or fails to load
// stays procedural.
//
//   const rig = new Rig(looks);
//   dressRig(rig);         // wears the kit when KIT_ENABLED, otherwise does nothing
//   await applyKit(rig);   // wears it regardless (previews)
import * as THREE from 'three';
import { model } from '../../models';
import type { Looks } from '../looks';
import type { Rig } from '../rig';
import RD from '../rig-dimensions.json';
import { planKit, type KitPlan } from './plan';
import { findSlots, type SlotName } from './slots';

export { planKit, type KitPlan } from './plan';

// ---------------------------------------------------------------------------------------
// The switch

const KIT_KEY = 'claude-office:kit';
/** Code default: flip to true to dress everyone. */
const KIT_DEFAULT = false;

function readSwitch(): boolean {
  try {
    const param = new URLSearchParams(location.search).get('kit');
    if (param === '1' || param === '0') return param === '1';
    const stored = localStorage.getItem(KIT_KEY);
    if (stored === '1' || stored === '0') return stored === '1';
  } catch {
    // no location or storage (private mode): the default applies
  }
  return KIT_DEFAULT;
}

/** Whether characters wear the kit: `?kit=1|0`, else localStorage['claude-office:kit'] = '1'|'0', else off. */
export const KIT_ENABLED: boolean = readSwitch();

const optedOut = new WeakSet<Rig>();

/**
 * Keep this rig procedural even when KIT_ENABLED (side-by-side previews): takes off anything
 * dressRig started (an in-flight load is cancelled) and applyKit then leaves it alone.
 */
export function keepProcedural(rig: Rig): void {
  optedOut.add(rig);
  stripKit(rig);
}

/**
 * Wear the kit if KIT_ENABLED; otherwise nothing happens. Fire and forget, and safe to call at
 * the end of Rig's constructor: the rig is only touched once the parts have loaded, by which
 * time a dispose or keepProcedural in the meantime has cancelled it.
 */
export function dressRig(rig: Rig): void {
  if (KIT_ENABLED) void applyKit(rig);
}

// ---------------------------------------------------------------------------------------
// Per-character state

interface Native {
  opacity: number;
  transparent: boolean;
}

interface Dress {
  plan: KitPlan;
  done: Promise<boolean>;
  /** Set by dispose/strip: a pending load then does nothing. */
  cancelled: boolean;
  /** The character's own kit materials and how they were authored. */
  mats: Map<THREE.Material, Native>;
  /** Clones by source material + tint, so both shoes share one material. */
  cache: Map<string, THREE.Material>;
  casters: THREE.Mesh[];
  /** Kit objects parented into the rig (detached before Rig.dispose: GLB geometry is shared). */
  added: THREE.Object3D[];
  /** Procedural parts hidden by the kit, with their visibility before. */
  hidden: Map<THREE.Object3D, boolean>;
  /** The rig's current fade (Rig.setOpacity), mirrored onto kit materials. */
  opacity: number;
  hadJiggle: boolean;
  worn: SlotName[];
  /** The rig's own setOpacity and dispose, put back by stripKit. */
  restore: () => void;
}

const dressed = new WeakMap<Rig, Dress>();

/** What a character is wearing (for previews and debugging), or null if no kit was applied. */
export function kitReport(rig: Rig): { plan: KitPlan; worn: readonly SlotName[] } | null {
  const d = dressed.get(rig);
  return d ? { plan: d.plan, worn: d.worn } : null;
}

/**
 * Dress `rig` in kit parts chosen from `looks` (default: the rig's own; the parts are always
 * fitted to the rig as it was built). Resolves true once at least one part is worn; false if
 * nothing could be (no catalog, kept procedural, or disposed or stripped while loading).
 * Calling it again for the same rig returns the same promise.
 */
export function applyKit(rig: Rig, looks: Looks = rig.looks): Promise<boolean> {
  if (optedOut.has(rig)) return Promise.resolve(false);
  const had = dressed.get(rig);
  if (had) return had.done;
  const d: Dress = {
    plan: planKit(looks),
    done: Promise.resolve(false),
    cancelled: false,
    mats: new Map(),
    cache: new Map(),
    casters: [],
    added: [],
    hidden: new Map(),
    opacity: 1,
    hadJiggle: rig.hasJiggle,
    worn: [],
    restore: () => {},
  };
  dressed.set(rig, d);
  adapt(rig, d);
  d.done = wear(rig, d).catch((err: Error) => {
    // Never leave a character half dressed: back to fully procedural.
    console.warn('[kit] could not dress a character:', err);
    if (dressed.get(rig) === d) stripKit(rig);
    return false;
  });
  return d.done;
}

/** Take the kit off again: the procedural parts come back. */
export function stripKit(rig: Rig): void {
  const d = dressed.get(rig);
  if (!d) return;
  takeOff(d);
  for (const [o, v] of d.hidden) o.visible = v;
  rig.hasJiggle = d.hadJiggle;
  d.restore();
  dressed.delete(rig);
}

function takeOff(d: Dress): void {
  d.cancelled = true;
  for (const o of d.added) o.removeFromParent();
  for (const m of d.mats.keys()) m.dispose();
  d.added.length = 0;
  d.casters.length = 0;
  d.mats.clear();
  d.cache.clear();
  d.worn.length = 0;
}

/**
 * The rig only fades and frees what it built. Until it can adopt outside meshes, wrap its
 * setOpacity (kit materials fade with it) and dispose (kit parts are detached first so the
 * shared GLB geometry survives, and their materials are freed).
 */
function adapt(rig: Rig, d: Dress): void {
  const setOpacity = rig.setOpacity;
  const dispose = rig.dispose;
  rig.setOpacity = (a: number) => {
    setOpacity.call(rig, a);
    fade(d, a);
  };
  rig.dispose = () => {
    takeOff(d);
    dispose.call(rig);
  };
  const fadeWrapper = rig.setOpacity;
  const disposeWrapper = rig.dispose;
  d.restore = () => {
    // Only undo our own wrappers (anything wrapped on top of them stays as it is).
    if (rig.setOpacity === fadeWrapper) rig.setOpacity = setOpacity;
    if (rig.dispose === disposeWrapper) rig.dispose = dispose;
  };
}

function applyOpacity(m: THREE.Material, native: Native, v: number): void {
  const transparent = native.transparent || v < 0.999;
  if (m.transparent !== transparent) {
    m.transparent = transparent;
    m.needsUpdate = true;
  }
  m.opacity = native.opacity * v;
}

function fade(d: Dress, a: number): void {
  const v = THREE.MathUtils.clamp(a, 0, 1);
  if (Math.abs(v - d.opacity) < 1e-3) return;
  d.opacity = v;
  for (const [m, native] of d.mats) applyOpacity(m, native, v);
  for (const c of d.casters) c.castShadow = v >= 0.999;
}

// ---------------------------------------------------------------------------------------
// Materials

/** Face features, glass and screens stay flat like the procedural ones (no rim light). */
const NO_RIM = new Set(['Eye', 'EyeShine', 'Mouth', 'Teeth', 'Tongue', 'Cheek', 'Lens', 'Screen', 'Label']);

/** The procedural rig's soft-plastic fresnel rim (rig.ts `plastic`), for kit materials. */
function addRim(m: THREE.MeshStandardMaterial): void {
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      float rimF = 1.0 - saturate(dot(normal, normalize(vViewPosition)));
      totalEmissiveRadiance += diffuseColor.rgb * 0.3 * pow(rimF, 2.6) + vec3(0.055, 0.05, 0.045) * pow(rimF, 5.0);`,
    );
  };
  m.customProgramCacheKey = () => 'office-kit-rim';
}

/** This character's copy of a kit material: tinted, rim-lit, registered for fading. */
function own(d: Dress, src: THREE.Material, tint: string | undefined, rim: boolean, bare: boolean): THREE.Material {
  const key = `${src.uuid}|${tint ?? ''}|${rim}|${bare}`;
  const hit = d.cache.get(key);
  if (hit) return hit;
  const m = src.clone();
  const std = m as THREE.MeshStandardMaterial;
  if (std.isMeshStandardMaterial) {
    if (bare) std.map = null;
    if (tint) std.color.set(tint);
    // Anything painted the skin colour gets the procedural skin's warm, subsurface-ish lift.
    if (tint && tint === d.plan.colors.skin) std.emissive.setRGB(std.color.r * 0.09, std.color.g * 0.045, std.color.b * 0.03);
    if (rim && !NO_RIM.has(m.name) && !m.transparent) addRim(std);
  }
  const native = { opacity: m.opacity, transparent: m.transparent };
  d.mats.set(m, native);
  applyOpacity(m, native, d.opacity);
  d.cache.set(key, m);
  return m;
}

interface WearOpts {
  /** Material name → colour. */
  tint?: Record<string, string>;
  /** Fade layer (as Rig.assignFadeOrder): 1 outer shells, 2 limbs and hair, 3 face and accessories. */
  layer: 1 | 2 | 3;
  cast?: boolean;
  /** Fresnel rim like the procedural plastic (default true). */
  rim?: boolean;
  /** Materials drawn without their baked texture (it can carry printed detail, like the mug's lettering). */
  bare?: string[];
}

function dressPart(d: Dress, part: THREE.Object3D, o: WearOpts): void {
  const fading = d.opacity < 0.999;
  part.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const owned = list.map((m) => own(d, m, o.tint?.[m.name], o.rim ?? true, !!o.bare?.includes(m.name)));
    mesh.material = Array.isArray(mesh.material) ? owned : owned[0];
    // See-through bits (cheeks, lenses) draw after the solid face, like the procedural cheeks.
    const glass = owned.some((m) => d.mats.get(m)!.transparent);
    mesh.userData.fadeOrder = glass ? 4 : o.layer;
    mesh.userData.baseOrder = glass ? 1 : 0;
    mesh.renderOrder = fading ? 10 + mesh.userData.fadeOrder : mesh.userData.baseOrder;
    mesh.receiveShadow = false;
    mesh.castShadow = !!o.cast && !glass && !fading;
    if (o.cast && !glass) d.casters.push(mesh);
  });
}

// ---------------------------------------------------------------------------------------
// Wearing

/** The kit model pieces one character needs (two of each limb part). */
type Piece =
  | 'head'
  | 'eyes'
  | 'brows'
  | 'smile'
  | 'open'
  | 'flat'
  | 'torso'
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
  | 'hair'
  | 'hat'
  | 'glasses'
  | 'face'
  | 'lanyard'
  | 'mug'
  | 'laptop';

/** Hair and hat nodes that bounce: they ride the rig's jiggle spring. */
const JIGGLE_NODES = ['Tuft', 'Pom', 'Ponytail', 'PigtailL', 'PigtailR'];

/** A pivot that copies another object's rotation every frame (extra jiggle nodes on the rig's one jiggle spring). */
class Follow extends THREE.Group {
  /** Optional: Object3D.clone constructs with no arguments (a clone then just holds its pose). */
  constructor(private readonly src?: THREE.Object3D) {
    super();
  }

  override updateMatrix(): void {
    if (this.src) this.rotation.copy(this.src.rotation);
    super.updateMatrix();
  }
}

const staticMatrix = (o: THREE.Object3D, scale = o.scale) => new THREE.Matrix4().compose(o.position, o.quaternion, scale);

/** Remove a model's meshes drawn in the named material (an unwanted layer of a kit part). */
function drop(part: THREE.Object3D | undefined, material: string): void {
  const doomed: THREE.Object3D[] = [];
  part?.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).material as THREE.Material).name === material) doomed.push(o);
  });
  for (const o of doomed) o.removeFromParent();
}
const ONE = new THREE.Vector3(1, 1, 1);

async function wear(rig: Rig, d: Dress): Promise<boolean> {
  const P = d.plan;
  const want: Record<Piece, string | null> = {
    head: P.head,
    eyes: P.eyes,
    brows: P.brows,
    smile: P.mouth.smile,
    open: P.mouth.open,
    flat: P.mouth.flat,
    torso: P.torso,
    upperL: P.upperArm,
    upperR: P.upperArm,
    foreL: P.forearm,
    foreR: P.forearm,
    handL: P.hand,
    handR: P.hand,
    thighL: P.thigh,
    thighR: P.thigh,
    shinL: P.shin,
    shinR: P.shin,
    shoeL: P.shoe,
    shoeR: P.shoe,
    hair: P.hair,
    hat: P.hat,
    glasses: P.glasses,
    face: P.facialHair,
    lanyard: P.lanyard,
    mug: P.mug,
    laptop: P.laptop,
  };
  const pieces = Object.entries(want) as [Piece, string | null][];
  const loaded = await Promise.all(pieces.map(([, id]) => (id ? model(id, { shadows: false }) : null)));
  if (d.cancelled) return false;
  const got: Partial<Record<Piece, THREE.Group>> = {};
  pieces.forEach(([k], i) => {
    if (loaded[i]) got[k] = loaded[i]!;
  });

  const slots = findSlots(rig);
  // Start at the rig's current fade (it may be walking in, half transparent).
  const skin = (slots.head?.procedural[0] as THREE.Mesh | undefined)?.material as THREE.Material | undefined;
  if (skin) d.opacity = skin.opacity;

  const C = P.colors;
  const hide = (objs: THREE.Object3D[]) => {
    for (const o of objs) {
      if (!d.hidden.has(o)) d.hidden.set(o, o.visible);
      o.visible = false;
    }
  };
  const put = (name: SlotName, part: THREE.Object3D | undefined, o: WearOpts): boolean => {
    const slot = slots[name];
    if (!slot || !part) return false;
    dressPart(d, part, o);
    hide(slot.procedural);
    slot.holder.add(part);
    d.added.push(part);
    if (!d.worn.includes(name)) d.worn.push(name);
    return true;
  };
  /** Move a node out of its kit model into `slot`, keeping where it sat on the head: `rest` is the holder's rest transform in head space. */
  const putNode = (name: SlotName, node: THREE.Object3D | null, rest: THREE.Matrix4, o: WearOpts) => {
    if (!node || !slots[name]) return;
    const m = rest.clone().invert().multiply(node.matrixWorld);
    node.removeFromParent();
    m.decompose(node.position, node.quaternion, node.scale);
    put(name, node, o);
  };

  // Head and face. Kit heads carry their own cheeks (hidden with the procedural head).
  put('head', got.head, { tint: { Skin: C.skin }, layer: 1, cast: true });
  const face: WearOpts = { layer: 3, rim: false };
  if (got.eyes) {
    got.eyes.updateMatrixWorld(true);
    // The eye joints blink with scale.y and dart with their parent; their rest is position + rotation.
    putNode('eyeL', got.eyes.getObjectByName('EyeL') ?? null, staticMatrix(rig.eyeL, ONE), face);
    putNode('eyeR', got.eyes.getObjectByName('EyeR') ?? null, staticMatrix(rig.eyeR, ONE), face);
  }
  if (got.brows) {
    got.brows.updateMatrixWorld(true);
    // Brow joints raise and tilt inside a static holder on the head surface.
    const browFace = { ...face, tint: { Hair: C.brow } };
    if (rig.browL.parent) putNode('browL', got.brows.getObjectByName('BrowL') ?? null, staticMatrix(rig.browL.parent), browFace);
    if (rig.browR.parent) putNode('browR', got.brows.getObjectByName('BrowR') ?? null, staticMatrix(rig.browR.parent), browFace);
  }
  for (const shape of ['smile', 'open', 'flat'] as const) {
    const part = got[shape];
    const slot = slots[shape];
    if (!part || !slot) continue;
    // Kit mouths sit in head space; their group (which setMouth shows and hides) may not.
    staticMatrix(slot.holder).invert().decompose(part.position, part.quaternion, part.scale);
    put(shape, part, face);
  }

  // Torso: pants and belly on the torso joint, the `Chest` node on the chest joint.
  const chest = got.torso?.getObjectByName('Chest');
  if (got.torso && chest && slots.torso && slots.chest) {
    const g = rig.looks.girth; // the rig's shoulders sit at its own girth
    got.torso.updateMatrixWorld(true);
    const m = new THREE.Matrix4().makeTranslation(0, -RD.torso.chestPivotY, 0).multiply(chest.matrixWorld);
    chest.removeFromParent();
    m.decompose(chest.position, chest.quaternion, chest.scale);
    chest.scale.x *= g;
    chest.scale.z *= g;
    got.torso.scale.set(g, 1, g);
    const tint: Record<string, string> = { Shirt: C.shirt, Pants: C.pants };
    if (C.torsoAccent) tint.Accent = C.torsoAccent;
    put('torso', got.torso, { tint, layer: 1, cast: true });
    put('chest', chest, { tint, layer: 1, cast: true });
    // The shirt-and-tie torso has the tie built in.
    if (P.torso === 'char_torso_shirt_tie' && slots.tie) hide(slots.tie.procedural);
  }
  if (got.lanyard) {
    // Modelled in pelvis space on a girth-1 torso; it rides the chest like the procedural one.
    got.lanyard.position.y = -RD.torso.chestPivotY;
    got.lanyard.scale.set(rig.looks.girth, 1, rig.looks.girth);
    put('lanyard', got.lanyard, { tint: { Accent: C.lanyard }, layer: 3 });
  }

  // Limbs. Long sleeves paint the arm's skin the sleeve colour.
  const armSkin = P.longSleeves ? C.sleeve : C.skin;
  const toeOut = THREE.MathUtils.degToRad(RD.foot.toeOutDeg);
  for (const side of [1, -1] as const) {
    const s = side === 1 ? 'L' : 'R';
    const limb = (p: 'upper' | 'fore' | 'hand' | 'thigh' | 'shin' | 'shoe') => `${p}${s}` as const;
    put(limb('upper'), got[limb('upper')], { tint: { Shirt: C.sleeve, Skin: armSkin }, layer: 2, cast: true });
    put(limb('fore'), got[limb('fore')], { tint: { Skin: armSkin }, layer: 2, cast: true });
    put(limb('hand'), got[limb('hand')], { tint: { Skin: C.skin }, layer: 2, cast: true });
    put(limb('thigh'), got[limb('thigh')], { tint: { Pants: C.pants, Skin: C.skin }, layer: 2, cast: true });
    put(limb('shin'), got[limb('shin')], { tint: { Pants: C.shin }, layer: 2, cast: true });
    const shoe = got[limb('shoe')];
    if (shoe) shoe.rotation.y = side * toeOut;
    put(limb('shoe'), shoe, { tint: { Shoes: C.shoes, Accent: C.shoeAccent }, layer: 2, cast: true });
  }

  // Hair and hat go on together (a kit hat over procedural hair, or the reverse, clips).
  if ((P.hair || P.hat) && (!P.hair || got.hair) && (!P.hat || got.hat)) {
    let bouncy = false;
    for (const [part, tint] of [
      [got.hair, { Hair: C.hair, Accent: C.hairAccent }],
      [got.hat, { Accent: C.hat }],
    ] as const) {
      if (!part || !put('hair', part, { tint, layer: 2, cast: true })) continue;
      for (const n of JIGGLE_NODES) {
        const node = part.getObjectByName(n);
        if (!node?.parent) continue;
        const pivot = new Follow(rig.jiggle);
        pivot.position.copy(node.position);
        node.position.set(0, 0, 0);
        node.parent.add(pivot);
        pivot.add(node);
        bouncy = true;
      }
    }
    if (bouncy) rig.hasJiggle = true;
  }
  // Clear glasses are frames only, like the procedural ones: any lit lens, however faint,
  // greys out the dark eyes behind it. Sunglasses keep their dark lenses.
  if (P.glasses !== 'sunglasses') drop(got.glasses, 'Lens');
  put('glasses', got.glasses, { tint: { Accent: C.glasses }, layer: 3, rim: false });
  put('face', got.face, { tint: { Hair: C.hair }, layer: 3 });

  // Held items: the rig keeps the mug upright and the laptop out front; the kit models go inside.
  // A plain mug: no lettering, and no baked texture on the glaze (the lettering is in it too).
  if (!P.mugPrint) drop(got.mug, 'Print');
  put('mug', got.mug, { tint: C.mugGlaze ? { Glaze: C.mugGlaze } : undefined, bare: P.mugPrint ? undefined : ['Glaze'], layer: 3, cast: true });
  if (got.laptop) got.laptop.position.y = -0.012; // the procedural laptop is centred on its base
  put('laptop', got.laptop, { layer: 3, cast: true });

  return d.worn.length > 0;
}
