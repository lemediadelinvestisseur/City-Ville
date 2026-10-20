import type { Game } from '@/core/game';
import type { HappinessTier } from '@/data/balance';
import { t } from '@/i18n';
import { h, icon } from './dom';
import { formatClock, formatNumber } from './format';
import { Icons } from './icons';

export type HudTarget = 'level' | 'coins' | 'cash' | 'energy' | 'goods' | 'population' | 'workers';

const MOODS: Record<HappinessTier, string> = {
  delighted: '😄',
  happy: '🙂',
  content: '😐',
  unhappy: '🙁',
  miserable: '😫',
};

/** Barre de ressources en haut de l'écran. */
export class Hud {
  readonly el = h('div', { class: 'hud' });
  private pills = new Map<HudTarget, HTMLElement>();
  private values = new Map<HudTarget, HTMLElement>();
  private xpFill = h('div', { class: 'gauge__fill xpbar__fill' });
  private xpText = h('span', { class: 'gauge__text xpbar__text' });
  private levelNum = h('span', { class: 'level__num' });
  private energyTimer = h('span', { class: 'pill__sub' });
  /** Humeur de la ville, à côté des habitants. */
  private mood = h('span', { class: 'pill__mood', attrs: { 'aria-hidden': 'true' } });
  /** Jauge d'énergie (même rendu que la barre d'XP). */
  private energyFill = h('div', { class: 'gauge__fill gauge__fill--energy' });
  private lastEnergy: number | null = null;
  /** Récompenses tombées au sol, pas encore ramassées (déjà créditées par le jeu). */
  private pending = { coins: 0, xp: 0 };

  constructor(
    private readonly game: Game,
    onPlus: (target: 'coins' | 'cash' | 'energy') => void,
    /** Toucher l'entrepôt ouvre l'inventaire, les habitants ouvrent la mairie. */
    onOpen: (target: 'goods' | 'population' | 'workers') => void,
  ) {
    const level = h(
      'div',
      { class: 'pill pill--level', attrs: { 'aria-label': t('hud.levelAria') } },
      h('span', { class: 'level' }, icon(Icons.xp, 'level__star'), this.levelNum),
      h('div', { class: 'gauge xpbar' }, this.xpFill, this.xpText),
    );
    this.pills.set('level', level);

    const plusLabels = { coins: t('hud.getCoins'), cash: t('hud.getCash'), energy: t('hud.getEnergy') };
    const pill = (target: HudTarget, svg: string, label: string, plus?: 'coins' | 'cash' | 'energy') => {
      const isEnergy = target === 'energy';
      const value = h('span', { class: isEnergy ? 'pill__value gauge__text' : 'pill__value' });
      this.values.set(target, value);
      const opens = target === 'goods' || target === 'population' || target === 'workers';
      // L'énergie s'affiche dans une jauge, avec le minuteur de recharge en dessous.
      const text = isEnergy
        ? h(
            'span',
            { class: 'pill__text' },
            h('span', { class: 'gauge gauge--energy' }, this.energyFill, value),
            this.energyTimer,
          )
        : h('span', { class: 'pill__text' }, value);
      const el = h(
        opens ? 'button' : 'div',
        {
          class: `pill pill--${target}${opens ? ' pill--tap' : ''}`,
          attrs: { 'aria-label': label },
          onClick: opens ? () => onOpen(target) : undefined,
        },
        icon(svg, 'pill__icon'),
        text,
        target === 'population' ? this.mood : null,
        plus
          ? h(
              'button',
              { class: 'pill__plus', attrs: { 'aria-label': plusLabels[plus] }, onClick: () => onPlus(plus) },
              icon(Icons.plus),
            )
          : null,
      );
      this.pills.set(target, el);
      return el;
    };

    this.el.append(
      level,
      pill('coins', Icons.coin, t('hud.coins'), 'coins'),
      pill('cash', Icons.cash, t('hud.cash'), 'cash'),
      pill('energy', Icons.energy, t('hud.energy'), 'energy'),
      pill('goods', Icons.goods, t('hud.goods')),
      pill('population', Icons.population, t('hud.population')),
      pill('workers', Icons.worker, t('hud.workers')),
    );
    this.refresh();
  }

  /** Élément visé par les icônes de récompense volantes. */
  target(kind: HudTarget): HTMLElement | undefined {
    return this.pills.get(kind);
  }

  bump(kind: HudTarget): void {
    const el = this.pills.get(kind);
    if (!el) return;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  /** Les compteurs ne montent qu'au ramassage des récompenses au sol. */
  hold(reward: { coins?: number; xp?: number }): void {
    this.pending.coins += reward.coins ?? 0;
    this.pending.xp += reward.xp ?? 0;
    this.refresh();
  }

  release(reward: { coins?: number; xp?: number }): void {
    this.pending.coins = Math.max(0, this.pending.coins - (reward.coins ?? 0));
    this.pending.xp = Math.max(0, this.pending.xp - (reward.xp ?? 0));
    this.refresh();
  }

  refresh(): void {
    const { state } = this.game;
    const derived = this.game.derived();
    const progress = this.game.xpProgress();
    const shown = Math.max(0, progress.current - this.pending.xp);
    const xp = { ...progress, current: shown, ratio: progress.needed ? shown / progress.needed : 1 };
    this.levelNum.textContent = String(state.level);
    this.xpFill.style.width = `${Math.round(xp.ratio * 100)}%`;
    this.xpText.textContent = xp.needed ? `${formatNumber(xp.current)} / ${formatNumber(xp.needed)}` : t('hud.max');
    this.set('coins', formatNumber(Math.max(0, state.coins - this.pending.coins)));
    this.set('cash', formatNumber(state.cash));
    this.set('energy', `${state.energy}/${derived.energyMax}`);
    const energyRatio = derived.energyMax ? Math.min(1, state.energy / derived.energyMax) : 1;
    this.energyFill.style.width = `${Math.round(energyRatio * 100)}%`;
    if (this.lastEnergy !== null && state.energy < this.lastEnergy) this.bump('energy');
    this.lastEnergy = state.energy;
    const stock = this.game.stock();
    this.set('goods', `${formatNumber(stock)}/${formatNumber(derived.goodsCap)}`);
    const mood = MOODS[derived.happiness.tier];
    if (this.mood.textContent !== mood) this.mood.textContent = mood;
    this.set('population', `${formatNumber(derived.population)}/${formatNumber(derived.popCap)}`);
    // Ouvriers disponibles : « 0/1 » quand le seul ouvrier est sur un chantier.
    const workers = this.game.workersInfo();
    this.set('workers', `${workers.total - workers.busy}/${workers.total}`);
    this.pills.get('workers')?.classList.toggle('is-warn', workers.busy >= workers.total);
    const goodsFull = stock >= derived.goodsCap;
    this.pills.get('goods')?.classList.toggle('is-warn', goodsFull);
    this.pills.get('population')?.classList.toggle('is-warn', derived.populationProjected >= derived.popCap);
    this.pills.get('energy')?.classList.toggle('is-warn', state.energy === 0);
    this.refreshTimer();
  }

  refreshTimer(): void {
    const next = this.game.nextEnergyAt();
    this.energyTimer.textContent = next === null ? '' : formatClock((next - this.game.now()) / 1000);
  }

  private set(target: HudTarget, text: string): void {
    const el = this.values.get(target);
    if (el && el.textContent !== text) el.textContent = text;
  }
}
