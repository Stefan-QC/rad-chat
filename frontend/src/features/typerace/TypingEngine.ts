/** Hoeveel extra tekens iemand achter een woord mag typen voordat verder typen wordt genegeerd. */
export const MAX_EXTRA_CHARS = 10;

export interface TypingStats {
  /** Tekens van volledig juiste woorden (met de spatie erachter) plus het juiste begin van het huidige woord. */
  correctChars: number;
  keystrokes: number;
  correctKeystrokes: number;
  /** Woorden per minuut, uitgaande van vijf tekens per woord. */
  wpm: number;
  /** Percentage juiste aanslagen; een verbeterde fout blijft meetellen. */
  accuracy: number;
  /** Percentage van de tekst dat juist is afgewerkt. */
  progress: number;
}

/**
 * De typregels van de race, naar het model van Monkeytype: je typt woord voor woord, een spatie gaat naar het volgende woord,
 * fouten blijven zichtbaar totdat je ze met Backspace herstelt, en je kunt terug naar een vorig woord als dat nog fout is.
 * Telling: Backspace telt niet als aanslag, elke andere aanslag wel (ook spaties), en een gecorrigeerde fout kost nog steeds nauwkeurigheid.
 */
export class TypingEngine {
  readonly words: string[];
  private readonly typed: string[];
  private active = 0;
  private keystrokes = 0;
  private correctKeystrokes = 0;

  constructor(readonly text: string) {
    this.words = text.split(' ');
    this.typed = this.words.map(() => '');
  }

  get activeIndex(): number {
    return this.active;
  }

  typedWord(index: number): string {
    return this.typed[index] ?? '';
  }

  /** De race is klaar zodra het laatste woord helemaal juist getypt is; een spatie is daarvoor niet nodig. */
  get finished(): boolean {
    const last = this.words.length - 1;
    return this.active === last && this.typed[last] === this.words[last];
  }

  /** Verwerkt één teken; geeft terug of de aanslag is aangenomen. */
  typeChar(char: string): boolean {
    if (this.finished || char.length !== 1) return false;
    if (char === ' ') return this.nextWord();
    const word = this.words[this.active];
    const current = this.typed[this.active];
    if (current.length >= word.length + MAX_EXTRA_CHARS) return false;
    this.keystrokes += 1;
    if (word[current.length] === char) this.correctKeystrokes += 1;
    this.typed[this.active] = current + char;
    return true;
  }

  /** Verwijdert één teken, en gaat zo nodig terug naar het vorige woord als dat fout was. */
  backspace(): boolean {
    if (this.finished) return false;
    if (this.typed[this.active].length > 0) {
      this.typed[this.active] = this.typed[this.active].slice(0, -1);
      return true;
    }
    return this.stepBack();
  }

  /** Ctrl+Backspace: wist het hele huidige woord, of eerst terug naar een fout vorig woord. */
  backspaceWord(): boolean {
    if (this.finished) return false;
    if (this.typed[this.active].length === 0 && !this.stepBack()) return false;
    this.typed[this.active] = '';
    return true;
  }

  stats(elapsedMs: number): TypingStats {
    const correctChars = this.correctChars();
    const minutes = Math.max(elapsedMs, 1000) / 60_000;
    return {
      correctChars,
      keystrokes: this.keystrokes,
      correctKeystrokes: this.correctKeystrokes,
      wpm: Math.round((correctChars / 5 / minutes) * 10) / 10,
      accuracy: this.keystrokes === 0 ? 100 : Math.round((1000 * this.correctKeystrokes) / this.keystrokes) / 10,
      progress: Math.round((1000 * correctChars) / this.text.length) / 10,
    };
  }

  private correctChars(): number {
    let total = 0;
    for (let i = 0; i < this.active; i += 1) {
      if (this.typed[i] === this.words[i]) total += this.words[i].length + 1;
    }
    const word = this.words[this.active];
    const current = this.typed[this.active];
    let prefix = 0;
    while (prefix < current.length && prefix < word.length && current[prefix] === word[prefix]) prefix += 1;
    return total + prefix;
  }

  private nextWord(): boolean {
    const typedHere = this.typed[this.active];
    if (typedHere.length === 0 || this.active >= this.words.length - 1) return false;
    this.keystrokes += 1;
    if (typedHere === this.words[this.active]) this.correctKeystrokes += 1;
    this.active += 1;
    return true;
  }

  /** Terug naar het vorige woord, maar alleen als dat fout was; juiste woorden staan vast. */
  private stepBack(): boolean {
    const previous = this.active - 1;
    if (previous < 0 || this.typed[previous] === this.words[previous]) return false;
    this.active = previous;
    return true;
  }
}
