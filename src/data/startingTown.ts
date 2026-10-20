import { coastX } from './terrain';

export interface StartingPlacement {
  defId: string;
  x: number;
  y: number;
  /** État initial particulier : loyer prêt, culture mûre… */
  preset?: 'rentReady' | 'ripeWheat';
}

const MAIN_ROAD_Y = 20;
const CROSS_ROAD_X = 19;
const AREA_MIN = 8;
const AREA_MAX = 31;

function roads(): StartingPlacement[] {
  const list: StartingPlacement[] = [];
  // La route principale s'arrête avant la plage.
  const roadEnd = Math.min(AREA_MAX, coastX(MAIN_ROAD_Y) - 2);
  for (let x = AREA_MIN; x <= roadEnd; x++) list.push({ defId: 'road', x, y: MAIN_ROAD_Y });
  for (let y = AREA_MIN; y <= AREA_MAX; y++) {
    if (y !== MAIN_ROAD_Y) list.push({ defId: 'road', x: CROSS_ROAD_X, y });
  }
  return list;
}

/** Petite ville de départ, inspirée des premières minutes d'un city-builder classique. */
export const STARTING_TOWN: readonly StartingPlacement[] = [
  ...roads(),
  // Bâtiments reliés aux routes (sinon ils ne fonctionnent pas).
  { defId: 'town_hall', x: 20, y: 16 },
  { defId: 'barn', x: 17, y: 11 },
  { defId: 'plot', x: 13, y: 15, preset: 'ripeWheat' },
  { defId: 'plot', x: 14, y: 15, preset: 'ripeWheat' },
  { defId: 'plot', x: 13, y: 16, preset: 'ripeWheat' },
  { defId: 'plot', x: 14, y: 16, preset: 'ripeWheat' },
  { defId: 'cottage', x: 17, y: 21, preset: 'rentReady' },
  { defId: 'cottage', x: 14, y: 21, preset: 'rentReady' },
  { defId: 'flower_bed', x: 24, y: 19 },
  { defId: 'flower_bed', x: 24, y: 17 },
  { defId: 'tree_oak', x: 9, y: 9 },
  { defId: 'tree_pine', x: 10, y: 11 },
  { defId: 'tree_oak', x: 8, y: 13 },
  { defId: 'tree_pine', x: 26, y: 9 },
  { defId: 'palm', x: 28, y: 11 },
  { defId: 'palm', x: 28, y: 9 },
  { defId: 'tree_oak', x: 9, y: 27 },
  { defId: 'tree_pine', x: 11, y: 30 },
  { defId: 'tree_oak', x: 8, y: 24 },
  { defId: 'palm', x: 29, y: 29 },
  { defId: 'tree_oak', x: 25, y: 26 },
  { defId: 'tree_pine', x: 26, y: 31 },
  { defId: 'tree_oak', x: 22, y: 13 },
  { defId: 'tree_pine', x: 17, y: 9 },
];
