import { ConvexClient } from 'convex/browser';
import { ConvexError } from 'convex/values';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import type { KeyValueStorage } from '@/core/save';
import {
  BackendError,
  detectPlatform,
  newDeviceToken,
  type Announcement,
  type Backend,
  type BackendErrorCode,
  type ChatFeed,
  type ChatPulse,
  type Leaderboard,
  type Me,
  type NeighborProfile,
  type Profile,
  type PushItem,
  type PushKeys,
  type PushResult,
  type RemoteSave,
  type TrackedEvent,
  type Visit,
} from './Backend';

const TOKEN_KEY = 'city-ville:device';
const KNOWN_CODES: readonly BackendErrorCode[] = [
  'unauthorized',
  'pseudoTaken',
  'pseudoInvalid',
  'notFound',
  'tooLarge',
  'invalidSave',
  'alreadyHelped',
  'blocked',
  'limit',
  'banned',
  'invalidCode',
  'forbidden',
  'muted',
  'invalidText',
];

type PlayerId = Id<'players'>;

/** Services en ligne sur Convex. */
export class ConvexBackend implements Backend {
  readonly kind = 'convex' as const;
  private client: ConvexClient;
  private token: string | null;

  constructor(
    url: string,
    private readonly storage: KeyValueStorage,
  ) {
    this.client = new ConvexClient(url);
    this.token = storage.getItem(TOKEN_KEY);
  }

  private get auth(): string {
    if (!this.token) throw new BackendError('unauthorized');
    return this.token;
  }

