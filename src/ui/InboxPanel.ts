import type { InboxItem, InboxKind, InboxStore, InboxTarget } from '@/app/inbox';
import { formatRelative, t } from '@/i18n';
import { clear, h, icon } from './dom';
import { Icons } from './icons';

const KIND_ICONS: Record<InboxKind, string> = {
  crop: Icons.goods,
  build: Icons.build,
  boat: Icons.boat,
  train: Icons.train,
  production: Icons.goods,
  visitor: Icons.population,
  business: Icons.coin,
  quest: Icons.trophy,
  level: Icons.xp,
  daily: Icons.calendar,
  neighbor: Icons.population,
  market: Icons.coin,
  announcement: Icons.megaphone,
};

/** Centre de notifications : l'historique des messages du jeu. */
export class InboxPanel {
  readonly el = h('section', { class: 'sheet inbox', attrs: { 'aria-label': t('inbox.title') } });
  private list = h('div', { class: 'inbox__list' });
  isOpen = false;

  constructor(
    private readonly store: InboxStore,
    private readonly callbacks: { go: (target: InboxTarget) => void; onToggle: () => void },
  ) {
    this.el.append(
      h(
        'div',
        { class: 'sheet__header' },
        h('h2', { class: 'sheet__title' }, icon(Icons.bell), ` ${t('inbox.title')}`),
        h(
          'div',
          { class: 'sheet__header-actions' },
          h('button', { class: 'btn btn--secondary btn--small', text: t('inbox.clear'), onClick: () => store.clear() }),
          h(
            'button',
            { class: 'sheet__close', attrs: { 'aria-label': t('common.close') }, onClick: () => this.close() },
            icon(Icons.close),
          ),
        ),
      ),
      this.list,
    );
    store.events.on('change', () => {
      if (this.isOpen) this.render();
    });
  }

  open(): void {
    this.isOpen = true;
    this.render();
    this.el.classList.add('is-open');
    // Les messages affichés sont considérés comme lus (après le rendu, pour garder la mise en avant).
    window.setTimeout(() => this.store.markAllRead(), 600);
    this.callbacks.onToggle();
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.classList.remove('is-open');
    this.callbacks.onToggle();
  }

  private render(): void {
    clear(this.list);
    const items = this.store.list();
    if (items.length === 0) {
      this.list.append(h('p', { class: 'inbox__empty', text: t('inbox.empty') }));
      return;
    }
    const now = Date.now();
    for (const item of items) this.list.append(this.row(item, now));
  }

  private row(item: InboxItem, now: number): HTMLElement {
    const target = item.target;
    return h(
      'button',
      {
        class: `notice-row notice-row--${item.kind}${item.read ? '' : ' is-unread'}`,
        onClick: () => {
          if (!target) return;
          this.close();
          this.callbacks.go(target);
        },
      },
      h('span', { class: 'notice-row__icon', html: KIND_ICONS[item.kind] }),
      h('span', { class: 'notice-row__text', text: item.text }),
      h('span', { class: 'notice-row__time', text: formatRelative(item.at, now) }),
    );
  }
}
