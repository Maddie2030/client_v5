import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, FileText, Users, Search, Loader2, Plus, Upload, Trash2, Edit3, X, Check } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getAdminStats, listSeries, createSeries, updateSeries, deleteSeries, listGenres, listChapters, publishChapter, deleteChapter, listUsers } from '@/lib/dataAccess';
import CoverImage from '@/components/CoverImage';
import type { SeriesWithGenres, SeriesStatus, Genre, Chapter, User } from '@/types';

export default function AdminDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ seriesCount: 0, chapterCount: 0, userCount: 0, scrapeCount: 0, draftCount: 0, publishedCount: 0 });
  const [seriesList, setSeriesList] = useState<SeriesWithGenres[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'series' | 'chapters' | 'users'>('overview');
  const [editingSeries, setEditingSeries] = useState<SeriesWithGenres | null>(null);
  const [showSeriesForm, setShowSeriesForm] = useState(false);
  const [selectedSeriesChapters, setSelectedSeriesChapters] = useState<{ series: SeriesWithGenres; chapters: Chapter[] } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, sl, g, u] = await Promise.all([getAdminStats(), listSeries({ limit: 100 }), listGenres(), listUsers()]);
      setStats(s);
      setSeriesList(sl);
      setGenres(g);
      setUsers(u);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSaveSeries = async (data: { title: string; slug: string; description?: string; status: string; genre_ids: number[] }) => {
    if (editingSeries) {
      await updateSeries(editingSeries.id, data);
    } else {
      await createSeries(data);
    }
    setShowSeriesForm(false);
    setEditingSeries(null);
    await load();
  };

  const handleDeleteSeries = async (id: string) => {
    if (!confirm('Delete this series and all its chapters? This cannot be undone.')) return;
    await deleteSeries(id);
    await load();
  };

  const handleViewChapters = async (s: SeriesWithGenres) => {
    const chs = await listChapters(s.id, false);
    setSelectedSeriesChapters({ series: s, chapters: chs });
  };

  const handlePublishChapter = async (id: string) => {
    await publishChapter(id);
    if (selectedSeriesChapters) {
      const chs = await listChapters(selectedSeriesChapters.series.id, false);
      setSelectedSeriesChapters({ ...selectedSeriesChapters, chapters: chs });
    }
    await load();
  };

  const handleDeleteChapter = async (id: string) => {
    if (!confirm('Delete this chapter?')) return;
    await deleteChapter(id);
    if (selectedSeriesChapters) {
      const chs = await listChapters(selectedSeriesChapters.series.id, false);
      setSelectedSeriesChapters({ ...selectedSeriesChapters, chapters: chs });
    }
    await load();
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>;

  const statCards = [
    { label: 'Series', value: stats.seriesCount, icon: BookOpen, color: 'text-brand-400' },
    { label: 'Chapters', value: stats.chapterCount, icon: FileText, color: 'text-success-400' },
    { label: 'Users', value: stats.userCount, icon: Users, color: 'text-warning-400' },
    { label: 'Scrape Records', value: stats.scrapeCount, icon: Search, color: 'text-accent-400' },
  ];

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink-100">Admin Dashboard</h1>
        <div className="flex gap-2">
          <Link to="/admin/upload" className="btn-secondary"><Upload className="h-4 w-4" /> Upload</Link>
          <Link to="/admin/scraper" className="btn-secondary"><Search className="h-4 w-4" /> Scraper</Link>
        </div>
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto">
        {(['overview', 'series', 'chapters', 'users'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={tab === t ? 'btn-primary whitespace-nowrap' : 'btn-secondary whitespace-nowrap'}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {statCards.map((s) => (
            <div key={s.label} className="card p-5">
              <s.icon className={`mb-3 h-8 w-8 ${s.color}`} />
              <p className="text-3xl font-bold text-ink-100">{s.value}</p>
              <p className="mt-1 text-sm text-ink-400">{s.label}</p>
            </div>
          ))}
          <div className="card col-span-2 p-5 md:col-span-4">
            <h3 className="mb-3 font-semibold text-ink-100">Chapter Status</h3>
            <div className="flex gap-6">
              <div><span className="text-2xl font-bold text-warning-400">{stats.draftCount}</span> <span className="text-sm text-ink-400">Drafts</span></div>
              <div><span className="text-2xl font-bold text-success-400">{stats.publishedCount}</span> <span className="text-sm text-ink-400">Published</span></div>
            </div>
          </div>
        </div>
      )}

      {tab === 'series' && (
        <div>
          <div className="mb-4 flex justify-end">
            <button onClick={() => { setEditingSeries(null); setShowSeriesForm(true); }} className="btn-primary">
              <Plus className="h-4 w-4" /> New Series
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {seriesList.map((s) => (
              <div key={s.id} className="card flex items-center gap-4 p-4">
                <div className="h-16 w-12 flex-shrink-0 overflow-hidden rounded-lg">
                  <CoverImage path={s.cover_image_path} alt={s.title} className="h-full w-full object-cover" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-ink-100">{s.title}</p>
                  <p className="text-xs text-ink-500">{s.chapter_count} chapters • {s.status}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => handleViewChapters(s)} className="btn-ghost" title="View chapters"><FileText className="h-4 w-4" /></button>
                  <button onClick={() => { setEditingSeries(s); setShowSeriesForm(true); }} className="btn-ghost" title="Edit"><Edit3 className="h-4 w-4" /></button>
                  <button onClick={() => handleDeleteSeries(s.id)} className="btn-ghost text-accent-400" title="Delete"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'chapters' && (
        <div>
          {selectedSeriesChapters ? (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">{selectedSeriesChapters.series.title} — Chapters</h2>
                <button onClick={() => setSelectedSeriesChapters(null)} className="btn-ghost"><X className="h-4 w-4" /> Close</button>
              </div>
              {selectedSeriesChapters.chapters.length === 0 ? (
                <p className="py-8 text-center text-sm text-ink-500">No chapters. Use the Upload page to add some.</p>
              ) : (
                <div className="space-y-2">
                  {selectedSeriesChapters.chapters.map((ch) => (
                    <div key={ch.id} className="card flex items-center justify-between p-4">
                      <div>
                        <p className="font-medium text-ink-100">Chapter {ch.chapter_number}{ch.title ? ` - ${ch.title}` : ''}</p>
                        <p className="text-xs text-ink-500">{ch.page_count} pages • {ch.status}</p>
                      </div>
                      <div className="flex gap-2">
                        {ch.status !== 'published' && (
                          <button onClick={() => handlePublishChapter(ch.id)} className="btn-success text-xs"><Check className="h-3 w-3" /> Publish</button>
                        )}
                        <button onClick={() => handleDeleteChapter(ch.id)} className="btn-ghost text-accent-400"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              <p className="mb-4 text-sm text-ink-400">Select a series to manage its chapters:</p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {seriesList.map((s) => (
                  <button key={s.id} onClick={() => handleViewChapters(s)} className="card flex items-center gap-4 p-4 text-left transition-colors hover:border-brand-600/50">
                    <div className="h-16 w-12 flex-shrink-0 overflow-hidden rounded-lg">
                      <CoverImage path={s.cover_image_path} alt={s.title} className="h-full w-full object-cover" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-ink-100">{s.title}</p>
                      <p className="text-xs text-ink-500">{s.chapter_count} chapters</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'users' && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-ink-800 bg-ink-800/50">
              <tr><th className="px-4 py-3 text-left text-ink-300">Username</th><th className="px-4 py-3 text-left text-ink-300">Email</th><th className="px-4 py-3 text-left text-ink-300">Role</th><th className="px-4 py-3 text-left text-ink-300">Joined</th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-ink-800 last:border-0">
                  <td className="px-4 py-3 text-ink-100">{u.username}{u.id === user?.id && <span className="ml-2 text-xs text-brand-400">(you)</span>}</td>
                  <td className="px-4 py-3 text-ink-400">{u.email}</td>
                  <td className="px-4 py-3"><span className={`badge ${u.role === 'admin' ? 'bg-brand-600/20 text-brand-400' : 'bg-ink-800 text-ink-400'}`}>{u.role}</span></td>
                  <td className="px-4 py-3 text-ink-500">{new Date(u.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showSeriesForm && (
        <SeriesForm
          series={editingSeries}
          genres={genres}
          onSave={handleSaveSeries}
          onCancel={() => { setShowSeriesForm(false); setEditingSeries(null); }}
        />
      )}
    </div>
  );
}

function SeriesForm({ series, genres, onSave, onCancel }: {
  series: SeriesWithGenres | null;
  genres: Genre[];
  onSave: (data: { title: string; slug: string; description?: string; status: string; genre_ids: number[] }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(series?.title ?? '');
  const [slug, setSlug] = useState(series?.slug ?? '');
  const [description, setDescription] = useState(series?.description ?? '');
  const [status, setStatus] = useState(series?.status ?? 'ongoing');
  const [selectedGenres, setSelectedGenres] = useState<number[]>(series?.genres.map((g) => g.id) ?? []);

  const toggleGenre = (id: number) => {
    setSelectedGenres((prev) => prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div className="card w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold">{series ? 'Edit Series' : 'New Series'}</h2>
        <form onSubmit={(e) => { e.preventDefault(); onSave({ title, slug: slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''), description: description || undefined, status, genre_ids: selectedGenres }); }} className="space-y-4">
          <div><label className="label">Title</label><input value={title} onChange={(e) => setTitle(e.target.value)} className="input-field" required /></div>
          <div><label className="label">Slug</label><input value={slug} onChange={(e) => setSlug(e.target.value)} className="input-field" placeholder="auto-generated from title" /></div>
          <div><label className="label">Description</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="input-field" /></div>
          <div><label className="label">Status</label><select value={status} onChange={(e) => setStatus(e.target.value as SeriesStatus)} className="input-field"><option value="ongoing">Ongoing</option><option value="completed">Completed</option><option value="hiatus">Hiatus</option></select></div>
          <div><label className="label">Genres</label><div className="flex flex-wrap gap-2">{genres.map((g) => <button type="button" key={g.id} onClick={() => toggleGenre(g.id)} className={`badge cursor-pointer ${selectedGenres.includes(g.id) ? 'bg-brand-600/30 text-brand-400' : 'bg-ink-800 text-ink-400'}`}>{g.name}</button>)}</div></div>
          <div className="flex gap-2 pt-2"><button type="submit" className="btn-primary">{series ? 'Update' : 'Create'}</button><button type="button" onClick={onCancel} className="btn-secondary">Cancel</button></div>
        </form>
      </div>
    </div>
  );
}
