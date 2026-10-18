import { GAME_TITLE } from '@/config';
import type { Game } from '@/core/game';
import { planReminders } from '@/core/reminders';
import { readyMessage } from '@/i18n/ready';
import type { DeviceNotifier } from '@/services/notifications';
import type { Preferences } from '@/services/preferences';

/** Les rappels sont recalculés peu après chaque changement de la partie. */
const RESCHEDULE_DELAY_MS = 3000;

/**
 * Programme les notifications de l'appareil d'après l'état de la ville :
 * à chaque changement (culture plantée, chantier lancé…), quand le jeu passe
 * en arrière-plan et quand les réglages changent.
 */
export class ReminderScheduler {
  private timer = 0;
  private started = false;

  constructor(
    private readonly game: Game,
    private readonly notifier: DeviceNotifier,
    private readonly prefs: Preferences,
  ) {}

  start(): void {
    if (this.started || this.notifier.kind === 'none') return;
    this.started = true;
    this.game.events.on('change', () => this.soon());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void this.reschedule();
    });
    void this.reschedule();
  }

  /** Recalcule bientôt (regroupe les changements rapprochés). */
  soon(): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.reschedule(), RESCHEDULE_DELAY_MS);
  }

  async reschedule(): Promise<void> {
    window.clearTimeout(this.timer);
    const { enabled, kinds, quietHours } = this.prefs.notifications;
    try {
      if (!enabled || (await this.notifier.permission()) !== 'granted') {
        await this.notifier.replace([]);
        return;
      }
      const reminders = planReminders(this.game, Date.now(), { kinds, quietHours });
      await this.notifier.replace(
        reminders.map((reminder, index) => ({
          id: index + 1,
          at: reminder.at,
          title: GAME_TITLE,
          body: readyMessage(reminder),
        })),
      );
    } catch (error) {
      console.warn('Programmation des notifications impossible', error);
    }
  }

  /** Notification d'essai, quelques secondes plus tard (outils de test). */
  async test(body: string): Promise<void> {
    await this.notifier.replace([{ id: 999, at: Date.now() + 5000, title: GAME_TITLE, body }]);
  }
}
