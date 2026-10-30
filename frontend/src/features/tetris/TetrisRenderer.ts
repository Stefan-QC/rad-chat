import { PIECE_COLORS, SHAPES, type PieceType } from './pieces';
import { COLS, HIDDEN_ROWS, VISIBLE_ROWS, type TetrisEngine } from './TetrisEngine';

/** De interne grootte van één cel in pixels; het canvas wordt met CSS naar de beschikbare ruimte geschaald. */
export const CELL = 30;
export const BOARD_WIDTH = COLS * CELL;
export const BOARD_HEIGHT = VISIBLE_ROWS * CELL;

function shade(hex: string, amount: number): string {
  const value = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Math.max(0, Math.min(255, ((value >> shift) & 255) + amount));
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

/** Eén cel met een lichte rand boven en links en een donkere rand onder en rechts, voor een arcade-uitstraling. */
export function drawCell(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, alpha = 1): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = shade(color, 70);
  ctx.fillRect(x, y, size, size * 0.12);
  ctx.fillRect(x, y, size * 0.12, size);
  ctx.fillStyle = shade(color, -70);
  ctx.fillRect(x, y + size * 0.88, size, size * 0.12);
  ctx.fillRect(x + size * 0.88, y, size * 0.12, size);
  ctx.globalAlpha = 1;
}

/** Tekent het speelveld: raster, vergrendelde blokken, het spookblok en het blok dat valt. */
export function drawBoard(ctx: CanvasRenderingContext2D, engine: TetrisEngine): void {
  ctx.fillStyle = '#0d0f1d';
  ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 1; c < COLS; c += 1) { ctx.moveTo(c * CELL + 0.5, 0); ctx.lineTo(c * CELL + 0.5, BOARD_HEIGHT); }
  for (let r = 1; r < VISIBLE_ROWS; r += 1) { ctx.moveTo(0, r * CELL + 0.5); ctx.lineTo(BOARD_WIDTH, r * CELL + 0.5); }
  ctx.stroke();

  engine.board.forEach((row, y) => {
    if (y < HIDDEN_ROWS) return;
    row.forEach((cell, x) => { if (cell) drawCell(ctx, x * CELL, (y - HIDDEN_ROWS) * CELL, CELL, PIECE_COLORS[cell]); });
  });

  if (engine.over) return;
  const color = PIECE_COLORS[engine.current.type];
  const ghost = { ...engine.current, y: engine.ghostY() };
  for (const [x, y] of engine.cellsOf(ghost)) {
    if (y < HIDDEN_ROWS) continue;
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2;
    ctx.strokeRect(x * CELL + 3, (y - HIDDEN_ROWS) * CELL + 3, CELL - 6, CELL - 6);
    ctx.globalAlpha = 1;
  }
  for (const [x, y] of engine.cellsOf(engine.current)) {
    if (y >= HIDDEN_ROWS) drawCell(ctx, x * CELL, (y - HIDDEN_ROWS) * CELL, CELL, color);
  }
}

/** Tekent een blok gecentreerd in een klein vak, voor de hold- en next-voorvertoning. */
export function drawPiecePreview(ctx: CanvasRenderingContext2D, type: PieceType | null, width: number, height: number): void {
  ctx.clearRect(0, 0, width, height);
  if (!type) return;
  const cells = SHAPES[type][0];
  const xs = cells.map(([x]) => x);
  const ys = cells.map(([, y]) => y);
  const size = Math.floor(Math.min(width / 4.4, height / 3.2));
  const w = (Math.max(...xs) - Math.min(...xs) + 1) * size;
  const h = (Math.max(...ys) - Math.min(...ys) + 1) * size;
  const left = (width - w) / 2 - Math.min(...xs) * size;
  const top = (height - h) / 2 - Math.min(...ys) * size;
  for (const [x, y] of cells) drawCell(ctx, left + x * size, top + y * size, size, PIECE_COLORS[type]);
}
