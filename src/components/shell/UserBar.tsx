import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { Avatar } from '../Avatar';
import { Icon } from '../Icon';

/** Onderaan de zijbalk: eigen naam, link naar het profiel en uitloggen. */
export function UserBar() {
  const { me, signOut } = useAuth();
  const navigate = useNavigate();
  if (!me) return null;
  return (
    <div className="userbar">
      <button className="userbar-me" onClick={() => navigate('/profile')} title="Edit your profile">
        <Avatar name={me.display_name} color={me.avatar_color} size="sm" online />
        <div className="who"><b>{me.display_name}</b><small>{me.job_title || 'Online'}</small></div>
      </button>
      <button className="iconbtn" title="Settings" aria-label="Settings" onClick={() => navigate('/settings')}><Icon name="gear" size={18} /></button>
      <button className="iconbtn" title="Sign out" aria-label="Sign out" onClick={() => void signOut()}><Icon name="logout" size={18} /></button>
    </div>
  );
}
