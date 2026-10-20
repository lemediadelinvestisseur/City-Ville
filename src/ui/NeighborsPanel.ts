import { t, tn } from '@/i18n';
import type { Backend, Profile } from '@/services/online/Backend';
import { clear, h, icon } from './dom';
import { formatNumber } from './format';
import { Icons } from './icons';
import { backendErrorMessage } from './messages';

type Tab = 'neighbors' | 'find' | 'ranking' | 'market';

export interface NeighborsCallbacks {
  visit: (profile: Profile) => void;
  help: (profile: Profile) => Promise<void>;
  toast: (text: string, kind: 'info' | 'success' | 'error') => void;
  onToggle: () => void;
  /** Contenu de l'onglet Marché. */
  market: () => Promise<HTMLElement>;
  /** Vie du quartier (défi de la semaine, demandes), en tête de l'onglet Voisins. */
  quarter: () => Promise<HTMLElement>;
}

const AVATAR_COLORS = ['#e57373', '#64b5f6', '#81c784', '#ffb74d', '#ba68c8', '#4db6ac', '#f06292', '#7986cb'];

/** Pastille ronde avec l'initiale du pseudo (couleur stable par pseudo). */
export function avatar(pseudo: string, size = 40): HTMLElement {
  let hash = 0;
  for (const ch of pseudo) hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  const color = AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? '#64b5f6';
  return h('span', {
    class: 'avatar',
    text: [...pseudo][0]?.toUpperCase() ?? '?',
    style: `background:${color};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.45)}px`,
  });
}

function stats(p: Profile): HTMLElement {
  return h(
    'span',
    { class: 'person__stats' },
    icon(Icons.xp),
    ` ${t('common.levelShort', { level: p.level })} · `,
    icon(Icons.population),
    ` ${formatNumber(p.population)}`,
  );
}

/** Panneau « Mes voisins » : voisins, recherche de joueurs et classement. */
export class NeighborsPanel {
  readonly el = h('section', { class: 'sheet neighbors', attrs: { 'aria-label': t('neighbors.title') } });
  private tabs = h('div', { class: 'tabs tabs--center', attrs: { role: 'tablist' } });
  private body = h('div', { class: 'neighbors__body' });
  private tab: Tab = 'neighbors';
  private rankingBy: 'level' | 'population' | 'likes' = 'level';
  private renderId = 0;
  isOpen = false;

  constructor(
    private readonly backend: Backend,
    private readonly callbacks: NeighborsCallbacks,
  ) {
    this.el.append(
      h(
        'div',
        { class: 'sheet__header' },
        h('h2', { class: 'sheet__title', text: t('neighbors.title') }),
        h(
          'button',
          { class: 'sheet__close', attrs: { 'aria-label': t('common.close') }, onClick: () => this.close() },
          icon(Icons.close),
        ),
      ),
      this.tabs,
      this.body,
    );
  }

  /** Rafraîchit l'onglet courant (après une action). */
  refresh(): void {
    if (this.isOpen) void this.render();
  }

  open(tab: Tab = 'neighbors'): void {
    this.tab = tab;
    this.isOpen = true;
    this.el.classList.add('is-open');
    void this.render();
    this.callbacks.onToggle();
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.classList.remove('is-open');
    this.callbacks.onToggle();
  }

  private renderTabs(): void {
    clear(this.tabs);
    const tabs: Array<[Tab, string]> = [
      ['neighbors', t('neighbors.tabNeighbors')],
      ['find', t('neighbors.tabFind')],
      ['ranking', t('neighbors.tabRanking')],
      ['market', t('neighbors.tabMarket')],
    ];
    for (const [id, label] of tabs) {
      this.tabs.append(
        h('button', {
          class: `tab${id === this.tab ? ' is-active' : ''}`,
          text: label,
          attrs: { role: 'tab', 'aria-selected': String(id === this.tab) },
          onClick: () => {
            this.tab = id;
            void this.render();
          },
        }),
      );
    }
  }

  private async render(): Promise<void> {
    const id = ++this.renderId;
    this.renderTabs();
    clear(this.body);
    this.body.append(h('p', { class: 'neighbors__loading', text: t('common.loading') }));
    try {
      const content =
        this.tab === 'neighbors'
          ? await this.neighbors()
          : this.tab === 'find'
            ? await this.find()
            : this.tab === 'market'
              ? await this.callbacks.market()
              : await this.ranking();
      if (id !== this.renderId) return;
      clear(this.body);
      this.body.append(content);
    } catch (error) {
      if (id !== this.renderId) return;
      clear(this.body);
      this.body.append(
        h('p', { class: 'neighbors__empty', text: backendErrorMessage(error) }),
        h('button', { class: 'btn btn--secondary', text: t('common.retry'), onClick: () => void this.render() }),
      );
    }
  }

  private person(p: Profile, actions: HTMLElement[], extra?: HTMLElement): HTMLElement {
    return h(
      'div',
      { class: 'person' },
      extra ?? null,
      avatar(p.pseudo),
      h(
        'div',
        { class: 'person__info' },
        h('span', { class: 'person__name', text: p.pseudo }),
        h('span', { class: 'person__city', text: p.cityName }),
        stats(p),
      ),
      h('div', { class: 'person__actions' }, ...actions),
    );
  }

  private visitButton(p: Profile): HTMLElement {
    return h('button', {
      class: 'btn btn--primary btn--small',
      text: t('neighbors.visit'),
      onClick: () => this.callbacks.visit(p),
    });
  }

