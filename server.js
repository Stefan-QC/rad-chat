// RAD Chat — zero-dependency LAN chat server (Node 18+).
// Run: node server.js   then open http://<your-lan-ip>:3000
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = Number(process.env.PORT) || 3000;
const HISTORY_FILE = path.join(__dirname, 'history.json');
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

// clientId -> { res, name }
const clients = new Map();
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return fs.createReadStream(path.join(__dirname, 'public', 'index.html')).pipe(res);
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

    const wasOnline = onlineUsers().includes(name);
    clients.set(id, { res, name });
    if (!wasOnline) pushMessage({ type: 'system', text: `${name} joined`, ts: Date.now() });
    broadcast('users', onlineUsers());

    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.on('close', () => {
      clearInterval(ping);
      clients.delete(id);
      if (!onlineUsers().includes(name)) {
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

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`RAD Chat running on port ${PORT}`);
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`  http://${a.address}:${PORT}`);
    }
  }
  console.log('  (On WSL2, colleagues need your Windows LAN IP — see README.md)');
});
