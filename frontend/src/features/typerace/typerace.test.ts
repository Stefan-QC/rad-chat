import { describe, expect, it } from 'vitest';
import { TypingEngine, MAX_EXTRA_CHARS } from './TypingEngine';
import { ServerClock } from './ServerClock';
import { liveStandings } from './standings';
import { formatFinish, parseTime, racePhase, rankResults, raceErrorMessage, type RacePlayer, type RaceResult } from './typerace';

const type = (engine: TypingEngine, text: string) => [...text].forEach(char => engine.typeChar(char));

describe('TypingEngine typing', () => {
  it('follows the typed letters and moves on with a space', () => {
    const engine = new TypingEngine('Hello big world.');
    type(engine, 'Hello ');
    expect(engine.activeIndex).toBe(1);
    expect(engine.typedWord(0)).toBe('Hello');
  });

  it('keeps mistakes visible and lets the player carry on', () => {
    const engine = new TypingEngine('cat dog');
    type(engine, 'cxt ');
    expect(engine.typedWord(0)).toBe('cxt');
    expect(engine.activeIndex).toBe(1);
  });

  it('validates capitals, punctuation and spaces separately', () => {
    const engine = new TypingEngine('Hi, you.');
    type(engine, 'hi,');
    expect(engine.stats(1000).correctKeystrokes).toBe(2);
    expect(engine.stats(1000).keystrokes).toBe(3);
  });

  it('ignores a space when nothing is typed yet and does not skip past the last word', () => {
    const engine = new TypingEngine('a b');
    expect(engine.typeChar(' ')).toBe(false);
    type(engine, 'a ');
    expect(engine.typeChar(' ')).toBe(false);
    type(engine, 'x');
    expect(engine.typeChar(' ')).toBe(false);
    expect(engine.activeIndex).toBe(1);
  });

  it('accepts extra letters up to a limit', () => {
    const engine = new TypingEngine('ab cd');
    type(engine, 'a'.repeat(2 + MAX_EXTRA_CHARS + 5));
    expect(engine.typedWord(0)).toHaveLength(2 + MAX_EXTRA_CHARS);
  });

  it('rejects anything that is not a single character', () => {
    const engine = new TypingEngine('ab');
    expect(engine.typeChar('')).toBe(false);
    expect(engine.typeChar('ab')).toBe(false);
  });

  it('finishes when the last word is right, without needing a space', () => {
    const engine = new TypingEngine('go now');
    type(engine, 'go no');
    expect(engine.finished).toBe(false);
    type(engine, 'w');
    expect(engine.finished).toBe(true);
    expect(engine.typeChar('x')).toBe(false);
    expect(engine.backspace()).toBe(false);
  });
});

describe('TypingEngine Backspace', () => {
  it('removes one letter at a time', () => {
    const engine = new TypingEngine('hello world');
    type(engine, 'hex');
    expect(engine.backspace()).toBe(true);
    expect(engine.typedWord(0)).toBe('he');
  });

  it('goes back to the previous word when it was wrong', () => {
    const engine = new TypingEngine('cat dog bird');
    type(engine, 'cxt ');
    expect(engine.activeIndex).toBe(1);
    expect(engine.backspace()).toBe(true);
    expect(engine.activeIndex).toBe(0);
    expect(engine.typedWord(0)).toBe('cxt');
    engine.backspace();
    engine.backspace();
    type(engine, 'at');
    expect(engine.typedWord(0)).toBe('cat');
  });

  it('does not go back into a word that was already right', () => {
    const engine = new TypingEngine('cat dog');
    type(engine, 'cat ');
    expect(engine.backspace()).toBe(false);
    expect(engine.activeIndex).toBe(1);
  });

  it('does nothing at the very start', () => {
    expect(new TypingEngine('cat').backspace()).toBe(false);
  });

  it('deletes a whole word with Ctrl+Backspace, or steps back to a wrong word first', () => {
    const engine = new TypingEngine('cat dog bird');
    type(engine, 'cxt dxg');
    expect(engine.backspaceWord()).toBe(true);
    expect(engine.typedWord(1)).toBe('');
    expect(engine.backspaceWord()).toBe(true);
    expect(engine.activeIndex).toBe(0);
    expect(engine.typedWord(0)).toBe('');
  });

  it('keeps Ctrl+Backspace from touching correct words', () => {
    const engine = new TypingEngine('cat dog');
    type(engine, 'cat ');
    expect(engine.backspaceWord()).toBe(false);
  });
});

