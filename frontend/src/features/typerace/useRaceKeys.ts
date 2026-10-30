import { useEffect, useRef } from 'react';
import type { TypingEngine } from './TypingEngine';

/**
 * Vangt de toetsaanslagen van de race op: er is geen invoerveld, je typt rechtstreeks op de tekst.
 * Plakken is geblokkeerd, en snelkoppelingen met Ctrl, Alt of Meta blijven van de browser (behalve Ctrl+Backspace).
 */
export function useRaceKeys(enabled: boolean, engine: TypingEngine, onChange: () => void): void {
  const change = useRef(onChange);
  change.current = onChange;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.metaKey || event.altKey && !event.ctrlKey) return;
      let changed = false;
      if (event.key === 'Backspace') {
        event.preventDefault();
        changed = event.ctrlKey ? engine.backspaceWord() : engine.backspace();
      } else if (event.key.length === 1 && !event.ctrlKey) {
        event.preventDefault();
        if (event.repeat) return;
        changed = engine.typeChar(event.key);
      } else {
        return;
      }
      if (changed) change.current();
    };
    const blockPaste = (event: Event) => event.preventDefault();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('paste', blockPaste);
    window.addEventListener('drop', blockPaste);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('paste', blockPaste);
      window.removeEventListener('drop', blockPaste);
    };
  }, [enabled, engine]);
}
