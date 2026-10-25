import http from 'node:http';
import https from 'node:https';

const TIMEOUT_MS = 30_000;

/** Stuurt alle /api-verzoeken ongewijzigd door naar de Python-API. */
export class ApiProxy {
  constructor(apiUrl) {
    this.apiUrl = apiUrl;
  }

  matches(url = '') {
    return url === '/api' || url.startsWith('/api/') || url.startsWith('/api?');
  }

  forward(req, res) {
    const secure = this.apiUrl.protocol === 'https:';
    const forwardedFor = [req.headers['x-forwarded-for'], req.socket.remoteAddress].filter(Boolean).join(', ');
    const upstream = (secure ? https : http).request({
      hostname: this.apiUrl.hostname,
      port: this.apiUrl.port || (secure ? 443 : 80),
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: this.apiUrl.host, 'x-forwarded-for': forwardedFor },
      timeout: TIMEOUT_MS,
    }, answer => {
      res.writeHead(answer.statusCode ?? 502, answer.headers);
      answer.pipe(res);
    });
    upstream.on('timeout', () => upstream.destroy(new Error('timeout')));
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ detail: 'The API is not available right now.' }));
    });
    req.pipe(upstream);
  }
}
