import type { SoundFx } from '@/services/sound';
import type { AppContext } from './context';

/** Associe les évènements du jeu et de l'interface aux bruitages. */
export function bindSounds(ctx: AppContext, sound: SoundFx, uiRoot: HTMLElement): void {
  const { game, bus } = ctx;
  game.events.on('gameplay', (event) => {
    switch (event.type) {
      case 'place':
        sound.play('place');
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
        sound.play('supply');
        break;
      case 'expand':
        sound.play('complete');
        break;
      default:
        break;
    }
  });
  game.events.on('constructionComplete', () => sound.play('complete'));
  game.events.on('levelUp', () => sound.play('levelUp'));
  game.events.on('questCompleted', () => sound.play('quest'));
  bus.on('world:action', ({ type, ok }) => {
    if (ok && type === 'build') sound.play('hammer');
  });
  bus.on('world:fail', () => sound.play('error'));
  uiRoot.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('button')) sound.play('click');
  });
}
