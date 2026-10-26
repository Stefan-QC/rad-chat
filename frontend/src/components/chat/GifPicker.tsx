import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useServices } from '../../app/ServicesContext';
import { AppError } from '../../core/AppError';
import type { GifItem } from '../../services/GifService';

interface GifPickerProps {
  anchor: DOMRect;
  onPick: (gif: GifItem) => void;
  onClose: () => void;
}

const SEARCH_DELAY_MS = 350;

function friendlyError(error: unknown): string {
  const status = error instanceof AppError ? error.code : '';
  if (status === 'http_502' || status === 'http_503' || status === 'http_404' || status === 'network') {
    return 'GIFs are not available right now. Ask an admin to check the GIF settings.';
  }
  if (status === 'http_429') return 'Too many GIF searches. Try again in a minute.';
  return error instanceof AppError ? error.friendly : 'Something went wrong while loading GIFs.';
}

/** Zoekvenster voor GIF's: toont eerst wat populair is en zoekt daarna terwijl je typt. */
export function GifPicker({ anchor, onPick, onClose }: GifPickerProps) {
  const { gifs } = useServices();
  const root = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<GifItem[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [provider, setProvider] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (text: string, position?: string) => {
    setLoading(true);
    setError(null);
    try {
      const page = text ? await gifs.search(text, position) : await gifs.trending(position);
      setItems(current => (position ? [...current, ...page.results] : page.results));
      setNext(page.next);
      if (page.provider) setProvider(page.provider);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [gifs]);

  useEffect(() => {
    const timer = setTimeout(() => void load(query.trim()), query ? SEARCH_DELAY_MS : 0);
    return () => clearTimeout(timer);
  }, [query, load]);

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

  const width = 380;
  const height = 460;
  const left = Math.max(8, Math.min(anchor.right - width, window.innerWidth - width - 8));
  const top = anchor.top - height - 8 >= 8 ? anchor.top - height - 8 : Math.min(anchor.bottom + 8, window.innerHeight - height - 8);

  return createPortal(
    <div className="gif-pop" ref={root} role="dialog" aria-label="Choose a GIF" style={{ left, top, width, height }}>
      <input className="text-input" type="search" autoFocus value={query} placeholder="Search GIFs…" aria-label="Search GIFs" onChange={event => setQuery(event.target.value)} />
      <div className="gif-scroll">
        {error && <p className="gif-note" role="alert">{error}</p>}
        {!error && !loading && items.length === 0 && <p className="gif-note">No GIFs found.</p>}
        <div className="gif-grid">
          {items.map(gif => (
            <button key={gif.id} type="button" className="gif-item" title={gif.title} onClick={() => { onPick(gif); onClose(); }}>
              <img src={gif.preview_url} alt={gif.title || 'GIF'} loading="lazy" referrerPolicy="no-referrer" />
            </button>
          ))}
        </div>
        {loading && <p className="gif-note">Loading…</p>}
        {!loading && next && <button type="button" className="btn secondary small gif-more" onClick={() => void load(query.trim(), next)}>Load more</button>}
      </div>
      <footer className="gif-foot">{provider ? <>Powered by <b>{provider.toUpperCase()}</b></> : 'GIFs come from an external provider.'}</footer>
    </div>,
    document.body,
  );
}
