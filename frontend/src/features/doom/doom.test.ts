import { describe, expect, it } from 'vitest';
import migration from '../../../../supabase/migrations/016_games.sql?raw';
import {
  AMMO_PICKUP, CLIP_SIZE, DoomGame, FIRE_MS, HEALTH_PICKUP, MAX_HEALTH, RELOAD_MS, SPRINT_SPEED, START_RESERVE, WALK_SPEED,
} from './DoomGame';
import { ENEMIES, ENEMY_KINDS, EXIT_CELL, LEVEL_COUNT, LEVEL_TOTALS, generateLevel, levelAt, type CellType, type EnemyKind, type LevelDef } from './levels';
import { castRay, isFree } from './raycast';
import { scoreRun } from './scoring';

/** Alle vloertegels die vanaf een startpunt te bereiken zijn. */
function reachable(level: LevelDef, from: { x: number; y: number }): Set<string> {
  const seen = new Set<string>([`${Math.floor(from.x)},${Math.floor(from.y)}`]);
  const queue: [number, number][] = [[Math.floor(from.x), Math.floor(from.y)]];
  for (let head = 0; head < queue.length; head += 1) {
    const [x, y] = queue[head];
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (level.grid[ny]?.[nx] === 0 && !seen.has(`${nx},${ny}`)) { seen.add(`${nx},${ny}`); queue.push([nx, ny]); }
    }
  }
  return seen;
}

/** Een lege, open zaal van 14 bij 14 om gedrag in te testen, met de speler in het midden. */
function arena(game: DoomGame): void {
  const size = 14;
  const grid: CellType[][] = Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => (x === 0 || y === 0 || x === size - 1 || y === size - 1 ? 1 : 0)) as CellType[]);
  grid[7][size - 1] = EXIT_CELL;
  game.level = { ...game.level, grid, width: size, height: size, exit: { x: size - 1, y: 7 }, enemies: [], pickups: [] };
  game.enemies = [];
  game.pickups = [];
  game.projectiles = [];
  game.player.x = 3.5;
  game.player.y = 7.5;
  game.player.angle = 0;
  (game as unknown as { field: null }).field = null;
}

const addEnemy = (game: DoomGame, kind: EnemyKind, x: number, y: number, state: 'idle' | 'chase' = 'idle') => {
  game.enemies.push({ id: game.enemies.length + 100, kind, x, y, hp: ENEMIES[kind].hp, state, timer: 0, cooldown: 0, hurtFlash: 0, counted: false });
  return game.enemies[game.enemies.length - 1];
};

const run = (game: DoomGame, ms: number, step = 50) => { for (let t = 0; t < ms; t += step) game.update(step); };

describe('levels', () => {
  it.each([0, 1, 2])('level %i has exactly the enemies from the score table', index => {
    const level = levelAt(index);
    const counts = { imp: 0, brute: 0, boss: 0 };
    level.enemies.forEach(enemy => { counts[enemy.kind] += 1; });
    expect(counts).toEqual(LEVEL_TOTALS[index]);
    expect(level.totals).toEqual(LEVEL_TOTALS[index]);
  });

  it.each([0, 1, 2])('level %i is closed, connected and has a reachable exit', index => {
    const level = levelAt(index);
    for (let i = 0; i < level.width; i += 1) {
      expect(level.grid[0][i]).not.toBe(0);
      expect(level.grid[level.height - 1][i]).not.toBe(0);
      expect(level.grid[i][0]).not.toBe(0);
      expect(level.grid[i][level.width - 1]).not.toBe(0);
    }
    const reach = reachable(level, level.start);
    expect(level.grid[Math.floor(level.start.y)][Math.floor(level.start.x)]).toBe(0);
    expect(level.grid[level.exit.y][level.exit.x]).toBe(EXIT_CELL);
    const nextToExit = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => reach.has(`${level.exit.x + dx},${level.exit.y + dy}`));
    expect(nextToExit).toBe(true);
    for (const thing of [...level.enemies, ...level.pickups]) {
      expect(reach.has(`${Math.floor(thing.x)},${Math.floor(thing.y)}`)).toBe(true);
    }
  });

  it('keeps enemies away from the start and gives every level its supplies', () => {
    for (let index = 0; index < LEVEL_COUNT; index += 1) {
      const level = levelAt(index);
      expect(level.enemies.every(enemy => Math.hypot(enemy.x - level.start.x, enemy.y - level.start.y) > 3)).toBe(true);
      expect(level.pickups.filter(p => p.kind === 'health').length).toBeGreaterThanOrEqual(3);
      expect(level.pickups.filter(p => p.kind === 'ammo').length).toBeGreaterThanOrEqual(4);
    }
    expect(levelAt(2).enemies.filter(enemy => enemy.kind === 'boss')).toHaveLength(1);
  });

  it('builds the same level every time', () => {
    expect(generateLevel(1).grid).toEqual(generateLevel(1).grid);
    expect(generateLevel(1).enemies).toEqual(generateLevel(1).enemies);
  });

  it('uses the same enemy table as the database', () => {
    const found = [...migration.matchAll(/when (\d) then '\{"imp": (\d+), "brute": (\d+), "boss": (\d+)\}'::jsonb/g)].map(m => ({ imp: +m[2], brute: +m[3], boss: +m[4] }));
    expect(found).toEqual([...LEVEL_TOTALS]);
  });
});

