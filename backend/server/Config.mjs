import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EnvFile } from './EnvFile.mjs';

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Alle instellingen van de host: de omgeving wint van het .env-bestand in de hoofdmap. */
export class Config {
  constructor(env, root) {
    this.env = env;
    this.root = root;
  }

  static load() {
    const root = path.resolve(SERVER_DIR, '..', '..');
    return new Config({ ...EnvFile.read(path.join(root, '.env')), ...process.env }, root);
  }

  get port() { return Number(this.env.PORT) || 3000; }
  get distDir() { return path.join(this.root, 'frontend', 'dist'); }
  get backendDir() { return path.join(this.root, 'backend'); }
  get certDir() { return path.join(this.root, 'certs'); }
  get supabaseUrl() { return this.env.SUPABASE_URL || this.env.VITE_SUPABASE_URL || ''; }
  get supabaseKey() { return this.env.SUPABASE_PUBLISHABLE_KEY || this.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''; }

  /** Met een eigen API_URL draait de API elders (bijvoorbeeld in een andere container) en start de host hem niet zelf. */
  get startsOwnApi() { return !this.env.API_URL; }
  get apiPort() { return Number(this.env.API_PORT) || 8000; }
  get apiUrl() { return new URL(this.env.API_URL || `http://127.0.0.1:${this.apiPort}`); }

  /** De omgeving voor het Python-proces, met de Supabase-namen die de API verwacht. */
  apiEnvironment() {
    return { ...this.env, SUPABASE_URL: this.supabaseUrl, SUPABASE_PUBLISHABLE_KEY: this.supabaseKey, PYTHONUNBUFFERED: '1' };
  }
}
