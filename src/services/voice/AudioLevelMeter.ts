/** Meet het volume van een audiostream en meldt wanneer iemand praat. */
export class AudioLevelMeter {
  private static context: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private speaking = false;

  constructor(
    private readonly stream: MediaStream,
    private readonly onChange: (speaking: boolean) => void,
    private readonly isSilenced: () => boolean = () => false,
  ) {}

  static getContext(): AudioContext {
    AudioLevelMeter.context ??= new AudioContext();
    return AudioLevelMeter.context;
  }

  /** Moet vanuit een klik worden aangeroepen, anders blijft de AudioContext geblokkeerd. */
  static unlock(): void {
    void AudioLevelMeter.getContext().resume();
  }

  start(): void {
    const context = AudioLevelMeter.getContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    context.createMediaStreamSource(this.stream).connect(analyser);
    const buffer = new Uint8Array(analyser.fftSize);
    this.timer = setInterval(() => {
      analyser.getByteTimeDomainData(buffer);
      let peak = 0;
      for (const value of buffer) peak = Math.max(peak, Math.abs(value - 128));
      this.update(peak > 12 && !this.isSilenced());
    }, 100);
  }

  stop(): void {
    clearInterval(this.timer);
    this.update(false);
  }

  private update(speaking: boolean): void {
    if (speaking === this.speaking) return;
    this.speaking = speaking;
    this.onChange(speaking);
  }
}
