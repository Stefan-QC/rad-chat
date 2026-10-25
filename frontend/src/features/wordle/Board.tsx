import type { WordleState } from '../../core/types';
import { COLS, ROWS } from './WordleEngine';
import type { RevealState } from './useWordleGame';

interface BoardProps {
  state: WordleState;
  current: string;
  reveal: RevealState | null;
  shakeRow: number | null;
  bounceRow: number | null;
}

function cellClass(state: WordleState, row: number, col: number, letter: string, reveal: RevealState | null): string {
  const guess = state.guesses[row];
  if (!guess) return letter ? 'cell filled pop' : 'cell';
  const phase = reveal?.row === row ? reveal.phases[col] : 'shown';
  if (phase === 'hidden') return 'cell filled';
  if (phase === 'flip-in') return 'cell filled flip-in';
  return `cell ${guess.marks[col]}${phase === 'flip-out' ? ' flip-out' : ''}`;
}

/** Het speelbord van 6 rijen en 5 kolommen. */
export function Board({ state, current, reveal, shakeRow, bounceRow }: BoardProps) {
  return (
    <div className="wd-board" role="grid" aria-label="Wordle board">
      {Array.from({ length: ROWS }, (_, row) => {
        const typing = row === state.guesses.length;
        return (
          <div key={row} className={`wd-row${shakeRow === row ? ' shake' : ''}`} role="row">
            {Array.from({ length: COLS }, (_, col) => {
              const letter = state.guesses[row]?.word[col] ?? (typing ? current[col] ?? '' : '');
              const bounce = bounceRow === row;
              return (
                <div
                  key={`${col}-${letter}`}
                  role="gridcell"
                  className={`${cellClass(state, row, col, letter, reveal)}${bounce ? ' bounce' : ''}`}
                  style={bounce ? { animationDelay: `${col * 100}ms` } : undefined}
                >
                  {letter}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
