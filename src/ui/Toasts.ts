import { h, icon } from './dom';

export type ToastKind = 'info' | 'error' | 'success';

export interface ToastOptions {
  /** Icône SVG interne affichée à gauche. */
  icon?: string;
  /**
   * Messages de même clé : le nouveau remplace l'ancien encore affiché au lieu
   * de s'empiler (« 2 champs sont prêts » puis « 3 champs sont prêts »).
   */
  key?: string;
  duration?: number;
}

interface Shown {
  node: HTMLElement;
  key: string;
  timer: number;
}

/** Petits messages temporaires en haut de l'écran (3 au plus, les plus anciens s'effacent). */
export class Toasts {
  readonly el = h('div', { class: 'toasts', attrs: { 'aria-live': 'polite' } });
  private shown: Shown[] = [];
  private lastText = '';
  private lastAt = 0;

  show(
    text: string,
    kind: ToastKind = 'info',
    action?: { label: string; onClick: () => void },
    options: ToastOptions = {},
  ): void {
    // Évite d'empiler le même message en rafale (touchers répétés).
    const now = performance.now();
    if (text === this.lastText && now - this.lastAt < 1200) return;
    this.lastText = text;
    this.lastAt = now;
    const key = options.key ?? text;
    const duration = (options.duration ?? 2800) + (action ? 1500 : 0);

    const toast = h(
      'div',
      { class: `toast toast--${kind}`, attrs: { role: kind === 'error' ? 'alert' : 'status' } },
      options.icon ? icon(options.icon, 'toast__icon') : null,
      h('span', { class: 'toast__text', text }),
    );
    const entry: Shown = { node: toast, key, timer: 0 };
    const remove = () => this.remove(entry);
    if (action) {
      toast.append(
        h('button', {
          class: 'toast__action',
          text: action.label,
          onClick: (event) => {
            event.stopPropagation();
            action.onClick();
            remove();
          },
        }),
      );
    }
    // Toucher le message le ferme (ou déclenche son action).
    toast.addEventListener('click', () => {
      action?.onClick();
      remove();
    });

    const previous = this.shown.find((s) => s.key === key);
    if (previous) {
      window.clearTimeout(previous.timer);
      previous.node.replaceWith(toast);
      toast.classList.add('is-in');
      this.shown = this.shown.map((s) => (s === previous ? entry : s));
    } else {
      while (this.shown.length >= 3) {
        const oldest = this.shown[0];
        if (oldest) this.remove(oldest, true);
      }
      this.el.append(toast);
      this.shown.push(entry);
      requestAnimationFrame(() => toast.classList.add('is-in'));
    }
    entry.timer = window.setTimeout(remove, duration);
  }

  private remove(entry: Shown, immediate = false): void {
    if (!this.shown.includes(entry)) return;
    this.shown = this.shown.filter((s) => s !== entry);
    window.clearTimeout(entry.timer);
    if (immediate) {
      entry.node.remove();
      return;
    }
    entry.node.classList.remove('is-in');
    setTimeout(() => entry.node.remove(), 250);
  }
}
