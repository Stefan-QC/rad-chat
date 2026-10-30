/** Een sprite als pixels in het ABGR-formaat dat ImageData gebruikt; 0 betekent doorzichtig. */
export interface Sprite {
  w: number;
  h: number;
  pixels: Uint32Array;
}

const abgr = (hex: string): number => {
  const value = parseInt(hex.slice(1), 16);
  return (0xff000000 | ((value & 0xff) << 16) | (value & 0xff00) | ((value >> 16) & 0xff)) >>> 0;
};

/** Zet een tekenschema (één teken per pixel, '.' is leeg) en een palet om naar een sprite; alle regels worden op gelijke breedte gebracht. */
function sprite(rows: string[], palette: Record<string, string>): Sprite {
  const w = Math.max(...rows.map(row => row.length));
  const pixels = new Uint32Array(w * rows.length);
  rows.forEach((row, y) => {
    [...row.padEnd(w, '.')].forEach((ch, x) => {
      if (palette[ch]) pixels[y * w + x] = abgr(palette[ch]);
    });
  });
  return { w, h: rows.length, pixels };
}

// Alles hieronder is zelf getekend voor dit project: geen assets, levels, geluiden of code van de originele DOOM.

const IMP = sprite([
  '....o......o....',
  '...ooo....ooo...',
  '...oRro..orRo...',
  '....oRrooorRo...',
  '....orRRRRRro...',
  '...orRyRRyRRro..',
  '...orRRRRRRRro..',
  '....orwkwkwro...',
  '.....orRRRro....',
  '...ooorRRRroo...',
  '..orRRorrrorRro.',
  '..orRro.rr.orRo.',
  '..owwo..rr..owwo',
  '.....orRRro.....',
  '.....orR.Rro....',
  '....orRo.oRro...',
], { o: '#2a0d0a', r: '#9c3a24', R: '#cf5a3c', y: '#ffe14d', w: '#f4ecd0', k: '#190807' });

const BRUTE = sprite([
  '................',
  '.....oooooo.....',
  '....ogGGGGgo....',
  '...ogGyGGyGgo...',
  '...ogGGGGGGgo...',
  '....ogkwwkgo....',
  '..ooogGGGGgooo..',
  '.ogGGoggggoGGgo.',
  'ogGGGoGGGGoGGGgo',
  'ogGGgobbbboGGGgo',
  'owwgo.oGGGo.ogwo',
  '.oo..ogGGGgo..oo',
  '.....ogGggGo....',
  '.....ogGoogGo...',
  '....ogGgo.ogGo..',
  '....oooo..oooo..',
], { o: '#12220f', g: '#3f7a33', G: '#66b052', y: '#ffcf33', w: '#e9e2c4', k: '#101010', b: '#6b4a2b' });

const BOSS = sprite([
  'h..............h',
  'hh............hh',
  '.hhh.oooooo.hhh.',
  '..hoorRRRRroohh.',
  '...orRyRRyRRro..',
  '...orRRRRRRRro..',
  '..ooorkwwkrooo..',
  '.orRRoorRRroRRro',
  'orRRRroRRRRorRRro',
  'orRfRRrRRRRrRRfRo',
  'orRfRRoRRRRoRRfRo',
  '.orRroorRRroorRo.',
  '..oo.orRRRRro.oo.',
  '....orRRooRRro...',
  '...orRRo..oRRro..',
  '...oooo....oooo..',
], { o: '#200808', r: '#8f1c14', R: '#c8402f', h: '#e8dca8', y: '#fff055', k: '#0c0404', w: '#f2e8c8', f: '#ff8a1a' });

const CORPSE = sprite([
  '................',
  '................',
  '....oooooooo....',
  '..oorrrrrrrroo..',
  '.orRRrrrrrrRRro.',
  'oowwo.oooo.owwoo',
], { o: '#25100c', r: '#7a2a1c', R: '#a63c28', w: '#e9dfc0' });

const FIREBALL = sprite([
  '..oooo..',
  '.oyyyyo.',
  'oyYYYYyo',
  'oyYwwYyo',
  'oyYwwYyo',
  'oyYYYYyo',
  '.oyyyyo.',
  '..oooo..',
], { o: '#b5340c', y: '#ff8c1a', Y: '#ffd24d', w: '#fff6c8' });

const HEALTH = sprite([
  '..........',
  '.wwwwwwww.',
  '.wwwrrwww.',
  '.wwwrrwww.',
  '.wrrrrrrw.',
  '.wrrrrrrw.',
  '.wwwrrwww.',
  '.wwwrrwww.',
  '.wwwwwwww.',
  '..........',
], { w: '#f2f2f2', r: '#d32121' });

const AMMO = sprite([
  '..........',
  '..y.y.y.y.',
  '..y.y.y.y.',
  '.gggggggg.',
  '.gdddddddg',
  '.gdddddddg',
  '.gggggggg.',
  '..........',
], { g: '#62703a', d: '#46522a', y: '#f2c94c' });

export const SPRITES = { imp: IMP, brute: BRUTE, boss: BOSS, corpse: CORPSE, fireball: FIREBALL, health: HEALTH, ammo: AMMO } as const;
export type SpriteName = keyof typeof SPRITES;

/** Een textuur van 32 bij 32 pixels voor een soort muur, met vaste ruis zodat elke run hetzelfde oogt. */
export const TEX_SIZE = 32;

export function buildWallTextures(): Uint32Array[] {
  let seed = 90210;
  const noise = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed >>> 24) / 255;
  };
  const make = (paint: (x: number, y: number, n: number) => [number, number, number]) => {
    const tex = new Uint32Array(TEX_SIZE * TEX_SIZE);
    for (let y = 0; y < TEX_SIZE; y += 1) {
      for (let x = 0; x < TEX_SIZE; x += 1) {
        const [r, g, b] = paint(x, y, noise());
        tex[y * TEX_SIZE + x] = (0xff000000 | (Math.min(255, b) << 16) | (Math.min(255, g) << 8) | Math.min(255, r)) >>> 0;
      }
    }
    return tex;
  };
  const brick = make((x, y, n) => {
    const row = Math.floor(y / 8);
    const bx = (x + (row % 2) * 8) % 16;
    const mortar = y % 8 === 0 || bx === 0;
    const k = mortar ? 0.35 : 0.85 + n * 0.3;
    return [Math.round(158 * k), Math.round(72 * k), Math.round(52 * k)];
  });
  const metal = make((x, y, n) => {
    const groove = x % 16 === 0 || y % 16 === 0;
    const rivet = (x % 16 === 3 || x % 16 === 12) && (y % 16 === 3 || y % 16 === 12);
    const k = groove ? 0.45 : rivet ? 1.35 : 0.9 + n * 0.2;
    return [Math.round(92 * k), Math.round(104 * k), Math.round(128 * k)];
  });
  const stone = make((x, y, n) => {
    const vein = (x * 3 + y) % 11 === 0 ? 0.7 : 1;
    const k = (0.8 + n * 0.4) * vein;
    return [Math.round(62 * k), Math.round(112 * k), Math.round(92 * k)];
  });
  const exit = make((x, y, n) => {
    const chevron = Math.abs(((x + y * 2) % 16) - 8) < 3;
    const frame = x < 2 || y < 2 || x > TEX_SIZE - 3 || y > TEX_SIZE - 3;
    if (frame) return [20, 40, 40];
    const k = chevron ? 1 : 0.55 + n * 0.1;
    return [Math.round(40 * k), Math.round(240 * k), Math.round(200 * k)];
  });
  return [brick, brick, metal, stone, exit];
}
