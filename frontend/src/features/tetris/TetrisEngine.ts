import { SeededRandom } from '../games/random';
import { PIECE_TYPES, SHAPES, type Cell, type PieceType } from './pieces';

export { SeededRandom };

export const COLS = 10;
export const VISIBLE_ROWS = 20;
/** Twee verborgen rijen boven het veld waarin nieuwe blokken verschijnen. */
export const HIDDEN_ROWS = 2;
export const ROWS = VISIBLE_ROWS + HIDDEN_ROWS;

/** Basispunten voor 0 tot 4 verwijderde lijnen; die worden met het level vermenigvuldigd. */
export const LINE_POINTS = [0, 100, 300, 500, 800] as const;
export const LOCK_DELAY_MS = 500;
export const MAX_LOCK_RESETS = 15;
const PREVIEW = 3;

export type EngineStatus = 'playing' | 'paused' | 'over';

export interface ActivePiece {
  type: PieceType;
  rotation: number;
  x: number;
  y: number;
}

export interface TetrisReport {
  clears: number[];
  soft: number;
  hard: number;
  pieces: number;
}

/** De 7-bag: elk blok komt precies één keer voor in elke reeks van zeven, in willekeurige volgorde. */
export class BagRandomizer {
  private queue: PieceType[] = [];

  constructor(private readonly rng: SeededRandom) {}

  private refill(): void {
    const bag = [...PIECE_TYPES];
    for (let i = bag.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.rng.next() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    this.queue.push(...bag);
  }

  next(): PieceType {
    if (this.queue.length === 0) this.refill();
    return this.queue.shift()!;
  }

  peek(count: number): PieceType[] {
    while (this.queue.length < count) this.refill();
    return this.queue.slice(0, count);
  }
}

/** Valtijd per rij in milliseconden: hoe hoger het level, hoe sneller de blokken vallen. */
export function gravityMs(level: number): number {
  return Math.max(50, Math.round(1000 * Math.pow(Math.max(0.1, 0.8 - (level - 1) * 0.007), level - 1)));
}

const KICKS: readonly Cell[] = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1], [-1, -1], [1, -1]];

/**
 * De regels van Tetris, zonder weergave en zonder klok van de browser, zodat alles testbaar is.
 * Score: lijnpunten x het level op dat moment, plus 1 punt per cel bij zacht vallen en 2 per cel bij hard droppen.
 */
export class TetrisEngine {
  readonly board: (PieceType | null)[][] = Array.from({ length: ROWS }, () => Array<PieceType | null>(COLS).fill(null));
  current!: ActivePiece;
  held: PieceType | null = null;
  status: EngineStatus = 'playing';
  score = 0;
  lines = 0;
  level = 1;
  pieces = 0;
  softCells = 0;
  hardCells = 0;
  /** Het aantal lijnen van elke verwijdering, op volgorde; de server rekent hieruit de score na. */
  readonly clears: number[] = [];
  lastClear: { lines: number; points: number } | null = null;

  private readonly bag: BagRandomizer;
  private holdUsed = false;
  private gravityAcc = 0;
  private lockAcc = 0;
  private lockResets = 0;

  constructor(seed: number = (Math.random() * 2 ** 32) >>> 0) {
    this.bag = new BagRandomizer(new SeededRandom(seed));
    this.spawn(this.bag.next());
  }

  /** De eerstvolgende blokken voor de voorvertoning. */
  get next(): PieceType[] {
    return this.bag.peek(PREVIEW);
  }

  get over(): boolean {
    return this.status === 'over';
  }

  report(): TetrisReport {
    return { clears: [...this.clears], soft: this.softCells, hard: this.hardCells, pieces: this.pieces };
  }

  /** De absolute cellen van een blok op het veld. */
  cellsOf(piece: ActivePiece): [number, number][] {
    return SHAPES[piece.type][piece.rotation].map(([x, y]) => [piece.x + x, piece.y + y]);
  }

  private collides(piece: ActivePiece): boolean {
    return this.cellsOf(piece).some(([x, y]) => x < 0 || x >= COLS || y >= ROWS || (y >= 0 && this.board[y][x] !== null));
  }

  private canFall(): boolean {
    return !this.collides({ ...this.current, y: this.current.y + 1 });
  }

  /** De rij waar het blok zou landen, voor het spookblok. */
  ghostY(): number {
    let y = this.current.y;
    while (!this.collides({ ...this.current, y: y + 1 })) y += 1;
    return y;
  }

