/**
 * Produits rangés dans l'entrepôt : récoltes des champs, pêche, élevage et
 * produits des ateliers. Ils remplacent les « marchandises » génériques :
 * commerces, habitants, commandes et trains demandent des produits précis.
 */

/** Familles d'aliments : un repas varié (plusieurs familles) rend la ville plus heureuse. */
export type ItemFamily = 'cereal' | 'produce' | 'protein' | 'dairy' | 'other';

export const FOOD_FAMILIES: readonly ItemFamily[] = ['cereal', 'produce', 'protein', 'dairy'];

export interface ItemDef {
  id: string;
  name: string;
  /** Pictogramme affiché dans l'interface. */
  emoji: string;
  family: ItemFamily;
  /**
   * Valeur d'une unité (1 = une récolte de base) : prix de vente, part d'un
   * repas, taille des commandes. Un produit transformé vaut plus que ses ingrédients.
   */
  value: number;
}

export const ITEMS: readonly ItemDef[] = [
  { id: 'wheat', name: 'Blé', emoji: '🌾', family: 'cereal', value: 1 },
  { id: 'strawberry', name: 'Fraises', emoji: '🍓', family: 'produce', value: 1 },
  { id: 'flowers', name: 'Fleurs', emoji: '🌷', family: 'other', value: 1 },
  { id: 'carrot', name: 'Carottes', emoji: '🥕', family: 'produce', value: 1 },
  { id: 'corn', name: 'Maïs', emoji: '🌽', family: 'cereal', value: 1 },
  { id: 'tomato', name: 'Tomates', emoji: '🍅', family: 'produce', value: 1 },
  { id: 'cotton', name: 'Coton', emoji: '☁️', family: 'other', value: 1 },
  { id: 'pumpkin', name: 'Citrouilles', emoji: '🎃', family: 'produce', value: 1 },
  { id: 'sunflower', name: 'Tournesols', emoji: '🌻', family: 'other', value: 1 },
  { id: 'grape', name: 'Raisin', emoji: '🍇', family: 'produce', value: 1 },
  { id: 'apple', name: 'Pommes', emoji: '🍎', family: 'produce', value: 1 },
  { id: 'fish', name: 'Poisson', emoji: '🐟', family: 'protein', value: 1 },
  { id: 'eggs', name: 'Œufs', emoji: '🥚', family: 'protein', value: 1.5 },
  { id: 'milk', name: 'Lait', emoji: '🥛', family: 'dairy', value: 1.5 },
  { id: 'meat', name: 'Viande', emoji: '🥩', family: 'protein', value: 3 },
  { id: 'flour', name: 'Farine', emoji: '🌾', family: 'cereal', value: 2 },
  { id: 'bread', name: 'Pain', emoji: '🍞', family: 'cereal', value: 3 },
  { id: 'cake', name: 'Gâteaux', emoji: '🍰', family: 'cereal', value: 6 },
  { id: 'cheese', name: 'Fromage', emoji: '🧀', family: 'dairy', value: 4 },
  { id: 'canned', name: 'Conserves', emoji: '🥫', family: 'produce', value: 3 },
  { id: 'jam', name: 'Confiture', emoji: '🍯', family: 'produce', value: 3 },
];

/** Les familles « réelles » d'aliments (hors coton, fleurs…) peuvent nourrir la ville. */
export function isFood(item: ItemDef): boolean {
  return item.family !== 'other';
}

/** Prix payé par le marchand de passage (vente directe depuis l'inventaire), par unité. */
export function sellPrice(item: ItemDef): number {
  return Math.max(1, Math.round(item.value * 3));
}

const BY_ID = new Map(ITEMS.map((item) => [item.id, item]));

export function findItemDef(id: string): ItemDef | undefined {
  return BY_ID.get(id);
}

export function getItemDef(id: string): ItemDef {
  const item = BY_ID.get(id);
  if (!item) throw new Error(`Produit inconnu : ${id}`);
  return item;
}

/** Quantités de produits (identifiant → nombre). */
export type ItemBag = Record<string, number>;

/** Valeur totale d'un lot de produits. */
export function bagValue(bag: ItemBag): number {
  let total = 0;
  for (const [id, qty] of Object.entries(bag)) total += (findItemDef(id)?.value ?? 1) * qty;
  return total;
}

/** Nombre total d'unités d'un lot. */
export function bagCount(bag: ItemBag): number {
  let total = 0;
  for (const qty of Object.values(bag)) total += qty;
  return total;
}
