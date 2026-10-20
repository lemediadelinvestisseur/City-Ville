import type { Game } from '@/core/game';
import { ITEMS } from '@/data/items';
import { MARKET, checkListing, maxUnitPrice, sellerIncome } from '@/data/market';
import { t, tn } from '@/i18n';
import type { Backend } from '@/services/online/Backend';
import { h, icon } from './dom';
import { formatDuration, formatNumber } from './format';
import { Icons } from './icons';
import { itemEmoji } from './items';
import { itemName } from '@/i18n/content';
import { backendErrorMessage, failMessage, listingProblemMessage } from './messages';

/** « 30 × 🥛 Lait » */
const lotLabel = (item: string, qty: number) =>
  t('market.lot', { n: qty, item: `${itemEmoji(item)} ${itemName(item)}` });

/** Onglet « Marché » : vendre ses produits et acheter ceux des autres joueurs. */
export class MarketView {
  /** Produit à proposer en premier (choisi depuis l'inventaire). */
  preselect: string | null = null;

  constructor(
    private readonly game: Game,
    private readonly backend: Backend,
    private readonly toast: (text: string, kind: 'info' | 'success' | 'error') => void,
    private readonly rerender: () => void,
  ) {}

  /** Encaisse les ventes et récupère les invendus (à chaque ouverture). */
  private async settle(): Promise<void> {
    const { coins, items, sold } = await this.backend.marketSettle();
    if (coins > 0) {
      this.game.marketIncome(coins);
      this.toast(tn('market.sold', sold, { coins }), 'success');
    }
    const back = Object.values(items).reduce((sum, n) => sum + n, 0);
    if (back > 0) {
      this.game.marketReturn(items);
      this.toast(t('market.returned', { n: back }), 'info');
    }
  }

  async render(): Promise<HTMLElement> {
    const wrap = h('div', { class: 'people market' });
    if (this.game.state.level < MARKET.minLevel) {
      wrap.append(
        h('p', {
          class: 'neighbors__empty',
          text: t('market.opensAt', { level: MARKET.minLevel }),
        }),
      );
      return wrap;
    }
    await this.settle();
    const { offers, mine } = await this.backend.marketOverview();
    wrap.append(this.sellForm(mine.filter((l) => l.status === 'open').length));

    const open = mine.filter((l) => l.status === 'open');
    if (open.length > 0) {
      wrap.append(h('div', { class: 'market__title', text: t('market.mine') }));
      for (const listing of open) {
        const button = h('button', {
          class: 'btn btn--secondary btn--small',
          text: t('market.withdraw'),
          onClick: () => {
            button.setAttribute('disabled', '');
            this.backend
              .marketCancel(listing.id)
              .then(({ item, qty }) => {
                this.game.marketReturn({ [item]: qty });
                this.rerender();
              })
              .catch((e: unknown) => {
                button.removeAttribute('disabled');
                this.toast(backendErrorMessage(e), 'error');
              });
          },
        });
        wrap.append(
          h(
            'div',
            { class: 'person market__row' },
            h('span', { class: 'market__crate', text: itemEmoji(listing.item) }),
            h(
              'div',
              { class: 'person__info' },
              h('span', { class: 'person__name', text: lotLabel(listing.item, listing.qty) }),
              h('span', {
                class: 'person__city',
                text: tn('market.priceLeft', listing.unitPrice, {
                  duration: formatDuration((listing.expiresAt - Date.now()) / 1000),
                }),
              }),
            ),
            h('div', { class: 'person__actions' }, button),
          ),
        );
      }
    }

    wrap.append(h('div', { class: 'market__title', text: t('market.offers') }));
    if (offers.length === 0) wrap.append(h('p', { class: 'neighbors__empty', text: t('market.noOffers') }));
    for (const offer of offers) {
      const total = offer.qty * offer.unitPrice;
      const check = this.game.checkMarketPurchase(offer.qty, total);
      const button = h(
        'button',
        {
          class: `btn btn--gold btn--small${check.ok ? '' : ' is-short'}`,
          onClick: () => {
            const now = this.game.checkMarketPurchase(offer.qty, total);
            if (!now.ok) {
              this.toast(failMessage(now.reason, now.missing), 'error');
              return;
            }
            button.setAttribute('disabled', '');
            this.backend
              .marketBuy(offer.id)
              .then(({ item, qty, total: paid }) => {
                const result = this.game.marketBuy(item, qty, paid);
                if (result.ok) this.toast(t('market.bought', { n: qty, seller: offer.seller }), 'success');
                this.rerender();
              })
              .catch((e: unknown) => {
                button.removeAttribute('disabled');
                this.toast(backendErrorMessage(e), 'error');
              });
          },
        },
        icon(Icons.coin),
        ` ${formatNumber(total)}`,
      );
      wrap.append(
        h(
          'div',
          { class: 'person market__row' },
          h('span', { class: 'market__crate', text: itemEmoji(offer.item) }),
          h(
            'div',
            { class: 'person__info' },
            h('span', { class: 'person__name', text: lotLabel(offer.item, offer.qty) }),
            h('span', {
              class: 'person__city',
              text: tn('market.offerFrom', offer.unitPrice, { seller: offer.seller }),
            }),
          ),
          h('div', { class: 'person__actions' }, button),
        ),
      );
    }
    return wrap;
  }

