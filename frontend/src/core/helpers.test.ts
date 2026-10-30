import { describe, expect, it } from 'vitest';
import { AppError, messageOf } from './AppError';
import { Emitter } from './Emitter';
import { dayKey, formatDuration, isoDay } from './format';
import { findMentionQuery, matchPeople } from '../components/chat/MentionSuggestions';
import { AttachmentService, MAX_IMAGE_BYTES } from '../services/AttachmentService';
import type { Profile } from './types';

describe('AppError', () => {
  it('maps known database messages to friendly text', () => {
    expect(AppError.from(new Error('rate_limited')).friendly).toMatch(/too fast/);
    expect(messageOf({ message: 'forbidden' })).toMatch(/not allowed/);
  });

  it('keeps unknown messages as they are and handles odd input', () => {
    expect(messageOf(new Error('something else'))).toBe('something else');
    expect(messageOf('plain string')).toBe('plain string');
  });

  it('returns an existing AppError unchanged', () => {
    const error = new AppError('x', 'friendly');
    expect(AppError.from(error)).toBe(error);
  });
});

describe('Emitter', () => {
  class Counter extends Emitter<{ tick: number }> {
    fire(value: number) { this.emit('tick', value); }
  }

  it('delivers events to listeners and stops after unsubscribing', () => {
    const counter = new Counter();
    const seen: number[] = [];
    const stop = counter.on('tick', value => seen.push(value));
    counter.fire(1);
    stop();
    counter.fire(2);
    expect(seen).toEqual([1]);
  });
});

describe('format helpers', () => {
  it('isoDay() formats a local date with zero padding', () => {
    expect(isoDay(new Date(2026, 0, 5, 12))).toBe('2026-01-05');
    expect(isoDay(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });

  it('dayKey() is equal for times on the same day', () => {
    expect(dayKey('2026-10-25T01:00:00Z')).toBe(dayKey('2026-10-25T02:00:00Z'));
  });

  it('formatDuration() shows seconds, minutes and hours', () => {
    expect(formatDuration('2026-01-01T00:00:00Z', '2026-01-01T00:00:45Z')).toBe('45s');
    expect(formatDuration('2026-01-01T00:00:00Z', '2026-01-01T00:02:05Z')).toBe('2m 5s');
    expect(formatDuration('2026-01-01T00:00:00Z', '2026-01-01T01:30:00Z')).toBe('1h 30m');
  });
});

describe('mention helpers', () => {
  const people = ['anna', 'bram', 'anouk'].map(name => ({ id: name, username: name, display_name: name[0].toUpperCase() + name.slice(1) }) as Profile);

  it('findMentionQuery() finds the word after the last @ before the cursor', () => {
    expect(findMentionQuery('hoi @an', 7)).toEqual({ query: 'an', start: 4 });
    expect(findMentionQuery('@', 1)).toEqual({ query: '', start: 0 });
  });

  it('findMentionQuery() ignores @ inside words and after spaces', () => {
    expect(findMentionQuery('mail@bedrijf', 12)).toBeNull();
    expect(findMentionQuery('hoi @anna ', 10)).toBeNull();
  });

  it('matchPeople() matches usernames by prefix and names by substring, with a limit', () => {
    expect(matchPeople(people, 'an').map(p => p.username)).toEqual(['anna', 'anouk']);
    expect(matchPeople(people, 'ram').map(p => p.username)).toEqual(['bram']);
    expect(matchPeople(people, '', 2)).toHaveLength(2);
  });
});

describe('AttachmentService.validate', () => {
  const file = (type: string, size: number) => new File([new Uint8Array(size)], 'x', { type });

  it('accepts png, jpeg, webp and gif up to 5 MB', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/gif']) expect(AttachmentService.validate(file(type, 100))).toBeNull();
  });

  it('rejects other types, empty files and files over 5 MB', () => {
    expect(AttachmentService.validate(file('application/pdf', 100))).toMatch(/Only PNG/);
    expect(AttachmentService.validate(file('image/png', 0))).toMatch(/empty/);
    expect(AttachmentService.validate(file('image/png', MAX_IMAGE_BYTES + 1))).toMatch(/5 MB/);
  });
});
