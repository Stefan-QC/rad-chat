import { NavLink } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { Icon } from '../Icon';

const LINKS = [
  { to: '/teams', icon: 'users', tip: 'Teams' },
  { to: '/leaderboard', icon: 'trophy', tip: 'Leaderboard' },
  { to: '/wordle', icon: 'grid', tip: 'RAD Wordle' },
  { to: '/craft', icon: 'cube', tip: 'RAD Craft' },
];

/** Smalle balk uiterst links met snelkoppelingen naar de onderdelen van de app. */
export function Rail() {
  const { me } = useAuth();
  return (
    <nav id="rail">
      <NavLink to="/" end className="rail-btn home" data-tip="RAD Chat" aria-label="RAD Chat">
        <Icon name="logo" />
      </NavLink>
      <span className="rail-sep" />
      {LINKS.map(link => (
        <NavLink key={link.to} to={link.to} className={({ isActive }) => `rail-btn${isActive ? ' active' : ''}`} data-tip={link.tip} aria-label={link.tip}>
          <Icon name={link.icon} />
        </NavLink>
      ))}
      {me?.role === 'admin' && (
        <NavLink to="/admin" className={({ isActive }) => `rail-btn${isActive ? ' active' : ''}`} data-tip="Admin" aria-label="Admin">
          <Icon name="shield" />
        </NavLink>
      )}
    </nav>
  );
}
