import { DAY_NIGHT_MODES, type DayNightMode } from '@/core/dayNight';
import type { KeyValueStorage } from '@/core/save';

const DAY_NIGHT_KEY = 'city-ville:dayNight';

/** Préférences d'affichage propres à l'appareil (pas dans la sauvegarde de la partie). */
export class Preferences {
  dayNight: DayNightMode;

  constructor(private readonly storage: KeyValueStorage) {
    const saved = storage.getItem(DAY_NIGHT_KEY);
    this.dayNight = DAY_NIGHT_MODES.find((mode) => mode === saved) ?? 'cycle';
  }

  setDayNight(mode: DayNightMode): void {
    this.dayNight = mode;
    try {
      this.storage.setItem(DAY_NIGHT_KEY, mode);
    } catch {
      // Préférence non persistée : sans gravité.
    }
  }
}
