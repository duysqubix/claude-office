// One palette for the whole office so the world and the characters read as one toy box.
// Wobbly-Life-ish: sunny, saturated, soft. No pure black, no pure white surfaces.

export const PALETTE = {
  // Outdoors
  skyTop: '#5BB8FF',
  skyHorizon: '#CFEFFF',
  grass: '#7ED957',
  grassDark: '#5FBF45',
  path: '#F2E3C6',
  treeLeaf: ['#5CCB5F', '#46B35A', '#7BD66B'],
  treeTrunk: '#9C6B43',
  cloud: '#FFFFFF',
  // Day sky from the art brief (docs/ART-REFERENCE.md §3.5): almost flat, saturated azure.
  skyDayTop: '#2AABFF',
  skyDayHorizon: '#6CC8FF',
  cloudTint: '#E6F4FC',

  // Building
  wall: '#FFF3DE',
  wallAccent: '#8FE0C8',
  wallTrim: '#F6B76E',
  floorWood: '#E8BE84',
  floorWoodAlt: '#DDAF73',
  carpet: '#7DB8F0',
  carpetAlt: '#F49AC1',
  glass: '#BFE9FF',
  doorFrame: '#3F4A5C',

  // Furniture
  deskTop: '#FFFBF2',
  deskAccents: ['#FF7A6B', '#FFC94A', '#5CC8FF', '#6EDC9A', '#B48CFF', '#FF9DCB'],
  chairs: ['#FF5A5F', '#3D7CFF', '#FFC93C', '#2EC4B6', '#9B5DE5'],
  chairBase: '#3B4252',
  monitorBezel: '#2E3440',
  screenOff: '#1B2330',
  screenGlow: '#7FD8FF',
  plantLeaf: '#4CC46A',
  plantPot: '#E07A4F',
  wood: '#C98F5A',
  metal: '#C8D0DC',
  coffee: '#6B3E26',

  // Characters
  skins: ['#FFDDBB', '#F7C59F', '#E7A977', '#C98B5B', '#9B6640', '#6E4329'],
  shirts: ['#FF6B6B', '#4D96FF', '#FFD93D', '#6BCB77', '#B983FF', '#FF9F45', '#00C2C7', '#FF7EB6', '#7A86FF', '#9BE15D'],
  pants: ['#2F3E66', '#3D3D52', '#5B4636', '#2E5E4E', '#4B3F72', '#6B7A8F'],
  shoes: ['#2B2D42', '#FFFFFF', '#E63946', '#3A86FF', '#8D6E63'],
  hair: ['#2B1B10', '#5A3825', '#A0522D', '#E8C07D', '#D94F30', '#1F1F2E', '#B8B8C8', '#FF8FB1', '#4D96FF'],
  eye: '#1E1B2E',
  cheek: '#FF9AA2',
  mouth: '#5A2A2A',

  // The manager (that's you)
  managerShirt: '#FFFFFF',
  managerTie: '#E63946',
  managerPants: '#2B2D42',
  managerHair: '#3B2A20',

  // State colours (UI chips, screen tints, markers)
  stateWorking: '#4ADE80',
  stateNeedsYou: '#FFB020',
  stateIdle: '#60A5FA',
  stateSleeping: '#A78BFA',
  stateStarting: '#CBD5E1',

  // UI
  ink: '#2B2D42',
  paper: '#FFFDF7',
  claude: '#D97757',
} as const;

/** Deterministic 32-bit hash for picking looks/names from a session id. */
export function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Pick an item from a list using a seed and a salt so different features vary independently. */
export function pick<T>(list: readonly T[], seed: string, salt: string): T {
  return list[hash32(seed + ':' + salt) % list.length];
}
