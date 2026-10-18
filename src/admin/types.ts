import type { FunctionReturnType } from 'convex/server';
import type { api } from '../../convex/_generated/api';

/** Données du tableau de bord (forme renvoyée par convex/admin.ts). */
export type Dashboard = FunctionReturnType<typeof api.admin.dashboard>;
/** Équipe (administrateur et modérateurs). */
export type Team = FunctionReturnType<typeof api.roles.team>;
/** Derniers messages du chat, tous salons confondus. */
export type AdminChat = FunctionReturnType<typeof api.admin.recentChat>;

/** Rythme visé par niveau (jours depuis l'inscription), d'après le joueur simulé. */
export const TARGET_DAYS: Record<number, number> = { 5: 0.2, 10: 2.2, 15: 7, 20: 10, 25: 12.4, 30: 20 };
