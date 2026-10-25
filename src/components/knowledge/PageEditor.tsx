import { useState, type FormEvent } from 'react';
import { useAuth } from '../../app/AuthContext';
import { useServices } from '../../app/ServicesContext';
import { useWorkspace } from '../../app/WorkspaceContext';
import { messageOf } from '../../core/AppError';
import type { KbPage } from '../../core/types';
import { MarkdownEditor } from '../MarkdownEditor';
import { Modal } from '../ui/Modal';
import { Switch } from '../ui/Switch';
import { useToast } from '../ui/Toast';

interface PageEditorProps {
  page?: KbPage;
  defaultTeamId?: string | null;
  onClose: () => void;
  onSaved: (id: number) => void;
}

/** Editor voor een kennisbankpagina: bedrijfsbreed (alleen admins) of voor één team. */
export function PageEditor({ page, defaultTeamId = null, onClose, onSaved }: PageEditorProps) {
  const { knowledge } = useServices();
  const { me } = useAuth();
  const { myTeams } = useWorkspace();
  const toast = useToast();
  const isAdmin = me?.role === 'admin';
  const [teamId, setTeamId] = useState<string>(page ? page.team_id ?? '' : defaultTeamId ?? (isAdmin ? '' : myTeams[0]?.id ?? ''));
  const [title, setTitle] = useState(page?.title ?? '');
  const [category, setCategory] = useState(page?.category ?? '');
  const [body, setBody] = useState(page?.body ?? '');
  const [pinned, setPinned] = useState(page?.pinned ?? false);
  const [busy, setBusy] = useState(false);
  const team = myTeams.find(t => t.id === teamId);
  const teamRole = team?.members.find(m => m.user_id === me?.id)?.role;
  const mayPin = teamId === '' ? isAdmin : isAdmin || teamRole === 'owner' || teamRole === 'moderator';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const id = await knowledge.save({ id: page?.id, teamId: teamId || null, title: title.trim(), body, category: category.trim(), pinned });
      onSaved(id);
      onClose();
    } catch (error) {
      toast.error(messageOf(error));
      setBusy(false);
    }
  };

  return (
    <Modal title={page ? 'Edit page' : 'New page'} onClose={onClose} width={760}>
      <form className="form dialog-form" onSubmit={submit}>
        <label>Title
          <input className="text-input" autoFocus required maxLength={120} value={title} onChange={event => setTitle(event.target.value)} />
        </label>
        <div className="two-fields">
          <label>Where does it live
            <select className="text-input" value={teamId} disabled={Boolean(page)} onChange={event => setTeamId(event.target.value)}>
              {isAdmin && <option value="">Company wide</option>}
              {myTeams.map(t => <option key={t.id} value={t.id}>Team: {t.name}</option>)}
            </select>
          </label>
          <label>Category (optional)
            <input className="text-input" maxLength={40} value={category} placeholder="e.g. Onboarding" onChange={event => setCategory(event.target.value)} />
          </label>
        </div>
        <MarkdownEditor value={body} onChange={setBody} />
        {mayPin && <Switch label="Pin to the top" description="Pinned pages are listed first." checked={pinned} onChange={setPinned} />}
        <div className="actions">
          <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy || !title.trim() || (!isAdmin && teamId === '')}>Save page</button>
        </div>
      </form>
    </Modal>
  );
}
