import { useState } from 'react';
import { useAuth } from '../../app/AuthContext';
import { useServices } from '../../app/ServicesContext';
import { messageOf } from '../../core/AppError';
import { formatTime } from '../../core/format';
import type { Message } from '../../core/types';
import { Icon } from '../Icon';
import { RichText } from '../RichText';

interface MessageItemProps {
  message: Message;
  myUsername: string;
  onError: (message: string) => void;
}

/** Eén bericht, met bewerken en verwijderen voor de eigenaar (en verwijderen voor admins). */
export function MessageItem({ message, myUsername, onError }: MessageItemProps) {
  const { me } = useAuth();
  const { messages } = useServices();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);
  const deleted = message.deleted_at !== null;
  const mine = message.user_id === me?.id;

  const run = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (e) {
      onError(messageOf(e));
    }
  };

  const save = () =>
    run(async () => {
      const text = draft.trim();
      if (text && text !== message.body) await messages.edit(message.id, text);
      setEditing(false);
    });

  if (editing) {
    return (
      <div className="line editing">
        <textarea
          autoFocus
          value={draft}
          maxLength={2000}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void save(); }
            if (event.key === 'Escape') setEditing(false);
          }}
        />
        <small>Enter to save · Esc to cancel</small>
      </div>
    );
  }

  return (
    <div className={`line${deleted ? ' deleted' : ''}`}>
      <time>{formatTime(message.created_at)}</time>
      {deleted ? <em>message deleted</em> : <RichText text={message.body} me={myUsername} />}
      {message.edited_at && !deleted && <small className="edited"> (edited)</small>}
      {!deleted && (mine || me?.role === 'admin') && (
        <span className="msg-actions">
          {mine && <button title="Edit" aria-label="Edit message" onClick={() => { setDraft(message.body); setEditing(true); }}><Icon name="edit" size={16} /></button>}
          <button title="Delete" aria-label="Delete message" onClick={() => window.confirm('Delete this message?') && void run(() => messages.remove(message.id))}><Icon name="trash" size={16} /></button>
        </span>
      )}
    </div>
  );
}
