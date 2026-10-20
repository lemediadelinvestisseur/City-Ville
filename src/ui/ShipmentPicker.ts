import type { Game } from '@/core/game';
import type { ShipmentDef } from '@/core/types';
import { SHIPMENTS } from '@/data/crops';
import { t } from '@/i18n';
import { shipmentName } from '@/i18n/content';
import { ArtKey, type ArtLibrary } from '@/render/art/library';
import { clear, h, icon } from './dom';
import { formatDuration, formatNumber } from './format';
import { Icons } from './icons';

/** Choix de la livraison d'un train (gare). */
export class ShipmentPicker {
  readonly el = h('section', { class: 'sheet crop-picker', attrs: { 'aria-label': t('shipments.aria') } });
  private list = h('div', { class: 'cards' });
  private entityId: number | null = null;
  isOpen = false;

  constructor(
    private readonly game: Game,
    private readonly art: ArtLibrary,
    private readonly onPick: (entityId: number, shipment: ShipmentDef) => void,
    private readonly onToggle: () => void,
  ) {
    this.el.append(
      h(
        'div',
        { class: 'sheet__header' },
        h('h2', { class: 'sheet__title', text: t('shipments.title') }),
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
    if (this.entityId === null) return;
    for (const shipment of SHIPMENTS) {
      const levelLocked = (shipment.requires?.level ?? 1) > this.game.state.level;
      const short = this.game.state.goods < shipment.goods;
      this.list.append(
        h(
          'button',
          {
            class: `card card--crop${levelLocked ? ' is-locked' : ''}`,
            attrs: { 'aria-label': shipmentName(shipment) },
            onClick: () => {
              if (this.entityId !== null) this.onPick(this.entityId, shipment);
            },
          },
          h('span', { class: 'card__img' }, h('img', { attrs: { src: this.art.iconUrl(ArtKey.train), alt: '' } })),
          h('span', { class: 'card__name', text: shipmentName(shipment) }),
          h(
            'span',
            { class: 'card__effect' },
            icon(Icons.clock),
            ` ${formatDuration(shipment.durationSec)} · `,
            icon(Icons.coin),
            ` ${formatNumber(shipment.coins)}`,
          ),
          h(
            'span',
            { class: 'card__footer' },
            h('span', { class: `cost${short ? ' is-short' : ''}` }, icon(Icons.goods), formatNumber(shipment.goods)),
            h('span', { class: 'card__steps' }, icon(Icons.xp), String(shipment.xp)),
          ),
          levelLocked
            ? h(
                'span',
                { class: 'card__lock' },
                icon(Icons.lock),
                t('common.level', { level: shipment.requires?.level ?? 1 }),
              )
            : null,
        ),
      );
    }
  }
}
