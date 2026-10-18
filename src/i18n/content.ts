import type { BuildingCategory, BuildingDef, CropDef, QuestDef, TripDef } from '@/core/types';
import { findBuildingDef, SHOP_CATEGORIES } from '@/data/buildings';
import { findCropDef, findTripDef } from '@/data/crops';
import type { CashOffer, StoreProduct } from '@/data/products';
import { findQuestDef } from '@/data/quests';
import { contentTranslations } from './index';

/**
 * Noms et textes du contenu du jeu dans la langue active. Les données
 * (src/data) restent en français, langue source, utilisée en repli.
 */

export function buildingName(def: BuildingDef | string): string {
  const d = typeof def === 'string' ? findBuildingDef(def) : def;
  if (!d) return String(def);
  return contentTranslations()?.buildings[d.id]?.name ?? d.name;
}

export function buildingDescription(def: BuildingDef): string {
  return contentTranslations()?.buildings[def.id]?.description ?? def.description;
}

export function categoryLabel(id: BuildingCategory): string {
  return contentTranslations()?.categories[id] ?? SHOP_CATEGORIES.find((c) => c.id === id)?.label ?? String(id);
}

export function cropName(crop: CropDef | string): string {
  const c = typeof crop === 'string' ? findCropDef(crop) : crop;
  if (!c) return String(crop);
  return contentTranslations()?.crops[c.id] ?? c.name;
}

export function tripName(trip: TripDef | string): string {
  const d = typeof trip === 'string' ? findTripDef(trip) : trip;
  if (!d) return String(trip);
  return contentTranslations()?.trips[d.id] ?? d.name;
}

export function questTitle(quest: QuestDef | string): string {
  const q = typeof quest === 'string' ? findQuestDef(quest) : quest;
  if (!q) return String(quest);
  return contentTranslations()?.quests[q.id]?.title ?? q.title;
}

export function questIntro(quest: QuestDef): string {
  return contentTranslations()?.quests[quest.id]?.intro ?? quest.intro;
}

export function questLabels(quest: QuestDef): string[] {
  const labels = contentTranslations()?.quests[quest.id]?.labels;
  return quest.labels.map((label, i) => labels?.[i] ?? label);
}

export function productTitle(product: StoreProduct): string {
  return contentTranslations()?.products[product.id]?.title ?? product.title;
}

export function productDescription(product: StoreProduct): string {
  return contentTranslations()?.products[product.id]?.description ?? product.description;
}

export function productBadge(product: StoreProduct): string | undefined {
  if (!product.badge) return undefined;
  return contentTranslations()?.products[product.id]?.badge ?? product.badge;
}

export function offerTitle(offer: CashOffer): string {
  return contentTranslations()?.offers[offer.id]?.title ?? offer.title;
}

export function offerDescription(offer: CashOffer): string {
  return contentTranslations()?.offers[offer.id]?.description ?? offer.description;
}

/** Texte d'une enseigne de bâtiment (indexé par le texte français). */
export function signText(french: string): string {
  return contentTranslations()?.signs[french] ?? french;
}
