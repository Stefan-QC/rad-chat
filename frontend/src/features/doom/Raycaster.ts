import type { DoomGame } from './DoomGame';
import { ENEMIES } from './levels';
import { castRay } from './raycast';
import { SPRITES, TEX_SIZE, buildWallTextures, type Sprite } from './sprites';

export const SCREEN_W = 320;
export const SCREEN_H = 200;
const FOV = (66 * Math.PI) / 180;
const FOG_DISTANCE = 16;

interface Drawable {
  x: number;
  y: number;
  sprite: Sprite;
  /** Grootte ten opzichte van één tegel. */
  scale: number;
  /** Alleen een lichte tint (wit) bij een treffer, 0 tot 1. */
  flash: number;
  /** Voor zwevende dingen zoals vuurballen: hoe hoog boven de vloer, in tegels. */
  lift: number;
}

/**
 * De weergave in de stijl van de jaren negentig: een raycaster die per schermkolom één straal schiet, met muurtexturen,
 * afstandsmist, sprites met dieptecontrole en een wapen en vignet erbovenop. Alles gebeurt op 320 bij 200 pixels en
 * wordt met CSS pixelig opgeschaald.
 */
export class Raycaster {
  private readonly image = new ImageData(SCREEN_W, SCREEN_H);
  private readonly pixels = new Uint32Array(this.image.data.buffer);
  private readonly depth = new Float32Array(SCREEN_W);
  private readonly textures = buildWallTextures();
  private readonly background = new Uint32Array(SCREEN_H);

  constructor() {
    // De vloer en het plafond zijn een verloop, per rij één kleur.
    const horizon = SCREEN_H / 2;
    for (let y = 0; y < SCREEN_H; y += 1) {
      const t = Math.abs(y - horizon) / horizon;
      const [r, g, b] = y < horizon ? [20 + 26 * (1 - t), 12 + 16 * (1 - t), 14 + 14 * (1 - t)] : [30 + 46 * t, 26 + 38 * t, 24 + 32 * t];
      this.background[y] = (0xff000000 | (Math.round(b) << 16) | (Math.round(g) << 8) | Math.round(r)) >>> 0;
    }
  }

  render(ctx: CanvasRenderingContext2D, game: DoomGame): void {
    this.drawWorld(game);
    ctx.putImageData(this.image, 0, 0);
    this.drawWeapon(ctx, game);
    this.drawOverlay(ctx, game);
  }

  // ---------- wereld ----------

  private drawWorld(game: DoomGame): void {
    const { grid } = game.level;
    const { x: px, y: py, angle } = game.player;
    for (let y = 0; y < SCREEN_H; y += 1) this.pixels.fill(this.background[y], y * SCREEN_W, (y + 1) * SCREEN_W);

    const tanHalf = Math.tan(FOV / 2);
    for (let x = 0; x < SCREEN_W; x += 1) {
      const cameraX = (2 * x) / SCREEN_W - 1;
      const rayAngle = angle + Math.atan(cameraX * tanHalf);
      const hit = castRay(grid, px, py, rayAngle);
      const perp = Math.max(0.05, hit.dist * Math.cos(rayAngle - angle));
      this.depth[x] = perp;
      const lineHeight = SCREEN_H / perp;
      const top = (SCREEN_H - lineHeight) / 2;
      const start = Math.max(0, Math.floor(top));
      const end = Math.min(SCREEN_H - 1, Math.floor(top + lineHeight));
      const texture = this.textures[hit.cell];
      const texX = Math.min(TEX_SIZE - 1, Math.floor(hit.wallX * TEX_SIZE));
      const fog = Math.max(0.1, Math.min(1, 1.15 - hit.dist / FOG_DISTANCE)) * (hit.side === 1 ? 0.72 : 1);
      for (let y = start; y <= end; y += 1) {
        const texY = Math.min(TEX_SIZE - 1, Math.floor(((y - top) * TEX_SIZE) / lineHeight));
        const c = texture[texY * TEX_SIZE + texX];
        const r = Math.floor((c & 255) * fog);
        const g = Math.floor(((c >> 8) & 255) * fog);
        const b = Math.floor(((c >> 16) & 255) * fog);
        this.pixels[y * SCREEN_W + x] = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
      }
    }
    this.drawSprites(game);
  }

  private drawables(game: DoomGame): Drawable[] {
    const list: Drawable[] = [];
    for (const enemy of game.enemies) {
      const stats = ENEMIES[enemy.kind];
      if (enemy.state === 'dead') list.push({ x: enemy.x, y: enemy.y, sprite: SPRITES.corpse, scale: stats.scale * 0.7, flash: 0, lift: 0 });
      else list.push({ x: enemy.x, y: enemy.y, sprite: SPRITES[enemy.kind], scale: stats.scale, flash: enemy.hurtFlash > 0 ? 0.65 : enemy.state === 'attack' ? 0.25 : 0, lift: 0 });
    }
    for (const pickup of game.pickups) {
      if (!pickup.taken) list.push({ x: pickup.x, y: pickup.y, sprite: SPRITES[pickup.kind], scale: 0.4, flash: 0, lift: 0 });
    }
    for (const ball of game.projectiles) list.push({ x: ball.x, y: ball.y, sprite: SPRITES.fireball, scale: 0.35, flash: 0, lift: 0.35 });
    return list;
  }

