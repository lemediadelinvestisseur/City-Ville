/**
 * Services en ligne du jeu (compte, sauvegarde, voisins, classement, mesures).
 * Deux implémentations : Convex (production) et locale (démo hors-ligne,
 * utilisée tant qu'aucun serveur n'est configuré).
 */

export type BackendErrorCode =
  | 'network'
  | 'unauthorized'
  | 'pseudoTaken'
  | 'pseudoInvalid'
  | 'notFound'
  | 'tooLarge'
  | 'invalidSave'
  | 'alreadyHelped'
  | 'blocked'
  | 'limit'
  | 'banned'
  | 'invalidCode'
  | 'forbidden'
  | 'unknown';

export class BackendError extends Error {
  constructor(readonly code: BackendErrorCode) {
    super(code);
  }
}

export interface Profile {
  id: string;
  pseudo: string;
  cityName: string;
  level: number;
  population: number;
  lastSeenAt: number;
}

export interface NeighborProfile extends Profile {
  helpedToday: boolean;
}

export interface RemoteSave {
  revision: number;
  savedAt: number;
  data: string;
}

export type PushResult =
  { ok: true; revision: number } | { ok: false; conflict: { revision: number; savedAt: number } };

export interface Visit {
  profile: Profile;
  data: string | null;
  isNeighbor: boolean;
  helpedToday: boolean;
}

export interface Leaderboard {
  rows: Profile[];
  myRank: number | null;
  me: Profile;
}

export interface TrackedEvent {
  type: 'quest' | 'level';
  name: string;
}

export interface Backend {
  /** 'local' : démo hors-ligne (voisins fictifs, rien n'est envoyé). */
  readonly kind: 'convex' | 'local';
  isRegistered(): boolean;
  pseudoAvailable(pseudo: string): Promise<{ available: boolean; error: string | null }>;
  register(pseudo: string, cityName: string): Promise<void>;
  me(): Promise<Profile & { banned: boolean }>;
  rename(pseudo: string): Promise<string>;
  createTransferCode(): Promise<{ code: string; expiresAt: number }>;
  redeemTransferCode(code: string): Promise<void>;
  deleteAccount(): Promise<void>;
  /** Oublie le compte sur cet appareil (après suppression). */
  forget(): void;

  pullSave(): Promise<RemoteSave | null>;
  pushSave(baseRevision: number, data: string, force?: boolean): Promise<PushResult>;

  ping(sessionId: string): Promise<void>;
  track(events: TrackedEvent[]): Promise<void>;

  neighbors(): Promise<NeighborProfile[]>;
  suggestions(): Promise<Profile[]>;
  search(text: string): Promise<Profile[]>;
  addNeighbor(id: string): Promise<void>;
  removeNeighbor(id: string): Promise<void>;
  visit(id: string): Promise<Visit>;
  help(id: string): Promise<void>;
  claimHelps(): Promise<{ count: number; helpers: string[] }>;
  leaderboard(by: 'level' | 'population'): Promise<Leaderboard>;
  block(id: string): Promise<void>;
  report(id: string, reason: string): Promise<void>;
}

/** Plateforme de l'appareil, pour les statistiques. */
export function detectPlatform(): string {
  const ua = navigator.userAgent;
  const native = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.();
  if (native && native !== 'web') return native;
  if (/iPhone|iPad|iPod/i.test(ua)) return 'web-ios';
  if (/Android/i.test(ua)) return 'web-android';
  return 'web';
}

/** Clé secrète aléatoire de l'appareil (256 bits). */
export function newDeviceToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function backendErrorMessage(error: unknown): string {
  const code = error instanceof BackendError ? error.code : 'unknown';
  switch (code) {
    case 'network':
      return 'Connexion impossible. Vérifiez votre réseau et réessayez.';
    case 'pseudoTaken':
      return 'Ce pseudo est déjà pris.';
    case 'pseudoInvalid':
      return 'Ce pseudo n’est pas valide.';
    case 'alreadyHelped':
      return 'Vous avez déjà aidé ce voisin aujourd’hui.';
    case 'blocked':
      return 'Ce joueur n’est pas disponible.';
    case 'notFound':
      return 'Joueur introuvable.';
    case 'limit':
      return 'Limite atteinte. Réessayez plus tard.';
    case 'invalidCode':
      return 'Code invalide ou expiré.';
    case 'banned':
      return 'Votre compte est suspendu.';
    case 'unauthorized':
      return 'Session expirée : relancez le jeu.';
    default:
      return 'Une erreur est survenue. Réessayez.';
  }
}
