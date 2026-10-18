import { BUILDINGS, getBuildingDef } from '@/data/buildings';
import { CROPS, TRIPS } from '@/data/crops';
import type { Clock } from './game';
import { Game } from './game';
import { CHUNKS_PER_SIDE } from './grid';
import { createNewGame } from './newGame';
import type { BuildingDef, Entity } from './types';

/**
 * Joueur automatique pour équilibrer la progression : il se connecte quelques
 * fois par jour, récolte tout ce qu'il peut avec son énergie, relance cultures
 * et bateaux, puis investit ses pièces. Sert à calibrer la courbe d'XP
 * (voir balance.test.ts) ; ce n'est pas un joueur optimal, plutôt un joueur
 * régulier et appliqué.
 */

class SimClock implements Clock {
  constructor(public t: number) {}
  now(): number {
    return this.t;
  }
}

export interface SimOptions {
  days: number;
  /** Heures de connexion dans la journée. */
  sessionHours: readonly number[];
}

export interface SimResult {
  /** Heure (depuis le début) d'atteinte de chaque niveau (index = niveau). */
  levelAtHour: number[];
  /** XP cumulée à la fin de chaque session : [heure, xp]. */
  xpTimeline: Array<[number, number]>;
  game: Game;
}

const DEFAULT: SimOptions = { days: 21, sessionHours: [8, 12.5, 18.5, 22] };

export function simulate(options: Partial<SimOptions> = {}): SimResult {
  const { days, sessionHours } = { ...DEFAULT, ...options };
  const start = Date.UTC(2026, 0, 5, 0, 0, 0);
  const clock = new SimClock(start + (sessionHours[0] ?? 8) * 3600_000);
  const game = new Game(createNewGame(clock.now()), clock);
  game.state.tutorial.introSeen = true;
  const levelAtHour: number[] = [0, 0];
  const xpTimeline: Array<[number, number]> = [];
  const hourNow = () => (clock.t - start) / 3600_000 - (sessionHours[0] ?? 8);
  game.events.on('levelUp', ({ level }) => {
    levelAtHour[level] = hourNow();
  });

  const sessions: number[] = [];
  for (let d = 0; d < days; d++) for (const h of sessionHours) sessions.push(start + (d * 24 + h) * 3600_000);
  for (let i = 0; i < sessions.length; i++) {
    clock.t = sessions[i] ?? clock.t;
    const next = sessions[i + 1] ?? clock.t + 12 * 3600_000;
    playSession(game, clock, (next - clock.t) / 1000);
    xpTimeline.push([hourNow(), game.state.xp]);
  }
  return { levelAtHour, xpTimeline, game };
}

/** Une connexion : quelques passes d'actions, avec un peu de temps qui s'écoule. */
function playSession(game: Game, clock: SimClock, gapSec: number): void {
  for (let pass = 0; pass < 6; pass++) {
    const did = collectAll(game, gapSec) + invest(game);
    // Le joueur reste quelques minutes : les petits chantiers se terminent.
    clock.t += 90_000;
    if (did === 0 && pass > 1) break;
  }
}

function collectAll(game: Game, gapSec: number): number {
  let count = 0;
  for (const entity of [...game.state.entities]) {
    if (!game.isTileUnlocked(entity.x, entity.y)) continue;
    const action = game.primaryAction(entity);
    let ok = false;
    switch (action.type) {
      case 'finishBuild':
        ok = game.finishBuild(entity.id).ok;
        break;
      case 'collectRent':
        ok = game.collectRent(entity.id).ok;
        break;
      case 'harvest':
        ok = game.harvest(entity.id).ok;
        break;
      case 'collectBusiness':
        ok = game.collectBusiness(entity.id).ok;
        break;
      case 'unloadBoat':
        ok = game.unloadBoat(entity.id).ok;
        break;
      case 'supply':
        ok = game.supply(entity.id).ok;
        break;
      case 'plant': {
        const crop = bestFitting(
          CROPS.map((c) => ({ id: c.id, sec: c.growSec, level: c.requires?.level ?? 1, cost: c.cost })),
          game,
          gapSec,
        );
        if (crop) ok = game.plant(entity.id, crop).ok;
        break;
      }
      case 'sendBoat': {
        const def = getBuildingDef(entity.defId);
        const tier = def.category === 'port' ? def.boatTier : 0;
        const trip = bestFitting(
          TRIPS.filter((t) => t.boatTier <= tier).map((t) => ({
            id: t.id,
            sec: t.durationSec,
            level: t.requires?.level ?? 1,
            cost: t.cost,
          })),
          game,
          gapSec,
        );
        if (trip) ok = game.sendBoat(entity.id, trip).ok;
        break;
      }
      default:
        break;
    }
    if (ok) count++;
  }
  return count;
}

