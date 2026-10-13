import type { CropDef } from '@/core/types';

export const CROPS: readonly CropDef[] = [
  { id: 'strawberry', name: 'Fraises', growSec: 60, cost: 10, goods: 8, xp: 1 },
  { id: 'wheat', name: 'Blé', growSec: 300, cost: 25, goods: 18, xp: 2, requires: { level: 2 } },
  { id: 'carrot', name: 'Carottes', growSec: 900, cost: 50, goods: 35, xp: 3, requires: { level: 3 } },
  { id: 'corn', name: 'Maïs', growSec: 2700, cost: 90, goods: 70, xp: 4, requires: { level: 5 } },
  { id: 'pumpkin', name: 'Citrouilles', growSec: 7200, cost: 150, goods: 130, xp: 6, requires: { level: 7 } },
];

const BY_ID = new Map(CROPS.map((crop) => [crop.id, crop]));

export function getCropDef(id: string): CropDef {
  const crop = BY_ID.get(id);
  if (!crop) throw new Error(`Culture inconnue : ${id}`);
  return crop;
}
