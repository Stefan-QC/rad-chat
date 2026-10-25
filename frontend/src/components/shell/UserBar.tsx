import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { StatusPresenter } from '../../core/presence';
import { Avatar } from '../Avatar';
import { Icon } from '../Icon';
import { StatusDialog } from './StatusDialog';

/** Onderaan de zijbalk: eigen naam, link naar het profiel en uitloggen. */
export function UserBar() {
  const { me, signOut } = useAuth();
  const navigate = useNavigate();
  const [statusOpen, setStatusOpen] = useState(false);
  if (!me) return null;
  const status = StatusPresenter.effective(me);
  const statusText = StatusPresenter.text(me);
  return (
    <div className="userbar">
      <button className="userbar-me" onClick={() => navigate('/profile')} title="Edit your profile">
        <Avatar name={me.display_name} color={me.avatar_color} size="sm" online status={status} />
        <div className="who"><b>{me.display_name}</b><small>{statusText || me.job_title || 'Online'}</small></div>
      </button>
      <button className="iconbtn" title="Set your status" aria-label="Set your status" onClick={() => setStatusOpen(true)}><Icon name="smile" size={18} /></button>
      <button className="iconbtn" title="Settings" aria-label="Settings" onClick={() => navigate('/settings')}><Icon name="gear" size={18} /></button>
      <button className="iconbtn" title="Sign out" aria-label="Sign out" onClick={() => void signOut()}><Icon name="logout" size={18} /></button>
      {statusOpen && <StatusDialog onClose={() => setStatusOpen(false)} />}
    </div>
  );
}
