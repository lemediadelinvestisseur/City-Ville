import type { Game } from '@/core/game';
import { ORDERS, WHEEL } from '@/data/balance';
import { WHEEL_PRIZES } from '@/data/wheel';
import { t } from '@/i18n';
import type { DailyPanel } from './DailyPanel';
import { rewardChips } from './DailyPanel';
import { clear, h, icon } from './dom';
import { formatDuration } from './format';
import { Icons } from './icons';
import { bagChips } from './items';
import { failMessage } from './messages';
import type { Modals } from './Modals';

export type TodayTab = 'daily' | 'orders' | 'wheel';

const PRIZE_EMOJI: Record<(typeof WHEEL_PRIZES)[number]['id'], string> = {
  coinsSmall: '🪙',
  energy: '⚡',
  items: '📦',
  xp: '⭐',
  coinsBig: '💰',
  cash: '💵',
  coinsJackpot: '🎰',
};
const WHEEL_COLORS = ['#ffd54f', '#81d4fa', '#a5d6a7', '#ce93d8', '#ffab91', '#80cbc4', '#f48fb1'];

/**
 * Fenêtre « Aujourd'hui » : tout ce qui change chaque jour, en trois onglets
 * (défis, commandes, roue de la chance) derrière un seul bouton.
 */
export class TodayPanel {
  private content: HTMLElement | null = null;
  private tab: TodayTab = 'daily';
  private spinning = false;

  constructor(
    private readonly game: Game,
    private readonly modals: Modals,
    private readonly daily: DailyPanel,
    private readonly toast: (text: string, kind: 'info' | 'success' | 'error') => void,
  ) {
    game.events.on('change', () => {
      if (this.content?.isConnected && !this.spinning) this.render();
    });
  }

  /** Pastille du bouton : défis à réclamer, commandes livrables, tours de roue. */
  badge(): number {
    return this.game.dailyInfo().claimable + this.game.ordersInfo().deliverable + this.game.wheelInfo().spinsLeft;
  }

  visible(): boolean {
    return this.game.dailyInfo().available || this.game.ordersInfo().available || this.game.wheelInfo().available;
  }

  open(tab?: TodayTab): void {
    this.tab = tab ?? this.firstUseful();
    this.content = h('div', { class: 'today' });
    this.render();
    this.modals.show({
      title: t('today.title'),
      kicker: t('today.kicker'),
      className: 'modal--daily modal--today',
      body: this.content,
      buttons: [{ label: t('common.close'), kind: 'secondary' }],
      onClose: () => {
        this.content = null;
      },
    });
  }

  /** Onglet où il y a quelque chose à faire. */
  private firstUseful(): TodayTab {
    if (this.game.dailyInfo().claimable > 0) return 'daily';
    if (this.game.ordersInfo().deliverable > 0) return 'orders';
    if (this.game.wheelInfo().spinsLeft > 0) return 'wheel';
    return this.game.dailyInfo().available ? 'daily' : 'orders';
  }

  private render(): void {
    const content = this.content;
    if (!content) return;
    clear(content);
    const counts: Record<TodayTab, number> = {
      daily: this.game.dailyInfo().claimable,
      orders: this.game.ordersInfo().deliverable,
      wheel: this.game.wheelInfo().spinsLeft,
    };
    const tabs = h('div', { class: 'tabs today__tabs', attrs: { role: 'tablist' } });
    for (const tab of ['daily', 'orders', 'wheel'] as const) {
      tabs.append(
        h(
          'button',
          {
            class: `tab${tab === this.tab ? ' is-active' : ''}`,
            attrs: { role: 'tab', 'aria-selected': String(tab === this.tab) },
            onClick: () => {
              this.tab = tab;
              this.render();
            },
          },
          t(`today.tab.${tab}`),
          counts[tab] > 0 ? h('span', { class: 'tab__badge', text: String(counts[tab]) }) : null,
        ),
      );
    }
    const body = h('div', { class: 'today__body' });
    content.append(tabs, body);
    if (this.tab === 'daily') this.daily.renderInto(body);
    else if (this.tab === 'orders') this.renderOrders(body);
    else this.renderWheel(body);
  }

