import { describe, expect, it } from 'vitest';
import { PIECE_TYPES, SHAPES } from './pieces';
import { ARR_MS, DAS_MS, SOFT_DROP_MS, TetrisController, scoreFromReport } from './TetrisController';
import { BagRandomizer, COLS, HIDDEN_ROWS, LINE_POINTS, LOCK_DELAY_MS, ROWS, SeededRandom, TetrisEngine, VISIBLE_ROWS, gravityMs } from './TetrisEngine';

/** Vult de onderste rijen volledig behalve de opgegeven kolom. */
function fillBottom(engine: TetrisEngine, rows: number, gapColumn: number): void {
  for (let r = ROWS - rows; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) engine.board[r][c] = c === gapColumn ? null : 'J';
  }
}

/** Zet een verticale I zo neer dat hij in de gegeven kolom valt. */
function verticalI(engine: TetrisEngine, column: number): void {
  engine.current = { type: 'I', rotation: 1, x: column - 2, y: 0 };
}

describe('board and pieces', () => {
  it('has 10 columns and 20 visible rows plus hidden rows', () => {
    expect(COLS).toBe(10);
    expect(VISIBLE_ROWS).toBe(20);
    expect(ROWS).toBe(VISIBLE_ROWS + HIDDEN_ROWS);
  });

  it('has the seven classic tetrominoes with four cells in every rotation', () => {
    expect([...PIECE_TYPES].sort()).toEqual(['I', 'J', 'L', 'O', 'S', 'T', 'Z']);
    for (const type of PIECE_TYPES) {
      expect(SHAPES[type]).toHaveLength(4);
      for (const rotation of SHAPES[type]) expect(new Set(rotation.map(([x, y]) => `${x},${y}`)).size).toBe(4);
    }
  });
});

describe('7-bag randomizer', () => {
  it('hands out every piece exactly once per bag of seven', () => {
    const bag = new BagRandomizer(new SeededRandom(7));
    for (let round = 0; round < 5; round += 1) {
      const seven = Array.from({ length: 7 }, () => bag.next());
      expect([...seven].sort()).toEqual([...PIECE_TYPES].sort());
    }
  });

  it('peeks ahead without consuming', () => {
    const bag = new BagRandomizer(new SeededRandom(3));
    const peek = bag.peek(10);
    expect(peek).toHaveLength(10);
    expect(Array.from({ length: 10 }, () => bag.next())).toEqual(peek);
  });

  it('is reproducible for the same seed and differs between seeds', () => {
    const draw = (seed: number) => { const bag = new BagRandomizer(new SeededRandom(seed)); return Array.from({ length: 21 }, () => bag.next()).join(''); };
    expect(draw(11)).toBe(draw(11));
    expect(draw(11)).not.toBe(draw(12));
  });
});

describe('movement and rotation', () => {
  it('moves left and right but not through the walls', () => {
    const engine = new TetrisEngine(1);
    for (let i = 0; i < 20; i += 1) engine.move(-1);
    const left = Math.min(...engine.cellsOf(engine.current).map(([x]) => x));
    expect(left).toBe(0);
    expect(engine.move(-1)).toBe(false);
    for (let i = 0; i < 20; i += 1) engine.move(1);
    expect(Math.max(...engine.cellsOf(engine.current).map(([x]) => x))).toBe(COLS - 1);
    expect(engine.move(1)).toBe(false);
  });

  it('rotates clockwise and counter clockwise', () => {
    const engine = new TetrisEngine(1);
    engine.current = { type: 'T', rotation: 0, x: 3, y: 5 };
    engine.rotate(1);
    expect(engine.current.rotation).toBe(1);
    engine.rotate(-1);
    engine.rotate(-1);
    expect(engine.current.rotation).toBe(3);
  });

  it('kicks a piece away from the wall when it would not fit', () => {
    const engine = new TetrisEngine(1);
    engine.current = { type: 'T', rotation: 1, x: -1, y: 5 };
    expect(engine.rotate(1)).toBe(true);
    expect(engine.cellsOf(engine.current).every(([x]) => x >= 0)).toBe(true);
  });

  it('does not rotate the O piece', () => {
    const engine = new TetrisEngine(1);
    engine.current = { type: 'O', rotation: 0, x: 3, y: 5 };
    expect(engine.rotate(1)).toBe(false);
  });

  it('shows a ghost piece where the block will land', () => {
    const engine = new TetrisEngine(1);
    engine.current = { type: 'I', rotation: 0, x: 3, y: 1 };
    expect(engine.ghostY()).toBe(ROWS - 2);
    engine.board[ROWS - 1][4] = 'J';
    expect(engine.ghostY()).toBe(ROWS - 3);
  });
});

