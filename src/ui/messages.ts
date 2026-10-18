import type { PseudoError } from '@/core/pseudo';
import { PSEUDO_MAX, PSEUDO_MIN } from '@/core/pseudo';
import type { FailReason } from '@/core/types';
import { MARKET, type ListingProblem } from '@/data/market';
import { t, tn } from '@/i18n';
import { BackendError } from '@/services/online/Backend';

/** Message lisible pour un échec d'action. */
export function failMessage(reason: FailReason, missing?: number): string {
  switch (reason) {
    case 'notEnoughCoins':
      return missing ? tn('fail.missingCoins', missing) : t('fail.notEnoughCoins');
    case 'notEnoughCash':
      return missing ? tn('fail.missingCash', missing) : t('fail.notEnoughCash');
    case 'notEnoughGoods':
      return missing ? tn('fail.missingGoods', missing) : t('fail.notEnoughGoods');
    default:
      return t(`fail.${reason}`);
  }
}

export function pseudoErrorMessage(error: PseudoError | 'taken'): string {
  switch (error) {
    case 'tooShort':
      return t('pseudo.tooShort', { n: PSEUDO_MIN });
    case 'tooLong':
      return t('pseudo.tooLong', { n: PSEUDO_MAX });
    default:
      return t(`pseudo.${error}`);
  }
}

/** Message d'erreur d'un service en ligne (codes renvoyés par le serveur). */
export function backendErrorMessage(error: unknown): string {
  const code = error instanceof BackendError ? error.code : 'unknown';
  switch (code) {
    case 'tooLarge':
    case 'invalidSave':
      return t('error.unknown');
    default:
      return t(`error.${code}`);
  }
}

export function listingProblemMessage(problem: ListingProblem): string {
  return problem === 'qty'
    ? t('market.errorQty', { min: MARKET.minQty, max: MARKET.maxQty })
    : t('market.errorPrice', { min: MARKET.minUnitPrice, max: MARKET.maxUnitPrice });
}
