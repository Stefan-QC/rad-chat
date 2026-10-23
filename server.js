// RAD Chat — zero-dependency LAN chat server (Node 18+).
// Run: node server.js   then open http://<your-lan-ip>:3000
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const CERT_DIR = path.join(__dirname, 'certs');
const HISTORY_FILE = path.join(__dirname, 'history.json');
const WORLD_FILE = path.join(__dirname, 'world.json');
const WORLD_SIZE = 128;
const WORLD_HEIGHT = 64;
const MAX_BLOCK_ID = 10; // placeable blocks; 11 (bedrock) is generated only
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
};
const HISTORY_LIMIT = 500;
const MAX_MSG_LEN = 2000;
const MAX_NAME_LEN = 32;

let history = [];
try { history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); } catch { /* fresh start */ }

let saveTimer = null;
function saveHistory() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFile(HISTORY_FILE, JSON.stringify(history.slice(-HISTORY_LIMIT)), () => {});
  }, 500);
}

// Shared game world: the terrain is generated client-side from `seed`;
// the server only stores player edits as "x,y,z" -> blockId.
let world = { seed: Math.floor(Math.random() * 2 ** 31), edits: {} };
try { world = JSON.parse(fs.readFileSync(WORLD_FILE, 'utf8')); } catch { /* new world */ }

let worldTimer = null;
function saveWorld() {
  clearTimeout(worldTimer);
  worldTimer = setTimeout(() => fs.writeFile(WORLD_FILE, JSON.stringify(world), () => {}), 1000);
}

// name -> { x, y, z, yaw, t } for players currently in the game
const players = new Map();

// clientId -> { res, name }
const clients = new Map();

// Voice channels: name -> channel for everyone connected to voice. Audio goes peer-to-peer
// (WebRTC); the server only relays the signaling messages.
const VOICE_CHANNELS = ['Lounge', 'Stand-up'];
const voice = new Map();
let nextId = 1;

function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function broadcast(event, data) {
  for (const { res } of clients.values()) send(res, event, data);
}

function onlineUsers() {
  return [...new Set([...clients.values()].map(c => c.name))].sort();
}

function voiceState() {
  const state = Object.fromEntries(VOICE_CHANNELS.map(c => [c, []]));
  for (const [name, ch] of voice) state[ch].push(name);
  for (const list of Object.values(state)) list.sort();
  return state;
}

function leaveVoice(name) {
  if (voice.delete(name)) broadcast('voice', voiceState());
}

function pushMessage(msg) {
  history.push(msg);
  if (history.length > HISTORY_LIMIT) history = history.slice(-HISTORY_LIMIT);
  saveHistory();
  broadcast('message', msg);
}

function cleanName(raw) {
  return String(raw || '').trim().slice(0, MAX_NAME_LEN) || 'Anonymous';
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 10_000) { reject(new Error('too large')); req.destroy(); }
    });
    req.on('end', () => resolve(body));
  });
}

function removePlayer(name) {
  if (players.delete(name)) pushMessage({ type: 'system', text: `${name} left the game`, ts: Date.now() });
}

// Broadcast player positions 10x/sec while anyone is in the game.
let hadPlayers = false;
setInterval(() => {
  const now = Date.now();
  for (const [name, p] of players) if (now - p.t > 5000) removePlayer(name);
  if (players.size || hadPlayers) {
    broadcast('players', [...players].map(([name, { x, y, z, yaw }]) => ({ name, x, y, z, yaw })));
  }
  hadPlayers = players.size > 0;
}, 100);

function serveStatic(pathname, res) {
  const file = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return false;
  let stat;
  try { stat = fs.statSync(file); } catch { return false; }
  if (!stat.isFile()) return false;
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
  return true;
}

const num = v => (Number.isFinite(v) ? v : 0);

