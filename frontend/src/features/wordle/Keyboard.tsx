import type { LetterMark } from '../../core/types';

const ROWS = ['qwertyuiop', ' asdfghjkl ', '+zxcvbnm-'];

interface KeyboardProps {
  marks: Map<string, LetterMark>;
  onKey: (key: string) => void;
}

/** Virtueel QWERTY-toetsenbord dat de kleuren van de letters bijhoudt. */
export function Keyboard({ marks, onKey }: KeyboardProps) {
  return (
    <div className="wd-kb">
      {ROWS.map((line, index) => (
        <div className="wd-krow" key={index}>
          {[...line].map((char, i) => {
            if (char === ' ') return <div className="half" key={i} />;
            const key = char === '+' ? 'Enter' : char === '-' ? 'Backspace' : char;
            const wide = key.length > 1;
            return (
              <button key={key} type="button" className={`${wide ? 'wide ' : ''}${marks.get(key) ?? ''}`} aria-label={key} data-key={key}
                onClick={event => { event.currentTarget.blur(); onKey(key); }}>
                {key === 'Enter' ? 'ENTER' : key === 'Backspace' ? '⌫' : key}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
