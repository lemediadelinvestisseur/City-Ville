import type { CropDef, ShipmentDef, TripDef } from '@/core/types';

const MIN = 60;
const HOUR = 3600;

/** Cultures : plus elles sont longues, plus elles rapportent de marchandises. */
export const CROPS: readonly CropDef[] = [
  { id: 'strawberry', name: 'Fraises', growSec: 5 * MIN, cost: 10, goods: 10, xp: 1 },
  { id: 'wheat', name: 'Blé', growSec: 30 * MIN, cost: 25, goods: 30, xp: 2, requires: { level: 2 } },
  { id: 'carrot', name: 'Carottes', growSec: HOUR, cost: 45, goods: 50, xp: 3, requires: { level: 3 } },
  { id: 'corn', name: 'Maïs', growSec: 2 * HOUR, cost: 80, goods: 85, xp: 4, requires: { level: 5 } },
  { id: 'tomato', name: 'Tomates', growSec: 4 * HOUR, cost: 120, goods: 140, xp: 6, requires: { level: 7 } },
  { id: 'pumpkin', name: 'Citrouilles', growSec: 8 * HOUR, cost: 180, goods: 240, xp: 8, requires: { level: 10 } },
  { id: 'sunflower', name: 'Tournesols', growSec: 12 * HOUR, cost: 250, goods: 330, xp: 10, requires: { level: 14 } },
  { id: 'grape', name: 'Raisin', growSec: 16 * HOUR, cost: 320, goods: 430, xp: 12, requires: { level: 19 } },
  { id: 'apple', name: 'Pommes', growSec: 24 * HOUR, cost: 450, goods: 620, xp: 16, requires: { level: 24 } },
];

/** Expéditions de pêche, selon le bateau du port. */
export const TRIPS: readonly TripDef[] = [
  { id: 'coastal', name: 'Sortie côtière', durationSec: 30 * MIN, cost: 40, goods: 45, xp: 3, boatTier: 1 },
  {
    id: 'offshore',
    name: 'Pêche au large',
    durationSec: 3 * HOUR,
    cost: 150,
    goods: 180,
    xp: 8,
    boatTier: 1,
    requires: { level: 8 },
  },
  {
    id: 'night',
    name: 'Marée de nuit',
    durationSec: 8 * HOUR,
    cost: 350,
    goods: 420,
    xp: 15,
    boatTier: 1,
    requires: { level: 15 },
  },
  {
    id: 'trawl',
    name: 'Campagne de chalut',
    durationSec: 6 * HOUR,
    cost: 700,
    goods: 750,
    xp: 25,
    boatTier: 2,
    requires: { level: 12 },
  },
  {
    id: 'campaign',
    name: 'Grande campagne',
    durationSec: 12 * HOUR,
    cost: 1200,
    goods: 1400,
    xp: 40,
    boatTier: 2,
    requires: { level: 18 },
  },
  {
    id: 'industrial',
    name: 'Expédition industrielle',
    durationSec: 24 * HOUR,
    cost: 3000,
    goods: 3200,
    xp: 90,
    boatTier: 3,
    requires: { level: 22 },
  },
];

/**
 * Livraisons par le train (gare) : elles écoulent les marchandises en trop.
 * Moins rentables qu'un commerce (5 à 7 pièces par marchandise), mais sans limite.
 */
export const SHIPMENTS: readonly ShipmentDef[] = [
  { id: 'local', name: 'Livraison locale', durationSec: 30 * MIN, goods: 40, coins: 220, xp: 3 },
  { id: 'regional', name: 'Train régional', durationSec: 2 * HOUR, goods: 120, coins: 720, xp: 6 },
  {
    id: 'freight',
    name: 'Train de marchandises',
    durationSec: 6 * HOUR,
    goods: 320,
    coins: 2000,
    xp: 12,
    requires: { level: 14 },
  },
  {
    id: 'convoy',
    name: 'Grand convoi',
    durationSec: 12 * HOUR,
    goods: 700,
    coins: 4600,
    xp: 22,
    requires: { level: 20 },
  },
];

const CROP_BY_ID = new Map(CROPS.map((crop) => [crop.id, crop]));
const TRIP_BY_ID = new Map(TRIPS.map((trip) => [trip.id, trip]));
const SHIPMENT_BY_ID = new Map(SHIPMENTS.map((shipment) => [shipment.id, shipment]));

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

export function findShipmentDef(id: string): ShipmentDef | undefined {
  return SHIPMENT_BY_ID.get(id);
}

export function getShipmentDef(id: string): ShipmentDef {
  const shipment = SHIPMENT_BY_ID.get(id);
  if (!shipment) throw new Error(`Livraison inconnue : ${id}`);
  return shipment;
}
