import type { ScreenPoint } from '@/app/context';
import type { Game } from '@/core/game';
import type { Entity } from '@/core/types';
import { getBuildingDef } from '@/data/buildings';
import { getCropDef } from '@/data/crops';
import { clear, h, icon } from './dom';
import { formatClock, formatNumber } from './format';
import { Icons } from './icons';

export interface BubbleCallbacks {
  speedUp: (entityId: number) => void;
  move: (entityId: number) => void;
  sell: (entityId: number) => void;
}

/**
 * Bulle d'information ancrée au-dessus d'une construction : état, minuteur,
 * accélération contre du cash ; ou, en mode édition, déplacer / vendre.
 */
export class Bubble {
  readonly el = h('div', { class: 'bubble', attrs: { role: 'dialog' } });
  private entityId: number | null = null;
  private kind: 'info' | 'edit' = 'info';

  constructor(
    private readonly game: Game,
    private readonly callbacks: BubbleCallbacks,
  ) {}

  get openEntity(): number | null {
    return this.entityId;
  }

  showInfo(entityId: number, at: ScreenPoint): void {
    this.kind = 'info';
    this.open(entityId, at);
  }

  showEdit(entityId: number, at: ScreenPoint): void {
    this.kind = 'edit';
    this.open(entityId, at);
  }

  close(): void {
    this.entityId = null;
    this.el.classList.remove('is-open');
  }

  private open(entityId: number, at: ScreenPoint): void {
    this.entityId = entityId;
    this.render();
    const margin = 12;
    const width = Math.min(280, window.innerWidth - margin * 2);
    this.el.style.width = `${width}px`;
    const left = Math.max(margin, Math.min(window.innerWidth - width - margin, at.x - width / 2));
    const below = at.y < 230;
    this.el.style.left = `${left}px`;
    this.el.style.top = below ? `${at.y + 24}px` : '';
    this.el.style.bottom = below ? '' : `${window.innerHeight - at.y + 18}px`;
    this.el.style.setProperty('--arrow-x', `${Math.max(16, Math.min(width - 16, at.x - left))}px`);
    this.el.classList.toggle('is-below', below);
    this.el.classList.add('is-open');
  }

  /** Rafraîchissement périodique (minuteurs). */
  tick(): void {
    if (this.entityId === null) return;
    if (!this.game.getEntity(this.entityId)) {
      this.close();
      return;
    }
    this.render();
  }

  private render(): void {
    const entity = this.entityId !== null ? this.game.getEntity(this.entityId) : undefined;
    if (!entity) return;
    clear(this.el);
    if (this.kind === 'edit') this.renderEdit(entity);
    else this.renderInfo(entity);
  }

  private renderEdit(entity: Entity): void {
    const def = getBuildingDef(entity.defId);
    const sellable = def.sellable !== false;
    const refund = this.game.sellValue(entity);
    this.el.append(
      h('div', { class: 'bubble__title', text: def.name }),
      h(
        'div',
        { class: 'bubble__actions' },
        h('button', {
          class: 'btn btn--primary btn--small',
          text: 'Déplacer',
          onClick: () => this.callbacks.move(entity.id),
        }),
        sellable
          ? h(
              'button',
              { class: 'btn btn--danger btn--small', onClick: () => this.callbacks.sell(entity.id) },
              refund > 0 ? `Vendre (+${formatNumber(refund)})` : 'Retirer',
            )
          : null,
      ),
    );
  }

  private renderInfo(entity: Entity): void {
    const { game } = this;
    const def = getBuildingDef(entity.defId);
    const action = game.primaryAction(entity);
    const now = game.now();
    const lines: Array<HTMLElement | string> = [];
    let progress: number | null = null;
    let timer: number | null = null;
    let title = def.name;

    switch (def.category) {
      case 'house': {
        const rent = game.rentFor(entity);
        lines.push(h('span', {}, 'Loyer : ', icon(Icons.coin), ` ${formatNumber(rent.coins)}`));
        lines.push(`${def.population} habitants`);
        if (action.type === 'waitRent') {
          timer = (action.readyAt - now) / 1000;
          progress = 1 - timer / def.rent.intervalSec;
        }
        break;
      }
      case 'business': {
        const payout = game.payoutFor(entity);
        if (action.type === 'supply') {
          lines.push(h('span', {}, 'Besoin de ', icon(Icons.goods), ` ${def.supplyGoods} marchandises`));
          lines.push('Touchez le commerce pour l’approvisionner.');
        } else {
          const served = game.customersServed(entity);
          lines.push(`Clients servis : ${served.served}/${served.total}`);
          lines.push(h('span', {}, 'Recette : ', icon(Icons.coin), ` ${formatNumber(payout.coins)}`));
          if (action.type === 'waitCustomers') {
            timer = (action.readyAt - now) / 1000;
            progress = served.served / Math.max(1, served.total);
          }
        }
        break;
      }
      case 'farm': {
        if (entity.farm?.cropId) {
          const crop = getCropDef(entity.farm.cropId);
          title = `${def.name} — ${crop.name}`;
          lines.push(h('span', {}, 'Récolte : ', icon(Icons.goods), ` ${crop.goods} marchandises`));
          if (action.type === 'waitCrop') {
            timer = (action.readyAt - now) / 1000;
            progress = 1 - timer / crop.growSec;
          }
        }
        break;
      }
      case 'community':
        lines.push(`+${def.popCap} habitants max`);
        break;
      case 'storage':
        lines.push(`+${def.goodsCap} de stockage`);
        break;
      case 'decoration':
        lines.push(`+${def.bonus.percent} % de revenus aux bâtiments proches (rayon ${def.bonus.radius})`);
        break;
      default:
        break;
    }
    const bonus = game.decorationBonus(entity);
    if (bonus > 0) lines.push(h('span', { class: 'bubble__bonus', text: `Bonus décorations : +${bonus} %` }));

    this.el.append(h('div', { class: 'bubble__title', text: title }));
    for (const line of lines) this.el.append(h('div', { class: 'bubble__line' }, line));
    if (timer !== null) {
      this.el.append(
        h(
          'div',
          { class: 'bubble__timer' },
          icon(Icons.clock),
          h(
            'div',
            { class: 'progress' },
            h('div', { class: 'progress__fill', style: `width:${Math.round((progress ?? 0) * 100)}%` }),
          ),
          h('span', { text: formatClock(timer) }),
        ),
      );
      const cost = game.speedUpCost(entity);
      if (cost !== null) {
        this.el.append(
          h(
            'div',
            { class: 'bubble__actions' },
            h(
              'button',
              { class: 'btn btn--gold btn--small', onClick: () => this.callbacks.speedUp(entity.id) },
              'Terminer maintenant · ',
              icon(Icons.cash),
              ` ${cost}`,
            ),
          ),
        );
      }
    }
  }
}
