import { useMemo, useState } from 'react';
import { useAuth } from '../../app/AuthContext';
import { useMessageExtras } from '../../app/MessageExtrasContext';
import { useServices } from '../../app/ServicesContext';
import { useWorkspace } from '../../app/WorkspaceContext';
import { messageOf } from '../../core/AppError';
import { Icon } from '../Icon';
import { useToast } from '../ui/Toast';
import { EmojiPicker } from './EmojiPicker';

interface ReactionBarProps {
  messageId: number;
  disabled?: boolean;
}

/** Toont de reacties onder een bericht als klikbare chips met teller en wie er reageerde. */
export function ReactionBar({ messageId, disabled }: ReactionBarProps) {
  const { reactions: service } = useServices();
  const { me } = useAuth();
  const { profileById } = useWorkspace();
  const { reactionsOf } = useMessageExtras();
  const toast = useToast();
  const [pickerAt, setPickerAt] = useState<DOMRect | null>(null);

  const groups = useMemo(() => {
    const byEmoji = new Map<string, string[]>();
    for (const reaction of reactionsOf(messageId)) byEmoji.set(reaction.emoji, [...(byEmoji.get(reaction.emoji) ?? []), reaction.user_id]);
    return [...byEmoji.entries()];
  }, [reactionsOf, messageId]);

  const toggle = async (emoji: string) => {
    try {
      await service.toggle(messageId, emoji);
    } catch (error) {
      toast.error(messageOf(error));
    }
  };

  if (groups.length === 0) return null;
  return (
    <div className="reactions">
      {groups.map(([emoji, userIds]) => {
        const mine = userIds.includes(me?.id ?? '');
        const names = userIds.map(id => profileById(id)?.display_name ?? 'Someone').join(', ');
        return (
          <button key={emoji} className={`reaction${mine ? ' mine' : ''}`} disabled={disabled} title={names} aria-pressed={mine} aria-label={`${emoji} ${userIds.length}, ${names}`} onClick={() => void toggle(emoji)}>
            <span>{emoji}</span><b>{userIds.length}</b>
          </button>
        );
      })}
      {!disabled && (
        <span className="reaction-add">
          <button className="reaction" aria-label="Add reaction" onClick={event => setPickerAt(event.currentTarget.getBoundingClientRect())}><Icon name="plus" size={14} /></button>
          {pickerAt && <EmojiPicker anchor={pickerAt} onPick={emoji => void toggle(emoji)} onClose={() => setPickerAt(null)} />}
        </span>
      )}
    </div>
  );
}
