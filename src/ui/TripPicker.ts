import type { Game } from '@/core/game';
import type { TripDef } from '@/core/types';
import { getBuildingDef } from '@/data/buildings';
import { TRIPS } from '@/data/crops';
import { ArtKey, type ArtLibrary } from '@/render/art/library';
import { clear, h, icon } from './dom';
import { formatDuration, formatNumber } from './format';
import { Icons } from './icons';

/** Choix de la sortie en mer d'un bateau. */
export class TripPicker {
  readonly el = h('section', { class: 'sheet crop-picker', attrs: { 'aria-label': 'Partir en mer' } });
  private list = h('div', { class: 'cards' });
  private entityId: number | null = null;
  isOpen = false;

  constructor(
    private readonly game: Game,
    private readonly art: ArtLibrary,
    private readonly onPick: (entityId: number, trip: TripDef) => void,
    private readonly onToggle: () => void,
  ) {
    this.el.append(
      h(
        'div',
        { class: 'sheet__header' },
        h('h2', { class: 'sheet__title', text: 'Où part le bateau ?' }),
        h(
          'button',
          { class: 'sheet__close', attrs: { 'aria-label': 'Fermer' }, onClick: () => this.close() },
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
    const tier = def.category === 'port' ? def.boatTier : 0;
    for (const trip of TRIPS) {
      if (trip.boatTier > tier) continue;
      const levelLocked = (trip.requires?.level ?? 1) > this.game.state.level;
      const tooExpensive = this.game.state.coins < trip.cost;
      this.list.append(
        h(
          'button',
          {
            class: `card card--crop${levelLocked ? ' is-locked' : ''}`,
            attrs: { 'aria-label': trip.name },
            onClick: () => {
              if (this.entityId !== null) this.onPick(this.entityId, trip);
            },
          },
          h(
            'span',
            { class: 'card__img' },
            h('img', { attrs: { src: this.art.iconUrl(ArtKey.boat(trip.boatTier)), alt: '' } }),
          ),
          h('span', { class: 'card__name', text: trip.name }),
          h(
            'span',
            { class: 'card__effect' },
            icon(Icons.clock),
            ` ${formatDuration(trip.durationSec)} · `,
            icon(Icons.goods),
            ` ${trip.goods}`,
          ),
          h(
            'span',
            { class: 'card__footer' },
            h('span', { class: `cost${tooExpensive ? ' is-short' : ''}` }, icon(Icons.coin), formatNumber(trip.cost)),
            h('span', { class: 'card__steps' }, icon(Icons.xp), String(trip.xp)),
          ),
          levelLocked ? h('span', { class: 'card__lock' }, icon(Icons.lock), `Niveau ${trip.requires?.level}`) : null,
        ),
      );
    }
  }
}