/** Option la plus longue qui tient avant la prochaine connexion (sinon la plus courte). */
function bestFitting(
  options: Array<{ id: string; sec: number; level: number; cost: number }>,
  game: Game,
  gapSec: number,
): string | null {
  const available = options.filter((o) => o.level <= game.state.level && o.cost <= game.state.coins);
  if (available.length === 0) return null;
  const fitting = available.filter((o) => o.sec <= gapSec);
  const pool = fitting.length > 0 ? fitting : available;
  pool.sort((a, b) => (fitting.length > 0 ? b.sec - a.sec : a.sec - b.sec));
  return pool[0]?.id ?? null;
}

const count = (game: Game, filter: (def: BuildingDef, e: Entity) => boolean): number =>
  game.state.entities.filter((e) => filter(getBuildingDef(e.defId), e)).length;

/** Meilleur bâtiment achetable d'une catégorie (le plus cher qu'on peut se payer). */
function bestAffordable(game: Game, category: BuildingDef['category'], reserve: number): BuildingDef | null {
  const options = BUILDINGS.filter(
    (def) =>
      def.category === category &&
      def.inShop !== false &&
      !def.cost.cash &&
      game.checkPurchase(def).ok &&
      (def.cost.coins ?? 0) + reserve <= game.state.coins,
  );
  options.sort((a, b) => (b.cost.coins ?? 0) - (a.cost.coins ?? 0));
  return options[0] ?? null;
}

function placeSomewhere(game: Game, def: BuildingDef): boolean {
  for (let y = 0; y < 40; y++) {
    for (let x = 0; x < 40; x++) {
      if (game.checkPlacement(def, x, y) === null) return game.place(def.id, x, y).ok;
    }
  }
  return false;
}

function tryExpand(game: Game): boolean {
  for (let cy = 0; cy < CHUNKS_PER_SIDE; cy++) {
    for (let cx = 0; cx < CHUNKS_PER_SIDE; cx++) {
      if (game.expansionInfo(cx, cy).status === 'purchasable' && game.buyExpansion(cx, cy).ok) return true;
    }
  }
  return false;
}

/** Dépense les pièces : services si la population plafonne, sinon un mélange équilibré. */
function invest(game: Game): number {
  let bought = 0;
  for (let guard = 0; guard < 30; guard++) {
    const level = game.state.level;
    const reserve = 200 + level * 40;
    const derived = game.derived();
    const houses = count(game, (d) => d.category === 'house');
    const businesses = count(game, (d) => d.category === 'business');
    const plots = count(game, (d) => d.category === 'farm');
    const ports = count(game, (d) => d.category === 'port');
    const decorations = count(game, (d, e) => d.category === 'decoration' && !e.starter);

    const storages = count(game, (d) => d.category === 'storage');
    let def: BuildingDef | null = null;
    const houseNext = bestAffordable(game, 'house', reserve);
    const popRoom = derived.popCap - derived.populationProjected;
    const houseFits = !!houseNext && houseNext.category === 'house' && popRoom >= houseNext.population;
    if (popRoom < 30) {
      // Population au plafond : on économise pour un service.
      def = bestAffordable(game, 'community', reserve);
      if (!def && businesses * 2 >= houses) break;
    }
    if (!def && game.state.goods > derived.goodsCap * 0.85 && storages < 1 + Math.floor(level / 4))
      def = bestAffordable(game, 'storage', reserve);
    if (!def && plots < 4 + Math.floor(level / 2)) def = bestAffordable(game, 'farm', reserve);
    if (!def && ports < 1 + Math.floor(level / 12)) def = bestAffordable(game, 'port', reserve);
    if (!def && businesses * 2 < houses) def = bestAffordable(game, 'business', reserve);
    if (!def && houseFits) def = houseNext;
    if (!def && decorations < houses) def = bestAffordable(game, 'decoration', reserve);
    if (!def) {
      if (tryExpand(game)) {
        bought++;
        continue;
      }
      break;
    }
    if (!placeSomewhere(game, def)) {
      if (!tryExpand(game)) break;
    }
    bought++;
  }
  return bought;
}
