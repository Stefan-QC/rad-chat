import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppError } from './AppError';
import type { AppConfig } from '../config/AppConfig';

export type Db = SupabaseClient;

export function createDb(config: AppConfig): Db {
  return createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
}

interface QueryResult<T> {
  data: T | null;
  error: { message: string } | null;
}

/** Geeft de data terug of gooit een AppError. */
export function unwrap<T>(result: QueryResult<T>): T {
  if (result.error) throw AppError.from(result.error);
  return result.data as T;
}

/** Controleert alleen of de aanroep gelukt is (voor RPC's zonder resultaat). */
export function expectOk(result: { error: { message: string } | null }): void {
  if (result.error) throw AppError.from(result.error);
}
