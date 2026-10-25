import type { PresenceStatus, Profile } from './types';

export const STATUS_OPTIONS: { value: PresenceStatus; label: string; color: string }[] = [
  { value: 'available', label: 'Available', color: 'var(--online)' },
  { value: 'busy', label: 'Busy', color: '#e5484d' },
  { value: 'meeting', label: 'In a meeting', color: '#8e4ec6' },
  { value: 'away', label: 'Away', color: '#f5a524' },
  { value: 'dnd', label: 'Do not disturb', color: '#6e6466' },
];

/** Gebruikersstatus met automatische verloop: na status_until geldt iemand weer als beschikbaar. */
export class StatusPresenter {
  static effective(profile: Pick<Profile, 'status' | 'status_until'>, now = Date.now()): PresenceStatus {
    if (profile.status_until && new Date(profile.status_until).getTime() <= now) return 'available';
    return profile.status;
  }

  static label(status: PresenceStatus): string {
    return STATUS_OPTIONS.find(option => option.value === status)?.label ?? 'Available';
  }

  static color(status: PresenceStatus): string {
    return STATUS_OPTIONS.find(option => option.value === status)?.color ?? 'var(--online)';
  }

  /** De zichtbare tekst naast een naam: emoji en eigen tekst, anders de naam van de status. */
  static text(profile: Profile, now = Date.now()): string {
    const status = StatusPresenter.effective(profile, now);
    const expired = status === 'available' && profile.status !== 'available';
    const custom = !expired && profile.status_text ? profile.status_text : '';
    const emoji = !expired && profile.status_emoji ? `${profile.status_emoji} ` : '';
    if (custom || emoji) return `${emoji}${custom}`.trim();
    return status === 'available' ? '' : StatusPresenter.label(status);
  }
}
