import { isNativeApp } from './native';

/**
 * Notifications de l'appareil (« vos fraises sont prêtes ! »), programmées à
 * l'avance pour arriver même quand le jeu est fermé.
 *  - Application iOS : notifications locales du système (plugin Capacitor).
 *  - Navigateur : API Notification, tant que l'onglet du jeu reste ouvert
 *    (sans serveur d'envoi, une page fermée ne peut rien afficher).
 */

export type NotificationPermission = 'granted' | 'denied' | 'prompt' | 'unsupported';

export interface ScheduledNotification {
  /** Identifiant entier (exigé par iOS), unique dans la liste. */
  id: number;
  at: number;
  title: string;
  body: string;
}

export interface DeviceNotifier {
  readonly kind: 'native' | 'web' | 'none';
  permission(): Promise<NotificationPermission>;
  /** Demande l'autorisation au système (fenêtre de l'appareil ou du navigateur). */
  request(): Promise<NotificationPermission>;
  /** Remplace toutes les notifications programmées par cette liste. */
  replace(list: ScheduledNotification[]): Promise<void>;
}

class NativeNotifier implements DeviceNotifier {
  readonly kind = 'native' as const;
  private plugin = import('@capacitor/local-notifications').then((m) => m.LocalNotifications);

  private static state(display: string): NotificationPermission {
    if (display === 'granted') return 'granted';
    if (display === 'denied') return 'denied';
    return 'prompt';
  }

  async permission(): Promise<NotificationPermission> {
    try {
      return NativeNotifier.state((await (await this.plugin).checkPermissions()).display);
    } catch {
      return 'unsupported';
    }
  }

  async request(): Promise<NotificationPermission> {
    try {
      return NativeNotifier.state((await (await this.plugin).requestPermissions()).display);
    } catch {
      return 'unsupported';
    }
  }

  async replace(list: ScheduledNotification[]): Promise<void> {
    const plugin = await this.plugin;
    const pending = await plugin.getPending();
    if (pending.notifications.length > 0) {
      await plugin.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    }
    if (list.length === 0) return;
    await plugin.schedule({
      notifications: list.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        schedule: { at: new Date(n.at), allowWhileIdle: true },
      })),
    });
  }
}

class WebNotifier implements DeviceNotifier {
  readonly kind = 'web' as const;
  private timers: number[] = [];

  async permission(): Promise<NotificationPermission> {
    return Notification.permission === 'default' ? 'prompt' : Notification.permission;
  }

  async request(): Promise<NotificationPermission> {
    const result = await Notification.requestPermission();
    return result === 'default' ? 'prompt' : result;
  }

  async replace(list: ScheduledNotification[]): Promise<void> {
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers = [];
    const now = Date.now();
    for (const n of list) {
      const delay = n.at - now;
      // Au-delà de ~24 jours, setTimeout déborde : la liste est recalculée bien avant.
      if (delay < 0 || delay > 2_000_000_000) continue;
      this.timers.push(
        window.setTimeout(() => {
          // Jeu au premier plan : les messages en jeu suffisent.
          if (document.visibilityState === 'visible' || Notification.permission !== 'granted') return;
          try {
            new Notification(n.title, { body: n.body, icon: './icons/icon-192.png', tag: `city-ville-${n.id}` });
          } catch {
            // Certains navigateurs mobiles n'autorisent les notifications que via un service worker.
          }
        }, delay),
      );
    }
  }
}

class NoNotifier implements DeviceNotifier {
  readonly kind = 'none' as const;
  async permission(): Promise<NotificationPermission> {
    return 'unsupported';
  }
  async request(): Promise<NotificationPermission> {
    return 'unsupported';
  }
  async replace(): Promise<void> {}
}

export function createNotifier(): DeviceNotifier {
  if (isNativeApp()) return new NativeNotifier();
  if (typeof window !== 'undefined' && 'Notification' in window && window.isSecureContext) return new WebNotifier();
  return new NoNotifier();
}