const handler = async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/world') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ seed: world.seed, size: WORLD_SIZE, height: WORLD_HEIGHT, edits: world.edits }));
  }

  if (req.method === 'POST' && url.pathname.startsWith('/voice/')) {
    let body;
    try { body = JSON.parse(await readBody(req)); } catch { res.writeHead(400); return res.end(); }
    const name = cleanName(body.name);
    if (url.pathname === '/voice/join' && VOICE_CHANNELS.includes(body.channel)) {
      voice.set(name, body.channel);
      broadcast('voice', voiceState());
    } else if (url.pathname === '/voice/leave') {
      leaveVoice(name);
    } else if (url.pathname === '/voice/signal') {
      const to = cleanName(body.to);
      for (const c of clients.values()) if (c.name === to) send(c.res, 'signal', { from: name, data: body.data });
    } else {
      res.writeHead(400); return res.end();
    }
    res.writeHead(204);
    return res.end();
  }

  if (req.method === 'POST' && url.pathname.startsWith('/game/')) {
    let body;
    try { body = JSON.parse(await readBody(req)); } catch { res.writeHead(400); return res.end(); }
    const name = cleanName(body.name);

    if (url.pathname === '/game/pos') {
      if (!players.has(name)) pushMessage({ type: 'system', text: `${name} entered the game`, ts: Date.now() });
      players.set(name, { x: num(body.x), y: num(body.y), z: num(body.z), yaw: num(body.yaw), t: Date.now() });
    } else if (url.pathname === '/game/leave') {
      removePlayer(name);
    } else if (url.pathname === '/game/block') {
      const { x, y, z, id } = body;
      const ok = [x, y, z, id].every(Number.isInteger) &&
        x >= 0 && x < WORLD_SIZE && z >= 0 && z < WORLD_SIZE && y >= 1 && y < WORLD_HEIGHT &&
        id >= 0 && id <= MAX_BLOCK_ID;
      if (!ok) { res.writeHead(400); return res.end(); }
      world.edits[`${x},${y},${z}`] = id;
      saveWorld();
      broadcast('block', { x, y, z, id });
    } else {
      res.writeHead(404); return res.end();
    }
    res.writeHead(204);
    return res.end();
  }

  // Live event stream: history on connect, then messages + presence.
  if (req.method === 'GET' && url.pathname === '/events') {
    const name = cleanName(url.searchParams.get('name'));
    const id = nextId++;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('retry: 2000\n\n');
    send(res, 'history', history);
    send(res, 'voice', voiceState());

    const wasOnline = onlineUsers().includes(name);
    clients.set(id, { res, name });
    if (!wasOnline) pushMessage({ type: 'system', text: `${name} joined`, ts: Date.now() });
    broadcast('users', onlineUsers());

    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.on('close', () => {
      clearInterval(ping);
      clients.delete(id);
      if (!onlineUsers().includes(name)) {
        leaveVoice(name);
        pushMessage({ type: 'system', text: `${name} left`, ts: Date.now() });
      }
      broadcast('users', onlineUsers());
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/send') {
    try {
      const { name, text } = JSON.parse(await readBody(req));
      const clean = String(text || '').trim().slice(0, MAX_MSG_LEN);
      if (clean) pushMessage({ type: 'chat', name: cleanName(name), text: clean, ts: Date.now() });
      res.writeHead(204);
    } catch {
      res.writeHead(400);
    }
    return res.end();
  }

  if (req.method === 'GET' && serveStatic(url.pathname, res)) return;

  res.writeHead(404);
  res.end('Not found');
};

// Browsers only allow microphone access on https:// or localhost, so voice on the LAN
// needs a certificate: put key.pem and cert.pem in certs/ (see README) and it switches to HTTPS.
let tls = null;
try {
  tls = { key: fs.readFileSync(path.join(CERT_DIR, 'key.pem')), cert: fs.readFileSync(path.join(CERT_DIR, 'cert.pem')) };
} catch { /* plain http */ }
const scheme = tls ? 'https' : 'http';
const server = tls ? https.createServer(tls, handler) : http.createServer(handler);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`RAD Chat running on port ${PORT} (${scheme})`);
  if (!tls) console.log('  Voice needs https on the LAN (works on localhost only) — see README.md');
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`  ${scheme}://${a.address}:${PORT}`);
    }
  }
  console.log('  (On WSL2, colleagues need your Windows LAN IP — see README.md)');
});