describe('scoring', () => {
  it('awards the points from the table', () => {
    expect(scoreRun([{ level: 1, kills: { imp: 1 }, completed: false, health: 0 }]).total).toBe(100);
    expect(scoreRun([{ level: 2, kills: { brute: 1 }, completed: false, health: 0 }]).killPoints).toBe(250);
    expect(scoreRun([{ level: 3, kills: { boss: 1 }, completed: false, health: 0 }]).killPoints).toBe(1000);
  });

  it('adds 500 for completing a level and 10 per remaining HP', () => {
    const score = scoreRun([{ level: 1, kills: { imp: 2 }, completed: true, health: 70 }]);
    expect(score.levelPoints).toBe(500);
    expect(score.healthBonus).toBe(700);
    expect(score.total).toBe(200 + 500 + 700);
  });

  it('adds 500 for destroying every enemy of a level', () => {
    const score = scoreRun([{ level: 1, kills: { imp: 6 }, completed: false, health: 0 }]);
    expect(score.allEnemiesBonus).toBe(500);
    expect(scoreRun([{ level: 1, kills: { imp: 5 }, completed: false, health: 0 }]).allEnemiesBonus).toBe(0);
  });

  it('matches the example in the database test', () => {
    const score = scoreRun([
      { level: 1, kills: { imp: 6 }, completed: true, health: 80 },
      { level: 2, kills: { imp: 2, brute: 1 }, completed: false, health: 0 },
    ]);
    expect(score.total).toBe(600 + 500 + 800 + 500 + 200 + 250);
    expect(score.levelsCompleted).toBe(1);
  });
});

describe('raycasting', () => {
  const grid: CellType[][] = [[1, 1, 1, 1], [1, 0, 0, 1], [1, 0, 0, 1], [1, 1, 1, 1]];

  it('measures the distance to a wall', () => {
    expect(castRay(grid, 1.5, 1.5, 0).dist).toBeCloseTo(1.5, 3);
    expect(castRay(grid, 1.5, 1.5, Math.PI / 2).dist).toBeCloseTo(1.5, 3);
    expect(castRay(grid, 2.5, 1.5, Math.PI).dist).toBeCloseTo(1.5, 3);
  });

  it('treats everything outside the grid as a wall and reports the wall type', () => {
    const hit = castRay(grid, 1.5, 1.5, -Math.PI / 4);
    expect(hit.cell).toBe(1);
    expect(hit.wallX).toBeGreaterThanOrEqual(0);
    expect(hit.wallX).toBeLessThan(1);
  });

  it('knows which spots are free', () => {
    expect(isFree(grid, 1.5, 1.5, 0.27)).toBe(true);
    expect(isFree(grid, 1.1, 1.5, 0.27)).toBe(false);
    expect(isFree(grid, 5, 5, 0.1)).toBe(false);
  });
});

