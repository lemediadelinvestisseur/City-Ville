import { t } from '@/i18n';
import { h } from './dom';
import { Icons } from './icons';

export type SideButton = 'daily' | 'inbox' | 'chat';

/**
 * Colonne de raccourcis à droite de l'écran (en miroir des objectifs) :
 * défis du jour, centre de notifications et chat, avec pastilles.
 */
export class SideButtons {
  readonly el = h('nav', { class: 'side', attrs: { 'aria-label': t('side.aria') } });
  private buttons = new Map<SideButton, { button: HTMLButtonElement; badge: HTMLElement }>();

  constructor(onOpen: (which: SideButton) => void) {
    const make = (which: SideButton, svg: string, label: string) => {
      const badge = h('span', { class: 'side__badge' });
      const button = h(
        'button',
        { class: `side__btn side__btn--${which}`, attrs: { 'aria-label': label }, onClick: () => onOpen(which) },
        h('span', { class: 'side__icon', html: svg }),
        h('span', { class: 'side__label', text: label }),
        badge,
      );
      this.buttons.set(which, { button, badge });
      return button;
    };
    this.el.append(
      make('daily', Icons.calendar, t('side.daily')),
      make('inbox', Icons.bell, t('side.inbox')),
      make('chat', Icons.chat, t('side.chat')),
    );
  }

  /** Pastille : un nombre, un point (`true`) ou rien. */
  setBadge(which: SideButton, value: number | boolean): void {
    const entry = this.buttons.get(which);
    if (!entry) return;
    const text = typeof value === 'number' ? (value > 9 ? '9+' : value > 0 ? String(value) : '') : '';
    entry.badge.textContent = text;
    entry.badge.classList.toggle('is-on', value === true || (typeof value === 'number' && value > 0));
    entry.badge.classList.toggle('is-dot', value === true);
  }

  setVisible(which: SideButton, visible: boolean): void {
    this.buttons.get(which)?.button.classList.toggle('is-hidden', !visible);
  }

  /** Fait sautiller un bouton (nouveau message, défi rempli…). */
  wiggle(which: SideButton): void {
    const button = this.buttons.get(which)?.button;
    if (!button) return;
    button.classList.remove('wiggle');
    void button.offsetWidth;
    button.classList.add('wiggle');
  }
}
