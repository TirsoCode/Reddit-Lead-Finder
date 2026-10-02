import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { api, type Profile, type ScanRun } from './lib/api';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { ThemeProvider } from './hooks/useTheme';
import { AuthPage } from './pages/AuthPage';
import { Dashboard } from './pages/Dashboard';
import { Landing } from './pages/Landing';
import { LeadsPage } from './pages/LeadsPage';
import { ProfilePage } from './pages/ProfilePage';

function FullScreenLoader() {
  return (
    <div className="grid min-h-screen place-items-center bg-white dark:bg-neutral-950">
      <div className="flex flex-col items-center gap-3">
        <Spinner className="h-5 w-5 text-brand-500" />
        <p className="text-sm text-ink-faint dark:text-neutral-500">Cargando…</p>
      </div>
    </div>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

function AppContent() {
  const { session, loading, signOut } = useAuth();
  const navigate = useNavigate();

  const [showAuth, setShowAuth] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [runs, setRuns] = useState<ScanRun[]>([]);
  const [pendingReplies, setPendingReplies] = useState(0);

  const refreshProfile = useCallback(async () => {
    try {
      const data = await api.getProfile();
      setProfile(data.profile);
      setRuns(data.runs);
      setPendingReplies(data.pendingReplies);
    } catch {
      // Las páginas muestran su propio estado de error; aquí no interrumpe.
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    void refreshProfile();
  }, [session, refreshProfile]);

  const handleSignOut = useCallback(async () => {
    await signOut();
    setShowAuth(false);
    navigate('/');
  }, [signOut, navigate]);

  if (loading) return <FullScreenLoader />;

  // Sin sesión: portada pública, y el formulario de acceso a un clic.
  if (!session) {
    if (showAuth) return <AuthPage onBack={() => setShowAuth(false)} />;
    return <Landing onAuth={() => setShowAuth(true)} />;
  }

  return (
    <Routes>
      {/* La portada pública también existe con sesión iniciada: es a donde lleva el logo del panel. */}
      <Route path="/portada" element={<Landing onAuth={() => navigate('/')} sessionActive />} />
      <Route
        element={<Layout email={session.email} newLeads={pendingReplies} onSignOut={() => void handleSignOut()} />}
      >
        <Route
          path="/"
          element={
            <Dashboard profile={profile} onProfileChange={refreshProfile} onOpenLeads={() => navigate('/leads')} />
          }
        />
        <Route
          path="/leads"
          element={<LeadsPage pendingReplies={pendingReplies} onProfileChange={refreshProfile} />}
        />
        <Route path="/perfil" element={<ProfilePage profile={profile} runs={runs} onProfileChange={refreshProfile} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
