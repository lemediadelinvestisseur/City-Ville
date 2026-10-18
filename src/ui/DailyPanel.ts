import type { Game } from '@/core/game';
import type { Reward } from '@/core/types';
import { DAILY_MIN_LEVEL, type DailyTaskType } from '@/data/daily';
import { t, tn } from '@/i18n';
import { clear, h, icon } from './dom';
import { formatDuration, formatNumber } from './format';
import { Icons } from './icons';
import type { Modals } from './Modals';

/** Libellé d'un défi du jour (« Récolter 6 champs »). */
export function dailyTaskLabel(type: string, target: number): string {
  return tn(`daily.task.${type as DailyTaskType}`, target);
}

/** Petites pastilles de récompense (pièces, cash, XP…). */
export function rewardChips(reward: Reward): HTMLElement {
  const chip = (svg: string, text: string) => h('span', { class: 'chip' }, icon(svg), text);
  return h(
    'div',
    { class: 'chips' },
    reward.coins ? chip(Icons.coin, `+${formatNumber(reward.coins)}`) : null,
    reward.cash ? chip(Icons.cash, `+${formatNumber(reward.cash)}`) : null,
    reward.xp ? chip(Icons.xp, `+${formatNumber(reward.xp)} XP`) : null,
    reward.goods ? chip(Icons.goods, `+${formatNumber(reward.goods)}`) : null,
    reward.energy ? chip(Icons.energy, `+${formatNumber(reward.energy)}`) : null,
  );
}

/** Fenêtre « Défis du jour » : trois défis, leur progression, les récompenses à réclamer. */
export class DailyPanel {
  private content: HTMLElement | null = null;

  constructor(
    private readonly game: Game,
    private readonly modals: Modals,
  ) {
    game.events.on('change', () => this.refresh());
  }

  open(): void {
    this.content = h('div', { class: 'daily' });
    this.render();
    this.modals.show({
      title: t('daily.title'),
      kicker: t('daily.kicker'),
      className: 'modal--daily',
      body: this.content,
      buttons: [{ label: t('common.close'), kind: 'secondary' }],
      onClose: () => {
        this.content = null;
      },
    });
  }

  /** Met à jour la fenêtre ouverte (progression, minuteur). */
  refresh(): void {
    if (this.content?.isConnected) this.render();
  }

  private render(): void {
    const content = this.content;
    if (!content) return;
    clear(content);
    const info = this.game.dailyInfo();
    if (!info.available) {
      content.append(h('p', { class: 'muted', text: t('daily.locked', { level: DAILY_MIN_LEVEL }) }));
      return;
    }
    content.append(h('p', { class: 'daily__intro', text: t('daily.intro') }));
    info.tasks.forEach((task, index) => {
      const ratio = Math.min(1, task.count / task.target);
      const claim = h('button', {
        class: `btn btn--small ${task.claimed ? 'btn--secondary' : 'btn--gold'}`,
        text: task.claimed ? t('daily.claimed') : t('daily.claim'),
        onClick: () => {
          if (this.game.claimDaily(index).ok) this.render();
        },
      });
      claim.disabled = task.claimed || !task.done;
      content.append(
        h(
          'div',
          { class: `daily__task${task.done ? ' is-done' : ''}${task.claimed ? ' is-claimed' : ''}` },
          h(
            'div',
            { class: 'daily__info' },
            h('span', { class: 'daily__label', text: dailyTaskLabel(task.type, task.target) }),
            h(
              'div',
              { class: 'daily__progress' },
              h('div', { class: 'progress' }, h('div', { class: 'progress__fill', style: `width:${ratio * 100}%` })),
              h('span', { class: 'daily__count', text: `${formatNumber(task.count)}/${formatNumber(task.target)}` }),
            ),
            rewardChips(task.reward),
          ),
          claim,
        ),
      );
    });
    const allClaimed = info.tasks.every((task) => task.claimed);
    const bonus = h('button', {
      class: `btn ${info.bonusClaimed ? 'btn--secondary' : 'btn--gold'}`,
      text: info.bonusClaimed ? t('daily.claimed') : t('daily.claim'),
      onClick: () => {
        if (this.game.claimDailyBonus().ok) this.render();
      },
    });
    bonus.disabled = info.bonusClaimed || !allClaimed;
    content.append(
      h(
        'div',
        { class: `daily__bonus${allClaimed && !info.bonusClaimed ? ' is-ready' : ''}` },
        h('span', { class: 'daily__chest', html: Icons.trophy }),
        h(
          'div',
          { class: 'daily__info' },
          h('span', { class: 'daily__label', text: t('daily.bonus') }),
          rewardChips(info.bonus),
        ),
        bonus,
      ),
      h(
        'p',
        { class: 'muted small daily__reset' },
        icon(Icons.clock),
        ` ${t('daily.resets', { duration: formatDuration((info.resetsAt - this.game.now()) / 1000) })}`,
      ),
    );
  }
}
