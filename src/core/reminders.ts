import { ENERGY_REGEN_SEC } from '@/data/balance';
import { localDay } from './daily';
import type { Game, ReadyKind } from './game';

/**
 * Rappels à programmer en notifications : quand une culture, un chantier,
 * un bateau, un train, un atelier ou un commerce sera prêt, quand la ville aura
 * faim, quand l'énergie sera pleine et quand
 * de nouveaux défis du jour arrivent. Calcul pur (testable) ; l'application
 * se charge des textes et de la programmation sur l'appareil.
 */

export type ReminderKind = ReadyKind | 'meal' | 'energy' | 'daily';

export const REMINDER_KINDS: readonly ReminderKind[] = [
  'crop',
  'build',
  'boat',
  'train',
  'business',
  'energy',
  'daily',
];

export interface Reminder {
  at: number;
  kind: ReminderKind;
  /** Nombre d'éléments regroupés (« 4 champs sont prêts »). */
  count: number;
  /** Bâtiment, culture ou expédition du premier élément (pour un message précis). */
  defId?: string;
  cropId?: string;
}

export interface ReminderOptions {
  kinds: Record<ReminderKind, boolean>;
  /** Pas de notification entre 22 h et 8 h (heure locale) : décalées à 8 h. */
  quietHours: boolean;
}

/** Les éléments prêts à moins de 10 minutes d'écart sont annoncés ensemble. */
const GROUP_WINDOW_MS = 10 * 60_000;
/** iOS limite les notifications programmées : on garde les plus proches. */
const MAX_REMINDERS = 24;
/** Heure des nouveaux défis du jour (le lendemain matin). */
const DAILY_HOUR = 9;
const QUIET_START = 22;
const QUIET_END = 8;

/** Décale un instant tombant pendant les heures calmes à la fin de celles-ci. */
export function outOfQuietHours(at: number): number {
  const d = new Date(at);
  const hour = d.getHours();
  if (hour >= QUIET_START) return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, QUIET_END).getTime();
  if (hour < QUIET_END) return new Date(d.getFullYear(), d.getMonth(), d.getDate(), QUIET_END).getTime();
  return at;
}

export function planReminders(game: Game, now: number, options: ReminderOptions): Reminder[] {
  const raw: Reminder[] = [];
  const add = (reminder: Reminder) => {
    if (options.kinds[reminder.kind] && reminder.at > now + 15_000) raw.push(reminder);
  };
  for (const entity of game.state.entities) {
    if (!entity.built && entity.construction) {
      add({ at: entity.construction.endsAt, kind: 'build', count: 1, defId: entity.defId });
    }
    if (entity.farm?.cropId) add({ at: entity.farm.readyAt, kind: 'crop', count: 1, cropId: entity.farm.cropId });
    if (entity.port?.tripId) add({ at: entity.port.readyAt, kind: 'boat', count: 1, defId: entity.defId });
    if (entity.station?.reward) add({ at: entity.station.readyAt, kind: 'train', count: 1 });
    if (entity.producer?.recipeId) {
      add({ at: entity.producer.readyAt, kind: 'production', count: 1, defId: entity.defId });
    }
    if (entity.business && entity.business.readyAt !== null) {
      add({ at: entity.business.readyAt, kind: 'business', count: 1, defId: entity.defId });
    }
  }
  // La ville aura faim : il est temps de servir le repas suivant.
  add({ at: game.state.meals.fedUntil, kind: 'meal', count: 1 });
  const { energy } = game.state;
  const max = game.derived().energyMax;
  // Seulement si la jauge est bien entamée (sinon le rappel n'apporte rien).
  if (energy <= max / 2) {
    const full = game.state.energyUpdatedAt + (max - energy) * ENERGY_REGEN_SEC * 1000;
    add({ at: full, kind: 'energy', count: 1 });
  }
  if (game.dailyInfo().available) {
    const d = new Date(now);
    const tomorrow = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, DAILY_HOUR).getTime();
    if (localDay(tomorrow) !== localDay(now)) add({ at: tomorrow, kind: 'daily', count: 1 });
  }

  const shifted = raw
    .map((r) => (options.quietHours ? { ...r, at: outOfQuietHours(r.at) } : r))
    .sort((a, b) => a.at - b.at);
  const grouped: Reminder[] = [];
  const openGroups = new Map<ReminderKind, { reminder: Reminder; start: number }>();
  for (const reminder of shifted) {
    const group = openGroups.get(reminder.kind);
    if (group && reminder.at - group.start <= GROUP_WINDOW_MS) {
      // Un seul rappel quand tout le groupe est prêt.
      group.reminder.count += reminder.count;
      group.reminder.at = reminder.at;
      continue;
    }
    const copy = { ...reminder };
    grouped.push(copy);
    openGroups.set(reminder.kind, { reminder: copy, start: reminder.at });
  }
  return grouped.sort((a, b) => a.at - b.at).slice(0, MAX_REMINDERS);
}