describe('gravity, locking and speed', () => {
  it('drops one row per interval at level 1', () => {
    const engine = new TetrisEngine(1);
    const y = engine.current.y;
    engine.tick(gravityMs(1) - 1);
    expect(engine.current.y).toBe(y);
    engine.tick(1);
    expect(engine.current.y).toBe(y + 1);
  });

  it('falls faster at higher levels', () => {
    expect(gravityMs(1)).toBe(1000);
    expect(gravityMs(5)).toBeLessThan(gravityMs(1));
    expect(gravityMs(10)).toBeLessThan(gravityMs(5));
    expect(gravityMs(30)).toBeGreaterThanOrEqual(50);
  });

  it('locks a resting piece after the lock delay and spawns the next one', () => {
    const engine = new TetrisEngine(1);
    engine.current = { type: 'O', rotation: 0, x: 3, y: engine.ghostY() };
    engine.tick(LOCK_DELAY_MS - 1);
    expect(engine.pieces).toBe(0);
    engine.tick(1);
    expect(engine.pieces).toBe(1);
    expect(engine.board[ROWS - 1].some(cell => cell === 'O')).toBe(true);
  });

  it('gives a little extra time when the piece is moved while resting', () => {
    const engine = new TetrisEngine(1);
    engine.current = { type: 'O', rotation: 0, x: 3, y: engine.ghostY() };
    engine.tick(LOCK_DELAY_MS - 10);
    engine.move(1);
    engine.tick(LOCK_DELAY_MS - 10);
    expect(engine.pieces).toBe(0);
  });
});

describe('scoring', () => {
  it('scores soft drops at 1 point per cell', () => {
    const engine = new TetrisEngine(1);
    engine.softDrop();
    engine.softDrop();
    engine.softDrop();
    expect(engine.score).toBe(3);
    expect(engine.softCells).toBe(3);
  });

  it('scores hard drops at 2 points per cell', () => {
    const engine = new TetrisEngine(1);
    engine.current = { type: 'O', rotation: 0, x: 3, y: 1 };
    const cells = engine.ghostY() - 1;
    expect(engine.hardDrop()).toBe(cells);
    expect(engine.score).toBe(cells * 2);
    expect(engine.hardCells).toBe(cells);
  });

  it.each([[1, 100], [2, 300], [3, 500], [4, 800]])('scores %i cleared lines at level 1 as %i points', (lines, points) => {
    expect(LINE_POINTS[lines]).toBe(points);
    const engine = new TetrisEngine(1);
    fillBottom(engine, lines, 9);
    verticalI(engine, 9);
    engine.hardDrop();
    expect(engine.lines).toBe(lines);
    expect(engine.clears).toEqual([lines]);
    const cells = engine.hardCells;
    expect(engine.score).toBe(points + cells * 2);
  });

  it('removes the full lines and shifts the rest down', () => {
    const engine = new TetrisEngine(1);
    fillBottom(engine, 2, 9);
    engine.board[ROWS - 3][0] = 'T';
    verticalI(engine, 9);
    engine.hardDrop();
    expect(engine.board[ROWS - 1][0]).toBe('T');
    expect(engine.board[ROWS - 2].filter(cell => cell !== null).length).toBeLessThan(COLS);
  });

  it('levels up every ten lines and scores the clear that causes it at the old level', () => {
    const engine = new TetrisEngine(1);
    engine.lines = 9;
    fillBottom(engine, 1, 9);
    verticalI(engine, 9);
    engine.hardDrop();
    expect(engine.lines).toBe(10);
    expect(engine.level).toBe(2);
    expect(engine.lastClear!.points).toBe(100);
  });

  it('multiplies the line points by the current level', () => {
    const engine = new TetrisEngine(1);
    engine.lines = 10;
    engine.level = 2;
    fillBottom(engine, 4, 9);
    verticalI(engine, 9);
    engine.hardDrop();
    expect(engine.lastClear!.points).toBe(800 * 2);
    expect(engine.score).toBe(800 * 2 + engine.hardCells * 2);
  });

  it('matches the server formula for a whole seeded game', () => {
    const engine = new TetrisEngine(42);
    const rng = new SeededRandom(5);
    for (let step = 0; step < 1500 && !engine.over; step += 1) {
      const roll = rng.next();
      if (roll < 0.3) engine.move(-1);
      else if (roll < 0.6) engine.move(1);
      else if (roll < 0.75) engine.rotate(1);
      else if (roll < 0.85) engine.softDrop();
      else engine.hardDrop();
    }
    expect(engine.pieces).toBeGreaterThan(10);
    expect(scoreFromReport(engine.report())).toBe(engine.score);
  });

  it('keeps the physical limits the server checks', () => {
    const engine = new TetrisEngine(9);
    for (let step = 0; step < 400 && !engine.over; step += 1) {
      engine.move(step % 2 === 0 ? -1 : 1);
      engine.hardDrop();
    }
    const report = engine.report();
    expect(engine.lines * 10).toBeLessThanOrEqual(report.pieces * 4);
    expect(report.hard).toBeLessThanOrEqual(report.pieces * 22);
  });
});