describe('TypingEngine statistics', () => {
  it('counts correct characters, spaces after right words and the right start of the current word', () => {
    const engine = new TypingEngine('cat dog bird');
    type(engine, 'cat dxg bi');
    // "cat " = 4, "dxg" is wrong = 0, "bi" is right so far = 2
    expect(engine.stats(60_000).correctChars).toBe(4 + 0 + 2);
  });

  it('calculates words per minute with five characters per word', () => {
    const engine = new TypingEngine('aaaaa aaaaa aaaaa');
    type(engine, 'aaaaa aaaaa ');
    expect(engine.stats(60_000).wpm).toBe(2.4);
    expect(engine.stats(30_000).wpm).toBe(4.8);
  });

  it('avoids absurd speeds in the first second', () => {
    const engine = new TypingEngine('aaaaa aaaaa');
    type(engine, 'aaaaa ');
    expect(engine.stats(10).wpm).toBe(engine.stats(1000).wpm);
  });

  it('keeps a corrected mistake in the accuracy', () => {
    const engine = new TypingEngine('cat');
    type(engine, 'cx');
    engine.backspace();
    type(engine, 'at');
    const stats = engine.stats(5000);
    expect(stats.keystrokes).toBe(4);
    expect(stats.correctKeystrokes).toBe(3);
    expect(stats.accuracy).toBe(75);
  });

  it('does not count Backspace as a keystroke', () => {
    const engine = new TypingEngine('cat');
    type(engine, 'c');
    engine.backspace();
    expect(engine.stats(1000).keystrokes).toBe(1);
  });

  it('starts at 100 percent accuracy and 0 progress', () => {
    const stats = new TypingEngine('cat dog').stats(1000);
    expect(stats.accuracy).toBe(100);
    expect(stats.progress).toBe(0);
  });

  it('reaches exactly the full text length and 100 percent when finished', () => {
    const text = 'Cat, dog. Bird.';
    const engine = new TypingEngine(text);
    type(engine, text);
    const stats = engine.stats(10_000);
    expect(engine.finished).toBe(true);
    expect(stats.correctChars).toBe(text.length);
    expect(stats.progress).toBe(100);
    expect(stats.accuracy).toBe(100);
  });

  it('never reports more correct characters than correct keystrokes, which the server also checks', () => {
    const engine = new TypingEngine('cat dog bird fish');
    type(engine, 'cxt');
    engine.backspace();
    engine.backspace();
    type(engine, 'at dog ');
    const stats = engine.stats(8000);
    expect(stats.correctChars).toBeLessThanOrEqual(stats.correctKeystrokes);
  });
});

const result = (user: string, patch: Partial<RaceResult>): RaceResult => ({
  lobby_id: 'l', round: 1, user_id: user, correct_chars: 0, keystrokes: 0, correct_keystrokes: 0, wpm: 0, accuracy: 100, progress: 0, finished: false, finished_ms: null, ...patch,
});

describe('rankResults', () => {
  it('puts finished players first, ordered by finish time', () => {
    const ranked = rankResults([
      result('slow', { finished: true, finished_ms: 9000, progress: 100 }),
      result('far', { progress: 80, wpm: 90 }),
      result('fast', { finished: true, finished_ms: 7000, progress: 100 }),
    ]);
    expect(ranked.map(r => r.user_id)).toEqual(['fast', 'slow', 'far']);
    expect(ranked.map(r => r.place)).toEqual([1, 2, 3]);
  });

  it('ranks by correct progress when nobody finished, then by WPM', () => {
    const ranked = rankResults([
      result('a', { progress: 40, wpm: 50 }),
      result('b', { progress: 60, wpm: 40 }),
      result('c', { progress: 60, wpm: 70 }),
    ]);
    expect(ranked.map(r => r.user_id)).toEqual(['c', 'b', 'a']);
  });

  it('does not change the list it is given', () => {
    const input = [result('a', { progress: 1 }), result('b', { progress: 2 })];
    rankResults(input);
    expect(input.map(r => r.user_id)).toEqual(['a', 'b']);
  });
});

