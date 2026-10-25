import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { NotificationsProvider } from '../../app/NotificationsContext';
import { SettingsProvider } from '../../app/SettingsContext';
import { WorkspaceProvider, useWorkspace } from '../../app/WorkspaceContext';
import { MembersPanel } from './MembersPanel';
import { QuickSwitcher } from './QuickSwitcher';
import { Rail } from './Rail';
import { Sidebar } from './Sidebar';

function ShellLayout() {
  const { drawerOpen, closeDrawer } = useWorkspace();
  const { pathname } = useLocation();
  const showMembers = pathname.startsWith('/channels/');
  const [switcher, setSwitcher] = useState(false);

  // Ctrl+K (of Cmd+K) opent de snelwisselaar overal in de app.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSwitcher(open => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => setSwitcher(false), [pathname]);
  return (
    <div id="app" className={`${drawerOpen ? 'drawer' : ''} ${showMembers ? '' : 'no-members'}`}>
      <Rail />
      <Sidebar onSearch={() => setSwitcher(true)} />
      <section id="main" onClick={closeDrawer}>
        <Outlet />
      </section>
      {showMembers && <MembersPanel />}
      {switcher && <QuickSwitcher onClose={() => setSwitcher(false)} />}
    </div>
  );
}

/** De ingelogde omgeving: balken links, de actieve pagina in het midden en optioneel de ledenlijst rechts. */
export function Shell() {
  return (
    <SettingsProvider>
      <NotificationsProvider>
        <WorkspaceProvider>
          <ShellLayout />
        </WorkspaceProvider>
      </NotificationsProvider>
    </SettingsProvider>
  );
}
