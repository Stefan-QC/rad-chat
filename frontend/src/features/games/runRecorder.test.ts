import { describe, expect, it, vi } from 'vitest';
import type { GameService } from '../../services/GameService';
import { RunRecorder } from './RunRecorder';

const saved = { id: 1, game: 'tetris' as const, score: 1234, stats: {}, created_at: '2026-01-01T00:00:00Z' };
const fake = (overrides: Partial<Record<'start' | 'submit', unknown>> = {}) =>
  ({ start: vi.fn().mockResolvedValue('session-1'), submit: vi.fn().mockResolvedValue(saved), ...overrides }) as unknown as GameService & {
    start: ReturnType<typeof vi.fn>; submit: ReturnType<typeof vi.fn>;
  };

describe('RunRecorder', () => {
  it('opens a session and submits the report once', async () => {
    const games = fake();
    const recorder = new RunRecorder(games, 'tetris');
    await recorder.begin();
    expect(recorder.state).toBe('ready');
    expect(await recorder.submit({ clears: [1] })).toEqual(saved);
    expect(games.submit).toHaveBeenCalledWith('session-1', { clears: [1] });
    expect(recorder.state).toBe('saved');
  });

  it('never submits the same run twice', async () => {
    const games = fake();
    const recorder = new RunRecorder(games, 'doom');
    await recorder.begin();
    await Promise.all([recorder.submit({}), recorder.submit({})]);
    await recorder.submit({});
    expect(games.submit).toHaveBeenCalledTimes(1);
  });

  it('keeps the game playable when the session cannot be opened', async () => {
    const games = fake({ start: vi.fn().mockRejectedValue(new Error('function does not exist')) });
    const recorder = new RunRecorder(games, 'tetris');
    await recorder.begin();
    expect(recorder.state).toBe('unavailable');
    expect(recorder.canSave).toBe(false);
    expect(await recorder.submit({})).toBeNull();
    expect(games.submit).not.toHaveBeenCalled();
  });

  it('reports a refused submission without throwing', async () => {
    const games = fake({ submit: vi.fn().mockRejectedValue(new Error('invalid_report')) });
    const recorder = new RunRecorder(games, 'tetris');
    await recorder.begin();
    expect(await recorder.submit({ clears: [9] })).toBeNull();
    expect(recorder.state).toBe('failed');
    expect(recorder.error).toBeTruthy();
  });

  it('waits for a session that is still being opened', async () => {
    let release: (id: string) => void = () => undefined;
    const games = fake({ start: vi.fn().mockImplementation(() => new Promise<string>(resolve => { release = resolve; })) });
    const recorder = new RunRecorder(games, 'tetris');
    const begun = recorder.begin();
    const submitted = recorder.submit({});
    release('late-session');
    await begun;
    expect(await submitted).toEqual(saved);
  });

  it('skips a run without points so nothing stays on saving', async () => {
    const games = fake();
    const recorder = new RunRecorder(games, 'doom');
    await recorder.begin();
    recorder.skip();
    expect(recorder.state).toBe('skipped');
    expect(await recorder.submit({})).toBeNull();
    expect(games.submit).not.toHaveBeenCalled();
  });
});
