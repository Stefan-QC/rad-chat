import { Outlet, useLocation } from 'react-router-dom';
import { WorkspaceProvider, useWorkspace } from '../../app/WorkspaceContext';
import { MembersPanel } from './MembersPanel';
import { Rail } from './Rail';
import { Sidebar } from './Sidebar';

function ShellLayout() {
  const { drawerOpen, closeDrawer } = useWorkspace();
  const { pathname } = useLocation();
  const showMembers = pathname.startsWith('/channels/');
  return (
    <div id="app" className={`${drawerOpen ? 'drawer' : ''} ${showMembers ? '' : 'no-members'}`}>
      <Rail />
      <Sidebar />
      <section id="main" onClick={closeDrawer}>
        <Outlet />
      </section>
      {showMembers && <MembersPanel />}
    </div>
  );
}

/** De ingelogde omgeving: balken links, de actieve pagina in het midden en optioneel de ledenlijst rechts. */
export function Shell() {
  return (
    <WorkspaceProvider>
      <ShellLayout />
    </WorkspaceProvider>
  );
}
