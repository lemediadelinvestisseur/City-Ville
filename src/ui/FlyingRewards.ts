import type { ScreenPoint } from '@/app/context';
import type { Reward } from '@/core/types';
import { h } from './dom';
import type { Hud, HudTarget } from './Hud';
import { Icons } from './icons';

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Icônes de récompense qui s'envolent vers la barre de ressources. */
export class FlyingRewards {
  readonly el = h('div', { class: 'fly-layer', attrs: { 'aria-hidden': 'true' } });

  constructor(private readonly hud: Hud) {}

  /** `onArrive` est appelé quand les premières icônes atteignent les compteurs. */
  launch(from: ScreenPoint, reward: Reward, onArrive?: () => void): void {
    const entries: Array<[HudTarget, string, number]> = [];
    if (reward.coins) entries.push(['coins', Icons.coin, Math.min(6, 2 + Math.floor(reward.coins / 60))]);
    if (reward.goods) entries.push(['goods', Icons.goods, 3]);
    if (reward.xp) entries.push(['level', Icons.xp, Math.min(4, 1 + Math.floor(reward.xp / 4))]);
    if (reward.cash) entries.push(['cash', Icons.cash, 2]);
    if (reward.energy) entries.push(['energy', Icons.energy, 2]);
    entries.forEach(([target, svg, count], group) => {
      const el = this.hud.target(target);
      if (!el) return;
      if (reducedMotion()) {
        this.hud.bump(target);
        if (group === 0) onArrive?.();
        return;
      }
      const rect = el.getBoundingClientRect();
      const tx = rect.left + 18;
      const ty = rect.top + rect.height / 2;
      for (let i = 0; i < count; i++) {
        const node = h('span', { class: 'fly', html: svg });
        this.el.append(node);
        const jitterX = (Math.random() - 0.5) * 70;
        const jitterY = -30 - Math.random() * 40;
        const animation = node.animate(
          [
            { transform: `translate(${from.x}px, ${from.y}px) scale(0.4)`, opacity: 0 },
            {
              transform: `translate(${from.x + jitterX}px, ${from.y + jitterY}px) scale(1.15)`,
              opacity: 1,
              offset: 0.28,
            },
            { transform: `translate(${tx}px, ${ty}px) scale(0.7)`, opacity: 0.95 },
          ],
          { duration: 760 + i * 70, delay: group * 120 + i * 45, easing: 'cubic-bezier(.55,0,.35,1)', fill: 'both' },
        );
        animation.onfinish = () => {
          node.remove();
          if (i === 0) {
            this.hud.bump(target);
            if (group === 0) onArrive?.();
          }
        };
      }
    });
  }
}
