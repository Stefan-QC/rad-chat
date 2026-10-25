/** Speelt een kort geluidje bij een nieuwe melding, alleen als de gebruiker dat aan heeft gezet. */
export class NotificationSound {
  private context: AudioContext | null = null;

  play(): void {
    try {
      this.context ??= new AudioContext();
      const now = this.context.currentTime;
      [880, 1175].forEach((frequency, index) => {
        const oscillator = this.context!.createOscillator();
        const gain = this.context!.createGain();
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.06, now + index * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.12 + 0.18);
        oscillator.connect(gain).connect(this.context!.destination);
        oscillator.start(now + index * 0.12);
        oscillator.stop(now + index * 0.12 + 0.2);
      });
    } catch {
      // Geen audio beschikbaar: de melding blijft gewoon zichtbaar zonder geluid.
    }
  }
}
