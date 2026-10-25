import type { Channel, ChannelMember, Profile } from './types';

/** Bepaalt hoe een kanaal getoond wordt: een DM heet naar de ander, een groep naar zijn leden. */
export class ChannelPresenter {
  constructor(
    private readonly profiles: Profile[],
    private readonly members: ChannelMember[],
    private readonly meId: string,
  ) {}

  /** De andere deelnemers van een gesprek, zonder jezelf. */
  others(channel: Channel): Profile[] {
    return this.members
      .filter(m => m.channel_id === channel.id && m.user_id !== this.meId)
      .map(m => this.profiles.find(p => p.id === m.user_id))
      .filter((p): p is Profile => Boolean(p));
  }

  title(channel: Channel): string {
    if (channel.kind === 'dm') return this.others(channel)[0]?.display_name ?? 'Direct message';
    if (channel.kind === 'group') return channel.name.trim() || this.others(channel).map(p => p.display_name).join(', ');
    return channel.name;
  }

  /** Korte beschrijving onder de titel, bijvoorbeeld de leden van een groep. */
  subtitle(channel: Channel): string {
    if (channel.kind === 'dm') return this.others(channel)[0]?.job_title ?? '';
    if (channel.kind === 'group') return this.others(channel).map(p => p.display_name).join(', ');
    return channel.topic ?? '';
  }

  isConversation(channel: Channel): boolean {
    return channel.kind === 'dm' || channel.kind === 'group';
  }

  roleOf(channel: Channel, userId: string): ChannelMember['role'] | null {
    return this.members.find(m => m.channel_id === channel.id && m.user_id === userId)?.role ?? null;
  }
}
