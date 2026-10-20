import type { Game } from '@/core/game';
import { findItemDef, getItemDef, type ItemBag } from '@/data/items';
import { itemName } from '@/i18n/content';
import { h } from './dom';
import { formatNumber } from './format';

/** Pictogramme d'un produit. */
export function itemEmoji(id: string): string {
  return findItemDef(id)?.emoji ?? '📦';
}

/** « 🥛 20 » : un produit et sa quantité ; en rouge s'il en manque (avec `game`). */
export function itemChip(id: string, qty: number, game?: Game): HTMLElement {
  const short = game !== undefined && game.itemCount(id) < qty;
  return h(
    'span',
    {
      class: `item-chip${short ? ' is-short' : ''}`,
      title: game ? `${itemName(id)} : ${formatNumber(game.itemCount(id))}/${formatNumber(qty)}` : itemName(id),
    },
    h('span', { class: 'item-chip__emoji', text: itemEmoji(id), attrs: { 'aria-hidden': 'true' } }),
    h('span', { class: 'item-chip__qty', text: formatNumber(qty) }),
    h('span', { class: 'sr-only', text: ` ${itemName(id)}` }),
  );
}

/** Liste de produits (ingrédients, commande, repas). */
export function bagChips(bag: ItemBag, game?: Game): HTMLElement {
  return h(
    'span',
    { class: 'item-chips' },
    ...Object.entries(bag)
      .filter(([id]) => findItemDef(id))
      .sort(([a], [b]) => getItemDef(b).value - getItemDef(a).value)
      .map(([id, qty]) => itemChip(id, qty, game)),
  );
}
