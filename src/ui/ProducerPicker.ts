import type { Game } from '@/core/game';
import type { RecipeDef } from '@/data/recipes';
import { recipesOf } from '@/data/recipes';
import { getBuildingDef } from '@/data/buildings';
import { t } from '@/i18n';
import { buildingName, recipeName } from '@/i18n/content';
import { clear, h, icon } from './dom';
import { formatDuration } from './format';
import { Icons } from './icons';
import { bagChips, itemChip, itemEmoji } from './items';

/** Choix de la production d'un élevage ou d'un atelier : ingrédients → produit. */
export class ProducerPicker {
  readonly el = h('section', { class: 'sheet crop-picker', attrs: { 'aria-label': t('produce.aria') } });
  private title = h('h2', { class: 'sheet__title' });
  private list = h('div', { class: 'cards' });
  private entityId: number | null = null;
  isOpen = false;

  constructor(
    private readonly game: Game,
    private readonly onPick: (entityId: number, recipe: RecipeDef) => void,
    private readonly onToggle: () => void,
  ) {
    this.el.append(
      h(
        'div',
        { class: 'sheet__header' },
        this.title,
        h(
          'button',
          { class: 'sheet__close', attrs: { 'aria-label': t('common.close') }, onClick: () => this.close() },
          icon(Icons.close),
        ),
      ),
      this.list,
    );
  }

  open(entityId: number): void {
    this.entityId = entityId;
    this.isOpen = true;
    this.render();
    this.el.classList.add('is-open');
    this.onToggle();
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.entityId = null;
    this.el.classList.remove('is-open');
    this.onToggle();
  }

  private render(): void {
    clear(this.list);
    const entity = this.entityId !== null ? this.game.getEntity(this.entityId) : undefined;
    if (!entity) return;
    const def = getBuildingDef(entity.defId);
    this.title.textContent = t(def.category === 'ranch' ? 'produce.titleRanch' : 'produce.titleWorkshop', {
      name: buildingName(def),
    });
    for (const recipe of recipesOf(def.id)) {
      const levelLocked = (recipe.requires?.level ?? 1) > this.game.state.level;
      const missing = this.game.missingItem(recipe.inputs) !== null;
      this.list.append(
        h(
          'button',
          {
            class: `card card--crop card--recipe${levelLocked ? ' is-locked' : ''}${missing ? ' is-short' : ''}`,
            attrs: { 'aria-label': recipeName(recipe.id) },
            onClick: () => {
              if (this.entityId !== null) this.onPick(this.entityId, recipe);
            },
          },
          h('span', { class: 'card__img card__emoji', text: itemEmoji(recipe.output.item) }),
          h('span', { class: 'card__name', text: recipeName(recipe.id) }),
          h(
            'span',
            { class: 'card__effect card__flow' },
            bagChips(recipe.inputs, this.game),
            ' → ',
            itemChip(recipe.output.item, recipe.output.qty),
          ),
          h(
            'span',
            { class: 'card__footer' },
            h('span', { class: 'card__steps' }, icon(Icons.clock), formatDuration(recipe.durationSec)),
            h('span', { class: 'card__steps' }, icon(Icons.xp), String(recipe.xp)),
          ),
          levelLocked
            ? h(
                'span',
                { class: 'card__lock' },
                icon(Icons.lock),
                t('common.level', { level: recipe.requires?.level ?? 1 }),
              )
            : null,
        ),
      );
    }
  }
}
