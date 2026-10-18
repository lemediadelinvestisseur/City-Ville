import { getBuildingDef } from '@/data/buildings';
import type { SoundFx } from '@/services/sound';
import type { AppContext } from './context';

/** Associe les évènements du jeu et de l'interface aux bruitages. */
export function bindSounds(ctx: AppContext, sound: SoundFx, uiRoot: HTMLElement): void {
  const { game, bus } = ctx;
  game.events.on('gameplay', (event) => {
    switch (event.type) {
      case 'place':
        // Un chantier qui démarre sonne comme un coup de marteau.
        sound.play(getBuildingDef(event.defId).buildSec > 0 ? 'construction' : 'place');
        break;
      case 'collectRent':
      case 'collectBusiness':
        sound.play('coin');
        break;
      case 'harvest':
        sound.play('harvest');
        break;
      case 'plant':
        sound.play('plant');
        break;
      case 'supply':
      case 'sendBoat':
        sound.play('supply');
        break;
      case 'unloadBoat':
        sound.play('harvest');
        break;
      case 'expand':
        sound.play('complete');
        break;
      default:
        break;
    }
  });
  game.events.on('constructionComplete', () => sound.play('complete'));
  game.events.on('upgradeStarted', () => sound.play('construction'));
  game.events.on('upgradeComplete', () => sound.play('complete'));
  game.events.on('levelUp', () => sound.play('levelUp'));
  game.events.on('questCompleted', () => sound.play('quest'));
  bus.on('world:fail', () => sound.play('error'));
  bus.on('fx:hammer', () => sound.play('hammerSoft'));
  bus.on('fx:pickup', ({ reward }) => sound.play(reward.coins ? 'coin' : 'click'));
  uiRoot.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('button')) sound.play('click');
  });
}
