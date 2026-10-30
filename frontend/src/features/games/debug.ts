/**
 * Hulpje voor ontwikkelaars en browsertests: met `?debug` in de URL is de spelstatus bereikbaar via `window.__games`.
 * Het geeft geen voordeel: de score wordt altijd door de server uitgerekend en gecontroleerd.
 */
export function exposeForTests(name: string, read: () => unknown): () => void {
  if (typeof window === 'undefined' || !new URLSearchParams(window.location.search).has('debug')) return () => undefined;
  const target = window as unknown as { __games?: Record<string, unknown> };
  target.__games ??= {};
  Object.defineProperty(target.__games, name, { get: read, configurable: true, enumerable: true });
  return () => { delete target.__games?.[name]; };
}
