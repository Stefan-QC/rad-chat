import { SeededRandom } from '../games/random';
import {
  ENEMIES, ENEMY_KINDS, LEVEL_COUNT, levelAt,
  type EnemyCounts, type EnemyKind, type LevelDef, type PickupKind,
} from './levels';
import { castRay, isFree } from './raycast';
import { scoreRun, type DoomReport, type LevelResult } from './scoring';

export const PLAYER_RADIUS = 0.27;
export const WALK_SPEED = 3.2;
export const SPRINT_SPEED = 5.4;
export const KEY_TURN_SPEED = 2.4;
export const CLIP_SIZE = 15;
export const START_RESERVE = 45;
export const MAX_RESERVE = 120;
export const AMMO_PICKUP = 24;
export const HEALTH_PICKUP = 25;
export const MAX_HEALTH = 100;
export const FIRE_MS = 300;
export const RELOAD_MS = 1100;
export const WEAPON_DAMAGE = [22, 34] as const;
const SIGHT_RANGE = 14;
const NOISE_RANGE = 12;
const PICKUP_RANGE = 0.65;
const EXIT_RANGE = 1.7;
const FIREBALL_SPEED = 5.5;

export type DoomStatus = 'playing' | 'paused' | 'levelComplete' | 'dead' | 'victory';
export type EnemyState = 'idle' | 'chase' | 'attack' | 'pain' | 'dead';
export type GameEvent = 'shot' | 'dry' | 'reload' | 'hurt' | 'pickup' | 'kill' | 'enemyShot' | 'melee' | 'exit';

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  hp: number;
  state: EnemyState;
  /** Verstreken tijd in de huidige toestand of resterende tijd (afhankelijk van de toestand). */
  timer: number;
  cooldown: number;
  hurtFlash: number;
  /** Zodat een vijand maar één keer punten oplevert, hoe vaak hij ook geraakt wordt. */
  counted: boolean;
}

export interface Pickup {
  kind: PickupKind;
  x: number;
  y: number;
  taken: boolean;
}

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  life: number;
}

export interface GameInput {
  /** -1 (achteruit) tot 1 (vooruit). */
  forward: number;
  /** -1 (links) tot 1 (rechts). */
  strafe: number;
  sprint: boolean;
  /** Muisdraaiing in radialen sinds de vorige update; wordt na gebruik op nul gezet. */
  turn: number;
  /** -1 (links) tot 1 (rechts) voor draaien met de pijltjestoetsen. */
  keyTurn: number;
  firing: boolean;
}

const emptyCounts = (): EnemyCounts => ({ imp: 0, brute: 0, boss: 0 });

/**
 * De spelregels van de DOOM-geïnspireerde shooter, los van weergave en invoer: speler, vijanden met een eigen brein,
 * vuurballen, pickups, wapen en levels. Punten komen uit de uitslag per level (scoring.ts) en nooit uit losse tellers,
 * zodat een vijand of gebeurtenis nooit dubbel kan worden toegekend.
 */
export class DoomGame {
  status: DoomStatus = 'playing';
  levelIndex = 0;
  level!: LevelDef;
  player = { x: 0, y: 0, angle: 0, health: MAX_HEALTH, clip: CLIP_SIZE, reserve: START_RESERVE, fireTimer: 0, reloadTimer: 0, flash: 0, hurt: 0, bob: 0, kick: 0 };
  enemies: Enemy[] = [];
  pickups: Pickup[] = [];
  projectiles: Projectile[] = [];
  input: GameInput = { forward: 0, strafe: 0, sprint: false, turn: 0, keyTurn: 0, firing: false };
  message: { text: string; ttl: number } | null = null;
  /** Gebeurtenissen voor geluid en melding; de weergave leest ze en maakt de lijst leeg met drain(). */
  readonly events: GameEvent[] = [];

  private readonly rng: SeededRandom;
  private results: LevelResult[] = [];
  private kills: EnemyCounts = emptyCounts();
  private field: Int16Array | null = null;
  private fieldCell = -1;
  private fieldAge = 0;
  private nextId = 1;

