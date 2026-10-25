// RAD Craft — a small shared voxel world, opened from the chat with /game.
// @ts-nocheck: dit bestand is JavaScript en wordt niet door TypeScript gecontroleerd.
import * as THREE from 'three';

const CHUNK = 16;
const GRASS = 1, DIRT = 2, STONE = 3, SAND = 4, LOG = 5, LEAVES = 6, BEDROCK = 11;

// tex: atlas tile index, or { top, side, bottom }
const BLOCKS = [
  null,
  { name: 'Grass', tex: { top: 0, side: 1, bottom: 2 } },
  { name: 'Dirt', tex: 2 },
  { name: 'Stone', tex: 3 },
  { name: 'Sand', tex: 4 },
  { name: 'Log', tex: { top: 6, side: 5, bottom: 6 } },
  { name: 'Leaves', tex: 7, cutout: true },
  { name: 'Planks', tex: 8 },
  { name: 'Cobblestone', tex: 9 },
  { name: 'Glass', tex: 10, cutout: true },
  { name: 'Brick', tex: 11 },
  { name: 'Bedrock', tex: 12 },
];
const HOTBAR = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// Player box
const HALF_W = 0.3, HEIGHT = 1.8, EYE = 1.62, REACH = 6;

function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(seed, x, y) {
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function hashStr(s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

// Fractal value noise in [0, 1]
function makeNoise(seed) {
  const smooth = t => t * t * (3 - 2 * t);
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const u = smooth(x - xi), v = smooth(y - yi);
    const a = hash2(seed, xi, yi), b = hash2(seed, xi + 1, yi);
    const c = hash2(seed, xi, yi + 1), d = hash2(seed, xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  return (x, y) => {
    let sum = 0, amp = 1, freq = 1, total = 0;
    for (let o = 0; o < 4; o++) {
      sum += noise(x * freq, y * freq) * amp;
      total += amp; amp *= 0.5; freq *= 2;
    }
    return sum / total;
  };
}

export class World {
  constructor(size, height, seed) {
    this.size = size;
    this.height = height;
    this.data = new Uint8Array(size * size * height);
    this.generate(seed);
  }
  inBounds(x, y, z) {
    return x >= 0 && z >= 0 && y >= 0 && x < this.size && z < this.size && y < this.height;
  }
  get(x, y, z) {
    return this.inBounds(x, y, z) ? this.data[(y * this.size + z) * this.size + x] : 0;
  }
  set(x, y, z, id) {
    if (this.inBounds(x, y, z)) this.data[(y * this.size + z) * this.size + x] = id;
  }
  // Out-of-bounds sides and floor are solid walls; the sky is open.
  solid(x, y, z) {
    if (x < 0 || z < 0 || x >= this.size || z >= this.size || y < 0) return true;
    return this.get(x, y, z) !== 0;
  }
  surface(x, z) {
    for (let y = this.height - 1; y >= 0; y--) if (this.get(x, y, z)) return y;
    return 0;
  }
  generate(seed) {
    const noise = makeNoise(seed);
    const S = this.size;
    for (let z = 0; z < S; z++) {
      for (let x = 0; x < S; x++) {
        const n = Math.min(1, Math.max(0, (noise(x / 40, z / 40) - 0.5) * 1.9 + 0.5));
        const h = Math.floor(10 + n * 30);
        const beach = h < 17;
        for (let y = 0; y <= h; y++) {
          const id = y === 0 ? BEDROCK : y < h - 3 ? STONE : beach ? SAND : y < h ? DIRT : GRASS;
          this.set(x, y, z, id);
        }
      }
    }
    // Trees
    for (let z = 3; z < S - 3; z++) {
      for (let x = 3; x < S - 3; x++) {
        if (hash2(seed + 1, x, z) > 0.012) continue;
        const g = this.surface(x, z);
        if (this.get(x, g, z) !== GRASS) continue;
        const top = g + 4 + Math.floor(hash2(seed + 2, x, z) * 3);
        for (let dy = -1; dy <= 2; dy++) {
          const r = dy <= 0 ? 2 : 1;
          for (let dz = -r; dz <= r; dz++) {
            for (let dx = -r; dx <= r; dx++) {
              const corner = Math.abs(dx) === r && Math.abs(dz) === r;
              if (corner && (dy === 2 || hash2(seed + 3, x + dx, z + dz + top + dy) < 0.5)) continue;
              if (!this.get(x + dx, top + dy, z + dz)) this.set(x + dx, top + dy, z + dz, LEAVES);
            }
          }
        }
        for (let y = g + 1; y <= top; y++) this.set(x, y, z, LOG);
      }
    }
  }
}

// --- Meshing ---------------------------------------------------------------

// Corner positions + uvs per face, wound counter-clockwise from outside.
const FACES = [
  { dir: [-1, 0, 0], shade: 0.6, corners: [[0, 1, 0, 0, 1], [0, 0, 0, 0, 0], [0, 1, 1, 1, 1], [0, 0, 1, 1, 0]] },
  { dir: [1, 0, 0], shade: 0.6, corners: [[1, 1, 1, 0, 1], [1, 0, 1, 0, 0], [1, 1, 0, 1, 1], [1, 0, 0, 1, 0]] },
  { dir: [0, -1, 0], shade: 0.4, corners: [[1, 0, 1, 1, 0], [0, 0, 1, 0, 0], [1, 0, 0, 1, 1], [0, 0, 0, 0, 1]] },
  { dir: [0, 1, 0], shade: 1.0, corners: [[0, 1, 1, 1, 1], [1, 1, 1, 0, 1], [0, 1, 0, 1, 0], [1, 1, 0, 0, 0]] },
  { dir: [0, 0, -1], shade: 0.5, corners: [[1, 0, 0, 0, 0], [0, 0, 0, 1, 0], [1, 1, 0, 0, 1], [0, 1, 0, 1, 1]] },
  { dir: [0, 0, 1], shade: 0.75, corners: [[0, 0, 1, 0, 0], [1, 0, 1, 1, 0], [0, 1, 1, 0, 1], [1, 1, 1, 1, 1]] },
];
const ATLAS_TILES = 4; // 4x4 grid of 16px tiles
const UV_EPS = 0.001;

function tileFor(id, face) {
  const t = BLOCKS[id].tex;
  if (typeof t === 'number') return t;
  return face === 3 ? t.top : face === 2 ? t.bottom : t.side;
}

export function buildChunkGeometry(world, cx, cz) {
  const pos = [], uv = [], col = [], idx = [];
  const tileSize = 1 / ATLAS_TILES;
  for (let y = 0; y < world.height; y++) {
    for (let z = cz * CHUNK; z < (cz + 1) * CHUNK; z++) {
      for (let x = cx * CHUNK; x < (cx + 1) * CHUNK; x++) {
        const id = world.get(x, y, z);
        if (!id) continue;
        for (let f = 0; f < 6; f++) {
          const { dir, shade, corners } = FACES[f];
          const n = world.get(x + dir[0], y + dir[1], z + dir[2]);
          // Hidden unless the neighbour is air or see-through (glass hides glass, leaves don't).
          if (n && (!BLOCKS[n].cutout || (n === id && id !== LEAVES))) continue;
          const tile = tileFor(id, f);
          const tu = (tile % ATLAS_TILES) * tileSize;
          const tv = 1 - (Math.floor(tile / ATLAS_TILES) + 1) * tileSize;
          const base = pos.length / 3;
          for (const [px, py, pz, u, v] of corners) {
            pos.push(x + px, y + py, z + pz);
            uv.push(tu + (u ? tileSize - UV_EPS : UV_EPS), tv + (v ? tileSize - UV_EPS : UV_EPS));
            col.push(shade, shade, shade);
          }
          idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
        }
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  return geo;
}

// Voxel DDA raycast: first non-air block within maxDist, plus the face normal hit.
export function raycast(world, origin, dir, maxDist) {
  let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
  const step = [Math.sign(dir.x), Math.sign(dir.y), Math.sign(dir.z)];
  const o = [origin.x, origin.y, origin.z], d = [dir.x, dir.y, dir.z], cell = [x, y, z];
  const tMax = [], tDelta = [];
  for (let i = 0; i < 3; i++) {
    tDelta[i] = d[i] ? Math.abs(1 / d[i]) : Infinity;
    tMax[i] = d[i] ? (step[i] > 0 ? cell[i] + 1 - o[i] : o[i] - cell[i]) * tDelta[i] : Infinity;
  }
  let normal = [0, 0, 0], t = 0;
  while (t <= maxDist) {
    const id = world.get(cell[0], cell[1], cell[2]);
    if (id) return { x: cell[0], y: cell[1], z: cell[2], id, normal };
    const i = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : (tMax[1] < tMax[2] ? 1 : 2);
    cell[i] += step[i];
    t = tMax[i];
    tMax[i] += tDelta[i];
    normal = [0, 0, 0];
    normal[i] = -step[i];
  }
  return null;
}

// --- Textures ----------------------------------------------------------------

function makeAtlas() {
  const c = document.createElement('canvas');
  c.width = c.height = 16 * ATLAS_TILES;
  const g = c.getContext('2d');
  const rnd = mulberry32(42);
  const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
  const rgb = ([r, gr, b], v = 1) => `rgb(${clamp(r * v)},${clamp(gr * v)},${clamp(b * v)})`;
  const paint = (i, fn) => {
    const ox = (i % ATLAS_TILES) * 16, oy = Math.floor(i / ATLAS_TILES) * 16;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const colour = fn(x, y, rnd());
        if (colour) { g.fillStyle = colour; g.fillRect(ox + x, oy + y, 1, 1); }
      }
    }
  };
  const grass = [96, 160, 56], dirt = [134, 96, 67], bark = [105, 80, 48];
  paint(0, (x, y, n) => rgb(grass, 0.85 + n * 0.3));
  paint(1, (x, y, n) => (y < 3 + ((x * 7) % 3 === 0 ? 1 : 0) ? rgb(grass, 0.85 + n * 0.3) : rgb(dirt, 0.8 + n * 0.35)));
  paint(2, (x, y, n) => rgb(dirt, 0.8 + n * 0.35));
  paint(3, (x, y, n) => rgb([128, 128, 128], 0.8 + n * 0.3));
  paint(4, (x, y, n) => rgb([220, 208, 160], 0.9 + n * 0.15));
  paint(5, (x, y, n) => rgb(bark, (x % 4 === 0 ? 0.7 : 0.95) + n * 0.15));
  paint(6, (x, y, n) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    return d > 6.5 ? rgb(bark, 0.8 + n * 0.2) : rgb([176, 142, 90], (Math.floor(d) % 2 ? 0.85 : 1) + n * 0.1);
  });
  paint(7, (x, y, n) => (n < 0.18 ? null : rgb([58, 125, 38], 0.7 + n * 0.4)));
  paint(8, (x, y, n) => {
    const seam = y % 4 === 3 || x === ((y >> 2) * 5 + 3) % 16;
    return rgb([170, 136, 82], (seam ? 0.7 : 0.92) + n * 0.12);
  });
  paint(9, (x, y, n) => {
    const edge = y % 4 === 0 || (x + ((y >> 2) % 2) * 2) % 4 === 0;
    return rgb([122, 122, 122], edge ? 0.6 : 0.85 + n * 0.35);
  });
  paint(10, (x, y) => {
    if (x === 0 || y === 0 || x === 15 || y === 15) return rgb([215, 238, 248]);
    return (x === y + 3 || x === y + 4) && x > 4 && x < 12 ? 'rgb(255,255,255)' : null;
  });
  paint(11, (x, y, n) => {
    const mortar = y % 4 === 3 || (x + ((y >> 2) % 2) * 4) % 8 === 7;
    return mortar ? rgb([190, 185, 175], 0.9 + n * 0.1) : rgb([150, 68, 52], 0.85 + n * 0.25);
  });
  paint(12, (x, y, n) => rgb([70, 70, 70], 0.4 + n * 0.9));
  return c;
}

// --- Other players -------------------------------------------------------------

function nameTag(text) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const font = 'bold 32px system-ui, sans-serif';
  g.font = font;
  c.width = Math.ceil(g.measureText(text).width) + 20;
  c.height = 44;
  g.font = font;
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#fff';
  g.textBaseline = 'middle';
  g.fillText(text, 10, 23);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
  sprite.scale.set((c.width / c.height) * 0.35, 0.35, 1);
  sprite.position.y = 2.25;
  return sprite;
}

function makeAvatar(name) {
  const group = new THREE.Group();
  const shirt = new THREE.Color().setHSL((hashStr(name) % 360) / 360, 0.6, 0.5);
  const box = (w, h, d, color, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
    m.position.set(x, y, z);
    group.add(m);
  };
  box(0.5, 0.75, 0.28, 0x3b4a8c, 0, 0.375, 0); // legs
  box(0.6, 0.7, 0.32, shirt, 0, 1.1, 0); // body
  box(0.5, 0.5, 0.5, 0xe0b48a, 0, 1.7, 0); // head
  box(0.08, 0.08, 0.02, 0x222222, -0.11, 1.75, -0.26); // eyes (avatars face -z)
  box(0.08, 0.08, 0.02, 0x222222, 0.11, 1.75, -0.26);
  group.add(nameTag(name));
  return group;
}

function disposeObject(obj) {
  obj.traverse(o => {
    o.geometry?.dispose();
    if (o.material) { o.material.map?.dispose(); o.material.dispose(); }
  });
}

// --- Game ---------------------------------------------------------------------------

const CSS = `
#game { position: fixed; inset: 0; z-index: 100; background: #000; color: #fff; user-select: none;
        font: 14px/1.4 system-ui, sans-serif; }
#game canvas { display: block; width: 100%; height: 100%; }
#game .cross { position: absolute; left: 50%; top: 50%; width: 18px; height: 18px; margin: -9px 0 0 -9px;
               pointer-events: none; mix-blend-mode: difference; }
#game .cross::before, #game .cross::after { content: ""; position: absolute; background: #fff; }
#game .cross::before { left: 8px; top: 0; width: 2px; height: 18px; }
#game .cross::after { top: 8px; left: 0; width: 18px; height: 2px; }
#game .hotbar { position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); display: flex; gap: 2px;
                padding: 4px; background: rgba(0,0,0,.45); border-radius: 6px; }
#game .slot { width: 40px; height: 40px; border: 2px solid transparent; border-radius: 4px; position: relative;
              display: grid; place-items: center; }
#game .slot.sel { border-color: #fff; background: rgba(255,255,255,.15); }
#game .slot i { width: 32px; height: 32px; image-rendering: pixelated; background-size: 128px 128px; }
#game .slot b { position: absolute; top: 0; left: 3px; font-size: 10px; opacity: .7; }
#game .bname { position: absolute; bottom: 72px; left: 0; right: 0; text-align: center;
               text-shadow: 0 1px 2px #000; transition: opacity .4s; pointer-events: none; }
#game .info { position: absolute; top: 8px; right: 10px; font: 12px/1.5 ui-monospace, monospace;
              text-shadow: 0 1px 2px #000; text-align: right; pointer-events: none; white-space: pre; }
#game .chatlog { position: absolute; left: 10px; bottom: 110px; width: min(420px, 70vw); display: flex;
                 flex-direction: column; gap: 2px; pointer-events: none; }
#game .chatlog div { background: rgba(0,0,0,.45); padding: 2px 6px; border-radius: 3px; transition: opacity 1s;
                     white-space: pre-wrap; overflow-wrap: anywhere; }
#game .chatlog.open div { opacity: 1 !important; }
#game .chatin { position: absolute; left: 10px; bottom: 74px; width: min(420px, 70vw); font: inherit; color: #fff;
                padding: 6px 8px; border: 0; border-radius: 4px; background: rgba(0,0,0,.65); outline: none; }
#game .menu { position: absolute; inset: 0; background: rgba(0,0,0,.55); display: flex; flex-direction: column;
              align-items: center; justify-content: center; gap: 12px; padding: 16px; text-align: center; }
#game .menu h1 { margin: 0 0 8px; font-size: 34px; letter-spacing: .06em; }
#game .menu button { font: inherit; font-size: 16px; padding: 10px 24px; min-width: 220px; border: 0;
                     border-radius: 6px; background: #3b82f6; color: #fff; cursor: pointer; }
#game .menu button.sec { background: #4b5563; }
#game .menu .keys { font-size: 13px; opacity: .85; line-height: 1.9; margin-top: 8px; }
#game kbd { background: rgba(255,255,255,.18); padding: 1px 6px; border-radius: 3px; font-family: inherit; }
`;

const HTML = `
<style>${CSS}</style>
<canvas></canvas>
<div class="cross"></div>
<div class="info"></div>
<div class="chatlog"></div>
<input class="chatin" hidden maxlength="2000" placeholder="Say something… (Enter to send, Esc to cancel)">
<div class="bname"></div>
<div class="hotbar"></div>
<div class="menu">
  <h1>RAD CRAFT</h1>
  <div class="status">Loading world…</div>
  <button class="play" hidden>Click to play</button>
  <button class="exit sec">Back to chat</button>
  <div class="keys">
    <kbd>WASD</kbd> move · <kbd>Space</kbd> jump · <kbd>Shift</kbd> sprint · <kbd>F</kbd> fly (Space/Shift up/down)<br>
    <kbd>Left click</kbd> break · <kbd>Right click</kbd> place · <kbd>Middle click</kbd> pick block<br>
    <kbd>1</kbd>–<kbd>0</kbd> / scroll choose block · <kbd>T</kbd> chat · <kbd>Esc</kbd> pause
  </div>
</div>`;

let active = false;

/** net: { loadWorld, sendBlock, sendPosition, leave }. Geeft { exit } terug zodra de wereld geladen is. */
export async function startGame({ name, bus, sendChat, net, onExit }) {
  if (active) return;
  active = true;
  document.activeElement?.blur();

  const ac = new AbortController();
  const { signal } = ac;
  const root = document.createElement('div');
  root.id = 'game';
  root.innerHTML = HTML;
  document.body.append(root);
  const $ = sel => root.querySelector(sel);
  const canvas = $('canvas'), menu = $('.menu'), chatlog = $('.chatlog'), chatin = $('.chatin');

  // Chat lines inside the game
  const addChatLine = msg => {
    const line = document.createElement('div');
    line.textContent = msg.type === 'system' ? msg.text : `<${msg.name}> ${msg.text}`;
    chatlog.append(line);
    while (chatlog.children.length > 10) chatlog.firstChild.remove();
    setTimeout(() => { line.style.opacity = 0; }, 10_000);
  };
  bus.addEventListener('message', e => addChatLine(e.detail), { signal });

  // Block updates can arrive while the world is still loading.
  let world = null;
  const pendingBlocks = [];
  bus.addEventListener('block', e => {
    const { x, y, z, id } = e.detail;
    if (!world) return pendingBlocks.push(e.detail);
    if (world.get(x, y, z) !== id) { world.set(x, y, z, id); remesh(x, z); }
  }, { signal });

  const info = await net.loadWorld();
  world = new World(info.size, info.height, info.seed);
  for (const [key, id] of Object.entries(info.edits)) {
    const [x, y, z] = key.split(',').map(Number);
    world.set(x, y, z, id);
  }
  for (const { x, y, z, id } of pendingBlocks) world.set(x, y, z, id);

  // Renderer + scene
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const sky = 0x8ec5ff;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(sky);
  scene.fog = new THREE.Fog(sky, 50, 120);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x777777, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(0.5, 1, 0.3);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 400);
  camera.rotation.order = 'YXZ';

  const atlasCanvas = makeAtlas();
  const atlas = new THREE.CanvasTexture(atlasCanvas);
  atlas.magFilter = atlas.minFilter = THREE.NearestFilter;
  atlas.generateMipmaps = false;
  atlas.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true, alphaTest: 0.5 });

  const chunks = new Map();
  const chunkCount = Math.ceil(world.size / CHUNK);
  function rebuild(cx, cz) {
    if (cx < 0 || cz < 0 || cx >= chunkCount || cz >= chunkCount) return;
    const key = cx + ',' + cz;
    const old = chunks.get(key);
    if (old) { scene.remove(old); old.geometry.dispose(); }
    const mesh = new THREE.Mesh(buildChunkGeometry(world, cx, cz), material);
    scene.add(mesh);
    chunks.set(key, mesh);
  }
  function remesh(x, z) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
    rebuild(cx, cz);
    if (lx === 0) rebuild(cx - 1, cz);
    if (lx === CHUNK - 1) rebuild(cx + 1, cz);
    if (lz === 0) rebuild(cx, cz - 1);
    if (lz === CHUNK - 1) rebuild(cx, cz + 1);
  }
  for (let cz = 0; cz < chunkCount; cz++) for (let cx = 0; cx < chunkCount; cx++) rebuild(cx, cz);

  const highlight = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
    new THREE.LineBasicMaterial({ color: 0x000000 }),
  );
  highlight.visible = false;
  scene.add(highlight);

  // Player state
  const mid = Math.floor(world.size / 2);
  const spawn = () => new THREE.Vector3(mid + 0.5, world.surface(mid, mid) + 1, mid + 0.5);
  const pos = spawn();
  const vel = new THREE.Vector3();
  let yaw = 0, pitch = 0, onGround = false, flying = false;
  const keys = new Set();

  // Hotbar
  let selected = 0, nameTimer = null;
  const atlasUrl = atlasCanvas.toDataURL();
  $('.hotbar').innerHTML = HOTBAR.map((id, i) => {
    const t = tileFor(id, 0);
    const bx = -(t % ATLAS_TILES) * 32, by = -Math.floor(t / ATLAS_TILES) * 32;
    return `<div class="slot"><b>${(i + 1) % 10}</b><i style="background-image:url(${atlasUrl});background-position:${bx}px ${by}px"></i></div>`;
  }).join('');
  function select(i) {
    selected = (i + HOTBAR.length) % HOTBAR.length;
    root.querySelectorAll('.slot').forEach((s, j) => s.classList.toggle('sel', j === selected));
    const label = $('.bname');
    label.textContent = BLOCKS[HOTBAR[selected]].name;
    label.style.opacity = 1;
    clearTimeout(nameTimer);
    nameTimer = setTimeout(() => { label.style.opacity = 0; }, 1500);
  }
  select(0);

  // Other players
  const others = new Map(); // name -> { mesh, target, yaw }
  bus.addEventListener('players', e => {
    const seen = new Set();
    for (const p of e.detail) {
      if (p.name === name) continue;
      seen.add(p.name);
      let o = others.get(p.name);
      if (!o) {
        o = { mesh: makeAvatar(p.name), target: new THREE.Vector3(p.x, p.y, p.z), yaw: p.yaw };
        o.mesh.position.copy(o.target);
        scene.add(o.mesh);
        others.set(p.name, o);
      }
      o.target.set(p.x, p.y, p.z);
      o.yaw = p.yaw;
    }
    for (const [n, o] of others) {
      if (!seen.has(n)) { scene.remove(o.mesh); disposeObject(o.mesh); others.delete(n); }
    }
  }, { signal });

  // Physics
  function collides() {
    for (let y = Math.floor(pos.y); y <= Math.floor(pos.y + HEIGHT - 0.001); y++) {
      for (let z = Math.floor(pos.z - HALF_W); z <= Math.floor(pos.z + HALF_W); z++) {
        for (let x = Math.floor(pos.x - HALF_W); x <= Math.floor(pos.x + HALF_W); x++) {
          if (world.solid(x, y, z)) return true;
        }
      }
    }
    return false;
  }
  // Move along one axis; on collision snap flush against the block and report it.
  function moveAxis(axis, d) {
    pos[axis] += d;
    if (!collides()) return false;
    if (axis === 'y') {
      pos.y = d < 0 ? Math.floor(pos.y) + 1 : Math.floor(pos.y + HEIGHT) - HEIGHT - 0.001;
    } else {
      pos[axis] = d > 0
        ? Math.floor(pos[axis] + HALF_W) - HALF_W - 0.001
        : Math.floor(pos[axis] - HALF_W) + 1 + HALF_W + 0.001;
    }
    return true;
  }
  function overlapsPlayer(x, y, z) {
    return x < pos.x + HALF_W && x + 1 > pos.x - HALF_W &&
      y < pos.y + HEIGHT && y + 1 > pos.y &&
      z < pos.z + HALF_W && z + 1 > pos.z - HALF_W;
  }

  function setBlock(x, y, z, id) {
    world.set(x, y, z, id);
    remesh(x, z);
    net.sendBlock(x, y, z, id);
  }
  const lookDir = new THREE.Vector3();
  function target() {
    camera.getWorldDirection(lookDir);
    return raycast(world, camera.position, lookDir, REACH);
  }

  // Input
  let locked = false, chatOpen = false;
  const lock = () => { canvas.requestPointerLock()?.catch?.(() => {}); };
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    menu.hidden = locked || chatOpen;
    if (!locked) keys.clear();
  }, { signal });
  canvas.addEventListener('click', () => { if (!locked && !chatOpen) lock(); }, { signal });
  $('.play').addEventListener('click', lock, { signal });
  $('.exit').addEventListener('click', exit, { signal });

  function openChat() {
    chatOpen = true;
    keys.clear();
    chatin.hidden = false;
    chatlog.classList.add('open');
    document.exitPointerLock();
    chatin.focus();
  }
  function closeChat(resume) {
    chatOpen = false;
    chatin.value = '';
    chatin.hidden = true;
    chatlog.classList.remove('open');
    if (resume) lock(); else menu.hidden = false;
  }
  chatin.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      const text = chatin.value.trim();
      if (text) sendChat(text);
      closeChat(true);
    } else if (e.key === 'Escape') {
      closeChat(false);
    }
  }, { signal });

  window.addEventListener('keydown', e => {
    if (!locked) return;
    if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    if (e.code === 'KeyT' || e.code === 'Enter') { e.preventDefault(); return openChat(); }
    if (e.code === 'KeyF' && !e.repeat) { flying = !flying; vel.y = 0; }
    if (/^Digit\d$/.test(e.code)) select((Number(e.code.slice(5)) + 9) % 10);
    keys.add(e.code);
  }, { signal });
  window.addEventListener('keyup', e => keys.delete(e.code), { signal });
  window.addEventListener('mousemove', e => {
    if (!locked) return;
    yaw -= e.movementX * 0.0022;
    pitch = Math.max(-1.55, Math.min(1.55, pitch - e.movementY * 0.0022));
  }, { signal });
  window.addEventListener('wheel', e => { if (locked) select(selected + Math.sign(e.deltaY)); }, { signal });
  window.addEventListener('contextmenu', e => e.preventDefault(), { signal });
  window.addEventListener('mousedown', e => {
    if (!locked) return;
    const hit = target();
    if (!hit) return;
    if (e.button === 0 && hit.id !== BEDROCK) {
      setBlock(hit.x, hit.y, hit.z, 0);
    } else if (e.button === 1) {
      const slot = HOTBAR.indexOf(hit.id);
      if (slot >= 0) select(slot);
    } else if (e.button === 2) {
      const [nx, ny, nz] = [hit.x + hit.normal[0], hit.y + hit.normal[1], hit.z + hit.normal[2]];
      if (!world.inBounds(nx, ny, nz) || world.get(nx, ny, nz) || overlapsPlayer(nx, ny, nz)) return;
      setBlock(nx, ny, nz, HOTBAR[selected]);
    }
  }, { signal });
  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize, { signal });
  resize();
  const leave = () => net.leave();
  window.addEventListener('pagehide', leave, { signal });

  // Loop
  let running = true, last = performance.now(), lastPost = 0, lastKey = '';
  let fps = 0, frames = 0, fpsTime = last;

  function update(dt, now) {
    const f = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const r = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const sin = Math.sin(yaw), cos = Math.cos(yaw);
    let wx = -sin * f + cos * r, wz = -cos * f - sin * r;
    const len = Math.hypot(wx, wz) || 1;
    const shift = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const speed = flying ? 11 : shift ? 7 : 4.5;
    vel.x = (wx / len) * speed;
    vel.z = (wz / len) * speed;
    if (flying) {
      vel.y = ((keys.has('Space') ? 1 : 0) - (shift ? 1 : 0)) * 9;
    } else {
      vel.y = Math.max(-50, vel.y - 32 * dt);
      if (keys.has('Space') && onGround) vel.y = 9.5;
    }

    const dx = vel.x * dt, dy = vel.y * dt, dz = vel.z * dt;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.3));
    onGround = false;
    for (let s = 0; s < steps; s++) {
      if (moveAxis('x', dx / steps)) vel.x = 0;
      if (moveAxis('y', dy / steps)) { if (dy < 0) onGround = true; vel.y = 0; }
      if (moveAxis('z', dz / steps)) vel.z = 0;
    }
    if (pos.y < -20) { pos.copy(spawn()); vel.set(0, 0, 0); }

    camera.position.set(pos.x, pos.y + EYE, pos.z);
    camera.rotation.set(pitch, yaw, 0);

    const hit = locked ? target() : null;
    highlight.visible = !!hit;
    if (hit) highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);

    const k = 1 - Math.exp(-dt * 12);
    for (const o of others.values()) {
      o.mesh.position.lerp(o.target, k);
      o.mesh.rotation.y = o.yaw;
    }

    // Send our position: 10x/sec while moving, every 2s as a heartbeat when idle.
    const key = [pos.x, pos.y, pos.z, yaw].map(v => v.toFixed(2)).join();
    if (now - lastPost > (key !== lastKey ? 100 : 2000)) {
      net.sendPosition({ name, x: pos.x, y: pos.y, z: pos.z, yaw });
      lastPost = now;
      lastKey = key;
    }
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt, now);
    renderer.render(scene, camera);
    frames++;
    if (now - fpsTime > 500) { fps = Math.round((frames * 1000) / (now - fpsTime)); frames = 0; fpsTime = now; }
    $('.info').textContent =
      `${Math.floor(pos.x)} ${Math.floor(pos.y)} ${Math.floor(pos.z)}${flying ? ' · flying' : ''}\n` +
      `${fps} fps · ${others.size + 1} in game`;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  $('.status').textContent = `Welcome, ${name}!`;
  $('.play').hidden = false;

  function exit() {
    running = false;
    active = false;
    ac.abort();
    clearTimeout(nameTimer);
    net.leave();
    if (document.pointerLockElement) document.exitPointerLock();
    disposeObject(scene);
    atlas.dispose();
    renderer.dispose();
    root.remove();
    onExit?.();
  }
  return { exit };
}
