import { useEffect, useState } from 'react';
import { useServices } from '../app/ServicesContext';
import type { Badge, UserBadge } from '../core/types';

/** De badges van iemand; op je eigen profiel zie je ook de badges die je nog kunt verdienen. */
export function BadgeShelf({ userId, own }: { userId: string; own: boolean }) {
  const { social } = useServices();
  const [catalog, setCatalog] = useState<Badge[]>([]);
  const [earned, setEarned] = useState<UserBadge[]>([]);

  useEffect(() => {
    social.badgeCatalog().then(setCatalog).catch(() => undefined);
    social.earnedBadges(userId).then(setEarned).catch(() => undefined);
  }, [social, userId]);

  const shown = own ? catalog : catalog.filter(b => earned.some(e => e.badge_id === b.id));
  if (shown.length === 0) return null;
  return (
    <section className="badge-shelf" aria-label="Badges">
      <h3>Badges {earned.length > 0 && <small>({earned.length} of {catalog.length})</small>}</h3>
      <ul>
        {shown.map(badge => {
          const has = earned.some(e => e.badge_id === badge.id);
          return (
            <li key={badge.id} className={has ? 'earned' : 'locked'} title={`${badge.name}: ${badge.description}`}>
              <span className="badge-icon" aria-hidden="true">{badge.icon}</span>
              <b>{badge.name}</b>
              <small>{badge.description}</small>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
