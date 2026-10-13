import Phaser from 'phaser';
import type { AppContext } from '@/app/context';
import { WorldScene } from './WorldScene';

/**
 * Crée le jeu Phaser en plein écran. Le canevas est rendu à la densité de
 * pixels de l'écran (plafonnée à 2 pour les performances) puis affiché à la
 * taille CSS du conteneur, ce qui garde des graphismes nets sur mobile.
 */
export function createPhaserGame(parent: HTMLElement, ctx: AppContext): { game: Phaser.Game; scene: WorldScene } {
  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const size = () => ({
    width: Math.max(1, Math.round(parent.clientWidth * dpr)),
    height: Math.max(1, Math.round(parent.clientHeight * dpr)),
  });
  const scene = new WorldScene(ctx, dpr);
  const initial = size();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#5f9440',
    banner: false,
    disableContextMenu: true,
    input: { activePointers: 3 },
    render: { antialias: true, powerPreference: 'high-performance' },
    scale: {
      mode: Phaser.Scale.NONE,
      width: initial.width,
      height: initial.height,
      zoom: 1 / dpr,
    },
    scene: [scene],
  });

  let pending = 0;
  const onResize = () => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => {
      const next = size();
      if (next.width !== game.scale.width || next.height !== game.scale.height) {
        game.scale.resize(next.width, next.height);
      }
    });
  };
  window.addEventListener('resize', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  return { game, scene };
}
