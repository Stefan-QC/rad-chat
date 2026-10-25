import { AudioLevelMeter } from './AudioLevelMeter';

export type SignalData = { sdp: RTCSessionDescriptionInit } | { candidate: RTCIceCandidateInit };

export interface PeerLinkEvents {
  onSpeaking: (peerId: string, speaking: boolean) => void;
  /** Geeft de schermstream van de ander door, of null zodra die stopt met delen. */
  onScreen: (peerId: string, stream: MediaStream | null) => void;
}

/**
 * Eén WebRTC-verbinding met één andere deelnemer, inclusief audio en een optioneel gedeeld scherm.
 * Gebruikt het "perfect negotiation"-patroon, zodat beide kanten op elk moment een nieuw spoor kunnen toevoegen.
 */
export class PeerLink {
  private readonly connection = new RTCPeerConnection();
  private readonly audio = new Audio();
  private readonly queuedCandidates: RTCIceCandidateInit[] = [];
  private screenSenders: RTCRtpSender[] = [];
  private meter: AudioLevelMeter | null = null;
  private makingOffer = false;
  private ignoreOffer = false;

  /** De beleefde kant geeft toe bij een botsing van twee aanbiedingen, de ander wint. */
  constructor(
    readonly peerId: string,
    localStream: MediaStream,
    private readonly polite: boolean,
    private readonly sendSignal: (data: SignalData) => void,
    private readonly events: PeerLinkEvents,
  ) {
    this.audio.autoplay = true;
    localStream.getTracks().forEach(track => this.connection.addTrack(track, localStream));

    this.connection.onicecandidate = event => {
      if (event.candidate) this.sendSignal({ candidate: event.candidate.toJSON() });
    };

    this.connection.onnegotiationneeded = async () => {
      try {
        this.makingOffer = true;
        await this.connection.setLocalDescription();
        this.sendSignal({ sdp: this.connection.localDescription! });
      } finally {
        this.makingOffer = false;
      }
    };

    this.connection.ontrack = event => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      if (event.track.kind === 'audio') {
        this.audio.srcObject = stream;
        void this.audio.play().catch(() => undefined);
        this.meter ??= new AudioLevelMeter(stream, speaking => this.events.onSpeaking(this.peerId, speaking));
        this.meter.start();
        return;
      }
      this.events.onScreen(this.peerId, stream);
      event.track.onmute = () => this.events.onScreen(this.peerId, null);
      event.track.onunmute = () => this.events.onScreen(this.peerId, stream);
      event.track.onended = () => this.events.onScreen(this.peerId, null);
    };
  }

  async handle(data: SignalData): Promise<void> {
    if ('sdp' in data) {
      const collision = data.sdp.type === 'offer' && (this.makingOffer || this.connection.signalingState !== 'stable');
      this.ignoreOffer = !this.polite && collision;
      if (this.ignoreOffer) return;
      await this.connection.setRemoteDescription(data.sdp);
      if (data.sdp.type === 'offer') {
        await this.connection.setLocalDescription();
        this.sendSignal({ sdp: this.connection.localDescription! });
      }
      for (const candidate of this.queuedCandidates.splice(0)) await this.connection.addIceCandidate(candidate).catch(() => undefined);
    } else if (this.connection.remoteDescription) {
      await this.connection.addIceCandidate(data.candidate).catch(error => {
        if (!this.ignoreOffer) throw error;
      });
    } else {
      this.queuedCandidates.push(data.candidate);
    }
  }

  /** Voegt het gedeelde scherm toe; de verbinding onderhandelt vanzelf opnieuw. */
  addScreen(stream: MediaStream): void {
    if (this.screenSenders.length > 0) return;
    this.screenSenders = stream.getVideoTracks().map(track => this.connection.addTrack(track, stream));
  }

  removeScreen(): void {
    for (const sender of this.screenSenders) {
      try {
        this.connection.removeTrack(sender);
      } catch {
        // De verbinding is al gesloten, dus er valt niets meer weg te halen.
      }
    }
    this.screenSenders = [];
  }

  close(): void {
    this.meter?.stop();
    this.connection.close();
    this.audio.srcObject = null;
    this.events.onScreen(this.peerId, null);
  }
}
