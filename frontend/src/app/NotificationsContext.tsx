import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { AppNotification, UnreadEntry } from '../core/types';
import { BrowserNotifier } from '../services/BrowserNotifier';
import { NotificationSound } from '../services/NotificationSound';
import { useToast } from '../components/ui/Toast';
import { useMe } from './AuthContext';
import { useServices } from './ServicesContext';
import { useSettings } from './SettingsContext';

interface NotificationsValue {
  notifications: AppNotification[];
  unreadCount: number;
  unreadOf: (channelId: string) => UnreadEntry | undefined;
  markAllRead: () => Promise<void>;
  open: (notification: AppNotification) => Promise<void>;
  markChannelRead: (channelId: string, messageId: number) => void;
}

const NotificationsContext = createContext<NotificationsValue | null>(null);

/** Houdt de inbox en de ongelezen-tellers bij en toont nieuwe meldingen als toast, bureaubladmelding of geluid. */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { notifications: service } = useServices();
  const me = useMe();
  const { settings } = useSettings();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState<Map<string, UnreadEntry>>(new Map());
  const sound = useRef(new NotificationSound());
  const settingsRef = useRef(settings);
  const pathRef = useRef(location.pathname);
  const navigateRef = useRef(navigate);
  const toastRef = useRef(toast);
  settingsRef.current = settings;
  pathRef.current = location.pathname;
  navigateRef.current = navigate;
  toastRef.current = toast;

  const refreshUnread = useCallback(() => {
    service.unread().then(rows => setUnread(new Map(rows.map(row => [row.channel_id, row])))).catch(() => undefined);
  }, [service]);

  useEffect(() => {
    service.list().then(setNotifications).catch(() => undefined);
    refreshUnread();
    return service.subscribe(me.id, incoming => {
      setNotifications(list => (list.some(n => n.id === incoming.id) ? list : [incoming, ...list]));
      refreshUnread();
      const prefs = settingsRef.current;
      const wanted = incoming.kind === 'dm' ? prefs.notify_messages : prefs.notify_mentions;
      const looking = document.hasFocus() && incoming.channel_id !== null && pathRef.current === `/channels/${incoming.channel_id}`;
      if (!wanted || looking) return;
      toastRef.current.show(`${incoming.title}${incoming.body ? `: ${incoming.body}` : ''}`);
      if (prefs.notify_sound) sound.current.play();
      if (prefs.notify_browser) BrowserNotifier.notify(incoming.title, incoming.body ?? '', () => incoming.link && navigateRef.current(incoming.link));
    });
  }, [service, me.id, refreshUnread]);

  const unreadCount = useMemo(() => notifications.filter(n => n.read_at === null).length, [notifications]);

  useEffect(() => {
    document.title = unreadCount > 0 ? `(${unreadCount}) RAD Chat` : 'RAD Chat';
  }, [unreadCount]);

  const markAllRead = useCallback(async () => {
    setNotifications(list => list.map(n => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })));
    await service.markRead();
    refreshUnread();
  }, [service, refreshUnread]);

  const open = useCallback(async (notification: AppNotification) => {
    if (notification.read_at === null) {
      setNotifications(list => list.map(n => (n.id === notification.id ? { ...n, read_at: new Date().toISOString() } : n)));
      void service.markRead([notification.id]).then(refreshUnread);
    }
    if (notification.link) navigateRef.current(notification.link);
  }, [service, refreshUnread]);

  const markChannelRead = useCallback((channelId: string, messageId: number) => {
    service.markChannelRead(channelId, messageId).then(() => {
      refreshUnread();
      setNotifications(list => list.map(n => (n.channel_id === channelId && n.read_at === null && (n.message_id ?? 0) <= messageId ? { ...n, read_at: new Date().toISOString() } : n)));
    }).catch(() => undefined);
  }, [service, refreshUnread]);

  const unreadOf = useCallback((channelId: string) => unread.get(channelId), [unread]);
  const value = useMemo(() => ({ notifications, unreadCount, unreadOf, markAllRead, open, markChannelRead }), [notifications, unreadCount, unreadOf, markAllRead, open, markChannelRead]);
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsValue {
  const value = useContext(NotificationsContext);
  if (!value) throw new Error('useNotifications must be used inside NotificationsProvider');
  return value;
}
