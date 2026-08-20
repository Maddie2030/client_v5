import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, Check, CheckCheck } from "lucide-react";
import { api } from "../api/client";
import { useNotifications } from "../hooks/useNotifications.js";

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { refresh: refreshCount } = useNotifications();

  const fetchNotifications = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.listNotifications();
      setNotifications(data);
    } catch (err) {
      setNotifications([]);
      setError(err?.detail || "We couldn't load your notifications. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchNotifications(); }, []);

  const markRead = async (id) => {
    await api.markRead(id);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
    refreshCount();
  };

  const markAllRead = async () => {
    await api.markAllRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    refreshCount();
  };

  if (loading) {
    return <div className="max-w-2xl mx-auto px-4 py-8"><div className="skeleton rounded-xl h-64" /></div>;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-ink-50 flex items-center gap-2">
          <Bell size={22} /> Notifications
        </h1>
        {notifications.some((n) => !n.is_read) && (
          <button onClick={markAllRead} className="flex items-center gap-1 text-sm text-brand-400 hover:text-brand-300 transition-colors">
            <CheckCheck size={16} /> Mark all read
          </button>
        )}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-800 bg-red-900/20 px-4 py-6 text-center">
          <p className="text-red-300">{error}</p>
          <button
            type="button"
            onClick={fetchNotifications}
            className="mt-3 text-sm text-brand-400 hover:text-brand-300 transition-colors"
          >
            Try again
          </button>
        </div>
      ) : notifications.length === 0 ? (
        <p className="text-ink-400 text-center py-12">No new notifications.</p>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`flex items-start gap-3 rounded-lg border px-4 py-3 transition-colors ${n.is_read ? "bg-ink-900 border-ink-800" : "bg-brand-900/20 border-brand-700/50"}`}
            >
              <div className="flex-1">
                <p className="text-sm text-ink-200">{n.message}</p>
                <Link to={`/read/${n.series_slug}/${n.chapter_slug}`} className="text-xs text-brand-400 hover:text-brand-300 mt-1 inline-block">
                  {n.series_title} — Ch. {n.chapter_number}
                </Link>
                <p className="text-xs text-ink-500 mt-1">{new Date(n.created_at).toLocaleString()}</p>
              </div>
              {!n.is_read && (
                <button onClick={() => markRead(n.id)} className="text-ink-400 hover:text-ink-100 transition-colors p-1" title="Mark read">
                  <Check size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
