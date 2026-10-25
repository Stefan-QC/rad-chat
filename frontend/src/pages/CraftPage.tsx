import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import { useServices } from '../app/ServicesContext';
import { useWorkspace } from '../app/WorkspaceContext';
import { PageHeader } from '../components/PageHeader';
import { messageOf } from '../core/AppError';
import { CraftSession } from '../features/craft/CraftSession';

/** Start RAD Craft schermvullend en brengt de speler terug naar de chat zodra het spel sluit. */
export function CraftPage() {
  const services = useServices();
  const { me } = useAuth();
  const { channels } = useWorkspace();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const generalId = channels.find(c => c.team_id === null && c.kind === 'text' && c.name === 'general')?.id ?? null;

  useEffect(() => {
    if (!me || generalId === null) return;
    const session = new CraftSession(services, me, generalId);
    session.start(() => navigate('/', { replace: true })).catch(e => setError(messageOf(e)));
    return () => session.stop();
  }, [services, me, generalId, navigate]);

  return (
    <>
      <PageHeader title="RAD Craft" />
      <div className="page">
        {error ? <div className="banner error">{error}</div> : <p className="muted">Loading the world…</p>}
      </div>
    </>
  );
}
