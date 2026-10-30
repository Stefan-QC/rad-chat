import type { GameEvent } from './DoomGame';

/** Eenvoudige geluiden die in de browser worden gesynthetiseerd; er zijn geen geluidsbestanden of geluiden uit de originele game. */
export class DoomAudio {
  muted = false;
  private context: AudioContext | null = null;

  /** Maakt de audio-omgeving aan; de browser staat dat pas toe na een klik of toetsaanslag. */
  unlock(): void {
    if (!this.context && typeof AudioContext !== 'undefined') this.context = new AudioContext();
    void this.context?.resume();
  }

  close(): void {
    void this.context?.close();
    this.context = null;
  }

  play(event: GameEvent): void {
    if (this.muted || !this.context) return;
    switch (event) {
      case 'shot': this.noise(0.12, 2200, 0.5); this.tone(110, 40, 0.1, 'square', 0.25); break;
      case 'dry': this.tone(900, 700, 0.03, 'square', 0.12); break;
      case 'reload': this.tone(500, 300, 0.05, 'square', 0.12); setTimeout(() => this.tone(300, 500, 0.05, 'square', 0.12), 650); break;
      case 'hurt': this.tone(150, 70, 0.2, 'sawtooth', 0.3); break;
      case 'pickup': this.tone(660, 990, 0.12, 'sine', 0.25); break;
      case 'kill': this.noise(0.25, 700, 0.45); this.tone(200, 50, 0.25, 'sawtooth', 0.2); break;
      case 'enemyShot': this.tone(420, 180, 0.18, 'sawtooth', 0.14); break;
      case 'melee': this.noise(0.1, 400, 0.5); this.tone(90, 50, 0.12, 'square', 0.25); break;
      case 'exit': [440, 554, 659, 880].forEach((hz, i) => setTimeout(() => this.tone(hz, hz, 0.14, 'triangle', 0.25), i * 110)); break;
    }
  }

  private tone(from: number, to: number, seconds: number, type: OscillatorType, volume: number): void {
    const ctx = this.context;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), ctx.currentTime + seconds);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + seconds);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + seconds);
  }

  private noise(seconds: number, cutoff: number, volume: number): void {
    const ctx = this.context;
    if (!ctx) return;
    const frames = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    gain.gain.value = volume;
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start();
  }
}
