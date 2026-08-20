import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, ChevronUp, ChevronDown } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../hooks/useAuth.jsx";
import CommentSection from "../components/CommentSection.jsx";

export default function Reader() {
  const { seriesSlug, chapterSlug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [visiblePages, setVisiblePages] = useState(new Set());
  const [scrollY, setScrollY] = useState(0);
  const containerRef = useRef(null);
  const saveTimerRef = useRef(null);
  const restoredRef = useRef(false);

  useEffect(() => {
    setLoading(true);
    restoredRef.current = false;
    api.getReader(seriesSlug, chapterSlug).then((d) => {
      setData(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [seriesSlug, chapterSlug]);

  // Restore scroll position
  useEffect(() => {
    if (data && !restoredRef.current && data.resume_scroll > 0) {
      requestAnimationFrame(() => {
        window.scrollTo({ top: data.resume_scroll, behavior: "instant" });
        restoredRef.current = true;
      });
    }
  }, [data]);

  // Save progress on scroll
  const saveProgress = useCallback(() => {
    if (!user || !data) return;
    const currentPage = Array.from(visiblePages).sort((a, b) => a - b).pop() || 1;
    api.saveProgress(data.chapter.id, {
      last_page: currentPage,
      scroll_position: scrollY,
    }).catch(() => {});
  }, [user, data, visiblePages, scrollY]);

  useEffect(() => {
    if (!user || !data) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(saveProgress, 1000);
    return () => clearTimeout(saveTimerRef.current);
  }, [scrollY, visiblePages, user, data, saveProgress]);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Lazy loading with IntersectionObserver
  useEffect(() => {
    if (!data) return;
    const observer = new IntersectionObserver(
      (entries) => {
        setVisiblePages((prev) => {
          const next = new Set(prev);
          for (const entry of entries) {
            const pageNum = parseInt(entry.target.dataset.page);
            if (entry.isIntersecting) next.add(pageNum);
          }
          return next;
        });
      },
      { rootMargin: "200px" }
    );
    document.querySelectorAll("[data-page]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [data]);

  if (loading) {
    return <div className="max-w-3xl mx-auto py-20 text-center text-ink-400">Loading chapter...</div>;
  }
  if (!data) {
    return <div className="max-w-3xl mx-auto py-20 text-center text-ink-400">Chapter not found.</div>;
  }

  return (
    <div className="min-h-screen bg-ink-950">
      {/* Top bar */}
      <div className="sticky top-14 z-40 bg-ink-900/95 backdrop-blur border-b border-ink-800">
        <div className="max-w-3xl mx-auto px-4 py-2 flex items-center justify-between">
          <Link to={`/series/${data.series.slug}`} className="flex items-center gap-1 text-ink-300 hover:text-ink-100 transition-colors text-sm">
            <ArrowLeft size={16} /> {data.series.title}
          </Link>
          <span className="text-sm text-ink-400">
            Ch. {data.chapter.chapter_number}
            {data.chapter.title && ` — ${data.chapter.title}`}
          </span>
        </div>
      </div>

      {/* Pages */}
      <div ref={containerRef} className="max-w-3xl mx-auto">
        {data.pages.map((page) => (
          <div
            key={page.page_number}
            data-page={page.page_number}
            className="relative bg-ink-900"
            style={{ minHeight: 200 }}
          >
            <LazyImage page={page} />
          </div>
        ))}
      </div>

      {/* Bottom navigation */}
      <div className="max-w-3xl mx-auto px-4 py-8 flex items-center justify-between gap-4">
        {data.prev_chapter ? (
          <button
            onClick={() => navigate(`/read/${data.series.slug}/${data.prev_chapter.slug}`)}
            className="flex items-center gap-1 px-4 py-2 bg-ink-900 hover:bg-ink-800 text-ink-300 rounded-lg transition-colors text-sm"
          >
            <ChevronUp size={18} /> Prev Ch.
          </button>
        ) : <div />}

        <Link to={`/series/${data.series.slug}`} className="text-ink-400 hover:text-ink-100 text-sm">
          Chapter list
        </Link>

        {data.next_chapter ? (
          <button
            onClick={() => navigate(`/read/${data.series.slug}/${data.next_chapter.slug}`)}
            className="flex items-center gap-1 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg transition-colors text-sm"
          >
            Next Ch. <ChevronDown size={18} />
          </button>
        ) : <div />}
      </div>

      <CommentSection seriesId={data.series.id} chapterId={data.chapter.id} />
    </div>
  );
}

function LazyImage({ page }) {
  const [loaded, setLoaded] = useState(false);
  const [visible, setVisible] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { rootMargin: "300px" }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="w-full">
      {visible ? (
        <img
          src={page.url}
          alt={`Page ${page.page_number}`}
          onLoad={() => setLoaded(true)}
          className={`w-full transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      ) : (
        <div className="skeleton w-full" style={{ height: 400 }} />
      )}
      {!loaded && visible && <div className="skeleton w-full absolute inset-0" />}
    </div>
  );
}
