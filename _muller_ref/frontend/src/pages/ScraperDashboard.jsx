import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  Download,
  Trash2,
  RefreshCw,
  Globe,
  BookOpen,
  Image as ImageIcon,
  CheckCircle,
  XCircle,
  Loader2,
  ArrowRight,
  Layers,
  Database,
  Eye,
  ChevronLeft,
  ChevronRight,
  X,
  Link2,
  ExternalLink,
  Clock,
} from "lucide-react";
import { api } from "../api/client.js";

const MINIO_BUCKET = "manga-pages";

export default function ScraperDashboard() {
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [scrapeError, setScrapeError] = useState(null);
  const [scrapeResult, setScrapeResult] = useState(null);
  const [parents, setParents] = useState([]);
  const [parentsLoading, setParentsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedParent, setSelectedParent] = useState(null);
  const [children, setChildren] = useState([]);
  const [childrenLoading, setChildrenLoading] = useState(false);
  const [chapterList, setChapterList] = useState(null);
  const [chapterListLoading, setChapterListLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(null);
  const [syncError, setSyncError] = useState(null);
  const [scrapeChildLoading, setScrapeChildLoading] = useState(null);
  const [scrapeAllStatus, setScrapeAllStatus] = useState(null);
  const [viewingChild, setViewingChild] = useState(null);
  const [viewingChildIndex, setViewingChildIndex] = useState(0);
  const pollRef = useRef(null);

  const fetchParents = useCallback(async () => {
    setParentsLoading(true);
    try {
      const params = searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : "";
      const data = await api.listScrapedParents(params);
      setParents(data.parents || []);
    } catch {
      setParents([]);
    } finally {
      setParentsLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    fetchParents();
  }, [fetchParents]);

  // Poll for scrape-all completion
  useEffect(() => {
    if (scrapeAllStatus?.inProgress && selectedParent) {
      pollRef.current = setInterval(async () => {
        try {
          const data = await api.listScrapedChildren(selectedParent._id);
          const allChildren = data.children || [];
          const completed = allChildren.filter((c) => c.status === "completed").length;
          const errors = allChildren.filter((c) => c.status === "error").length;
          const total = scrapeAllStatus.totalChapters;

          setChildren(allChildren);
          setScrapeAllStatus((prev) => ({ ...prev, completed, errors, scraped: allChildren.length }));

          if (allChildren.length >= total || completed + errors >= total) {
            clearInterval(pollRef.current);
            pollRef.current = null;
            setScrapeAllStatus((prev) => ({ ...prev, inProgress: false, done: true }));
            fetchParents();
          }
        } catch {
          // ignore polling errors
        }
      }, 3000);
      return () => {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      };
    }
  }, [scrapeAllStatus?.inProgress, selectedParent, fetchParents]);

  const handleScrape = async () => {
    if (!scrapeUrl.trim()) return;
    setScrapeLoading(true);
    setScrapeError(null);
    setScrapeResult(null);
    try {
      const data = await api.scrapeParent(scrapeUrl.trim());
      setScrapeResult(data.parent);
      fetchParents();
    } catch (err) {
      setScrapeError(err?.error || "Failed to scrape series metadata.");
    } finally {
      setScrapeLoading(false);
    }
  };

  const handleSelectParent = async (parent) => {
    // If it's a lightweight object from the list, fetch full detail
    if (!parent.sourceUrl && parent._id) {
      try {
        const data = await api.getScrapedParent(parent._id);
        parent = data.parent;
      } catch {
        // use as-is
      }
    }
    setSelectedParent(parent);
    setSyncError(null);
    setChildrenLoading(true);
    setChapterList(null);
    setScrapeAllStatus(null);
    try {
      const data = await api.listScrapedChildren(parent._id);
      setChildren(data.children || []);
    } catch {
      setChildren([]);
    } finally {
      setChildrenLoading(false);
    }
  };

  const handleGetChapterList = async () => {
    if (!selectedParent) return;
    setChapterListLoading(true);
    try {
      const data = await api.getChapterList(selectedParent._id);
      setChapterList(data.chapters || []);
    } catch {
      setChapterList([]);
    } finally {
      setChapterListLoading(false);
    }
  };

  const handleDownloadCover = async (parentId) => {
    if (!parentId) return;
    try {
      await api.downloadParentCover(parentId);
      // Refresh the parent data
      const data = await api.getScrapedParent(parentId);
      if (selectedParent?._id === parentId) {
        setSelectedParent(data.parent);
      }
      if (scrapeResult?._id === parentId) {
        setScrapeResult(data.parent);
      }
      fetchParents();
    } catch (err) {
      alert(err?.error || "Failed to download cover.");
    }
  };

  const handleScrapeAllChapters = async () => {
    if (!selectedParent) return;
    setScrapeChildLoading("all");
    setSyncError(null);
    try {
      const data = await api.scrapeChild({ parentId: selectedParent._id });
      setScrapeAllStatus({
        inProgress: true,
        totalChapters: data.totalChapters,
        completed: 0,
        errors: 0,
        scraped: 0,
        done: false,
      });
    } catch (err) {
      alert(err?.error || "Failed to start chapter scraping.");
    } finally {
      setScrapeChildLoading(null);
    }
  };

  const handleScrapeSingleChapter = async (chapter) => {
    if (!selectedParent) return;
    setScrapeChildLoading(chapter.chapterNumber);
    try {
      await api.scrapeChild({
        parentId: selectedParent._id,
        chapterNumber: chapter.chapterNumber,
        chapterUrl: chapter.url,
        chapterTitle: chapter.chapterTitle,
      });
      const data = await api.listScrapedChildren(selectedParent._id);
      setChildren(data.children || []);
    } catch (err) {
      alert(err?.error || "Failed to scrape chapter.");
    } finally {
      setScrapeChildLoading(null);
    }
  };

  const handleSyncAll = async () => {
    if (!selectedParent) return;
    setSyncLoading("all");
    setSyncError(null);
    try {
      const data = await api.syncAllToCatalog(selectedParent._id);
      if (data.results?.errors > 0) {
        setSyncError(`${data.results.synced} synced, ${data.results.errors} errors, ${data.results.skipped} skipped.`);
      }
      const childData = await api.listScrapedChildren(selectedParent._id);
      setChildren(childData.children || []);
      // Refresh parent to get updated syncedToCatalog flag
      const parentData = await api.getScrapedParent(selectedParent._id);
      setSelectedParent(parentData.parent);
      fetchParents();
    } catch (err) {
      setSyncError(err?.error || err?.detail || "Failed to sync to catalog. Check that INTERNAL_API_KEY is configured.");
    } finally {
      setSyncLoading(null);
    }
  };

  const handleSyncSingleChild = async (childId) => {
    try {
      await api.syncChildToCatalog(childId);
      if (selectedParent) {
        const data = await api.listScrapedChildren(selectedParent._id);
        setChildren(data.children || []);
      }
    } catch (err) {
      alert(err?.error || err?.detail || "Failed to sync chapter.");
    }
  };

  const handleDeleteParent = async (parentId) => {
    if (!confirm("Delete this scraped series and all its chapters?")) return;
    try {
      await api.deleteScrapedParent(parentId);
      if (selectedParent?._id === parentId) {
        setSelectedParent(null);
        setChildren([]);
      }
      fetchParents();
    } catch (err) {
      alert(err?.error || "Failed to delete.");
    }
  };

  const handleDeleteChild = async (childId) => {
    if (!confirm("Delete this chapter and its images?")) return;
    try {
      await api.deleteScrapedChild(childId);
      if (selectedParent) {
        const data = await api.listScrapedChildren(selectedParent._id);
        setChildren(data.children || []);
      }
    } catch (err) {
      alert(err?.error || "Failed to delete chapter.");
    }
  };

  const handleViewChild = async (child, index) => {
    // Fetch full child data with pages
    try {
      const data = await api.getScrapedChild(child._id);
      setViewingChild(data.child);
      setViewingChildIndex(index);
    } catch {
      alert("Failed to load chapter pages.");
    }
  };

  // Cover URL: use MinIO if downloaded, otherwise original URL
  const getCoverUrl = (parent) => {
    if (!parent) return null;
    if (parent.coverMinioObject) {
      return api.minioAssetUrl(MINIO_BUCKET, parent.coverMinioObject);
    }
    return parent.coverUrl || null;
  };

  // Page image URL from MinIO
  const getPageUrl = (child, pageNumber) => {
    if (!child?.pages) return null;
    const page = child.pages.find((p) => p.pageNumber === pageNumber);
    if (!page) return null;
    return api.minioAssetUrl(page.minioBucket, page.minioObject);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-ink-50 font-display flex items-center gap-3">
          <Globe size={28} className="text-brand-400" />
          Scraper Dashboard
        </h1>
        <p className="text-ink-400 mt-2">
          Scrape series metadata and chapter images from a source, then sync to the reader catalog.
        </p>
      </div>

      {/* Scrape Input */}
      <div className="bg-ink-900 border border-ink-800 rounded-xl p-6 mb-8">
        <h2 className="text-lg font-semibold text-ink-100 mb-4 flex items-center gap-2">
          <Search size={20} className="text-brand-400" />
          Scrape Series Metadata
        </h2>
        <div className="flex gap-3">
          <input
            type="url"
            value={scrapeUrl}
            onChange={(e) => setScrapeUrl(e.target.value)}
            placeholder="https://mangakakalot.com/manga/..."
            className="flex-1 bg-ink-950 border border-ink-700 rounded-lg px-4 py-2.5 text-ink-100 placeholder-ink-500 focus:outline-none focus:border-brand-500 transition-colors"
            onKeyDown={(e) => e.key === "Enter" && handleScrape()}
          />
          <button
            onClick={handleScrape}
            disabled={scrapeLoading || !scrapeUrl.trim()}
            className="bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            {scrapeLoading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
            Scrape
          </button>
        </div>
        {scrapeError && (
          <div className="mt-3 flex items-center gap-2 text-red-400 text-sm">
            <XCircle size={16} />
            {scrapeError}
          </div>
        )}
        {scrapeResult && (
          <div className="mt-4 bg-ink-950 border border-ink-700 rounded-lg p-4">
            <div className="flex items-start gap-4">
              {getCoverUrl(scrapeResult) && (
                <img
                  src={getCoverUrl(scrapeResult)}
                  alt={scrapeResult.title}
                  className="w-20 h-28 object-cover rounded-lg border border-ink-700 flex-shrink-0"
                  onError={(e) => { e.target.style.display = "none"; }}
                />
              )}
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-ink-50">{scrapeResult.title}</h3>
                <p className="text-sm text-ink-400 mt-1 line-clamp-2">{scrapeResult.description}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {scrapeResult.genres?.slice(0, 5).map((g) => (
                    <span key={g} className="text-xs bg-ink-800 text-ink-300 px-2 py-0.5 rounded-full">
                      {g}
                    </span>
                  ))}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${scrapeResult.status === "ongoing" ? "bg-green-900 text-green-300" : "bg-ink-800 text-ink-400"}`}>
                    {scrapeResult.status}
                  </span>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => handleSelectParent(scrapeResult)}
                    className="text-sm bg-brand-600 hover:bg-brand-500 text-white px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                  >
                    View Details <ArrowRight size={14} />
                  </button>
                  <button
                    onClick={() => handleDownloadCover(scrapeResult._id)}
                    className="text-sm bg-ink-800 hover:bg-ink-700 text-ink-200 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                  >
                    <Download size={14} /> Download Cover
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Parents List */}
        <div className="lg:col-span-1">
          <div className="bg-ink-900 border border-ink-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-ink-100 flex items-center gap-2">
                <BookOpen size={20} className="text-brand-400" />
                Scraped Series
              </h2>
              <button
                onClick={fetchParents}
                className="p-1.5 text-ink-400 hover:text-ink-100 transition-colors"
                title="Refresh"
              >
                <RefreshCw size={16} />
              </button>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-full bg-ink-950 border border-ink-700 rounded-lg px-3 py-2 text-sm text-ink-100 placeholder-ink-500 focus:outline-none focus:border-brand-500 mb-3"
            />
            {parentsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 size={24} className="animate-spin text-ink-500" />
              </div>
            ) : parents.length === 0 ? (
              <p className="text-ink-500 text-sm text-center py-8">No scraped series yet.</p>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {parents.map((p) => (
                  <div
                    key={p._id}
                    onClick={() => handleSelectParent(p)}
                    className={`cursor-pointer rounded-lg p-3 border transition-colors ${
                      selectedParent?._id === p._id
                        ? "bg-brand-900/30 border-brand-700"
                        : "bg-ink-950 border-ink-800 hover:border-ink-700"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink-100 truncate">{p.title}</p>
                        <p className="text-xs text-ink-500 truncate">{p.sourceName}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-ink-400">{p.childCount} chapters</span>
                          {p.syncedToCatalog && (
                            <span className="text-xs text-green-400 flex items-center gap-0.5">
                              <CheckCircle size={10} /> Synced
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteParent(p._id); }}
                        className="p-1 text-ink-500 hover:text-red-400 transition-colors flex-shrink-0"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Detail Panel */}
        <div className="lg:col-span-2">
          {!selectedParent ? (
            <div className="bg-ink-900 border border-ink-800 rounded-xl p-12 flex flex-col items-center justify-center">
              <Layers size={48} className="text-ink-700 mb-4" />
              <p className="text-ink-500">Select a scraped series to view details and manage chapters.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Parent Detail */}
              <div className="bg-ink-900 border border-ink-800 rounded-xl p-6">
                <div className="flex items-start gap-4">
                  {getCoverUrl(selectedParent) && (
                    <img
                      src={getCoverUrl(selectedParent)}
                      alt={selectedParent.title}
                      className="w-24 h-32 object-cover rounded-lg border border-ink-700 flex-shrink-0"
                      onError={(e) => { e.target.style.display = "none"; }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h2 className="text-xl font-bold text-ink-50">{selectedParent.title}</h2>
                    <p className="text-sm text-ink-400 mt-1">{selectedParent.description}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {selectedParent.genres?.map((g) => (
                        <span key={g} className="text-xs bg-ink-800 text-ink-300 px-2 py-0.5 rounded-full">
                          {g}
                        </span>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                      {selectedParent.author && <p className="text-ink-400">Author: <span className="text-ink-200">{selectedParent.author}</span></p>}
                      {selectedParent.status && <p className="text-ink-400">Status: <span className="text-ink-200">{selectedParent.status}</span></p>}
                      {selectedParent.year && <p className="text-ink-400">Year: <span className="text-ink-200">{selectedParent.year}</span></p>}
                      {selectedParent.type && <p className="text-ink-400">Type: <span className="text-ink-200">{selectedParent.type}</span></p>}
                    </div>
                    <a href={selectedParent.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-400 hover:text-brand-300 mt-2 inline-flex items-center gap-1">
                      <ExternalLink size={12} /> {selectedParent.sourceName}
                    </a>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-ink-800">
                  <button
                    onClick={handleGetChapterList}
                    disabled={chapterListLoading}
                    className="text-sm bg-ink-800 hover:bg-ink-700 text-ink-200 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    {chapterListLoading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                    Get Chapter List
                  </button>
                  <button
                    onClick={() => handleDownloadCover(selectedParent._id)}
                    className="text-sm bg-ink-800 hover:bg-ink-700 text-ink-200 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <Download size={14} /> Download Cover
                  </button>
                  <button
                    onClick={handleScrapeAllChapters}
                    disabled={scrapeChildLoading === "all" || scrapeAllStatus?.inProgress}
                    className="text-sm bg-brand-700 hover:bg-brand-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    {scrapeChildLoading === "all" || scrapeAllStatus?.inProgress ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />}
                    Scrape All Chapters
                  </button>
                  <button
                    onClick={handleSyncAll}
                    disabled={syncLoading === "all"}
                    className="text-sm bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    {syncLoading === "all" ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
                    Sync All to Catalog
                  </button>
                </div>

                {/* Sync Error */}
                {syncError && (
                  <div className="mt-3 flex items-start gap-2 text-red-400 text-sm bg-red-950/30 border border-red-900 rounded-lg p-3">
                    <XCircle size={16} className="flex-shrink-0 mt-0.5" />
                    <span>{syncError}</span>
                  </div>
                )}

                {/* Scrape All Progress */}
                {scrapeAllStatus && (
                  <div className="mt-3 bg-ink-950 border border-ink-700 rounded-lg p-3">
                    {scrapeAllStatus.inProgress ? (
                      <div className="flex items-center gap-2 text-sm text-ink-200">
                        <Loader2 size={16} className="animate-spin text-brand-400" />
                        <span>
                          Scraping chapters... {scrapeAllStatus.scraped}/{scrapeAllStatus.totalChapters} started
                          ({scrapeAllStatus.completed} completed, {scrapeAllStatus.errors} errors)
                        </span>
                      </div>
                    ) : scrapeAllStatus.done ? (
                      <div className="flex items-center gap-2 text-sm text-green-400">
                        <CheckCircle size={16} />
                        <span>
                          Scraping complete: {scrapeAllStatus.completed} succeeded, {scrapeAllStatus.errors} failed out of {scrapeAllStatus.totalChapters} chapters.
                        </span>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              {/* Chapter List from Source */}
              {chapterList && (
                <div className="bg-ink-900 border border-ink-800 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-ink-100 mb-3">
                    Available Chapters from Source ({chapterList.length})
                  </h3>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {chapterList.slice(0, 50).map((ch) => (
                      <div key={ch.chapterNumber} className="flex items-center justify-between bg-ink-950 rounded-lg px-3 py-1.5">
                        <span className="text-sm text-ink-300">
                          Ch. {ch.chapterNumber} {ch.chapterTitle && <span className="text-ink-500">— {ch.chapterTitle}</span>}
                        </span>
                        <button
                          onClick={() => handleScrapeSingleChapter(ch)}
                          disabled={scrapeChildLoading === ch.chapterNumber}
                          className="text-xs bg-brand-700 hover:bg-brand-600 disabled:opacity-50 text-white px-2 py-1 rounded transition-colors flex items-center gap-1"
                        >
                          {scrapeChildLoading === ch.chapterNumber ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                          Scrape
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Scraped Children */}
              <div className="bg-ink-900 border border-ink-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-ink-100 mb-3 flex items-center gap-2">
                  <ImageIcon size={16} className="text-brand-400" />
                  Scraped Chapters ({children.length})
                </h3>
                {childrenLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 size={24} className="animate-spin text-ink-500" />
                  </div>
                ) : children.length === 0 ? (
                  <p className="text-ink-500 text-sm text-center py-6">No chapters scraped yet. Use "Get Chapter List" then scrape individual or all chapters.</p>
                ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {children.map((child, index) => (
                      <div key={child._id} className="flex items-center justify-between bg-ink-950 rounded-lg p-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${child.status === "completed" ? "bg-green-400" : child.status === "error" ? "bg-red-400" : "bg-yellow-400 animate-pulse"}`} />
                          <div className="min-w-0">
                            <p className="text-sm text-ink-100 truncate">
                              Chapter {child.chapterNumber}
                              {child.chapterTitle && <span className="text-ink-500"> — {child.chapterTitle}</span>}
                            </p>
                            <p className="text-xs text-ink-500">
                              {child.pageCount} pages
                              {child.syncedToCatalog && <span className="text-green-400 ml-2">Synced to catalog</span>}
                              {child.status === "error" && <span className="text-red-400 ml-2">{child.errorMsg}</span>}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {child.status === "completed" && child.pageCount > 0 && (
                            <button
                              onClick={() => handleViewChild(child, index)}
                              className="text-xs bg-ink-800 hover:bg-ink-700 text-ink-200 px-2 py-1 rounded transition-colors flex items-center gap-1"
                              title="View pages"
                            >
                              <Eye size={12} /> View
                            </button>
                          )}
                          {!child.syncedToCatalog && child.status === "completed" && (
                            <button
                              onClick={() => handleSyncSingleChild(child._id)}
                              className="text-xs bg-green-700 hover:bg-green-600 text-white px-2 py-1 rounded transition-colors flex items-center gap-1"
                            >
                              <Database size={12} /> Sync
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteChild(child._id)}
                            className="p-1 text-ink-500 hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Page Viewer Modal */}
      {viewingChild && (
        <PageViewer
          child={viewingChild}
          onClose={() => { setViewingChild(null); }}
          getPageUrl={getPageUrl}
        />
      )}
    </div>
  );
}

/**
 * Full-screen page viewer modal.
 * Shows all pages of a scraped chapter with navigation.
 */
function PageViewer({ child, onClose, getPageUrl }) {
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = child.pageCount || child.pages?.length || 0;

  const goNext = () => setCurrentPage((p) => Math.min(p + 1, totalPages));
  const goPrev = () => setCurrentPage((p) => Math.max(p - 1, 1));

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [totalPages, onClose]);

  const pageUrl = getPageUrl(child, currentPage);

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-ink-800 bg-ink-950">
        <div className="flex items-center gap-3 min-w-0">
          <ImageIcon size={20} className="text-brand-400 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink-100 truncate">
              Chapter {child.chapterNumber}
              {child.chapterTitle && <span className="text-ink-400"> — {child.chapterTitle}</span>}
            </p>
            <p className="text-xs text-ink-500">Page {currentPage} of {totalPages}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 text-ink-400 hover:text-ink-100 hover:bg-ink-800 rounded-lg transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      {/* Page Display */}
      <div className="flex-1 flex items-center justify-center overflow-auto p-4">
        {pageUrl ? (
          <img
            key={currentPage}
            src={pageUrl}
            alt={`Page ${currentPage}`}
            className="max-h-full max-w-full object-contain rounded-lg"
            onError={(e) => {
              e.target.style.display = "none";
            }}
          />
        ) : (
          <div className="text-ink-500 flex flex-col items-center gap-2">
            <XCircle size={32} />
            <p>Page not found</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 px-4 py-3 border-t border-ink-800 bg-ink-950">
          <button
            onClick={goPrev}
            disabled={currentPage <= 1}
            className="p-2 text-ink-200 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed bg-ink-800 hover:bg-ink-700 rounded-lg transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="text-sm text-ink-400 min-w-[80px] text-center">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={goNext}
            disabled={currentPage >= totalPages}
            className="p-2 text-ink-200 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed bg-ink-800 hover:bg-ink-700 rounded-lg transition-colors"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      )}
    </div>
  );
}
