import { useState } from 'react';
import { NavLink, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../app/AuthContext';
import { useSettings } from '../app/SettingsContext';
import { PageHeader } from '../components/PageHeader';
import { Switch } from '../components/ui/Switch';
import { useToast } from '../components/ui/Toast';
import type { ThemePreference } from '../core/ThemeService';
import { useTheme } from '../hooks/useTheme';
import { BrowserNotifier } from '../services/BrowserNotifier';

const TABS = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'chat', label: 'Chat' },
  { id: 'account', label: 'Account' },
] as const;

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
        <dt><kbd>Esc</kbd></dt><dd>Close a dialog or cancel editing</dd>
      </dl>
    </section>
  );
}

function AccountTab() {
  const { me, session, signOut } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  return (
    <section>
      <h2>Account</h2>
      <dl className="facts">
        <dt>Name</dt><dd>{me?.display_name}</dd>
        <dt>Username</dt><dd>@{me?.username}</dd>
        <dt>Email</dt><dd>{session?.user.email}</dd>
        <dt>Role</dt><dd>{me?.role}</dd>
      </dl>
      <div className="actions left">
        <button className="btn" onClick={() => navigate('/profile')}>Edit profile</button>
        <button className="btn secondary" disabled={busy} onClick={() => { setBusy(true); void signOut(); }}>Sign out</button>
      </div>
    </section>
  );
}

/** Instellingen met tabbladen, bereikbaar via het tandwieltje onderin de zijbalk. */
export function SettingsPage() {
  const { tab } = useParams();
  const current = TABS.find(item => item.id === tab);
  if (!current) return <Navigate to="/settings/appearance" replace />;
  return (
    <>
      <PageHeader title="Settings" />
      <div className="page settings-page">
        <nav className="settings-tabs" aria-label="Settings sections">
          {TABS.map(item => (
            <NavLink key={item.id} to={`/settings/${item.id}`} className={({ isActive }) => (isActive ? 'on' : '')}>{item.label}</NavLink>
          ))}
        </nav>
        <div className="card settings-body">
          {current.id === 'appearance' && <AppearanceTab />}
          {current.id === 'notifications' && <NotificationsTab />}
          {current.id === 'chat' && <ChatTab />}
          {current.id === 'account' && <AccountTab />}
        </div>
      </div>
    </>
  );
}
