import type { StoreProduct } from '@/data/products';
import type { PaymentProvider, PurchaseResult } from './PaymentProvider';

/**
 * Fournisseur factice pour le prototype : demande une confirmation explicite
 * (« paiement simulé ») puis renvoie un succès. Aucune donnée bancaire n'est demandée.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly label = 'Mode test';
  readonly isTestMode = true;

  constructor(private readonly confirm: (product: StoreProduct) => Promise<boolean>) {}

  priceLabel(product: StoreProduct): string {
    return product.priceLabel;
  }

  async purchase(product: StoreProduct): Promise<PurchaseResult> {
    const accepted = await this.confirm(product);
    if (!accepted) return { status: 'cancelled' };
    await new Promise((resolve) => setTimeout(resolve, 450));
    return { status: 'success', productId: product.id, transactionId: `test_${Date.now().toString(36)}` };
  }
}
