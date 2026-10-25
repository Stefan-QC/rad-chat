import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Icon } from '../Icon';

interface ComposerProps {
  channelName: string;
  conversation?: boolean;
  onSend: (text: string) => Promise<void>;
}

/** Invoerveld onderaan: Enter verstuurt, Shift+Enter maakt een nieuwe regel. */
export function Composer({ channelName, conversation = false, onSend }: ComposerProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.4)}px`;
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    setText('');
    requestAnimationFrame(resize);
    try {
      await onSend(value);
    } finally {
      setSending(false);
      area.current?.focus();
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <form id="composer" autoComplete="off" onSubmit={submit}>
      <div className="box">
        <textarea
          ref={area}
          id="text"
          rows={1}
          value={text}
          maxLength={2000}
          placeholder={`Message ${conversation ? '' : '#'}${channelName}`}
          onChange={event => { setText(event.target.value); resize(); }}
          onKeyDown={onKeyDown}
          autoFocus
        />
        <button id="send" type="submit" aria-label="Send" disabled={!text.trim() || sending}><Icon name="send" /></button>
      </div>
      <div className="hint"><kbd>Enter</kbd> to send · <kbd>Shift+Enter</kbd> for a new line</div>
    </form>
  );
}
