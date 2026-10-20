import { describe, expect, it } from 'vitest';
import { getBuildingDef } from '@/data/buildings';
import { Game, type Clock } from './game';
import { SAVE_VERSION, createNewGame } from './newGame';
import { deserialize } from './save';
import type { Entity, GameState } from './types';

const NOW = 1_700_000_000_000;
const clock: Clock = { now: () => NOW };

/** Sauvegarde brute au format v7 (avant les emprises agrandies) construite à partir d'un état donné. */
function v7File(state: GameState): string {
  return JSON.stringify({ version: 7, savedAt: NOW, state: { ...state, version: 7 } });
}

/** Aucune case occupée deux fois avec les emprises actuelles. */
function expectNoOverlap(entities: readonly Entity[]): void {
  const seen = new Set<string>();
  for (const entity of entities) {
    const { size } = getBuildingDef(entity.defId);
    for (let dx = 0; dx < size.w; dx++) {
      for (let dy = 0; dy < size.d; dy++) {
        const key = `${entity.x + dx},${entity.y + dy}`;
        expect(seen.has(key), `case ${key} occupée deux fois`).toBe(false);
        seen.add(key);
      }
    }
  }
}

/** Premier emplacement libre (balayage) pour une construction donnée. */
function freeSpot(game: Game, defId: string): { x: number; y: number } {
  const def = getBuildingDef(defId);
  for (let y = 0; y < 40; y++) {
    for (let x = 0; x < 40; x++) {
      if (game.checkPlacement(def, x, y) === null) return { x, y };
    }
  }
  throw new Error('Aucun emplacement libre');
}

describe('migration v7 → v8 (emprises agrandies)', () => {
  it('remonte l’hôtel de ville de départ et décale ses massifs de fleurs, comme dans une nouvelle partie', () => {
    const fresh = createNewGame(NOW);
    const state = structuredClone(fresh);
    // Ville de départ de la v7 : hôtel de ville en (20,17), fleurs en (23,17) et (23,19).
    const hall = state.entities.find((e) => e.defId === 'town_hall')!;
    hall.y = 17;
    const flowers = state.entities.filter((e) => e.defId === 'flower_bed' && e.x === 24);
    for (const f of flowers) f.x = 23;
    const restored = deserialize(v7File(state))!;
    expect(restored.version).toBe(SAVE_VERSION);
    expect(restored.entities.find((e) => e.id === hall.id)).toMatchObject({ x: 20, y: 16 });
    for (const f of flowers) expect(restored.entities.find((e) => e.id === f.id)).toMatchObject({ x: 24, y: f.y });
    expect(restored.entities).toHaveLength(state.entities.length);
    expect(restored.coins).toBe(state.coins);
    expectNoOverlap(restored.entities);
    const game = new Game(restored, clock);
    expect(game.isConnected(game.state.entities.find((e) => e.id === hall.id)!)).toBe(true);
  });

  it('décale une construction agrandie vers la place libre la plus proche en gardant son état', () => {
    const game = new Game(createNewGame(NOW), clock);
    // Zone de 6 × 6 entièrement libre : la bibliothèque (ex-2 × 2) y est posée avec une route à côté.
    const area = freeSpot(game, 'stadium');
    const state = structuredClone(game.state);
    const construction = { startedAt: NOW - 1000, endsAt: NOW + 60_000 };
    state.entities.push(
      { id: 900, defId: 'library', x: area.x + 1, y: area.y + 1, built: false, construction },
      { id: 901, defId: 'road', x: area.x + 3, y: area.y + 1, built: true },
    );
    const restored = deserialize(v7File(state))!;
    const library = restored.entities.find((e) => e.id === 900)!;
    // La nouvelle emprise 3 × 3 recouvrait la route : un pas vers l'ouest suffit.
    expect(library).toMatchObject({ x: area.x, y: area.y + 1, built: false, construction });
    expect(restored.entities.some((e) => e.id === 901)).toBe(true);
    expect(restored.coins).toBe(state.coins);
    expectNoOverlap(restored.entities);
    const reloaded = new Game(restored, clock);
    expect(reloaded.checkPlacement(getBuildingDef('library'), library.x, library.y, library.id)).toBeNull();
  });

  it('retire et rembourse une construction qui ne trouve plus de place', () => {
    const state = createNewGame(NOW);
    // Une seule zone débloquée (16..23 × 16..23), remplie de routes autour d'un ancien stade 4 × 4.
    state.unlockedChunks = ['2,2'];
    const entities: Entity[] = [{ id: 1, defId: 'stadium', x: 16, y: 16, built: true }];
    let id = 2;
    for (let y = 16; y < 24; y++) {
      for (let x = 16; x < 24; x++) {
        if (x < 20 && y < 20) continue;
        entities.push({ id: id++, defId: 'road', x, y, built: true });
      }
    }
    state.entities = entities;
    state.nextEntityId = id;
    const restored = deserialize(v7File(state))!;
    expect(restored.entities.some((e) => e.defId === 'stadium')).toBe(false);
    expect(restored.entities).toHaveLength(entities.length - 1);
    expect(restored.coins).toBe(state.coins + (getBuildingDef('stadium').cost.coins ?? 0));
    expect(() => new Game(restored, clock)).not.toThrow();
  });

  it('ne touche pas une construction qui tient encore à sa place', () => {
    const game = new Game(createNewGame(NOW), clock);
    const area = freeSpot(game, 'airport');
    const state = structuredClone(game.state);
    state.entities.push({ id: 900, defId: 'airport', x: area.x, y: area.y, built: true });
    const restored = deserialize(v7File(state))!;
    expect(restored.entities.find((e) => e.id === 900)).toMatchObject({ x: area.x, y: area.y });
    expect(restored.coins).toBe(state.coins);
  });
});
