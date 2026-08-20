import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, History, Loader2, BookOpen, Calendar } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getBookmarks, getReadingHistory } from '@/lib/dataAccess';
import CoverImage from '@/components/CoverImage';
import type { Series } from '@/types';

type HistoryEntry = {
  id: string;
  series_title: string;
  series_slug: string;
  chapter_number: number;
  read_at: string;
};

export default function Dashboard() {
  const { user } = useAuth();
  const [bookmarks, setBookmarks] = useState<Array<{ id: string; series: Series }>>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'bookmarks' | 'history'>('bookmarks');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [bms, hist] = await Promise.all([getBookmarks(user.id), getReadingHistory(user.id)]);
      setBookmarks(bms);
      setHistory(hist);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>;

  return (
    <div className="animate-fade-in">
      <h1 className="mb-6 text-2xl font-bold text-ink-100">My Library</h1>

      <div className="mb-6 flex gap-2">
        <button onClick={() => setTab('bookmarks')} className={tab === 'bookmarks' ? 'btn-primary' : 'btn-secondary'}>
          <Bookmark className="h-4 w-4" /> Bookmarks ({bookmarks.length})
        </button>
        <button onClick={() => setTab('history')} className={tab === 'history' ? 'btn-primary' : 'btn-secondary'}>
          <History className="h-4 w-4" /> History ({history.length})
        </button>
      </div>

      {tab === 'bookmarks' ? (
        bookmarks.length === 0 ? (
          <div className="py-20 text-center">
            <Bookmark className="mx-auto mb-4 h-12 w-12 text-ink-700" />
            <p className="text-lg text-ink-300">No bookmarks yet</p>
            <Link to="/catalog" className="mt-4 inline-block text-brand-400">Browse catalog</Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {bookmarks.map((b) => (
              <Link key={b.id} to={`/series/${b.series.slug}`} className="group card overflow-hidden transition-all hover:scale-[1.03] hover:border-brand-600/50">
                <div className="relative aspect-[3/4] overflow-hidden">
                  <CoverImage path={b.series.cover_image_path} alt={b.series.title} className="h-full w-full object-cover" />
                </div>
                <div className="p-3">
                  <h3 className="line-clamp-2 text-sm font-semibold text-ink-100 group-hover:text-brand-400">{b.series.title}</h3>
                </div>
              </Link>
            ))}
          </div>
        )
      ) : (
        history.length === 0 ? (
          <div className="py-20 text-center">
            <History className="mx-auto mb-4 h-12 w-12 text-ink-700" />
            <p className="text-lg text-ink-300">No reading history yet</p>
            <Link to="/catalog" className="mt-4 inline-block text-brand-400">Start reading</Link>
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((h) => (
              <Link key={h.id} to={`/series/${h.series_slug}`} className="group flex items-center gap-4 rounded-lg border border-ink-800 bg-ink-900 p-4 transition-colors hover:border-brand-600/50 hover:bg-ink-800">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink-800 text-sm font-bold text-brand-400">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-ink-100 group-hover:text-brand-400">{h.series_title}</p>
                  <p className="flex items-center gap-1 text-xs text-ink-500">
                    <Calendar className="h-3 w-3" /> Chapter {h.chapter_number} • {new Date(h.read_at).toLocaleDateString()}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )
      )}
    </div>
  );
}

