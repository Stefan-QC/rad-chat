import type { RealtimeChannel } from '@supabase/supabase-js';
import { Emitter } from '../../core/Emitter';
import type { Db } from '../../core/supabase';
import type { ActivityService } from '../ActivityService';
import { AudioLevelMeter } from './AudioLevelMeter';
import { PeerLink, type SignalData } from './PeerLink';

export interface VoiceParticipant {
  userId: string;
  muted: boolean;
  sharing: boolean;
}

export interface VoiceSelf {
  channelId: string | null;
  muted: boolean;
  sharing: boolean;
  error: string | null;
}

interface VoiceEvents {
  participants: Map<string, VoiceParticipant[]>;
  self: VoiceSelf;
  speaking: Set<string>;
  screens: Map<string, MediaStream>;
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
  private readonly screens = new Map<string, MediaStream>();
  private screenStream: MediaStream | null = null;
  private self: VoiceSelf = { channelId: null, muted: false, sharing: false, error: null };
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
    this.setSelf({ channelId, muted: false, sharing: false, error: null });
    await this.rooms.get(channelId)?.track({ muted: false, sharing: false });
    this.syncLinks();
  }

  async leave(): Promise<void> {
    const channelId = this.self.channelId;
    if (!channelId) return;
    this.endScreenShare();
    this.links.forEach(link => link.close());
    this.links.clear();
    this.selfMeter?.stop();
    this.selfMeter = null;
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    this.screens.clear();
    this.emit('screens', new Map());
    this.setSelf({ channelId: null, muted: false, sharing: false, error: null });
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
    await this.rooms.get(channelId)?.track({ muted, sharing: this.self.sharing });
  }

  /** Deelt je scherm met iedereen in het kanaal; stopt vanzelf als je het delen in de browser beëindigt. */
  async startScreenShare(): Promise<void> {
    const channelId = this.self.channelId;
    if (!channelId || this.screenStream) return;
    if (!navigator.mediaDevices?.getDisplayMedia) return this.fail('Your browser cannot share the screen.');
    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    } catch {
      return; // De gebruiker annuleerde de keuze, dat is geen fout.
    }
    this.screenStream.getVideoTracks().forEach(track => { track.onended = () => void this.stopScreenShare(); });
    this.links.forEach(link => link.addScreen(this.screenStream!));
    this.setSelf({ ...this.self, sharing: true });
    await this.rooms.get(channelId)?.track({ muted: this.self.muted, sharing: true });
  }

  async stopScreenShare(): Promise<void> {
    const channelId = this.self.channelId;
    this.endScreenShare();
    if (!channelId) return;
    this.setSelf({ ...this.self, sharing: false });
    await this.rooms.get(channelId)?.track({ muted: this.self.muted, sharing: false });
  }

  private endScreenShare(): void {
    this.screenStream?.getTracks().forEach(track => track.stop());
    this.screenStream = null;
    this.links.forEach(link => link.removeScreen());
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
    const state = room.presenceState<{ muted?: boolean; sharing?: boolean }>();
    return Object.entries(state).map(([userId, metas]) => ({ userId, muted: Boolean(metas[0]?.muted), sharing: Boolean(metas[0]?.sharing) }));
  }

  /** Beide kanten maken een verbinding aan; de onderhandeling regelt zelf wie het aanbod doet. */
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
    for (const peerId of peers) if (!this.links.has(peerId)) this.createLink(channelId, peerId);
  }

  private createLink(channelId: string, peerId: string): PeerLink {
    const link = new PeerLink(
      peerId,
      this.stream!,
      this.userId < peerId,
      data => void this.rooms.get(channelId)?.send({ type: 'broadcast', event: 'signal', payload: { from: this.userId, to: peerId, data } }),
      {
        onSpeaking: (id, on) => this.markSpeaking(id, on),
        onScreen: (id, stream) => this.setRemoteScreen(id, stream),
      },
    );
    this.links.set(peerId, link);
    if (this.screenStream) link.addScreen(this.screenStream);
    return link;
  }

  private async receive(channelId: string, payload: SignalPayload): Promise<void> {
    if (payload.to !== this.userId || this.self.channelId !== channelId || !this.stream) return;
    const link = this.links.get(payload.from) ?? this.createLink(channelId, payload.from);
    await link.handle(payload.data);
  }

  private setRemoteScreen(userId: string, stream: MediaStream | null): void {
    if (stream) this.screens.set(userId, stream);
    else if (!this.screens.delete(userId)) return;
    this.emit('screens', new Map(this.screens));
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
