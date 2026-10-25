import { describe, expect, it } from 'vitest';
import { formatCountdown, msUntilAmsterdamMidnight } from './clock';
import { PracticeGame, WordleRules } from './WordleEngine';

describe('WordleRules.score', () => {
  it('marks an exact match as all correct', () => {
    expect(WordleRules.score('water', 'water')).toEqual(Array(5).fill('correct'));
  });

  it('marks letters in the wrong place as present', () => {
    expect(WordleRules.score('tawer', 'water')).toEqual(['present', 'correct', 'present', 'correct', 'correct']);
  });

  it('counts repeated letters only as often as they occur in the answer', () => {
    expect(WordleRules.score('allee', 'appel')).toEqual(['correct', 'present', 'absent', 'correct', 'absent']);
    expect(WordleRules.score('eerst', 'rente')).toEqual(['present', 'correct', 'present', 'absent', 'present']);
    expect(WordleRules.score('aaaab', 'abbbb')).toEqual(['correct', 'absent', 'absent', 'absent', 'correct']);
  });

  it('marks letters that are not in the word as absent', () => {
    expect(WordleRules.score('qqqqq', 'water')).toEqual(Array(5).fill('absent'));
  });
});

describe('WordleRules.keyboardMarks', () => {
  it('keeps the strongest mark per letter: correct over present over absent', () => {
    const marks = WordleRules.keyboardMarks([
      { word: 'tawer', marks: ['present', 'present', 'present', 'correct', 'correct'] },
      { word: 'water', marks: ['correct', 'correct', 'correct', 'correct', 'correct'] },
      { word: 'qqqqq', marks: Array(5).fill('absent') },
    ]);
    expect(marks.get('t')).toBe('correct');
    expect(marks.get('q')).toBe('absent');
    expect(marks.get('z')).toBeUndefined();
  });
});

describe('PracticeGame', () => {
  it('rejects words of the wrong length and unknown words', async () => {
    const game = new PracticeGame();
    await expect(game.guess('abc')).rejects.toThrow('invalid_length');
    await expect(game.guess('qqqqq')).rejects.toThrow('not_in_list');
  });

  it('starts as playing without revealing the answer', async () => {
    const state = await new PracticeGame().load();
    expect(state.status).toBe('playing');
    expect(state.answer).toBeNull();
    expect(state.guesses).toEqual([]);
  });

  it('ends after six wrong guesses and then reveals the answer', async () => {
    const game = new PracticeGame();
    let state = await game.load();
    const words = ['aarde', 'abdij', 'abuis', 'actie', 'adres', 'afval', 'agent', 'akker', 'alarm'];
    for (const word of words) {
      if (state.status !== 'playing') break;
      state = await game.guess(word);
    }
    expect(['won', 'lost']).toContain(state.status);
    expect(state.answer).not.toBeNull();
    await expect(game.guess('album')).rejects.toThrow('game_over');
  });
});

describe('clock helpers', () => {
  it('msUntilAmsterdamMidnight() is always between zero and one day', () => {
    for (const hour of [0, 5, 11, 17, 23]) {
      const ms = msUntilAmsterdamMidnight(new Date(Date.UTC(2026, 9, 25, hour, 30)));
      expect(ms).toBeGreaterThan(0);
      expect(ms).toBeLessThanOrEqual(24 * 3600 * 1000);
    }
  });

  it('msUntilAmsterdamMidnight() knows the Amsterdam offset', () => {
    // 23:30 UTC on 25 October is 00:30 on 26 October in Amsterdam (CET), so almost a full day is left.
    expect(msUntilAmsterdamMidnight(new Date(Date.UTC(2026, 9, 25, 23, 30)))).toBeGreaterThan(23 * 3600 * 1000);
    // 22:30 UTC is still 23:30 on the 25th because summer time ended that night, so only half an hour is left.
    expect(msUntilAmsterdamMidnight(new Date(Date.UTC(2026, 9, 25, 22, 30)))).toBe(30 * 60 * 1000);
  });

  it('formatCountdown() pads hours, minutes and seconds', () => {
    expect(formatCountdown(3_661_000)).toBe('01:01:01');
    expect(formatCountdown(0)).toBe('00:00:00');
  });
});
