import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck, Loader2, BookOpen } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '@/lib/dataAccess';
import type { Notification } from '@/types';

export default function Notifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      setNotifications(await getNotifications(user.id));
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const handleMarkAll = async () => {
    if (!user) return;
    await markAllNotificationsRead(user.id);
    await load();
  };

  const handleMarkOne = async (id: string) => {
    await markNotificationRead(id);
    await load();
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>;

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="mx-auto max-w-2xl animate-fade-in">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink-100">
          <Bell className="h-6 w-6 text-brand-500" /> Notifications
        </h1>
        {unreadCount > 0 && (
          <button onClick={handleMarkAll} className="btn-secondary">
            <CheckCheck className="h-4 w-4" /> Mark all read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="py-20 text-center">
          <Bell className="mx-auto mb-4 h-12 w-12 text-ink-700" />
          <p className="text-lg text-ink-300">No notifications</p>
          <p className="mt-1 text-sm text-ink-500">Subscribe to series to get notified about new chapters</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`card flex items-start gap-3 p-4 transition-colors ${n.is_read ? 'opacity-60' : 'border-brand-600/30'}`}
            >
              <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${n.is_read ? 'bg-ink-800' : 'bg-brand-600/20'}`}>
                <BookOpen className={`h-5 w-5 ${n.is_read ? 'text-ink-500' : 'text-brand-400'}`} />
              </div>
              <div className="flex-1">
                <p className="text-sm text-ink-200">{n.message}</p>
                <p className="mt-1 text-xs text-ink-500">{new Date(n.created_at).toLocaleString()}</p>
              </div>
              {!n.is_read && (
                <button onClick={() => handleMarkOne(n.id)} className="text-xs text-brand-400 hover:text-brand-300">
                  Mark read
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
