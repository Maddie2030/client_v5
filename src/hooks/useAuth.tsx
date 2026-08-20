import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getDb, hashPassword, verifyPassword } from '@/lib/database';
import type { User } from '@/types';

const SESSION_KEY = 'muller-session';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signIn: (usernameOrEmail: string, password: string) => Promise<void>;
  signUp: (username: string, email: string, password: string) => Promise<void>;
  signOut: () => void;
  updateProfile: (data: { username?: string; email?: string }) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const stored = localStorage.getItem(SESSION_KEY);
        if (stored) {
          const userId = stored;
          const db = await getDb();
          const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
          if (result.rows.length > 0) {
            setUser(result.rows[0] as User);
          } else {
            localStorage.removeItem(SESSION_KEY);
          }
        }
      } catch {
        localStorage.removeItem(SESSION_KEY);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const signIn = async (usernameOrEmail: string, password: string) => {
    const db = await getDb();
    const result = await db.query(
      'SELECT * FROM users WHERE username = $1 OR email = $1',
      [usernameOrEmail.trim()],
    );
    if (result.rows.length === 0) throw new Error('Invalid credentials.');
    const dbUser = result.rows[0] as User & { password_hash: string; password_salt: string; is_active: boolean };
    if (!dbUser.is_active) throw new Error('Account is deactivated.');
    const valid = await verifyPassword(password, dbUser.password_salt, dbUser.password_hash);
    if (!valid) throw new Error('Invalid credentials.');
    localStorage.setItem(SESSION_KEY, dbUser.id);
    setUser(dbUser);
  };

  const signUp = async (username: string, email: string, password: string) => {
    if (!/^[a-zA-Z0-9_]{3,50}$/.test(username)) throw new Error('Username must be 3-50 chars, letters/digits/underscores only.');
    if (password.length < 8) throw new Error('Password must be at least 8 characters long.');

    const db = await getDb();
    const existing = await db.query('SELECT id FROM users WHERE username = $1 OR email = $2', [username, email.toLowerCase()]);
    if (existing.rows.length > 0) throw new Error('Username or email already registered.');

    const salt = crypto.randomUUID();
    const hash = await hashPassword(password, salt);
    const result = await db.query(
      `INSERT INTO users (id, username, email, password_hash, password_salt, role, is_active)
       VALUES ($1, $2, $3, $4, $5, 'user', true)
       RETURNING *`,
      [crypto.randomUUID(), username, email.toLowerCase(), hash, salt],
    );
    const newUser = result.rows[0] as User;
    localStorage.setItem(SESSION_KEY, newUser.id);
    setUser(newUser);
  };

  const signOut = () => {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
  };

  const updateProfile = async (data: { username?: string; email?: string }) => {
    if (!user) return;
    const db = await getDb();
    const updates: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (data.username) {
      if (!/^[a-zA-Z0-9_]{3,50}$/.test(data.username)) throw new Error('Username must be 3-50 chars, letters/digits/underscores only.');
      updates.push(`username = $${idx++}`);
      params.push(data.username);
    }
    if (data.email) {
      updates.push(`email = $${idx++}`);
      params.push(data.email.toLowerCase());
    }
    if (updates.length === 0) return;
    updates.push('updated_at = NOW()');
    params.push(user.id);
    const result = await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`, params);
    setUser(result.rows[0] as User);
  };

  const refreshUser = async () => {
    if (!user) return;
    const db = await getDb();
    const result = await db.query('SELECT * FROM users WHERE id = $1', [user.id]);
    if (result.rows.length > 0) setUser(result.rows[0] as User);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, updateProfile, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