  constructor(seed: number = (Math.random() * 2 ** 32) >>> 0) {
    this.rng = new SeededRandom(seed);
    this.loadLevel(0);
  }

  // ---------- level en stand ----------

  private loadLevel(index: number): void {
    this.levelIndex = index;
    this.level = levelAt(index);
    this.player.x = this.level.start.x;
    this.player.y = this.level.start.y;
    this.player.angle = this.level.start.angle;
    this.enemies = this.level.enemies.map(spawn => ({
      id: this.nextId++, kind: spawn.kind, x: spawn.x, y: spawn.y, hp: ENEMIES[spawn.kind].hp,
      state: 'idle', timer: 0, cooldown: 800 + this.rng.next() * 800, hurtFlash: 0, counted: false,
    }));
    this.pickups = this.level.pickups.map(spawn => ({ ...spawn, taken: false }));
    this.projectiles = [];
    this.kills = emptyCounts();
    this.field = null;
    this.fieldCell = -1;
    this.say(`Level ${index + 1}: ${this.level.name}`);
  }

  /** De uitslag per level tot nu toe, inclusief het level dat nog bezig is. */
  get levels(): LevelResult[] {
    if (this.status === 'levelComplete' || this.status === 'victory') return [...this.results];
    return [...this.results, { level: this.levelIndex + 1, kills: { ...this.kills }, completed: false, health: 0 }];
  }

  report(): DoomReport {
    return { levels: this.levels };
  }

  get score(): number {
    return scoreRun(this.levels).total;
  }

  get totalKills(): number {
    return this.levels.reduce((sum, entry) => sum + ENEMY_KINDS.reduce((count, kind) => count + (entry.kills[kind] ?? 0), 0), 0);
  }

  get killsThisLevel(): number {
    return ENEMY_KINDS.reduce((count, kind) => count + this.kills[kind], 0);
  }

  get enemiesLeft(): number {
    return this.enemies.filter(enemy => enemy.state !== 'dead').length;
  }

  /** Staat de speler dicht genoeg bij de uitgangsschakelaar om hem te gebruiken. */
  get nearExit(): boolean {
    return Math.hypot(this.level.exit.x + 0.5 - this.player.x, this.level.exit.y + 0.5 - this.player.y) <= EXIT_RANGE;
  }

  say(text: string, ttl = 2600): void {
    this.message = { text, ttl };
  }

  drain(): GameEvent[] {
    return this.events.splice(0, this.events.length);
  }

  pause(): void {
    if (this.status === 'playing') this.status = 'paused';
  }

  resume(): void {
    if (this.status === 'paused') this.status = 'playing';
  }

  // ---------- acties van de speler ----------

  reload(): boolean {
    const p = this.player;
    if (this.status !== 'playing' || p.reloadTimer > 0 || p.clip >= CLIP_SIZE || p.reserve <= 0) return false;
    p.reloadTimer = RELOAD_MS;
    this.events.push('reload');
    return true;
  }

  /** Schiet één kogel; raakt direct de eerste vijand op de lijn, tenzij een muur ervoor zit. */
  fire(): boolean {
    const p = this.player;
    if (this.status !== 'playing' || p.fireTimer > 0 || p.reloadTimer > 0) return false;
    if (p.clip <= 0) {
      this.events.push('dry');
      p.fireTimer = FIRE_MS;
      this.reload();
      return false;
    }
    p.clip -= 1;
    p.fireTimer = FIRE_MS;
    p.flash = 90;
    p.kick = 1;
    this.events.push('shot');
    this.wakeNearby();

    const angle = p.angle + (this.rng.next() - 0.5) * 0.02;
    const wall = castRay(this.level.grid, p.x, p.y, angle).dist;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let target: Enemy | null = null;
    let best = wall;
    for (const enemy of this.enemies) {
      if (enemy.state === 'dead') continue;
      const rx = enemy.x - p.x;
      const ry = enemy.y - p.y;
      const along = rx * dx + ry * dy;
      const across = Math.abs(-rx * dy + ry * dx);
      if (along > 0.2 && along < best && across <= ENEMIES[enemy.kind].radius * 0.9) {
        best = along;
        target = enemy;
      }
    }
    if (target) this.damageEnemy(target, WEAPON_DAMAGE[0] + this.rng.next() * (WEAPON_DAMAGE[1] - WEAPON_DAMAGE[0]));
    if (p.clip === 0) this.reload();
    return true;
  }

