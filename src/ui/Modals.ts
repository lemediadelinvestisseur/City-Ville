import { t } from '@/i18n';
import { h, icon, type Child } from './dom';
import { Icons, LEA_AVATAR } from './icons';

export interface ModalButton {
  label: string;
  kind?: 'primary' | 'secondary' | 'danger' | 'gold';
  disabled?: boolean;
  /** Renvoyer `false` garde la fenêtre ouverte. */
  onClick?: () => void | boolean;
}

export interface ModalOptions {
  title: string;
  kicker?: string;
  body?: Child | Child[];
  avatar?: boolean;
  buttons?: ModalButton[];
  dismissible?: boolean;
  className?: string;
  onClose?: () => void;
  /** Passe devant la file d'attente. */
  urgent?: boolean;
}

/** Fenêtres modales affichées une par une (file d'attente). */
export class Modals {
  readonly el = h('div', { class: 'modal-layer' });
  private queue: ModalOptions[] = [];
  private current: { options: ModalOptions; node: HTMLElement } | null = null;

  constructor(private readonly onOpenChange: (open: boolean) => void) {
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.current && this.current.options.dismissible !== false) this.close();
    });
  }

  get isOpen(): boolean {
    return this.current !== null;
  }

  show(options: ModalOptions): void {
    if (options.urgent) this.queue.unshift(options);
    else this.queue.push(options);
    if (!this.current) this.next();
  }

  /** Ferme la fenêtre ouverte et celles en attente. */
  closeAll(): void {
    this.queue.length = 0;
    this.close();
  }

  close(): void {
    if (!this.current) return;
    const { node, options } = this.current;
    this.current = null;
    // La fenêtre qui s'efface ne doit plus recevoir de clics (double-toucher).
    node.style.pointerEvents = 'none';
    node.setAttribute('inert', '');
    node.classList.remove('is-in');
    this.el.classList.remove('is-open');
    setTimeout(() => node.remove(), 200);
    options.onClose?.();
    if (this.queue.length > 0) setTimeout(() => this.next(), 120);
    else this.onOpenChange(false);
  }

  private next(): void {
    const options = this.queue.shift();
    if (!options) return;
    const dismissible = options.dismissible !== false;
    const backdrop = h('div', { class: 'modal-backdrop' });
    const isCurrent = () => this.current?.node === backdrop;
    const card = h(
      'div',
      {
        class: `modal ${options.className ?? ''}`,
        attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': options.title },
      },
      dismissible
        ? h(
            'button',
            {
              class: 'modal__close',
              attrs: { 'aria-label': t('common.close') },
              onClick: () => {
                if (isCurrent()) this.close();
              },
            },
            icon(Icons.close),
          )
        : null,
      options.avatar ? h('div', { class: 'modal__avatar', html: LEA_AVATAR }) : null,
      options.kicker ? h('div', { class: 'modal__kicker', text: options.kicker }) : null,
      h('h2', { class: 'modal__title', text: options.title }),
      h('div', { class: 'modal__body' }, ...(Array.isArray(options.body) ? options.body : [options.body])),
      options.buttons?.length
        ? h(
            'div',
            { class: 'modal__buttons' },
            ...options.buttons.map((button) => {
              const el = h('button', {
                class: `btn btn--${button.kind ?? 'primary'}`,
                text: button.label,
                onClick: () => {
                  // Un second toucher rapide ne doit pas rejouer l'action.
                  if (!isCurrent()) return;
                  if (button.onClick?.() === false) return;
                  this.close();
                },
              });
              if (button.disabled) el.disabled = true;
              return el;
            }),
          )
        : null,
    );
    backdrop.append(card);
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop && dismissible && isCurrent()) this.close();
    });
    this.current = { options, node: backdrop };
    this.el.append(backdrop);
    this.el.classList.add('is-open');
    this.onOpenChange(true);
    requestAnimationFrame(() => backdrop.classList.add('is-in'));
    card.querySelector<HTMLButtonElement>('.btn:not([disabled])')?.focus({ preventScroll: true });
  }
}
