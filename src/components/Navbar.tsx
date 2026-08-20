import { Link, NavLink, useNavigate } from 'react-router-dom';
import { BookOpen, Home, Compass, Bell, User, LogOut, Shield, Upload, Search as SearchIcon, Bookmark } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useEffect, useState } from 'react';
import { getUnreadNotificationCount } from '@/lib/dataAccess';

export default function Navbar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const load = async () => {
      try {
        const count = await getUnreadNotificationCount(user.id);
        if (active) setUnread(count);
      } catch { /* ignore */ }
    };
    load();
    const interval = setInterval(load, 30000);
    return () => { active = false; clearInterval(interval); };
  }, [user]);

  const handleSignOut = () => {
    signOut();
    navigate('/');
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive ? 'bg-brand-600/15 text-brand-400' : 'text-ink-400 hover:text-ink-100 hover:bg-ink-800'
    }`;

  return (
    <header className="sticky top-0 z-50 border-b border-ink-800 bg-ink-950/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 text-lg font-bold">
          <BookOpen className="h-6 w-6 text-brand-500" />
          <span className="text-ink-100">Muller</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          <NavLink to="/" end className={linkClass}>
            <Home className="h-4 w-4" /> Home
          </NavLink>
          <NavLink to="/catalog" className={linkClass}>
            <Compass className="h-4 w-4" /> Catalog
          </NavLink>
          {user && (
            <NavLink to="/dashboard" className={linkClass}>
              <Bookmark className="h-4 w-4" /> My Library
            </NavLink>
          )}
          {user?.role === 'admin' && (
            <>
              <NavLink to="/admin" className={linkClass}>
                <Shield className="h-4 w-4" /> Admin
              </NavLink>
              <NavLink to="/admin/upload" className={linkClass}>
                <Upload className="h-4 w-4" /> Upload
              </NavLink>
              <NavLink to="/admin/scraper" className={linkClass}>
                <SearchIcon className="h-4 w-4" /> Scraper
              </NavLink>
            </>
          )}
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <Link to="/notifications" className="relative rounded-lg p-2 text-ink-400 hover:bg-ink-800 hover:text-ink-100" title="Notifications">
                <Bell className="h-5 w-5" />
                {unread > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-600 px-1 text-xs font-bold text-white">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </Link>
              <Link to="/profile" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-300 hover:bg-ink-800 hover:text-ink-100">
                <User className="h-4 w-4" />
                <span className="hidden sm:inline">{user.username}</span>
                {user.role === 'admin' && <span className="badge bg-brand-600/20 text-brand-400">admin</span>}
              </Link>
              <button onClick={handleSignOut} className="rounded-lg p-2 text-ink-400 hover:bg-ink-800 hover:text-accent-400" title="Sign out">
                <LogOut className="h-5 w-5" />
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn-ghost">Sign in</Link>
              <Link to="/register" className="btn-primary">Sign up</Link>
            </>
          )}
          <button onClick={() => setMenuOpen(!menuOpen)} className="rounded-lg p-2 text-ink-400 hover:bg-ink-800 md:hidden">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="flex flex-col gap-1 border-t border-ink-800 bg-ink-950 px-4 py-3 md:hidden">
          <NavLink to="/" end className={linkClass} onClick={() => setMenuOpen(false)}><Home className="h-4 w-4" /> Home</NavLink>
          <NavLink to="/catalog" className={linkClass} onClick={() => setMenuOpen(false)}><Compass className="h-4 w-4" /> Catalog</NavLink>
          {user && <NavLink to="/dashboard" className={linkClass} onClick={() => setMenuOpen(false)}><Bookmark className="h-4 w-4" /> My Library</NavLink>}
          {user?.role === 'admin' && (
            <>
              <NavLink to="/admin" className={linkClass} onClick={() => setMenuOpen(false)}><Shield className="h-4 w-4" /> Admin</NavLink>
              <NavLink to="/admin/upload" className={linkClass} onClick={() => setMenuOpen(false)}><Upload className="h-4 w-4" /> Upload</NavLink>
              <NavLink to="/admin/scraper" className={linkClass} onClick={() => setMenuOpen(false)}><SearchIcon className="h-4 w-4" /> Scraper</NavLink>
            </>
          )}
        </nav>
      )}
    </header>
  );
}
