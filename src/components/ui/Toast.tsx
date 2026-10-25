import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

type ToastKind = 'info' | 'success' | 'error';

interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
}

interface ToastApi {
  show: (text: string, kind?: ToastKind) => void;
  success: (text: string) => void;
  error: (text: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Toont korte meldingen rechtsonder die vanzelf verdwijnen. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => setItems(list => list.filter(item => item.id !== id)), []);

  const show = useCallback((text: string, kind: ToastKind = 'info') => {
    const id = ++counter.current;
    setItems(list => [...list.slice(-3), { id, kind, text }]);
    setTimeout(() => dismiss(id), kind === 'error' ? 6000 : 3500);
  }, [dismiss]);

  const api = useMemo<ToastApi>(() => ({
    show,
    success: text => show(text, 'success'),
    error: text => show(text, 'error'),
  }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {items.map(item => (
          <div key={item.id} className={`toast ${item.kind}`} role={item.kind === 'error' ? 'alert' : 'status'}>
            <span>{item.text}</span>
            <button aria-label="Dismiss" onClick={() => dismiss(item.id)}>✕</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside ToastProvider');
  return api;
}