  private async neighbors(): Promise<HTMLElement> {
    const [list, quarter] = await Promise.all([this.backend.neighbors(), this.callbacks.quarter()]);
    const wrap = h('div', { class: 'people' });
    wrap.append(quarter);
    if (list.length === 0) {
      wrap.append(
        h('p', { class: 'neighbors__empty', text: t('neighbors.empty') }),
        h('button', { class: 'btn btn--primary', text: t('neighbors.find'), onClick: () => this.open('find') }),
      );
      return wrap;
    }
    const toHelp = list.filter((n) => !n.helpedToday).length;
    wrap.append(
      h('p', {
        class: 'neighbors__tip',
        text: toHelp > 0 ? tn('neighbors.toHelp', toHelp) : t('neighbors.allHelped'),
      }),
    );
    for (const n of list) {
      const helpButton = h('button', {
        class: `btn btn--small ${n.helpedToday ? 'btn--secondary' : 'btn--gold'}`,
        text: n.helpedToday ? t('neighbors.helped') : t('neighbors.help'),
        onClick: () => {
          if (n.helpedToday) return;
          helpButton.setAttribute('disabled', '');
          this.callbacks
            .help(n)
            .then(() => {
              helpButton.textContent = t('neighbors.helped');
              helpButton.className = 'btn btn--small btn--secondary';
            })
            .catch((e: unknown) => {
              helpButton.removeAttribute('disabled');
              this.callbacks.toast(backendErrorMessage(e), 'error');
            });
        },
      });
      if (n.helpedToday) helpButton.setAttribute('disabled', '');
      wrap.append(this.person(n, [helpButton, this.visitButton(n)]));
    }
    return wrap;
  }

  private async find(): Promise<HTMLElement> {
    const wrap = h('div', { class: 'people' });
    const input = h('input', {
      class: 'field__input',
      attrs: { type: 'search', placeholder: t('neighbors.search'), autocapitalize: 'off', spellcheck: 'false' },
    });
    const results = h('div', { class: 'people' });
    const addButton = (p: Profile) => {
      const button = h('button', {
        class: 'btn btn--gold btn--small',
        text: t('neighbors.add'),
        onClick: () => {
          button.setAttribute('disabled', '');
          this.backend
            .addNeighbor(p.id)
            .then(() => {
              button.textContent = t('neighbors.added');
              button.className = 'btn btn--secondary btn--small';
              this.callbacks.toast(t('neighbors.nowNeighbor', { pseudo: p.pseudo }), 'success');
            })
            .catch((e: unknown) => {
              button.removeAttribute('disabled');
              this.callbacks.toast(backendErrorMessage(e), 'error');
            });
        },
      });
      return button;
    };
    const show = (people: Profile[], empty: string) => {
      clear(results);
      if (people.length === 0) results.append(h('p', { class: 'neighbors__empty', text: empty }));
      for (const p of people) results.append(this.person(p, [addButton(p), this.visitButton(p)]));
    };
    let timer = 0;
    input.addEventListener('input', () => {
      window.clearTimeout(timer);
      const text = input.value.trim();
      timer = window.setTimeout(() => {
        const request = text.length >= 2 ? this.backend.search(text) : this.backend.suggestions();
        request
          .then((people) => show(people, text.length >= 2 ? t('neighbors.noResult') : t('neighbors.noSuggestion')))
          .catch((e: unknown) => show([], backendErrorMessage(e)));
      }, 300);
    });
    show(await this.backend.suggestions(), t('neighbors.noSuggestionYet'));
    wrap.append(input, h('p', { class: 'neighbors__tip', text: t('neighbors.recent') }), results);
    return wrap;
  }

  private async ranking(): Promise<HTMLElement> {
    const wrap = h('div', { class: 'people' });
    const by = this.rankingBy;
    const switcher = h(
      'div',
      { class: 'segmented' },
      ...(
        [
          ['level', t('neighbors.byLevel')],
          ['population', t('neighbors.byPopulation')],
          ['likes', t('neighbors.byLikes')],
        ] as const
      ).map(([id, label]) =>
        h('button', {
          class: `segmented__btn${this.rankingBy === id ? ' is-active' : ''}`,
          text: label,
          onClick: () => {
            this.rankingBy = id;
            void this.render();
          },
        }),
      ),
    );
    wrap.append(switcher);
    if (by === 'likes') {
      const contest = await this.backend.prettiest();
      wrap.append(h('p', { class: 'neighbors__tip', text: t('neighbors.likesTip', { n: contest.myLikes }) }));
      if (contest.rows.length === 0)
        wrap.append(h('p', { class: 'neighbors__empty', text: t('neighbors.likesEmpty') }));
      contest.rows.forEach((p, index) => {
        const rank = index + 1;
        const mine = contest.myRank === rank;
        const row = this.person(
          p,
          mine ? [] : [this.visitButton(p)],
          h('span', { class: `rank${rank <= 3 ? ` rank--${rank}` : ''}`, text: String(rank) }),
        );
        row.querySelector('.person__stats')?.replaceChildren(`❤️ ${formatNumber(p.likes)}`);
        if (mine) row.classList.add('is-me');
        wrap.append(row);
      });
      return wrap;
    }
    const board = await this.backend.leaderboard(by);
    board.rows.forEach((p, index) => {
      const rank = index + 1;
      const row = this.person(
        p,
        p.id === board.me.id ? [] : [this.visitButton(p)],
        h('span', { class: `rank${rank <= 3 ? ` rank--${rank}` : ''}`, text: String(rank) }),
      );
      if (p.id === board.me.id) row.classList.add('is-me');
      wrap.append(row);
    });
    if (board.myRank !== null && !board.rows.some((p) => p.id === board.me.id)) {
      const row = this.person(board.me, [], h('span', { class: 'rank', text: String(board.myRank) }));
      row.classList.add('is-me');
      wrap.append(h('p', { class: 'neighbors__tip', text: t('neighbors.myRank') }), row);
    }
    return wrap;
  }
}
