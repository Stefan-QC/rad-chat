import http from 'node:http';
import https from 'node:https';
import { ApiProcess } from './ApiProcess.mjs';
import { ApiProxy } from './ApiProxy.mjs';
import { Network } from './Network.mjs';
import { SecurityHeaders } from './SecurityHeaders.mjs';
import { StaticSite } from './StaticSite.mjs';

/** De host van RAD Chat: bestanden, /api-proxy, de Python-API en het delen op het netwerk. */
export class Application {
  constructor(config, log = console) {
    this.config = config;
    this.log = log;
    this.site = new StaticSite(config, new SecurityHeaders(config.supabaseUrl));
    this.proxy = new ApiProxy(config.apiUrl);
    this.api = config.startsOwnApi ? new ApiProcess(config, log) : null;
    this.certificate = Network.loadCertificate(config.certDir);
    this.server = null;
  }

  handle = (req, res) => {
    if (this.proxy.matches(req.url)) return this.proxy.forward(req, res);
    return this.site.handle(req, res);
  };

  start() {
    if (!this.site.isBuilt()) {
      this.log.error('The app has not been built yet. Run "npm run setup" once (or "npm run build").');
      process.exit(1);
    }
    if (!this.config.supabaseUrl || !this.config.supabaseKey) {
      this.log.error('SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are missing. Fill them in the .env file in the project folder.');
      process.exit(1);
    }
    const scheme = this.certificate ? 'https' : 'http';
    this.server = this.certificate ? https.createServer(this.certificate, this.handle) : http.createServer(this.handle);
    this.server.listen(this.config.port, '0.0.0.0', () => this.announce(scheme));
    this.api?.start();
    this.warnAboutMissingSecrets();
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());
  }

  announce(scheme) {
    const port = this.config.port;
    this.log.log(`RAD Chat is running on port ${port} (${scheme}). Colleagues on the same network can open:`);
    this.log.log(`  ${scheme}://localhost:${port}   (this computer)`);
    for (const address of Network.lanAddresses()) this.log.log(`  ${scheme}://${address}:${port}`);
    if (!this.certificate) this.log.log('  Voice from other computers needs https: run "npm run cert" once and restart.');
  }

  warnAboutMissingSecrets() {
    if (this.api && !this.config.env.SUPABASE_SERVICE_ROLE_KEY) {
      this.log.warn('SUPABASE_SERVICE_ROLE_KEY is empty: admin tools, export and scheduled jobs will not work.');
    }
  }

  stop() {
    this.api?.stop();
    if (!this.server) return process.exit(0);
    this.server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  }
}
