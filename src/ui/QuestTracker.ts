import type { Game } from '@/core/game';
import { findBuildingDef } from '@/data/buildings';
import { CROPS } from '@/data/crops';
import { t } from '@/i18n';
import { questTitle } from '@/i18n/content';
import { ArtKey, type ArtLibrary } from '@/render/art/library';
import { clear, h } from './dom';
import { Icons, LEA_AVATAR } from './icons';

/** Visuel d'un objectif : vignette de bâtiment, de culture ou icône. */
export function questIcon(art: ArtLibrary, iconId: string): HTMLElement {
  if (findBuildingDef(iconId)) return h('img', { attrs: { src: art.iconUrl(ArtKey.building(iconId), 96), alt: '' } });
  if (CROPS.some((c) => c.id === iconId))
    return h('img', { attrs: { src: art.iconUrl(ArtKey.cropIcon(iconId), 96), alt: '' } });
  if (iconId === 'expand') return h('span', { class: 'quest-svg', html: Icons.expand });
  if (iconId === 'level') return h('span', { class: 'quest-svg', html: Icons.trophy });
  return h('span', { class: 'quest-svg quest-svg--lea', html: LEA_AVATAR });
}

/** Colonne des objectifs actifs, à gauche de l'écran. */
export class QuestTracker {
  readonly el = h('div', { class: 'quests', attrs: { 'aria-label': t('quest.listAria') } });
  private seen = new Set<string>();

  constructor(
    private readonly game: Game,
    private readonly art: ArtLibrary,
    private readonly onOpen: (questId: string) => void,
  ) {
    for (const q of game.state.quests.active) this.seen.add(q.id);
    this.refresh();
  }

  markSeen(questId: string): void {
    this.seen.add(questId);
    this.refresh();
  }

  markNew(questId: string): void {
    this.seen.delete(questId);
    this.refresh();
  }

  refresh(): void {
    clear(this.el);
    for (const { def, progress } of this.game.activeQuests().slice(0, 5)) {
      const status = this.game.questTaskStatus(progress);
      const single = status.length === 1 ? status[0] : undefined;
      // Une seule tâche : son compteur (1/2) ; sinon le nombre de tâches terminées.
      const label = single
        ? `${single.value}/${single.target}`
        : `${status.filter((t) => t.done).length}/${status.length}`;
      const isNew = !this.seen.has(def.id);
      const button = h(
        'button',
        {
          class: `quest${isNew ? ' is-new' : ''}`,
          attrs: { 'aria-label': t('quest.aria', { title: questTitle(def) }) },
          onClick: () => {
            this.markSeen(def.id);
            this.onOpen(def.id);
          },
        },
        h('span', { class: 'quest__icon' }, questIcon(this.art, def.icon)),
        h('span', { class: 'quest__progress', text: label }),
        isNew ? h('span', { class: 'quest__new', text: t('quest.new') }) : null,
      );
      this.el.append(button);
    }
  }
}
