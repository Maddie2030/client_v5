import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Bookmark, Bell, BookOpen, Loader2, Calendar, ChevronRight, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getSeriesBySlug, listChapters, toggleBookmark, isBookmarked, toggleSubscription, isSubscribed } from '@/lib/dataAccess';
import CoverImage from '@/components/CoverImage';
import CommentSection from '@/components/CommentSection';
import type { SeriesWithGenres, Chapter } from '@/types';

export default function SeriesDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const [series, setSeries] = useState<SeriesWithGenres | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookmarked, setBookmarked] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    try {
      const s = await getSeriesBySlug(slug);
      setSeries(s);
      if (s) {
        const ch = await listChapters(s.id, user?.role !== 'admin');
        setChapters(ch);
        if (user) {
          setBookmarked(await isBookmarked(user.id, s.id));
          setSubscribed(await isSubscribed(user.id, s.id));
        }
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [slug, user]);

  useEffect(() => { load(); }, [load]);

  const handleBookmark = async () => {
    if (!user || !series) return;
    setBookmarked(await toggleBookmark(user.id, series.id));
  };

  const handleSubscribe = async () => {
    if (!user || !series) return;
    setSubscribed(await toggleSubscription(user.id, series.id));
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>;
  if (!series) return (
    <div className="py-20 text-center">
      <BookOpen className="mx-auto mb-4 h-12 w-12 text-ink-700" />
      <p className="text-lg text-ink-300">Series not found</p>
      <Link to="/catalog" className="mt-4 inline-block text-brand-400 hover:text-brand-300">Back to catalog</Link>
    </div>
  );

  return (
    <div className="animate-fade-in">
      <Link to="/catalog" className="mb-4 flex items-center gap-1 text-sm text-ink-400 hover:text-ink-100">
        <ArrowLeft className="h-4 w-4" /> Back to catalog
      </Link>

      <div className="flex flex-col gap-6 md:flex-row">
        <div className="flex-shrink-0">
          <div className="relative aspect-[3/4] w-48 overflow-hidden rounded-xl border border-ink-800 shadow-xl sm:w-56">
            <CoverImage path={series.cover_image_path} alt={series.title} className="h-full w-full object-cover" />
          </div>
        </div>

        <div className="flex-1">
          <h1 className="text-3xl font-bold text-ink-100">{series.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`badge ${series.status === 'ongoing' ? 'bg-success-600/20 text-success-400' : series.status === 'completed' ? 'bg-brand-600/20 text-brand-400' : 'bg-warning-600/20 text-warning-400'}`}>
              {series.status.charAt(0).toUpperCase() + series.status.slice(1)}
            </span>
            <span className="text-sm text-ink-400">{series.chapter_count} chapters</span>
          </div>

          {series.genres.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {series.genres.map((g) => <span key={g.id} className="badge bg-ink-800 text-ink-300">{g.name}</span>)}
            </div>
          )}

          {series.description && (
            <p className="mt-4 max-w-2xl leading-relaxed text-ink-300">{series.description}</p>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            {chapters.length > 0 && (
              <Link to={`/series/${series.slug}/chapter/${chapters[0].slug}`} className="btn-primary">
                <BookOpen className="h-4 w-4" /> Start Reading
              </Link>
            )}
            {user && (
              <>
                <button onClick={handleBookmark} className={bookmarked ? 'btn-success' : 'btn-secondary'}>
                  <Bookmark className={`h-4 w-4 ${bookmarked ? 'fill-current' : ''}`} /> {bookmarked ? 'Bookmarked' : 'Bookmark'}
                </button>
                <button onClick={handleSubscribe} className={subscribed ? 'btn-success' : 'btn-secondary'}>
                  <Bell className={`h-4 w-4 ${subscribed ? 'fill-current' : ''}`} /> {subscribed ? 'Subscribed' : 'Subscribe'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="mb-4 text-xl font-semibold text-ink-100">Chapters</h2>
        {chapters.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-500">No chapters available yet.</p>
        ) : (
          <div className="space-y-2">
            {chapters.map((ch) => (
              <Link
                key={ch.id}
                to={`/series/${series.slug}/chapter/${ch.slug}`}
                className="group flex items-center justify-between rounded-lg border border-ink-800 bg-ink-900 p-4 transition-colors hover:border-brand-600/50 hover:bg-ink-800"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink-800 text-sm font-bold text-brand-400 group-hover:bg-brand-600/20">
                    {ch.chapter_number}
                  </div>
                  <div>
                    <p className="font-medium text-ink-100 group-hover:text-brand-400">{ch.title || `Chapter ${ch.chapter_number}`}</p>
                    <p className="flex items-center gap-1 text-xs text-ink-500">
                      <Calendar className="h-3 w-3" /> {new Date(ch.created_at).toLocaleDateString()} • {ch.page_count} pages
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-ink-600 group-hover:text-brand-400" />
              </Link>
            ))}
          </div>
        )}
      </div>

      <CommentSection seriesId={series.id} />
    </div>
  );
}
