import type { KeyValueStorage } from '@/core/save';
import { isNativeApp } from './native';

const VIBRATIONS_KEY = 'city-ville:vibrations';

export type HapticKind = 'light' | 'medium' | 'heavy' | 'success' | 'warning';

/**
 * Vibrations du téléphone : légères pour une récolte, plus fortes pour un
 * passage de niveau, « réussite » pour un objectif. Dans l'appli iPhone
 * (moteur haptique) ; dans un navigateur Android, l'API Vibration ; Safari
 * sur iPhone n'en propose pas.
 */
export class Haptics {
  enabled: boolean;
  private plugin = isNativeApp() ? import('@capacitor/haptics') : null;

  constructor(private readonly storage: KeyValueStorage) {
    this.enabled = storage.getItem(VIBRATIONS_KEY) !== '0';
  }

  /** L'appareil sait-il vibrer ? */
  get supported(): boolean {
    return this.plugin !== null || (typeof navigator !== 'undefined' && 'vibrate' in navigator);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    try {
      this.storage.setItem(VIBRATIONS_KEY, on ? '1' : '0');
    } catch {
      // Préférence non persistée : sans gravité.
    }
    if (on) this.play('medium');
  }

  play(kind: HapticKind): void {
    if (!this.enabled) return;
    if (this.plugin) {
      void this.plugin
        .then(({ Haptics: H, ImpactStyle, NotificationType }) => {
          if (kind === 'success') return H.notification({ type: NotificationType.Success });
          if (kind === 'warning') return H.notification({ type: NotificationType.Warning });
          const style =
            kind === 'heavy' ? ImpactStyle.Heavy : kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light;
          return H.impact({ style });
        })
        .catch(() => undefined);
      return;
    }
    const pattern = { light: 12, medium: 25, heavy: [40, 40, 60], success: [20, 60, 30], warning: [50, 50, 50] }[kind];
    try {
      navigator.vibrate?.(pattern);
    } catch {
      // Vibrations indisponibles : rien à faire.
    }
  }
}
