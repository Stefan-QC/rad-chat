import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import { useServices } from '../app/ServicesContext';
import { useWorkspace } from '../app/WorkspaceContext';
import { PageEditor } from '../components/knowledge/PageEditor';
import { Icon } from '../components/Icon';
import { Markdown } from '../components/Markdown';
import { PageHeader } from '../components/PageHeader';
import { useToast } from '../components/ui/Toast';
import { messageOf } from '../core/AppError';
import { formatDateTime } from '../core/format';
import type { KbPage, KbVersion } from '../core/types';

/** Kennisbank: bedrijfsbrede en teampagina's met zoeken, opmaak en versiegeschiedenis. */
export function KnowledgePage() {
  const { knowledge } = useServices();
  const { me } = useAuth();
  const { teams, myTeams, profileById } = useWorkspace();
  const { pageId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [pages, setPages] = useState<KbPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{ page?: KbPage } | null>(null);
  const [versions, setVersions] = useState<KbVersion[]>([]);
  const [versionNumber, setVersionNumber] = useState<number | null>(null);

  const reload = useCallback(() => {
    knowledge.listPages().then(rows => { setPages(rows); setLoading(false); }).catch(() => setLoading(false));
  }, [knowledge]);
  useEffect(() => {
    reload();
    return knowledge.watch(reload);
  }, [knowledge, reload]);

  const selected = pages.find(p => String(p.id) === pageId);
  useEffect(() => {
    setVersionNumber(null);
    setVersions([]);
    if (selected) knowledge.listVersions(selected.id).then(setVersions).catch(() => undefined);
  }, [knowledge, selected?.id, selected?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    const text = query.trim().toLowerCase();
    const filtered = pages.filter(p => !text || p.title.toLowerCase().includes(text) || p.body.toLowerCase().includes(text) || (p.category ?? '').toLowerCase().includes(text));
    const scopes = [{ key: 'company', label: 'Company', pages: filtered.filter(p => p.team_id === null) }];
    for (const team of teams) scopes.push({ key: team.id, label: team.name, pages: filtered.filter(p => p.team_id === team.id) });
    return scopes.filter(scope => scope.pages.length > 0);
  }, [pages, teams, query]);

  const roleIn = (teamId: string | null) => (teamId ? myTeams.find(t => t.id === teamId)?.members.find(m => m.user_id === me?.id)?.role : undefined);
  const canEdit = (page: KbPage) => (page.team_id === null ? me?.role === 'admin' : me?.role === 'admin' || roleIn(page.team_id) !== undefined);
  const canDelete = (page: KbPage) => (page.team_id === null ? me?.role === 'admin' : me?.role === 'admin' || ['owner', 'moderator'].includes(roleIn(page.team_id) ?? ''));
  const canWriteSomewhere = me?.role === 'admin' || myTeams.length > 0;

  const shown = selected && versionNumber !== null ? versions.find(v => v.version === versionNumber) : null;

  const restore = async () => {
    if (!selected || !shown) return;
    try {
      await knowledge.save({ id: selected.id, teamId: selected.team_id, title: shown.title, body: shown.body, category: selected.category ?? '', pinned: selected.pinned });
      toast.success(`Version ${shown.version} restored as a new version.`);
      setVersionNumber(null);
      reload();
    } catch (error) {
      toast.error(messageOf(error));
    }
  };

  const remove = async (page: KbPage) => {
    if (!window.confirm(`Delete "${page.title}" and its history?`)) return;
    try {
      await knowledge.remove(page.id);
      navigate('/knowledge');
      reload();
    } catch (error) {
      toast.error(messageOf(error));
    }
  };

  return (
    <>
      <PageHeader title="Knowledge base" actions={canWriteSomewhere ? <button className="btn small" onClick={() => setEditing({})}>New page</button> : undefined} />
      <div className="page wide two-col kb">
        <div className="col list">
          <input className="text-input" type="search" value={query} placeholder="Search pages…" aria-label="Search pages" onChange={event => setQuery(event.target.value)} />
          {loading && <p className="muted">Loading…</p>}
          {!loading && groups.length === 0 && <div className="empty-state"><b>No pages yet.</b><span>Write down how things work so everyone can find it.</span></div>}
          {groups.map(scope => (
            <section key={scope.key} className="kb-group">
              <h3>{scope.label}</h3>
              {scope.pages.map(page => (
                <button key={page.id} className={`kb-item${String(page.id) === pageId ? ' on' : ''}`} onClick={() => navigate(`/knowledge/${page.id}`)}>
                  {page.pinned && <Icon name="pin" size={13} />}<span>{page.title}</span>{page.category && <small>{page.category}</small>}
                </button>
              ))}
            </section>
          ))}
        </div>
        <div className="col detail">
          {!selected && <p className="muted">Select a page to read it.</p>}
          {selected && (
            <article className="card kb-article">
              <header>
                <div>
                  <h2>{shown?.title ?? selected.title}</h2>
                  <p className="muted">
                    {selected.team_id ? teams.find(t => t.id === selected.team_id)?.name : 'Company'}{selected.category ? ` · ${selected.category}` : ''} · Updated {formatDateTime(selected.updated_at)} by {profileById(selected.updated_by)?.display_name ?? 'someone'}
                  </p>
                </div>
                <div className="row-actions">
                  {canEdit(selected) && <button className="btn secondary small" onClick={() => setEditing({ page: selected })}>Edit</button>}
                  {canDelete(selected) && <button className="btn secondary small" onClick={() => void remove(selected)}>Delete</button>}
                </div>
              </header>
              {versions.length > 1 && (
                <label className="kb-history">History
                  <select className="text-input small" value={versionNumber ?? ''} onChange={event => setVersionNumber(event.target.value ? Number(event.target.value) : null)}>
                    <option value="">Latest version</option>
                    {versions.slice(1).map(v => <option key={v.id} value={v.version}>Version {v.version} · {formatDateTime(v.edited_at)} · {profileById(v.edited_by)?.display_name ?? 'someone'}</option>)}
                  </select>
                </label>
              )}
              {shown && (
                <div className="banner ok" role="status">
                  You are reading version {shown.version}.
                  {canEdit(selected) && <button className="link" onClick={() => void restore()}>Restore this version</button>}
                  <button className="link" onClick={() => setVersionNumber(null)}>Back to latest</button>
                </div>
              )}
              <Markdown source={shown?.body ?? selected.body} />
            </article>
          )}
        </div>
      </div>
      {editing && <PageEditor page={editing.page} defaultTeamId={null} onClose={() => setEditing(null)} onSaved={id => { reload(); navigate(`/knowledge/${id}`); }} />}
    </>
  );
}
