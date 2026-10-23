import type { RealtimeChannel } from '@supabase/supabase-js';
import { Emitter } from '../../core/Emitter';
import type { Db } from '../../core/supabase';
import type { ActivityService } from '../ActivityService';
import { AudioLevelMeter } from './AudioLevelMeter';
import { PeerLink, type SignalData } from './PeerLink';

export interface VoiceParticipant {
  userId: string;
  muted: boolean;
}

export interface VoiceSelf {
  channelId: string | null;
  muted: boolean;
  error: string | null;
}

interface VoiceEvents {
  participants: Map<string, VoiceParticipant[]>;
  self: VoiceSelf;
  speaking: Set<string>;
}

interface SignalPayload {
  from: string;
  to: string;
  data: SignalData;
}

/** Beheert alle voicekanalen: wie erin zit en de peer-to-peer audioverbindingen van het huidige kanaal. */
export class VoiceHub extends Emitter<VoiceEvents> {
  private readonly rooms = new Map<string, RealtimeChannel>();
  private readonly participants = new Map<string, VoiceParticipant[]>();
  private readonly links = new Map<string, PeerLink>();
  private readonly speaking = new Set<string>();
  private self: VoiceSelf = { channelId: null, muted: false, error: null };
  private userId = '';
  private stream: MediaStream | null = null;
  private selfMeter: AudioLevelMeter | null = null;
  private sessionId: number | null = null;

  constructor(
    private readonly db: Db,
    private readonly activity: ActivityService,
  ) {
    super();
  }

  /** Luistert mee op de presence van alle opgegeven voicekanalen. */
  watch(userId: string, channelIds: string[]): void {
    this.userId = userId;
    for (const [id, room] of this.rooms) {
      if (channelIds.includes(id)) continue;
      void this.db.removeChannel(room);
      this.rooms.delete(id);
      this.participants.delete(id);
    }
    for (const id of channelIds) if (!this.rooms.has(id)) this.openRoom(id);
    this.emit('participants', new Map(this.participants));
  }

  async join(channelId: string): Promise<void> {
    if (this.self.channelId === channelId) return this.leave();
    await this.leave();
    if (!navigator.mediaDevices?.getUserMedia) {
      return this.fail('Voice needs a secure connection (https or localhost).');
    }
    try {
      AudioLevelMeter.unlock();
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      return this.fail('Could not access your microphone. Allow it for this site and try again.');
    }
    this.selfMeter = new AudioLevelMeter(this.stream, on => this.markSpeaking(this.userId, on), () => this.self.muted);
    this.selfMeter.start();
    this.sessionId = await this.activity.start('voice', channelId).catch(() => null);
    this.setSelf({ channelId, muted: false, error: null });
    await this.rooms.get(channelId)?.track({ muted: false });
    this.syncLinks();
  }

  async leave(): Promise<void> {
    const channelId = this.self.channelId;
    if (!channelId) return;
    this.links.forEach(link => link.close());
    this.links.clear();
    this.selfMeter?.stop();
    this.selfMeter = null;
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    this.setSelf({ channelId: null, muted: false, error: null });
    await this.rooms.get(channelId)?.untrack();
    if (this.sessionId !== null) await this.activity.end(this.sessionId);
    this.sessionId = null;
  }

  async toggleMute(): Promise<void> {
    const channelId = this.self.channelId;
    if (!channelId || !this.stream) return;
    const muted = !this.self.muted;
    this.stream.getAudioTracks().forEach(track => (track.enabled = !muted));
    this.setSelf({ ...this.self, muted });
    await this.rooms.get(channelId)?.track({ muted });
  }

  /** Sluit alles af bij uitloggen. */
  async dispose(): Promise<void> {
    await this.leave();
    for (const room of this.rooms.values()) void this.db.removeChannel(room);
    this.rooms.clear();
    this.participants.clear();
    this.emit('participants', new Map());
  }

  private openRoom(channelId: string): void {
    const room = this.db.channel(`voice:${channelId}`, { config: { private: true, presence: { key: this.userId } } });
    room.on('presence', { event: 'sync' }, () => {
      this.participants.set(channelId, this.readPresence(room));
      this.emit('participants', new Map(this.participants));
      if (this.self.channelId === channelId) this.syncLinks();
    });
    room.on('broadcast', { event: 'signal' }, ({ payload }) => void this.receive(channelId, payload as SignalPayload));
    room.subscribe();
    this.rooms.set(channelId, room);
  }

  private readPresence(room: RealtimeChannel): VoiceParticipant[] {
    const state = room.presenceState<{ muted?: boolean }>();
    return Object.entries(state).map(([userId, metas]) => ({ userId, muted: Boolean(metas[0]?.muted) }));
  }

  /** De deelnemer met de grootste id start het gesprek, zodat beide kanten nooit tegelijk een offer sturen. */
  private syncLinks(): void {
    const channelId = this.self.channelId;
    if (!channelId || !this.stream) return;
    const peers = (this.participants.get(channelId) ?? []).map(p => p.userId).filter(id => id !== this.userId);
    for (const [peerId, link] of this.links) {
      if (peers.includes(peerId)) continue;
      link.close();
      this.links.delete(peerId);
      this.markSpeaking(peerId, false);
    }
    for (const peerId of peers) {
      if (this.links.has(peerId) || this.userId < peerId) continue;
      const link = this.createLink(channelId, peerId);
      void link.createOffer();
    }
  }

  private createLink(channelId: string, peerId: string): PeerLink {
    const link = new PeerLink(
      peerId,
      this.stream!,
      data => void this.rooms.get(channelId)?.send({ type: 'broadcast', event: 'signal', payload: { from: this.userId, to: peerId, data } }),
      (id, on) => this.markSpeaking(id, on),
    );
    this.links.set(peerId, link);
    return link;
  }

  private async receive(channelId: string, payload: SignalPayload): Promise<void> {
    if (payload.to !== this.userId || this.self.channelId !== channelId || !this.stream) return;
    let link = this.links.get(payload.from);
    if ('sdp' in payload.data && payload.data.sdp.type === 'offer') {
      link?.close();
      link = this.createLink(channelId, payload.from);
    }
    await link?.handle(payload.data);
  }

  private markSpeaking(userId: string, on: boolean): void {
    if (on === this.speaking.has(userId)) return;
    if (on) this.speaking.add(userId);
    else this.speaking.delete(userId);
    this.emit('speaking', new Set(this.speaking));
  }

  private setSelf(next: VoiceSelf): void {
    this.self = next;
    this.emit('self', next);
  }

  private fail(message: string): void {
    this.setSelf({ ...this.self, error: message });
  }
}
