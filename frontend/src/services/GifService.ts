import type { ApiClient } from './ApiClient';

export interface GifItem {
  id: string;
  title: string;
  preview_url: string;
  url: string;
  width: number | null;
  height: number | null;
}

export interface GifPage {
  results: GifItem[];
  next: string | null;
  /** Naam van de aanbieder (klipy of giphy), voor de bronvermelding. */
  provider: string;
}

/** Zoekt GIF's via de eigen backend, zodat de API-sleutel van de aanbieder nooit in de browser komt. */
export class GifService {
  constructor(private readonly api: ApiClient) {}

  trending(position?: string): Promise<GifPage> {
    return this.api.get<GifPage>('/gifs/trending', { limit: 24, pos: position });
  }

  search(query: string, position?: string): Promise<GifPage> {
    return this.api.get<GifPage>('/gifs/search', { q: query, limit: 24, pos: position });
  }
}
