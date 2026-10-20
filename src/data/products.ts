import type { Reward } from '@/core/types';

/**
 * Produits vendus contre de l'argent réel (via un fournisseur de paiement).
 * Les prix réels seront fournis par la boutique de la plateforme (App Store,
 * Google Play, Stripe…) ; `priceLabel` sert d'affichage par défaut.
 */
export interface StoreProduct {
  id: string;
  title: string;
  description: string;
  priceLabel: string;
  reward: Reward;
  /** Ouvriers supplémentaires (chantiers menés en même temps). */
  workers?: number;
  /** Achat possible une seule fois (pack de démarrage). */
  oneTime?: boolean;
  badge?: string;
}

export const STORE_PRODUCTS: readonly StoreProduct[] = [
  {
    id: 'starter_pack',
    title: 'Pack de démarrage',
    description: '30 cash + 5 000 pièces + 10 énergie',
    priceLabel: '2,99 €',
    reward: { cash: 30, coins: 5000, energy: 10 },
    oneTime: true,
    badge: 'Offre unique',
  },
  {
    id: 'worker_2',
    title: 'Deuxième ouvrier',
    description: 'Deux chantiers en même temps, pour toujours',
    priceLabel: '4,99 €',
    reward: {},
    workers: 1,
    oneTime: true,
    badge: 'Offre unique',
  },
  {
    id: 'cash_10',
    title: '10 cash',
    description: 'Une petite poignée de billets',
    priceLabel: '0,99 €',
    reward: { cash: 10 },
  },
  {
    id: 'cash_55',
    title: '55 cash',
    description: '+10 % offerts',
    priceLabel: '4,99 €',
    reward: { cash: 55 },
  },
  {
    id: 'cash_120',
    title: '120 cash',
    description: '+20 % offerts',
    priceLabel: '9,99 €',
    reward: { cash: 120 },
    badge: 'Populaire',
  },
  {
    id: 'cash_260',
    title: '260 cash',
    description: '+30 % offerts',
    priceLabel: '19,99 €',
    reward: { cash: 260 },
    badge: 'Meilleure offre',
  },
];

/** Offres payées en cash (monnaie premium du jeu). */
export interface CashOffer {
  id: string;
  title: string;
  description: string;
  cash: number;
  reward: Reward | 'energyRefill';
}

export const CASH_OFFERS: readonly CashOffer[] = [
  { id: 'coins_1000', title: '1 000 pièces', description: 'Un petit coup de pouce', cash: 5, reward: { coins: 1000 } },
  { id: 'coins_6000', title: '6 000 pièces', description: '+20 % offerts', cash: 25, reward: { coins: 6000 } },
  { id: 'coins_15000', title: '15 000 pièces', description: '+50 % offerts', cash: 50, reward: { coins: 15000 } },
  { id: 'energy_5', title: '+5 énergie', description: 'Pour continuer à jouer', cash: 4, reward: { energy: 5 } },
  { id: 'energy_full', title: 'Énergie au max', description: 'Recharge complète', cash: 10, reward: 'energyRefill' },
];

export function findStoreProduct(id: string): StoreProduct | undefined {
  return STORE_PRODUCTS.find((p) => p.id === id);
}

export function findCashOffer(id: string): CashOffer | undefined {
  return CASH_OFFERS.find((o) => o.id === id);
}
