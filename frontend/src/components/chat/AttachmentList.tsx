import { useEffect, useState } from 'react';
import { useMessageExtras } from '../../app/MessageExtrasContext';
import { useServices } from '../../app/ServicesContext';
import type { Attachment } from '../../core/types';
import { Modal } from '../ui/Modal';

/** Haalt de ondertekende link van een opgeslagen afbeelding op; GIF's hebben al een directe link. */
function useImageUrl(attachment: Attachment): string | null {
  const { attachments } = useServices();
  const [url, setUrl] = useState<string | null>(attachment.url);
  useEffect(() => {
    let active = true;
    if (attachment.storage_path) attachments.signedUrl(attachment.storage_path).then(link => active && setUrl(link)).catch(() => active && setUrl(null));
    return () => {
      active = false;
    };
  }, [attachment, attachments]);
  return url;
}

function AttachmentImage({ attachment, onOpen }: { attachment: Attachment; onOpen: (url: string) => void }) {
  const url = useImageUrl(attachment);
  const ratio = attachment.width && attachment.height ? `${attachment.width} / ${attachment.height}` : undefined;
  if (!url) return <div className="attachment placeholder" style={{ aspectRatio: ratio }} aria-label="Loading image" />;
  return (
    <button className={`attachment ${attachment.kind}`} style={{ aspectRatio: ratio }} onClick={() => onOpen(url)} aria-label={attachment.kind === 'gif' ? 'Open GIF' : 'Open image'}>
      <img src={url} alt={attachment.kind === 'gif' ? 'GIF' : 'Pasted screenshot'} loading="lazy" referrerPolicy="no-referrer" />
    </button>
  );
}

/** Toont de afbeeldingen en GIF's van een bericht; een klik opent de grote versie. */
export function AttachmentList({ messageId }: { messageId: number }) {
  const { attachmentsOf } = useMessageExtras();
  const [open, setOpen] = useState<string | null>(null);
  const list = attachmentsOf(messageId);
  if (list.length === 0) return null;
  return (
    <>
      <div className="attachments">
        {list.map(item => <AttachmentImage key={item.id} attachment={item} onOpen={setOpen} />)}
      </div>
      {open && (
        <Modal title="Image" onClose={() => setOpen(null)} width={960}>
          <img className="lightbox-img" src={open} alt="Full size" referrerPolicy="no-referrer" />
        </Modal>
      )}
    </>
  );
}
