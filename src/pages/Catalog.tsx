import { useState, useEffect, useCallback } from 'react';
import { Search, Filter, Loader2, BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import { listSeries, listGenres } from '@/lib/dataAccess';
import CoverImage from '@/components/CoverImage';
import type { SeriesWithGenres, Genre } from '@/types';

const STATUS_LABELS: Record<string, string> = { ongoing: 'Ongoing', completed: 'Completed', hiatus: 'Hiatus' };
const STATUS_COLORS: Record<string, string> = {
  ongoing: 'bg-success-600/20 text-success-400',
  completed: 'bg-brand-600/20 text-brand-400',
  hiatus: 'bg-warning-600/20 text-warning-400',
};

export default function Catalog() {
  const [series, setSeries] = useState<SeriesWithGenres[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [genreFilter, setGenreFilter] = useState<number | undefined>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, g] = await Promise.all([
        listSeries({ search: search || undefined, status: statusFilter || undefined, genre: genreFilter }),
        listGenres(),
      ]);
      setSeries(data);
      setGenres(g);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [search, statusFilter, genreFilter]);

  useEffect(() => {
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink-100">Manga Catalog</h1>
          <p className="mt-1 text-sm text-ink-400">Browse and read your favorite manga series</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search titles..."
              className="input-field w-48 pl-10 sm:w-64"
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-field w-auto">
            <option value="">All Status</option>
            <option value="ongoing">Ongoing</option>
            <option value="completed">Completed</option>
            <option value="hiatus">Hiatus</option>
          </select>
          <select value={genreFilter ?? ''} onChange={(e) => setGenreFilter(e.target.value ? Number(e.target.value) : undefined)} className="input-field w-auto">
            <option value="">All Genres</option>
            {genres.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>
      ) : series.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BookOpen className="mb-4 h-12 w-12 text-ink-700" />
          <p className="text-lg font-medium text-ink-300">No series found</p>
          <p className="mt-1 text-sm text-ink-500">Try adjusting your filters or search terms</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {series.map((s) => (
            <Link key={s.id} to={`/series/${s.slug}`} className="group card overflow-hidden transition-all duration-200 hover:scale-[1.03] hover:border-brand-600/50 hover:shadow-brand-600/10">
              <div className="relative aspect-[3/4] overflow-hidden">
                <CoverImage path={s.cover_image_path} alt={s.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                <span className={`absolute right-2 top-2 badge ${STATUS_COLORS[s.status]}`}>{STATUS_LABELS[s.status]}</span>
              </div>
              <div className="p-3">
                <h3 className="line-clamp-2 text-sm font-semibold text-ink-100 group-hover:text-brand-400">{s.title}</h3>
                <p className="mt-1 text-xs text-ink-500">{s.chapter_count} {s.chapter_count === 1 ? 'chapter' : 'chapters'}</p>
                {s.genres.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {s.genres.slice(0, 2).map((g) => (
                      <span key={g.id} className="badge bg-ink-800 text-ink-400">{g.name}</span>
                    ))}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
