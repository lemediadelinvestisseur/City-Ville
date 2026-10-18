import type { Game } from '@/core/game';
import { serialize, type KeyValueStorage } from '@/core/save';
import type { Reward } from '@/core/types';
import { BackendError, type Backend, type TrackedEvent } from '@/services/online/Backend';

const REVISION_KEY = 'city-ville:revision';
const DIRTY_KEY = 'city-ville:dirty';
const PUSH_DELAY_MS = 15_000;
const PING_MS = 60_000;
const HELPS_MS = 5 * 60_000;

export interface OnlineCallbacks {
  /** Une autre version de la ville (autre appareil) est plus récente : laquelle garder ? */
  onConflict: (remote: { revision: number; savedAt: number }, choose: (keep: 'local' | 'remote') => void) => void;
  /** Remplace la partie locale par une sauvegarde distante (rechargement). */
  adoptSave: (data: string, revision: number) => void;
  onHelpsReceived: (helpers: string[], reward: Reward) => void;
}

/**
 * Lien entre la partie locale et les services en ligne : sauvegarde
 * automatique (avec révisions), sessions de jeu, évènements et coups de main.
 * La partie reste jouable hors-ligne : les envois sont réessayés plus tard.
 */
export class OnlineSync {
  private revision: number;
  private dirty: boolean;
  private pushTimer = 0;
  private pushing = false;
  private conflictOpen = false;
  private events: TrackedEvent[] = [];
  private readonly sessionId = crypto.getRandomValues(new Uint32Array(4)).join('-');
  private started = false;

  constructor(
    private readonly game: Game,
    private readonly backend: Backend,
    private readonly storage: KeyValueStorage,
    private readonly callbacks: OnlineCallbacks,
  ) {
    this.revision = Number(storage.getItem(REVISION_KEY) ?? '0') || 0;
    this.dirty = storage.getItem(DIRTY_KEY) !== '0';
    game.events.on('change', () => this.markDirty());
    game.events.on('questCompleted', ({ questId }) => this.events.push({ type: 'quest', name: questId }));
    game.events.on('levelUp', ({ level }) => this.events.push({ type: 'level', name: String(level) }));
  }

  /** Révision à adopter après un rechargement (sauvegarde distante choisie). */
  static rememberRevision(storage: KeyValueStorage, revision: number): void {
    storage.setItem(REVISION_KEY, String(revision));
    storage.setItem(DIRTY_KEY, '0');
  }

  /** Démarre la synchronisation une fois le joueur identifié. */
  async start(): Promise<void> {
    if (this.started || !this.backend.isRegistered()) return;
    this.started = true;
    await this.reconcile();
    void this.ping();
    void this.claimHelps();
    window.setInterval(() => {
      if (document.visibilityState === 'visible') void this.ping();
    }, PING_MS);
    window.setInterval(() => void this.claimHelps(), HELPS_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void this.push();
      else void this.ping();
    });
  }

  private markDirty(): void {
    if (!this.dirty) {
      this.dirty = true;
      this.storage.setItem(DIRTY_KEY, '1');
    }
    if (!this.started) return;
    window.clearTimeout(this.pushTimer);
    this.pushTimer = window.setTimeout(() => void this.push(), PUSH_DELAY_MS);
  }

  /** Au démarrage : récupère une version plus récente faite sur un autre appareil. */
  private async reconcile(): Promise<void> {
    try {
      const remote = await this.backend.pullSave();
      if (remote && remote.revision > this.revision) {
        if (!this.dirty) {
          this.callbacks.adoptSave(remote.data, remote.revision);
          return;
        }
        this.askConflict({ revision: remote.revision, savedAt: remote.savedAt });
        return;
      }
      if (this.dirty || !remote) await this.push();
    } catch {
      // Hors-ligne : on réessaiera à la prochaine modification.
    }
  }

  /** Envoie la ville si elle a changé depuis le dernier envoi réussi. */
  async push(force = false): Promise<void> {
    if (!this.started || this.pushing || this.conflictOpen || (!this.dirty && !force)) return;
    this.pushing = true;
    try {
      const result = await this.backend.pushSave(this.revision, serialize(this.game.state, Date.now()), force);
      if (result.ok) {
        this.revision = result.revision;
        this.dirty = false;
        this.storage.setItem(REVISION_KEY, String(this.revision));
        this.storage.setItem(DIRTY_KEY, '0');
      } else {
        this.askConflict(result.conflict);
      }
    } catch (error) {
      if (error instanceof BackendError && error.code === 'unauthorized') this.started = false;
    } finally {
      this.pushing = false;
    }
  }

  private askConflict(remote: { revision: number; savedAt: number }): void {
    if (this.conflictOpen) return;
    this.conflictOpen = true;
    this.callbacks.onConflict(remote, (keep) => {
      this.conflictOpen = false;
      if (keep === 'local') {
        void this.push(true);
        return;
      }
      void this.backend.pullSave().then((save) => {
        if (save) this.callbacks.adoptSave(save.data, save.revision);
      });
    });
  }

  private async ping(): Promise<void> {
    try {
      await this.backend.ping(this.sessionId);
      const batch = this.events.splice(0, 20);
      if (batch.length) await this.backend.track(batch).catch(() => this.events.unshift(...batch));
    } catch {
      // Hors-ligne : la session reprendra au prochain signal.
    }
  }

  private async claimHelps(): Promise<void> {
    try {
      const { count, helpers } = await this.backend.claimHelps();
      if (count > 0) this.callbacks.onHelpsReceived(helpers, this.game.receiveHelps(count));
    } catch {
      // Réessayé plus tard.
    }
  }
}
