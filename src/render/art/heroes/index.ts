import { HEROES as FARM } from './farm';
import { HEROES as HOUSES } from './houses';
import { HEROES as INDUSTRY } from './industry';
import { HEROES as LANDMARKS } from './landmarks';
import { HEROES as SERVICES } from './services';
import { HEROES as SHOPS } from './shops';
import type { Hero } from './types';

export type { Hero } from './types';

/** Tous les bâtiments redessinés à la main, par identifiant de construction. */
export const HEROES: Readonly<Record<string, Hero>> = {
  ...HOUSES,
  ...SHOPS,
  ...LANDMARKS,
  ...SERVICES,
  ...INDUSTRY,
  ...FARM,
};