describe('racePhase', () => {
  const lobby = (status: 'lobby' | 'countdown' | 'playing' | 'finished') => ({
    status, starts_at: '2026-01-01T10:00:03.000Z', ends_at: '2026-01-01T10:00:33.000Z',
  });
  const at = (seconds: number) => Date.parse('2026-01-01T10:00:00.000Z') + seconds * 1000;

  it('follows the server times', () => {
    expect(racePhase(lobby('countdown'), at(1))).toBe('countdown');
    expect(racePhase(lobby('countdown'), at(3))).toBe('playing');
    expect(racePhase(lobby('playing'), at(20))).toBe('playing');
    expect(racePhase(lobby('playing'), at(34))).toBe('settling');
    expect(racePhase(lobby('playing'), at(36))).toBe('finished');
  });

  it('trusts the stored status for lobby and finished', () => {
    expect(racePhase(lobby('lobby'), at(10))).toBe('lobby');
    expect(racePhase(lobby('finished'), at(10))).toBe('finished');
  });
});

describe('helpers', () => {
  it('formats a finish time', () => {
    expect(formatFinish(12_340)).toBe('12.3s');
    expect(formatFinish(null)).toBe('–');
  });

  it('turns database errors into friendly sentences', () => {
    expect(raceErrorMessage('lobby_full')).toContain('full');
    expect(raceErrorMessage('whatever')).toContain('Something went wrong');
  });
});

describe('parseTime', () => {
  it('reads database timestamps with microseconds', () => {
    expect(parseTime('2026-01-01T10:00:00.123456+00:00')).toBe(Date.parse('2026-01-01T10:00:00.123Z'));
    expect(parseTime('2026-01-01T10:00:00+00:00')).toBe(Date.parse('2026-01-01T10:00:00Z'));
  });
});

describe('ServerClock', () => {
  it('measures the offset in the middle of the round trip', () => {
    const clock = new ServerClock();
    clock.update(10_000, 1000, 1100); // de server zat op 10 000 toen wij op 1050 zaten
    expect(clock.offset).toBe(10_000 - 1050);
  });

  it('prefers the measurement with the shortest round trip', () => {
    const clock = new ServerClock();
    clock.update(10_000, 1000, 1020);
    const good = clock.offset;
    clock.update(99_999, 2000, 2800);
    expect(Math.abs(clock.offset - good)).toBeLessThan(10_000);
    clock.update(10_500, 3000, 3010);
    expect(clock.offset).toBe(10_500 - 3005);
  });

  it('adds the offset to the local time', () => {
    const clock = new ServerClock();
    clock.update(Date.now() + 5000, Date.now(), Date.now());
    expect(Math.abs(clock.now() - (Date.now() + 5000))).toBeLessThan(50);
  });
});

describe('liveStandings', () => {
  const player = (id: string): RacePlayer => ({ lobby_id: 'l', user_id: id, play_from: 1, joined_at: '', last_seen: '' });
  const live = (userId: string, progress: number, wpm: number, finished = false) => ({ userId, correctChars: 0, progress, wpm, accuracy: 97, finished });
  const saved = (user: string, patch: Partial<RaceResult>): RaceResult => ({
    lobby_id: 'l', round: 1, user_id: user, correct_chars: 0, keystrokes: 0, correct_keystrokes: 0, wpm: 0, accuracy: 100, progress: 0, finished: false, finished_ms: null, ...patch,
  });

  it('uses the own numbers for yourself and the fast connection for the others', () => {
    const rows = liveStandings([player('me'), player('bob')], [], { bob: live('bob', 30, 50) }, 'me', live('me', 45, 60));
    expect(rows.map(r => [r.userId, r.progress])).toEqual([['me', 45], ['bob', 30]]);
  });

  it('falls back on the saved results for somebody who sent nothing live', () => {
    const rows = liveStandings([player('me'), player('bob')], [saved('bob', { progress: 70, wpm: 80 })], {}, 'me', live('me', 10, 20));
    expect(rows[0]).toMatchObject({ userId: 'bob', progress: 70, wpm: 80 });
  });

  it('puts finished players first by finish time', () => {
    const rows = liveStandings(
      [player('a'), player('b'), player('c')],
      [saved('a', { finished: true, finished_ms: 9000 }), saved('b', { finished: true, finished_ms: 8000 })],
      { c: live('c', 99, 100) }, 'me', null,
    );
    expect(rows.map(r => r.userId)).toEqual(['b', 'a', 'c']);
    expect(rows[0].progress).toBe(100);
  });

  it('shows a player without any numbers at zero', () => {
    const rows = liveStandings([player('x')], [], {}, 'me', null);
    expect(rows[0]).toMatchObject({ progress: 0, wpm: 0, accuracy: 100, finished: false });
  });
});
