import type { Game } from '@/core/game';
import { h, icon } from './dom';
import { formatClock, formatNumber } from './format';
import { Icons } from './icons';

export type HudTarget = 'level' | 'coins' | 'cash' | 'energy' | 'goods' | 'population';

/** Barre de ressources en haut de l'écran. */
export class Hud {
  readonly el = h('div', { class: 'hud' });
  private pills = new Map<HudTarget, HTMLElement>();
  private values = new Map<HudTarget, HTMLElement>();
  private xpFill = h('div', { class: 'xpbar__fill' });
  private xpText = h('span', { class: 'xpbar__text' });
  private levelNum = h('span', { class: 'level__num' });
  private energyTimer = h('span', { class: 'pill__sub' });
  private lastEnergy: number | null = null;

  constructor(
    private readonly game: Game,
    onPlus: (target: 'coins' | 'cash' | 'energy') => void,
  ) {
    const level = h(
      'div',
      { class: 'pill pill--level', attrs: { 'aria-label': 'Niveau et expérience' } },
      h('span', { class: 'level' }, icon(Icons.xp, 'level__star'), this.levelNum),
      h('div', { class: 'xpbar' }, this.xpFill, this.xpText),
    );
    this.pills.set('level', level);

    const pill = (target: HudTarget, svg: string, label: string, plus?: 'coins' | 'cash' | 'energy') => {
      const value = h('span', { class: 'pill__value' });
      this.values.set(target, value);
      const el = h(
        'div',
        { class: `pill pill--${target}`, attrs: { 'aria-label': label } },
        icon(svg, 'pill__icon'),
        h('span', { class: 'pill__text' }, value, target === 'energy' ? this.energyTimer : null),
        plus
          ? h(
              'button',
              { class: 'pill__plus', attrs: { 'aria-label': `Obtenir des ${label}` }, onClick: () => onPlus(plus) },
              icon(Icons.plus),
            )
          : null,
      );
      this.pills.set(target, el);
      return el;
    };

    this.el.append(
      level,
      pill('coins', Icons.coin, 'pièces', 'coins'),
      pill('cash', Icons.cash, 'cash', 'cash'),
      pill('energy', Icons.energy, 'énergie', 'energy'),
      pill('goods', Icons.goods, 'marchandises'),
      pill('population', Icons.population, 'habitants'),
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

  refresh(): void {
    const { state } = this.game;
    const derived = this.game.derived();
    const xp = this.game.xpProgress();
    this.levelNum.textContent = String(state.level);
    this.xpFill.style.width = `${Math.round(xp.ratio * 100)}%`;
    this.xpText.textContent = xp.needed ? `${formatNumber(xp.current)} / ${formatNumber(xp.needed)}` : 'MAX';
    this.set('coins', formatNumber(state.coins));
    this.set('cash', formatNumber(state.cash));
    this.set('energy', `${state.energy}/${derived.energyMax}`);
    if (this.lastEnergy !== null && state.energy < this.lastEnergy) this.bump('energy');
    this.lastEnergy = state.energy;
    this.set('goods', `${formatNumber(state.goods)}/${formatNumber(derived.goodsCap)}`);
    this.set('population', `${formatNumber(derived.population)}/${formatNumber(derived.popCap)}`);
    const goodsFull = state.goods >= derived.goodsCap;
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
