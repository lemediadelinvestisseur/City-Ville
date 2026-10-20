/** Règles des échanges entre voisins (partagées par le jeu et le serveur). */
export const SOCIAL = {
  /** Demandes aux voisins : quantité demandée et durée de la demande. */
  requestMinQty: 5,
  requestMaxQty: 200,
  requestDurationMs: 48 * 3600_000,
  /** Défi de quartier : récoltes comptées par joueur et par semaine au plus. */
  communityMaxPerPlayer: 5000,
  /** Objectif : 150 récoltes par participant (300 au moins). */
  communityPerPlayer: 150,
  communityMinGoal: 300,
} as const;

/** Semaine (lundi, AAAA-MM-JJ, UTC) : concours et défi de quartier repartent chaque lundi. */
export function weekOf(ms: number): string {
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

export function communityGoal(contributors: number): number {
  return Math.max(SOCIAL.communityMinGoal, contributors * SOCIAL.communityPerPlayer);
}

/** Récompense du défi de quartier réussi. */
export function communityReward(level: number): { coins: number; xp: number; cash: number } {
  return { coins: 300 + level * 50, xp: 20 + level, cash: 2 };
}
