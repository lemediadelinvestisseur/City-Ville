import type { FailReason } from '@/core/types';
import { formatNumber } from './format';

/** Message lisible pour un échec d'action. */
export function failMessage(reason: FailReason, missing?: number): string {
  const n = missing !== undefined ? formatNumber(missing) : '';
  switch (reason) {
    case 'notEnoughCoins':
      return missing ? `Il vous manque ${n} pièces.` : 'Pas assez de pièces.';
    case 'notEnoughCash':
      return missing ? `Il vous manque ${n} cash.` : 'Pas assez de cash.';
    case 'notEnoughGoods':
      return missing
        ? `Il manque ${n} marchandises : récoltez vos champs !`
        : 'Pas assez de marchandises : récoltez vos champs !';
    case 'notEnoughEnergy':
      return 'Plus d’énergie ! Elle se recharge avec le temps.';
    case 'levelLocked':
      return 'Niveau insuffisant.';
    case 'populationLocked':
      return 'Pas encore assez d’habitants.';
    case 'populationCap':
      return 'Population maximale atteinte : construisez un bâtiment public (école…).';
    case 'blocked':
      return 'Emplacement déjà occupé.';
    case 'outOfBounds':
      return 'Hors de la carte.';
    case 'locked':
      return 'Cette zone n’est pas encore achetée.';
    case 'notReady':
      return 'Pas encore prêt.';
    case 'storageFull':
      return 'Entrepôt plein ! Approvisionnez vos commerces ou construisez une grange.';
    case 'notSellable':
      return 'Cette construction ne peut pas être vendue.';
    case 'alreadyOwned':
      return 'Offre déjà achetée.';
    case 'energyFull':
      return 'Votre énergie est déjà au maximum.';
    case 'onWater':
      return 'Impossible de construire sur l’eau.';
    case 'needsWater':
      return 'Cette construction doit toucher l’eau.';
    case 'bridgeSpan':
      return 'Le pont doit enjamber le bras de mer, d’une rive à l’autre.';
    case 'needsBridge':
      return 'Construisez d’abord un pont pour rejoindre la rive est.';
    case 'invalid':
      return 'Action impossible.';
  }
}
