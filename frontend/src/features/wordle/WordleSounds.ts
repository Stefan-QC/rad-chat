import type { LetterMark } from '../../core/types';

/** Speelt korte geluidjes af met WebAudio als de gebruiker dat heeft aangezet. */
export class WordleSounds {
  private context: AudioContext | null = null;

  constructor(private readonly isEnabled: () => boolean) {}

  type(): void {
    this.tone(440, 0.03);
  }

  reveal(mark: LetterMark): void {
    this.tone(mark === 'correct' ? 660 : mark === 'present' ? 520 : 380, 0.06);
  }

  reject(): void {
    this.tone(200, 0.15);
  }

  win(): void {
    this.tone(523, 0.12);
    this.tone(659, 0.12, 0.12);
    this.tone(784, 0.2, 0.24);
  }

  private tone(frequency: number, duration: number, delay = 0): void {
    if (!this.isEnabled()) return;
    try {
      this.context ??= new AudioContext();
      const start = this.context.currentTime + delay;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.05, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain).connect(this.context.destination);
      oscillator.start(start);
      oscillator.stop(start + duration);
    } catch {
      // Geen audio beschikbaar: het spel werkt gewoon door zonder geluid.
    }
  }
}
