import { useEffect, useState } from 'react';
import { NavLink, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import { useSettings } from '../app/SettingsContext';
import { ChangePasswordForm } from '../components/account/ChangePasswordForm';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { Switch } from '../components/ui/Switch';
import { useToast } from '../components/ui/Toast';
import type { ThemePreference } from '../core/ThemeService';
import { useTheme } from '../hooks/useTheme';
import { BrowserNotifier } from '../services/BrowserNotifier';

/** Een paneel van de instellingen zelf (rechts) of een snelkoppeling naar een pagina van de app. */
interface NavItem {
  label: string;
  icon: string;
  /** Het id van een paneel in de instellingen; zonder id is het een link naar een andere pagina. */
  tab?: 'account' | 'appearance' | 'notifications' | 'chat';
  to?: string;
}

interface NavGroup {
  title: string;
  adminOnly?: boolean;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    title: 'User settings',
    items: [
      { label: 'My account', icon: 'user', tab: 'account' },
      { label: 'Appearance', icon: 'palette', tab: 'appearance' },
      { label: 'Notifications', icon: 'bell', tab: 'notifications' },
      { label: 'Chat', icon: 'chat', tab: 'chat' },
    ],
  },
  {
    title: 'Apps and games',
    items: [
      { label: 'Teams', icon: 'users', to: '/teams' },
      { label: 'Leaderboard', icon: 'trophy', to: '/leaderboard' },
      { label: 'RAD Wordle', icon: 'grid', to: '/wordle' },
      { label: 'Type race', icon: 'keyboard', to: '/typerace' },
      { label: 'RAD Craft', icon: 'cube', to: '/craft' },
    ],
  },
  { title: 'Administration', adminOnly: true, items: [{ label: 'Admin console', icon: 'shield', to: '/admin' }] },
];

const TABS = GROUPS.flatMap(group => group.items).filter(item => item.tab).map(item => item.tab as string);

const THEMES: { value: ThemePreference; label: string; hint: string }[] = [
  { value: 'system', label: 'System', hint: 'Follows your device' },
  { value: 'light', label: 'Light', hint: 'Bright and clear' },
  { value: 'dark', label: 'Dark', hint: 'Easy on the eyes' },
];

/** Klein voorbeeldscherm dat het thema toont zonder het echte thema te veranderen. */
function ThemePreview({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <div className="theme-preview" data-theme={theme} aria-hidden="true">
      <span className="tp-rail" />
      <span className="tp-side"><i /><i /><i /></span>
      <span className="tp-main"><i /><i /><i className="short" /></span>
    </div>
  );
}

function AccountTab() {
  const { me, session, signOut } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  return (
    <section>
      <h2>My account</h2>
      <div className="st-profile">
        <div className="st-banner" style={{ backgroundColor: me.avatar_color }} />
        <div className="st-profile-body">
          <Avatar name={me.display_name} color={me.avatar_color} size="lg" />
          <div className="st-profile-name">
            <b>{me.display_name}</b>
            <small>@{me.username}</small>
          </div>
          <span className="badge">{me.role}</span>
          <button className="btn small" onClick={() => navigate('/profile')}>Edit profile</button>
        </div>
        <dl className="st-fields">
          <div><dt>Display name</dt><dd>{me.display_name}</dd></div>
          <div><dt>Username</dt><dd>@{me.username}</dd></div>
          <div><dt>Email</dt><dd>{session?.user.email}</dd></div>
          {me.job_title && <div><dt>Job title</dt><dd>{me.job_title}</dd></div>}
        </dl>
      </div>
      <h3>Password</h3>
      <p className="muted">Change your own password. You need your current password for this, and nobody else can change it for you, not even an admin.</p>
      <ChangePasswordForm />
      <h3>Sign out</h3>
      <p className="muted">You will have to sign in again to use RAD Chat on this device.</p>
      <button className="btn danger" disabled={busy} onClick={() => { setBusy(true); void signOut(); }}>Sign out</button>
    </section>
  );
}

