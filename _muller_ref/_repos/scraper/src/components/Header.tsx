import { Globe, Github } from 'lucide-react';

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-dark-200 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 shadow-sm">
            <Globe className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-dark-900">ScrapeHub</h1>
            <p className="hidden text-xs text-dark-500 sm:block">Hybrid Web Scraper</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            API Ready
          </span>
          <a
            href="https://github.com/amerkurev/scrapper"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost"
            aria-label="View source on GitHub"
          >
            <Github className="h-4 w-4" />
          </a>
        </div>
      </div>
    </header>
  );
}
