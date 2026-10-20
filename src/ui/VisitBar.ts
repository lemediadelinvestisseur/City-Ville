import { t } from '@/i18n';
import type { Visit } from '@/services/online/Backend';
import { clear, h, icon } from './dom';
import { formatNumber } from './format';
import { Icons } from './icons';
import { backendErrorMessage } from './messages';
import { avatar } from './NeighborsPanel';

export interface VisitCallbacks {
  help: () => Promise<void>;
  addNeighbor: () => Promise<void>;
  report: () => void;
  block: () => void;
  leave: () => void;
  /** « J'aime » (concours de la plus belle ville) : renvoie le total de la ville. */
  like: () => Promise<number>;
  likeStatus: (playerId: string) => Promise<{ likes: number; liked: boolean }>;
  toast: (text: string, kind: 'info' | 'success' | 'error') => void;
}

/** Bandeau affiché pendant la visite de la ville d'un autre joueur. */
export class VisitBar {
  readonly el = h('div', { class: 'visit-bar' });
  private top = h('div', { class: 'visit-bar__top' });
  private bottom = h('div', { class: 'visit-bar__bottom' });

  constructor(private readonly callbacks: VisitCallbacks) {
    this.el.append(this.top, this.bottom);
  }

  show(visit: Visit): void {
    const { profile } = visit;
    clear(this.top);
    clear(this.bottom);
    const actionButton = (label: string, kind: string, run: () => Promise<void>, done: string) => {
      const button = h('button', {
        class: `btn btn--small ${kind}`,
        text: label,
        onClick: () => {
          button.setAttribute('disabled', '');
          run()
            .then(() => {
              button.textContent = done;
              button.className = 'btn btn--small btn--secondary';
            })
            .catch((e: unknown) => {
              button.removeAttribute('disabled');
              this.callbacks.toast(backendErrorMessage(e), 'error');
            });
        },
      });
      return button;
    };
    const help = visit.isNeighbor
      ? visit.helpedToday
        ? h('button', { class: 'btn btn--small btn--secondary', text: t('neighbors.helped'), attrs: { disabled: '' } })
        : actionButton(t('neighbors.help'), 'btn--gold', this.callbacks.help, t('neighbors.helped'))
      : actionButton(t('neighbors.add'), 'btn--gold', this.callbacks.addNeighbor, t('neighbors.added'));
    const more = h('details', { class: 'visit-bar__more' });
    more.append(
      h('summary', { class: 'btn btn--small btn--secondary', text: '•••', attrs: { 'aria-label': t('visit.more') } }),
      h(
        'div',
        { class: 'visit-bar__menu' },
        h('button', {
          class: 'btn btn--small btn--secondary',
          text: t('visit.report'),
          onClick: () => {
            more.open = false;
            this.callbacks.report();
          },
        }),
        h('button', {
          class: 'btn btn--small btn--danger',
          text: t('visit.block'),
          onClick: () => {
            more.open = false;
            this.callbacks.block();
          },
        }),
      ),
    );
    const like = h('button', { class: 'btn btn--small btn--secondary visit-bar__like', text: '❤️' });
    const showLikes = (likes: number, liked: boolean) => {
      like.textContent = `${liked ? '❤️' : '🤍'} ${formatNumber(likes)}`;
      like.setAttribute('aria-label', t(liked ? 'visit.liked' : 'visit.like'));
      like.classList.toggle('is-on', liked);
      if (liked) like.setAttribute('disabled', '');
    };
    showLikes(0, false);
    this.callbacks
      .likeStatus(profile.id)
      .then(({ likes, liked }) => showLikes(likes, liked))
      .catch(() => undefined);
    like.addEventListener('click', () => {
      like.setAttribute('disabled', '');
      this.callbacks
        .like()
        .then((likes) => {
          showLikes(likes, true);
          this.callbacks.toast(t('visit.likedToast', { city: profile.cityName || profile.pseudo }), 'success');
        })
        .catch((e: unknown) => {
          like.removeAttribute('disabled');
          this.callbacks.toast(backendErrorMessage(e), 'error');
        });
    });
    this.top.append(
      avatar(profile.pseudo, 44),
      h(
        'div',
        { class: 'visit-bar__info' },
        h('span', { class: 'visit-bar__name', text: profile.cityName }),
        h(
          'span',
          { class: 'visit-bar__stats' },
          `${profile.pseudo} · `,
          icon(Icons.xp),
          ` ${t('common.levelShort', { level: profile.level })} · `,
          icon(Icons.population),
          ` ${formatNumber(profile.population)}`,
        ),
      ),
      like,
      help,
      more,
    );
    this.bottom.append(
      h('button', {
        class: 'btn btn--primary visit-bar__back',
        text: t('visit.back'),
        onClick: this.callbacks.leave,
      }),
    );
    this.el.classList.add('is-open');
  }

  hide(): void {
    this.el.classList.remove('is-open');
  }
}
