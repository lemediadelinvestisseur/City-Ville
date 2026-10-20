import { isNativeApp } from './native';
import type { Backend } from './online/Backend';

/**
 * Notifications de l'appareil (« vos fraises sont prêtes ! »), programmées à
 * l'avance pour arriver même quand le jeu est fermé.
 *  - Application iOS : notifications locales du système (plugin Capacitor).
 *  - Navigateur (et appli web ajoutée à l'écran d'accueil de l'iPhone) : Web Push,
 *    envoyé à l'heure dite par le serveur à travers le service worker (public/sw.js).
 *    Sans serveur (démo hors-ligne), seulement tant que l'onglet du jeu reste ouvert.
 */

/** Service worker du jeu : il affiche les notifications Web Push, même page fermée. */
export function registerServiceWorker(): void {
  if (isNativeApp() || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (!window.isSecureContext) return;
  navigator.serviceWorker.register('./sw.js').catch((error: unknown) => {
    console.warn('Service worker indisponible', error);
  });
}

/** Clé publique VAPID (base64url) au format attendu par `pushManager.subscribe`. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

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
  /** Dernière liste envoyée au serveur (on n'envoie que les changements). */
  private sent = '';

  constructor(private readonly backend: Backend | null) {}

  async permission(): Promise<NotificationPermission> {
    return Notification.permission === 'default' ? 'prompt' : Notification.permission;
  }

  async request(): Promise<NotificationPermission> {
    const result = await Notification.requestPermission();
    return result === 'default' ? 'prompt' : result;
  }

  async replace(list: ScheduledNotification[]): Promise<void> {
    this.clearTimers();
    const pushed = await this.replaceOnServer(list).catch((error: unknown) => {
      console.warn('Web Push indisponible', error);
      return false;
    });
    // Sans Web Push : rappels affichés par cet onglet, tant qu'il reste ouvert.
    if (!pushed) this.scheduleInTab(list);
  }

  /** Abonnement Web Push de cet appareil (créé au besoin), ou null s'il n'est pas possible. */
  private async subscription(create: boolean): Promise<PushSubscription | null> {
    if (!this.backend || !('PushManager' in window) || Notification.permission !== 'granted') return null;
    const registration = await navigator.serviceWorker?.getRegistration();
    if (!registration) return null;
    const existing = await registration.pushManager.getSubscription();
    if (existing || !create) return existing;
    const key = await this.backend.pushPublicKey();
    if (!key) return null;
    return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
  }

  /** Confie la liste au serveur ; faux si le Web Push n'est pas disponible. */
  private async replaceOnServer(list: ScheduledNotification[]): Promise<boolean> {
    const subscription = await this.subscription(list.length > 0);
    if (!subscription || !this.backend) return false;
    const { endpoint, keys } = subscription.toJSON();
    if (!endpoint || !keys?.p256dh || !keys.auth) return false;
    const items = list.map(({ at, title, body }) => ({ at, title, body }));
    const signature = `${endpoint}|${JSON.stringify(items)}`;
    if (signature === this.sent) return true;
    await this.backend.pushSchedule({ endpoint, p256dh: keys.p256dh, auth: keys.auth }, items);
    this.sent = signature;
    return true;
  }

  private clearTimers(): void {
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers = [];
  }

  private scheduleInTab(list: ScheduledNotification[]): void {
    const now = Date.now();
    for (const n of list) {
      const delay = n.at - now;
      // Au-delà de ~24 jours, setTimeout déborde : la liste est recalculée bien avant.
      if (delay < 0 || delay > 2_000_000_000) continue;
      this.timers.push(window.setTimeout(() => void WebNotifier.show(n), delay));
    }
  }

  private static async show(n: ScheduledNotification): Promise<void> {
    // Jeu au premier plan : les messages en jeu suffisent.
    if (document.visibilityState === 'visible' || Notification.permission !== 'granted') return;
    const options = { body: n.body, icon: './icons/icon-192.png', tag: `city-ville-${n.id}` };
    try {
      // Les navigateurs mobiles n'affichent les notifications que par le service worker.
      const registration = await navigator.serviceWorker?.getRegistration();
      if (registration) await registration.showNotification(n.title, options);
      else new Notification(n.title, options);
    } catch {
      // Notifications refusées ou indisponibles : rien à faire.
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

export function createNotifier(backend: Backend | null = null): DeviceNotifier {
  if (isNativeApp()) return new NativeNotifier();
  if (typeof window !== 'undefined' && 'Notification' in window && window.isSecureContext) {
    return new WebNotifier(backend);
  }
  return new NoNotifier();
}