describe('player', () => {
  it('starts with full health, a full clip and reserve ammo', () => {
    const game = new DoomGame(1);
    expect(game.player.health).toBe(MAX_HEALTH);
    expect(game.player.clip).toBe(CLIP_SIZE);
    expect(game.player.reserve).toBe(START_RESERVE);
    expect(game.status).toBe('playing');
    expect(game.levelIndex).toBe(0);
  });

  it('walks, sprints faster and cannot walk through walls', () => {
    const game = new DoomGame(1);
    arena(game);
    game.input.forward = 1;
    game.update(1000);
    expect(game.player.x - 3.5).toBeCloseTo(WALK_SPEED, 1);
    arena(game);
    game.input.sprint = true;
    game.update(1000);
    expect(game.player.x - 3.5).toBeCloseTo(SPRINT_SPEED, 1);
    for (let i = 0; i < 40; i += 1) game.update(100);
    expect(game.player.x).toBeLessThan(13);
    expect(isFree(game.level.grid, game.player.x, game.player.y, 0.2)).toBe(true);
  });

  it('strafes and turns with the mouse', () => {
    const game = new DoomGame(1);
    arena(game);
    game.input.strafe = 1;
    game.update(500);
    expect(game.player.y).toBeGreaterThan(7.5);
    game.input.strafe = 0;
    game.input.turn = 0.5;
    game.update(16);
    expect(game.player.angle).toBeCloseTo(0.5, 3);
    expect(game.input.turn).toBe(0);
  });

  it('does nothing while paused', () => {
    const game = new DoomGame(1);
    arena(game);
    game.pause();
    game.input.forward = 1;
    game.update(1000);
    expect(game.player.x).toBe(3.5);
    game.resume();
    game.update(500);
    expect(game.player.x).toBeGreaterThan(3.5);
  });
});

describe('weapon', () => {
  it('uses one bullet per shot and fires at a limited rate', () => {
    const game = new DoomGame(1);
    arena(game);
    expect(game.fire()).toBe(true);
    expect(game.player.clip).toBe(CLIP_SIZE - 1);
    expect(game.fire()).toBe(false);
    game.update(FIRE_MS + 1);
    expect(game.fire()).toBe(true);
  });

  it('reloads from the reserve and cannot shoot while reloading', () => {
    const game = new DoomGame(1);
    arena(game);
    game.fire();
    game.update(FIRE_MS + 1);
    expect(game.reload()).toBe(true);
    expect(game.fire()).toBe(false);
    run(game, RELOAD_MS + 100);
    expect(game.player.clip).toBe(CLIP_SIZE);
    expect(game.player.reserve).toBe(START_RESERVE - 1);
  });

  it('does not reload with a full clip or without reserve', () => {
    const game = new DoomGame(1);
    arena(game);
    expect(game.reload()).toBe(false);
    game.player.clip = 3;
    game.player.reserve = 0;
    expect(game.reload()).toBe(false);
  });

  it('reloads by itself when the clip runs empty', () => {
    const game = new DoomGame(1);
    arena(game);
    game.player.clip = 1;
    game.fire();
    expect(game.player.reloadTimer).toBeGreaterThan(0);
    run(game, RELOAD_MS + 100);
    expect(game.player.clip).toBe(CLIP_SIZE);
  });

  it('hits the enemy in the line of fire and kills it', () => {
    const game = new DoomGame(1);
    arena(game);
    const imp = addEnemy(game, 'imp', 8.5, 7.5);
    for (let shot = 0; shot < 4 && imp.state !== 'dead'; shot += 1) {
      game.fire();
      game.update(FIRE_MS + 1);
    }
    expect(imp.state).toBe('dead');
    expect(game.killsThisLevel).toBe(1);
    expect(game.score).toBe(100);
  });

  it('misses an enemy that is not in the line of fire', () => {
    const game = new DoomGame(1);
    arena(game);
    const imp = addEnemy(game, 'imp', 8.5, 10.5);
    game.fire();
    expect(imp.hp).toBe(ENEMIES.imp.hp);
  });

  it('is blocked by walls', () => {
    const game = new DoomGame(1);
    arena(game);
    for (let y = 1; y < 13; y += 1) game.level.grid[y][6] = 1;
    const imp = addEnemy(game, 'imp', 9.5, 7.5);
    game.fire();
    expect(imp.hp).toBe(ENEMIES.imp.hp);
  });

  it('never awards the same enemy twice', () => {
    const game = new DoomGame(1);
    arena(game);
    const imp = addEnemy(game, 'imp', 6.5, 7.5);
    imp.hp = 1;
    game.fire();
    expect(imp.state).toBe('dead');
    game.update(FIRE_MS + 1);
    game.fire();
    game.update(FIRE_MS + 1);
    game.fire();
    expect(game.killsThisLevel).toBe(1);
    expect(game.score).toBe(100);
  });

  it('awards the strong enemy and the boss their own points', () => {
    const game = new DoomGame(1);
    arena(game);
    addEnemy(game, 'brute', 6.5, 7.5).hp = 1;
    game.fire();
    expect(game.score).toBe(250);
    game.update(FIRE_MS + 1);
    addEnemy(game, 'boss', 9.5, 7.5).hp = 1;
    game.fire();
    expect(game.score).toBe(250 + 1000);
  });
});

