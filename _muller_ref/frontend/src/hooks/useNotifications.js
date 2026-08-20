import { useEffect, useState, useCallback } from "react";
import { api } from "../api/client";
import { useAuth } from "./useAuth";

export function useNotifications() {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    try {
      const data = await api.notificationCount();
      setUnreadCount(data.unread);
    } catch {
      setUnreadCount(0);
    }
  }, [user]);

  useEffect(() => {
    refresh();
    if (user) {
      const interval = setInterval(refresh, 30000);
      return () => clearInterval(interval);
    }
  }, [refresh, user]);

  return { unreadCount, refresh };
}
