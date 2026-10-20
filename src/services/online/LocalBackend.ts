import { CHAT, cleanChatText } from '@/core/chat';
import { serialize, type KeyValueStorage } from '@/core/save';
import { simulate } from '@/core/simulation';
import { normalizePseudo, validatePseudo } from '@/core/pseudo';
import { MARKET, sellerIncome } from '@/data/market';
import { SOCIAL, communityGoal, weekOf } from '@/data/social';
import { t, type MessageKey } from '@/i18n';
import {
  BackendError,
  type Announcement,
  type Backend,
  type ChatFeed,
  type ChatMessage,
  type ChatPulse,
  type Leaderboard,
  type Me,
  type CommunityStatus,
  type MarketOffer,
  type MyRequest,
  type NeighborRequest,
  type MyListing,
  type NeighborProfile,
  type Profile,
  type PushResult,
  type RemoteSave,
  type Visit,
} from './Backend';

const PSEUDO_KEY = 'city-ville:local-pseudo';
const NEIGHBORS_KEY = 'city-ville:local-neighbors';
const HELPED_KEY = 'city-ville:local-helped';
const CLAIMED_KEY = 'city-ville:local-claimed';
const LISTINGS_KEY = 'city-ville:local-listings';
const BOUGHT_KEY = 'city-ville:local-bought';
const CHAT_KEY = 'city-ville:local-chat';
const REQUEST_KEY = 'city-ville:local-request';
const GIVEN_KEY = 'city-ville:local-given';
const LIKES_KEY = 'city-ville:local-likes';
const COMMUNITY_KEY = 'city-ville:local-community';
/** Produits des lots, demandes et dons des voisins fictifs. */
const DEMO_ITEMS = ['wheat', 'carrot', 'strawberry', 'corn', 'eggs', 'milk', 'bread', 'fish'];
/** Dans la démo, un lot trouve preneur au bout de quelques minutes s'il n'est pas trop cher. */
const DEMO_SALE_MS = 3 * 60_000;

interface DemoPlayer {
  id: string;
  pseudo: string;
  cityName: string;
  /** Jours de jeu simulés pour construire sa ville. */
  days: number;
  level: number;
  population: number;
}

/** Voisins fictifs du mode démo (leurs villes sont générées par le joueur simulé). */
const DEMO: readonly DemoPlayer[] = [
  { id: 'demo-lea', pseudo: 'Léa', cityName: 'Bourg-Léa', days: 1, level: 7, population: 180 },
  { id: 'demo-malik', pseudo: 'Malik', cityName: 'Port-Malik', days: 2, level: 10, population: 320 },
  { id: 'demo-hugo', pseudo: 'Hugo', cityName: 'Hugoville', days: 4, level: 13, population: 610 },
  { id: 'demo-camille', pseudo: 'Camille', cityName: 'Sainte-Camille', days: 8, level: 18, population: 1150 },
  { id: 'demo-ines', pseudo: 'Inès', cityName: 'Inès-sur-Mer', days: 13, level: 24, population: 2300 },
];

const today = () => new Date().toISOString().slice(0, 10);

/** Messages du jour des voisins fictifs (heure locale de la journée, en minutes). */
const DEMO_CHAT: ReadonlyArray<{ minute: number; who: number; key: MessageKey; channel: 'world' | 'lang' }> = [
  { minute: 8 * 60 + 12, who: 1, key: 'demo.chat1', channel: 'world' },
  { minute: 9 * 60 + 47, who: 3, key: 'demo.chat2', channel: 'world' },
  { minute: 12 * 60 + 5, who: 2, key: 'demo.chat3', channel: 'lang' },
  { minute: 18 * 60 + 30, who: 4, key: 'demo.chat4', channel: 'world' },
];
const DEMO_REPLIES: readonly MessageKey[] = ['demo.reply1', 'demo.reply2', 'demo.reply3'];

/**
 * Services en ligne simulés : rien ne quitte l'appareil. Permet de jouer
 * (et de tester l'interface sociale) avant la mise en ligne du serveur.
 */
