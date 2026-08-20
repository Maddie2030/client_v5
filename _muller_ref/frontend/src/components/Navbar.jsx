import { Link, useNavigate } from "react-router-dom";
import { BookOpen, Bell, Bookmark, Home, LogOut, User, Shield, Upload, Menu, Globe } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../hooks/useAuth.jsx";
import { useNotifications } from "../hooks/useNotifications.js";

export default function Navbar() {
  const { user, logout } = useAuth();
  const { unreadCount } = useNotifications();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <nav className="sticky top-0 z-50 bg-ink-900/95 backdrop-blur border-b border-ink-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          <Link to="/" className="flex items-center gap-2 text-brand-400 font-bold text-lg">
            <BookOpen size={22} />
            <span className="hidden sm:inline">ManhwaReader</span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            <NavLink to="/" icon={<Home size={18} />} label="Browse" />
            {user && <NavLink to="/dashboard" icon={<Bookmark size={18} />} label="Dashboard" />}
            {user && (
              <NavLink to="/notifications" icon={<Bell size={18} />} label="Notifications" badge={unreadCount} />
            )}
            {user?.role === "admin" && <NavLink to="/admin" icon={<Shield size={18} />} label="Admin" />}
            {user?.role === "admin" && <NavLink to="/admin/upload" icon={<Upload size={18} />} label="Upload" />}
            {user?.role === "admin" && <NavLink to="/admin/scraper" icon={<Globe size={18} />} label="Scraper" />}
          </div>

          <div className="flex items-center gap-2">
            {user ? (
              <div className="flex items-center gap-2">
                <Link to="/profile" className="flex items-center gap-1.5 text-sm text-ink-300 hover:text-ink-100 transition-colors">
                  <User size={16} />
                  <span className="hidden sm:inline">{user.username}</span>
                </Link>
                <button onClick={handleLogout} className="p-2 text-ink-400 hover:text-red-400 transition-colors" title="Logout">
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link to="/login" className="text-sm text-ink-300 hover:text-ink-100 transition-colors px-3 py-1.5">
                  Login
                </Link>
                <Link to="/register" className="text-sm bg-brand-600 hover:bg-brand-500 text-white px-4 py-1.5 rounded-lg transition-colors">
                  Sign up
                </Link>
              </div>
            )}
            <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden p-2 text-ink-400">
              <Menu size={20} />
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="md:hidden flex flex-col gap-1 py-2 border-t border-ink-800">
            <MobileLink to="/" icon={<Home size={18} />} label="Browse" onClick={() => setMenuOpen(false)} />
            {user && <MobileLink to="/dashboard" icon={<Bookmark size={18} />} label="Dashboard" onClick={() => setMenuOpen(false)} />}
            {user && <MobileLink to="/notifications" icon={<Bell size={18} />} label={`Notifications${unreadCount ? ` (${unreadCount})` : ""}`} onClick={() => setMenuOpen(false)} />}
            {user?.role === "admin" && <MobileLink to="/admin" icon={<Shield size={18} />} label="Admin" onClick={() => setMenuOpen(false)} />}
            {user?.role === "admin" && <MobileLink to="/admin/upload" icon={<Upload size={18} />} label="Upload" onClick={() => setMenuOpen(false)} />}
            {user?.role === "admin" && <MobileLink to="/admin/scraper" icon={<Globe size={18} />} label="Scraper" onClick={() => setMenuOpen(false)} />}
          </div>
        )}
      </div>
    </nav>
  );
}

function NavLink({ to, icon, label, badge }) {
  return (
    <Link to={to} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-ink-300 hover:text-ink-100 hover:bg-ink-800 transition-colors text-sm relative">
      {icon}
      <span>{label}</span>
      {badge > 0 && (
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-semibold">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}

function MobileLink({ to, icon, label, onClick }) {
  return (
    <Link to={to} onClick={onClick} className="flex items-center gap-2 px-3 py-2 rounded-lg text-ink-300 hover:bg-ink-800 transition-colors">
      {icon}
      <span>{label}</span>
    </Link>
  );
}