function AppearanceTab() {
  const { settings, update } = useSettings();
  const { resolved } = useTheme();
  return (
    <section>
      <h2>Appearance</h2>
      <p className="muted">Choose how RAD Chat looks. Right now you see the {resolved} theme.</p>
      <div className="theme-cards" role="radiogroup" aria-label="Theme">
        {THEMES.map(item => (
          <button
            key={item.value}
            role="radio"
            aria-checked={settings.theme === item.value}
            className={`theme-card${settings.theme === item.value ? ' on' : ''}`}
            onClick={() => void update({ theme: item.value })}
          >
            {item.value === 'system' ? (
              <div className="theme-preview split"><ThemePreview theme="light" /><ThemePreview theme="dark" /></div>
            ) : <ThemePreview theme={item.value} />}
            <b>{item.label}</b>
            <small>{item.hint}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function NotificationsTab() {
  const { settings, update } = useSettings();
  const toast = useToast();
  const permission = BrowserNotifier.permission();

  const toggleBrowser = async (enabled: boolean) => {
    if (!enabled) return update({ notify_browser: false });
    const result = await BrowserNotifier.request();
    if (result === 'granted') return update({ notify_browser: true });
    toast.error(result === 'unsupported' ? 'This browser does not support desktop notifications.' : 'Notifications are blocked. Allow them in the browser settings for this site.');
  };

  return (
    <section>
      <h2>Notifications</h2>
      <p className="muted">Decide what gets your attention.</p>
      <Switch label="Mentions and replies" description="When someone mentions you or replies to your message." checked={settings.notify_mentions} onChange={checked => void update({ notify_mentions: checked })} />
      <Switch label="Direct messages" description="New messages in your direct and group conversations." checked={settings.notify_messages} onChange={checked => void update({ notify_messages: checked })} />
      <Switch label="Sound" description="Play a short sound for new notifications." checked={settings.notify_sound} onChange={checked => void update({ notify_sound: checked })} />
      <Switch
        label="Desktop notifications"
        description={permission === 'denied' ? 'Blocked in your browser. Allow notifications for this site to turn this on.' : 'Show a notification when RAD Chat is in the background.'}
        checked={settings.notify_browser && permission === 'granted'}
        disabled={permission === 'denied' || permission === 'unsupported'}
        onChange={checked => void toggleBrowser(checked)}
      />
    </section>
  );
}

function ChatTab() {
  const { settings, update } = useSettings();
  return (
    <section>
      <h2>Chat</h2>
      <p className="muted">Tune the message list to your taste.</p>
      <Switch label="Compact mode" description="Tighter spacing so more messages fit on screen." checked={settings.compact_mode} onChange={checked => void update({ compact_mode: checked })} />
      <h3>Keyboard shortcuts</h3>
      <dl className="shortcuts">
        <dt><kbd>Ctrl</kbd> + <kbd>K</kbd></dt><dd>Quick switcher and search</dd>
        <dt><kbd>Enter</kbd></dt><dd>Send a message</dd>
        <dt><kbd>Shift</kbd> + <kbd>Enter</kbd></dt><dd>New line</dd>
        <dt><kbd>Ctrl</kbd> + <kbd>V</kbd></dt><dd>Paste a screenshot from the clipboard</dd>
        <dt><kbd>Esc</kbd></dt><dd>Close settings, a dialog or cancel editing</dd>
      </dl>
    </section>
  );
}

/**
 * Instellingen in de stijl van Discord: links de categorieën, rechts het gekozen paneel.
 * Onder "Apps and games" en "Administration" staan de snelkoppelingen die eerder in de zwarte balk stonden.
 */
export function SettingsPage() {
  const { tab } = useParams();
  const { me } = useAuth();
  const navigate = useNavigate();

  // Esc sluit de instellingen, zoals in Discord.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName);
      if (event.key === 'Escape' && !typing && !document.querySelector('[role="dialog"]')) navigate('/');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  if (!tab || !TABS.includes(tab)) return <Navigate to="/settings/account" replace />;
  const groups = GROUPS.filter(group => !group.adminOnly || me?.role === 'admin');

  return (
    <>
      <PageHeader title="Settings" prefix={<Icon name="gear" size={20} />} />
      <div className="st">
        <nav className="st-nav" aria-label="Settings sections">
          {groups.map(group => (
            <div className="st-group" key={group.title}>
              <h4>{group.title}</h4>
              {group.items.map(item => (
                <NavLink
                  key={item.label}
                  to={item.to ?? `/settings/${item.tab}`}
                  className={({ isActive }) => `st-link${item.tab && isActive ? ' on' : ''}${item.to ? ' ext' : ''}`}
                >
                  <Icon name={item.icon} size={18} />
                  <span>{item.label}</span>
                  {item.to && <Icon name="arrow" size={14} className="st-arrow" />}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="st-content">
          <button className="st-close" onClick={() => navigate('/')} aria-label="Close settings" title="Close settings">
            <Icon name="close" size={18} /><small>ESC</small>
          </button>
          <div className="st-scroll">
            <div className="st-pane">
              {tab === 'account' && <AccountTab />}
              {tab === 'appearance' && <AppearanceTab />}
              {tab === 'notifications' && <NotificationsTab />}
              {tab === 'chat' && <ChatTab />}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
