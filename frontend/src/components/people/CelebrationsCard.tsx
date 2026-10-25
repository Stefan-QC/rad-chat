import { useCallback } from 'react';
import { useServices } from '../../app/ServicesContext';
import { useWorkspace } from '../../app/WorkspaceContext';
import { useAsync } from '../../hooks/useAsync';
import type { Celebration } from '../../core/types';
import { Avatar } from '../Avatar';

function whenText(isoDate: string): string {
  const days = Math.round((new Date(`${isoDate}T12:00:00`).getTime() - new Date().setHours(12, 0, 0, 0)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days · ${new Date(`${isoDate}T12:00:00`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}`;
}

function describe(item: Celebration, name: string): string {
  return item.kind === 'birthday' ? `${name}'s birthday` : `${name}: ${item.years} year${item.years === 1 ? '' : 's'} at Qualogy`;
}

/** Aankomende verjaardagen en werkjubilea van de komende weken. */
export function CelebrationsCard() {
  const { people } = useServices();
  const { profileById } = useWorkspace();
  const load = useCallback(() => people.upcomingCelebrations(30), [people]);
  const { data, loading } = useAsync(load);
  return (
    <section className="card celebrations" aria-label="Upcoming celebrations">
      <h2>Celebrations</h2>
      {loading && <p className="muted">Loading…</p>}
      {!loading && (data?.length ?? 0) === 0 && <p className="muted">Nothing to celebrate in the next 30 days. Add your birthday on your profile.</p>}
      <ul>
        {data?.slice(0, 12).map(item => {
          const person = profileById(item.user_id);
          if (!person) return null;
          return (
            <li key={`${item.user_id}-${item.kind}`}>
              <span className="celebration-icon" aria-hidden="true">{item.kind === 'birthday' ? '🎂' : '🏆'}</span>
              <Avatar name={person.display_name} color={person.avatar_color} size="sm" />
              <span><b>{describe(item, person.display_name)}</b><small className="muted block">{whenText(item.on_date)}</small></span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
