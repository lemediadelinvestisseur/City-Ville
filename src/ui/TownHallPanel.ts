import type { Game } from '@/core/game';
import { HAPPINESS_TIERS, MEAL } from '@/data/balance';
import { t } from '@/i18n';
import { clear, h, icon } from './dom';
import { formatDuration, formatNumber } from './format';
import { Icons } from './icons';
import { bagChips } from './items';
import { failMessage } from './messages';
import type { Modals } from './Modals';

const MOOD_EMOJI = { delighted: '😄', happy: '🙂', content: '😐', unhappy: '🙁', miserable: '😫' } as const;

/**
 * Mairie : le bonheur de la ville (et ce qui le compose), le repas à servir et
 * le coffre qui se remplit avec le temps. Un seul endroit pour la vie de la ville.
 */
export class TownHallPanel {
  private content: HTMLElement | null = null;

  constructor(
    private readonly game: Game,
    private readonly modals: Modals,
    private readonly toast: (text: string, kind: 'info' | 'success' | 'error') => void,
  ) {
    game.events.on('change', () => this.refresh());
  }

  open(): void {
    this.content = h('div', { class: 'townhall' });
    this.render();
    this.modals.show({
      title: t('townhall.title'),
      kicker: t('townhall.kicker'),
      className: 'modal--townhall',
      body: this.content,
      buttons: [{ label: t('common.close'), kind: 'secondary' }],
      onClose: () => {
        this.content = null;
      },
    });
  }

  refresh(): void {
    if (this.content?.isConnected) this.render();
  }

  /** Quelque chose à faire à la mairie (repas à servir, coffre plein) : pastille. */
  needsAttention(): boolean {
    const plan = this.game.mealPlan();
    return plan.canServe || this.game.chestInfo().full;
  }

  private render(): void {
    const content = this.content;
    if (!content) return;
    clear(content);
    content.append(this.happinessBlock(), this.mealBlock(), this.chestBlock());
  }

  private happinessBlock(): HTMLElement {
    const happiness = this.game.happiness();
    const tier = HAPPINESS_TIERS.find((x) => x.id === happiness.tier)!;
    const effects: string[] = [];
    if (tier.rent !== 0) effects.push(t('townhall.effectRent', { n: `${tier.rent > 0 ? '+' : ''}${tier.rent * 100}` }));
    if (tier.popCap > 0) effects.push(t('townhall.effectPop', { n: `+${tier.popCap * 100}` }));
    const part = (label: string, value: number, max: number, hint: string) =>
      h(
        'div',
        { class: 'townhall__part' },
        h('div', { class: 'townhall__part-head' }, h('span', { text: label }), h('span', { text: `${value}/${max}` })),
        h('div', { class: 'progress' }, h('div', { class: 'progress__fill', style: `width:${(value / max) * 100}%` })),
        h('span', { class: 'muted small', text: hint }),
      );
    return h(
      'section',
      { class: 'townhall__block' },
      h(
        'div',
        { class: 'townhall__mood' },
        h('span', { class: 'townhall__face', text: MOOD_EMOJI[happiness.tier] }),
        h(
          'div',
          {},
          h('strong', { text: t(`townhall.tier.${happiness.tier}`) }),
          h('div', { class: 'townhall__score', text: t('townhall.score', { n: happiness.score }) }),
          h('div', { class: 'muted small', text: effects.length > 0 ? effects.join(' · ') : t('townhall.effectNone') }),
        ),
      ),
      part(t('townhall.food'), happiness.food, 50, t('townhall.foodHint')),
      part(t('townhall.services'), happiness.services, 25, t('townhall.servicesHint')),
      part(t('townhall.living'), happiness.living, 25, t('townhall.livingHint')),
    );
  }

  private mealBlock(): HTMLElement {
    const plan = this.game.mealPlan();
    const now = this.game.now();
    const fed = now < plan.fedUntil;
    const status = fed
      ? t('townhall.fedFor', { duration: formatDuration((plan.fedUntil - now) / 1000) })
      : t('townhall.hungry');
    const enough = plan.available >= plan.need;
    const serve = h('button', {
      class: 'btn btn--gold',
      text: t('townhall.serve'),
      onClick: () => {
        const result = this.game.feedCity();
        if (result.ok) this.toast(t('townhall.served', { n: result.variety }), 'success');
        else this.toast(failMessage(result.reason, result.missing), 'error');
      },
    });
    serve.disabled = !plan.canServe || !enough;
    return h(
      'section',
      { class: 'townhall__block' },
      h('div', { class: 'modal__section-title' }, '🍽️ ', t('townhall.meal')),
      h('p', { class: `townhall__status${fed ? '' : ' is-warn'}`, text: status }),
      h('p', { class: 'muted small' }, t('townhall.need', { n: plan.need, hours: MEAL.durationMs / 3600_000 })),
      enough
        ? h(
            'div',
            { class: 'townhall__basket' },
            bagChips(plan.basket),
            h('span', { class: 'muted small', text: t('townhall.variety', { n: plan.variety }) }),
          )
        : h('p', {
            class: 'townhall__status is-warn',
            text: t('townhall.notEnough', { n: Math.ceil(plan.need - plan.available) }),
          }),
      plan.canServe ? serve : h('p', { class: 'muted small', text: t('townhall.later') }),
    );
  }

  private chestBlock(): HTMLElement {
    const chest = this.game.chestInfo();
    if (!chest.available) return h('span');
    const collect = h(
      'button',
      {
        class: 'btn btn--gold',
        onClick: () => {
          const result = this.game.collectChest();
          if (result.ok) this.toast(t('townhall.collected', { coins: formatNumber(result.coins) }), 'success');
        },
      },
      icon(Icons.coin),
      ` ${t('townhall.collect', { coins: formatNumber(chest.coins) })}`,
    );
    collect.disabled = chest.coins <= 0;
    return h(
      'section',
      { class: 'townhall__block' },
      h('div', { class: 'modal__section-title' }, '💰 ', t('townhall.chest')),
      h('p', {
        class: 'muted small',
        text: chest.full
          ? t('townhall.chestFull')
          : t('townhall.chestFilling', { duration: formatDuration((chest.fullAt - this.game.now()) / 1000) }),
      }),
      collect,
    );
  }
}
