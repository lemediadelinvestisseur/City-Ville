/**
 * Cycle jour/nuit (purement visuel). Par défaut, un cycle de 30 minutes commun
 * à tous les joueurs : 20 min de jour, 2 de crépuscule, 6 de nuit, 2 d'aube.
 * Le joueur peut aussi suivre l'heure réelle de son appareil, ou désactiver la nuit.
 */

export type DayNightMode = 'cycle' | 'real' | 'off';
export type DayPhase = 'day' | 'dusk' | 'night' | 'dawn';

export const DAY_NIGHT_MODES: readonly DayNightMode[] = ['cycle', 'real', 'off'];

const MIN = 60_000;
/** Durées des phases du cycle de jeu, dans l'ordre. */
const CYCLE: ReadonlyArray<{ phase: DayPhase; ms: number }> = [
  { phase: 'day', ms: 20 * MIN },
  { phase: 'dusk', ms: 2 * MIN },
  { phase: 'night', ms: 6 * MIN },
  { phase: 'dawn', ms: 2 * MIN },
];
export const CYCLE_MS = CYCLE.reduce((sum, p) => sum + p.ms, 0);

/** Heures (locales) de l'heure réelle : crépuscule 20 h → 21 h, aube 6 h → 7 h. */
const REAL = { duskStart: 20, nightStart: 21, dawnStart: 6, dayStart: 7 };

export interface DayNightState {
  phase: DayPhase;
  /** 0 = plein jour, 1 = pleine nuit. */
  darkness: number;
  /** 0 → 1 au cours du crépuscule ou de l'aube (teinte orangée), 0 sinon. */
  twilight: number;
  /** Prochain changement de phase (horodatage), pour l'affichage. */
  nextChangeAt: number;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

function fromPhase(phase: DayPhase, progress: number, nextChangeAt: number): DayNightState {
  switch (phase) {
    case 'day':
      return { phase, darkness: 0, twilight: 0, nextChangeAt };
    case 'night':
      return { phase, darkness: 1, twilight: 0, nextChangeAt };
    case 'dusk':
      return { phase, darkness: smooth(progress), twilight: Math.sin(progress * Math.PI), nextChangeAt };
    case 'dawn':
      return { phase, darkness: 1 - smooth(progress), twilight: Math.sin(progress * Math.PI), nextChangeAt };
  }
}

/**
 * État du ciel à un instant donné. `localHour` (0–24, fractionnaire) n'est
 * utilisé qu'en mode « heure réelle » ; le fuseau horaire est celui de l'appareil.
 */
export function dayNightAt(now: number, mode: DayNightMode, localHour = 12): DayNightState {
  if (mode === 'off') return { phase: 'day', darkness: 0, twilight: 0, nextChangeAt: Infinity };
  if (mode === 'real') return realTime(now, localHour);
  let t = ((now % CYCLE_MS) + CYCLE_MS) % CYCLE_MS;
  for (const { phase, ms } of CYCLE) {
    if (t < ms) return fromPhase(phase, t / ms, now + (ms - t));
    t -= ms;
  }
  return fromPhase('day', 0, now);
}

function realTime(now: number, hour: number): DayNightState {
  const at = (h: number) => now + (((h - hour + 24) % 24) * 3_600_000 || 86_400_000);
  if (hour >= REAL.dayStart && hour < REAL.duskStart) return fromPhase('day', 0, at(REAL.duskStart));
  if (hour >= REAL.duskStart && hour < REAL.nightStart) {
    return fromPhase('dusk', (hour - REAL.duskStart) / (REAL.nightStart - REAL.duskStart), at(REAL.nightStart));
  }
  if (hour >= REAL.dawnStart && hour < REAL.dayStart) {
    return fromPhase('dawn', (hour - REAL.dawnStart) / (REAL.dayStart - REAL.dawnStart), at(REAL.dayStart));
  }
  return fromPhase('night', 0, at(REAL.dawnStart));
}
