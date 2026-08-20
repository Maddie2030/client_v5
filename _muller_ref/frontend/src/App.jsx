import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth.jsx";
import Navbar from "./components/Navbar.jsx";
import Catalog from "./pages/Catalog.jsx";
import SeriesDetail from "./pages/SeriesDetail.jsx";
import Reader from "./pages/Reader.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Notifications from "./pages/Notifications.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import AdminUpload from "./pages/AdminUpload.jsx";
import ScraperDashboard from "./pages/ScraperDashboard.jsx";
import Profile from "./pages/Profile.jsx";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-ink-400">Loading...</p></div>;
  if (!user) return <Navigate to="/login" />;
  return children;
}

function AdminOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><p className="text-ink-400">Loading...</p></div>;
  if (!user || user.role !== "admin") return <Navigate to="/" />;
  return children;
}

export default function App() {
  return (
    <div className="min-h-screen bg-ink-950 text-ink-100">
      <Navbar />
      <Routes>
        <Route path="/" element={<Catalog />} />
        <Route path="/series/:slug" element={<SeriesDetail />} />
        <Route path="/read/:seriesSlug/:chapterSlug" element={<Reader />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/profile" element={<Protected><Profile /></Protected>} />
        <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
        <Route path="/notifications" element={<Protected><Notifications /></Protected>} />
        <Route path="/admin" element={<AdminOnly><AdminDashboard /></AdminOnly>} />
        <Route path="/admin/upload" element={<AdminOnly><AdminUpload /></AdminOnly>} />
        <Route path="/admin/scraper" element={<AdminOnly><ScraperDashboard /></AdminOnly>} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  );
}
