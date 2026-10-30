import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './app/AuthContext';
import { useWorkspace } from './app/WorkspaceContext';
import { Shell } from './components/shell/Shell';
import { ChatPage } from './pages/ChatPage';
import { LoginPage } from './pages/LoginPage';

// Zware pagina's (spel, beheer, kennisbank, ...) worden pas geladen als iemand ze opent.
const lazyPage = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => load().then(module => ({ default: module[name] })));

const AdminPage = lazyPage(() => import('./pages/AdminPage'), 'AdminPage');
const CraftPage = lazyPage(() => import('./pages/CraftPage'), 'CraftPage');
const KnowledgePage = lazyPage(() => import('./pages/KnowledgePage'), 'KnowledgePage');
const KudosPage = lazyPage(() => import('./pages/KudosPage'), 'KudosPage');
const LeaderboardPage = lazyPage(() => import('./pages/LeaderboardPage'), 'LeaderboardPage');
const MeetingsPage = lazyPage(() => import('./pages/MeetingsPage'), 'MeetingsPage');
const PeoplePage = lazyPage(() => import('./pages/PeoplePage'), 'PeoplePage');
const ProfilePage = lazyPage(() => import('./pages/ProfilePage'), 'ProfilePage');
const QuizPage = lazyPage(() => import('./pages/QuizPage'), 'QuizPage');
const SettingsPage = lazyPage(() => import('./pages/SettingsPage'), 'SettingsPage');
const TasksPage = lazyPage(() => import('./pages/TasksPage'), 'TasksPage');
const TeamsPage = lazyPage(() => import('./pages/TeamsPage'), 'TeamsPage');
const WordlePage = lazyPage(() => import('./pages/WordlePage'), 'WordlePage');
const TypeRacePage = lazyPage(() => import('./pages/TypeRacePage'), 'TypeRacePage');

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
    <Suspense fallback={<Splash />}>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route index element={<HomeRedirect />} />
        <Route path="channels/:channelId" element={<ChatPage />} />
        <Route path="people" element={<PeoplePage />} />
        <Route path="knowledge" element={<KnowledgePage />} />
        <Route path="knowledge/:pageId" element={<KnowledgePage />} />
        <Route path="meetings" element={<MeetingsPage />} />
        <Route path="meetings/:meetingId" element={<MeetingsPage />} />
        <Route path="kudos" element={<KudosPage />} />
        <Route path="quiz" element={<QuizPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="teams" element={<TeamsPage />} />
        <Route path="teams/:teamId" element={<TeamsPage />} />
        <Route path="leaderboard" element={<LeaderboardPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="settings/:tab" element={<SettingsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="profile/:userId" element={<ProfilePage />} />
        <Route path="wordle" element={<WordlePage />} />
        <Route path="typerace" element={<TypeRacePage />} />
        <Route path="craft" element={<CraftPage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
      <Route path="*" element={<Outlet />} />
    </Routes>
    </Suspense>
  );
}
