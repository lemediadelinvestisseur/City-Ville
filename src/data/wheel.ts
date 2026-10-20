import type { Reward } from '@/core/types';

/**
 * Cases de la roue de la chance (dans l'ordre d'affichage). Le poids fixe la
 * probabilité ; les gains suivent le niveau du joueur.
 */
export interface WheelPrize {
  id: 'coinsSmall' | 'coinsBig' | 'energy' | 'items' | 'xp' | 'cash' | 'coinsJackpot';
  weight: number;
}

export const WHEEL_PRIZES: readonly WheelPrize[] = [
  { id: 'coinsSmall', weight: 26 },
  { id: 'energy', weight: 16 },
  { id: 'items', weight: 20 },
  { id: 'xp', weight: 16 },
  { id: 'coinsBig', weight: 14 },
  { id: 'cash', weight: 5 },
  { id: 'coinsJackpot', weight: 3 },
];

/** Gain d'une case (`item` : produit offert pour la case « produits »). */
export function wheelReward(prize: WheelPrize['id'], level: number, item: string): Reward {
  switch (prize) {
    case 'coinsSmall':
      return { coins: 50 + level * 20 };
    case 'coinsBig':
      return { coins: 150 + level * 60 };
    case 'coinsJackpot':
      return { coins: 500 + level * 200 };
    case 'energy':
      return { energy: 5 };
    case 'items':
      return { items: { [item]: 10 + level * 2 } };
    case 'xp':
      return { xp: 10 + level * 2 };
    case 'cash':
      return { cash: 1 };
  }
}
