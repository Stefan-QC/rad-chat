import { describe, expect, it } from 'vitest';
import { TYPING_TTL_MS, TypingTracker, describeTyping } from './typing';

describe('TypingTracker', () => {
  it('reports people who typed recently', () => {
    const tracker = new TypingTracker();
    tracker.touch('anna', 1000);
    tracker.touch('bob', 1500);
    expect(tracker.active(2000)).toEqual(['anna', 'bob']);
  });

  it('drops people once the time to live has passed', () => {
    const tracker = new TypingTracker();
    tracker.touch('anna', 0);
    tracker.touch('bob', 2000);
    expect(tracker.active(TYPING_TTL_MS)).toEqual(['bob']);
    expect(tracker.active(2000 + TYPING_TTL_MS)).toEqual([]);
  });

  it('keeps someone typing while new signals arrive', () => {
    const tracker = new TypingTracker();
    tracker.touch('anna', 0);
    tracker.touch('anna', 3000);
    expect(tracker.active(6000)).toEqual(['anna']);
  });

  it('removes a person right away on clear and everyone on reset', () => {
    const tracker = new TypingTracker();
    tracker.touch('anna', 0);
    tracker.touch('bob', 0);
    tracker.clear('anna');
    expect(tracker.active(1)).toEqual(['bob']);
    tracker.reset();
    expect(tracker.active(1)).toEqual([]);
  });
});

describe('describeTyping', () => {
  it('words one, two and many people', () => {
    expect(describeTyping([])).toBe('');
    expect(describeTyping(['Anna'])).toBe('Anna is typing…');
    expect(describeTyping(['Anna', 'Bob'])).toBe('Anna and Bob are typing…');
    expect(describeTyping(['Anna', 'Bob', 'Cas'])).toBe('Several people are typing…');
  });
});