describe('hold', () => {
  it('stores the piece and swaps it back only once per piece', () => {
    const engine = new TetrisEngine(1);
    const first = engine.current.type;
    const second = engine.next[0];
    expect(engine.hold()).toBe(true);
    expect(engine.held).toBe(first);
    expect(engine.current.type).toBe(second);
    expect(engine.hold()).toBe(false);
    engine.hardDrop();
    expect(engine.hold()).toBe(true);
    expect(engine.current.type).toBe(first);
  });
});

describe('game over and pause', () => {
  it('ends the game when a new piece cannot be placed', () => {
    const engine = new TetrisEngine(1);
    for (let r = 2; r < ROWS; r += 1) for (let c = 0; c < COLS; c += 1) engine.board[r][c] = c === 0 ? null : 'Z';
    engine.hardDrop();
    expect(engine.over).toBe(true);
    expect(engine.move(1)).toBe(false);
    expect(engine.hardDrop()).toBe(0);
  });

  it('ignores moves and time while paused', () => {
    const engine = new TetrisEngine(1);
    const y = engine.current.y;
    engine.pause();
    expect(engine.status).toBe('paused');
    expect(engine.move(1)).toBe(false);
    engine.tick(5000);
    expect(engine.current.y).toBe(y);
    engine.resume();
    expect(engine.status).toBe('playing');
    expect(engine.move(1)).toBe(true);
  });
});

describe('TetrisController', () => {
  const setup = () => {
    const engine = new TetrisEngine(1);
    let paused = 0;
    const controller = new TetrisController(engine, () => { paused += 1; });
    return { engine, controller, paused: () => paused };
  };

  it('moves right away on a key press and repeats after the delay', () => {
    const { engine, controller } = setup();
    const x = engine.current.x;
    controller.keyDown('ArrowLeft');
    expect(engine.current.x).toBe(x - 1);
    controller.update(DAS_MS - 1);
    expect(engine.current.x).toBe(x - 1);
    controller.update(1 + ARR_MS * 2);
    expect(engine.current.x).toBeLessThanOrEqual(x - 3);
    controller.keyUp('ArrowLeft');
    const stopped = engine.current.x;
    controller.update(500);
    expect(engine.current.x).toBe(stopped);
  });

  it('lets the last pressed direction win and falls back to the other one on release', () => {
    const { engine, controller } = setup();
    controller.keyDown('ArrowLeft');
    controller.keyDown('ArrowRight');
    const x = engine.current.x;
    controller.update(DAS_MS + ARR_MS);
    expect(engine.current.x).toBeGreaterThan(x);
    controller.keyUp('ArrowRight');
    const y = engine.current.x;
    controller.update(DAS_MS + ARR_MS * 3);
    expect(engine.current.x).toBeLessThan(y);
  });

  it('soft drops while the down arrow is held', () => {
    const { engine, controller } = setup();
    controller.keyDown('ArrowDown');
    controller.update(SOFT_DROP_MS * 3);
    expect(engine.softCells).toBeGreaterThanOrEqual(3);
    controller.keyUp('ArrowDown');
    const cells = engine.softCells;
    controller.update(SOFT_DROP_MS * 5);
    expect(engine.softCells).toBe(cells);
  });

  it('rotates with Up and X, rotates back with Z, drops with Space and holds with C', () => {
    const { engine, controller } = setup();
    engine.current = { type: 'T', rotation: 0, x: 3, y: 5 };
    controller.keyDown('ArrowUp');
    expect(engine.current.rotation).toBe(1);
    controller.keyDown('KeyX');
    expect(engine.current.rotation).toBe(2);
    controller.keyDown('KeyZ');
    expect(engine.current.rotation).toBe(1);
    controller.keyDown('KeyC');
    expect(engine.held).toBe('T');
    controller.keyDown('Space');
    expect(engine.pieces).toBe(1);
  });

  it('toggles pause with P and Escape and tells the page which keys it handled', () => {
    const { controller, paused } = setup();
    expect(controller.keyDown('KeyP')).toBe(true);
    expect(controller.keyDown('Escape')).toBe(true);
    expect(paused()).toBe(2);
    expect(controller.keyDown('KeyQ')).toBe(false);
    expect(controller.keyDown('ArrowLeft', true)).toBe(true);
  });

  it('does nothing with the game keys while paused', () => {
    const { engine, controller } = setup();
    engine.pause();
    const x = engine.current.x;
    controller.keyDown('ArrowLeft');
    controller.update(1000);
    expect(engine.current.x).toBe(x);
  });
});
