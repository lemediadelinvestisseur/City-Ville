import './ui/styles.css';
import type { AppContext, AppEvents } from './app/context';
import { SAVE_KEY } from './config';
import { Emitter } from './core/emitter';
import { Game } from './core/game';
import { createNewGame } from './core/newGame';
import { loadGame, saveGame } from './core/save';
import { ArtLibrary } from './render/art/library';
import { createPhaserGame } from './render/createPhaserGame';
import { bindSounds } from './app/sounds';
import { MockPaymentProvider } from './services/payments/MockPaymentProvider';
import { SoundFx } from './services/sound';
import { safeStorage } from './services/storage';
import { UI } from './ui/UI';

function boot(): void {
  const gameRoot = document.getElementById('game');
  const uiRoot = document.getElementById('ui');
  if (!gameRoot || !uiRoot) throw new Error('Conteneurs #game et #ui introuvables');

  const storage = safeStorage();
  const state = loadGame(storage, SAVE_KEY) ?? createNewGame(Date.now());
  const game = new Game(state);
  const bus = new Emitter<AppEvents>();
  const art = ArtLibrary.build();

  // Le fournisseur de test délègue sa confirmation à l'interface.
  let ui: UI | null = null;
  const payments = new MockPaymentProvider((product) => ui?.confirmTestPurchase(product) ?? Promise.resolve(false));
  const sound = new SoundFx(storage);
  const ctx: AppContext = { game, bus, art, payments, sound };

  // ——— Sauvegarde automatique ———
  let resetting = false;
  let saveTimer = 0;
  const persist = () => {
    if (!resetting) saveGame(storage, SAVE_KEY, game.state, Date.now());
  };
  game.events.on('change', () => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(persist, 800);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persist();
  });
  window.addEventListener('pagehide', persist);
  window.setInterval(() => game.tick(), 1000);

  ui = new UI(uiRoot, ctx, {
    onReset: () => {
      resetting = true;
      storage.removeItem(SAVE_KEY);
      window.location.reload();
    },
  });

  bindSounds(ctx, sound, uiRoot);

  bus.on('world:ready', () => {
    document.getElementById('loading')?.classList.add('is-done');
    window.setTimeout(() => document.getElementById('loading')?.remove(), 600);
    ui?.start();
  });

  const { scene } = createPhaserGame(gameRoot, ctx);
  persist();
  // Accès de débogage (tests de bout en bout) uniquement en développement.
  if (import.meta.env.DEV) Object.assign(window, { __cityVille: { game, bus, scene } });
}

try {
  boot();
} catch (error) {
  console.error(error);
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = 'Impossible de démarrer le jeu sur cet appareil.';
}
