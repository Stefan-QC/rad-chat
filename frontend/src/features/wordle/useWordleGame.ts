import { useCallback, useEffect, useRef, useState } from 'react';
import { AppError, messageOf } from '../../core/AppError';
import type { LetterMark, WordleState } from '../../core/types';
import { COLS, type WordleGame } from './WordleEngine';
import type { WordleSettingsData } from './WordleSettings';
import type { WordleSounds } from './WordleSounds';

export type CellPhase = 'hidden' | 'flip-in' | 'flip-out' | 'shown';

export interface RevealState {
  row: number;
  phases: CellPhase[];
}

export interface Toast {
  id: number;
  text: string;
}

const CHEERS = ['Geniaal!', 'Prachtig!', 'Indrukwekkend!', 'Mooi!', 'Goed!', 'Pfff, net op tijd!'];
const ERRORS: Record<string, string> = {
  invalid_length: 'Te weinig letters',
  not_in_list: 'Niet in de woordenlijst',
  game_over: 'Dit spel is al afgelopen',
};

/** Alle spellogica van het bord: invoer, versturen, animaties en meldingen. */
export function useWordleGame(game: WordleGame, settings: WordleSettingsData, sounds: WordleSounds, onFinish: (state: WordleState) => void) {
  const [state, setState] = useState<WordleState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [current, setCurrent] = useState('');
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState<RevealState | null>(null);
  const [shakeRow, setShakeRow] = useState<number | null>(null);
  const [bounceRow, setBounceRow] = useState<number | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const reduce = useRef(settings.reduceMotion);
  const toastId = useRef(0);
  reduce.current = settings.reduceMotion;

  const sleep = useCallback((ms: number) => (reduce.current ? Promise.resolve() : new Promise<void>(resolve => setTimeout(resolve, ms))), []);

  const toast = useCallback((text: string, ms: number | null = 1600) => {
    const id = ++toastId.current;
    setToasts(list => [{ id, text }, ...list]);
    if (ms !== null) setTimeout(() => setToasts(list => list.filter(t => t.id !== id)), ms);
  }, []);

  useEffect(() => {
    let active = true;
    setState(null);
    setCurrent('');
    setToasts([]);
    game
      .load()
      .then(loaded => {
        if (!active) return;
        setState(loaded);
        if (loaded.status === 'lost' && loaded.answer) toast(loaded.answer.toUpperCase(), null);
      })
      .catch(e => active && setLoadError(messageOf(e)));
    return () => {
      active = false;
    };
  }, [game, toast]);

  const reject = useCallback((text: string, row: number) => {
    toast(text);
    sounds.reject();
    if (reduce.current) return;
    setShakeRow(null);
    setTimeout(() => setShakeRow(row), 0);
    setTimeout(() => setShakeRow(null), 650);
  }, [toast, sounds]);

  const runReveal = useCallback(async (row: number, marks: LetterMark[]) => {
    if (reduce.current) return;
    setReveal({ row, phases: Array<CellPhase>(COLS).fill('hidden') });
    const setPhase = (col: number, phase: CellPhase) =>
      setReveal(r => (r ? { ...r, phases: r.phases.map((p, i) => (i === col ? phase : p)) } : r));
    await Promise.all(marks.map(async (mark, col) => {
      await sleep(col * 300);
      setPhase(col, 'flip-in');
      await sleep(250);
      setPhase(col, 'flip-out');
      sounds.reveal(mark);
      await sleep(250);
      setPhase(col, 'shown');
    }));
    setReveal(null);
  }, [sleep, sounds]);

  const submit = useCallback(async () => {
    if (!state || busy || state.status !== 'playing') return;
    const row = state.guesses.length;
    if (current.length < COLS) return reject(ERRORS.invalid_length, row);
    setBusy(true);
    let next: WordleState;
    try {
      next = await game.guess(current);
    } catch (e) {
      setBusy(false);
      return reject(ERRORS[AppError.from(e).code] ?? messageOf(e), row);
    }
    setState(next);
    setCurrent('');
    await runReveal(row, next.guesses[row].marks);
    if (next.status === 'won') {
      toast(CHEERS[row] ?? 'Goed!', 2000);
      sounds.win();
      if (!reduce.current) {
        setBounceRow(row);
        await sleep(1200);
        setBounceRow(null);
      }
    } else if (next.status === 'lost' && next.answer) {
      toast(next.answer.toUpperCase(), null);
    }
    setBusy(false);
    if (next.status !== 'playing') onFinish(next);
  }, [state, busy, current, game, reject, runReveal, toast, sounds, sleep, onFinish]);

  const press = useCallback((key: string) => {
    if (!state || busy || state.status !== 'playing') return;
    if (key === 'Enter') void submit();
    else if (key === 'Backspace') setCurrent(value => value.slice(0, -1));
    else if (/^[a-z]$/.test(key) && current.length < COLS) {
      setCurrent(value => value + key);
      sounds.type();
    }
  }, [state, busy, current.length, submit, sounds]);

  return { state, loadError, current, busy, reveal, shakeRow, bounceRow, toasts, press };
}
