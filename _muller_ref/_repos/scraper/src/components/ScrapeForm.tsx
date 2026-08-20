import { useState } from 'react';
import { Search, Loader2, AlertCircle } from 'lucide-react';
import type { ScrapeMode, ScrapeRequest } from '@/types';
import { SCRAPE_MODES } from '@/modes';

interface ScrapeFormProps {
  onScrape: (req: ScrapeRequest) => void;
  loading: boolean;
}

const EXAMPLE_URLS = [
  'https://en.wikipedia.org/wiki/Web_scraping',
  'https://blog.openai.com',
  'https://news.ycombinator.com',
];

export default function ScrapeForm({ onScrape, loading }: ScrapeFormProps) {
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<ScrapeMode>('article');
  const [recursive, setRecursive] = useState(false);
  const [maxDepth, setMaxDepth] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      setError('Please enter a URL to scrape.');
      return;
    }
    setError(null);
    onScrape({ url: url.trim(), mode, recursive: recursive && mode === 'full', maxDepth });
  };

  return (
    <div className="card animate-slide-up p-6 sm:p-8">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* URL Input */}
        <div>
          <label htmlFor="url" className="mb-2 block text-sm font-medium text-dark-700">
            Website URL
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-dark-400" />
            <input
              id="url"
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/article"
              className="input-field pl-11 text-base"
              disabled={loading}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-dark-500">Try:</span>
            {EXAMPLE_URLS.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUrl(u)}
                className="rounded-md bg-dark-100 px-2 py-0.5 text-xs text-dark-600 transition-colors hover:bg-dark-200 hover:text-dark-900"
                disabled={loading}
              >
                {u.replace(/^https?:\/\//, '')}
              </button>
            ))}
          </div>
        </div>

        {/* Mode Selection */}
        <div>
          <label className="mb-3 block text-sm font-medium text-dark-700">Scrape Mode</label>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {SCRAPE_MODES.map((m) => {
              const Icon = m.icon;
              const isSelected = mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  disabled={loading}
                  className={`group relative flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-all ${
                    isSelected
                      ? m.color === 'primary'
                        ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-500/20'
                        : 'border-accent-500 bg-accent-50 ring-2 ring-accent-500/20'
                      : 'border-dark-200 bg-white hover:border-dark-300 hover:bg-dark-50'
                  }`}
                >
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                      isSelected
                        ? m.color === 'primary'
                          ? 'bg-primary-600 text-white'
                          : 'bg-accent-600 text-white'
                        : 'bg-dark-100 text-dark-600 group-hover:bg-dark-200'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className={`text-sm font-medium ${isSelected ? 'text-dark-900' : 'text-dark-700'}`}>
                      {m.label}
                    </p>
                    <p className="mt-0.5 text-xs leading-snug text-dark-500">{m.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Recursive options for Full mode */}
        {mode === 'full' && (
          <div className="flex flex-wrap items-center gap-4 rounded-lg bg-dark-50 p-4">
            <label className="flex items-center gap-2 text-sm text-dark-700">
              <input
                type="checkbox"
                checked={recursive}
                onChange={(e) => setRecursive(e.target.checked)}
                className="h-4 w-4 rounded border-dark-300 text-primary-600 focus:ring-primary-500"
                disabled={loading}
              />
              Recursive crawl (follow internal links)
            </label>
            {recursive && (
              <label className="flex items-center gap-2 text-sm text-dark-700">
                Max depth:
                <select
                  value={maxDepth}
                  onChange={(e) => setMaxDepth(parseInt(e.target.value))}
                  className="rounded-md border border-dark-200 bg-white px-2 py-1 text-sm focus:border-primary-500 focus:outline-none"
                  disabled={loading}
                >
                  <option value={1}>1 level</option>
                  <option value={2}>2 levels</option>
                  <option value={3}>3 levels</option>
                </select>
              </label>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Submit */}
        <button type="submit" disabled={loading} className="btn-primary w-full text-base">
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Scraping...
            </>
          ) : (
            <>
              <Search className="h-5 w-5" />
              Start Scraping
            </>
          )}
        </button>
      </form>
    </div>
  );
}
