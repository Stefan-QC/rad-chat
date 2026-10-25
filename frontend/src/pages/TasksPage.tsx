import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import { useServices } from '../app/ServicesContext';
import { useWorkspace } from '../app/WorkspaceContext';
import { Avatar } from '../components/Avatar';
import { PageHeader } from '../components/PageHeader';
import { TaskDialog } from '../components/tasks/TaskDialog';
import { useToast } from '../components/ui/Toast';
import { messageOf } from '../core/AppError';
import { isoDay } from '../core/format';
import type { Task } from '../core/types';
import { useTasks } from '../hooks/useTasks';

type Tab = 'mine' | 'created' | 'team' | 'done';

const TABS: { id: Tab; label: string }[] = [
  { id: 'mine', label: 'Assigned to me' },
  { id: 'created', label: 'Created by me' },
  { id: 'team', label: 'Team tasks' },
  { id: 'done', label: 'Done' },
];

function dueLabel(due: string | null, status: Task['status']): { text: string; className: string } | null {
  if (!due) return null;
  const today = isoDay(new Date());
  const date = new Date(`${due}T12:00:00`).toLocaleDateString([], { day: 'numeric', month: 'short' });
  if (status === 'open' && due < today) return { text: `Overdue · ${date}`, className: 'overdue' };
  if (due === today) return { text: 'Due today', className: 'soon' };
  return { text: `Due ${date}`, className: '' };
}

/** Takenlijst met tabbladen voor eigen taken, zelf gemaakte taken, teamtaken en afgeronde taken. */
export function TasksPage() {
  const { tasks: service } = useServices();
  const { me } = useAuth();
  const { profileById, teams, channels } = useWorkspace();
  const { tasks, loading, reload } = useTasks();
  const toast = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('mine');
  const [dialog, setDialog] = useState<{ task?: Task } | null>(null);

  const visible = useMemo(() => tasks.filter(task => {
    if (tab === 'done') return task.status === 'done';
    if (task.status === 'done') return false;
    if (tab === 'mine') return task.assignee_id === me?.id;
    if (tab === 'created') return task.created_by === me?.id;
    return task.team_id !== null;
  }), [tasks, tab, me?.id]);

  const run = async (action: () => Promise<void>) => {
    try {
      await action();
      reload();
    } catch (error) {
      toast.error(messageOf(error));
    }
  };

  return (
    <>
      <PageHeader title="Tasks" actions={<button className="btn small" onClick={() => setDialog({})}>New task</button>} />
      <div className="page">
        <div className="tabs" role="tablist">
          {TABS.map(item => (
            <button key={item.id} role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'on' : ''} onClick={() => setTab(item.id)}>
              {item.label}{item.id === 'mine' && ` (${tasks.filter(t => t.status === 'open' && t.assignee_id === me?.id).length})`}
            </button>
          ))}
        </div>
        {loading && <p className="muted">Loading…</p>}
        {!loading && visible.length === 0 && (
          <div className="empty-state"><b>Nothing here.</b><span>{tab === 'mine' ? 'Tasks assigned to you show up here. Make one from any message with the task button.' : 'No tasks in this list.'}</span></div>
        )}
        <ul className="task-list">
          {visible.map(task => {
            const assignee = profileById(task.assignee_id);
            const team = teams.find(t => t.id === task.team_id);
            const channel = channels.find(c => c.id === task.channel_id);
            const due = dueLabel(task.due_date, task.status);
            const manage = task.created_by === me?.id || me?.role === 'admin';
            return (
              <li key={task.id} className={`task${task.status === 'done' ? ' done' : ''}`}>
                <input type="checkbox" aria-label={`Mark "${task.title}" as ${task.status === 'done' ? 'open' : 'done'}`} checked={task.status === 'done'} onChange={() => void run(() => service.setStatus(task.id, task.status === 'done' ? 'open' : 'done'))} />
                <div className="task-body">
                  <b>{task.title}</b>
                  {task.description && <p>{task.description}</p>}
                  <div className="task-meta">
                    {due && <span className={`chip-soft ${due.className}`}>{due.text}</span>}
                    {team && <span className="chip-soft">{team.name}</span>}
                    {channel && task.message_id && <button className="link" onClick={() => navigate(`/channels/${channel.id}`)}>View message</button>}
                  </div>
                </div>
                {assignee && <Avatar name={assignee.display_name} color={assignee.avatar_color} size="sm" />}
                {manage && (
                  <span className="row-actions">
                    <button className="btn secondary small" onClick={() => setDialog({ task })}>Edit</button>
                    <button className="btn secondary small" onClick={() => window.confirm('Delete this task?') && void run(() => service.remove(task.id))}>Delete</button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      {dialog && <TaskDialog task={dialog.task} onClose={() => setDialog(null)} onDone={reload} />}
    </>
  );
}
