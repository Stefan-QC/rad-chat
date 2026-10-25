/** Milliseconden tot middernacht in Amsterdam, het moment waarop de database een nieuw woord kiest. */
export function msUntilAmsterdamMidnight(now = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0);
  const elapsed = (get('hour') * 3600 + get('minute') * 60 + get('second')) * 1000;
  return 24 * 3600 * 1000 - elapsed;
}

export function formatCountdown(ms: number): string {
  const pad = (value: number) => String(Math.floor(value)).padStart(2, '0');
  return `${pad(ms / 3_600_000)}:${pad((ms / 60_000) % 60)}:${pad((ms / 1000) % 60)}`;
}
