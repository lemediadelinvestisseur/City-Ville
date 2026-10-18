import './ui/styles.css';
import type { AppContext, AppEvents } from './app/context';
import { SAVE_KEY } from './config';
import { Emitter } from './core/emitter';
import { Game } from './core/game';
import { createNewGame } from './core/newGame';
import { deserialize, saveGame, type KeyValueStorage } from './core/save';
import { ArtLibrary } from './render/art/library';
import { createPhaserGame, type PhaserHandle } from './render/createPhaserGame';
import { InboxStore } from './app/inbox';
import { OnlineSync } from './app/online';
import { ReminderScheduler } from './app/reminders';
import { bindSounds } from './app/sounds';
import { detectLanguage, language, loadLanguage, t, type Language } from './i18n';
import type { Backend } from './services/online/Backend';
import { ConvexBackend } from './services/online/ConvexBackend';
import { LocalBackend } from './services/online/LocalBackend';
import { createNotifier } from './services/notifications';
import { MockPaymentProvider } from './services/payments/MockPaymentProvider';
import { SoundFx } from './services/sound';
import { Preferences } from './services/preferences';
import { mirroredStorage, restoreNativeBackup, setupNative } from './services/native';
import { safeStorage } from './services/storage';
import { UI } from './ui/UI';

/**
 * Charge la partie sauvegardée. Une sauvegarde illisible (corrompue, d'une
 * version plus récente…) est mise de côté au lieu d'être écrasée.
 */
function loadOrCreate(storage: KeyValueStorage): Game {
  let raw: string | null = null;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch {
    raw = null;
  }
  const backup = () => {
    if (!raw) return;
    try {
      storage.setItem(`${SAVE_KEY}:backup-${Date.now()}`, raw);
    } catch {
      // Stockage plein ou indisponible : tant pis pour la copie.
    }
  };
  const state = deserialize(raw);
  if (state) {
    try {
      return new Game(state);
    } catch (error) {
      console.error(error);
    }
  }
  backup();
  return new Game(createNewGame(Date.now()));
}

/** Charge la langue choisie (ou celle de l'appareil) avant de construire l'interface. */
async function setupLanguage(prefs: Preferences, storage: KeyValueStorage): Promise<void> {
  // Compte créé avant l'arrivée des langues : le jeu était en français, il le reste.
  const registered =
    storage.getItem('city-ville:device') !== null || storage.getItem('city-ville:local-pseudo') !== null;
  if (prefs.language === null && registered) prefs.setLanguage('fr');
  await loadLanguage(prefs.language ?? detectLanguage(navigator.languages ?? [navigator.language]));
  document.documentElement.lang = language();
  const text = document.querySelector('.loading__text');
  if (text) text.textContent = t('boot.loading');
}

async function boot(): Promise<void> {
  const gameRoot = document.getElementById('game');
  const uiRoot = document.getElementById('ui');
  if (!gameRoot || !uiRoot) throw new Error('Conteneurs #game et #ui introuvables');

  const storage = mirroredStorage(safeStorage());
  const prefs = new Preferences(storage);
  await setupLanguage(prefs, storage);
  const game = loadOrCreate(storage);
  const bus = new Emitter<AppEvents>();
  const art = ArtLibrary.build();

  // Le fournisseur de test délègue sa confirmation à l'interface.
  let ui: UI | null = null;
  const payments = new MockPaymentProvider((product) => ui?.confirmTestPurchase(product) ?? Promise.resolve(false));
  const sound = new SoundFx(storage);
  const ctx: AppContext = { game, bus, art, payments, sound, prefs };
  const inbox = new InboxStore(storage);
  const notifier = createNotifier();
  const reminders = new ReminderScheduler(game, notifier, prefs);

  // ——— Sauvegarde automatique ———
  let resetting = false;
  // Partie modifiée dans un autre onglet : cet onglet ne doit plus rien écrire.
  let stale = false;
  let saveTimer = 0;
  const persist = () => {
    if (!resetting && !stale) saveGame(storage, SAVE_KEY, game.state, Date.now());
  };
  window.addEventListener('storage', (event) => {
    if (event.key !== SAVE_KEY || resetting || stale) return;
    stale = true;
    ui?.showStale(() => window.location.reload());
  });
  game.events.on('change', () => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(persist, 800);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persist();
  });
  window.addEventListener('pagehide', persist);
  window.setInterval(() => game.tick(), 1000);

  // ——— Services en ligne (Convex si configuré, sinon démo locale) ———
  const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
  const backend: Backend = convexUrl
    ? new ConvexBackend(convexUrl, storage)
    : new LocalBackend(storage, () => ({
        level: game.state.level,
        xp: game.state.xp,
        population: game.derived().population,
        cityName: game.state.cityName,
      }));
  /** Remplace la partie locale par une sauvegarde (autre appareil) et redémarre. */
  const adoptSave = (data: string, revision: number) => {
    resetting = true;
    storage.setItem(SAVE_KEY, data);
    OnlineSync.rememberRevision(storage, revision);
    window.location.reload();
  };
  const sync = new OnlineSync(game, backend, storage, {
    onConflict: (remote, choose) => ui?.social.askConflict(remote, choose),
    adoptSave,
    onHelpsReceived: (helpers, reward) => ui?.social.showHelpsReceived(helpers, reward),
  });
  let phaser: PhaserHandle | null = null;

  ui = new UI(uiRoot, ctx, {
    storage,
    inbox,
    notifier,
    reminders,
    onReset: () => {
      resetting = true;
      storage.removeItem(SAVE_KEY);
      window.location.reload();
    },
    social: {
      backend,
      startSync: () => void sync.start(),
      openVisit: (visit) => {
        const state = deserialize(visit.data);
        if (!state || !phaser) throw new Error('Ville illisible');
        phaser.openVisit({ ...ctx, game: new Game(state), bus: new Emitter<AppEvents>() });
      },
      closeVisit: () => phaser?.closeVisit(),
      redeemTransfer: async (code) => {
        await backend.redeemTransferCode(code);
        const remote = await backend.pullSave();
        if (remote) adoptSave(remote.data, remote.revision);
        else window.location.reload();
      },
      wipeLocal: () => {
        resetting = true;
        for (const key of [SAVE_KEY, 'city-ville:revision', 'city-ville:dirty', 'city-ville:inbox']) {
          storage.removeItem(key);
        }
        window.location.reload();
      },
      setLanguage: (code: Language) => {
        prefs.setLanguage(code);
        if (code === language()) return;
        // Les messages déjà rangés sont dans l'ancienne langue.
        inbox.clear();
        persist();
        window.location.reload();
      },
    },
  });

  bindSounds(ctx, sound, uiRoot);
  void setupNative(ctx);

  bus.on('world:ready', () => {
    document.getElementById('loading')?.classList.add('is-done');
    window.setTimeout(() => document.getElementById('loading')?.remove(), 600);
    ui?.start();
  });

  phaser = createPhaserGame(gameRoot, ctx);
  const { scene } = phaser;
  persist();
  // Accès de débogage (tests de bout en bout) uniquement en développement.
  if (import.meta.env.DEV) {
    Object.assign(window, { __cityVille: { game, bus, scene, phaser, backend, inbox, reminders } });
  }
}

// Dans l'appli native, on restaure d'abord la sauvegarde si iOS a vidé le stockage web.
void restoreNativeBackup()
  .then(boot)
  .catch((error: unknown) => {
    console.error(error);
    const loading = document.getElementById('loading');
    if (loading) loading.textContent = t('boot.failed');
  });
