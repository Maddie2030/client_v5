import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import Navbar from '@/components/Navbar';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import Catalog from '@/pages/Catalog';
import SeriesDetail from '@/pages/SeriesDetail';
import Reader from '@/pages/Reader';
import Dashboard from '@/pages/Dashboard';
import AdminDashboard from '@/pages/AdminDashboard';
import AdminUpload from '@/pages/AdminUpload';
import ScraperAdmin from '@/pages/ScraperAdmin';
import Profile from '@/pages/Profile';
import Notifications from '@/pages/Notifications';
import type { ReactNode } from 'react';

function ProtectedRoute({ children, adminOnly }: { children: ReactNode; adminOnly?: boolean }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" /></div>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-ink-950">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
      <footer className="border-t border-ink-800 py-6 text-center text-sm text-ink-500">
        Muller Reader — Open-source manga reader with built-in scraper
      </footer>
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/" element={<Layout><Catalog /></Layout>} />
      <Route path="/catalog" element={<Layout><Catalog /></Layout>} />
      <Route path="/series/:slug" element={<Layout><SeriesDetail /></Layout>} />
      <Route path="/series/:slug/chapter/:chapterSlug" element={<Layout><Reader /></Layout>} />
      <Route path="/dashboard" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><Layout><Profile /></Layout></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><Layout><Notifications /></Layout></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute adminOnly><Layout><AdminDashboard /></Layout></ProtectedRoute>} />
      <Route path="/admin/upload" element={<ProtectedRoute adminOnly><Layout><AdminUpload /></Layout></ProtectedRoute>} />
      <Route path="/admin/scraper" element={<ProtectedRoute adminOnly><Layout><ScraperAdmin /></Layout></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
