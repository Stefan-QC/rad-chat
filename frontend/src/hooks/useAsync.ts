import { useCallback, useEffect, useRef, useState } from 'react';
import { messageOf } from '../core/AppError';

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/** Laadt data met een loader en biedt een reload-functie; een nieuwe loader start vanzelf opnieuw. */
export function useAsync<T>(loader: () => Promise<T>): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  const reload = useCallback(async () => {
    try {
      const result = await loader();
      if (!alive.current) return;
      setData(result);
      setError(null);
    } catch (e) {
      if (alive.current) setError(messageOf(e));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [loader]);

  useEffect(() => {
    alive.current = true;
    setLoading(true);
    void reload();
    return () => {
      alive.current = false;
    };
  }, [reload]);

  return { data, loading, error, reload };
}
