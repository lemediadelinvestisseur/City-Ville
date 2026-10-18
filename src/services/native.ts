import { Capacitor } from '@capacitor/core';
import type { AppContext } from '@/app/context';
import type { KeyValueStorage } from '@/core/save';

/** Clés recopiées dans le stockage natif (iOS peut vider le stockage web de l'appli). */
const MIRRORED = /^city-ville:(save|device|revision|dirty|local-pseudo|muted|dayNight|lang|notifications)$/;

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Au démarrage de l'appli native : si le stockage web a été vidé par le
 * système, on le reconstitue depuis le stockage natif (Préférences).
 */
export async function restoreNativeBackup(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { Preferences } = await import('@capacitor/preferences');
    const { keys } = await Preferences.keys();
    for (const key of keys) {
      if (!MIRRORED.test(key) || window.localStorage.getItem(key) !== null) continue;
      const { value } = await Preferences.get({ key });
      if (value !== null) window.localStorage.setItem(key, value);
    }
  } catch (error) {
    console.warn('Restauration native impossible', error);
  }
}

/** Stockage qui recopie les clés importantes dans les Préférences natives (sans attendre). */
export function mirroredStorage(base: KeyValueStorage): KeyValueStorage {
  if (!isNativeApp()) return base;
  const prefs = import('@capacitor/preferences').then((m) => m.Preferences);
  return {
    getItem: (key) => base.getItem(key),
    setItem: (key, value) => {
      base.setItem(key, value);
      if (MIRRORED.test(key)) void prefs.then((p) => p.set({ key, value }));
    },
    removeItem: (key) => {
      base.removeItem(key);
      if (MIRRORED.test(key)) void prefs.then((p) => p.remove({ key }));
    },
  };
}

/** Réglages propres à l'appli native : barre d'état, écran de démarrage, vibrations. */
export async function setupNative(ctx: AppContext): Promise<void> {
  if (!isNativeApp()) return;
  const [{ StatusBar, Style }, { SplashScreen }, { Haptics, ImpactStyle }] = await Promise.all([
    import('@capacitor/status-bar'),
    import('@capacitor/splash-screen'),
    import('@capacitor/haptics'),
  ]);
  await StatusBar.setOverlaysWebView({ overlay: true }).catch(() => undefined);
  await StatusBar.setStyle({ style: Style.Dark }).catch(() => undefined);
  ctx.bus.on('world:ready', () => void SplashScreen.hide());
  ctx.bus.on('world:action', ({ ok }) => {
    if (ok) void Haptics.impact({ style: ImpactStyle.Light });
  });
  ctx.game.events.on('levelUp', () => void Haptics.impact({ style: ImpactStyle.Heavy }));
}
