import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext';
import { useServices } from '../../app/ServicesContext';
import { useWorkspace } from '../../app/WorkspaceContext';
import { messageOf } from '../../core/AppError';
import type { Message } from '../../core/types';
import { Avatar } from '../Avatar';
import { Icon } from '../Icon';
import { useToast } from '../ui/Toast';

interface Item {
  key: string;
  group: 'Channels' | 'People' | 'Teams' | 'Pages' | 'Messages';
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
}

const PAGES = [
  { path: '/wordle', label: 'RAD Wordle' },
  { path: '/craft', label: 'RAD Craft' },
  { path: '/people', label: 'Who is where' },
  { path: '/teams', label: 'Teams' },
  { path: '/leaderboard', label: 'Leaderboard' },
  { path: '/profile', label: 'Your profile' },
  { path: '/settings', label: 'Settings' },
];

const matches = (text: string, query: string) => text.toLowerCase().includes(query);

/** Zoekdialoog (Ctrl+K): springt naar kanalen, mensen, teams en pagina's en doorzoekt berichten. */
export function QuickSwitcher({ onClose }: { onClose: () => void }) {
  const { search, channels: channelService } = useServices();
  const { me } = useAuth();
  const { channels, teams, profiles, presenter, refreshChannels } = useWorkspace();
  const navigate = useNavigate();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Message[]>([]);
  const [active, setActive] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const text = query.trim().toLowerCase();

  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const channel of channels) {
      if (channel.kind === 'voice') continue;
      const title = presenter.title(channel);
      if (text && !matches(title, text)) continue;
      out.push({
        key: `c-${channel.id}`, group: 'Channels', label: title, hint: channel.team_id ? teams.find(t => t.id === channel.team_id)?.name : channel.is_private ? 'Private' : undefined,
        icon: channel.kind === 'dm' || channel.kind === 'group' ? <Icon name="user" size={16} /> : channel.is_private ? <Icon name="lock" size={16} /> : <span className="hash">#</span>,
        run: () => go(`/channels/${channel.id}`),
      });
    }
    if (me?.role !== 'guest') {
      for (const person of profiles) {
        if (person.id === me?.id || person.deactivated_at || (text && !matches(person.display_name, text) && !matches(person.username, text))) continue;
        out.push({
          key: `p-${person.id}`, group: 'People', label: person.display_name, hint: `@${person.username}`,
          icon: <Avatar name={person.display_name} color={person.avatar_color} size="xs" />,
          run: () => {
            channelService.startDirectMessage(person.id).then(async id => { await refreshChannels(); go(`/channels/${id}`); }).catch(error => toast.error(messageOf(error)));
          },
        });
      }
    }
    for (const team of teams) {
      if (text && !matches(team.name, text)) continue;
      out.push({ key: `t-${team.id}`, group: 'Teams', label: team.name, hint: `${team.members.length} members`, icon: <Icon name="users" size={16} />, run: () => go(`/teams/${team.id}`) });
    }
    const pages = me?.role === 'admin' ? [...PAGES, { path: '/admin', label: 'Admin' }] : PAGES;
    for (const page of pages) {
      if (text && !matches(page.label, text)) continue;
      out.push({ key: `g-${page.path}`, group: 'Pages', label: page.label, icon: <Icon name="grid" size={16} />, run: () => go(page.path) });
    }
    for (const message of found) {
      const channel = channels.find(c => c.id === message.channel_id);
      const author = profiles.find(p => p.id === message.user_id);
      out.push({
        key: `m-${message.id}`, group: 'Messages', label: message.body.slice(0, 90), hint: `${author?.display_name ?? 'Someone'} in ${channel ? presenter.title(channel) : 'a channel'}`,
        icon: <Icon name="chat" size={16} />,
        run: () => go(`/channels/${message.channel_id}${message.parent_id ? `?thread=${message.parent_id}` : ''}`),
      });
    }
    return out.slice(0, 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels, teams, profiles, presenter, found, text, me]);

  useEffect(() => {
    setActive(0);
  }, [text, found]);

  useEffect(() => {
    if (text.length < 2) { setFound([]); return; }
    let live = true;
    const timer = setTimeout(() => {
      search.messages(text).then(rows => live && setFound(rows)).catch(() => live && setFound([]));
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [text, search]);

  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(i => Math.min(i + 1, items.length - 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
    else if (event.key === 'Enter') { event.preventDefault(); items[active]?.run(); }
    else if (event.key === 'Escape') { event.preventDefault(); onClose(); }
  };

  let lastGroup = '';
  return createPortal(
    <div className="modal-backdrop switcher-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="switcher" role="dialog" aria-modal="true" aria-label="Quick switcher" onKeyDown={onKeyDown}>
        <input autoFocus className="switcher-input" value={query} placeholder="Jump to a channel, person or page, or search messages…" aria-label="Search" onChange={event => setQuery(event.target.value)} />
        <ul ref={list} role="listbox">
          {items.length === 0 && <li className="empty">Nothing found for "{query}".</li>}
          {items.map((item, index) => {
            const showGroup = item.group !== lastGroup;
            lastGroup = item.group;
            return (
              <li key={item.key} className="item-wrap" role="presentation">
                {showGroup && <div className="group">{item.group}</div>}
                <button role="option" aria-selected={index === active} className={index === active ? 'on' : ''} onMouseMove={() => setActive(index)} onClick={item.run}>
                  <span className="ico">{item.icon}</span>
                  <b>{item.label}</b>
                  {item.hint && <small>{item.hint}</small>}
                </button>
              </li>
            );
          })}
        </ul>
        <footer><kbd>↑</kbd><kbd>↓</kbd> to move · <kbd>Enter</kbd> to open · <kbd>Esc</kbd> to close</footer>
      </div>
    </div>,
    document.body,
  );
}
