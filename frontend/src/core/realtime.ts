import type { Db } from './supabase';

let channelCounter = 0;

/** Roept onChange aan bij elke wijziging in de opgegeven tabellen en geeft een stopfunctie terug. */
export function watchTables(db: Db, tables: string[], onChange: () => void, filter?: string): () => void {
  const channel = db.channel(`watch-${tables.join('-')}-${++channelCounter}`);
  for (const table of tables) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) }, () => onChange());
  }
  channel.subscribe();
  return () => {
    void db.removeChannel(channel);
  };
}

/** Bundelt snelle opeenvolgende aanroepen tot één aanroep na de opgegeven wachttijd. */
export function debounce(fn: () => void, waitMs: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, waitMs);
  };
}
