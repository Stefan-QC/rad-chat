import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { EMOJI_GROUPS, QUICK_REACTIONS } from '../../core/emoji';

interface EmojiPickerProps {
  anchor: DOMRect;
  onPick: (emoji: string) => void;
  onClose: () => void;
}

/** Klein uitklapvenster met snelle reacties en een emoji-raster; sluit bij Esc of een klik ernaast. */
export function EmojiPicker({ anchor, onPick, onClose }: EmojiPickerProps) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    const onClick = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [onClose]);

  const pick = (emoji: string) => {
    onPick(emoji);
    onClose();
  };

  // Valt de ruimte onder de knop te klein, dan klapt het venster naar boven open.
  const width = 300;
  const height = 330;
  const left = Math.max(8, Math.min(anchor.right - width, window.innerWidth - width - 8));
  const below = anchor.bottom + 6 + height <= window.innerHeight;
  const top = below ? anchor.bottom + 6 : Math.max(8, anchor.top - height - 6);

  return createPortal(
    <div className="emoji-pop" ref={root} role="dialog" aria-label="Choose an emoji" style={{ left, top }}>
      <div className="emoji-quick">
        {QUICK_REACTIONS.map(emoji => <button key={emoji} type="button" onClick={() => pick(emoji)} aria-label={emoji}>{emoji}</button>)}
      </div>
      <div className="emoji-scroll">
        {EMOJI_GROUPS.map(group => (
          <section key={group.label}>
            <h4>{group.label}</h4>
            <div className="emoji-grid">
              {group.emojis.map(emoji => <button key={emoji} type="button" onClick={() => pick(emoji)} aria-label={emoji}>{emoji}</button>)}
            </div>
          </section>
        ))}
      </div>
    </div>,
    document.body,
  );
}
