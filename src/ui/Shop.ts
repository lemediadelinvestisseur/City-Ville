import type { Game } from '@/core/game';
import { CASH_OFFERS, STORE_PRODUCTS, type StoreProduct } from '@/data/products';
import { t } from '@/i18n';
import { offerDescription, offerTitle, productBadge, productDescription, productTitle } from '@/i18n/content';
import type { PaymentProvider } from '@/services/payments/PaymentProvider';
import { clear, h, icon, rich } from './dom';
import { formatNumber } from './format';
import { Icons } from './icons';
import { failMessage } from './messages';

export type ShopTab = 'cash' | 'coins';

/** Boutique : packs de cash (argent réel, via le fournisseur de paiement) et échanges en cash. */
export class Shop {
  readonly el = h('section', { class: 'shop', attrs: { role: 'dialog', 'aria-label': t('shop.title') } });
  private body = h('div', { class: 'shop__body' });
  private tabs = h('div', { class: 'tabs tabs--center' });
  private tab: ShopTab = 'cash';
  private busy = false;
  isOpen = false;

  constructor(
    private readonly game: Game,
    private readonly payments: PaymentProvider,
    private readonly notify: (text: string, kind: 'info' | 'error' | 'success') => void,
    private readonly onOpenChange: (open: boolean) => void,
  ) {
    const panel = h(
      'div',
      { class: 'shop__panel' },
      h(
        'div',
        { class: 'shop__header' },
        h('h2', { class: 'shop__title', text: t('shop.title') }),
        h(
          'button',
          { class: 'sheet__close', attrs: { 'aria-label': t('common.close') }, onClick: () => this.close() },
          icon(Icons.close),
        ),
      ),
      this.tabs,
      this.body,
    );
    this.el.append(panel);
    this.el.addEventListener('click', (event) => {
      if (event.target === this.el) this.close();
    });
  }

  open(tab: ShopTab = 'cash'): void {
    this.tab = tab;
    this.isOpen = true;
    this.render();
    this.el.classList.add('is-open');
    this.onOpenChange(true);
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.classList.remove('is-open');
    this.onOpenChange(false);
  }

  refresh(): void {
    if (this.isOpen) this.render();
  }

  private render(): void {
    clear(this.tabs);
    for (const [id, label] of [
      ['cash', t('shop.tabCash')],
      ['coins', t('shop.tabCoins')],
    ] as const) {
      this.tabs.append(
        h('button', {
          class: `tab${this.tab === id ? ' is-active' : ''}`,
          text: label,
          onClick: () => {
            this.tab = id;
            this.render();
          },
        }),
      );
    }
    clear(this.body);
    if (this.tab === 'cash') this.renderCash();
    else this.renderOffers();
  }

  private renderCash(): void {
    if (this.payments.isTestMode) {
      this.body.append(
        h('div', { class: 'notice' }, rich('shop.testNotice', { mode: h('strong', { text: t('shop.testMode') }) })),
      );
    }
    const grid = h('div', { class: 'offers' });
    for (const product of STORE_PRODUCTS) {
      const owned = product.oneTime && this.game.state.oneTimePurchases.includes(product.id);
      const button = h(
        'button',
        { class: `offer${product.oneTime ? ' offer--featured' : ''}`, onClick: () => void this.buy(product) },
        product.badge ? h('span', { class: 'offer__badge', text: productBadge(product) }) : null,
        h('span', { class: 'offer__icon' }, icon(product.reward.coins ? Icons.trophy : Icons.cash)),
        h('span', { class: 'offer__title', text: productTitle(product) }),
        h('span', { class: 'offer__desc', text: productDescription(product) }),
        h('span', { class: 'offer__price', text: owned ? t('shop.owned') : this.payments.priceLabel(product) }),
      );
      if (owned) button.disabled = true;
      grid.append(button);
    }
    this.body.append(grid);
  }

  private renderOffers(): void {
    const grid = h('div', { class: 'offers' });
    const energyFull = this.game.state.energy >= this.game.derived().energyMax;
    for (const offer of CASH_OFFERS) {
      const affordable = this.game.state.cash >= offer.cash;
      const isEnergy = offer.reward === 'energyRefill' || (typeof offer.reward === 'object' && offer.reward.energy);
      const useless = offer.reward === 'energyRefill' && energyFull;
      const button = h(
        'button',
        {
          class: 'offer',
          onClick: () => {
            const result = this.game.buyCashOffer(offer.id);
            if (result.ok) {
              this.notify(t('shop.done', { title: offerTitle(offer) }), 'success');
            } else {
              this.notify(failMessage(result.reason, result.missing), 'error');
              if (result.reason === 'notEnoughCash') this.tab = 'cash';
            }
            this.render();
          },
        },
        h('span', { class: 'offer__icon' }, icon(isEnergy ? Icons.energy : Icons.coin)),
        h('span', { class: 'offer__title', text: offerTitle(offer) }),
        h('span', { class: 'offer__desc', text: useless ? t('shop.energyFull') : offerDescription(offer) }),
        h(
          'span',
          { class: `offer__price offer__price--cash${affordable ? '' : ' is-short'}` },
          icon(Icons.cash),
          ` ${formatNumber(offer.cash)}`,
        ),
      );
      if (useless) button.disabled = true;
      grid.append(button);
    }
    this.body.append(grid);
  }

  private async buy(product: StoreProduct): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.el.classList.add('is-busy');
    try {
      const result = await this.payments.purchase(product);
      if (result.status === 'success') {
        const granted = this.game.grantStoreProduct(result.productId);
        if (granted.ok) this.notify(t('shop.thanks', { title: productTitle(product) }), 'success');
        else this.notify(t('shop.alreadyCredited'), 'error');
      } else if (result.status === 'error') {
        this.notify(t('shop.payError', { message: result.message }), 'error');
      }
    } finally {
      this.busy = false;
      this.el.classList.remove('is-busy');
      this.render();
    }
  }
}
