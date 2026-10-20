import { findItemDef } from './items';

/** Règles du marché entre joueurs (partagées par le jeu et le serveur). */
export const MARKET = {
  /** Niveau à partir duquel on peut vendre et acheter. */
  minLevel: 5,
  minQty: 10,
  maxQty: 500,
  /** Prix d'un produit de base, en pièces (×valeur du produit pour les produits transformés). */
  minUnitPrice: 1,
  maxUnitPrice: 12,
  /** Lots en vente en même temps par joueur. */
  maxListings: 5,
  /** Un lot invendu revient au vendeur au bout de… */
  durationMs: 48 * 3600 * 1000,
  /** Taxe prélevée sur les ventes (retire des pièces du jeu). */
  taxPercent: 10,
} as const;

/** Montant reçu par le vendeur pour une vente. */
export function sellerIncome(qty: number, unitPrice: number): number {
  return Math.floor(qty * unitPrice * (1 - MARKET.taxPercent / 100));
}

/** Problème d'une mise en vente : quantité ou prix hors des bornes. */
export type ListingProblem = 'qty' | 'price';

/** Prix maximal d'une unité de ce produit (un gâteau vaut plus qu'un épi de blé). */
export function maxUnitPrice(item: string): number {
  return Math.ceil(MARKET.maxUnitPrice * (findItemDef(item)?.value ?? 1));
}

/** Vérifie une mise en vente ; renvoie le problème ou null. */
export function checkListing(item: string, qty: number, unitPrice: number): ListingProblem | 'item' | null {
  if (!findItemDef(item)) return 'item';
  if (!Number.isInteger(qty) || qty < MARKET.minQty || qty > MARKET.maxQty) return 'qty';
  if (!Number.isInteger(unitPrice) || unitPrice < MARKET.minUnitPrice || unitPrice > maxUnitPrice(item)) {
    return 'price';
  }
  return null;
}

/** Produit d'un lot (les lots d'avant les produits étaient des marchandises : du blé). */
export function listingItem(item: string | undefined): string {
  return item && findItemDef(item) ? item : 'wheat';
}
