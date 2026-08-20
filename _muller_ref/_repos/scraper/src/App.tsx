import { useState, useCallback, useEffect } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import type { ScrapeRequest, ScrapeResponse, HistoryEntry, HistoryEntryDetail } from '@/types';
import { scrape as scrapeApi, getHistoryEntry } from '@/api';
import { MODE_MAP } from '@/modes';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ScrapeForm from '@/components/ScrapeForm';
import EditableResultView from '@/components/EditableResultView';
import HistoryPanel from '@/components/HistoryPanel';

export default function App() {
  const [result, setResult] = useState<ScrapeResponse | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyTrigger, setHistoryTrigger] = useState(0);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  const checkBackend = useCallback(async () => {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        setBackendStatus('online');
        return true;
      }
      setBackendStatus('offline');
      return false;
    } catch {
      setBackendStatus('offline');
      return false;
    }
  }, []);

  // Check backend on mount
  useEffect(() => {
    checkBackend();
  }, [checkBackend]);

  const handleScrape = useCallback(async (req: ScrapeRequest) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setSavedId(null);
    try {
      const res = await scrapeApi(req);
      setResult(res);
      setSavedId(res.id ?? null);
      if (res.status === 'error') {
        setError(res.error || 'Scrape failed');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to connect to the scraper backend';
      setError(msg);
      setBackendStatus('offline');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSelectHistory = useCallback(async (entry: HistoryEntry) => {
    setLoading(true);
    setError(null);
    try {
      const full = await getHistoryEntry(entry._id);
      const detail = full as HistoryEntryDetail;
      const next: ScrapeResponse = {
        id: detail._id,
        url: detail.url,
        mode: detail.mode,
        title: detail.title,
        summary: detail.summary,
        status: detail.status as 'success' | 'error',
        result: detail.result,
        error: detail.error || undefined,
      };
      (next as ScrapeResponse & { editedText?: typeof detail.editedText; editedImages?: typeof detail.editedImages }).editedText = detail.editedText ?? undefined;
      (next as ScrapeResponse & { editedText?: typeof detail.editedText; editedImages?: typeof detail.editedImages }).editedImages = detail.editedImages ?? undefined;
      setResult(next);
      setSavedId(detail._id);
    } catch {
      setError('Failed to load saved record');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSaved = useCallback((id?: string) => {
    if (id) setSavedId(id);
    setHistoryTrigger((t) => t + 1);
  }, []);

  const handleResultChange = useCallback((next: ScrapeResponse) => {
    setResult(next);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-dark-50">
      <Header />

      <div className="flex flex-1">
        <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl">
            {/* Hero */}
            {!result && !loading && (
              <div className="mb-8 text-center animate-fade-in">
                <h2 className="text-3xl font-bold tracking-tight text-dark-900 sm:text-4xl">
                  Scrape Any Website,
                  <span className="bg-gradient-to-r from-primary-600 to-accent-600 bg-clip-text text-transparent">
                    {' '}Your Way
                  </span>
                </h2>
                <p className="mx-auto mt-3 max-w-2xl text-base text-dark-600">
                  A hybrid web scraper combining Mozilla Readability article extraction with
                  multi-mode data parsing — text, links, images, metadata, PDFs, and recursive crawls.
                </p>
              </div>
            )}

            {/* Backend status warning */}
            {backendStatus === 'offline' && (
              <div className="mb-6 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 animate-slide-up">
                <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Scraper backend is not running</p>
                  <p className="mt-0.5 text-amber-700">
                    Start the backend server (port 5000) to enable scraping. Run{' '}
                    <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs">
                      cd backend && npm start
                    </code>
                  </p>
                </div>
                <button onClick={checkBackend} className="btn-ghost ml-auto text-xs text-amber-700">
                  Retry
                </button>
              </div>
            )}

            {/* Scrape Form */}
            <ScrapeForm onScrape={handleScrape} loading={loading} />

            {/* Loading state */}
            {loading && (
              <div className="mt-6 card flex items-center justify-center py-16 animate-fade-in">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
                  <p className="text-sm text-dark-600">Fetching and parsing content...</p>
                </div>
              </div>
            )}

            {/* Error */}
            {error && !loading && (
              <div className="mt-6 card flex items-start gap-3 p-6 animate-slide-up">
                <AlertTriangle className="h-5 w-5 flex-shrink-0 text-red-600" />
                <div>
                  <p className="font-medium text-red-900">Something went wrong</p>
                  <p className="mt-1 text-sm text-red-700">{error}</p>
                </div>
              </div>
            )}

            {/* Result */}
            {result && !loading && (
              <div className="mt-6">
                <EditableResultView
                  result={result}
                  savedId={savedId}
                  onSaved={handleSaved}
                  onResultChange={handleResultChange}
                />
              </div>
            )}

            {/* Feature highlights when no result */}
            {!result && !loading && !error && (
              <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-3">
                {[
                  {
                    title: 'Reader Mode',
                    desc: 'Clean article extraction using Mozilla Readability — strips ads, navigation, and clutter.',
                    mode: 'article' as const,
                  },
                  {
                    title: 'Multi-Format',
                    desc: 'Extract text, links, images, SEO metadata, and PDF text — all from one interface.',
                    mode: 'full' as const,
                  },
                  {
                    title: 'Recursive Crawls',
                    desc: 'Follow internal links automatically and aggregate content across multiple pages.',
                    mode: 'full' as const,
                  },
                ].map((f, i) => {
                  const Icon = MODE_MAP[f.mode].icon;
                  return (
                    <div
                      key={i}
                      className="card p-5 animate-slide-up"
                      style={{ animationDelay: `${i * 100}ms` }}
                    >
                      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 text-white">
                        <Icon className="h-5 w-5" />
                      </div>
                      <h3 className="text-sm font-semibold text-dark-900">{f.title}</h3>
                      <p className="mt-1 text-xs leading-relaxed text-dark-600">{f.desc}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>

        <HistoryPanel refreshTrigger={historyTrigger} onSelect={handleSelectHistory} />
      </div>

      <Footer />
    </div>
  );
}
