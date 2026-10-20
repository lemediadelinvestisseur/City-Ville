import type { Emitter } from '@/core/emitter';
import type { Game } from '@/core/game';
import type { HintTarget } from '@/core/hints';
import type { DayNightMode } from '@/core/dayNight';
import type { FailReason, PrimaryAction, Reward } from '@/core/types';
import type { ArtLibrary } from '@/render/art/library';
import type { PaymentProvider } from '@/services/payments/PaymentProvider';
import type { Preferences } from '@/services/preferences';
import type { Haptics } from '@/services/haptics';
import type { Music } from '@/services/music';
import type { SoundFx } from '@/services/sound';

/** Position à l'écran, en pixels CSS. */
export interface ScreenPoint {
  x: number;
  y: number;
}

export type WorldMode = 'play' | 'edit';

export interface PlacementInfo {
  defId: string;
  moving: boolean;
  valid: boolean;
  reason: FailReason | null;
}

/** Évènements échangés entre le monde (Phaser) et l'interface (DOM). */
export interface AppEvents {
  // Monde → interface
  'world:ready': undefined;
  'world:entityInfo': { entityId: number; screen: ScreenPoint; action: PrimaryAction };
  'world:lockedTap': { cx: number; cy: number; screen: ScreenPoint };
  'world:emptyTap': undefined;
  'world:cameraMoved': undefined;
  'world:fail': { reason: FailReason; missing?: number; item?: string; screen?: ScreenPoint };
  'world:action': { type: PrimaryAction['type']; ok: boolean };
  'world:placement': PlacementInfo | null;
  'world:editSelect': { entityId: number; screen: ScreenPoint } | null;
  'world:hint': HintTarget | null;
  /** La caméra s'approche du bord de la ville (invitation à voir les voisins). */
  'world:edge': boolean;
  /** Paysage autour de la caméra (0 à 1) : sons de la mer et de la forêt. */
  'world:ambience': { sea: number; forest: number };
  /** Le visiteur de passage a été touché. */
  'world:visitorTap': undefined;
  /** Photo de la ville (image PNG). */
  'world:photo': { url: string };
  'fx:reward': { screen: ScreenPoint; reward: Reward };
  /** Récompenses tombées au sol : les compteurs attendent leur ramassage. */
  'world:drops': Reward;
  /** Une récompense au sol vient d'être ramassée. */
  'fx:pickup': { screen: ScreenPoint; reward: Reward };
  /** Coup de marteau sur un chantier visible (bruitage discret). */
  'fx:hammer': undefined;
  // Interface → monde
  'ui:startPlacement': { defId: string };
  'ui:startMove': { entityId: number };
  'ui:confirmPlacement': undefined;
  'ui:cancelPlacement': undefined;
  'ui:setMode': WorldMode;
  'ui:plantMode': { cropId: string | null };
  'ui:focusEntity': { entityId: number };
  /** Centre la caméra sur une case (coordonnées de case, fractionnaires possibles). */
  'ui:focusTile': { x: number; y: number };
  'ui:modalOpen': boolean;
  /** Photo de la ville demandée (le monde répond par `world:photo`). */
  'ui:photo': undefined;
  'ui:dayNightMode': DayNightMode;
}

export interface AppContext {
  game: Game;
  bus: Emitter<AppEvents>;
  art: ArtLibrary;
  payments: PaymentProvider;
  sound: SoundFx;
  music: Music;
  haptics: Haptics;
  prefs: Preferences;
}
