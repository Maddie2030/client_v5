import { useState } from "react";
import { useAuth } from "../hooks/useAuth.jsx";

export default function Profile() {
  const { user, refresh } = useAuth();
  const [form, setForm] = useState({ username: user?.username || "", email: user?.email || "" });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess(false);
    setLoading(true);
    try {
      const { api } = await import("../api/client");
      await api.updateProfile(form);
      await refresh();
      setSuccess(true);
    } catch (err) {
      setError(err?.detail || "Update failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="bg-ink-900 border border-ink-800 rounded-2xl p-8 animate-fade-in">
        <h1 className="text-2xl font-bold text-ink-50 mb-6">Profile</h1>
        {error && <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-2 mb-4 text-sm">{error}</div>}
        {success && <div className="bg-green-900/30 border border-green-700 text-green-300 rounded-lg px-4 py-2 mb-4 text-sm">Profile updated.</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-ink-300 mb-1">Username</label>
            <input type="text" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required
              className="w-full bg-ink-800 border border-ink-700 rounded-lg px-4 py-2.5 text-ink-100 focus:outline-none focus:border-brand-500" />
          </div>
          <div>
            <label className="block text-sm text-ink-300 mb-1">Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required
              className="w-full bg-ink-800 border border-ink-700 rounded-lg px-4 py-2.5 text-ink-100 focus:outline-none focus:border-brand-500" />
          </div>
          <div className="text-sm text-ink-500">
            Role: <span className="text-ink-300 capitalize">{user?.role}</span>
          </div>
          <button type="submit" disabled={loading} className="w-full bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors">
            {loading ? "Saving..." : "Save changes"}
          </button>
        </form>
      </div>
    </div>
  );
}