  private renderOrders(body: HTMLElement): void {
    const info = this.game.ordersInfo();
    if (!info.available) {
      body.append(h('p', { class: 'muted', text: t('orders.locked', { level: ORDERS.minLevel }) }));
      return;
    }
    body.append(h('p', { class: 'daily__intro', text: t('orders.intro') }));
    const hasStation = this.game.state.entities.some((e) => e.built && e.station);
    info.list.forEach((order, index) => {
      const deliver = h('button', {
        class: `btn btn--small ${order.done ? 'btn--secondary' : 'btn--gold'}`,
        text: order.done ? t('orders.done') : t(order.train ? 'orders.sendTrain' : 'orders.deliver'),
        onClick: () => {
          const result = this.game.deliverOrder(index);
          if (result.ok) this.toast(t(order.train ? 'orders.trainLeft' : 'orders.delivered'), 'success');
          else this.toast(failMessage(result.reason, result.missing, result.item), 'error');
        },
      });
      deliver.disabled = order.done;
      const note =
        order.train && !order.done && !order.ready && this.game.missingItem(order.items) === null
          ? t(hasStation ? 'orders.trainBusy' : 'orders.needStation')
          : null;
      body.append(
        h(
          'div',
          { class: `daily__task order${order.done ? ' is-claimed' : ''}${order.ready ? ' is-done' : ''}` },
          h('span', { class: 'order__who', text: order.train ? '🚂' : '🚚' }),
          h(
            'div',
            { class: 'daily__info' },
            h('span', { class: 'daily__label', text: t(order.train ? 'orders.train' : 'orders.truck') }),
            bagChips(order.items, order.done ? undefined : this.game),
            rewardChips(order.reward),
            note ? h('span', { class: 'muted small', text: note }) : null,
          ),
          deliver,
        ),
      );
    });
    const regular = info.list.filter((o) => !o.train);
    const allDone = regular.every((o) => o.done);
    const bonus = h('button', {
      class: `btn ${info.bonusClaimed ? 'btn--secondary' : 'btn--gold'}`,
      text: info.bonusClaimed ? t('daily.claimed') : t('daily.claim'),
      onClick: () => {
        this.game.claimOrdersBonus();
      },
    });
    bonus.disabled = info.bonusClaimed || !allDone;
    body.append(
      h(
        'div',
        { class: `daily__bonus${allDone && !info.bonusClaimed ? ' is-ready' : ''}` },
        h('span', { class: 'daily__chest', html: Icons.trophy }),
        h(
          'div',
          { class: 'daily__info' },
          h('span', { class: 'daily__label', text: t('orders.bonus') }),
          rewardChips(info.bonus),
        ),
        bonus,
      ),
      h(
        'p',
        { class: 'muted small daily__reset' },
        icon(Icons.clock),
        ` ${t('orders.resets', { duration: formatDuration((info.resetsAt - this.game.now()) / 1000) })}`,
      ),
    );
  }

  private renderWheel(body: HTMLElement): void {
    const info = this.game.wheelInfo();
    if (!info.available) {
      body.append(h('p', { class: 'muted', text: t('wheel.locked', { level: WHEEL.minLevel }) }));
      return;
    }
    const n = WHEEL_PRIZES.length;
    const slice = 360 / n;
    const gradient = WHEEL_PRIZES.map(
      (_, i) => `${WHEEL_COLORS[i % WHEEL_COLORS.length]} ${i * slice}deg ${(i + 1) * slice}deg`,
    ).join(', ');
    const disc = h('div', { class: 'wheel__disc', style: `background: conic-gradient(${gradient})` });
    WHEEL_PRIZES.forEach((prize, i) => {
      const angle = (i + 0.5) * slice;
      disc.append(
        h('span', {
          class: 'wheel__label',
          text: PRIZE_EMOJI[prize.id],
          style: `transform: rotate(${angle}deg) translateY(-38%) rotate(${-angle}deg)`,
        }),
      );
    });
    const result = h('div', { class: 'wheel__result' });
    const spin = h('button', {
      class: 'btn btn--gold',
      text: info.spinsLeft > 0 ? t('wheel.spin', { n: info.spinsLeft }) : t('wheel.none'),
      onClick: () => {
        if (this.spinning) return;
        const outcome = this.game.spinWheel(Math.random());
        if (!outcome.ok) return;
        this.spinning = true;
        spin.disabled = true;
        const target = 360 * 5 + (360 - (outcome.index + 0.5) * slice);
        const done = () => {
          this.spinning = false;
          clear(result);
          result.append(h('strong', { text: t('wheel.won') }), rewardChips(outcome.reward));
          spin.disabled = this.game.wheelInfo().spinsLeft <= 0;
          spin.textContent =
            this.game.wheelInfo().spinsLeft > 0
              ? t('wheel.spin', { n: this.game.wheelInfo().spinsLeft })
              : t('wheel.none');
        };
        const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
        if (reduced || typeof disc.animate !== 'function') {
          disc.style.transform = `rotate(${target}deg)`;
          done();
          return;
        }
        const animation = disc.animate([{ transform: 'rotate(0deg)' }, { transform: `rotate(${target}deg)` }], {
          duration: 3200,
          easing: 'cubic-bezier(0.15, 0.85, 0.25, 1)',
          fill: 'forwards',
        });
        animation.onfinish = done;
      },
    });
    spin.disabled = info.spinsLeft <= 0;
    body.append(
      h('p', { class: 'daily__intro', text: t('wheel.intro') }),
      h('div', { class: 'wheel' }, h('div', { class: 'wheel__pointer', text: '▼' }), disc),
      result,
      spin,
    );
  }
}
