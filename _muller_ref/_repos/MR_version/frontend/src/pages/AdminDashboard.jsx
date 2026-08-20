import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Upload, Trash2, ImagePlus, BookOpen, Users, Bell, Layers, Loader2 } from "lucide-react";
import { api } from "../api/client";

export default function AdminDashboard() {
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [uploadingThumbnailId, setUploadingThumbnailId] = useState(null);
  const [error, setError] = useState("");
  const [stats, setStats] = useState({ total_series: 0, total_chapters: 0, total_users: 0, total_subscriptions: 0 });

  const fetch = async () => {
    setLoading(true);
    try {
      const data = await api.listSeries("?limit=50");
      setSeries(data);
    } catch {
      setSeries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, []);

  const changeThumbnail = async (seriesItem, file) => {
    if (!file) return;
    setError("");
    setUploadingThumbnailId(seriesItem.id);
    const previousThumbnail = seriesItem.cover_image_path;
    try {
      const result = await api.uploadSeriesThumbnail(seriesItem.slug, file);
      try {
        await api.updateSeries(seriesItem.id, { cover_image_path: result.image_path });
      } catch (err) {
        const newName = result.image_path.split("/").pop();
        if (newName) {
          await api.deleteSeriesThumbnail(seriesItem.slug, newName).catch(() => {});
        }
        throw err;
      }
      if (previousThumbnail) {
        const previousName = previousThumbnail.split("/").pop();
        if (previousName) {
          await api.deleteSeriesThumbnail(seriesItem.slug, previousName).catch(() => {});
        }
      }
      await fetch();
    } catch (err) {
      setError(err?.detail || "Failed to update the series thumbnail.");
    } finally {
      setUploadingThumbnailId(null);
    }
  };

  const statCards = [
    { label: "Series", value: stats.total_series, icon: <BookOpen size={20} /> },
    { label: "Chapters", value: stats.total_chapters, icon: <Layers size={20} /> },
    { label: "Users", value: stats.total_users, icon: <Users size={20} /> },
    { label: "Subscriptions", value: stats.total_subscriptions, icon: <Bell size={20} /> },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-ink-50">Admin Dashboard</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg text-sm transition-colors">
            <Plus size={16} /> New Series
          </button>
          <Link to="/admin/upload" className="flex items-center gap-1.5 bg-ink-800 hover:bg-ink-700 text-ink-200 px-4 py-2 rounded-lg text-sm transition-colors">
            <Upload size={16} /> Upload
          </Link>
        </div>
      </div>

      {error && <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-2 mb-4 text-sm">{error}</div>}
      {showCreate && <CreateSeriesForm onDone={fetch} onCancel={() => setShowCreate(false)} />}

      {loading ? (
        <div className="skeleton rounded-xl h-64" />
      ) : series.length === 0 ? (
        <p className="text-ink-400 text-center py-12">No series yet. Create one to get started.</p>
      ) : (
        <div className="bg-ink-900 border border-ink-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-ink-800 text-ink-400 text-sm">
                <th className="text-left px-4 py-3">Title</th>
                <th className="text-left px-4 py-3 hidden sm:table-cell">Status</th>
                <th className="text-left px-4 py-3 hidden sm:table-cell">Updated</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {series.map((s) => (
                <tr key={s.id} className="border-b border-ink-800/50 hover:bg-ink-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-12 rounded overflow-hidden bg-ink-800 flex-shrink-0">
                        {s.cover_image_path ? (
                          <img src={`/images/${s.cover_image_path}`} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-ink-500 font-semibold">{s.title[0]}</div>
                        )}
                      </div>
                      <Link to={`/series/${s.slug}`} className="text-ink-200 hover:text-brand-400 transition-colors">{s.title}</Link>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className={`text-xs px-2 py-0.5 rounded ${s.status === "ongoing" ? "bg-green-600" : s.status === "completed" ? "bg-blue-600" : "bg-yellow-600"} text-white`}>{s.status}</span>
                  </td>
                  <td className="px-4 py-3 text-ink-500 text-sm hidden sm:table-cell">{new Date(s.updated_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <label
                      className="inline-flex items-center text-ink-500 hover:text-brand-400 transition-colors p-1 cursor-pointer"
                      title="Change thumbnail"
                    >
                      {uploadingThumbnailId === s.id ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif,image/bmp,image/tiff"
                        className="hidden"
                        disabled={uploadingThumbnailId === s.id}
                        onChange={(event) => {
                          changeThumbnail(s, event.target.files?.[0]);
                          event.target.value = "";
                        }}
                      />
                    </label>
                    <button onClick={() => { if (confirm(`Delete "${s.title}"?`)) { api.deleteSeries(s.id).then(fetch); } }} className="text-ink-500 hover:text-red-400 transition-colors p-1">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CreateSeriesForm({ onDone, onCancel }) {
  const [form, setForm] = useState({ title: "", slug: "", description: "", status: "ongoing" });
  const [thumbnail, setThumbnail] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const created = await api.createSeries(form);
      if (thumbnail) {
        const result = await api.uploadSeriesThumbnail(created.slug, thumbnail);
        try {
          await api.updateSeries(created.id, { cover_image_path: result.image_path });
        } catch (err) {
          const newName = result.image_path.split("/").pop();
          if (newName) {
            await api.deleteSeriesThumbnail(created.slug, newName).catch(() => {});
          }
          throw err;
        }
      }
      onDone();
      onCancel();
    } catch (err) {
      setError(err?.detail || "Failed to create series");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-ink-900 border border-ink-800 rounded-xl p-6 mb-6 space-y-4">
      <h2 className="text-lg font-semibold text-ink-100">Create New Series</h2>
      {error && <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-3 py-2 text-sm">{error}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required className="bg-ink-800 border border-ink-700 rounded-lg px-4 py-2.5 text-ink-100 focus:outline-none focus:border-brand-500" />
        <input placeholder="slug-kebab-case" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} required pattern="[a-z0-9-]+" className="bg-ink-800 border border-ink-700 rounded-lg px-4 py-2.5 text-ink-100 focus:outline-none focus:border-brand-500" />
      </div>
      <textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="w-full bg-ink-800 border border-ink-700 rounded-lg px-4 py-2.5 text-ink-100 focus:outline-none focus:border-brand-500" />
      <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="bg-ink-800 border border-ink-700 rounded-lg px-4 py-2.5 text-ink-100 focus:outline-none focus:border-brand-500">
        <option value="ongoing">Ongoing</option>
        <option value="completed">Completed</option>
        <option value="hiatus">Hiatus</option>
      </select>
      <div>
        <label className="block text-sm text-ink-300 mb-1">Series thumbnail (optional)</label>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/bmp,image/tiff"
          onChange={(e) => setThumbnail(e.target.files?.[0] || null)}
          className="w-full text-sm text-ink-400 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-ink-700 file:text-ink-100 file:cursor-pointer"
        />
        {thumbnail && <p className="text-xs text-ink-500 mt-1">{thumbnail.name}</p>}
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm transition-colors">{saving ? "Creating..." : "Create"}</button>
        <button type="button" onClick={onCancel} disabled={saving} className="bg-ink-800 hover:bg-ink-700 disabled:opacity-50 text-ink-300 px-4 py-2 rounded-lg text-sm transition-colors">Cancel</button>
      </div>
    </form>
  );
}
