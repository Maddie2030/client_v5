import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Loader2, List, ScrollText } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { getChapterWithPages, getPageImageURL, listChapters, saveReadingProgress, addReadingHistory, getReadingProgress } from '@/lib/dataAccess';
import CommentSection from '@/components/CommentSection';
import type { ChapterWithPages, Chapter } from '@/types';

export default function Reader() {
  const { slug, chapterSlug } = useParams<{ slug: string; chapterSlug: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [chapter, setChapter] = useState<ChapterWithPages | null>(null);
  const [allChapters, setAllChapters] = useState<Chapter[]>([]);
  const [pageUrls, setPageUrls] = useState<(string | null)[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'single' | 'vertical'>('single');
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!slug || !chapterSlug) return;
    setLoading(true);
    setCurrentPage(1);
    setPageUrls([]);
    try {
      const ch = await getChapterWithPages(slug, chapterSlug);
      setChapter(ch);
      if (ch) {
        const urls = await Promise.all(ch.pages.map((p) => getPageImageURL(p.image_path)));
        setPageUrls(urls);
        const chs = await listChapters(ch.series_id, user?.role !== 'admin');
        setAllChapters(chs);
        if (user) {
          const progress = await getReadingProgress(user.id, ch.id);
          if (progress) setCurrentPage(progress.last_page);
          await addReadingHistory(user.id, ch.series_id, ch.id);
        }
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [slug, chapterSlug, user]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (user && chapter && !loading) {
      const timeout = setTimeout(() => {
        saveReadingProgress(user.id, chapter.id, currentPage, scrollRef.current?.scrollTop ?? 0);
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [currentPage, user, chapter, loading]);

  const currentChapterIndex = allChapters.findIndex((c) => c.id === chapter?.id);
  const prevChapter = currentChapterIndex > 0 ? allChapters[currentChapterIndex - 1] : null;
  const nextChapter = currentChapterIndex < allChapters.length - 1 ? allChapters[currentChapterIndex + 1] : null;

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>;
  if (!chapter) return (
    <div className="py-20 text-center">
      <p className="text-lg text-ink-300">Chapter not found</p>
      <Link to={`/series/${slug}`} className="mt-4 inline-block text-brand-400">Back to series</Link>
    </div>
  );

  const totalPages = chapter.pages.length;

  const navigateChapter = (direction: 'prev' | 'next') => {
    const target = direction === 'prev' ? prevChapter : nextChapter;
    if (target) navigate(`/series/${slug}/chapter/${target.slug}`);
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex items-center justify-between">
        <Link to={`/series/${slug}`} className="flex items-center gap-1 text-sm text-ink-400 hover:text-ink-100">
          <ChevronLeft className="h-4 w-4" /> Back to series
        </Link>
        <div className="flex items-center gap-2">
          <select
            value={chapter.slug}
            onChange={(e) => navigate(`/series/${slug}/chapter/${e.target.value}`)}
            className="input-field w-auto text-sm"
          >
            {allChapters.map((c) => <option key={c.id} value={c.slug}>Chapter {c.chapter_number}{c.title ? ` - ${c.title}` : ''}</option>)}
          </select>
          <button onClick={() => setMode(mode === 'single' ? 'vertical' : 'single')} className="btn-ghost" title="Toggle reading mode">
            {mode === 'single' ? <ScrollText className="h-4 w-4" /> : <List className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between text-sm text-ink-400">
        <button onClick={() => navigateChapter('prev')} disabled={!prevChapter} className="btn-ghost disabled:opacity-30">
          <ChevronLeft className="h-4 w-4" /> Prev Chapter
        </button>
        <span className="font-medium">{chapter.title || `Chapter ${chapter.chapter_number}`}</span>
        <button onClick={() => navigateChapter('next')} disabled={!nextChapter} className="btn-ghost disabled:opacity-30">
          Next Chapter <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {mode === 'single' ? (
        <div ref={scrollRef} className="flex flex-col items-center">
          {pageUrls.length > 0 && pageUrls[currentPage - 1] ? (
            <img src={pageUrls[currentPage - 1]!} alt={`Page ${currentPage}`} className="w-full max-w-2xl rounded-lg shadow-2xl sm:max-w-2xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl" />
          ) : (
            <div className="flex h-[60vh] w-full max-w-2xl items-center justify-center rounded-lg bg-ink-800 text-ink-500">
              No image available
            </div>
          )}

          <div className="mt-4 flex items-center gap-4">
            <button onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage <= 1} className="btn-secondary disabled:opacity-30">
              <ArrowLeft className="h-4 w-4" /> Prev
            </button>
            <span className="text-sm text-ink-300">{currentPage} / {totalPages}</span>
            <button onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage >= totalPages} className="btn-secondary disabled:opacity-30">
              Next <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          {currentPage === totalPages && nextChapter && (
            <button onClick={() => navigateChapter('next')} className="btn-primary mt-4">
              Next Chapter <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      ) : (
        <div ref={scrollRef} className="flex flex-col items-center gap-1">
          {pageUrls.map((url, i) => (
            url ? <img key={i} src={url} alt={`Page ${i + 1}`} className="w-full max-w-2xl rounded-lg shadow-xl sm:max-w-2xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl" /> :
            <div key={i} className="flex h-96 w-full max-w-2xl items-center justify-center rounded-lg bg-ink-800 text-ink-500">Page {i + 1}</div>
          ))}
          {nextChapter && (
            <button onClick={() => navigateChapter('next')} className="btn-primary mt-4">
              Next Chapter <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      <div className="mt-8 border-t border-ink-800 pt-6">
        <CommentSection seriesId={chapter.series_id} chapterId={chapter.id} />
      </div>
    </div>
  );
}
