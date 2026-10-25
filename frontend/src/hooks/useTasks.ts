import { useCallback, useEffect, useState } from 'react';
import { useServices } from '../app/ServicesContext';
import type { Task } from '../core/types';

/** Houdt de zichtbare taken van de gebruiker bij en laadt opnieuw bij elke wijziging. */
export function useTasks() {
  const { tasks: service } = useServices();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    service.list().then(rows => { setTasks(rows); setLoading(false); }).catch(() => setLoading(false));
  }, [service]);

  useEffect(() => {
    reload();
    return service.watch(reload);
  }, [service, reload]);

  return { tasks, loading, reload };
}
