import { useState, useEffect } from 'react';
import {
  History,
  Trash2,
  ChevronRight,
  Loader2,
  Clock,
  AlertCircle,
  CheckCircle2,
  X,
  Folder,
  FolderOpen,
  ChevronDown,
} from 'lucide-react';
import type { HistoryEntry, ScrapeMode } from '@/types';
import { MODE_MAP } from '@/modes';
import { getHistory, deleteHistoryEntry, clearHistory } from '@/api';

interface HistoryPanelProps {
  refreshTrigger: number;
  onSelect: (entry: HistoryEntry) => void;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export default function HistoryPanel({ refreshTrigger, onSelect }: HistoryPanelProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getHistory(50)
      .then((res) => {
        if (!cancelled) {
          setHistory(res.history);
        }
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshTrigger]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteHistoryEntry(id);
    setHistory((prev) => prev.filter((h) => h._id !== id && h.parentId !== id));
  };

  const handleClearAll = async () => {
    await clearHistory();
    setHistory([]);
  };

  const parents = history.filter((h) => !h.parentId);
  const childrenByParent = history.reduce<Record<string, HistoryEntry[]>>((acc, h) => {
    if (h.parentId) {
      if (!acc[h.parentId]) acc[h.parentId] = [];
      acc[h.parentId].push(h);
    }
    return acc;
  }, {});
  Object.values(childrenByParent).forEach((list) =>
    list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
  );

  const renderEntry = (entry: HistoryEntry, isChild = false, childIndex?: number) => {
    const modeConfig = MODE_MAP[entry.mode as ScrapeMode];
    const Icon = modeConfig?.icon || History;
    const isError = entry.status === 'error';
    const childCount = entry.childCount || 0;
    const orderLabel = typeof childIndex === 'number' ? `Child ${childIndex + 1}` : null;

    return (
      <button
        key={entry._id}
        onClick={() => onSelect(entry)}
        className={`group flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors hover:bg-dark-50 ${isChild ? 'ml-4 border-l-2 border-dark-200' : ''}`}
      >
        <div
          className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
            isError ? 'bg-red-50 text-red-600' : isChild ? 'bg-accent-50 text-accent-600' : 'bg-primary-50 text-primary-600'
          }`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-dark-900">
            {entry.title || entry.url}
          </p>
          <p className="mt-0.5 truncate text-xs text-dark-500">{entry.url}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {orderLabel && (
              <span className="badge bg-accent-100 text-accent-700">
                {orderLabel}
              </span>
            )}
            <span className="text-xs text-dark-400">{modeConfig?.label || entry.mode}</span>
            <span className="text-xs text-dark-300">•</span>
            <span className="flex items-center gap-0.5 text-xs text-dark-400">
              <Clock className="h-3 w-3" />
              {formatTime(entry.createdAt)}
            </span>
            {isError ? (
              <AlertCircle className="h-3 w-3 text-red-500" />
            ) : (
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            )}
            {childCount > 0 && (
              <span className="badge bg-primary-50 text-primary-600">
                <Folder className="h-3 w-3" />
                {childCount} {childCount === 1 ? 'child' : 'children'}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => handleDelete(entry._id, e)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleDelete(entry._id, e as unknown as React.MouseEvent);
            }}
            className="rounded p-1 text-dark-400 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </span>
          <ChevronRight className="h-4 w-4 text-dark-400" />
        </div>
      </button>
    );
  };

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-dark-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-dark-600" />
          <h3 className="text-sm font-semibold text-dark-900">Saved Records</h3>
          {history.length > 0 && (
            <span className="badge bg-dark-100 text-dark-600">{parents.length}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {history.length > 0 && (
            <button
              onClick={handleClearAll}
              className="btn-ghost text-xs text-red-600 hover:bg-red-50"
              title="Clear all saved records"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button onClick={() => setIsOpen(false)} className="btn-ghost lg:hidden">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-dark-400" />
          </div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <History className="mb-3 h-8 w-8 text-dark-300" />
            <p className="text-sm text-dark-500">No saved records yet</p>
            <p className="mt-1 text-xs text-dark-400">Click "Save to Database" after scraping to store results here</p>
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {parents.map((entry) => {
              const children = childrenByParent[entry._id] || [];
              return (
                <div key={entry._id}>
                  {renderEntry(entry)}
                  {children.length > 0 && (
                    <div className="mt-0.5 space-y-0.5">
                      {children.map((child, idx) => renderEntry(child, true, idx))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-80 flex-shrink-0 lg:block">
        <div className="sticky top-[65px] h-[calc(100vh-65px)] card overflow-hidden">{content}</div>
      </aside>

      {/* Mobile drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-dark-900/50 backdrop-blur-sm" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-80 max-w-[85vw] card animate-slide-in-right">
            {content}
          </div>
        </div>
      )}

      {/* Mobile toggle button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary-600 text-white shadow-lg transition-all hover:bg-primary-700 hover:shadow-xl active:scale-95 lg:hidden"
          aria-label="Open saved records"
        >
          <History className="h-5 w-5" />
          {parents.length > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white">
              {parents.length}
            </span>
          )}
        </button>
      )}
    </>
  );
}
