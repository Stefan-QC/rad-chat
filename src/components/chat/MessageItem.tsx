import { useState } from 'react';
import { useAuth } from '../../app/AuthContext';
import { useServices } from '../../app/ServicesContext';
import { messageOf } from '../../core/AppError';
import { formatTime } from '../../core/format';
import type { Message } from '../../core/types';
import { Icon } from '../Icon';
import { RichText } from '../RichText';
import { usePins } from '../../app/PinsContext';
import { AttachmentList } from './AttachmentList';
import { PollCard } from './PollCard';
import { EmojiPicker } from './EmojiPicker';
import { ReactionBar } from './ReactionBar';

interface MessageItemProps {
  message: Message;
  myUsername: string;
  onError: (message: string) => void;
  onOpenThread?: (messageId: number) => void;
}

/** Eén bericht, met bewerken en verwijderen voor de eigenaar (en verwijderen voor admins). */
export function MessageItem({ message, myUsername, onError, onOpenThread }: MessageItemProps) {
  const { me } = useAuth();
  const { messages, reactions } = useServices();
  const { isPinned, canPin, togglePin } = usePins();
  const [editing, setEditing] = useState(false);
  const [pickerAt, setPickerAt] = useState<DOMRect | null>(null);
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
      {deleted ? <em>message deleted</em> : message.kind === 'poll' ? <PollCard messageId={message.id} /> : <RichText text={message.body} me={myUsername} />}
      {message.edited_at && !deleted && <small className="edited"> (edited)</small>}
      {isPinned(message.id) && !deleted && <small className="pinned-tag"><Icon name="pin" size={12} /> Pinned</small>}
      {!deleted && message.attachment_count > 0 && <AttachmentList messageId={message.id} />}
      {!deleted && <ReactionBar messageId={message.id} />}
      {message.reply_count > 0 && onOpenThread && (
        <button className="reply-link" onClick={() => onOpenThread(message.id)}>
          <Icon name="chat" size={14} />{message.reply_count} {message.reply_count === 1 ? 'reply' : 'replies'}
        </button>
      )}
      {!deleted && (
        <span className="msg-actions">
          <button title="Add reaction" aria-label="Add reaction" onClick={event => setPickerAt(event.currentTarget.getBoundingClientRect())}><Icon name="smile" size={16} /></button>
          {canPin && <button title={isPinned(message.id) ? 'Unpin' : 'Pin to channel'} aria-label={isPinned(message.id) ? 'Unpin message' : 'Pin message'} onClick={() => void togglePin(message.id)}><Icon name="pin" size={16} /></button>}
          {onOpenThread && !message.parent_id && <button title="Reply in thread" aria-label="Reply in thread" onClick={() => onOpenThread(message.id)}><Icon name="chat" size={16} /></button>}
          {mine && <button title="Edit" aria-label="Edit message" onClick={() => { setDraft(message.body); setEditing(true); }}><Icon name="edit" size={16} /></button>}
          {(mine || me?.role === 'admin') && <button title="Delete" aria-label="Delete message" onClick={() => window.confirm('Delete this message?') && void run(() => messages.remove(message.id))}><Icon name="trash" size={16} /></button>}
        </span>
      )}
      {pickerAt && (
        <EmojiPicker anchor={pickerAt} onPick={emoji => void run(async () => { await reactions.toggle(message.id, emoji); })} onClose={() => setPickerAt(null)} />
      )}
    </div>
  );
}
