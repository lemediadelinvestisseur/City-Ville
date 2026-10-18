import { DAY_NIGHT_MODES, type DayNightMode } from '@/core/dayNight';
import { REMINDER_KINDS, type ReminderKind } from '@/core/reminders';
import type { KeyValueStorage } from '@/core/save';
import { isLanguage, type Language } from '@/data/languages';

const DAY_NIGHT_KEY = 'city-ville:dayNight';
const LANGUAGE_KEY = 'city-ville:lang';
const NOTIFICATIONS_KEY = 'city-ville:notifications';

/** Réglages des notifications de l'appareil (rappels quand quelque chose est prêt). */
export interface NotificationPrefs {
  /** Le joueur veut des notifications (l'autorisation du système reste nécessaire). */
  enabled: boolean;
  /** Nombre de fois où le jeu a proposé de les activer, et quand pour la dernière fois. */
  asked: number;
  lastAskedAt: number;
  kinds: Record<ReminderKind, boolean>;
  quietHours: boolean;
}

function defaultNotifications(): NotificationPrefs {
  return {
    enabled: false,
    asked: 0,
    lastAskedAt: 0,
    kinds: Object.fromEntries(REMINDER_KINDS.map((kind) => [kind, true])) as Record<ReminderKind, boolean>,
    quietHours: true,
  };
}

/** Préférences propres à l'appareil (pas dans la sauvegarde de la partie). */
export class Preferences {
  dayNight: DayNightMode;
  /** Langue choisie par le joueur (null : jamais choisie, langue de l'appareil). */
  language: Language | null;
  notifications: NotificationPrefs;

  constructor(private readonly storage: KeyValueStorage) {
    const saved = storage.getItem(DAY_NIGHT_KEY);
    this.dayNight = DAY_NIGHT_MODES.find((mode) => mode === saved) ?? 'cycle';
    const lang = storage.getItem(LANGUAGE_KEY);
    this.language = isLanguage(lang) ? lang : null;
    this.notifications = defaultNotifications();
    try {
      const raw = storage.getItem(NOTIFICATIONS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
        this.notifications = {
          ...this.notifications,
          ...parsed,
          kinds: { ...this.notifications.kinds, ...parsed.kinds },
        };
      }
    } catch {
      // Réglages illisibles : valeurs par défaut.
    }
  }

  private save(key: string, value: string): void {
    try {
      this.storage.setItem(key, value);
    } catch {
      // Préférence non persistée : sans gravité.
    }
  }

  setDayNight(mode: DayNightMode): void {
    this.dayNight = mode;
    this.save(DAY_NIGHT_KEY, mode);
  }

  setLanguage(code: Language): void {
    this.language = code;
    this.save(LANGUAGE_KEY, code);
  }

  setNotifications(update: Partial<NotificationPrefs>): void {
    this.notifications = { ...this.notifications, ...update };
    this.save(NOTIFICATIONS_KEY, JSON.stringify(this.notifications));
  }
}
