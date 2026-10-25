import { useState } from 'react';
import type { GifItem } from '../../services/GifService';
import { GifPicker } from './GifPicker';

/** De GIF-knop naast het invoerveld; een gekozen GIF wordt meteen verstuurd. */
export function GifButton({ onPick }: { onPick: (gif: GifItem) => void }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  return (
    <>
      <button type="button" className="tool-btn gif" aria-label="Send a GIF" title="GIF" onClick={event => setAnchor(event.currentTarget.getBoundingClientRect())}>GIF</button>
      {anchor && <GifPicker anchor={anchor} onPick={onPick} onClose={() => setAnchor(null)} />}
    </>
  );
}
