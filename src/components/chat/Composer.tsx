import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { AttachmentService, MAX_ATTACHMENTS } from '../../services/AttachmentService';
import { Icon } from '../Icon';
import { useToast } from '../ui/Toast';
import { EmojiPicker } from './EmojiPicker';

interface ComposerProps {
  channelName: string;
  conversation?: boolean;
  placeholder?: string;
  onSend: (text: string, files: File[]) => Promise<void>;
  /** Extra knoppen naast het invoerveld, bijvoorbeeld de GIF-kiezer. */
  tools?: ReactNode;
}

/** Invoerveld onderaan: Enter verstuurt, Shift+Enter maakt een nieuwe regel en Ctrl+V plakt een schermafbeelding. */
export function Composer({ channelName, conversation = false, placeholder, onSend, tools }: ComposerProps) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [emojiAt, setEmojiAt] = useState<DOMRect | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  const previews = useMemo(() => files.map(file => ({ file, url: URL.createObjectURL(file) })), [files]);
  useEffect(() => () => previews.forEach(item => URL.revokeObjectURL(item.url)), [previews]);

  const resize = () => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.4)}px`;
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const value = text.trim();
    if ((!value && files.length === 0) || sending) return;
    setSending(true);
    const pending = files;
    setText('');
    setFiles([]);
    requestAnimationFrame(resize);
    try {
      await onSend(value, pending);
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

  // Alleen geplakte afbeeldingen (schermafbeeldingen) worden opgevangen; gewone tekst plakt normaal.
  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const images = [...event.clipboardData.files].filter(file => file.type.startsWith('image/'));
    if (images.length === 0) return;
    event.preventDefault();
    const accepted: File[] = [];
    for (const image of images) {
      const problem = AttachmentService.validate(image);
      if (problem) toast.error(problem);
      else accepted.push(image);
    }
    const room = MAX_ATTACHMENTS - files.length;
    if (accepted.length > room) toast.error(`You can attach at most ${MAX_ATTACHMENTS} images to one message.`);
    if (room > 0) setFiles([...files, ...accepted.slice(0, room)]);
  };

  const insertEmoji = (emoji: string) => {
    const el = area.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    setText(text.slice(0, start) + emoji + text.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  return (
    <form id="composer" autoComplete="off" onSubmit={submit}>
      {previews.length > 0 && (
        <div className="paste-previews" aria-label="Images to send">
          {previews.map(({ file, url }, index) => (
            <figure key={url}>
              <img src={url} alt="Pasted screenshot" />
              <button type="button" aria-label="Remove image" onClick={() => setFiles(files.filter((_, i) => i !== index))}>✕</button>
              <figcaption>{Math.max(1, Math.round(file.size / 1024))} KB</figcaption>
            </figure>
          ))}
        </div>
      )}
      <div className="box">
        <textarea
          ref={area}
          id="text"
          rows={1}
          value={text}
          maxLength={2000}
          placeholder={placeholder ?? `Message ${conversation ? '' : '#'}${channelName}`}
          onChange={event => { setText(event.target.value); resize(); }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          autoFocus
        />
        {tools}
        <button type="button" className="tool-btn" aria-label="Insert emoji" title="Emoji" onClick={event => setEmojiAt(event.currentTarget.getBoundingClientRect())}><Icon name="smile" size={22} /></button>
        <button id="send" type="submit" aria-label="Send" disabled={(!text.trim() && files.length === 0) || sending}><Icon name="send" /></button>
      </div>
      <div className="hint"><kbd>Enter</kbd> to send · <kbd>Shift+Enter</kbd> for a new line · <kbd>Ctrl+V</kbd> to paste a screenshot</div>
      {emojiAt && <EmojiPicker anchor={emojiAt} onPick={insertEmoji} onClose={() => setEmojiAt(null)} />}
    </form>
  );
}
