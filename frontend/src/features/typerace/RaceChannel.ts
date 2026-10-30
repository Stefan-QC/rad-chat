import type { RealtimeChannel } from '@supabase/supabase-js';
import { Emitter } from '../../core/Emitter';
import type { Db } from '../../core/supabase';
import type { LiveProgress } from './standings';

/** De snelle verbinding van één lobby: spelers sturen hun voortgang rond zonder dat die in de database wordt opgeslagen. */
export class RaceChannel extends Emitter<{ progress: LiveProgress }> {
  private channel: RealtimeChannel | null = null;
  private ready = false;

  constructor(
    private readonly db: Db,
    private readonly lobbyId: string,
    private readonly userId: string,
  ) {
    super();
  }

  open(): void {
    this.close();
    const channel = this.db.channel(`typerace:${this.lobbyId}`, { config: { private: true, broadcast: { self: false } } });
    channel.on('broadcast', { event: 'progress' }, ({ payload }) => {
      const live = RaceChannel.parse(payload);
      if (live && live.userId !== this.userId) this.emit('progress', live);
    });
    channel.subscribe(status => { this.ready = status === 'SUBSCRIBED'; });
    this.channel = channel;
  }

  send(progress: Omit<LiveProgress, 'userId'>): void {
    if (!this.ready || !this.channel) return;
    void this.channel.send({ type: 'broadcast', event: 'progress', payload: { userId: this.userId, ...progress } });
  }

  close(): void {
    if (this.channel) void this.db.removeChannel(this.channel);
    this.channel = null;
    this.ready = false;
  }

  /** Controleert een bericht van een ander; onbruikbare berichten worden genegeerd. */
  static parse(payload: unknown): LiveProgress | null {
    if (typeof payload !== 'object' || payload === null) return null;
    const p = payload as Record<string, unknown>;
    const numbers = ['correctChars', 'progress', 'wpm', 'accuracy'] as const;
    if (typeof p.userId !== 'string' || numbers.some(key => typeof p[key] !== 'number' || !Number.isFinite(p[key] as number))) return null;
    return {
      userId: p.userId,
      correctChars: p.correctChars as number,
      progress: Math.min(100, Math.max(0, p.progress as number)),
      wpm: Math.min(999, Math.max(0, p.wpm as number)),
      accuracy: Math.min(100, Math.max(0, p.accuracy as number)),
      finished: p.finished === true,
    };
  }
}
