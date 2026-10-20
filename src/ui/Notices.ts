import type { InboxKind, InboxStore, InboxTarget } from '@/app/inbox';
import type { Game, ReadyItem, ReadyKind } from '@/core/game';
import type { KeyValueStorage } from '@/core/save';
import { formatList, t, tn } from '@/i18n';
import { questTitle } from '@/i18n/content';
import { readyMessage } from '@/i18n/ready';
import { Icons } from './icons';
import type { SideButtons } from './SideButtons';
import type { Toasts } from './Toasts';

const LAST_SEEN_KEY = 'city-ville:last-seen';
/** Les attentes terminées à quelques instants d'écart sont annoncées ensemble. */
const BURST_MS = 1500;

const READY_ICONS: Record<ReadyKind, string> = {
  crop: Icons.goods,
  build: Icons.build,
  boat: Icons.boat,
  train: Icons.train,
  business: Icons.coin,
};

interface Deps {
  game: Game;
  toasts: Toasts;
  inbox: InboxStore;
  side: SideButtons;
  storage: KeyValueStorage;
  go: (target: InboxTarget) => void;
}

/**
 * Messages qui apparaissent pendant la partie : ce qui vient d'être prêt
 * (regroupé), défis remplis, résumé au retour du joueur. Chaque message
 * important est aussi rangé dans le centre de notifications.
 */
export class Notices {
  private pending = new Map<ReadyKind, ReadyItem[]>();
  private burstTimer = 0;
  private readonly lastSeen: number;

  constructor(private readonly deps: Deps) {
    const { game, storage } = deps;
    this.lastSeen = Number(storage.getItem(LAST_SEEN_KEY) ?? '0') || 0;
    const remember = () => {
      try {
        storage.setItem(LAST_SEEN_KEY, String(Date.now()));
      } catch {
        // Sans gravité : pas de résumé au prochain retour.
      }
    };
    remember();
    window.setInterval(remember, 30_000);
    document.addEventListener('visibilitychange', remember);

    game.events.on('ready', ({ items }) => {
      for (const item of items) this.pending.set(item.kind, [...(this.pending.get(item.kind) ?? []), item]);
      window.clearTimeout(this.burstTimer);
      this.burstTimer = window.setTimeout(() => this.flush(), BURST_MS);
    });
    game.events.on('dailyCompleted', () => {
      deps.side.wiggle('daily');
      this.post('daily', t('daily.completed'), { kind: 'daily' }, Icons.calendar, 'success');
    });
    game.events.on('questCompleted', ({ questId }) => {
      deps.inbox.add({ kind: 'quest', text: t('inbox.quest', { title: questTitle(questId) }) }, undefined, true);
    });
    game.events.on('levelUp', ({ level }) => {
      deps.inbox.add({ kind: 'level', text: t('inbox.level', { level }) }, undefined, true);
    });
  }

  /** Affiche un message en jeu et le range dans le centre de notifications. */
  post(
    kind: InboxKind,
    text: string,
    target?: InboxTarget,
    svg?: string,
    tone: 'info' | 'success' = 'info',
    replaceKey?: string,
  ): void {
    this.deps.inbox.add(target ? { kind, text, target } : { kind, text }, replaceKey);
    this.deps.toasts.show(
      text,
      tone,
      target ? { label: t('common.see'), onClick: () => this.deps.go(target) } : undefined,
      { icon: svg, key: replaceKey ? `${kind}:${replaceKey}` : undefined },
    );
  }

  private flush(): void {
    for (const [kind, items] of this.pending) {
      const first = items[0];
      if (!first) continue;
      const entity = this.deps.game.getEntity(first.entityId);
      const text = readyMessage({
        kind,
        count: items.length,
        defId: entity?.defId,
        cropId: entity?.farm?.cropId ?? undefined,
      });
      this.post(kind, text, { kind: 'entity', entityId: first.entityId }, READY_ICONS[kind], 'info', kind);
    }
    this.pending.clear();
  }

  /** Au retour du joueur : ce qui s'est terminé pendant son absence (après 10 minutes au moins). */
  welcomeBack(): void {
    const { game, toasts } = this.deps;
    if (!this.lastSeen || Date.now() - this.lastSeen < 10 * 60_000) return;
    const items = game.readySince(this.lastSeen, game.now());
    const counts = new Map<ReadyKind, number>();
    for (const item of items) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
    if (counts.size === 0) return;
    const parts = (['crop', 'build', 'boat', 'train', 'business'] as const)
      .filter((kind) => counts.has(kind))
      .map((kind) => tn(`away.${kind}`, counts.get(kind) ?? 0));
    const first = items[0];
    toasts.show(
      `${t('away.title')} ${t('away.summary', { list: formatList(parts) })}`,
      'success',
      first
        ? { label: t('common.see'), onClick: () => this.deps.go({ kind: 'entity', entityId: first.entityId }) }
        : undefined,
      { duration: 6000 },
    );
  }
}
