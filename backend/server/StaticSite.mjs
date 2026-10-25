import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.map': 'application/json', '.txt': 'text/plain; charset=utf-8',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.map']);

/** Serveert de gebouwde React-app met een terugval op index.html voor routes in de browser. */
export class StaticSite {
  constructor(config, securityHeaders) {
    this.distDir = config.distDir;
    this.config = config;
    this.security = securityHeaders.toObject();
  }

  isBuilt() {
    return fs.existsSync(path.join(this.distDir, 'index.html'));
  }

  /** De omgeving wint van wat bij het bouwen is ingebakken, zodat dezelfde build bij een ander project past. */
  configScript() {
    const settings = { supabaseUrl: this.config.supabaseUrl || undefined, supabaseKey: this.config.supabaseKey || undefined };
    return `window.__RAD_CONFIG__ = ${JSON.stringify(settings)};\n`;
  }

  handle(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return this.reply(res, 405);
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      return this.reply(res, 400);
    }
    if (pathname === '/healthz') return this.send(req, res, 'ok', { 'Content-Type': 'text/plain' }, '.txt');
    if (pathname === '/config.js') {
      return this.send(req, res, this.configScript(), { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-store' }, '.js');
    }
    return this.serveFile(req, res, pathname);
  }

  serveFile(req, res, pathname) {
    let file = path.join(this.distDir, pathname);
    if (file !== this.distDir && !file.startsWith(this.distDir + path.sep)) return this.reply(res, 403);
    let ext = path.extname(file);
    let found = false;
    try {
      const stat = fs.statSync(file);
      if (stat.isDirectory()) { file = path.join(file, 'index.html'); ext = '.html'; fs.statSync(file); }
      found = true;
    } catch { /* niet gevonden */ }

    if (!found) {
      if (ext) return this.reply(res, 404, 'Not found');
      file = path.join(this.distDir, 'index.html');
      ext = '.html';
    }
    const hashed = file.includes(`${path.sep}assets${path.sep}`);
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
    };
    return this.send(req, res, fs.readFileSync(file), headers, ext);
  }

  send(req, res, body, headers, ext) {
    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
    const all = { ...this.security, ...headers };
    if (COMPRESSIBLE.has(ext) && buffer.length > 1024 && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
      res.writeHead(200, { ...all, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' });
      return res.end(zlib.gzipSync(buffer));
    }
    res.writeHead(200, all);
    return res.end(req.method === 'HEAD' ? undefined : buffer);
  }

  reply(res, status, text) {
    res.writeHead(status);
    return res.end(text);
  }
}
