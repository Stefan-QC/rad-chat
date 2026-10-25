import { unwrap, type Db } from '../core/supabase';
import { AppError } from '../core/AppError';
import type { Attachment } from '../core/types';
import type { OutgoingAttachment } from './MessageService';

const BUCKET = 'chat-images';
const EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const SIGNED_URL_SECONDS = 3600;

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS = 4;

/** Regelt geplakte schermafbeeldingen: controleren, uploaden en ondertekende links ophalen. */
export class AttachmentService {
  private readonly urlCache = new Map<string, { url: string; expiresAt: number }>();

  constructor(private readonly db: Db) {}

  /** Geeft een foutmelding terug als het bestand geen toegestane afbeelding is. */
  static validate(file: File): string | null {
    if (!(file.type in EXTENSIONS)) return 'Only PNG, JPEG, WebP and GIF images can be pasted.';
    if (file.size > MAX_IMAGE_BYTES) return 'Images can be at most 5 MB.';
    if (file.size === 0) return 'That image is empty.';
    return null;
  }

  static async measure(file: File): Promise<{ width: number; height: number }> {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  }

  async upload(channelId: string, userId: string, file: File): Promise<OutgoingAttachment> {
    const problem = AttachmentService.validate(file);
    if (problem) throw new AppError('invalid_image', problem);
    const { width, height } = await AttachmentService.measure(file);
    const path = `${channelId}/${userId}/${crypto.randomUUID()}.${EXTENSIONS[file.type]}`;
    const { error } = await this.db.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw AppError.from(error);
    return { kind: 'image', path, mime: file.type, width, height, size: file.size };
  }

  /** Ruimt geüploade bestanden op als het versturen daarna mislukt. */
  async discard(paths: string[]): Promise<void> {
    if (paths.length > 0) await this.db.storage.from(BUCKET).remove(paths);
  }

  async listForMessages(messageIds: number[]): Promise<Attachment[]> {
    if (messageIds.length === 0) return [];
    return unwrap(await this.db.from('message_attachments').select('*').in('message_id', messageIds));
  }

  /** Ondertekende links worden bewaard tot kort voor ze verlopen. */
  async signedUrl(path: string): Promise<string> {
    const cached = this.urlCache.get(path);
    if (cached && cached.expiresAt > Date.now()) return cached.url;
    const { data, error } = await this.db.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
    if (error || !data) throw AppError.from(error ?? new Error('no_url'));
    this.urlCache.set(path, { url: data.signedUrl, expiresAt: Date.now() + (SIGNED_URL_SECONDS - 300) * 1000 });
    return data.signedUrl;
  }
}
