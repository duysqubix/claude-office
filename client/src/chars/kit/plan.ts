// Which kit parts and colours a character wears. Deterministic: the same Looks (and so the
// same session) always gets the same outfit, hairdo and accessories.
//
// Looks only name a hair *family* (tuft, bob, bun, slick…); the kit has 13 hairstyles, so
// each family picks among the kit styles with the same silhouette. Outfits come from the
// sleeve length; the manager always wears the shirt and tie, interns a tee.
import * as THREE from 'three';
import { PALETTE, hash32 } from '../../style/palette';
import type { HairStyle, Looks } from '../looks';

export type TorsoId =
  | 'char_torso_tee'
  | 'char_torso_shirt_tie'
  | 'char_torso_hoodie'
  | 'char_torso_sweater'
  | 'char_torso_vest'
  | 'char_torso_labcoat';

export type KitMouth = 'char_mouth_smile' | 'char_mouth_grin' | 'char_mouth_o' | 'char_mouth_flat';

export interface KitPlan {
  head: 'char_head';
  eyes: 'char_eye';
  brows: 'char_brow';
  /** Kit mouth for each of the rig's mouth shapes. */
  mouth: { smile: KitMouth; open: KitMouth; flat: KitMouth };
  torso: TorsoId;
  upperArm: 'char_upper_arm';
  forearm: 'char_forearm';
  hand: 'char_hand_mitten';
  /** legs_shorts replaces the thigh (the shin is then painted skin). */
  thigh: 'char_thigh' | 'legs_shorts';
  shin: 'char_shin';
  shoe: 'char_shoe_sneaker' | 'char_shoe_boot';
  hair: string | null;
  hat: string | null;
  glasses: string | null;
  facialHair: string | null;
  lanyard: string | null;
  mug: string | null;
  /** The manager's mug says WORLD'S OKAYEST MANAGER; anyone else's is plain, glazed in their colour. */
  mugPrint: boolean;
  laptop: string | null;
  /** Arm `Skin` painted the sleeve colour. */
  longSleeves: boolean;
  colors: {
    skin: string;
    /** The torso's `Shirt` (under a vest or coat, the shirt underneath). */
    shirt: string;
    /** Sleeves on the arm parts. */
    sleeve: string;
    pants: string;
    /** Shins (`Pants`): skin under shorts. */
    shin: string;
    shoes: string;
    shoeAccent: string;
    hair: string;
    brow: string;
    /** Scrunchies on buns, ponytails and pigtails. */
    hairAccent: string;
    hat: string;
    glasses: string;
    /** The torso's `Accent` (tee patch, tie, sweater band, vest), or null to keep the model's. */
    torsoAccent: string | null;
    lanyard: string;
    /** Mug `Glaze`, or null to keep the model's cream. */
    mugGlaze: string | null;
  };
}

/** Kit hairstyles per looks hair family (picked by hash), and the hat that goes with it. */
const HAIR: Record<HairStyle, { hair: readonly (string | null)[]; hat: string | null }> = {
  tuft: { hair: ['hair_tuft', 'hair_tuft', 'hair_spiky', 'hair_mohawk'], hat: null },
  bob: { hair: ['hair_bob', 'hair_bob', 'hair_long', 'hair_curly', 'hair_afro'], hat: null },
  bun: { hair: ['hair_bun', 'hair_ponytail', 'hair_pigtails'], hat: null },
  slick: { hair: ['hair_slick', 'hair_side_part'], hat: null },
  // Under caps and beanies only a close crop shows (sideburns and nape).
  cap: { hair: ['hair_buzz'], hat: 'hat_cap' },
  capBack: { hair: ['hair_buzz'], hat: 'hat_cap_backwards' },
  beanie: { hair: ['hair_buzz'], hat: 'hat_beanie' },
  headphones: { hair: ['hair_side_part', 'hair_buzz'], hat: 'headphones' },
  bald: { hair: [null], hat: null },
};

const NATURAL_HAIR = new Set<string>(PALETTE.hair.slice(0, 7));

/** A crisp white-ish shirt under vests. */
const UNDERSHIRT = '#F4F6FA';

function darken(hex: string, f: number): string {
  return '#' + new THREE.Color(hex).multiplyScalar(f).getHexString();
}

