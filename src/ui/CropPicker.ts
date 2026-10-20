import type { Game } from '@/core/game';
import type { CropDef } from '@/core/types';
import { CROPS } from '@/data/crops';
import { t } from '@/i18n';
import { cropName } from '@/i18n/content';
import { ArtKey, type ArtLibrary } from '@/render/art/library';
import { clear, h, icon } from './dom';
import { formatDuration, formatNumber } from './format';
import { Icons } from './icons';
import { itemEmoji } from './items';

/** Choix de la culture à planter. */
export class CropPicker {
  readonly el = h('section', { class: 'sheet crop-picker', attrs: { 'aria-label': t('crops.aria') } });
  private list = h('div', { class: 'cards' });
  isOpen = false;

  constructor(
    private readonly game: Game,
    private readonly art: ArtLibrary,
    private readonly onPick: (crop: CropDef) => void,
    private readonly onClose: () => void,
  ) {
    this.el.append(
      h(
        'div',
        { class: 'sheet__header' },
        h('h2', { class: 'sheet__title', text: t('crops.title') }),
        h(
          'button',
          { class: 'sheet__close', attrs: { 'aria-label': t('common.close') }, onClick: () => this.close() },
          icon(Icons.close),
        ),
      ),
      this.list,
    );
  }

  open(): void {
    this.isOpen = true;
    this.render();
    this.el.classList.add('is-open');
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.classList.remove('is-open');
    this.onClose();
  }

  private render(): void {
    clear(this.list);
    for (const crop of CROPS) {
      const levelLocked = (crop.requires?.level ?? 1) > this.game.state.level;
      const tooExpensive = this.game.state.coins < crop.cost;
      this.list.append(
        h(
          'button',
          {
            class: `card card--crop${levelLocked ? ' is-locked' : ''}`,
            attrs: { 'aria-label': cropName(crop) },
            onClick: () => this.onPick(crop),
          },
          h(
            'span',
            { class: 'card__img' },
            h('img', { attrs: { src: this.art.iconUrl(ArtKey.cropIcon(crop.id)), alt: '' } }),
          ),
          h('span', { class: 'card__name', text: cropName(crop) }),
          h(
            'span',
            { class: 'card__effect' },
            icon(Icons.clock),
            ` ${formatDuration(crop.growSec)} · `,
            ` ${itemEmoji(crop.id)} ${crop.amount}`,
          ),
          h(
            'span',
            { class: 'card__footer' },
            h('span', { class: `cost${tooExpensive ? ' is-short' : ''}` }, icon(Icons.coin), formatNumber(crop.cost)),
            h('span', { class: 'card__steps' }, icon(Icons.xp), String(crop.xp)),
          ),
          levelLocked
            ? h(
                'span',
                { class: 'card__lock' },
                icon(Icons.lock),
                t('common.level', { level: crop.requires?.level ?? 1 }),
              )
            : null,
        ),
      );
    }
  }
}
