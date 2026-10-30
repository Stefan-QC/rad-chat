import type { CellType } from './levels';

export interface RayHit {
  /** Afstand langs de straal tot de muur. */
  dist: number;
  cell: CellType;
  /** 0 als een verticale muurkant is geraakt, 1 bij een horizontale. */
  side: 0 | 1;
  /** Waar op de muur de straal viel (0 tot 1), voor de textuur. */
  wallX: number;
}

const FAR = 1e9;
const MAX_STEPS = 160;

/** Schiet een straal door het raster (DDA) en geeft de eerste muur terug; buiten het raster telt als muur. */
export function castRay(grid: readonly (readonly CellType[])[], ox: number, oy: number, angle: number): RayHit {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let mapX = Math.floor(ox);
  let mapY = Math.floor(oy);
  const deltaX = dx === 0 ? FAR : Math.abs(1 / dx);
  const deltaY = dy === 0 ? FAR : Math.abs(1 / dy);
  const stepX = dx < 0 ? -1 : 1;
  const stepY = dy < 0 ? -1 : 1;
  let sideX = dx < 0 ? (ox - mapX) * deltaX : (mapX + 1 - ox) * deltaX;
  let sideY = dy < 0 ? (oy - mapY) * deltaY : (mapY + 1 - oy) * deltaY;
  let side: 0 | 1 = 0;
  let cell: CellType = 1;

  for (let step = 0; step < MAX_STEPS; step += 1) {
    if (sideX < sideY) { sideX += deltaX; mapX += stepX; side = 0; } else { sideY += deltaY; mapY += stepY; side = 1; }
    cell = grid[mapY]?.[mapX] ?? 1;
    if (cell !== 0) break;
  }
  const dist = side === 0 ? (mapX - ox + (1 - stepX) / 2) / (dx === 0 ? FAR : dx) : (mapY - oy + (1 - stepY) / 2) / (dy === 0 ? FAR : dy);
  const hitAt = side === 0 ? oy + dist * dy : ox + dist * dx;
  return { dist: Math.max(0.0001, dist), cell, side, wallX: hitAt - Math.floor(hitAt) };
}

/** Kan een punt op deze plek staan (met een straal) zonder een muur te raken. */
export function isFree(grid: readonly (readonly CellType[])[], x: number, y: number, radius: number): boolean {
  for (const [cx, cy] of [[x - radius, y - radius], [x + radius, y - radius], [x - radius, y + radius], [x + radius, y + radius]]) {
    if ((grid[Math.floor(cy)]?.[Math.floor(cx)] ?? 1) !== 0) return false;
  }
  return true;
}