  private sellForm(openCount: number): HTMLElement {
    // Produits en assez grande quantité pour un lot.
    const owned = ITEMS.filter((item) => this.game.itemCount(item.id) >= MARKET.minQty);
    const select = h('select', { class: 'field__input market__input' });
    for (const item of owned) {
      const option = h('option', {
        text: `${item.emoji} ${itemName(item.id)} (${formatNumber(this.game.itemCount(item.id))})`,
        attrs: { value: item.id },
      });
      select.append(option);
    }
    if (this.preselect && owned.some((item) => item.id === this.preselect)) select.value = this.preselect;
    this.preselect = null;
    const qty = h('input', {
      class: 'field__input market__input',
      attrs: {
        type: 'number',
        inputmode: 'numeric',
        min: String(MARKET.minQty),
        max: String(MARKET.maxQty),
        step: '10',
      },
    });
    const price = h('input', {
      class: 'field__input market__input',
      attrs: { type: 'number', inputmode: 'numeric', min: String(MARKET.minUnitPrice), step: '1' },
    });
    const pick = () => {
      const have = this.game.itemCount(select.value);
      qty.value = String(Math.max(MARKET.minQty, Math.min(MARKET.maxQty, Math.floor(have / 20) * 10 || MARKET.minQty)));
      price.max = String(maxUnitPrice(select.value));
      price.value = String(Math.max(1, Math.round(maxUnitPrice(select.value) / 3)));
    };
    const summary = h('p', { class: 'market__summary' });
    const update = () => {
      const q = Number(qty.value);
      const p = Number(price.value);
      const problem = checkListing(select.value, q, p);
      summary.textContent =
        problem === 'qty' || problem === 'price'
          ? listingProblemMessage(problem, select.value)
          : t('market.youGet', { coins: sellerIncome(q, p), tax: MARKET.taxPercent });
      const short = q > this.game.itemCount(select.value);
      summary.classList.toggle('is-bad', problem !== null || short);
      if (!problem && short) summary.textContent = t('market.notEnough');
    };
    select.addEventListener('change', () => {
      pick();
      update();
    });
    qty.addEventListener('input', update);
    price.addEventListener('input', update);
    if (owned.length > 0) {
      pick();
      update();
    }
    const full = openCount >= MARKET.maxListings;
    const submit = h('button', {
      class: 'btn btn--primary',
      text: full ? t('market.maxListings', { n: MARKET.maxListings }) : t('market.sell'),
      onClick: () => {
        const item = select.value;
        const q = Number(qty.value);
        const p = Number(price.value);
        const problem = checkListing(item, q, p);
        if (problem === 'qty' || problem === 'price') {
          this.toast(listingProblemMessage(problem, item), 'error');
          return;
        }
        const reserve = this.game.marketReserve(item, q);
        if (!reserve.ok) {
          this.toast(failMessage(reserve.reason, reserve.missing, reserve.item), 'error');
          return;
        }
        submit.setAttribute('disabled', '');
        this.backend
          .marketCreate(item, q, p)
          .then(() => {
            this.game.marketListed();
            this.toast(t('market.listed'), 'success');
            this.rerender();
          })
          .catch((e: unknown) => {
            this.game.marketReturn({ [item]: q });
            submit.removeAttribute('disabled');
            this.toast(backendErrorMessage(e), 'error');
          });
      },
    });
    if (full || owned.length === 0) submit.setAttribute('disabled', '');
    return h(
      'div',
      { class: 'market__sell' },
      h('div', { class: 'market__title' }, t('market.sellTitle')),
      owned.length === 0
        ? h('p', { class: 'muted small', text: t('market.nothingToSell', { n: MARKET.minQty }) })
        : h(
            'div',
            { class: 'market__fields' },
            h(
              'label',
              { class: 'field field--wide' },
              h('span', { class: 'field__label', text: t('market.item') }),
              select,
            ),
            h('label', { class: 'field' }, h('span', { class: 'field__label', text: t('market.qty') }), qty),
            h('label', { class: 'field' }, h('span', { class: 'field__label', text: t('market.unitPrice') }), price),
          ),
      owned.length === 0 ? null : summary,
      submit,
    );
  }
}
