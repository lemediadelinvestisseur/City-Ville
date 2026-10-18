import { getBuildingDef } from '@/data/buildings';
import { DAILY_TASK_COUNT, DAILY_TEMPLATES, dailyBonusReward, dailyTaskReward, type DailyTaskType } from '@/data/daily';
import type { DailyState, GameState, GameplayEvent } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

/** Jour local de l'appareil (AAAA-MM-JJ) : les défis changent à minuit, heure locale. */
export function localDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Prochain minuit local après `ms`. */
export function nextLocalMidnight(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
}

/** Hachage FNV-1a : tirage stable pour un joueur et un jour donnés. */
function seedOf(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tire les défis d'un jour parmi ceux accessibles (niveau, constructions possédées). */
export function drawDaily(state: GameState, day: string): DailyState {
  const built = new Set(state.entities.filter((e) => e.built).map((e) => getBuildingDef(e.defId).category));
  const eligible = DAILY_TEMPLATES.filter((t) => state.level >= t.minLevel && (!t.needs || built.has(t.needs)));
  const rand = random(seedOf(`${day}:${state.createdAt}`));
  const pool = [...eligible];
  const tasks = [];
  while (tasks.length < DAILY_TASK_COUNT && pool.length > 0) {
    const [template] = pool.splice(Math.floor(rand() * pool.length), 1);
    if (!template) break;
    tasks.push({
      type: template.type,
      target: template.target(state.level),
      count: 0,
      reward: dailyTaskReward(state.level),
      claimed: false,
    });
  }
  return { day, tasks, bonus: dailyBonusReward(state.level), bonusClaimed: false };
}

/** L'évènement fait-il avancer ce type de défi ? */
export function dailyMatches(type: string, event: GameplayEvent): boolean {
  return (type as DailyTaskType) === event.type;
}
