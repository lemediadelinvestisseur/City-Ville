import { Emitter } from '@/core/emitter';
import type { KeyValueStorage } from '@/core/save';

const INBOX_KEY = 'city-ville:inbox';
const MAX_ITEMS = 50;

export type InboxKind =
  'crop' | 'build' | 'boat' | 'business' | 'quest' | 'level' | 'daily' | 'neighbor' | 'market' | 'announcement';

/** Où mène un message quand on le touche. */
export type InboxTarget =
  { kind: 'entity'; entityId: number } | { kind: 'daily' } | { kind: 'chat' } | { kind: 'neighbors' };

export interface InboxItem {
  id: string;
  at: number;
  kind: InboxKind;
  /** Texte déjà traduit (le centre est vidé quand on change de langue). */
  text: string;
  read: boolean;
  target?: InboxTarget;
  /** Messages regroupables (le plus récent non lu remplace le précédent). */
  group?: string;
}

/**
 * Centre de notifications : historique des messages du jeu (cultures prêtes,
 * objectifs accomplis, coups de main, annonces…), gardé sur l'appareil.
 */
export class InboxStore {
  readonly events = new Emitter<{ change: undefined }>();
  private items: InboxItem[] = [];

  constructor(private readonly storage: KeyValueStorage) {
    try {
      const raw = storage.getItem(INBOX_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) this.items = (parsed as InboxItem[]).filter((i) => typeof i?.text === 'string');
    } catch {
      this.items = [];
    }
  }

  list(): readonly InboxItem[] {
    return this.items;
  }

  unread(): number {
    return this.items.filter((i) => !i.read).length;
  }

  /**
   * Ajoute un message. Avec `replaceKey`, un message non lu du même type et de
   * la même clé est remplacé (« 3 champs prêts » plutôt que trois lignes).
   */
  add(
    item: Omit<InboxItem, 'id' | 'read' | 'at' | 'group'> & { at?: number },
    replaceKey?: string,
    /** Déjà vu par le joueur (affiché en grand à l'instant) : ne compte pas dans la pastille. */
    read = false,
  ): void {
    const at = item.at ?? Date.now();
    const id = `${item.kind}:${at}:${Math.random().toString(36).slice(2, 7)}`;
    const group = replaceKey ? `${item.kind}:${replaceKey}` : undefined;
    if (group) this.items = this.items.filter((i) => i.read || i.group !== group);
    this.items.unshift(group ? { ...item, at, id, read, group } : { ...item, at, id, read });
    this.items = this.items.slice(0, MAX_ITEMS);
    this.save();
  }

  markAllRead(): void {
    if (this.unread() === 0) return;
    this.items = this.items.map((i) => ({ ...i, read: true }));
    this.save();
  }

  clear(): void {
    this.items = [];
    this.save();
  }

  private save(): void {
    try {
      this.storage.setItem(INBOX_KEY, JSON.stringify(this.items));
    } catch {
      // Stockage plein : l'historique reste en mémoire.
    }
    this.events.emit('change', undefined);
  }
}