describe('enemies', () => {
  it('stay asleep until they see the player', () => {
    const game = new DoomGame(1);
    arena(game);
    for (let y = 1; y < 13; y += 1) game.level.grid[y][6] = 1;
    const imp = addEnemy(game, 'imp', 10.5, 7.5);
    run(game, 1000);
    expect(imp.state).toBe('idle');
  });

  it('wake up and chase when the player is in sight', () => {
    const game = new DoomGame(1);
    arena(game);
    const brute = addEnemy(game, 'brute', 10.5, 7.5);
    const before = Math.hypot(brute.x - game.player.x, brute.y - game.player.y);
    run(game, 1500);
    expect(Math.hypot(brute.x - game.player.x, brute.y - game.player.y)).toBeLessThan(before);
  });

  it('are woken by gunfire from behind a wall', () => {
    const game = new DoomGame(1);
    arena(game);
    for (let y = 1; y < 13; y += 1) game.level.grid[y][6] = 1;
    const imp = addEnemy(game, 'imp', 10.5, 7.5);
    game.fire();
    expect(imp.state).toBe('chase');
  });

  it('find their way around a wall to the player', () => {
    const game = new DoomGame(1);
    arena(game);
    for (let y = 1; y < 11; y += 1) game.level.grid[y][6] = 1;
    const brute = addEnemy(game, 'brute', 9.5, 3.5, 'chase');
    run(game, 9000);
    expect(Math.hypot(brute.x - game.player.x, brute.y - game.player.y)).toBeLessThan(2);
  });

  it('brutes hurt the player at close range', () => {
    const game = new DoomGame(1);
    arena(game);
    addEnemy(game, 'brute', 4.4, 7.5, 'chase');
    run(game, 1500);
    expect(game.player.health).toBeLessThan(MAX_HEALTH);
  });

  it('imps shoot fireballs that hurt the player', () => {
    const game = new DoomGame(1);
    arena(game);
    addEnemy(game, 'imp', 9.5, 7.5, 'chase');
    run(game, 4000);
    expect(game.player.health).toBeLessThan(MAX_HEALTH);
  });

  it('fireballs stop at walls', () => {
    const game = new DoomGame(1);
    arena(game);
    game.projectiles.push({ x: 8, y: 2, vx: 0, vy: -6, damage: 10, life: 4000 });
    game.update(1000);
    expect(game.projectiles).toHaveLength(0);
    expect(game.player.health).toBe(MAX_HEALTH);
  });

  it('the boss fights back with several fireballs', () => {
    const game = new DoomGame(1);
    arena(game);
    addEnemy(game, 'boss', 11.5, 7.5, 'chase').cooldown = 0;
    run(game, 1500);
    expect(game.projectiles.length + (MAX_HEALTH - game.player.health > 0 ? 1 : 0)).toBeGreaterThan(1);
  });
});

