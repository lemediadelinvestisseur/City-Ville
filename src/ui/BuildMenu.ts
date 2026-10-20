import type { Game } from '@/core/game';
import type { BuildingCategory, BuildingDef, FailReason } from '@/core/types';
import { BUILDINGS, SHOP_CATEGORIES } from '@/data/buildings';
import { t } from '@/i18n';
import { buildingName, categoryLabel } from '@/i18n/content';
import { ArtKey, type ArtLibrary } from '@/render/art/library';
import { clear, h, icon } from './dom';
import { formatDuration, formatNumber } from './format';
import { Icons } from './icons';

function effectLine(def: BuildingDef): string {
  switch (def.category) {
    case 'house':
      return t('build.effect.house', {
        population: def.population,
        coins: def.rent.coins,
        duration: formatDuration(def.rent.intervalSec),
      });
    case 'business':
      return t('build.effect.business', {
        goods: def.supplyGoods,
        coins: def.payout.coins,
        duration: formatDuration(def.serveSec),
      });
    case 'community':
      return t('build.effect.community', { n: def.popCap });
    case 'storage':
      return t('build.effect.storage', { n: def.goodsCap });
    case 'farm':
      return t('build.effect.farm');
    case 'decoration':
      return t('build.effect.decoration', { percent: def.bonus.percent, radius: def.bonus.radius });
    case 'road':
      return t('build.effect.road');
    case 'station':
      return t('build.effect.station');
    case 'rail':
      return '';
    case 'port':
      return def.boatTier === 1
        ? t('build.effect.port1')
        : def.boatTier === 2
          ? t('build.effect.port2')
          : t('build.effect.port3');
  }
}

/** Menu de construction (panneau du bas, onglets par catégorie). */
export class BuildMenu {
  readonly el = h('section', { class: 'sheet build-menu', attrs: { 'aria-label': t('build.title') } });
  private tabs = h('div', { class: 'tabs', attrs: { role: 'tablist' } });
  private list = h('div', { class: 'cards' });
  private tab: BuildingCategory = 'house';
  private hintDefId: string | null = null;
  isOpen = false;

  constructor(
    private readonly game: Game,
    private readonly art: ArtLibrary,
    private readonly onPick: (defId: string) => void,
    private readonly onBlocked: (reason: FailReason, missing: number | undefined, def: BuildingDef) => void,
    private readonly onClose: () => void,
  ) {
    const header = h(
      'div',
      { class: 'sheet__header' },
      h('h2', { class: 'sheet__title', text: t('build.title') }),
      h(
        'button',
        { class: 'sheet__close', attrs: { 'aria-label': t('common.close') }, onClick: () => this.close() },
        icon(Icons.close),
      ),
    );
    this.el.append(header, this.tabs, this.list);
  }

  open(focus?: { defId?: string; category?: BuildingCategory }): void {
    this.hintDefId = focus?.defId ?? null;
    if (focus?.defId) {
      const def = BUILDINGS.find((d) => d.id === focus.defId);
      if (def) this.tab = def.category;
    } else if (focus?.category) {
      this.tab = focus.category;
    }
    this.isOpen = true;
    this.render();
    this.el.classList.add('is-open');
    this.list.querySelector('.is-hint')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.classList.remove('is-open');
    this.onClose();
  }

  refresh(): void {
    if (this.isOpen) this.render();
  }

  private render(): void {
    clear(this.tabs);
    for (const category of SHOP_CATEGORIES) {
      const hasHint =
        this.hintDefId !== null && BUILDINGS.some((d) => d.id === this.hintDefId && d.category === category.id);
      this.tabs.append(
        h('button', {
          class: `tab${category.id === this.tab ? ' is-active' : ''}${hasHint ? ' is-hint' : ''}`,
          text: categoryLabel(category.id),
          attrs: { role: 'tab', 'aria-selected': String(category.id === this.tab) },
          onClick: () => {
            this.tab = category.id;
            this.render();
            this.list.scrollLeft = 0;
          },
        }),
      );
    }
    const scroll = this.list.scrollLeft;
    clear(this.list);
    const defs = BUILDINGS.filter((d) => d.category === this.tab && d.inShop !== false);
    for (const def of defs) this.list.append(this.card(def));
    this.list.scrollLeft = scroll;
  }

  private card(def: BuildingDef): HTMLElement {
    const check = this.game.checkPurchase(def);
    const reason = check.ok ? null : check.reason;
    const locked = reason === 'levelLocked' || reason === 'populationLocked';
    const cost = def.cost.cash
      ? h('span', { class: 'cost cost--cash' }, icon(Icons.cash), formatNumber(def.cost.cash))
      : h('span', { class: 'cost' }, icon(Icons.coin), formatNumber(def.cost.coins ?? 0));
    if (reason === 'notEnoughCoins' || reason === 'notEnoughCash') cost.classList.add('is-short');
    // Matériaux : marchandises demandées en plus des pièces.
    const goods = def.cost.goods
      ? h(
          'span',
          { class: `cost cost--goods${reason === 'notEnoughGoods' ? ' is-short' : ''}` },
          icon(Icons.goods),
          formatNumber(def.cost.goods),
        )
      : null;
    let lockText = '';
    if (reason === 'levelLocked') lockText = t('common.level', { level: def.requires?.level ?? 1 });
    else if (reason === 'populationLocked') lockText = t('build.lockPopulation', { n: def.requires?.population ?? 0 });
    else if (reason === 'populationCap') lockText = t('build.lockCap');
    else if (reason === 'limitReached') lockText = t('build.lockLimit');
    // Compteur « 2/5 » pour les bâtiments limités (masqué tant qu'ils sont verrouillés).
    const limit = this.game.buildLimitFor(def);
    const counter =
      limit !== null && !locked
        ? h('span', {
            class: `card__count${reason === 'limitReached' ? ' is-full' : ''}`,
            title: t('build.countTitle'),
            text: `${this.game.countOf(def.id)}/${limit}`,
          })
        : null;
    const card = h(
      'button',
      {
        class: `card${locked ? ' is-locked' : ''}${reason === 'populationCap' || reason === 'limitReached' ? ' is-capped' : ''}${def.id === this.hintDefId ? ' is-hint' : ''}`,
        attrs: { 'aria-label': buildingName(def) },
        onClick: () => {
          if (check.ok) {
            this.close();
            this.onPick(def.id);
          } else {
            this.onBlocked(check.reason, check.missing, def);
          }
        },
      },
      def.cost.cash ? h('span', { class: 'card__ribbon', text: t('build.premium') }) : null,
      counter,
      h(
        'span',
        { class: 'card__img' },
        h('img', { attrs: { src: this.art.iconUrl(ArtKey.building(def.id)), alt: '' } }),
      ),
      h('span', { class: 'card__name', text: buildingName(def) }),
      h('span', { class: 'card__effect', text: effectLine(def) }),
      h(
        'span',
        { class: 'card__footer' },
        cost,
        goods,
        def.buildSec > 0
          ? h(
              'span',
              { class: 'card__steps', title: t('build.duration') },
              icon(Icons.clock),
              formatDuration(def.buildSec),
            )
          : null,
      ),
      lockText ? h('span', { class: 'card__lock' }, icon(Icons.lock), lockText) : null,
    );
    return card;
  }
}
