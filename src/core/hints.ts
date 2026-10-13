import { getBuildingDef } from '@/data/buildings';
import type { Game } from './game';
import type { BuildingCategory, Entity, PrimaryAction } from './types';

/** Cible d'aide visuelle (flèche de tutoriel ou bouton à mettre en avant). */
export type HintTarget =
  | { kind: 'entity'; entityId: number }
  | { kind: 'shop'; defId?: string; category?: BuildingCategory }
  | { kind: 'expand' };

function matches(entity: Entity, filter: { defId?: string; category?: BuildingCategory }): boolean {
  if (filter.defId && entity.defId !== filter.defId) return false;
  if (filter.category && getBuildingDef(entity.defId).category !== filter.category) return false;
  return true;
}

/**
 * Trouve la prochaine chose à faire pour avancer dans les objectifs actifs :
 * une construction précise sur la carte, ou un achat dans le menu.
 */
export function findHint(game: Game): HintTarget | null {
  const withAction = (type: PrimaryAction['type'], filter: { defId?: string; category?: BuildingCategory }) =>
    game.state.entities.find((e) => matches(e, filter) && game.primaryAction(e).type === type);

  for (const { def, progress } of game.activeQuests()) {
    const status = game.questTaskStatus(progress);
    for (let i = 0; i < def.tasks.length; i++) {
      const task = def.tasks[i];
      if (!task || status[i]?.done) continue;
      let found: Entity | undefined;
      switch (task.type) {
        case 'collectRent':
          found = withAction('collectRent', { defId: task.defId, category: 'house' });
          break;
        case 'harvest':
          found = withAction('harvest', { category: 'farm' });
          break;
        case 'plant':
          found = withAction('plant', { category: 'farm' });
          if (!found) return { kind: 'shop', defId: 'plot' };
          break;
        case 'place':
          return { kind: 'shop', defId: task.defId, category: task.category };
        case 'build':
          found = withAction('build', { defId: task.defId, category: task.category });
          if (!found) return { kind: 'shop', defId: task.defId, category: task.category };
          break;
        case 'supply':
          found = withAction('supply', { defId: task.defId, category: 'business' });
          break;
        case 'collectBusiness':
          found = withAction('collectBusiness', { defId: task.defId, category: 'business' });
          break;
        case 'expand':
          return { kind: 'expand' };
        default:
          break;
      }
      if (found) return { kind: 'entity', entityId: found.id };
      // Tâche en attente (culture qui pousse…) : on regarde les objectifs suivants.
      break;
    }
  }
  return null;
}
