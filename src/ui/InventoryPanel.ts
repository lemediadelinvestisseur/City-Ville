import type { Game } from '@/core/game';
import { ITEMS, sellPrice, type ItemDef, type ItemFamily } from '@/data/items';
import { MARKET } from '@/data/market';
import { t } from '@/i18n';
import { itemName } from '@/i18n/content';
import { clear, h, icon } from './dom';
import { formatNumber } from './format';
import { Icons } from './icons';
import type { Modals } from './Modals';

const FAMILY_ORDER: readonly ItemFamily[] = ['cereal', 'produce', 'protein', 'dairy', 'other'];

interface Callbacks {
  /** Ouvre le marché entre joueurs avec ce produit présélectionné. */
  toMarket: (item: string) => void;
  toast: (text: string, kind: 'info' | 'success' | 'error') => void;
}

/**
 * Inventaire : ce que contient l'entrepôt, rangé par familles. Toucher un
 * produit permet de le vendre au marchand ou de le mettre au marché.
 */
export class InventoryPanel {
  private content: HTMLElement | null = null;
  private selected: string | null = null;

  constructor(
    private readonly game: Game,
    private readonly modals: Modals,
    private readonly callbacks: Callbacks,
  ) {
    game.events.on('change', () => {
      if (this.content?.isConnected) this.render();
    });
  }

  open(item: string | null = null): void {
    this.selected = item;
    this.content = h('div', { class: 'inventory' });
    this.render();
    this.modals.show({
      title: t('inventory.title'),
      kicker: t('inventory.kicker'),
      className: 'modal--inventory',
      body: this.content,
      buttons: [{ label: t('common.close'), kind: 'secondary' }],
      onClose: () => {
        this.content = null;
      },
    });
  }

  private render(): void {
    const content = this.content;
    if (!content) return;
    clear(content);
    const stock = this.game.stock();
    const cap = this.game.derived().goodsCap;
    content.append(
      h(
        'div',
        { class: 'inventory__cap' },
        icon(Icons.goods),
        h('span', { text: t('inventory.capacity', { n: formatNumber(stock), max: formatNumber(cap) }) }),
        h(
          'div',
          { class: `progress${stock >= cap ? ' is-full' : ''}` },
          h('div', { class: 'progress__fill', style: `width:${Math.min(100, (stock / Math.max(1, cap)) * 100)}%` }),
        ),
      ),
    );
    const owned = ITEMS.filter((item) => this.game.itemCount(item.id) > 0);
    if (owned.length === 0) {
      content.append(h('p', { class: 'muted inventory__empty', text: t('inventory.empty') }));
      return;
    }
    for (const family of FAMILY_ORDER) {
      const items = owned.filter((item) => item.family === family);
      if (items.length === 0) continue;
      content.append(h('div', { class: 'modal__section-title', text: t(`inventory.family.${family}`) }));
      const grid = h('div', { class: 'inventory__grid' });
      for (const item of items) {
        grid.append(
          h(
            'button',
            {
              class: `inventory__item${this.selected === item.id ? ' is-selected' : ''}`,
              attrs: { 'aria-label': `${itemName(item.id)} : ${this.game.itemCount(item.id)}` },
              onClick: () => {
                this.selected = this.selected === item.id ? null : item.id;
                this.render();
              },
            },
            h('span', { class: 'inventory__emoji', text: item.emoji }),
            h('span', { class: 'inventory__qty', text: formatNumber(this.game.itemCount(item.id)) }),
            h('span', { class: 'inventory__name', text: itemName(item.id) }),
          ),
        );
      }
      content.append(grid);
      const selected = items.find((item) => item.id === this.selected);
      if (selected) content.append(this.detail(selected));
    }
  }

  /** Vente d'un produit : quantité, prix du marchand, ou mise au marché. */
  private detail(item: ItemDef): HTMLElement {
    const have = this.game.itemCount(item.id);
    let qty = Math.min(have, 10);
    const price = sellPrice(item);
    const label = h('span', { class: 'inventory__sell-qty' });
    const sell = h('button', { class: 'btn btn--gold btn--small' });
    const update = () => {
      label.textContent = `${formatNumber(qty)} ${item.emoji}`;
      sell.replaceChildren(icon(Icons.coin), ` ${t('inventory.sell', { coins: formatNumber(qty * price) })}`);
      sell.disabled = qty <= 0;
    };
    const step = (delta: number) =>
      h('button', {
        class: 'btn btn--secondary btn--small inventory__step',
        text: delta > 0 ? `+${delta}` : String(delta),
        onClick: () => {
          qty = Math.max(1, Math.min(have, qty + delta));
          update();
        },
      });
    sell.addEventListener('click', () => {
      const result = this.game.sellItems(item.id, qty);
      if (result.ok) this.callbacks.toast(t('inventory.sold', { coins: formatNumber(result.coins) }), 'success');
    });
    update();
    const canMarket = this.game.state.level >= MARKET.minLevel && have >= MARKET.minQty;
    return h(
      'div',
      { class: 'inventory__detail' },
      h(
        'div',
        { class: 'inventory__detail-head' },
        h('strong', { text: `${item.emoji} ${itemName(item.id)}` }),
        h('span', { class: 'muted small', text: t('inventory.price', { coins: price }) }),
      ),
      h(
        'div',
        { class: 'inventory__stepper' },
        step(-10),
        step(-1),
        label,
        step(1),
        step(10),
        h('button', {
          class: 'btn btn--secondary btn--small inventory__step',
          text: t('inventory.all'),
          onClick: () => {
            qty = have;
            update();
          },
        }),
      ),
      h(
        'div',
        { class: 'inventory__actions' },
        sell,
        canMarket
          ? h('button', {
              class: 'btn btn--primary btn--small',
              text: t('inventory.toMarket'),
              onClick: () => this.callbacks.toMarket(item.id),
            })
          : null,
      ),
      h('p', { class: 'muted small', text: t('inventory.sellHint') }),
    );
  }
}