  /** Convertit les erreurs Convex (codes métier) et réseau en BackendError. */
  private async call<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      throw toBackendError(error);
    }
  }

  isRegistered(): boolean {
    return this.token !== null;
  }

  pseudoAvailable(pseudo: string) {
    return this.call(() => this.client.query(api.players.pseudoAvailable, { pseudo }));
  }

  async register(pseudo: string, cityName: string, language: string): Promise<void> {
    const token = newDeviceToken();
    await this.call(() =>
      this.client.mutation(api.players.register, { token, pseudo, cityName, platform: detectPlatform(), language }),
    );
    this.token = token;
    this.storage.setItem(TOKEN_KEY, token);
  }

  me(): Promise<Me> {
    return this.call(() => this.client.query(api.players.me, { token: this.auth }));
  }

  async setLanguage(language: string): Promise<void> {
    await this.call(() => this.client.mutation(api.players.setLanguage, { token: this.auth, language }));
  }

  async rename(pseudo: string): Promise<string> {
    const result = await this.call(() => this.client.mutation(api.players.rename, { token: this.auth, pseudo }));
    return result.pseudo;
  }

  createTransferCode() {
    return this.call(() => this.client.mutation(api.players.createTransferCode, { token: this.auth }));
  }

  async redeemTransferCode(code: string): Promise<void> {
    const token = newDeviceToken();
    await this.call(() =>
      this.client.mutation(api.players.redeemTransferCode, { code, token, platform: detectPlatform() }),
    );
    this.token = token;
    this.storage.setItem(TOKEN_KEY, token);
  }

  async deleteAccount(): Promise<void> {
    await this.call(() => this.client.mutation(api.players.deleteAccount, { token: this.auth }));
    this.forget();
  }

  forget(): void {
    this.token = null;
    this.storage.removeItem(TOKEN_KEY);
  }

  pullSave(): Promise<RemoteSave | null> {
    return this.call(() => this.client.query(api.saves.pull, { token: this.auth }));
  }

  pushSave(baseRevision: number, data: string, force = false): Promise<PushResult> {
    return this.call(() => this.client.mutation(api.saves.push, { token: this.auth, baseRevision, data, force }));
  }

  async ping(sessionId: string): Promise<void> {
    await this.call(() =>
      this.client.mutation(api.stats.ping, {
        token: this.auth,
        clientSessionId: sessionId,
        platform: detectPlatform(),
      }),
    );
  }

  async track(events: TrackedEvent[]): Promise<void> {
    if (events.length === 0) return;
    await this.call(() => this.client.mutation(api.stats.track, { token: this.auth, events }));
  }

  neighbors(): Promise<NeighborProfile[]> {
    return this.call(() => this.client.query(api.neighbors.list, { token: this.auth }));
  }

  suggestions(): Promise<Profile[]> {
    return this.call(() => this.client.query(api.neighbors.suggestions, { token: this.auth }));
  }

  search(text: string): Promise<Profile[]> {
    return this.call(() => this.client.query(api.neighbors.search, { token: this.auth, text }));
  }

  async addNeighbor(id: string): Promise<void> {
    await this.call(() => this.client.mutation(api.neighbors.add, { token: this.auth, neighborId: id as PlayerId }));
  }

  async removeNeighbor(id: string): Promise<void> {
    await this.call(() => this.client.mutation(api.neighbors.remove, { token: this.auth, neighborId: id as PlayerId }));
  }

  visit(id: string): Promise<Visit> {
    return this.call(() => this.client.query(api.neighbors.visit, { token: this.auth, playerId: id as PlayerId }));
  }

  async help(id: string): Promise<void> {
    await this.call(() => this.client.mutation(api.neighbors.help, { token: this.auth, neighborId: id as PlayerId }));
  }

  claimHelps() {
    return this.call(() => this.client.mutation(api.neighbors.claimHelps, { token: this.auth }));
  }

  leaderboard(by: 'level' | 'population'): Promise<Leaderboard> {
    return this.call(() => this.client.query(api.leaderboard.top, { token: this.auth, by }));
  }

  async block(id: string): Promise<void> {
    await this.call(() => this.client.mutation(api.moderation.block, { token: this.auth, playerId: id as PlayerId }));
  }

  marketOverview() {
    return this.call(() => this.client.query(api.market.overview, { token: this.auth }));
  }

  async marketCreate(qty: number, unitPrice: number): Promise<void> {
    await this.call(() => this.client.mutation(api.market.create, { token: this.auth, qty, unitPrice }));
  }

  marketBuy(id: string) {
    return this.call(() => this.client.mutation(api.market.buy, { token: this.auth, listingId: id as Id<'listings'> }));
  }

  marketCancel(id: string) {
    return this.call(() =>
      this.client.mutation(api.market.cancel, { token: this.auth, listingId: id as Id<'listings'> }),
    );
  }

  marketSettle() {
    return this.call(() => this.client.mutation(api.market.settle, { token: this.auth }));
  }

  async report(id: string, reason: string): Promise<void> {
    await this.call(() =>
      this.client.mutation(api.moderation.report, { token: this.auth, playerId: id as PlayerId, reason }),
    );
  }

  watchChat(channel: string, onFeed: (feed: ChatFeed) => void, onError: (error: BackendError) => void): () => void {
    if (!this.token) {
      onError(new BackendError('unauthorized'));
      return () => undefined;
    }
    const unsubscribe = this.client.onUpdate(
      api.chat.list,
      { token: this.token, channel },
      (feed) => onFeed(feed),
      (error) => onError(toBackendError(error)),
    );
    return () => unsubscribe();
  }

  watchPulse(channels: string[], onPulse: (pulse: ChatPulse) => void): () => void {
    if (!this.token) return () => undefined;
    const unsubscribe = this.client.onUpdate(
      api.chat.pulse,
      { token: this.token, channels },
      (pulse) => onPulse(pulse),
      () => undefined,
    );
    return () => unsubscribe();
  }

  async sendChat(channel: string, text: string): Promise<void> {
    await this.call(() => this.client.mutation(api.chat.send, { token: this.auth, channel, text }));
  }

  async deleteChat(id: string): Promise<void> {
    await this.call(() =>
      this.client.mutation(api.chat.remove, { token: this.auth, messageId: id as Id<'chatMessages'> }),
    );
  }

  async reportChat(id: string): Promise<void> {
    await this.call(() =>
      this.client.mutation(api.chat.report, { token: this.auth, messageId: id as Id<'chatMessages'> }),
    );
  }

  async mute(playerId: string, minutes: number): Promise<void> {
    await this.call(() =>
      this.client.mutation(api.chat.mute, { token: this.auth, playerId: playerId as PlayerId, minutes }),
    );
  }

  announcements(channels: string[]): Promise<Announcement[]> {
    return this.call(() => this.client.query(api.chat.announcements, { token: this.auth, channels }));
  }

  async pushPublicKey(): Promise<string | null> {
    if (!this.token) return null;
    return this.call(() => this.client.action(api.pushNode.publicKey, {}));
  }

  async pushSchedule(subscription: PushKeys, items: PushItem[]): Promise<void> {
    await this.call(() => this.client.mutation(api.push.schedule, { token: this.auth, subscription, items }));
  }

  async pushUnsubscribe(endpoint: string): Promise<void> {
    await this.call(() => this.client.mutation(api.push.unsubscribe, { token: this.auth, endpoint }));
  }
}

/** Convertit une erreur Convex (code métier) ou réseau en BackendError. */
function toBackendError(error: unknown): BackendError {
  if (error instanceof BackendError) return error;
  if (error instanceof ConvexError) {
    return new BackendError(KNOWN_CODES.find((c) => c === error.data) ?? 'unknown');
  }
  return new BackendError('network');
}
