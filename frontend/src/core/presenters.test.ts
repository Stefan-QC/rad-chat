import { describe, expect, it } from 'vitest';
import { ChannelPresenter } from './ChannelPresenter';
import { StatusPresenter } from './presence';
import type { Channel, ChannelMember, Profile } from './types';

const person = (id: string, name: string, extra: Partial<Profile> = {}): Profile => ({
  id, username: name.toLowerCase(), display_name: name, job_title: null, bio: null, avatar_color: '#D71920', role: 'member', expires_at: null,
  deactivated_at: null, status: 'available', status_text: null, status_emoji: null, status_until: null, birth_month: null, birth_day: null,
  start_date: null, coffee_opt_in: false, created_at: '2026-01-01T00:00:00Z', ...extra,
});
const channel = (id: string, kind: Channel['kind'], name = 'x'): Channel => ({
  id, name, kind, team_id: null, topic: 'onderwerp', is_private: kind !== 'text', post_policy: 'everyone', created_by: null, created_at: '2026-01-01T00:00:00Z',
});
const member = (channel_id: string, user_id: string, role: ChannelMember['role'] = 'member'): ChannelMember => ({ channel_id, user_id, role, joined_at: '2026-01-01T00:00:00Z' });

describe('ChannelPresenter', () => {
  const profiles = [person('me', 'Ik'), person('a', 'Anna'), person('b', 'Bram')];
  const members = [member('dm', 'me'), member('dm', 'a'), member('grp', 'me', 'owner'), member('grp', 'a'), member('grp', 'b')];
  const presenter = new ChannelPresenter(profiles, members, 'me');

  it('others() leaves yourself out', () => {
    expect(presenter.others(channel('grp', 'group')).map(p => p.display_name)).toEqual(['Anna', 'Bram']);
  });

  it('names a DM after the other person', () => {
    expect(presenter.title(channel('dm', 'dm'))).toBe('Anna');
  });

  it('names a group after its name, or after its members when the name is empty', () => {
    expect(presenter.title(channel('grp', 'group', 'Project X'))).toBe('Project X');
    expect(presenter.title(channel('grp', 'group', '  '))).toBe('Anna, Bram');
  });

  it('keeps the plain name for normal channels', () => {
    expect(presenter.title(channel('c', 'text', 'general'))).toBe('general');
  });

  it('subtitle() shows the members of a group and the topic of a channel', () => {
    expect(presenter.subtitle(channel('grp', 'group'))).toBe('Anna, Bram');
    expect(presenter.subtitle(channel('c', 'text'))).toBe('onderwerp');
  });

  it('isConversation() is true for DMs and groups only', () => {
    expect(presenter.isConversation(channel('dm', 'dm'))).toBe(true);
    expect(presenter.isConversation(channel('grp', 'group'))).toBe(true);
    expect(presenter.isConversation(channel('c', 'text'))).toBe(false);
  });

  it('roleOf() returns the role in the channel or null', () => {
    expect(presenter.roleOf(channel('grp', 'group'), 'me')).toBe('owner');
    expect(presenter.roleOf(channel('grp', 'group'), 'nobody')).toBeNull();
  });
});

describe('StatusPresenter', () => {
  const now = Date.parse('2026-10-25T12:00:00Z');

  it('effective() falls back to available once the status has expired', () => {
    expect(StatusPresenter.effective({ status: 'busy', status_until: '2026-10-25T11:00:00Z' }, now)).toBe('available');
    expect(StatusPresenter.effective({ status: 'busy', status_until: '2026-10-25T13:00:00Z' }, now)).toBe('busy');
    expect(StatusPresenter.effective({ status: 'away', status_until: null }, now)).toBe('away');
  });

  it('label() and color() know every status', () => {
    expect(StatusPresenter.label('meeting')).toBe('In a meeting');
    expect(StatusPresenter.color('dnd')).toMatch(/^#/);
  });

  it('text() shows emoji and custom text, or the status name, or nothing when available', () => {
    expect(StatusPresenter.text(person('x', 'X', { status: 'busy', status_emoji: '🍽️', status_text: 'Lunch', status_until: '2026-10-25T13:00:00Z' }), now)).toBe('🍽️ Lunch');
    expect(StatusPresenter.text(person('x', 'X', { status: 'meeting' }), now)).toBe('In a meeting');
    expect(StatusPresenter.text(person('x', 'X'), now)).toBe('');
  });

  it('text() hides an expired custom status', () => {
    expect(StatusPresenter.text(person('x', 'X', { status: 'busy', status_text: 'Lunch', status_until: '2026-10-25T08:00:00Z' }), now)).toBe('');
  });
});
