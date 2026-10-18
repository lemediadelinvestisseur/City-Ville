import { serialize, type KeyValueStorage } from '@/core/save';
import { simulate } from '@/core/simulation';
import { normalizePseudo, validatePseudo } from '@/core/pseudo';
import {
  BackendError,
  type Backend,
  type Leaderboard,
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

/**
 * Services en ligne simulés : rien ne quitte l'appareil. Permet de jouer
 * (et de tester l'interface sociale) avant la mise en ligne du serveur.
 */
export class LocalBackend implements Backend {
  readonly kind = 'local' as const;
  private cities = new Map<string, string>();

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

  async me() {
    return { ...this.myProfile(), banned: false };
  }

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
    for (const key of [PSEUDO_KEY, NEIGHBORS_KEY, HELPED_KEY, CLAIMED_KEY]) this.storage.removeItem(key);
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
}
