/**
 * Météo commune à tous les joueurs : elle change toutes les trois heures,
 * tirée de façon déterministe (aucune donnée à sauvegarder). La neige
 * remplace la pluie en hiver (décembre à février, heure locale).
 */

export type Weather = 'sun' | 'clouds' | 'rain' | 'snow';

const SLOT_MS = 3 * 3600_000;

function slotRoll(slot: number): number {
  let h = Math.imul(slot ^ 0x5bd1e995, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

export function weatherAt(ms: number): Weather {
  const roll = slotRoll(Math.floor(ms / SLOT_MS));
  if (roll < 0.5) return 'sun';
  if (roll < 0.75) return 'clouds';
  const month = new Date(ms).getMonth();
  return month === 11 || month <= 1 ? 'snow' : 'rain';
}

/** Fin du créneau météo en cours. */
export function weatherEndsAt(ms: number): number {
  return (Math.floor(ms / SLOT_MS) + 1) * SLOT_MS;
}
