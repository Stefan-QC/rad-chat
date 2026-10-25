import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { useServices } from '../../app/ServicesContext';
import { useWorkspace } from '../../app/WorkspaceContext';
import { messageOf } from '../../core/AppError';
import { Avatar } from '../Avatar';
import { Switch } from '../ui/Switch';
import { useToast } from '../ui/Toast';

/** Doe mee aan koffie-matching en zie met wie je deze week een kop koffie drinkt. */
export function CoffeeCard() {
  const { social, profiles: profileService } = useServices();
  const { me, reloadMe } = useAuth();
  const { profileById } = useWorkspace();
  const navigate = useNavigate();
  const toast = useToast();
  const [pair, setPair] = useState<Awaited<ReturnType<typeof social.latestCoffeePair>>>(null);

  useEffect(() => {
    social.latestCoffeePair().then(setPair).catch(() => undefined);
  }, [social]);

  if (!me) return null;
  const partner = profileById(pair ? (pair.user_a === me.id ? pair.user_b : pair.user_a) : null);

  const toggle = async (value: boolean) => {
    try {
      await profileService.setCoffeeOptIn(me.id, value);
      await reloadMe();
    } catch (error) {
      toast.error(messageOf(error));
    }
  };

  return (
    <section className="card coffee" aria-label="Coffee matching">
      <h2>Coffee matching ☕</h2>
      <Switch label="Match me with a colleague" description="Every Monday you are paired with someone you have not met recently." checked={me.coffee_opt_in} onChange={checked => void toggle(checked)} />
      {partner && pair && (
        <div className="coffee-match">
          <Avatar name={partner.display_name} color={partner.avatar_color} size="sm" />
          <span><b>{partner.display_name}</b><small className="muted block">Your latest match, from {new Date(`${pair.started_on}T12:00:00`).toLocaleDateString([], { day: 'numeric', month: 'short' })}</small></span>
          {pair.channel_id && <button className="btn small" onClick={() => navigate(`/channels/${pair.channel_id}`)}>Say hi</button>}
        </div>
      )}
    </section>
  );
}
