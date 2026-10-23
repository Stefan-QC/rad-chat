export interface RuntimeConfig {
  supabaseUrl?: string;
  supabaseKey?: string;
}

declare global {
  interface Window {
    __RAD_CONFIG__?: RuntimeConfig;
  }
}

export class ConfigError extends Error {}

/** Leest de Supabase-instellingen uit /config.js (runtime) of uit de Vite-omgeving (build). */
export class AppConfig {
  private constructor(
    readonly supabaseUrl: string,
    readonly supabaseKey: string,
  ) {}

  static load(): AppConfig {
    const runtime = window.__RAD_CONFIG__ ?? {};
    const url = runtime.supabaseUrl || import.meta.env.VITE_SUPABASE_URL;
    const key = runtime.supabaseKey || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) {
      throw new ConfigError('Supabase is not configured: set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.');
    }
    return new AppConfig(url, key);
  }
}
