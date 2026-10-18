import { hash2 } from '@/data/terrain';
import { ArtKey, TREE_VARIANTS, type TreeKind } from './art/library';

export interface TreeLook {
  key: string;
  /** Décalage du pied dans la case (en cases). */
  dx: number;
  dy: number;
  scale: number;
}

/**
 * Apparence d'un arbre (sauvage ou planté) : essence, léger décalage et taille
 * stables pour une case donnée, pour que la forêt ne paraisse pas alignée.
 */
export function treeLook(defId: string, x: number, y: number): TreeLook | null {
  const kind: TreeKind | null = defId === 'tree_oak' ? 'broadleaf' : defId === 'tree_pine' ? 'conifer' : null;
  if (!kind) return null;
  return {
    key: ArtKey.tree(kind, Math.floor(hash2(x, y, 6) * TREE_VARIANTS[kind])),
    dx: (hash2(x, y, 7) - 0.5) * 0.3,
    dy: (hash2(x, y, 8) - 0.5) * 0.3,
    scale: 0.85 + hash2(x, y, 5) * 0.3,
  };
}
