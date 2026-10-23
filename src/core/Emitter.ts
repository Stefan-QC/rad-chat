type Listener<T> = (payload: T) => void;

/** Kleine getypeerde event-emitter waar de services van erven. */
export class Emitter<Events extends object> {
  private readonly listeners = new Map<keyof Events, Set<Listener<never>>>();

  on<K extends keyof Events>(type: K, listener: Listener<Events[K]>): () => void {
    const set = this.listeners.get(type) ?? new Set<Listener<never>>();
    set.add(listener as Listener<never>);
    this.listeners.set(type, set);
    return () => set.delete(listener as Listener<never>);
  }

  protected emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    this.listeners.get(type)?.forEach(listener => (listener as Listener<Events[K]>)(payload));
  }
}
