import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import Layout from '@/components/Layout';
import { Spinner, Toasts } from '@/components/ui';
import { savePendingInvite } from '@/components/CoachWidgets';
import { LoginPage, RegisterPage, ForgotPasswordPage, ResetPasswordPage } from '@/pages/Auth';

const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Diary = lazy(() => import('@/pages/Diary'));
const Foods = lazy(() => import('@/pages/Foods'));
const Recipes = lazy(() => import('@/pages/Recipes'));
const Body = lazy(() => import('@/pages/Body'));
const Progress = lazy(() => import('@/pages/Progress'));
const Reports = lazy(() => import('@/pages/Reports'));
const Goals = lazy(() => import('@/pages/Goals'));
const Profile = lazy(() => import('@/pages/Profile'));
const SettingsPage = lazy(() => import('@/pages/Settings'));
const Admin = lazy(() => import('@/pages/admin/Admin'));
const Coach = lazy(() => import('@/pages/coach/Coach'));
const ClientDetail = lazy(() => import('@/pages/coach/ClientDetail'));
const Join = lazy(() => import('@/pages/coach/Join'));

function Protected({ children }: { children: ReactNode }) {
  const { ready, user } = useApp();
  const loc = useLocation();
  if (!ready) return <Spinner />;
  if (!user) {
    // Keep a PT invite code across sign-in / sign-up; Layout resumes it afterwards.
    if (loc.pathname === '/join') savePendingInvite(new URLSearchParams(loc.search).get('code'));
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  }
  return <>{children}</>;
}

function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdmin, t } = useApp();
  if (!isAdmin) return <div className="card p-8 text-center text-sm text-ink-500">{t('admin_only')}</div>;
  return <>{children}</>;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { ready, user } = useApp();
  if (!ready) return <Spinner />;
  if (user) return <Navigate to="/" replace />;
  return <>{children}<Toasts /></>;
}

export default function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
        <Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} />
        <Route path="/forgot-password" element={<PublicOnly><ForgotPasswordPage /></PublicOnly>} />
        <Route path="/reset-password" element={<><ResetPasswordPage /><Toasts /></>} />
        <Route element={<Protected><Layout /></Protected>}>
          <Route index element={<Dashboard />} />
          <Route path="diary" element={<Diary />} />
          <Route path="foods" element={<Foods />} />
          <Route path="recipes" element={<Recipes />} />
          <Route path="body" element={<Body />} />
          <Route path="progress" element={<Progress />} />
          <Route path="reports" element={<Reports />} />
          <Route path="goals" element={<Goals />} />
          <Route path="profile" element={<Profile />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="coach" element={<Coach />} />
          <Route path="coach/clients/:id" element={<ClientDetail />} />
          <Route path="join" element={<Join />} />
          <Route path="admin" element={<AdminOnly><Admin /></AdminOnly>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
