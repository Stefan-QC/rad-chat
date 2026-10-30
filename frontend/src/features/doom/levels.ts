import { SeededRandom } from '../games/random';

export type EnemyKind = 'imp' | 'brute' | 'boss';
export type PickupKind = 'health' | 'ammo';

export interface EnemyStats {
  hp: number;
  /** Tegels per seconde. */
  speed: number;
  damage: number;
  /** Op welke afstand de vijand aanvalt. */
  range: number;
  attackMs: number;
  /** Aanvalsrichting: een vuurbal (ranged) of een klap (melee). */
  ranged: boolean;
  radius: number;
  /** Grootte van de afbeelding ten opzichte van een tegel. */
  scale: number;
  points: number;
}

/** Eén tabel met de vijanden, met de punten uit de opdracht: gewoon 100, sterk 250 en boss 1000. */
export const ENEMIES: Record<EnemyKind, EnemyStats> = {
  imp: { hp: 50, speed: 1.6, damage: 8, range: 9, attackMs: 1500, ranged: true, radius: 0.32, scale: 0.85, points: 100 },
  brute: { hp: 150, speed: 2.2, damage: 18, range: 1.25, attackMs: 950, ranged: false, radius: 0.4, scale: 1.05, points: 250 },
  boss: { hp: 600, speed: 1.3, damage: 14, range: 11, attackMs: 1000, ranged: true, radius: 0.6, scale: 1.7, points: 1000 },
};

export const ENEMY_KINDS: readonly EnemyKind[] = ['imp', 'brute', 'boss'];

export type EnemyCounts = Record<EnemyKind, number>;

/**
 * Hoeveel vijanden elk level heeft. De server houdt dezelfde tabel bij (private.doom_level_totals in migratie 016)
 * en een test controleert dat beide gelijk blijven.
 */
export const LEVEL_TOTALS: readonly EnemyCounts[] = [
  { imp: 6, brute: 0, boss: 0 },
  { imp: 6, brute: 3, boss: 0 },
  { imp: 4, brute: 4, boss: 1 },
];

export const LEVEL_NAMES = ['Entry Hall', 'The Foundry', 'Throne of Ash'];
export const LEVEL_COUNT = LEVEL_TOTALS.length;

/** Rastercodes: 0 is vloer, 1 tot 3 zijn muren van verschillend materiaal en 4 is de uitgangsschakelaar. */
export type CellType = 0 | 1 | 2 | 3 | 4;
export const EXIT_CELL: CellType = 4;

export interface Spawn<K> {
  kind: K;
  x: number;
  y: number;
}

export interface LevelDef {
  index: number;
  name: string;
  width: number;
  height: number;
  grid: CellType[][];
  start: { x: number; y: number; angle: number };
  enemies: Spawn<EnemyKind>[];
  pickups: Spawn<PickupKind>[];
  /** De tegel van de uitgangsschakelaar. */
  exit: { x: number; y: number };
  totals: EnemyCounts;
}

interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

const PICKUPS: readonly { health: number; ammo: number }[] = [
  { health: 3, ammo: 4 },
  { health: 3, ammo: 5 },
  { health: 4, ammo: 6 },
];

const centerOf = (room: Room) => ({ x: Math.floor(room.x + room.w / 2), y: Math.floor(room.y + room.h / 2) });

function carveRoom(grid: CellType[][], room: Room, wall: CellType): void {
  for (let y = room.y - 1; y <= room.y + room.h; y += 1) {
    for (let x = room.x - 1; x <= room.x + room.w; x += 1) {
      if (grid[y][x] !== 0) grid[y][x] = wall;
    }
  }
  for (let y = room.y; y < room.y + room.h; y += 1) {
    for (let x = room.x; x < room.x + room.w; x += 1) grid[y][x] = 0;
  }
}

/** Graaft een gang van twee tegels breed tussen twee punten (eerst horizontaal, dan verticaal). */
function carveCorridor(grid: CellType[][], from: { x: number; y: number }, to: { x: number; y: number }): void {
  const open = (x: number, y: number) => {
    if (x > 0 && y > 0 && x < grid[0].length - 1 && y < grid.length - 1) grid[y][x] = 0;
  };
  const stepX = Math.sign(to.x - from.x) || 1;
  for (let x = from.x; x !== to.x + stepX; x += stepX) { open(x, from.y); open(x, from.y + 1); }
  const stepY = Math.sign(to.y - from.y) || 1;
  for (let y = from.y; y !== to.y + stepY; y += stepY) { open(to.x, y); open(to.x + 1, y); }
}

