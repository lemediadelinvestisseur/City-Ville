import type { ReminderScheduler } from '@/app/reminders';
import type { Game } from '@/core/game';
import { REMINDER_KINDS, type ReminderKind } from '@/core/reminders';
import { getBuildingDef } from '@/data/buildings';
import { getCropDef } from '@/data/crops';
import { t } from '@/i18n';
import type { DeviceNotifier } from '@/services/notifications';
import type { Preferences } from '@/services/preferences';
import { h, icon } from './dom';
import { Icons } from './icons';
import type { Modals } from './Modals';
import type { ToastKind } from './Toasts';

/** Le jeu propose d'activer les notifications au plus deux fois, à 3 jours d'écart. */
const MAX_ASKS = 2;
const ASK_AGAIN_MS = 3 * 86_400_000;
/** Une attente d'au moins 10 minutes justifie de proposer un rappel. */
const LONG_WAIT_SEC = 10 * 60;

interface Deps {
  game: Game;
  notifier: DeviceNotifier;
  prefs: Preferences;
  scheduler: ReminderScheduler;
  modals: Modals;
  toast: (text: string, kind: ToastKind) => void;
}

/**
 * Notifications de l'appareil côté interface : proposition d'activation au bon
 * moment (quand le joueur lance quelque chose de long), puis réglages.
 */
export class NotificationsUi {
  constructor(private readonly deps: Deps) {
    deps.game.events.on('gameplay', (event) => {
      let wait = 0;
      if (event.type === 'plant') wait = getCropDef(event.cropId).growSec;
      else if (event.type === 'place') wait = getBuildingDef(event.defId).buildSec;
      else if (event.type === 'sendBoat' || event.type === 'sendTrain') wait = LONG_WAIT_SEC;
      if (wait >= LONG_WAIT_SEC) void this.maybeAsk();
    });
  }

  /** Propose d'activer les notifications si c'est le bon moment. */
  private async maybeAsk(): Promise<void> {
    const { prefs, notifier, game } = this.deps;
    const { enabled, asked, lastAskedAt } = prefs.notifications;
    if (notifier.kind === 'none' || enabled || !game.state.tutorial.introSeen) return;
    if (asked >= MAX_ASKS || (asked > 0 && Date.now() - lastAskedAt < ASK_AGAIN_MS)) return;
    const permission = await notifier.permission();
    if (permission === 'denied' || permission === 'unsupported') return;
    prefs.setNotifications({ asked: asked + 1, lastAskedAt: Date.now() });
    this.deps.modals.show({
      title: t('notif.askTitle'),
      kicker: t('notif.askKicker'),
      avatar: true,
      body: [
        h('p', { text: t('notif.askBody') }),
        notifier.kind === 'web' ? h('p', { class: 'muted small', text: t('notif.webHint') }) : null,
      ],
      buttons: [
        { label: t('notif.askNo'), kind: 'secondary' },
        { label: t('notif.askYes'), onClick: () => void this.enable() },
      ],
    });
  }

  /** Active les notifications (demande l'autorisation du système si besoin). */
  private async enable(): Promise<boolean> {
    const { notifier, prefs, scheduler, toast } = this.deps;
    let permission = await notifier.permission();
    if (permission === 'prompt') permission = await notifier.request();
    if (permission !== 'granted') {
      toast(permission === 'unsupported' ? t('notif.unsupported') : t('notif.denied'), 'error');
      return false;
    }
    prefs.setNotifications({ enabled: true });
    void scheduler.reschedule();
    toast(t('notif.enabled'), 'success');
    return true;
  }

  /** Section « Notifications » des réglages. */
  settingsSection(): HTMLElement {
    const { notifier, prefs, scheduler } = this.deps;
    const section = h('div', { class: 'settings__notifications' });
    const render = () => {
      section.replaceChildren();
      const { enabled, kinds, quietHours } = prefs.notifications;
      const toggle = h('button', {
        class: 'btn btn--secondary',
        text: enabled ? t('notif.on') : t('notif.off'),
        onClick: () => {
          if (enabled) {
            prefs.setNotifications({ enabled: false });
            void scheduler.reschedule();
            render();
          } else {
            void this.enable().then(render);
          }
        },
      });
      section.append(h('div', { class: 'modal__section-title' }, icon(Icons.bell), ` ${t('notif.section')}`));
      if (notifier.kind === 'none') {
        // Safari sur iPhone : les notifications n'existent que pour le jeu ajouté à l'écran d'accueil.
        const iosTab = /iPhone|iPad|iPod/i.test(navigator.userAgent);
        section.append(
          h('p', { class: 'muted settings__hint', text: t(iosTab ? 'notif.iosInstall' : 'notif.unsupported') }),
        );
        return;
      }
      section.append(toggle);
      if (notifier.kind === 'web') section.append(h('p', { class: 'muted settings__hint', text: t('notif.webHint') }));
      if (!enabled) return;
      const checkbox = (label: string, checked: boolean, onChange: (value: boolean) => void) => {
        const input = h('input', { attrs: { type: 'checkbox' } });
        input.checked = checked;
        input.addEventListener('change', () => {
          onChange(input.checked);
          void scheduler.reschedule();
        });
        return h('label', { class: 'check' }, input, h('span', { text: label }));
      };
      section.append(
        h(
          'div',
          { class: 'checks' },
          ...REMINDER_KINDS.map((kind: ReminderKind) =>
            checkbox(t(`notif.kind.${kind}`), kinds[kind], (value) =>
              prefs.setNotifications({ kinds: { ...prefs.notifications.kinds, [kind]: value } }),
            ),
          ),
          checkbox(t('notif.quiet'), quietHours, (value) => prefs.setNotifications({ quietHours: value })),
        ),
      );
    };
    render();
    return section;
  }
}
