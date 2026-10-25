import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './app/AuthContext';
import { useWorkspace } from './app/WorkspaceContext';
import { Shell } from './components/shell/Shell';
import { AdminPage } from './pages/AdminPage';
import { ChatPage } from './pages/ChatPage';
import { CraftPage } from './pages/CraftPage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { LoginPage } from './pages/LoginPage';
import { PeoplePage } from './pages/PeoplePage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';
import { TeamsPage } from './pages/TeamsPage';
import { WordlePage } from './pages/WordlePage';

function Splash() {
  return <div className="splash">Loading…</div>;
}

/** Stuurt niet-ingelogde bezoekers naar het inlogscherm. */
function RequireAuth() {
  const { status } = useAuth();
  if (status === 'loading') return <Splash />;
  if (status === 'signedOut') return <Navigate to="/login" replace />;
  return <Shell />;
}

/** Opent het eerste bedrijfskanaal zodra de kanalen geladen zijn. */
function HomeRedirect() {
  const { channels } = useWorkspace();
  const first = channels.find(c => c.team_id === null && c.kind === 'text');
  if (!first) return <div className="page-loading">Loading…</div>;
  return <Navigate to={`/channels/${first.id}`} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route index element={<HomeRedirect />} />
        <Route path="channels/:channelId" element={<ChatPage />} />
        <Route path="people" element={<PeoplePage />} />
        <Route path="teams" element={<TeamsPage />} />
        <Route path="teams/:teamId" element={<TeamsPage />} />
        <Route path="leaderboard" element={<LeaderboardPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="settings/:tab" element={<SettingsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="profile/:userId" element={<ProfilePage />} />
        <Route path="wordle" element={<WordlePage />} />
        <Route path="craft" element={<CraftPage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
      <Route path="*" element={<Outlet />} />
    </Routes>
  );
}
