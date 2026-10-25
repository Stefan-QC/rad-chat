import type { RealtimeChannel } from '@supabase/supabase-js';
import { Emitter } from '../core/Emitter';
import type { Db } from '../core/supabase';
import { TypingTracker } from '../core/typing';

/** Minimale tijd tussen twee "ik typ"-signalen, zodat Realtime niet bij elke toetsaanslag wordt belast. */
const SEND_INTERVAL_MS = 2500;
const SWEEP_INTERVAL_MS = 1000;

/** Laat zien wie er in een kanaal typt via een privé Realtime-broadcastkanaal per gesprek. */
export class TypingService extends Emitter<{ change: string[] }> {
  private room: RealtimeChannel | null = null;
  private ready = false;
  private userId = '';
  private lastSent = 0;
  private sweeper: ReturnType<typeof setInterval> | null = null;
  private previous = '';
  private readonly tracker = new TypingTracker();

  constructor(private readonly db: Db) {
    super();
  }

  /** Luistert naar de typ-signalen van dit kanaal; een eerdere sessie wordt eerst netjes gestopt. */
  join(channelId: string, userId: string): void {
    this.leave();
    this.userId = userId;
    const room = this.db.channel(`typing:${channelId}`, { config: { private: true, broadcast: { self: false } } });
    room.on('broadcast', { event: 'typing' }, ({ payload }) => this.onTyping(payload?.userId));
    room.on('broadcast', { event: 'stop' }, ({ payload }) => this.onStop(payload?.userId));
    room.subscribe(status => { this.ready = status === 'SUBSCRIBED'; });
    this.room = room;
    this.sweeper = setInterval(() => this.publish(), SWEEP_INTERVAL_MS);
  }

  leave(): void {
    if (this.sweeper) clearInterval(this.sweeper);
    this.sweeper = null;
    if (this.room) void this.db.removeChannel(this.room);
    this.room = null;
    this.ready = false;
    this.lastSent = 0;
    this.tracker.reset();
    this.previous = '';
    this.emit('change', []);
  }

  /** Meldt dat de gebruiker typt; wordt hoogstens eens per paar seconden echt verstuurd. */
  notifyTyping(now: number = Date.now()): void {
    if (!this.ready || now - this.lastSent < SEND_INTERVAL_MS) return;
    this.lastSent = now;
    void this.room?.send({ type: 'broadcast', event: 'typing', payload: { userId: this.userId } });
  }

  /** Meldt dat de gebruiker niet meer typt, bijvoorbeeld na het versturen. */
  notifyStopped(): void {
    if (!this.ready) return;
    this.lastSent = 0;
    void this.room?.send({ type: 'broadcast', event: 'stop', payload: { userId: this.userId } });
  }

  private onTyping(userId: unknown): void {
    if (typeof userId !== 'string' || userId === this.userId) return;
    this.tracker.touch(userId, Date.now());
    this.publish();
  }

  private onStop(userId: unknown): void {
    if (typeof userId !== 'string') return;
    this.tracker.clear(userId);
    this.publish();
  }

  /** Geeft alleen een wijziging door als de lijst met typende mensen echt anders is. */
  private publish(): void {
    const active = this.tracker.active(Date.now());
    const key = active.join(',');
    if (key === this.previous) return;
    this.previous = key;
    this.emit('change', active);
  }
}
