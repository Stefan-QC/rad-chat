import { ENEMIES, ENEMY_KINDS, LEVEL_TOTALS, type EnemyCounts } from './levels';

/** Wat er in één level gebeurde; dit is precies wat naar de server gaat, die de score er zelf uit afleidt. */
export interface LevelResult {
  level: number;
  kills: Partial<EnemyCounts>;
  completed: boolean;
  /** Resterende gezondheid bij het voltooien (1 tot 100); anders 0. */
  health: number;
}

export interface DoomReport {
  levels: LevelResult[];
}

export const LEVEL_COMPLETE_POINTS = 500;
export const HEALTH_BONUS_PER_HP = 10;
export const ALL_ENEMIES_BONUS = 500;

export interface ScoreBreakdown {
  total: number;
  kills: number;
  killPoints: number;
  levelPoints: number;
  healthBonus: number;
  allEnemiesBonus: number;
  levelsCompleted: number;
}

/**
 * Berekent de score uit de uitslag per level, met de tabel uit de opdracht: gewone vijand 100, sterke 250, boss 1000,
 * level voltooid 500, 10 per resterend HP bij het voltooien en 500 voor alle vijanden van een level.
 * Dezelfde berekening staat in de database (private.game_score_doom); die is leidend.
 */
export function scoreRun(levels: LevelResult[]): ScoreBreakdown {
  const result: ScoreBreakdown = { total: 0, kills: 0, killPoints: 0, levelPoints: 0, healthBonus: 0, allEnemiesBonus: 0, levelsCompleted: 0 };
  for (const entry of levels) {
    const totals = LEVEL_TOTALS[entry.level - 1];
    let killedAll = true;
    for (const kind of ENEMY_KINDS) {
      const count = entry.kills[kind] ?? 0;
      result.kills += count;
      result.killPoints += count * ENEMIES[kind].points;
      if (count < totals[kind]) killedAll = false;
    }
    if (entry.completed) {
      result.levelPoints += LEVEL_COMPLETE_POINTS;
      result.healthBonus += entry.health * HEALTH_BONUS_PER_HP;
      result.levelsCompleted += 1;
    }
    if (killedAll) result.allEnemiesBonus += ALL_ENEMIES_BONUS;
  }
  result.total = result.killPoints + result.levelPoints + result.healthBonus + result.allEnemiesBonus;
  return result;
}
