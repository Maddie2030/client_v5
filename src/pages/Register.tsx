import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, Mail, Lock, User, AlertCircle, Loader2, Check } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export default function Register() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signUp(username, email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex items-center gap-2 text-2xl font-bold">
            <BookOpen className="h-8 w-8 text-brand-500" />
            <span>Muller</span>
          </Link>
          <p className="mt-2 text-sm text-ink-400">Create your manga reader account</p>
        </div>

        <div className="card p-8">
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-accent-600/10 px-4 py-3 text-sm text-accent-400">
              <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input-field pl-10"
                  placeholder="reader_42"
                  required
                  minLength={3}
                  autoFocus
                />
              </div>
              <p className="mt-1 text-xs text-ink-500">3-50 chars, letters/digits/underscores</p>
            </div>

            <div>
              <label className="label">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field pl-10"
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field pl-10"
                  placeholder="At least 8 characters"
                  required
                  minLength={8}
                />
              </div>
            </div>

            <div className="space-y-1.5 text-xs text-ink-500">
              <p className="flex items-center gap-1.5"><Check className="h-3 w-3 text-success-500" /> Minimum 8 characters</p>
              <p className="flex items-center gap-1.5"><Check className="h-3 w-3 text-success-500" /> Username and email must be unique</p>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating account...</> : <>Create account</>}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-ink-400">
            Already have an account? <Link to="/login" className="font-medium text-brand-400 hover:text-brand-300">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
