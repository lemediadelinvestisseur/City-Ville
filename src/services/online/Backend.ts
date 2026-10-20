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
  | 'muted'
  | 'invalidText'
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

export interface MarketOffer {
  id: string;
  /** Produit du lot (src/data/items.ts). */
  item: string;
  qty: number;
  unitPrice: number;
  seller: string;
  expiresAt: number;
}

export interface MyListing {
  id: string;
  item: string;
  qty: number;
  unitPrice: number;
  createdAt: number;
  expiresAt: number;
  status: 'open' | 'sold' | 'cancelled' | 'expired';
  income: number;
}

export type Role = 'admin' | 'moderator';

export interface Me extends Profile {
  banned: boolean;
  role: Role | null;
  language: string | null;
  mutedUntil: number | null;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  pseudo: string;
  role: Role | null;
  level: number;
  text: string;
  createdAt: number;
  kind: 'message' | 'announcement';
  mine: boolean;
}

export interface ChatFeed {
  messages: ChatMessage[];
  mutedUntil: number | null;
  canWrite: boolean;
  canModerate: boolean;
}

/** Signal léger : date du dernier message par salon et de la dernière annonce. */
export interface ChatPulse {
  latest: Array<{ channel: string; at: number }>;
  announcementAt: number;
}

export interface Announcement {
  id: string;
  text: string;
  createdAt: number;
  pseudo: string;
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
  register(pseudo: string, cityName: string, language: string): Promise<void>;
  me(): Promise<Me>;
  setLanguage(language: string): Promise<void>;
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

  marketOverview(): Promise<{ offers: MarketOffer[]; mine: MyListing[] }>;
  marketCreate(item: string, qty: number, unitPrice: number): Promise<void>;
  marketBuy(id: string): Promise<{ item: string; qty: number; total: number }>;
  marketCancel(id: string): Promise<{ item: string; qty: number }>;
  /** Encaisse les ventes et récupère les invendus. */
  marketSettle(): Promise<{ coins: number; items: Record<string, number>; sold: number }>;

  /** Ma demande aux voisins en cours. */
  myRequest(): Promise<MyRequest | null>;
  createRequest(item: string, qty: number): Promise<void>;
  /** Récupère ce que les voisins ont envoyé. */
  claimRequest(): Promise<{ item: string | null; qty: number }>;
  neighborRequests(): Promise<NeighborRequest[]>;
  giveToRequest(id: string, qty: number): Promise<void>;
  /** « J'aime » pour une ville visitée (un par semaine) ; renvoie le total de la ville. */
  like(playerId: string): Promise<number>;
  likeStatus(playerId: string): Promise<{ likes: number; liked: boolean }>;
  prettiest(): Promise<{ rows: Array<Profile & { likes: number }>; myRank: number | null; myLikes: number }>;
  community(): Promise<CommunityStatus>;
  contribute(amount: number): Promise<void>;
  claimCommunity(): Promise<void>;

  /** Abonnement en temps réel aux messages d'un salon ; renvoie de quoi se désabonner. */
  watchChat(channel: string, onFeed: (feed: ChatFeed) => void, onError: (error: BackendError) => void): () => void;
  /** Abonnement léger (pastille « nouveaux messages », annonces). */
  watchPulse(channels: string[], onPulse: (pulse: ChatPulse) => void): () => void;
  sendChat(channel: string, text: string): Promise<void>;
  deleteChat(id: string): Promise<void>;
  reportChat(id: string): Promise<void>;
  mute(playerId: string, minutes: number): Promise<void>;
  announcements(channels: string[]): Promise<Announcement[]>;

  /** Clé publique Web Push du serveur (null : pas de serveur ou pas de compte). */
  pushPublicKey(): Promise<string | null>;
  /** Remplace les rappels programmés sur le serveur pour cet appareil. */
  pushSchedule(subscription: PushKeys, items: PushItem[]): Promise<void>;
  pushUnsubscribe(endpoint: string): Promise<void>;
}

export interface MyRequest {
  id: string;
  item: string;
  qty: number;
  received: number;
  /** Reçu mais pas encore récupéré. */
  toClaim: number;
  expiresAt: number;
}

export interface NeighborRequest extends MyRequest {
  profile: Profile;
}

/** Défi de quartier de la semaine. */
export interface CommunityStatus {
  week: string;
  total: number;
  goal: number;
  mine: number;
  claimable: boolean;
  claimed: boolean;
}

/** Abonnement Web Push d'un appareil (adresse du service d'envoi et clés de chiffrement). */
export interface PushKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushItem {
  at: number;
  title: string;
  body: string;
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
