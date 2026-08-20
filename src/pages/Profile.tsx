import { useState } from 'react';
import { User, Mail, Shield, Loader2, Save, AlertCircle, Check } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export default function Profile() {
  const { user, updateProfile } = useAuth();
  const [username, setUsername] = useState(user?.username ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);
    try {
      await updateProfile({ username: username !== user?.username ? username : undefined, email: email !== user?.email ? email : undefined });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed.');
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="mx-auto max-w-2xl animate-fade-in">
      <h1 className="mb-6 text-2xl font-bold text-ink-100">Profile Settings</h1>

      <div className="card mb-6 flex items-center gap-4 p-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-600/20 text-2xl font-bold text-brand-400">
          {user.username.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="text-lg font-semibold text-ink-100">{user.username}</p>
          <p className="text-sm text-ink-400">{user.email}</p>
          <div className="mt-1 flex items-center gap-2">
            <span className={`badge ${user.role === 'admin' ? 'bg-brand-600/20 text-brand-400' : 'bg-ink-800 text-ink-400'}`}>
              <Shield className="h-3 w-3" /> {user.role}
            </span>
            <span className="text-xs text-ink-500">Member since {new Date(user.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      <div className="card p-6">
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-accent-600/10 px-4 py-3 text-sm text-accent-400">
            <AlertCircle className="h-4 w-4" /> {error}
          </div>
        )}
        {success && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-success-600/10 px-4 py-3 text-sm text-success-400">
            <Check className="h-4 w-4" /> Profile updated successfully
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Username</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
              <input value={username} onChange={(e) => setUsername(e.target.value)} className="input-field pl-10" />
            </div>
          </div>
          <div>
            <label className="label">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-field pl-10" />
            </div>
          </div>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4" /> Save Changes</>}
          </button>
        </form>
      </div>
    </div>
  );
}
