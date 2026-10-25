import { AppError } from '../core/AppError';
import type { Db } from '../core/supabase';

type Params = Record<string, string | number | boolean | null | undefined>;

/** Praat met de Python-backend op hetzelfde domein (/api) en stuurt het inlogtoken van de gebruiker mee. */
export class ApiClient {
  constructor(private readonly db: Db, private readonly baseUrl = '/api') {}

  get<T>(path: string, params?: Params): Promise<T> {
    return this.request<T>('GET', path, undefined, params);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  /** Haalt een bestand op (bijvoorbeeld een export) met het inlogtoken en geeft de blob terug. */
  async download(path: string, params?: Params): Promise<{ blob: Blob; filename: string }> {
    const response = await this.send('GET', path, undefined, params);
    const disposition = response.headers.get('Content-Disposition') ?? '';
    const filename = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? 'download';
    return { blob: await response.blob(), filename };
  }

  private async request<T>(method: string, path: string, body?: unknown, params?: Params): Promise<T> {
    const response = await this.send(method, path, body, params);
    return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
  }

  private async send(method: string, path: string, body?: unknown, params?: Params): Promise<Response> {
    const { data } = await this.db.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new AppError('not_authenticated', 'Please sign in again.');
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params ?? {})) if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
    const url = `${this.baseUrl}${path}${query.size > 0 ? `?${query}` : ''}`;
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new AppError('network', 'The server could not be reached.');
    }
    if (!response.ok) throw await ApiClient.toError(response);
    return response;
  }

  private static async toError(response: Response): Promise<AppError> {
    let message = 'The request failed.';
    try {
      const payload = (await response.json()) as { error?: string; detail?: unknown };
      if (typeof payload.error === 'string') message = payload.error;
      else if (typeof payload.detail === 'string') message = payload.detail;
      else if (Array.isArray(payload.detail)) message = 'Some of the values are not valid.';
    } catch {
      // Geen JSON in het antwoord: de standaardmelding blijft staan.
    }
    return new AppError(`http_${response.status}`, message);
  }
}