  private drawSprites(game: DoomGame): void {
    const { x: px, y: py, angle } = game.player;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const tanHalf = Math.tan(FOV / 2);
    const planeX = -dirY * tanHalf;
    const planeY = dirX * tanHalf;
    const inverse = 1 / (planeX * dirY - dirX * planeY);

    const sorted = this.drawables(game)
      .map(item => ({ item, distance: (item.x - px) ** 2 + (item.y - py) ** 2 }))
      .sort((a, b) => b.distance - a.distance);

    for (const { item, distance } of sorted) {
      const sx = item.x - px;
      const sy = item.y - py;
      const transformX = inverse * (dirY * sx - dirX * sy);
      const transformY = inverse * (-planeY * sx + planeX * sy);
      if (transformY < 0.15) continue;
      const screenX = (SCREEN_W / 2) * (1 + transformX / transformY);
      const unit = SCREEN_H / transformY;
      const height = unit * item.scale;
      const width = height * (item.sprite.w / item.sprite.h);
      const floorY = SCREEN_H / 2 + unit / 2 - item.lift * unit;
      const top = floorY - height;
      const fog = Math.max(0.15, Math.min(1, 1.15 - Math.sqrt(distance) / FOG_DISTANCE));
      const x0 = Math.floor(screenX - width / 2);
      const x1 = Math.floor(screenX + width / 2);
      for (let stripe = Math.max(0, x0); stripe <= Math.min(SCREEN_W - 1, x1); stripe += 1) {
        if (transformY >= this.depth[stripe]) continue;
        const u = Math.min(item.sprite.w - 1, Math.floor(((stripe - x0) / Math.max(1, x1 - x0)) * item.sprite.w));
        for (let y = Math.max(0, Math.floor(top)); y <= Math.min(SCREEN_H - 1, Math.floor(floorY)); y += 1) {
          const v = Math.min(item.sprite.h - 1, Math.floor(((y - top) / Math.max(1, floorY - top)) * item.sprite.h));
          const c = item.sprite.pixels[v * item.sprite.w + u];
          if (c === 0) continue;
          const f = item.flash;
          const r = Math.min(255, Math.floor(((c & 255) * (1 - f) + 255 * f) * fog));
          const g = Math.min(255, Math.floor((((c >> 8) & 255) * (1 - f) + 255 * f) * fog));
          const b = Math.min(255, Math.floor((((c >> 16) & 255) * (1 - f) + 255 * f) * fog));
          this.pixels[y * SCREEN_W + stripe] = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
        }
      }
    }
  }

  // ---------- wapen en overlay ----------

  private drawWeapon(ctx: CanvasRenderingContext2D, game: DoomGame): void {
    const p = game.player;
    const bobX = Math.round(Math.sin(p.bob) * 4);
    const bobY = Math.round(Math.abs(Math.cos(p.bob)) * 3);
    const reload = p.reloadTimer > 0 ? Math.sin((1 - Math.min(1, p.reloadTimer / 1100)) * Math.PI) * 26 : 0;
    const kick = Math.round(p.kick * 8);
    const cx = Math.round(SCREEN_W / 2) + bobX;
    const y0 = SCREEN_H - 84 + bobY + kick + Math.round(reload);

    if (p.flash > 0) {
      ctx.fillStyle = '#ffd34d';
      ctx.fillRect(cx - 7, y0 - 14, 14, 12);
      ctx.fillStyle = '#fff6c8';
      ctx.fillRect(cx - 4, y0 - 11, 8, 8);
    }
    ctx.fillStyle = '#2c2c2c'; ctx.fillRect(cx - 5, y0 - 3, 10, 4);
    ctx.fillStyle = '#6a6a6a'; ctx.fillRect(cx - 5, y0, 10, 28);
    ctx.fillStyle = '#9b9b9b'; ctx.fillRect(cx - 5, y0, 3, 28);
    ctx.fillStyle = '#4a4a4a'; ctx.fillRect(cx - 8, y0 + 18, 16, 14);
    ctx.fillStyle = '#7d7d7d'; ctx.fillRect(cx - 8, y0 + 18, 16, 3);
    ctx.fillStyle = '#5a3c22'; ctx.fillRect(cx - 6, y0 + 32, 12, 14);
    ctx.fillStyle = '#d9a27a'; ctx.fillRect(cx - 10, y0 + 30, 20, 16);
    ctx.fillStyle = '#b98660'; ctx.fillRect(cx - 10, y0 + 40, 20, 6);
    ctx.fillStyle = '#2f4a2a'; ctx.fillRect(cx - 14, y0 + 46, 28, 12);

    // het vizier
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(SCREEN_W / 2 - 1, SCREEN_H / 2 - 5, 2, 3);
    ctx.fillRect(SCREEN_W / 2 - 1, SCREEN_H / 2 + 2, 2, 3);
    ctx.fillRect(SCREEN_W / 2 - 5, SCREEN_H / 2 - 1, 3, 2);
    ctx.fillRect(SCREEN_W / 2 + 2, SCREEN_H / 2 - 1, 3, 2);
  }

  /** Een rode gloed als je geraakt wordt en een lichte flits van het schot. */
  private drawOverlay(ctx: CanvasRenderingContext2D, game: DoomGame): void {
    const p = game.player;
    if (p.hurt > 0) {
      ctx.fillStyle = `rgba(200, 0, 0, ${Math.min(0.55, (p.hurt / 320) * 0.55)})`;
      ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    }
    if (p.flash > 40) {
      ctx.fillStyle = 'rgba(255, 220, 120, 0.12)';
      ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    }
    if (game.player.health <= 25 && game.status === 'playing') {
      ctx.fillStyle = 'rgba(120, 0, 0, 0.16)';
      ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    }
  }
}