/** Everything the Looks generator varies, so equal looks plan equal kits. */
function lookKey(l: Looks): string {
  return [l.role, l.skin, l.shirt, l.pants, l.shoes, l.hair, l.hairStyle, l.hatColor, l.glassesColor, l.sleeves, l.girth.toFixed(4), l.scale.toFixed(4), l.pace.toFixed(4)].join('|');
}

export function planKit(looks: Looks): KitPlan {
  const key = lookKey(looks);
  /** 0..1, independent per salt. */
  const roll = (salt: string) => (hash32(key + ':' + salt) % 10000) / 10000;
  const pickOf = <T>(list: readonly T[], salt: string): T => list[hash32(key + ':' + salt) % list.length];
  const employee = looks.role === 'employee';

  let torso: TorsoId;
  if (looks.tie) torso = 'char_torso_shirt_tie';
  else if (looks.role === 'intern') torso = 'char_torso_tee';
  else if (looks.sleeves === 'short') torso = roll('torso') < 0.75 ? 'char_torso_tee' : 'char_torso_vest';
  // Long sleeves. No lab coats at random: the white coat would hide the shirt colour that
  // identifies a boss (their interns wear it on their caps).
  else torso = pickOf(['char_torso_hoodie', 'char_torso_hoodie', 'char_torso_sweater', 'char_torso_sweater', 'char_torso_vest', 'char_torso_tee'] as const, 'torso');

  const family = HAIR[looks.hairStyle];
  const hair = looks.role === 'manager' ? 'hair_slick' : pickOf(family.hair, 'hairdo');
  let hat = family.hat;
  // The receptionist (Looks.headset) always wears the mic headset; some headphone wearers do too.
  const receptionist = 'headset' in looks && looks.headset === true;
  if (receptionist || (hat === 'headphones' && roll('headset') < 0.3)) hat = 'headset_mic';

  let glasses: string | null = null;
  if (looks.glasses) {
    const g = roll('frames');
    glasses = g < 0.45 ? 'glasses_round' : g < 0.9 ? 'glasses_square' : 'sunglasses';
  }

  let facialHair: string | null = null;
  // Beards only in natural hair colours (not the pink and blue dyes).
  if (employee && NATURAL_HAIR.has(looks.hair)) {
    const f = roll('facialHair');
    facialHair = f < 0.08 ? 'mustache' : f < 0.14 ? 'beard_full' : null;
  }

  const shorts = employee && looks.sleeves === 'short' && roll('shorts') < 0.15;
  const vest = torso === 'char_torso_vest';
  const shirt = vest ? UNDERSHIRT : looks.shirt;
  let torsoAccent: string | null = null;
  if (torso === 'char_torso_tee') torsoAccent = looks.hatColor;
  else if (torso === 'char_torso_shirt_tie') torsoAccent = looks.role === 'manager' ? PALETTE.managerTie : looks.hatColor;
  else if (vest) torsoAccent = looks.shirt;

  return {
    head: 'char_head',
    eyes: 'char_eye',
    brows: 'char_brow',
    mouth: {
      smile: employee && roll('grin') < 0.3 ? 'char_mouth_grin' : 'char_mouth_smile',
      open: 'char_mouth_o',
      flat: 'char_mouth_flat',
    },
    torso,
    upperArm: 'char_upper_arm',
    forearm: 'char_forearm',
    hand: 'char_hand_mitten',
    thigh: shorts ? 'legs_shorts' : 'char_thigh',
    shin: 'char_shin',
    shoe: roll('shoe') < 0.25 ? 'char_shoe_boot' : 'char_shoe_sneaker',
    hair,
    hat,
    glasses,
    facialHair,
    lanyard: looks.lanyard ? 'lanyard_badge' : null,
    mug: looks.mug ? 'held_mug_manager' : null,
    mugPrint: looks.role === 'manager',
    laptop: looks.laptop ? 'held_laptop' : null,
    longSleeves: looks.sleeves === 'long',
    colors: {
      skin: looks.skin,
      shirt,
      sleeve: shirt,
      pants: looks.pants,
      shin: shorts ? looks.skin : looks.pants,
      shoes: looks.shoes,
      shoeAccent: looks.hatColor,
      hair: looks.hair,
      brow: darken(looks.hair, 0.55),
      hairAccent: looks.hatColor,
      hat: looks.hatColor,
      glasses: looks.glassesColor,
      torsoAccent,
      lanyard: PALETTE.claude,
      mugGlaze: looks.role === 'manager' ? null : looks.hatColor,
    },
  };
}
