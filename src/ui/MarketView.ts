import type { Game } from '@/core/game';
import { MARKET, checkListing, sellerIncome } from '@/data/market';
import { backendErrorMessage, type Backend } from '@/services/online/Backend';
import { h, icon } from './dom';
import { formatDuration, formatNumber } from './format';
import { Icons } from './icons';
import { failMessage } from './messages';

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
      this.toast(
        `${sold} lot${sold > 1 ? 's' : ''} vendu${sold > 1 ? 's' : ''} : +${formatNumber(coins)} pièces !`,
        'success',
      );
    }
    if (goods > 0) {
      this.game.marketReturn(goods);
      this.toast(`Lots invendus récupérés : +${formatNumber(goods)} marchandises.`, 'info');
    }
  }

  async render(): Promise<HTMLElement> {
    const wrap = h('div', { class: 'people market' });
    if (this.game.state.level < MARKET.minLevel) {
      wrap.append(
        h('p', {
          class: 'neighbors__empty',
          text: `Le marché ouvre au niveau ${MARKET.minLevel}. Vous pourrez y vendre vos récoltes et votre pêche aux autres joueurs !`,
        }),
      );
      return wrap;
    }
    await this.settle();
    const { offers, mine } = await this.backend.marketOverview();
    wrap.append(this.sellForm(mine.filter((l) => l.status === 'open').length));

    const open = mine.filter((l) => l.status === 'open');
    if (open.length > 0) {
      wrap.append(h('div', { class: 'market__title', text: 'Mes lots en vente' }));
      for (const listing of open) {
        const button = h('button', {
          class: 'btn btn--secondary btn--small',
          text: 'Retirer',
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
              h('span', { class: 'person__name', text: `${formatNumber(listing.qty)} marchandises` }),
              h('span', {
                class: 'person__city',
                text: `${listing.unitPrice} pièce${listing.unitPrice > 1 ? 's' : ''} l’unité · reste ${formatDuration((listing.expiresAt - Date.now()) / 1000)}`,
              }),
            ),
            h('div', { class: 'person__actions' }, button),
          ),
        );
      }
    }

    wrap.append(h('div', { class: 'market__title', text: 'Offres des autres joueurs' }));
    if (offers.length === 0) wrap.append(h('p', { class: 'neighbors__empty', text: 'Aucune offre pour le moment.' }));
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
                if (result.ok) this.toast(`+${formatNumber(qty)} marchandises achetées à ${offer.seller} !`, 'success');
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
            h('span', { class: 'person__name', text: `${formatNumber(offer.qty)} marchandises` }),
            h('span', {
              class: 'person__city',
              text: `${offer.seller} · ${offer.unitPrice} pièce${offer.unitPrice > 1 ? 's' : ''} l’unité`,
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
      summary.textContent =
        problem ??
        `Vous recevrez ${formatNumber(sellerIncome(q, p))} pièces après la taxe du marché (${MARKET.taxPercent} %).`;
      summary.classList.toggle('is-bad', problem !== null || q > this.game.state.goods);
      if (!problem && q > this.game.state.goods) summary.textContent = 'Vous n’avez pas assez de marchandises.';
    };
    qty.addEventListener('input', update);
    price.addEventListener('input', update);
    update();
    const full = openCount >= MARKET.maxListings;
    const submit = h('button', {
      class: 'btn btn--primary',
      text: full ? `${MARKET.maxListings} lots maximum en vente` : 'Mettre en vente',
      onClick: () => {
        const q = Number(qty.value);
        const p = Number(price.value);
        const problem = checkListing(q, p);
        if (problem) {
          this.toast(problem, 'error');
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
            this.toast('Lot mis en vente !', 'success');
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
        'Vendre mes marchandises ',
        h('span', { class: 'market__have' }, icon(Icons.goods), ` ${formatNumber(goods)}`),
      ),
      h(
        'div',
        { class: 'market__fields' },
        h('label', { class: 'field' }, h('span', { class: 'field__label', text: 'Quantité' }), qty),
        h('label', { class: 'field' }, h('span', { class: 'field__label', text: 'Prix à l’unité' }), price),
      ),
      summary,
      submit,
    );
  }
}
