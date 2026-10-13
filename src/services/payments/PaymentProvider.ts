import type { StoreProduct } from '@/data/products';

/**
 * Abstraction du paiement. Le jeu ne connaît que cette interface ; chaque
 * plateforme fournit son implémentation :
 *  - Web : Stripe Checkout / Payment Element (via un backend) ;
 *  - Android / iOS (Capacitor) : Google Play Billing / StoreKit, idéalement via RevenueCat ;
 *  - Prototype : MockPaymentProvider (aucun débit réel).
 *
 * En production, la récompense ne doit être créditée qu'après validation du
 * reçu par le serveur (voir docs/MONETIZATION.md).
 */
export type PurchaseResult =
  | { status: 'success'; productId: string; transactionId: string }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

export interface PaymentProvider {
  /** Nom affiché (ex. « Mode test »). */
  readonly label: string;
  /** Vrai si aucun paiement réel n'est effectué. */
  readonly isTestMode: boolean;
  /** Prix localisé (fourni par la boutique de la plateforme quand elle est disponible). */
  priceLabel(product: StoreProduct): string;
  purchase(product: StoreProduct): Promise<PurchaseResult>;
}
