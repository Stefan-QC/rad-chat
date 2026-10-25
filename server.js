// RAD Chat host: serves the built React app (dist/) with SPA fallback. Zero dependencies, Node 18+.
//   npm run build && npm start        (PORT=4000 npm start)
// All data lives in Supabase; this server only hands out static files and the runtime config.
// If certs/key.pem + certs/cert.pem exist it serves HTTPS (browsers only allow the microphone on https or localhost).
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT) || 3000;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.map': 'application/json', '.txt': 'text/plain; charset=utf-8',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.map']);

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/ not found. Run "npm run build" first.');
  process.exit(1);
}

// Runtime config: the environment wins over whatever was baked in at build time.
function configJs() {
  const cfg = {
    supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || undefined,
    supabaseKey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || undefined,
  };
  return `window.__RAD_CONFIG__ = ${JSON.stringify(cfg)};\n`;
}

// De Python-backend (GIF's, beheer, export) draait apart; de Node-host stuurt /api/* ongewijzigd door.
const API_URL = new URL(process.env.API_URL || 'http://127.0.0.1:8000');
const API_TIMEOUT_MS = 30_000;

function proxyToApi(req, res) {
  const transport = API_URL.protocol === 'https:' ? https : http;
  const forwardedFor = [req.headers['x-forwarded-for'], req.socket.remoteAddress].filter(Boolean).join(', ');
  const upstream = transport.request({
    hostname: API_URL.hostname,
    port: API_URL.port || (API_URL.protocol === 'https:' ? 443 : 80),
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: API_URL.host, 'x-forwarded-for': forwardedFor },
    timeout: API_TIMEOUT_MS,
  }, upstreamRes => {
    res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
    upstreamRes.pipe(res);
  });
  upstream.on('timeout', () => upstream.destroy(new Error('timeout')));
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ detail: 'The API is not available right now.' }));
  });
  req.pipe(upstream);
}

// De Content-Security-Policy staat alleen Supabase, de GIF-diensten en Google Fonts toe.
function contentSecurityPolicy() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  let http = '';
  let ws = '';
  try {
    const origin = new URL(url);
    http = origin.origin;
    ws = `${origin.protocol === 'https:' ? 'wss' : 'ws'}://${origin.host}`;
  } catch { /* geen Supabase-URL ingesteld */ }
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    `img-src 'self' data: blob: ${http} https://*.giphy.com https://*.klipy.com`.trim(),
    `connect-src 'self' ${http} ${ws}`.trim(),
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

const SECURITY = {
  'Content-Security-Policy': contentSecurityPolicy(),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'microphone=(self), camera=(), geolocation=()',
};

function send(req, res, status, body, headers, ext) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  if (COMPRESSIBLE.has(ext) && buf.length > 1024 && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    res.writeHead(status, { ...headers, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' });
    return res.end(zlib.gzipSync(buf));
  }
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : buf);
}

const handler = (req, res) => {
  if (req.url === '/api' || req.url?.startsWith('/api/') || req.url?.startsWith('/api?')) return proxyToApi(req, res);
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400); return res.end(); }

  if (pathname === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (pathname === '/config.js') {
    return send(req, res, 200, configJs(), { ...SECURITY, 'Content-Type': MIME['.js'], 'Cache-Control': 'no-store' }, '.js');
  }

  let file = path.join(DIST, pathname);
  if (file !== DIST && !file.startsWith(DIST + path.sep)) { res.writeHead(403); return res.end(); }
  let ext = path.extname(file);
  let stat = null;
  try {
    stat = fs.statSync(file);
    if (stat.isDirectory()) { file = path.join(file, 'index.html'); ext = '.html'; stat = fs.statSync(file); }
  } catch { stat = null; }

  // Unknown paths without a file extension are client-side routes: serve the app shell.
  if (!stat) {
    if (ext) { res.writeHead(404); return res.end('Not found'); }
    file = path.join(DIST, 'index.html');
    ext = '.html';
  }
  const hashed = file.includes(`${path.sep}assets${path.sep}`);
  send(req, res, 200, fs.readFileSync(file), {
    ...SECURITY,
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
  }, ext);
};

let tls = null;
try {
  tls = { key: fs.readFileSync(path.join(ROOT, 'certs', 'key.pem')), cert: fs.readFileSync(path.join(ROOT, 'certs', 'cert.pem')) };
} catch { /* plain http */ }
const scheme = tls ? 'https' : 'http';
const server = tls ? https.createServer(tls, handler) : http.createServer(handler);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`RAD Chat running on port ${PORT} (${scheme})`);
  console.log(`  ${scheme}://localhost:${PORT}`);
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) if (a.family === 'IPv4' && !a.internal) console.log(`  ${scheme}://${a.address}:${PORT}`);
  }
  if (!tls) console.log('  Voice from other computers needs https: add certs/key.pem + certs/cert.pem (see README.md).');
});
const stop = () => server.close(() => process.exit(0));
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
