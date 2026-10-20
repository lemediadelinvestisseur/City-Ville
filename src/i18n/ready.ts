import type { ReminderKind } from '@/core/reminders';
import { buildingName, cropName } from './content';
import { t, tn } from './index';

/** Ce qui est prêt : type, nombre et, pour un seul élément, de quoi le nommer. */
export interface ReadySummary {
  kind: ReminderKind;
  count: number;
  defId?: string;
  cropId?: string;
}

/** Phrase « c'est prêt » (messages en jeu, centre de notifications, notifications de l'appareil). */
export function readyMessage({ kind, count, defId, cropId }: ReadySummary): string {
  switch (kind) {
    case 'crop':
      return tn('ready.crop', count, { crop: cropId ? cropName(cropId) : '' });
    case 'build':
      return tn('ready.build', count, { name: defId ? buildingName(defId) : '' });
    case 'boat':
      return tn('ready.boat', count);
    case 'train':
      return tn('ready.train', count);
    case 'business':
      return tn('ready.business', count, { name: defId ? buildingName(defId) : '' });
    case 'energy':
      return t('ready.energy');
    case 'daily':
      return t('ready.daily');
  }
}
