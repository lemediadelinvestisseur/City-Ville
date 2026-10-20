import type { CropDef, TripDef } from '@/core/types';

const MIN = 60;
const HOUR = 3600;

/**
 * Cultures : plus elles sont longues, plus elles rapportent. Chaque culture
 * donne le produit du même identifiant (src/data/items.ts).
 */
export const CROPS: readonly CropDef[] = [
  { id: 'wheat', name: 'Blé', growSec: 5 * MIN, cost: 10, amount: 10, xp: 1 },
  { id: 'strawberry', name: 'Fraises', growSec: 30 * MIN, cost: 25, amount: 30, xp: 2, requires: { level: 2 } },
  { id: 'flowers', name: 'Fleurs', growSec: 15 * MIN, cost: 15, amount: 20, xp: 2, requires: { level: 2 } },
  { id: 'carrot', name: 'Carottes', growSec: HOUR, cost: 45, amount: 50, xp: 3, requires: { level: 3 } },
  { id: 'corn', name: 'Maïs', growSec: 2 * HOUR, cost: 80, amount: 85, xp: 4, requires: { level: 5 } },
  { id: 'tomato', name: 'Tomates', growSec: 4 * HOUR, cost: 120, amount: 140, xp: 6, requires: { level: 7 } },
  { id: 'cotton', name: 'Coton', growSec: 6 * HOUR, cost: 150, amount: 180, xp: 7, requires: { level: 9 } },
  { id: 'pumpkin', name: 'Citrouilles', growSec: 8 * HOUR, cost: 180, amount: 240, xp: 8, requires: { level: 10 } },
  { id: 'sunflower', name: 'Tournesols', growSec: 12 * HOUR, cost: 250, amount: 330, xp: 10, requires: { level: 14 } },
  { id: 'grape', name: 'Raisin', growSec: 16 * HOUR, cost: 320, amount: 430, xp: 12, requires: { level: 19 } },
  { id: 'apple', name: 'Pommes', growSec: 24 * HOUR, cost: 450, amount: 620, xp: 16, requires: { level: 24 } },
];

/** Expéditions de pêche, selon le bateau du port : elles rapportent du poisson. */
export const TRIPS: readonly TripDef[] = [
  { id: 'coastal', name: 'Sortie côtière', durationSec: 30 * MIN, cost: 40, amount: 45, xp: 3, boatTier: 1 },
  {
    id: 'offshore',
    name: 'Pêche au large',
    durationSec: 3 * HOUR,
    cost: 150,
    amount: 180,
    xp: 8,
    boatTier: 1,
    requires: { level: 8 },
  },
  {
    id: 'night',
    name: 'Marée de nuit',
    durationSec: 8 * HOUR,
    cost: 350,
    amount: 420,
    xp: 15,
    boatTier: 1,
    requires: { level: 15 },
  },
  {
    id: 'trawl',
    name: 'Campagne de chalut',
    durationSec: 6 * HOUR,
    cost: 700,
    amount: 750,
    xp: 25,
    boatTier: 2,
    requires: { level: 12 },
  },
  {
    id: 'campaign',
    name: 'Grande campagne',
    durationSec: 12 * HOUR,
    cost: 1200,
    amount: 1400,
    xp: 40,
    boatTier: 2,
    requires: { level: 18 },
  },
  {
    id: 'industrial',
    name: 'Expédition industrielle',
    durationSec: 24 * HOUR,
    cost: 3000,
    amount: 3200,
    xp: 90,
    boatTier: 3,
    requires: { level: 22 },
  },
];

const CROP_BY_ID = new Map(CROPS.map((crop) => [crop.id, crop]));
const TRIP_BY_ID = new Map(TRIPS.map((trip) => [trip.id, trip]));

export function findCropDef(id: string): CropDef | undefined {
  return CROP_BY_ID.get(id);
}

export function getCropDef(id: string): CropDef {
  const crop = CROP_BY_ID.get(id);
  if (!crop) throw new Error(`Culture inconnue : ${id}`);
  return crop;
}

export function findTripDef(id: string): TripDef | undefined {
  return TRIP_BY_ID.get(id);
}

export function getTripDef(id: string): TripDef {
  const trip = TRIP_BY_ID.get(id);
  if (!trip) throw new Error(`Expédition inconnue : ${id}`);
  return trip;
}