describe('health, ammo and dying', () => {
  it('picks up health only when needed and only once', () => {
    const game = new DoomGame(1);
    arena(game);
    game.pickups.push({ kind: 'health', x: 3.7, y: 7.5, taken: false });
    game.update(16);
    expect(game.pickups[0].taken).toBe(false);
    game.player.health = 40;
    game.update(16);
    expect(game.player.health).toBe(40 + HEALTH_PICKUP);
    expect(game.pickups[0].taken).toBe(true);
    game.update(16);
    expect(game.player.health).toBe(40 + HEALTH_PICKUP);
  });

  it('picks up ammo up to a maximum', () => {
    const game = new DoomGame(1);
    arena(game);
    game.pickups.push({ kind: 'ammo', x: 3.7, y: 7.5, taken: false });
    game.update(16);
    expect(game.player.reserve).toBe(START_RESERVE + AMMO_PICKUP);
  });

  it('ends the game when the health reaches zero and keeps the points', () => {
    const game = new DoomGame(1);
    arena(game);
    addEnemy(game, 'imp', 6.5, 7.5).hp = 1;
    game.fire();
    game.player.health = 1;
    addEnemy(game, 'brute', 3.9, 7.5, 'chase');
    run(game, 3000);
    expect(game.status).toBe('dead');
    expect(game.player.health).toBe(0);
    expect(game.report().levels).toEqual([{ level: 1, kills: { imp: 1, brute: 0, boss: 0 }, completed: false, health: 0 }]);
    expect(game.score).toBe(100);
  });
});

describe('finishing levels', () => {
  const toExit = (game: DoomGame) => {
    game.player.x = game.level.exit.x + 0.5 + (game.level.exit.x > game.level.start.x ? -1 : 1);
    game.player.y = game.level.exit.y + 0.5;
  };

  it('needs the exit switch to be close', () => {
    const game = new DoomGame(1);
    expect(game.interact()).toBe(false);
    expect(game.status).toBe('playing');
  });

  it('completes the level with a health bonus and continues with the next one', () => {
    const game = new DoomGame(1);
    arena(game);
    game.player.x = 12.5;
    game.player.y = 7.5;
    game.player.health = 60;
    expect(game.nearExit).toBe(true);
    expect(game.interact()).toBe(true);
    expect(game.status).toBe('levelComplete');
    expect(game.score).toBe(500 + 600);
    expect(game.report().levels).toEqual([{ level: 1, kills: { imp: 0, brute: 0, boss: 0 }, completed: true, health: 60 }]);
    expect(game.nextLevel()).toBe(true);
    expect(game.levelIndex).toBe(1);
    expect(game.player.health).toBe(60);
    expect(game.enemies).toHaveLength(9);
  });

  it('wins after the last level and reports all three', () => {
    const game = new DoomGame(1);
    for (let i = 0; i < LEVEL_COUNT; i += 1) {
      toExit(game);
      expect(game.interact()).toBe(true);
      if (i < LEVEL_COUNT - 1) game.nextLevel();
    }
    expect(game.status).toBe('victory');
    const levels = game.report().levels;
    expect(levels.map(l => l.level)).toEqual([1, 2, 3]);
    expect(levels.every(l => l.completed)).toBe(true);
    expect(game.score).toBe(3 * 500 + 3 * 100 * 10);
  });

  it('produces reports in the shape the server accepts', () => {
    const game = new DoomGame(1);
    const check = () => {
      const levels = game.report().levels;
      levels.forEach((entry, i) => {
        expect(entry.level).toBe(i + 1);
        if (i < levels.length - 1) expect(entry.completed).toBe(true);
        for (const kind of ENEMY_KINDS) expect(entry.kills[kind] ?? 0).toBeLessThanOrEqual(LEVEL_TOTALS[i][kind]);
        if (entry.completed) expect(entry.health).toBeGreaterThanOrEqual(1);
      });
    };
    check();
    toExit(game);
    game.interact();
    check();
    game.nextLevel();
    check();
  });
});
