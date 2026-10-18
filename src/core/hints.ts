import { getBuildingDef } from '@/data/buildings';
import type { Game } from './game';
import { CHUNKS_PER_SIDE } from './grid';
import type { BuildingCategory, Entity, PrimaryAction, QuestProgress } from './types';

/** Cible d'aide visuelle (flèche de tutoriel ou bouton à mettre en avant). */
export type HintTarget =
  | { kind: 'entity'; entityId: number }
  | { kind: 'shop'; defId?: string; category?: BuildingCategory }
  | { kind: 'expand'; cx: number; cy: number };

interface Filter {
  defId?: string;
  category?: BuildingCategory;
}

function matches(entity: Entity, filter: Filter): boolean {
  if (filter.defId && entity.defId !== filter.defId) return false;
  if (filter.category && getBuildingDef(entity.defId).category !== filter.category) return false;
  return true;
}

function firstPurchasableChunk(game: Game): { cx: number; cy: number } | null {
  for (let cy = 0; cy < CHUNKS_PER_SIDE; cy++) {
    for (let cx = 0; cx < CHUNKS_PER_SIDE; cx++) {
      if (game.expansionInfo(cx, cy).status === 'purchasable') return { cx, cy };
    }
  }
  return null;
}

/**
 * Prochaine chose à faire pour avancer dans UN objectif : une construction
 * précise sur la carte, un achat dans le menu ou une zone à acheter.
 * Renvoie null si l'objectif attend simplement que le temps passe.
 */
export function findQuestHint(game: Game, progress: QuestProgress): HintTarget | null {
  const withAction = (type: PrimaryAction['type'], filter: Filter): Entity | undefined =>
    game.state.entities.find(
      (e) => game.isTileUnlocked(e.x, e.y) && matches(e, filter) && game.primaryAction(e).type === type,
    );
  const entity = (found: Entity | undefined): HintTarget | null =>
    found ? { kind: 'entity', entityId: found.id } : null;

  const def = game.activeQuests().find((q) => q.progress === progress)?.def;
  if (!def) return null;
  const status = game.questTaskStatus(progress);
  for (let i = 0; i < def.tasks.length; i++) {
    const task = def.tasks[i];
    if (!task || status[i]?.done) continue;
    switch (task.type) {
      case 'collectRent':
        return entity(withAction('collectRent', { defId: task.defId, category: 'house' }));
      case 'harvest':
        // Rien de mûr : on invite à planter un champ vide.
        return entity(withAction('harvest', { category: 'farm' }) ?? withAction('plant', { category: 'farm' }));
      case 'plant':
        return (
          entity(withAction('plant', { category: 'farm' }) ?? withAction('harvest', { category: 'farm' })) ?? {
            kind: 'shop',
            defId: 'plot',
          }
        );
      case 'place':
        return { kind: 'shop', defId: task.defId, category: task.category };
      case 'build': {
        const filter = { defId: task.defId, category: task.category };
        const ready = withAction('finishBuild', filter);
        if (ready) return entity(ready);
        // Chantier en cours : il suffit d'attendre (ou d'accélérer).
        if (withAction('waitBuild', filter)) return null;
        return { kind: 'shop', defId: task.defId, category: task.category };
      }
      case 'sendBoat': {
        const idle = withAction('sendBoat', { category: 'port' });
        if (idle) return entity(idle);
        const hasPort = game.state.entities.some((e) => getBuildingDef(e.defId).category === 'port');
        return hasPort ? null : { kind: 'shop', defId: 'pier' };
      }
      case 'unloadBoat':
        return entity(withAction('unloadBoat', { category: 'port' }) ?? withAction('sendBoat', { category: 'port' }));
      case 'supply':
        return entity(withAction('supply', { defId: task.defId, category: 'business' }));
      case 'collectBusiness':
        // Un commerce sans marchandises doit d'abord être approvisionné.
        return entity(
          withAction('collectBusiness', { defId: task.defId, category: 'business' }) ??
            withAction('supply', { defId: task.defId, category: 'business' }),
        );
      case 'expand': {
        const chunk = firstPurchasableChunk(game);
        return chunk ? { kind: 'expand', ...chunk } : null;
      }
      default:
        return null;
    }
  }
  return null;
}

/** Première aide disponible parmi les objectifs actifs (dans l'ordre). */
export function findHint(game: Game): HintTarget | null {
  for (const { progress } of game.activeQuests()) {
    const hint = findQuestHint(game, progress);
    if (hint) return hint;
  }
  return null;
}