  /** Spatie: gebruikt de uitgangsschakelaar als die dichtbij is en sluit het level af. */
  interact(): boolean {
    if (this.status !== 'playing') return false;
    if (!this.nearExit) {
      this.say('Nothing to use here');
      return false;
    }
    this.results.push({ level: this.levelIndex + 1, kills: { ...this.kills }, completed: true, health: Math.max(1, Math.round(this.player.health)) });
    this.status = this.levelIndex + 1 >= LEVEL_COUNT ? 'victory' : 'levelComplete';
    this.events.push('exit');
    return true;
  }

  /** Gaat naar het volgende level nadat het vorige is voltooid; gezondheid en munitie gaan mee. */
  nextLevel(): boolean {
    if (this.status !== 'levelComplete') return false;
    this.status = 'playing';
    this.loadLevel(this.levelIndex + 1);
    return true;
  }

  // ---------- tijd ----------

  update(dtMs: number): void {
    if (this.status !== 'playing') return;
    const p = this.player;
    p.fireTimer = Math.max(0, p.fireTimer - dtMs);
    p.flash = Math.max(0, p.flash - dtMs);
    p.hurt = Math.max(0, p.hurt - dtMs);
    p.kick = Math.max(0, p.kick - dtMs / 160);
    if (this.message && (this.message.ttl -= dtMs) <= 0) this.message = null;

    if (p.reloadTimer > 0) {
      p.reloadTimer -= dtMs;
      if (p.reloadTimer <= 0) {
        p.reloadTimer = 0;
        const taken = Math.min(CLIP_SIZE - p.clip, p.reserve);
        p.clip += taken;
        p.reserve -= taken;
      }
    }
    this.movePlayer(dtMs);
    if (this.input.firing) this.fire();
    this.updateField(dtMs);
    for (const enemy of this.enemies) this.updateEnemy(enemy, dtMs);
    this.updateProjectiles(dtMs);
    this.collectPickups();
    if (p.health <= 0) {
      p.health = 0;
      this.status = 'dead';
    }
  }

  private movePlayer(dtMs: number): void {
    const p = this.player;
    const inp = this.input;
    p.angle += inp.turn + inp.keyTurn * KEY_TURN_SPEED * (dtMs / 1000);
    inp.turn = 0;
    const length = Math.hypot(inp.forward, inp.strafe);
    if (length === 0) return;
    const speed = (inp.sprint ? SPRINT_SPEED : WALK_SPEED) * (dtMs / 1000);
    const f = inp.forward / Math.max(1, length);
    const s = inp.strafe / Math.max(1, length);
    const dx = (Math.cos(p.angle) * f - Math.sin(p.angle) * s) * speed;
    const dy = (Math.sin(p.angle) * f + Math.cos(p.angle) * s) * speed;
    this.slide(p, dx, dy, PLAYER_RADIUS);
    p.bob += speed * 3;
  }

  /** Beweegt langs de muren in plaats van ertegenaan te blijven plakken. */
  private slide(entity: { x: number; y: number }, dx: number, dy: number, radius: number): void {
    if (isFree(this.level.grid, entity.x + dx, entity.y, radius)) entity.x += dx;
    if (isFree(this.level.grid, entity.x, entity.y + dy, radius)) entity.y += dy;
  }

  // ---------- vijanden ----------

  private lineClear(ax: number, ay: number, bx: number, by: number): boolean {
    const dist = Math.hypot(bx - ax, by - ay);
    return castRay(this.level.grid, ax, ay, Math.atan2(by - ay, bx - ax)).dist >= dist - 0.05;
  }