/**
 * Bouwt een level uit kamers en gangen. Het gebruikt een vaste seed per level, dus iedere run speelt hetzelfde level,
 * en het gebouwde level is altijd verbonden en bevat precies het aantal vijanden uit LEVEL_TOTALS.
 */
export function generateLevel(index: number): LevelDef {
  const rng = new SeededRandom(4242 + index * 7919);
  const size = 30 + index * 3;
  const grid: CellType[][] = Array.from({ length: size }, () => Array<CellType>(size).fill(1));
  const roomCount = 6 + index;
  const rooms: Room[] = [];

  for (let attempt = 0; attempt < 600 && rooms.length < roomCount; attempt += 1) {
    const w = 5 + Math.floor(rng.next() * 5);
    const h = 5 + Math.floor(rng.next() * 5);
    const room = { x: 2 + Math.floor(rng.next() * (size - w - 4)), y: 2 + Math.floor(rng.next() * (size - h - 4)), w, h };
    const clash = rooms.some(other => room.x < other.x + other.w + 3 && other.x < room.x + room.w + 3 && room.y < other.y + other.h + 3 && other.y < room.y + room.h + 3);
    if (!clash) rooms.push(room);
  }
  rooms.sort((a, b) => a.x + a.y - (b.x + b.y));
  rooms.forEach((room, i) => carveRoom(grid, room, ((i % 3) + 1) as CellType));
  for (let i = 0; i + 1 < rooms.length; i += 1) carveCorridor(grid, centerOf(rooms[i]), centerOf(rooms[i + 1]));

  // De uitgang is een schakelaar in de muur van de laatste kamer, naast een stuk vloer.
  const last = rooms[rooms.length - 1];
  const lastCenter = centerOf(last);
  const exitCandidates = [
    { x: lastCenter.x, y: last.y - 1 }, { x: lastCenter.x, y: last.y + last.h },
    { x: last.x - 1, y: lastCenter.y }, { x: last.x + last.w, y: lastCenter.y },
  ];
  const exit = exitCandidates.find(c => grid[c.y][c.x] !== 0 && c.x > 0 && c.y > 0 && c.x < size - 1 && c.y < size - 1) ?? exitCandidates[0];
  grid[exit.y][exit.x] = EXIT_CELL;

  const taken = new Set<string>();
  const place = (room: Room, margin = 1): { x: number; y: number } => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const x = room.x + margin + Math.floor(rng.next() * Math.max(1, room.w - margin * 2));
      const y = room.y + margin + Math.floor(rng.next() * Math.max(1, room.h - margin * 2));
      if (!taken.has(`${x},${y}`) && grid[y][x] === 0 && Math.abs(x - exit.x) + Math.abs(y - exit.y) > 2) {
        taken.add(`${x},${y}`);
        return { x: x + 0.5, y: y + 0.5 };
      }
    }
    const c = centerOf(room);
    return { x: c.x + 0.5, y: c.y + 0.5 };
  };

  const totals = LEVEL_TOTALS[index];
  const kinds: EnemyKind[] = [
    ...Array<EnemyKind>(totals.imp).fill('imp'),
    ...Array<EnemyKind>(totals.brute).fill('brute'),
    ...Array<EnemyKind>(totals.boss).fill('boss'),
  ];
  const fightRooms = rooms.slice(1);
  const enemies: Spawn<EnemyKind>[] = kinds.map((kind, i) => {
    const room = kind === 'boss' ? last : fightRooms[i % fightRooms.length];
    return { kind, ...place(room) };
  });

  const pickups: Spawn<PickupKind>[] = [];
  const supply = PICKUPS[index];
  for (let i = 0; i < supply.health + supply.ammo; i += 1) {
    const kind: PickupKind = i < supply.health ? 'health' : 'ammo';
    const room = rooms[(i * 2 + 1) % rooms.length];
    pickups.push({ kind, ...place(room) });
  }

  const startCenter = centerOf(rooms[0]);
  taken.add(`${startCenter.x},${startCenter.y}`);
  return {
    index,
    name: LEVEL_NAMES[index],
    width: size,
    height: size,
    grid,
    start: { x: startCenter.x + 0.5, y: startCenter.y + 0.5, angle: Math.atan2(centerOf(rooms[1]).y - startCenter.y, centerOf(rooms[1]).x - startCenter.x) },
    enemies,
    pickups,
    exit,
    totals: { ...totals },
  };
}

const cache: LevelDef[] = [];

/** Het level met dit nummer (0, 1 of 2); wordt eenmaal gebouwd en daarna hergebruikt. */
export function levelAt(index: number): LevelDef {
  cache[index] ??= generateLevel(index);
  return cache[index];
}