  private spawn(type: PieceType): void {
    this.current = { type, rotation: 0, x: 3, y: 1 };
    this.gravityAcc = 0;
    this.lockAcc = 0;
    this.lockResets = 0;
    if (this.collides(this.current)) this.status = 'over';
  }

  private moved(): void {
    if (!this.canFall() && this.lockResets < MAX_LOCK_RESETS) {
      this.lockAcc = 0;
      this.lockResets += 1;
    }
  }

  move(dx: -1 | 1): boolean {
    if (this.status !== 'playing') return false;
    const next = { ...this.current, x: this.current.x + dx };
    if (this.collides(next)) return false;
    this.current = next;
    this.moved();
    return true;
  }

  /** Draait het blok (1 = rechtsom, -1 = linksom) en probeert bij een botsing een paar posities ernaast. */
  rotate(direction: 1 | -1): boolean {
    if (this.status !== 'playing' || this.current.type === 'O') return false;
    const rotation = (this.current.rotation + direction + 4) % 4;
    for (const [dx, dy] of KICKS) {
      const next = { ...this.current, rotation, x: this.current.x + dx, y: this.current.y + dy };
      if (!this.collides(next)) {
        this.current = next;
        this.moved();
        return true;
      }
    }
    return false;
  }

  /** Eén rij sneller vallen; levert 1 punt per cel op. */
  softDrop(): boolean {
    if (this.status !== 'playing' || !this.canFall()) return false;
    this.current = { ...this.current, y: this.current.y + 1 };
    this.softCells += 1;
    this.score += 1;
    this.gravityAcc = 0;
    return true;
  }

  /** Laat het blok meteen op de bodem vallen en vergrendelt het; levert 2 punten per cel op. Geeft het aantal cellen terug. */
  hardDrop(): number {
    if (this.status !== 'playing') return 0;
    const cells = this.ghostY() - this.current.y;
    this.current = { ...this.current, y: this.ghostY() };
    this.hardCells += cells;
    this.score += cells * 2;
    this.lock();
    return cells;
  }

  /** Wisselt het blok met het vastgehouden blok; één keer per blok. */
  hold(): boolean {
    if (this.status !== 'playing' || this.holdUsed) return false;
    const previous = this.held;
    this.held = this.current.type;
    this.spawn(previous ?? this.bag.next());
    this.holdUsed = true;
    return true;
  }

  pause(): void {
    if (this.status === 'playing') this.status = 'paused';
  }

  resume(): void {
    if (this.status === 'paused') this.status = 'playing';
  }

  /** Laat de tijd verstrijken: het blok valt vanzelf en wordt vergrendeld als het even stil ligt. */
  tick(dtMs: number): void {
    if (this.status !== 'playing') return;
    if (this.canFall()) {
      this.lockAcc = 0;
      this.gravityAcc += dtMs;
      const interval = gravityMs(this.level);
      while (this.gravityAcc >= interval && this.canFall()) {
        this.current = { ...this.current, y: this.current.y + 1 };
        this.gravityAcc -= interval;
      }
      if (!this.canFall()) this.gravityAcc = 0;
    } else {
      this.gravityAcc = 0;
      this.lockAcc += dtMs;
      if (this.lockAcc >= LOCK_DELAY_MS) this.lock();
    }
  }

  private lock(): void {
    for (const [x, y] of this.cellsOf(this.current)) {
      if (y >= 0) this.board[y][x] = this.current.type;
    }
    this.pieces += 1;
    const lockedOut = this.cellsOf(this.current).every(([, y]) => y < HIDDEN_ROWS);
    this.clearLines();
    this.holdUsed = false;
    if (lockedOut) {
      this.status = 'over';
      return;
    }
    this.spawn(this.bag.next());
  }

  private clearLines(): void {
    const kept = this.board.filter(row => row.some(cell => cell === null));
    const cleared = ROWS - kept.length;
    this.lastClear = null;
    if (cleared === 0) return;
    for (let i = 0; i < cleared; i += 1) kept.unshift(Array<PieceType | null>(COLS).fill(null));
    this.board.splice(0, ROWS, ...kept);
    const points = LINE_POINTS[cleared] * this.level;
    this.score += points;
    this.clears.push(cleared);
    this.lines += cleared;
    this.level = 1 + Math.floor(this.lines / 10);
    this.lastClear = { lines: cleared, points };
  }
}
