import { h } from './dom';

export type ToastKind = 'info' | 'error' | 'success';

/** Petits messages temporaires en haut de l'écran. */
export class Toasts {
  readonly el = h('div', { class: 'toasts', attrs: { 'aria-live': 'polite' } });
  private lastText = '';
  private lastAt = 0;

  show(text: string, kind: ToastKind = 'info', action?: { label: string; onClick: () => void }, duration = 2800): void {
    // Évite d'empiler le même message en rafale (touchers répétés).
    const now = performance.now();
    if (text === this.lastText && now - this.lastAt < 1200) return;
    this.lastText = text;
    this.lastAt = now;
    const toast = h('div', { class: `toast toast--${kind}` }, h('span', { text }));
    if (action) {
      toast.append(
        h('button', {
          class: 'toast__action',
          text: action.label,
          onClick: () => {
            action.onClick();
            remove();
          },
        }),
      );
    }
    while (this.el.childElementCount >= 3) this.el.firstElementChild?.remove();
    this.el.append(toast);
    requestAnimationFrame(() => toast.classList.add('is-in'));
    const remove = () => {
      toast.classList.remove('is-in');
      setTimeout(() => toast.remove(), 250);
    };
    setTimeout(remove, action ? duration + 1500 : duration);
  }
}
