import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { TypingEngine } from './TypingEngine';

interface WordProps {
  target: string;
  typed: string;
  state: 'past' | 'active' | 'upcoming';
}

/** Eén woord met per letter de kleur: juist, fout, gemist of nog niet getypt, plus extra letters achter het woord. */
const Word = memo(function Word({ target, typed, state }: WordProps) {
  const letters = [...target].map((letter, index) => {
    let kind = '';
    if (index < typed.length) kind = typed[index] === letter ? 'c' : 'w';
    else if (state === 'past') kind = 'm';
    return <span key={index} className={`l ${kind}`}>{letter}</span>;
  });
  const extras = [...typed.slice(target.length)].map((letter, index) => <span key={`x${index}`} className="l x">{letter}</span>);
  const bad = state === 'past' && typed !== target;
  return <span className={`tr-word ${state}${bad ? ' bad' : ''}`}>{letters}{extras}</span>;
});

interface WordsViewProps {
  engine: TypingEngine;
  /** Verandert bij elke aanslag, zodat het veld opnieuw wordt getekend. */
  version: number;
}

interface Layout {
  x: number;
  y: number;
  scroll: number;
}

/** Het tekstveld naar het voorbeeld van Monkeytype: drie regels, de actieve regel schuift mee en een vloeiende cursor. */
export const WordsView = memo(function WordsView({ engine, version }: WordsViewProps) {
  const inner = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<Layout>({ x: 0, y: 0, scroll: 0 });
  const [moving, setMoving] = useState(false);

  useLayoutEffect(() => {
    const root = inner.current;
    const word = root?.children[engine.activeIndex] as HTMLElement | undefined;
    if (!root || !word) return;
    const letters = word.querySelectorAll<HTMLElement>('.l');
    const typedLength = engine.typedWord(engine.activeIndex).length;
    const target = letters[Math.min(typedLength, letters.length - 1)];
    const x = word.offsetLeft + (target ? target.offsetLeft + (typedLength >= letters.length ? target.offsetWidth : 0) : 0);
    const next = { x, y: word.offsetTop, scroll: Math.max(0, word.offsetTop - word.offsetHeight) };
    setLayout(current => (current.x === next.x && current.y === next.y && current.scroll === next.scroll ? current : next));
  }, [engine, version]);

  // De cursor knippert alleen als je even niet typt.
  useEffect(() => {
    setMoving(true);
    const timer = setTimeout(() => setMoving(false), 600);
    return () => clearTimeout(timer);
  }, [version]);

  return (
    <div className="tr-words" aria-label="Text to type" role="img">
      <div className="tr-words-inner" ref={inner} style={{ transform: `translateY(${-layout.scroll}px)` }}>
        {engine.words.map((target, index) => (
          <Word
            key={index}
            target={target}
            typed={engine.typedWord(index)}
            state={index < engine.activeIndex ? 'past' : index === engine.activeIndex ? 'active' : 'upcoming'}
          />
        ))}
        <span className={`tr-caret${moving ? ' moving' : ''}`} style={{ transform: `translate(${layout.x}px, ${layout.y}px)` }} />
      </div>
    </div>
  );
});
