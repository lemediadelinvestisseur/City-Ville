import type { ItemBag } from './items';

/**
 * Productions des bâtiments d'élevage (on nourrit les bêtes) et des ateliers
 * (on transforme des produits) : des ingrédients partent, un produit revient
 * au bout d'un minuteur.
 */
export interface RecipeDef {
  id: string;
  name: string;
  /** Bâtiment qui la produit. */
  building: string;
  inputs: ItemBag;
  output: { item: string; qty: number };
  durationSec: number;
  xp: number;
  requires?: { level?: number };
}

const MIN = 60;
const HOUR = 3600;

export const RECIPES: readonly RecipeDef[] = [
  // ——— Élevage ———
  {
    id: 'eggs',
    name: 'Œufs frais',
    building: 'chicken_coop',
    inputs: { wheat: 10 },
    output: { item: 'eggs', qty: 10 },
    durationSec: 30 * MIN,
    xp: 2,
  },
  {
    id: 'milk',
    name: 'Traite',
    building: 'cowshed',
    inputs: { corn: 20 },
    output: { item: 'milk', qty: 20 },
    durationSec: 2 * HOUR,
    xp: 4,
  },
  {
    id: 'meat',
    name: 'Viande',
    building: 'cattle_ranch',
    inputs: { corn: 30, wheat: 20 },
    output: { item: 'meat', qty: 25 },
    durationSec: 4 * HOUR,
    xp: 8,
  },
  // ——— Ateliers ———
  {
    id: 'flour',
    name: 'Farine',
    building: 'mill',
    inputs: { wheat: 20 },
    output: { item: 'flour', qty: 10 },
    durationSec: 10 * MIN,
    xp: 2,
  },
  {
    id: 'bread',
    name: 'Pain',
    building: 'bakehouse',
    inputs: { flour: 10 },
    output: { item: 'bread', qty: 8 },
    durationSec: 20 * MIN,
    xp: 3,
  },
  {
    id: 'cake',
    name: 'Gâteaux aux fraises',
    building: 'bakehouse',
    inputs: { flour: 10, eggs: 10, strawberry: 10 },
    output: { item: 'cake', qty: 8 },
    durationSec: HOUR,
    xp: 6,
    requires: { level: 8 },
  },
  {
    id: 'cheese',
    name: 'Fromage',
    building: 'dairy',
    inputs: { milk: 20 },
    output: { item: 'cheese', qty: 8 },
    durationSec: HOUR,
    xp: 5,
  },
  {
    id: 'canned',
    name: 'Conserves de tomates',
    building: 'cannery',
    inputs: { tomato: 30 },
    output: { item: 'canned', qty: 10 },
    durationSec: 90 * MIN,
    xp: 6,
  },
  {
    id: 'jam',
    name: 'Confiture de fraises',
    building: 'cannery',
    inputs: { strawberry: 30 },
    output: { item: 'jam', qty: 10 },
    durationSec: HOUR,
    xp: 6,
    requires: { level: 13 },
  },
];

const BY_ID = new Map(RECIPES.map((recipe) => [recipe.id, recipe]));

export function findRecipeDef(id: string): RecipeDef | undefined {
  return BY_ID.get(id);
}

export function getRecipeDef(id: string): RecipeDef {
  const recipe = BY_ID.get(id);
  if (!recipe) throw new Error(`Production inconnue : ${id}`);
  return recipe;
}

export function recipesOf(buildingId: string): RecipeDef[] {
  return RECIPES.filter((recipe) => recipe.building === buildingId);
}
