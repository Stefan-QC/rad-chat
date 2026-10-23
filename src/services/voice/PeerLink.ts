import { AudioLevelMeter } from './AudioLevelMeter';

export type SignalData = { sdp: RTCSessionDescriptionInit } | { candidate: RTCIceCandidateInit };

/** Eén WebRTC-verbinding met één andere deelnemer, inclusief afspelen van diens audio. */
export class PeerLink {
  private readonly connection = new RTCPeerConnection();
  private readonly audio = new Audio();
  private readonly queuedCandidates: RTCIceCandidateInit[] = [];
  private meter: AudioLevelMeter | null = null;

  constructor(
    readonly peerId: string,
    localStream: MediaStream,
    private readonly sendSignal: (data: SignalData) => void,
    private readonly onSpeaking: (peerId: string, speaking: boolean) => void,
  ) {
    this.audio.autoplay = true;
    localStream.getTracks().forEach(track => this.connection.addTrack(track, localStream));
    this.connection.onicecandidate = event => {
      if (event.candidate) this.sendSignal({ candidate: event.candidate.toJSON() });
    };
    this.connection.ontrack = event => {
      this.audio.srcObject = event.streams[0];
      void this.audio.play().catch(() => undefined);
      this.meter ??= new AudioLevelMeter(event.streams[0], speaking => this.onSpeaking(this.peerId, speaking));
      this.meter.start();
    };
  }

  async createOffer(): Promise<void> {
    await this.connection.setLocalDescription(await this.connection.createOffer());
    this.sendSignal({ sdp: this.connection.localDescription! });
  }

  async handle(data: SignalData): Promise<void> {
    if ('sdp' in data) {
      await this.connection.setRemoteDescription(data.sdp);
      if (data.sdp.type === 'offer') {
        await this.connection.setLocalDescription(await this.connection.createAnswer());
        this.sendSignal({ sdp: this.connection.localDescription! });
      }
      for (const candidate of this.queuedCandidates.splice(0)) await this.connection.addIceCandidate(candidate);
    } else if (this.connection.remoteDescription) {
      await this.connection.addIceCandidate(data.candidate).catch(() => undefined);
    } else {
      this.queuedCandidates.push(data.candidate);
    }
  }

  close(): void {
    this.meter?.stop();
    this.connection.close();
    this.audio.srcObject = null;
  }
}
