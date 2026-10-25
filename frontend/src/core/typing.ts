/** Hoe lang iemand als "aan het typen" blijft gelden nadat het laatste signaal binnenkwam. */
export const TYPING_TTL_MS = 4000;

/** Houdt bij wie er typt en laat mensen vanzelf verdwijnen als er geen signaal meer komt. */
export class TypingTracker {
  private readonly lastSeen = new Map<string, number>();

  constructor(private readonly ttlMs: number = TYPING_TTL_MS) {}

  touch(userId: string, now: number): void {
    this.lastSeen.set(userId, now);
  }

  clear(userId: string): void {
    this.lastSeen.delete(userId);
  }

  reset(): void {
    this.lastSeen.clear();
  }

  /** Geeft de gebruikers terug die nog typen en verwijdert de verlopen. */
  active(now: number): string[] {
    for (const [userId, seenAt] of this.lastSeen) {
      if (now - seenAt >= this.ttlMs) this.lastSeen.delete(userId);
    }
    return [...this.lastSeen.keys()];
  }
}

/** Maakt de zin boven het invoerveld, bijvoorbeeld "Anna and Bob are typing…". */
export function describeTyping(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return 'Several people are typing…';
}
