import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Bookmark, BookmarkCheck, Bell, BellOff, ArrowLeft, Trash2 } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../hooks/useAuth.jsx";

export default function SeriesDetail() {
  const { slug } = useParams();
  const { user } = useAuth();
  const [series, setSeries] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bookmarked, setBookmarked] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [deletingChapterId, setDeletingChapterId] = useState(null);
  const [chapterError, setChapterError] = useState("");
  const [chapterOffset, setChapterOffset] = useState(0);
  const [chapterReloadKey, setChapterReloadKey] = useState(0);
  const chapterLimit = 20;
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    setLoading(true);
    api.getSeries(slug, `?chapter_offset=${chapterOffset}&chapter_limit=${chapterLimit}`).then((data) => {
      setSeries(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [slug, chapterOffset, chapterReloadKey]);

  useEffect(() => {
    if (user && series) {
      api.bookmarkStatus(series.id).then((d) => setBookmarked(d.bookmarked)).catch(() => {});
      api.subscriptionStatus(series.id).then((d) => setSubscribed(d.subscribed)).catch(() => {});
    }
  }, [user, series]);

  const toggleBookmark = async () => {
    if (!user) return;
    if (bookmarked) {
      await api.removeBookmark(series.id);
      setBookmarked(false);
    } else {
      await api.addBookmark(series.id);
      setBookmarked(true);
    }
  };

  const toggleSubscribe = async () => {
    if (!user) return;
    if (subscribed) {
      await api.unsubscribe(series.id);
      setSubscribed(false);
    } else {
      await api.subscribe(series.id);
      setSubscribed(true);
    }
  };

  const deleteChapter = async (event, chapter) => {
    event.preventDefault();
    event.stopPropagation();
    if (!window.confirm(`Delete Chapter ${chapter.chapter_number}? This cannot be undone.`)) return;

    setChapterError("");
    setDeletingChapterId(chapter.id);
    try {
      await api.deleteChapter(series.id, chapter.id);
      // The catalog record is the source of truth. Image cleanup is best effort
      // because the image service has its own storage volume.
      try {
        await api.deleteChapterFiles(series.slug, chapter.slug);
      } catch {
        // The chapter is already deleted from the catalog; an orphaned file
        // must not make the admin think the delete failed.
      }
      setSeries((current) => ({
        ...current,
        chapters: current.chapters.filter((item) => item.id !== chapter.id),
      }));
      if (series.chapters.length === 1 && chapterOffset > 0) {
        setChapterOffset((currentOffset) => Math.max(0, currentOffset - chapterLimit));
      }
      setChapterReloadKey((key) => key + 1);
    } catch (err) {
      setChapterError(err?.detail || "Failed to delete chapter.");
    } finally {
      setDeletingChapterId(null);
    }
  };

  const changeChapterPage = (nextOffset) => {
    setChapterOffset(Math.max(0, nextOffset));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (loading) {
    return <div className="max-w-4xl mx-auto px-4 py-8"><div className="skeleton rounded-xl h-96" /></div>;
  }
  if (!series) {
    return <div className="max-w-4xl mx-auto px-4 py-20 text-center text-ink-400">Series not found.</div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 animate-fade-in">
      <Link to="/" className="inline-flex items-center gap-1 text-ink-400 hover:text-ink-100 mb-4 transition-colors">
        <ArrowLeft size={18} /> Back to catalog
      </Link>

      <div className="flex flex-col sm:flex-row gap-6 mb-8">
        <div className="w-40 sm:w-48 flex-shrink-0">
          <div className="rounded-xl overflow-hidden bg-ink-900 aspect-[2/3] border border-ink-800">
            {series.cover_image_path ? (
              <img src={`/images/${series.cover_image_path}`} alt={series.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-ink-600 text-5xl font-bold">{series.title[0]}</div>
            )}
          </div>
        </div>

        <div className="flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-ink-50 mb-2">{series.title}</h1>
          <div className="flex flex-wrap gap-2 mb-4">
            <span className={`text-xs px-2 py-1 rounded ${series.status === "ongoing" ? "bg-green-600" : series.status === "completed" ? "bg-blue-600" : "bg-yellow-600"} text-white`}>
              {series.status}
            </span>
            {series.genres?.map((g) => (
              <span key={g.id} className="text-xs px-2 py-1 rounded bg-ink-800 text-ink-300">{g.name}</span>
            ))}
          </div>
          {series.description && <p className="text-ink-300 mb-4">{series.description}</p>}

          {user && (
            <div className="flex gap-2">
              <button
                onClick={toggleBookmark}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm transition-colors ${bookmarked ? "bg-brand-600 text-white" : "bg-ink-800 text-ink-300 hover:bg-ink-700"}`}
              >
                {bookmarked ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
                {bookmarked ? "Bookmarked" : "Bookmark"}
              </button>
              <button
                onClick={toggleSubscribe}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm transition-colors ${subscribed ? "bg-brand-600 text-white" : "bg-ink-800 text-ink-300 hover:bg-ink-700"}`}
              >
                {subscribed ? <Bell size={16} /> : <BellOff size={16} />}
                {subscribed ? "Subscribed" : "Subscribe"}
              </button>
            </div>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold text-ink-50 mb-4">Chapters</h2>
        {chapterError && (
          <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-2 mb-4 text-sm">
            {chapterError}
          </div>
        )}
        {series.chapters?.length === 0 && chapterOffset === 0 ? (
          <p className="text-ink-400">No chapters published yet.</p>
        ) : (
          <div>
            <div className="space-y-2">
              {series.chapters?.map((ch) => (
                <div
                  key={ch.id}
                  className="flex items-stretch bg-ink-900 hover:bg-ink-800 border border-ink-800 rounded-lg overflow-hidden transition-colors group"
                >
                  <Link
                    to={`/read/${series.slug}/${ch.slug}`}
                    className="flex flex-1 min-w-0 items-center justify-between px-4 py-3"
                  >
                    <div className="min-w-0">
                      <span className="text-brand-400 font-medium">Ch. {ch.chapter_number}</span>
                      {ch.title && <span className="text-ink-200 ml-2">{ch.title}</span>}
                      {isAdmin && ch.status !== "published" && (
                        <span className="text-xs text-yellow-400 ml-2">({ch.status})</span>
                      )}
                    </div>
                    <span className="text-xs text-ink-500 ml-4 flex-shrink-0"></span>
                  </Link>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={(event) => deleteChapter(event, ch)}
                      disabled={deletingChapterId === ch.id}
                      aria-label={`Delete Chapter ${ch.chapter_number}`}
                      title="Delete chapter"
                      className="w-11 flex-shrink-0 border-l border-ink-800 text-ink-500 hover:text-red-300 hover:bg-red-950/40 disabled:opacity-50 transition-colors flex items-center justify-center"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {(chapterOffset > 0 || series.chapter_has_more) && (
              <div className="flex items-center justify-between gap-3 mt-5 pt-4 border-t border-ink-800">
                <button
                  type="button"
                  onClick={() => changeChapterPage(chapterOffset - chapterLimit)}
                  disabled={chapterOffset === 0}
                  className="px-3 py-2 text-sm bg-ink-900 text-ink-300 rounded-lg disabled:opacity-40 hover:bg-ink-800 transition-colors"
                >
                  Newer chapters
                </button>
                <span className="text-xs text-ink-500">
                  {Math.floor(chapterOffset / chapterLimit) + 1}
                </span>
                <button
                  type="button"
                  onClick={() => changeChapterPage(chapterOffset + chapterLimit)}
                  disabled={!series.chapter_has_more}
                  className="px-3 py-2 text-sm bg-ink-900 text-ink-300 rounded-lg disabled:opacity-40 hover:bg-ink-800 transition-colors"
                >
                  Older chapters
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
