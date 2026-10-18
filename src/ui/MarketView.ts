import type { Game } from '@/core/game';
import { MARKET, checkListing, sellerIncome } from '@/data/market';
import { t, tn } from '@/i18n';
import type { Backend } from '@/services/online/Backend';
import { h, icon } from './dom';
import { formatDuration, formatNumber } from './format';
import { Icons } from './icons';
import { backendErrorMessage, failMessage, listingProblemMessage } from './messages';

/** Onglet « Marché » : vendre ses marchandises et acheter celles des autres joueurs. */
export class MarketView {
  constructor(
    private readonly game: Game,
    private readonly backend: Backend,
    private readonly toast: (text: string, kind: 'info' | 'success' | 'error') => void,
    private readonly rerender: () => void,
  ) {}

  /** Encaisse les ventes et récupère les invendus (à chaque ouverture). */
  private async settle(): Promise<void> {
    const { coins, goods, sold } = await this.backend.marketSettle();
    if (coins > 0) {
      this.game.marketIncome(coins);
      this.toast(tn('market.sold', sold, { coins }), 'success');
    }
    if (goods > 0) {
      this.game.marketReturn(goods);
      this.toast(t('market.returned', { n: goods }), 'info');
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
              .then(({ goods }) => {
                this.game.marketReturn(goods);
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
            h('span', { class: 'market__crate', html: Icons.goods }),
            h(
              'div',
              { class: 'person__info' },
              h('span', { class: 'person__name', text: t('market.goods', { n: listing.qty }) }),
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
              .then(({ qty, total: paid }) => {
                const result = this.game.marketBuy(qty, paid);
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
          h('span', { class: 'market__crate', html: Icons.goods }),
          h(
            'div',
            { class: 'person__info' },
            h('span', { class: 'person__name', text: t('market.goods', { n: offer.qty }) }),
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
    const goods = this.game.state.goods;
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
    qty.value = String(Math.max(MARKET.minQty, Math.min(MARKET.maxQty, Math.floor(goods / 20) * 10 || MARKET.minQty)));
    const price = h('input', {
      class: 'field__input market__input',
      attrs: {
        type: 'number',
        inputmode: 'numeric',
        min: String(MARKET.minUnitPrice),
        max: String(MARKET.maxUnitPrice),
        step: '1',
      },
    });
    price.value = '4';
    const summary = h('p', { class: 'market__summary' });
    const update = () => {
      const q = Number(qty.value);
      const p = Number(price.value);
      const problem = checkListing(q, p);
      summary.textContent = problem
        ? listingProblemMessage(problem)
        : t('market.youGet', { coins: sellerIncome(q, p), tax: MARKET.taxPercent });
      summary.classList.toggle('is-bad', problem !== null || q > this.game.state.goods);
      if (!problem && q > this.game.state.goods) summary.textContent = t('market.notEnough');
    };
    qty.addEventListener('input', update);
    price.addEventListener('input', update);
    update();
    const full = openCount >= MARKET.maxListings;
    const submit = h('button', {
      class: 'btn btn--primary',
      text: full ? t('market.maxListings', { n: MARKET.maxListings }) : t('market.sell'),
      onClick: () => {
        const q = Number(qty.value);
        const p = Number(price.value);
        const problem = checkListing(q, p);
        if (problem) {
          this.toast(listingProblemMessage(problem), 'error');
          return;
        }
        const reserve = this.game.marketReserve(q);
        if (!reserve.ok) {
          this.toast(failMessage(reserve.reason, reserve.missing), 'error');
          return;
        }
        submit.setAttribute('disabled', '');
        this.backend
          .marketCreate(q, p)
          .then(() => {
            this.game.marketListed();
            this.toast(t('market.listed'), 'success');
            this.rerender();
          })
          .catch((e: unknown) => {
            this.game.marketReturn(q);
            submit.removeAttribute('disabled');
            this.toast(backendErrorMessage(e), 'error');
          });
      },
    });
    if (full) submit.setAttribute('disabled', '');
    return h(
      'div',
      { class: 'market__sell' },
      h(
        'div',
        { class: 'market__title' },
        `${t('market.sellTitle')} `,
        h('span', { class: 'market__have' }, icon(Icons.goods), ` ${formatNumber(goods)}`),
      ),
      h(
        'div',
        { class: 'market__fields' },
        h('label', { class: 'field' }, h('span', { class: 'field__label', text: t('market.qty') }), qty),
        h('label', { class: 'field' }, h('span', { class: 'field__label', text: t('market.unitPrice') }), price),
      ),
      summary,
      submit,
    );
  }
}
