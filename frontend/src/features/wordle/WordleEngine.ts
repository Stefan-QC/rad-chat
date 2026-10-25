import type { LetterMark, WordleGuess, WordleState } from '../../core/types';
import type { WordleService } from '../../services/WordleService';
import { PRACTICE_WORDS } from './words';

export const ROWS = 6;
export const COLS = 5;

/** Pure spelregels die zowel voor de oefenmodus als voor de toetsenbordkleuren gebruikt worden. */
export class WordleRules {
  /** Twee rondes, zodat een letter nooit vaker gemarkeerd wordt dan hij in het woord voorkomt. */
  static score(guess: string, answer: string): LetterMark[] {
    const marks: LetterMark[] = Array(COLS).fill('absent');
    const remaining: Record<string, number> = {};
    for (let i = 0; i < COLS; i++) {
      if (guess[i] === answer[i]) marks[i] = 'correct';
      else remaining[answer[i]] = (remaining[answer[i]] ?? 0) + 1;
    }
    for (let i = 0; i < COLS; i++) {
      if (marks[i] === 'correct' || !remaining[guess[i]]) continue;
      marks[i] = 'present';
      remaining[guess[i]]--;
    }
    return marks;
  }

  /** Groen gaat boven geel en geel boven grijs. */
  static keyboardMarks(guesses: WordleGuess[]): Map<string, LetterMark> {
    const rank: Record<LetterMark, number> = { absent: 1, present: 2, correct: 3 };
    const best = new Map<string, LetterMark>();
    for (const guess of guesses) {
      guess.marks.forEach((mark, i) => {
        const letter = guess.word[i];
        const current = best.get(letter);
        if (!current || rank[mark] > rank[current]) best.set(letter, mark);
      });
    }
    return best;
  }
}

export type GameMode = 'daily' | 'practice';

export interface WordleGame {
  readonly mode: GameMode;
  load(): Promise<WordleState>;
  guess(word: string): Promise<WordleState>;
}

/** Dagelijks spel: de server houdt het woord geheim en beoordeelt elke poging. */
export class DailyGame implements WordleGame {
  readonly mode = 'daily' as const;

  constructor(private readonly service: WordleService) {}

  load(): Promise<WordleState> {
    return this.service.state();
  }

  guess(word: string): Promise<WordleState> {
    return this.service.guess(word);
  }
}

/** Oefenspel: een willekeurig woord dat volledig in de browser wordt beoordeeld. */
export class PracticeGame implements WordleGame {
  readonly mode = 'practice' as const;
  private readonly answer = PRACTICE_WORDS[Math.floor(Math.random() * PRACTICE_WORDS.length)];
  private guesses: WordleGuess[] = [];

  async load(): Promise<WordleState> {
    return this.snapshot();
  }

  async guess(word: string): Promise<WordleState> {
    const clean = word.trim().toLowerCase();
    if (!/^[a-z]{5}$/.test(clean)) throw new Error('invalid_length');
    if (!PRACTICE_WORDS.includes(clean)) throw new Error('not_in_list');
    if (this.snapshot().status !== 'playing') throw new Error('game_over');
    this.guesses.push({ word: clean, marks: WordleRules.score(clean, this.answer) });
    return this.snapshot();
  }

  private snapshot(): WordleState {
    const won = this.guesses.at(-1)?.word === this.answer;
    const status = won ? 'won' : this.guesses.length >= ROWS ? 'lost' : 'playing';
    return {
      day: 'practice',
      status,
      points: 0,
      guesses: [...this.guesses],
      answer: status === 'playing' ? null : this.answer,
    };
  }
}
