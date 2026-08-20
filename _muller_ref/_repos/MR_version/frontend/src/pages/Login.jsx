import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.jsx";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username_or_email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login({ ...form, turnstile_token: "" });
      navigate("/");
    } catch (err) {
      setError(err?.detail || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="bg-ink-900 border border-ink-800 rounded-2xl p-8 animate-fade-in">
        <h1 className="text-2xl font-bold text-ink-50 mb-6 text-center">Welcome back</h1>
        {error && <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-2 mb-4 text-sm">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-ink-300 mb-1">Username or email</label>
            <input
              type="text"
              value={form.username_or_email}
              onChange={(e) => setForm({ ...form, username_or_email: e.target.value })}
              required
              className="w-full bg-ink-800 border border-ink-700 rounded-lg px-4 py-2.5 text-ink-100 focus:outline-none focus:border-brand-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm text-ink-300 mb-1">Password</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              className="w-full bg-ink-800 border border-ink-700 rounded-lg px-4 py-2.5 text-ink-100 focus:outline-none focus:border-brand-500 transition-colors"
            />
          </div>
          <button type="submit" disabled={loading} className="w-full bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors">
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <p className="text-center text-ink-400 text-sm mt-6">
          No account? <Link to="/register" className="text-brand-400 hover:text-brand-300">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
