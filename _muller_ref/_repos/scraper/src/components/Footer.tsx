import { Github, Heart } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="border-t border-dark-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <div className="flex items-center gap-2 text-sm text-dark-500">
            <span>ScrapeHub</span>
            <span className="text-dark-300">•</span>
            <span>Hybrid Web Scraper</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-dark-500">
            <span className="flex items-center gap-1">
              Inspired by <Heart className="h-3 w-3 text-red-400" /> amerkurev/scrapper &amp; madhurimarawat/Web-Scrapper-Functions
            </span>
            <a
              href="https://github.com/amerkurev/scrapper"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-dark-600 hover:text-dark-900"
            >
              <Github className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
