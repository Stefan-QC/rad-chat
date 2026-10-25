import { useMessageExtras } from '../../app/MessageExtrasContext';
import { useServices } from '../../app/ServicesContext';
import { useToast } from '../ui/Toast';
import { useAuth } from '../../app/AuthContext';
import { useWorkspace } from '../../app/WorkspaceContext';
import { messageOf } from '../../core/AppError';
import { formatDateTime } from '../../core/format';

/** Een peiling in het gesprek: opties met voortgangsbalken, klik om te stemmen. */
export function PollCard({ messageId }: { messageId: number }) {
  const { polls: service } = useServices();
  const { pollOf, refreshPolls } = useMessageExtras();
  const { me } = useAuth();
  const { profileById } = useWorkspace();
  const toast = useToast();
  const data = pollOf(messageId);
  if (!data) return <div className="poll skeleton" aria-label="Loading poll" />;

  const { poll, options, votes } = data;
  const closed = poll.closes_at !== null && new Date(poll.closes_at).getTime() <= Date.now();
  const total = new Set(votes.map(v => v.user_id)).size;

  const vote = async (optionId: number) => {
    try {
      await service.vote(optionId);
      refreshPolls();
    } catch (error) {
      toast.error(messageOf(error));
    }
  };

  return (
    <div className={`poll${closed ? ' closed' : ''}`} role="group" aria-label={`Poll: ${poll.question}`}>
      <h4>{poll.question}</h4>
      <p className="poll-meta">{poll.multiple ? 'Choose one or more' : 'Choose one'}{closed ? ' · Closed' : poll.closes_at ? ` · Closes ${formatDateTime(poll.closes_at)}` : ''}</p>
      <ul>
        {options.map(option => {
          const optionVotes = votes.filter(v => v.option_id === option.id);
          const mine = optionVotes.some(v => v.user_id === me?.id);
          const percent = total > 0 ? Math.round((optionVotes.length / total) * 100) : 0;
          const names = optionVotes.map(v => profileById(v.user_id)?.display_name ?? 'Someone').join(', ');
          return (
            <li key={option.id}>
              <button className={`poll-option${mine ? ' mine' : ''}`} disabled={closed} aria-pressed={mine} title={names || 'No votes yet'} onClick={() => void vote(option.id)}>
                <span className="poll-bar" style={{ width: `${percent}%` }} />
                <span className="poll-label">{mine && <i aria-hidden="true">✓ </i>}{option.label}</span>
                <b>{optionVotes.length}</b>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="poll-meta">{total} {total === 1 ? 'person' : 'people'} voted</p>
    </div>
  );
}
