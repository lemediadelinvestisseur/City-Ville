import { CHUNK_SIZE, MAP_SIZE, STARTING_CHUNKS } from './balance';

export interface StartingPlacement {
  defId: string;
  x: number;
  y: number;
  /** État initial particulier : loyer prêt, culture mûre… */
  preset?: 'rentReady' | 'ripeStrawberry';
}

const MAIN_ROAD_Y = 20;
const CROSS_ROAD_X = 19;
const AREA_MIN = 8;
const AREA_MAX = 31;

function roads(): StartingPlacement[] {
  const list: StartingPlacement[] = [];
  for (let x = AREA_MIN; x <= AREA_MAX; x++) list.push({ defId: 'road', x, y: MAIN_ROAD_Y });
  for (let y = AREA_MIN; y <= AREA_MAX; y++) {
    if (y !== MAIN_ROAD_Y) list.push({ defId: 'road', x: CROSS_ROAD_X, y });
  }
  return list;
}

/** Petite ville de départ, inspirée des premières minutes d'un city-builder classique. */
export const STARTING_TOWN: readonly StartingPlacement[] = [
  ...roads(),
  { defId: 'town_hall', x: 21, y: 16 },
  { defId: 'barn', x: 15, y: 11 },
  { defId: 'plot', x: 12, y: 15, preset: 'ripeStrawberry' },
  { defId: 'plot', x: 14, y: 15, preset: 'ripeStrawberry' },
  { defId: 'plot', x: 12, y: 17, preset: 'ripeStrawberry' },
  { defId: 'plot', x: 14, y: 17, preset: 'ripeStrawberry' },
  { defId: 'cottage', x: 17, y: 22, preset: 'rentReady' },
  { defId: 'cottage', x: 14, y: 22, preset: 'rentReady' },
  { defId: 'flower_bed', x: 20, y: 18 },
  { defId: 'flower_bed', x: 24, y: 18 },
  { defId: 'tree_oak', x: 9, y: 9 },
  { defId: 'tree_pine', x: 10, y: 11 },
  { defId: 'tree_oak', x: 8, y: 13 },
  { defId: 'tree_pine', x: 26, y: 9 },
  { defId: 'tree_oak', x: 28, y: 11 },
  { defId: 'tree_pine', x: 30, y: 9 },
  { defId: 'tree_oak', x: 9, y: 27 },
  { defId: 'tree_pine', x: 11, y: 30 },
  { defId: 'tree_oak', x: 8, y: 24 },
  { defId: 'tree_pine', x: 29, y: 29 },
  { defId: 'tree_oak', x: 31, y: 25 },
  { defId: 'tree_pine', x: 26, y: 31 },
  { defId: 'tree_oak', x: 22, y: 13 },
  { defId: 'tree_pine', x: 17, y: 9 },
];

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Forêt décorative dans les zones verrouillées (déterministe). */
export function wildTrees(seed = 2010): StartingPlacement[] {
  const rand = mulberry32(seed);
  const unlocked = new Set(STARTING_CHUNKS.map(([cx, cy]) => `${cx},${cy}`));
  const taken = new Set<string>();
  const list: StartingPlacement[] = [];
  for (let i = 0; i < 260; i++) {
    const x = Math.floor(rand() * MAP_SIZE);
    const y = Math.floor(rand() * MAP_SIZE);
    const chunk = `${Math.floor(x / CHUNK_SIZE)},${Math.floor(y / CHUNK_SIZE)}`;
    if (unlocked.has(chunk) || taken.has(`${x},${y}`)) continue;
    // Plus dense vers les bords de la carte.
    const edge = Math.min(x, y, MAP_SIZE - 1 - x, MAP_SIZE - 1 - y);
    if (rand() < edge / 9) continue;
    taken.add(`${x},${y}`);
    list.push({ defId: rand() < 0.6 ? 'tree_pine' : 'tree_oak', x, y });
  }
  return list;
}
