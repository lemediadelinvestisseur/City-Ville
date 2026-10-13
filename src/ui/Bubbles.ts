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

interface Timing {
  /** Secondes restantes, ou null s'il n'y a pas d'attente en cours. */
  remaining: number | null;
  progress: number;
  served: { served: number; total: number } | null;
}

/**
 * Bulle d'information ancrée au-dessus d'une construction : état, minuteur,
 * accélération contre du cash ; ou, en mode édition, déplacer / vendre.
 *
 * La structure n'est reconstruite que lorsque l'état change ; le minuteur est
 * mis à jour sur place pour ne pas « voler » les clics sur les boutons.
 */
export class Bubble {
  readonly el = h('div', { class: 'bubble', attrs: { role: 'dialog' } });
  private entityId: number | null = null;
  private kind: 'info' | 'edit' = 'info';
  private renderedKey = '';
  private refs: { timer: HTMLElement | null; fill: HTMLElement | null; served: HTMLElement | null } = {
    timer: null,
    fill: null,
    served: null,
  };

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
    this.renderedKey = '';
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
    const entity = this.game.getEntity(this.entityId);
    if (!entity) {
      this.close();
      return;
    }
    if (this.structureKey(entity) !== this.renderedKey) this.render();
    else this.updateTiming(entity);
  }

  /** Ce qui, s'il change, impose de reconstruire la bulle (boutons, lignes). */
  private structureKey(entity: Entity): string {
    if (this.kind === 'edit') return `edit:${entity.id}`;
    const action = this.game.primaryAction(entity).type;
    const cost = this.game.speedUpCost(entity);
    return `info:${entity.id}:${action}:${cost}:${this.game.decorationBonus(entity)}:${entity.farm?.cropId ?? ''}`;
  }

  private timing(entity: Entity): Timing {
    const { game } = this;
    const def = getBuildingDef(entity.defId);
    const action = game.primaryAction(entity);
    const now = game.now();
    if (action.type === 'waitRent' && def.category === 'house') {
      const remaining = (action.readyAt - now) / 1000;
      return { remaining, progress: 1 - remaining / def.rent.intervalSec, served: null };
    }
    if (action.type === 'waitCrop' && entity.farm?.cropId) {
      const remaining = (action.readyAt - now) / 1000;
      return { remaining, progress: 1 - remaining / getCropDef(entity.farm.cropId).growSec, served: null };
    }
    if (def.category === 'business' && action.type !== 'supply') {
      const served = game.customersServed(entity);
      const remaining = action.type === 'waitCustomers' ? (action.readyAt - now) / 1000 : null;
      return { remaining, progress: served.served / Math.max(1, served.total), served };
    }
    return { remaining: null, progress: 0, served: null };
  }

  private updateTiming(entity: Entity): void {
    const timing = this.timing(entity);
    if (this.refs.timer && timing.remaining !== null) this.refs.timer.textContent = formatClock(timing.remaining);
    if (this.refs.fill) this.refs.fill.style.width = `${Math.round(Math.max(0, Math.min(1, timing.progress)) * 100)}%`;
    if (this.refs.served && timing.served) {
      this.refs.served.textContent = `Clients servis : ${timing.served.served}/${timing.served.total}`;
    }
  }

  private render(): void {
    const entity = this.entityId !== null ? this.game.getEntity(this.entityId) : undefined;
    if (!entity) return;
    clear(this.el);
    this.refs = { timer: null, fill: null, served: null };
    if (this.kind === 'edit') this.renderEdit(entity);
    else this.renderInfo(entity);
    this.renderedKey = this.structureKey(entity);
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
    const timing = this.timing(entity);
    const lines: Array<HTMLElement | string> = [];
    let title = def.name;

    switch (def.category) {
      case 'house': {
        const rent = game.rentFor(entity);
        lines.push(h('span', {}, 'Loyer : ', icon(Icons.coin), ` ${formatNumber(rent.coins)}`));
        lines.push(`${def.population} habitants`);
        break;
      }
      case 'business': {
        if (action.type === 'supply') {
          lines.push(h('span', {}, 'Besoin de ', icon(Icons.goods), ` ${def.supplyGoods} marchandises`));
          lines.push('Touchez le commerce pour l’approvisionner.');
        } else if (timing.served) {
          this.refs.served = h('span', { text: `Clients servis : ${timing.served.served}/${timing.served.total}` });
          lines.push(this.refs.served);
          lines.push(h('span', {}, 'Recette : ', icon(Icons.coin), ` ${formatNumber(game.payoutFor(entity).coins)}`));
        }
        break;
      }
      case 'farm': {
        if (entity.farm?.cropId) {
          const crop = getCropDef(entity.farm.cropId);
          title = `${def.name} — ${crop.name}`;
          lines.push(h('span', {}, 'Récolte : ', icon(Icons.goods), ` ${crop.goods} marchandises`));
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
    if (timing.remaining === null) return;

    this.refs.fill = h('div', { class: 'progress__fill' });
    this.refs.timer = h('span');
    this.el.append(
      h(
        'div',
        { class: 'bubble__timer' },
        icon(Icons.clock),
        h('div', { class: 'progress' }, this.refs.fill),
        this.refs.timer,
      ),
    );
    this.updateTiming(entity);
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
