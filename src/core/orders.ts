import { ORDERS } from '@/data/balance';
import { getBuildingDef } from '@/data/buildings';
import { CROPS } from '@/data/crops';
import { getItemDef } from '@/data/items';
import { RECIPES } from '@/data/recipes';
import { random, seedOf } from './daily';
import type { GameState, Order, OrdersState, Reward } from './types';

/**
 * Commandes du jour : chaque jour, des clients demandent des produits que le
 * joueur sait déjà produire (cultures débloquées, pêche, élevage, ateliers).
 * Avec une gare, une grosse commande part par le train.
 */

/** Produits que le joueur peut obtenir avec ce qu'il possède déjà. */
export function producibleItems(state: GameState): string[] {
  const ids = new Set<string>();
  for (const crop of CROPS) if ((crop.requires?.level ?? 1) <= state.level) ids.add(crop.id);
  const owned = new Set(state.entities.filter((e) => e.built).map((e) => e.defId));
  if (state.entities.some((e) => e.built && getBuildingDef(e.defId).category === 'port')) ids.add('fish');
  for (const recipe of RECIPES) {
    if (owned.has(recipe.building) && (recipe.requires?.level ?? 1) <= state.level) ids.add(recipe.output.item);
  }
  return [...ids];
}

export function emptyOrders(): OrdersState {
  return { day: '', list: [], bonus: {}, bonusClaimed: false };
}

/** Une commande d'une valeur proche de `value`, avec un ou deux produits. */
function makeOrder(items: string[], value: number, count: number, rand: () => number, train: boolean): Order {
  const pool = [...items];
  const chosen: string[] = [];
  while (chosen.length < count && pool.length > 0) {
    const [id] = pool.splice(Math.floor(rand() * pool.length), 1);
    if (id) chosen.push(id);
  }
  const bag: Record<string, number> = {};
  let total = 0;
  for (const id of chosen) {
    const item = getItemDef(id);
    const qty = Math.max(5, Math.round(value / chosen.length / item.value / 5) * 5);
    bag[id] = qty;
    total += qty * item.value;
  }
  // Mieux payé qu'une vente au marchand (×3) ; le train paie un peu plus encore.
  const coins = Math.round((total * (train ? 7 : 6)) / 10) * 10;
  return { items: bag, reward: { coins, xp: Math.max(3, Math.round(total / 15)) }, done: false, train };
}

export function drawOrders(state: GameState, day: string, hasStation: boolean): OrdersState {
  const items = producibleItems(state);
  const rand = random(seedOf(`orders:${day}:${state.createdAt}`));
  const value = 20 + state.level * 8;
  const list: Order[] = [];
  for (let i = 0; i < ORDERS.count; i++) list.push(makeOrder(items, value, i === 2 ? 2 : 1, rand, false));
  if (hasStation) {
    for (let i = 0; i < ORDERS.trainCount; i++) list.push(makeOrder(items, value * 4, 3, rand, true));
  }
  const bonus: Reward = { coins: 100 + state.level * 20, cash: 1 };
  return { day, list, bonus, bonusClaimed: false };
}
