/** Règles du marché entre joueurs (partagées par le jeu et le serveur). */
export const MARKET = {
  /** Niveau à partir duquel on peut vendre et acheter. */
  minLevel: 5,
  minQty: 10,
  maxQty: 500,
  /** Prix d'une marchandise, en pièces. */
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

/** Vérifie une mise en vente ; renvoie le problème ou null. */
export function checkListing(qty: number, unitPrice: number): ListingProblem | null {
  if (!Number.isInteger(qty) || qty < MARKET.minQty || qty > MARKET.maxQty) return 'qty';
  if (!Number.isInteger(unitPrice) || unitPrice < MARKET.minUnitPrice || unitPrice > MARKET.maxUnitPrice) {
    return 'price';
  }
  return null;
}
