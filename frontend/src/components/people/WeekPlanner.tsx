import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../app/AuthContext';
import { useServices } from '../../app/ServicesContext';
import { useWorkspace } from '../../app/WorkspaceContext';
import { messageOf } from '../../core/AppError';
import { isoDay } from '../../core/format';
import { StatusPresenter } from '../../core/presence';
import type { WorkLocation, WorkPlan } from '../../core/types';
import { Avatar } from '../Avatar';
import { Menu } from '../ui/Menu';
import { useToast } from '../ui/Toast';

export const LOCATIONS: Record<WorkLocation, { label: string; icon: string }> = {
  office: { label: 'Office', icon: '🏢' },
  home: { label: 'Home', icon: '🏠' },
  off: { label: 'Day off', icon: '🌴' },
  travel: { label: 'Travelling', icon: '✈️' },
};

/** In het weekend begint het overzicht bij volgende week, want dan valt er in de huidige week niets meer te plannen. */
const isWeekend = (): boolean => [0, 6].includes(new Date().getDay());

/** Maandag van de werkweek die `offset` weken van nu ligt. */
function mondayOf(offset: number): Date {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7) + (offset + (isWeekend() ? 1 : 0)) * 7);
  return date;
}

/** Weekoverzicht van wie waar werkt; je eigen rij kun je aanpassen. */
export function WeekPlanner() {
  const { people } = useServices();
  const { me } = useAuth();
  const { profiles } = useWorkspace();
  const toast = useToast();
  const [offset, setOffset] = useState(0);
  const [plans, setPlans] = useState<WorkPlan[]>([]);

  const days = useMemo(() => {
    const monday = mondayOf(offset);
    return Array.from({ length: 5 }, (_, i) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      return date;
    });
  }, [offset]);
  const today = isoDay(new Date());

  const load = useCallback(() => {
    people.listWorkPlans(isoDay(days[0]), isoDay(days[4])).then(setPlans).catch(() => undefined);
  }, [people, days]);

  useEffect(() => {
    load();
    return people.watchWorkPlans(load);
  }, [people, load]);

  const colleagues = useMemo(
    () => profiles.filter(p => !p.deactivated_at && p.role !== 'guest').sort((a, b) => (a.id === me?.id ? -1 : b.id === me?.id ? 1 : a.display_name.localeCompare(b.display_name))),
    [profiles, me?.id],
  );

  const planOf = (userId: string, day: string) => plans.find(p => p.user_id === userId && p.day === day)?.location;
  const counts = (Object.keys(LOCATIONS) as WorkLocation[]).map(location => ({ location, count: plans.filter(p => p.day === today && p.location === location).length }));

  const set = async (day: string, location: WorkLocation | null) => {
    try {
      await people.setWorkPlan(day, location);
      load();
    } catch (error) {
      toast.error(messageOf(error));
    }
  };

  return (
    <section className="card planner" aria-label="Weekly work plan">
      <header className="planner-head">
        <div>
          <h2>Who is where</h2>
          <p className="muted">Plan your week so colleagues know when to find you at the office.</p>
        </div>
        <div className="week-nav">
          <button className="btn secondary small" disabled={offset === 0} onClick={() => setOffset(offset - 1)} aria-label="Previous week">‹</button>
          <b>{offset === 0 ? (isWeekend() ? 'Next week' : 'This week') : offset === 1 ? (isWeekend() ? 'In 2 weeks' : 'Next week') : `In ${offset + (isWeekend() ? 1 : 0)} weeks`}</b>
          <button className="btn secondary small" disabled={offset >= 4} onClick={() => setOffset(offset + 1)} aria-label="Next week">›</button>
        </div>
      </header>
      {offset === 0 && !isWeekend() && (
        <p className="today-summary">
          Today: {counts.map(item => `${LOCATIONS[item.location].icon} ${item.count}`).join('   ')}
        </p>
      )}
      <div className="table-scroll">
        <table className="planner-table">
          <thead>
            <tr>
              <th>Colleague</th>
              {days.map(day => (
                <th key={isoDay(day)} className={isoDay(day) === today ? 'today' : ''}>
                  {day.toLocaleDateString([], { weekday: 'short' })}<small>{day.toLocaleDateString([], { day: 'numeric', month: 'short' })}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {colleagues.map(person => (
              <tr key={person.id} className={person.id === me?.id ? 'me' : ''}>
                <td>
                  <span className="who-cell">
                    <Avatar name={person.display_name} color={person.avatar_color} size="sm" />
                    <span>{person.display_name}{person.id === me?.id && <small className="muted"> you</small>}<small className="muted block">{StatusPresenter.text(person)}</small></span>
                  </span>
                </td>
                {days.map(day => {
                  const iso = isoDay(day);
                  const location = planOf(person.id, iso);
                  const cell = <span className={`plan ${location ?? 'none'}`} title={location ? LOCATIONS[location].label : 'Not planned'}>{location ? LOCATIONS[location].icon : '·'}</span>;
                  return (
                    <td key={iso} className={iso === today ? 'today' : ''}>
                      {person.id === me?.id ? (
                        <Menu
                          label={`Where do you work on ${day.toLocaleDateString([], { weekday: 'long' })}?`}
                          trigger={cell}
                          className="plan-menu"
                          items={[
                            ...(Object.keys(LOCATIONS) as WorkLocation[]).map(key => ({ label: `${LOCATIONS[key].icon} ${LOCATIONS[key].label}`, checked: location === key, onSelect: () => void set(iso, key) })),
                            { label: 'Clear', onSelect: () => void set(iso, null) },
                          ]}
                        />
                      ) : cell}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