export class LocalBackend implements Backend {
  readonly kind = 'local' as const;
  private cities = new Map<string, string>();
  private chatListeners = new Set<() => void>();

  constructor(
    private readonly storage: KeyValueStorage,
    private readonly summary: () => { level: number; population: number; cityName: string; xp: number },
  ) {}

  private read<T>(key: string, fallback: T): T {
    try {
      const raw = this.storage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  private write(key: string, value: unknown): void {
    try {
      this.storage.setItem(key, JSON.stringify(value));
    } catch {
      // Stockage indisponible : la démo continue en mémoire.
    }
  }

  private myProfile(): Profile {
    const s = this.summary();
    return {
      id: 'me',
      pseudo: this.read<string>(PSEUDO_KEY, 'Moi'),
      cityName: s.cityName,
      level: s.level,
      population: s.population,
      lastSeenAt: Date.now(),
    };
  }

  private profile(demo: DemoPlayer): Profile {
    return {
      id: demo.id,
      pseudo: demo.pseudo,
      cityName: demo.cityName,
      level: demo.level,
      population: demo.population,
      lastSeenAt: Date.now() - (demo.days % 3) * 3_600_000,
    };
  }

  private neighborIds(): string[] {
    return this.read<string[]>(NEIGHBORS_KEY, ['demo-lea']);
  }

  isRegistered(): boolean {
    return this.read<string | null>(PSEUDO_KEY, null) !== null;
  }

  async pseudoAvailable(pseudo: string) {
    const error = validatePseudo(pseudo);
    if (error) return { available: false, error };
    const taken = DEMO.some((d) => d.pseudo.toLowerCase() === normalizePseudo(pseudo).toLowerCase());
    return { available: !taken, error: taken ? 'taken' : null };
  }

  async register(pseudo: string): Promise<void> {
    const check = await this.pseudoAvailable(pseudo);
    if (!check.available) throw new BackendError(check.error === 'taken' ? 'pseudoTaken' : 'pseudoInvalid');
    this.write(PSEUDO_KEY, normalizePseudo(pseudo));
  }

  async me(): Promise<Me> {
    return { ...this.myProfile(), banned: false, role: null, language: null, mutedUntil: null };
  }

  async setLanguage(): Promise<void> {}

  async rename(pseudo: string): Promise<string> {
    await this.register(pseudo);
    return normalizePseudo(pseudo);
  }

  async createTransferCode(): Promise<{ code: string; expiresAt: number }> {
    throw new BackendError('network');
  }

  async redeemTransferCode(): Promise<void> {
    throw new BackendError('network');
  }

  async deleteAccount(): Promise<void> {
    this.forget();
  }

  forget(): void {
    for (const key of [
      PSEUDO_KEY,
      NEIGHBORS_KEY,
      HELPED_KEY,
      CLAIMED_KEY,
      LISTINGS_KEY,
      BOUGHT_KEY,
      CHAT_KEY,
      REQUEST_KEY,
      GIVEN_KEY,
      LIKES_KEY,
      COMMUNITY_KEY,
    ]) {
      this.storage.removeItem(key);
    }
  }

  async pullSave(): Promise<RemoteSave | null> {
    return null;
  }

  async pushSave(baseRevision: number): Promise<PushResult> {
    return { ok: true, revision: baseRevision + 1 };
  }

  async ping(): Promise<void> {}

  async track(): Promise<void> {}

  async neighbors(): Promise<NeighborProfile[]> {
    const helped = this.read<Record<string, string>>(HELPED_KEY, {});
    return this.neighborIds()
      .map((id) => DEMO.find((d) => d.id === id))
      .filter((d): d is DemoPlayer => d !== undefined)
      .map((d) => ({ ...this.profile(d), helpedToday: helped[d.id] === today() }));
  }

  async suggestions(): Promise<Profile[]> {
    const mine = new Set(this.neighborIds());
    return DEMO.filter((d) => !mine.has(d.id)).map((d) => this.profile(d));
  }

  async search(text: string): Promise<Profile[]> {
    const key = text.trim().toLowerCase();
    return DEMO.filter((d) => d.pseudo.toLowerCase().startsWith(key)).map((d) => this.profile(d));
  }

  async addNeighbor(id: string): Promise<void> {
    const ids = this.neighborIds();
    if (!ids.includes(id)) this.write(NEIGHBORS_KEY, [...ids, id]);
  }

  async removeNeighbor(id: string): Promise<void> {
    this.write(
      NEIGHBORS_KEY,
      this.neighborIds().filter((n) => n !== id),
    );
  }

  async visit(id: string): Promise<Visit> {
    const demo = DEMO.find((d) => d.id === id);
    if (!demo) throw new BackendError('notFound');
    let data = this.cities.get(id);
    if (!data) {
      // Laisse l'interface afficher son indicateur avant ce calcul (≈ 1 s).
      await new Promise((resolve) => setTimeout(resolve, 30));
      const { game } = simulate({ days: demo.days });
      game.state.cityName = demo.cityName;
      data = serialize(game.state, Date.now());
      this.cities.set(id, data);
    }
    const isNeighbor = this.neighborIds().includes(id);
    const helped = this.read<Record<string, string>>(HELPED_KEY, {});
    return { profile: this.profile(demo), data, isNeighbor, helpedToday: helped[id] === today() };
  }

  async help(id: string): Promise<void> {
    const helped = this.read<Record<string, string>>(HELPED_KEY, {});
    if (helped[id] === today()) throw new BackendError('alreadyHelped');
    this.write(HELPED_KEY, { ...helped, [id]: today() });
  }

  /** Les voisins fictifs passent donner un coup de main une fois par jour. */
  async claimHelps(): Promise<{ count: number; helpers: string[] }> {
    if (this.read<string>(CLAIMED_KEY, '') === today()) return { count: 0, helpers: [] };
    this.write(CLAIMED_KEY, today());
    const helpers = (await this.neighbors()).map((n) => n.pseudo);
    return { count: helpers.length, helpers };
  }

  async leaderboard(by: 'level' | 'population'): Promise<Leaderboard> {
    const me = this.myProfile();
    const all = [...DEMO.map((d) => this.profile(d)), me];
    const xpOf = (p: Profile) => (p.id === 'me' ? this.summary().xp : p.level * 1000);
    all.sort((a, b) => (by === 'level' ? xpOf(b) - xpOf(a) : b.population - a.population));
    return { rows: all, myRank: all.findIndex((p) => p.id === 'me') + 1, me };
  }

  async block(id: string): Promise<void> {
    await this.removeNeighbor(id);
  }

  async report(): Promise<void> {}

  private listings(): MyListing[] {
    const now = Date.now();
    return this.read<MyListing[]>(LISTINGS_KEY, []).map((l) => {
      if (l.status !== 'open') return l;
      // Les voisins fictifs achètent les lots au prix raisonnable.
      if (l.unitPrice <= 6 && now - l.createdAt > DEMO_SALE_MS) {
        return { ...l, status: 'sold', income: sellerIncome(l.qty, l.unitPrice) };
      }
      return now >= l.expiresAt ? { ...l, status: 'expired' } : l;
    });
  }

  async marketOverview(): Promise<{ offers: MarketOffer[]; mine: MyListing[] }> {
    const bought = new Set(this.read<string[]>(BOUGHT_KEY, []));
    const day = Math.floor(Date.now() / 86_400_000);
    const offers: MarketOffer[] = DEMO.flatMap((d, i) =>
      [0, 1].map((k) => ({
        id: `${d.id}-${day}-${k}`,
        item: DEMO_ITEMS[(i * 3 + k + day) % DEMO_ITEMS.length] ?? 'wheat',
        qty: 30 + ((i * 37 + k * 53 + day) % 8) * 20,
        unitPrice: 2 + ((i * 3 + k * 5 + day) % 6),
        seller: d.pseudo,
        expiresAt: (day + 1) * 86_400_000,
      })),
    )
      .filter((o) => !bought.has(o.id))
      .sort((a, b) => a.unitPrice - b.unitPrice);
    return { offers, mine: this.listings() };
  }

  async marketCreate(item: string, qty: number, unitPrice: number): Promise<void> {
    const all = this.listings();
    if (all.filter((l) => l.status === 'open').length >= MARKET.maxListings) throw new BackendError('limit');
    const now = Date.now();
    all.push({
      id: `mine-${now}`,
      item,
      qty,
      unitPrice,
      createdAt: now,
      expiresAt: now + MARKET.durationMs,
      status: 'open',
      income: 0,
    });
    this.write(LISTINGS_KEY, all);
  }

  async marketBuy(id: string): Promise<{ item: string; qty: number; total: number }> {
    const offer = (await this.marketOverview()).offers.find((o) => o.id === id);
    if (!offer) throw new BackendError('notFound');
    this.write(BOUGHT_KEY, [...this.read<string[]>(BOUGHT_KEY, []), id].slice(-50));
    return { item: offer.item, qty: offer.qty, total: offer.qty * offer.unitPrice };
  }

  async marketCancel(id: string): Promise<{ item: string; qty: number }> {
    const all = this.listings();
    const listing = all.find((l) => l.id === id && l.status === 'open');
    if (!listing) throw new BackendError('notFound');
    this.write(
      LISTINGS_KEY,
      all.filter((l) => l.id !== id),
    );
    return { item: listing.item ?? 'wheat', qty: listing.qty };
  }

  async marketSettle(): Promise<{ coins: number; items: Record<string, number>; sold: number }> {
    const all = this.listings();
    let coins = 0;
    const items: Record<string, number> = {};
    let sold = 0;
    for (const l of all) {
      if (l.status === 'sold') {
        coins += l.income;
        sold++;
      } else if (l.status === 'expired') {
        const item = l.item ?? 'wheat';
        items[item] = (items[item] ?? 0) + l.qty;
      }
    }
    this.write(
      LISTINGS_KEY,
      all.filter((l) => l.status === 'open'),
    );
    return { coins, items, sold };
  }

  // ——— Demandes, « J'aime » et défi de quartier (simulés) ———

  /** Ma demande : les voisins fictifs y répondent petit à petit (5 unités toutes les 10 minutes). */
  async myRequest(): Promise<MyRequest | null> {
    const request = this.read<MyRequest | null>(REQUEST_KEY, null);
    if (!request) return null;
    const created = request.expiresAt - SOCIAL.requestDurationMs;
    const received = Math.min(request.qty, Math.floor((Date.now() - created) / 600_000) * 5);
    const claimed = request.received - request.toClaim;
    if (request.expiresAt <= Date.now() && claimed >= received) return null;
    return { ...request, received, toClaim: received - claimed };
  }

  async createRequest(item: string, qty: number): Promise<void> {
    const current = await this.myRequest();
    if (current && current.received < current.qty && current.expiresAt > Date.now()) throw new BackendError('limit');
    const request: MyRequest = {
      id: `request-${Date.now()}`,
      item,
      qty,
      received: 0,
      toClaim: 0,
      expiresAt: Date.now() + SOCIAL.requestDurationMs,
    };
    this.write(REQUEST_KEY, request);
  }

  async claimRequest(): Promise<{ item: string | null; qty: number }> {
    const request = await this.myRequest();
    if (!request) return { item: null, qty: 0 };
    this.write(REQUEST_KEY, { ...request, toClaim: 0 });
    return { item: request.item, qty: request.toClaim };
  }

  /** Une demande par voisin fictif et par jour. */
  async neighborRequests(): Promise<NeighborRequest[]> {
    const day = Math.floor(Date.now() / 86_400_000);
    const given = this.read<Record<string, number>>(GIVEN_KEY, {});
    return (await this.neighbors())
      .map((profile, i) => {
        const id = `${profile.id}-request-${day}`;
        const qty = 10 + ((i * 7 + day) % 4) * 5;
        const received = Math.min(qty, given[id] ?? 0);
        return {
          id,
          item: DEMO_ITEMS[(i * 5 + day) % DEMO_ITEMS.length] ?? 'wheat',
          qty,
          received,
          toClaim: 0,
          expiresAt: (day + 1) * 86_400_000,
          profile,
        };
      })
      .filter((r) => r.received < r.qty);
  }

  async giveToRequest(id: string, qty: number): Promise<void> {
    const given = this.read<Record<string, number>>(GIVEN_KEY, {});
    this.write(GIVEN_KEY, { ...given, [id]: (given[id] ?? 0) + qty });
  }

  private demoLikes(id: string): number {
    const week = weekOf(Date.now());
    let h = 0;
    for (const c of `${id}${week}`) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return 2 + (h % 18);
  }

  async like(playerId: string): Promise<number> {
    const week = weekOf(Date.now());
    const likes = this.read<Record<string, string>>(LIKES_KEY, {});
    if (likes[playerId] === week) throw new BackendError('alreadyHelped');
    this.write(LIKES_KEY, { ...likes, [playerId]: week });
    return this.demoLikes(playerId) + 1;
  }

  async likeStatus(playerId: string): Promise<{ likes: number; liked: boolean }> {
    const liked = this.read<Record<string, string>>(LIKES_KEY, {})[playerId] === weekOf(Date.now());
    return { likes: this.demoLikes(playerId) + (liked ? 1 : 0), liked };
  }

  async prettiest(): Promise<{ rows: Array<Profile & { likes: number }>; myRank: number | null; myLikes: number }> {
    const liked = this.read<Record<string, string>>(LIKES_KEY, {});
    const week = weekOf(Date.now());
    const me = await this.me();
    const myLikes = 3;
    const rows = [
      ...DEMO.map((d) => ({ ...this.profile(d), likes: this.demoLikes(d.id) + (liked[d.id] === week ? 1 : 0) })),
      { ...me, likes: myLikes },
    ].sort((a, b) => b.likes - a.likes);
    return { rows, myRank: rows.findIndex((r) => r.id === me.id) + 1, myLikes };
  }

  /** Défi de quartier : les voisins fictifs avancent au fil de la semaine. */
  async community(): Promise<CommunityStatus> {
    const week = weekOf(Date.now());
    const stored = this.read<{ week: string; mine: number; claimed: boolean }>(COMMUNITY_KEY, {
      week,
      mine: 0,
      claimed: false,
    });
    const mine = stored.week === week ? stored.mine : 0;
    const claimed = stored.week === week && stored.claimed;
    const goal = communityGoal(6);
    const elapsed = (Date.now() - Date.parse(`${week}T00:00:00Z`)) / (7 * 86_400_000);
    const total = Math.min(goal * 2, Math.round(goal * 0.9 * elapsed) + mine);
    return { week, total, goal, mine, claimable: total >= goal && mine > 0 && !claimed, claimed };
  }

  async contribute(amount: number): Promise<void> {
    const status = await this.community();
    const mine = Math.min(SOCIAL.communityMaxPerPlayer, status.mine + amount);
    this.write(COMMUNITY_KEY, { week: status.week, mine, claimed: status.claimed });
  }

  async claimCommunity(): Promise<void> {
    const status = await this.community();
    if (!status.claimable) throw new BackendError('notFound');
    this.write(COMMUNITY_KEY, { week: status.week, mine: status.mine, claimed: true });
  }

  // ——— Chat de démonstration (rien ne quitte l'appareil) ———

  private chatMessages(channel: string): ChatMessage[] {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const now = Date.now();
    const seeds: ChatMessage[] = DEMO_CHAT.filter((m) => (m.channel === 'world') === (channel === 'world'))
      .map((m) => {
        const demo = DEMO[m.who] ?? DEMO[0]!;
        return {
          id: `demo-${m.key}`,
          playerId: demo.id,
          pseudo: demo.pseudo,
          role: null,
          level: demo.level,
          text: t(m.key),
          createdAt: start.getTime() + m.minute * 60_000,
          kind: 'message' as const,
          mine: false,
        };
      })
      .filter((m) => m.createdAt <= now);
    const stored = this.read<Record<string, ChatMessage[]>>(CHAT_KEY, {})[channel] ?? [];
    return [...seeds, ...stored.filter((m) => m.createdAt <= now)]
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(-CHAT.pageSize);
  }

  private storeChat(channel: string, update: (list: ChatMessage[]) => ChatMessage[]): void {
    const all = this.read<Record<string, ChatMessage[]>>(CHAT_KEY, {});
    all[channel] = update(all[channel] ?? []).slice(-CHAT.pageSize);
    this.write(CHAT_KEY, all);
    for (const listener of this.chatListeners) listener();
  }

  private feed(channel: string): ChatFeed {
    return {
      messages: this.chatMessages(channel),
      mutedUntil: null,
      canWrite: this.summary().level >= CHAT.minLevel,
      canModerate: false,
    };
  }

  watchChat(channel: string, onFeed: (feed: ChatFeed) => void): () => void {
    const listener = () => onFeed(this.feed(channel));
    this.chatListeners.add(listener);
    setTimeout(listener, 0);
    return () => this.chatListeners.delete(listener);
  }

  watchPulse(channels: string[], onPulse: (pulse: ChatPulse) => void): () => void {
    const listener = () =>
      onPulse({
        latest: channels.map((channel) => ({ channel, at: this.chatMessages(channel).at(-1)?.createdAt ?? 0 })),
        announcementAt: 0,
      });
    this.chatListeners.add(listener);
    setTimeout(listener, 0);
    // Les messages programmés de la journée apparaissent avec le temps.
    const timer = window.setInterval(listener, 60_000);
    return () => {
      this.chatListeners.delete(listener);
      window.clearInterval(timer);
    };
  }

  async sendChat(channel: string, text: string): Promise<void> {
    if (this.summary().level < CHAT.minLevel) throw new BackendError('forbidden');
    const clean = cleanChatText(text);
    if (!clean) throw new BackendError('invalidText');
    const now = Date.now();
    const message: ChatMessage = {
      id: `mine-${now}`,
      playerId: 'me',
      pseudo: this.myProfile().pseudo,
      role: null,
      level: this.summary().level,
      text: clean,
      createdAt: now,
      kind: 'message',
      mine: true,
    };
    this.storeChat(channel, (list) => [...list, message]);
    // Un voisin fictif répond de temps en temps.
    if (Math.random() < 0.6) {
      setTimeout(() => {
        const demo = DEMO[Math.floor(Math.random() * DEMO.length)] ?? DEMO[0]!;
        const key = DEMO_REPLIES[Math.floor(Math.random() * DEMO_REPLIES.length)] ?? 'demo.reply1';
        this.storeChat(channel, (list) => [
          ...list,
          {
            id: `reply-${Date.now()}`,
            playerId: demo.id,
            pseudo: demo.pseudo,
            role: null,
            level: demo.level,
            text: t(key),
            createdAt: Date.now(),
            kind: 'message',
            mine: false,
          },
        ]);
      }, 3500);
    }
  }

  async deleteChat(id: string): Promise<void> {
    const all = this.read<Record<string, ChatMessage[]>>(CHAT_KEY, {});
    for (const channel of Object.keys(all)) this.storeChat(channel, (list) => list.filter((m) => m.id !== id));
  }

  async reportChat(): Promise<void> {}

  async mute(): Promise<void> {
    throw new BackendError('forbidden');
  }

  async announcements(): Promise<Announcement[]> {
    return [];
  }

  /** Démo hors-ligne : pas de serveur d'envoi (les rappels restent ceux de l'onglet ouvert). */
  async pushPublicKey(): Promise<string | null> {
    return null;
  }

  async pushSchedule(): Promise<void> {}

  async pushUnsubscribe(): Promise<void> {}
}