  /** Een schot wekt vijanden in de buurt. */
  private wakeNearby(): void {
    for (const enemy of this.enemies) {
      if (enemy.state === 'idle' && Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y) <= NOISE_RANGE) enemy.state = 'chase';
    }
  }

  private damageEnemy(enemy: Enemy, amount: number): void {
    if (enemy.state === 'dead') return;
    enemy.hp -= amount;
    enemy.hurtFlash = 140;
    if (enemy.hp <= 0) {
      enemy.state = 'dead';
      enemy.timer = 0;
      if (!enemy.counted) {
        enemy.counted = true;
        this.kills[enemy.kind] += 1;
        this.events.push('kill');
        const totals = this.level.totals;
        const all = ENEMY_KINDS.every(kind => this.kills[kind] >= totals[kind]);
        this.say(all ? 'All enemies destroyed! Find the exit switch.' : `${enemy.kind === 'boss' ? 'Boss' : enemy.kind === 'brute' ? 'Brute' : 'Imp'} destroyed`);
      }
      return;
    }
    if (enemy.state === 'idle') enemy.state = 'chase';
    if (this.rng.next() < (enemy.kind === 'boss' ? 0.08 : 0.45)) {
      enemy.state = 'pain';
      enemy.timer = 220;
    }
  }

  /** De afstand tot de speler in aantal stappen over het raster, zodat vijanden ook om hoeken heen komen. */
  private updateField(dtMs: number): void {
    this.fieldAge += dtMs;
    const cell = Math.floor(this.player.y) * this.level.width + Math.floor(this.player.x);
    if (this.field && cell === this.fieldCell && this.fieldAge < 500) return;
    const { width, height, grid } = this.level;
    const field = new Int16Array(width * height).fill(-1);
    const queue = [cell];
    field[cell] = 0;
    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head];
      const cx = current % width;
      const cy = Math.floor(current / width);
      for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height || grid[ny][nx] !== 0) continue;
        const index = ny * width + nx;
        if (field[index] === -1) {
          field[index] = field[current] + 1;
          queue.push(index);
        }
      }
    }
    this.field = field;
    this.fieldCell = cell;
    this.fieldAge = 0;
  }

  /** Het midden van de aangrenzende tegel die dichter bij de speler ligt. */
  private nextStep(enemy: Enemy): { x: number; y: number } | null {
    if (!this.field) return null;
    const { width, grid } = this.level;
    const cx = Math.floor(enemy.x);
    const cy = Math.floor(enemy.y);
    let best = this.field[cy * width + cx];
    let target: { x: number; y: number } | null = null;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (grid[ny]?.[nx] !== 0) continue;
      const value = this.field[ny * width + nx];
      if (value >= 0 && (best < 0 || value < best)) {
        best = value;
        target = { x: nx + 0.5, y: ny + 0.5 };
      }
    }
    return target;
  }

  private updateEnemy(enemy: Enemy, dtMs: number): void {
    const stats = ENEMIES[enemy.kind];
    enemy.hurtFlash = Math.max(0, enemy.hurtFlash - dtMs);
    if (enemy.state === 'dead') {
      enemy.timer += dtMs;
      return;
    }
    enemy.cooldown = Math.max(0, enemy.cooldown - dtMs);
    const p = this.player;
    const distance = Math.hypot(p.x - enemy.x, p.y - enemy.y);
    const sees = distance < SIGHT_RANGE && this.lineClear(enemy.x, enemy.y, p.x, p.y);
    const enraged = enemy.kind === 'boss' && enemy.hp < stats.hp * 0.5;

    if (enemy.state === 'idle') {
      if (sees) enemy.state = 'chase';
      return;
    }
    if (enemy.state === 'pain') {
      enemy.timer -= dtMs;
      if (enemy.timer <= 0) enemy.state = 'chase';
      return;
    }
    if (enemy.state === 'attack') {
      enemy.timer -= dtMs;
      if (enemy.timer <= 0) {
        this.attack(enemy, distance, enraged);
        enemy.state = 'chase';
        enemy.cooldown = stats.attackMs * (enraged ? 0.65 : 1);
      }
      return;
    }

    // achtervolgen
    if (sees && distance <= stats.range && enemy.cooldown <= 0) {
      enemy.state = 'attack';
      enemy.timer = stats.ranged ? 450 : 320;
      return;
    }
    const speed = stats.speed * (enraged ? 1.4 : 1) * (dtMs / 1000);
    let tx = p.x;
    let ty = p.y;
    if (!sees) {
      const step = this.nextStep(enemy);
      if (step) { tx = step.x; ty = step.y; }
    } else if (stats.ranged && distance < stats.range * 0.45) {
      return; // schutters blijven op afstand staan
    } else if (!stats.ranged && distance < stats.range * 0.8) {
      return;
    }
    const length = Math.hypot(tx - enemy.x, ty - enemy.y) || 1;
    this.slide(enemy, ((tx - enemy.x) / length) * speed, ((ty - enemy.y) / length) * speed, stats.radius * 0.8);
    this.separate(enemy);
  }

  /** Voorkomt dat vijanden op elkaar gaan staan. */
  private separate(enemy: Enemy): void {
    for (const other of this.enemies) {
      if (other === enemy || other.state === 'dead') continue;
      const dx = enemy.x - other.x;
      const dy = enemy.y - other.y;
      const gap = ENEMIES[enemy.kind].radius + ENEMIES[other.kind].radius;
      const distance = Math.hypot(dx, dy);
      if (distance > 0 && distance < gap) this.slide(enemy, (dx / distance) * 0.02, (dy / distance) * 0.02, ENEMIES[enemy.kind].radius * 0.8);
    }
  }

  private attack(enemy: Enemy, distance: number, enraged: boolean): void {
    const stats = ENEMIES[enemy.kind];
    const p = this.player;
    if (!stats.ranged) {
      if (distance <= stats.range + 0.35) {
        this.hurtPlayer(stats.damage * (0.8 + this.rng.next() * 0.4));
        this.events.push('melee');
      }
      return;
    }
    const base = Math.atan2(p.y - enemy.y, p.x - enemy.x);
    const shots = enemy.kind === 'boss' ? (enraged ? 3 : 2) : 1;
    for (let i = 0; i < shots; i += 1) {
      const angle = base + (i - (shots - 1) / 2) * 0.16 + (this.rng.next() - 0.5) * 0.04;
      this.projectiles.push({
        x: enemy.x, y: enemy.y, vx: Math.cos(angle) * FIREBALL_SPEED, vy: Math.sin(angle) * FIREBALL_SPEED,
        damage: stats.damage * (0.85 + this.rng.next() * 0.3), life: 4000,
      });
    }
    this.events.push('enemyShot');
  }

  private updateProjectiles(dtMs: number): void {
    const dt = dtMs / 1000;
    this.projectiles = this.projectiles.filter(ball => {
      ball.life -= dtMs;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      if (ball.life <= 0 || (this.level.grid[Math.floor(ball.y)]?.[Math.floor(ball.x)] ?? 1) !== 0) return false;
      if (Math.hypot(ball.x - this.player.x, ball.y - this.player.y) < 0.35) {
        this.hurtPlayer(ball.damage);
        return false;
      }
      return true;
    });
  }

  private hurtPlayer(amount: number): void {
    if (this.status !== 'playing') return;
    this.player.health = Math.max(0, this.player.health - amount);
    this.player.hurt = 320;
    this.events.push('hurt');
    if (this.player.health <= 0) this.status = 'dead';
  }

  private collectPickups(): void {
    const p = this.player;
    for (const pickup of this.pickups) {
      if (pickup.taken || Math.hypot(pickup.x - p.x, pickup.y - p.y) > PICKUP_RANGE) continue;
      if (pickup.kind === 'health') {
        if (p.health >= MAX_HEALTH) continue;
        p.health = Math.min(MAX_HEALTH, p.health + HEALTH_PICKUP);
        this.say(`Health +${HEALTH_PICKUP}`);
      } else {
        if (p.reserve >= MAX_RESERVE) continue;
        p.reserve = Math.min(MAX_RESERVE, p.reserve + AMMO_PICKUP);
        this.say(`Ammo +${AMMO_PICKUP}`);
      }
      pickup.taken = true;
      this.events.push('pickup');
    }
  }
}
