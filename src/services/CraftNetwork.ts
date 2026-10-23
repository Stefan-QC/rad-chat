import type { RealtimeChannel } from '@supabase/supabase-js';
import { Emitter } from '../core/Emitter';
import type { Db } from '../core/supabase';

export interface CraftPlayer {
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface CraftBlockUpdate {
  x: number;
  y: number;
  z: number;
  id: number;
}

interface CraftEvents {
  players: CraftPlayer[];
  block: CraftBlockUpdate;
}

const STALE_AFTER_MS = 5000;

/** Deelt posities en blokwijzigingen van RAD Craft met de andere spelers via Realtime. */
export class CraftNetwork extends Emitter<CraftEvents> {
  private channel: RealtimeChannel | null = null;
  private readonly seen = new Map<string, CraftPlayer & { at: number }>();
  private ticker: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly db: Db) {
    super();
  }

  join(myName: string): void {
    this.leave();
    const channel = this.db.channel('craft', { config: { private: true, broadcast: { self: false } } });
    channel.on('broadcast', { event: 'pos' }, ({ payload }) => {
      const player = payload as CraftPlayer;
      if (player.name !== myName) this.seen.set(player.name, { ...player, at: Date.now() });
    });
    channel.on('broadcast', { event: 'leave' }, ({ payload }) => this.seen.delete((payload as { name: string }).name));
    channel.on('broadcast', { event: 'block' }, ({ payload }) => this.emit('block', payload as CraftBlockUpdate));
    channel.subscribe();
    this.channel = channel;
    this.ticker = setInterval(() => this.publishPlayers(), 100);
  }

  sendPosition(player: CraftPlayer): void {
    void this.channel?.send({ type: 'broadcast', event: 'pos', payload: player });
  }

  sendBlock(update: CraftBlockUpdate): void {
    void this.channel?.send({ type: 'broadcast', event: 'block', payload: update });
  }

  leave(name?: string): void {
    clearInterval(this.ticker);
    if (name) void this.channel?.send({ type: 'broadcast', event: 'leave', payload: { name } });
    if (this.channel) void this.db.removeChannel(this.channel);
    this.channel = null;
    this.seen.clear();
  }

  private publishPlayers(): void {
    const now = Date.now();
    for (const [name, player] of this.seen) if (now - player.at > STALE_AFTER_MS) this.seen.delete(name);
    this.emit('players', [...this.seen.values()].map(({ at: _at, ...player }) => player));
  }
}
