import { useState, useEffect, useCallback } from 'react';
import { Search, Loader2, Save, Trash2, Link2, GitBranch, RefreshCw, Eye, ChevronRight, ChevronDown, FileText, Image as ImageIcon, Tag, ListTree, Download, CheckCircle, XCircle, Filter } from 'lucide-react';
import { scrape, slugify } from '@/lib/scraper';
import { saveScrapeRecord, listScrapeRecords, listOrphanScrapeRecords, getScrapeChildren, attachScrapeChild, deleteScrapeRecord, syncScrapeParentToSeries, syncScrapeChildToChapter, syncScrapeParentAll, clearScrapeHistory } from '@/lib/dataAccess';
import type { ScrapeMode, ScrapeResult, ScrapeRecordSummary, ImageItem } from '@/types';

const MODES: Array<{ value: ScrapeMode; label: string; icon: typeof FileText; desc: string }> = [
  { value: 'article', label: 'Article', icon: FileText, desc: 'Extract main article content' },
  { value: 'text', label: 'Text', icon: FileText, desc: 'Full page text extraction' },
  { value: 'links', label: 'Links', icon: Link2, desc: 'Extract all links' },
  { value: 'images', label: 'Images', icon: ImageIcon, desc: 'Extract all images' },
  { value: 'metadata', label: 'Metadata', icon: Tag, desc: 'Page metadata & SEO info' },
  { value: 'full', label: 'Full Crawl', icon: ListTree, desc: 'Everything: article, links, images, text' },
];

export default function ScraperAdmin() {
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<ScrapeMode>('images');
  const [scraping, setScraping] = useState(false);
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<ScrapeRecordSummary[]>([]);
  const [filterMode, setFilterMode] = useState<ScrapeMode | ''>('');
  const [parentsOnly, setParentsOnly] = useState(true);
  const [expandedParent, setExpandedParent] = useState<string | null>(null);
  const [children, setChildren] = useState<Record<string, ScrapeRecordSummary[]>>({});
  const [editingImages, setEditingImages] = useState<ImageItem[] | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [orphans, setOrphans] = useState<ScrapeRecordSummary[]>([]);

  const loadRecords = useCallback(async () => {
    try {
      const [recs, orphs] = await Promise.all([
        listScrapeRecords({ limit: 100, mode: filterMode || undefined, parentsOnly }),
        listOrphanScrapeRecords(),
      ]);
      setRecords(recs);
      setOrphans(orphs);
    } catch { /* ignore */ }
  }, [filterMode, parentsOnly]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  const handleScrape = async () => {
    setError(null);
    setResult(null);
    if (!url.trim()) { setError('Enter a URL.'); return; }
    setScraping(true);
    try {
      const res = await scrape(url, mode);
      setResult(res);
      if (res.status === 'error') setError(res.error ?? 'Scrape failed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scrape failed');
    } finally {
      setScraping(false);
    }
  };

  const handleSave = async (parentId?: string) => {
    if (!result) return;
    try {
      const images = extractImages(result);
      await saveScrapeRecord({ ...result, parentId: parentId ?? null, editedImages: images });
      await loadRecords();
      setResult(null);
      setUrl('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const handleExpand = async (parentId: string) => {
    if (expandedParent === parentId) {
      setExpandedParent(null);
      return;
    }
    setExpandedParent(parentId);
    if (!children[parentId]) {
      const ch = await getScrapeChildren(parentId);
      setChildren({ ...children, [parentId]: ch });
    }
  };

  const handleAttach = async (parentId: string, childId: string) => {
    await attachScrapeChild(childId, parentId);
    await loadRecords();
    const ch = await getScrapeChildren(parentId);
    setChildren({ ...children, [parentId]: ch });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this scrape record and all its children?')) return;
    await deleteScrapeRecord(id);
    await loadRecords();
  };

  const handleClearAll = async () => {
    if (!confirm('Delete ALL saved scrape records? This cannot be undone.')) return;
    await clearScrapeHistory();
    await loadRecords();
  };

  const handleSyncParent = async (id: string) => {
    setSyncing(id);
    try {
      await syncScrapeParentToSeries(id);
      await loadRecords();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(null);
    }
  };

  const handleSyncChild = async (id: string) => {
    setSyncing(id);
    try {
      await syncScrapeChildToChapter(id);
      await loadRecords();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(null);
    }
  };

  const handleSyncAll = async (id: string) => {
    setSyncing(id);
    try {
      await syncScrapeParentAll(id);
      await loadRecords();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(null);
    }
  };

  const parentRecords = records.filter((r) => !r.parent_id);
  const childRecords = records.filter((r) => r.parent_id);

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink-100"><Search className="h-6 w-6 text-brand-500" /> Scraper Admin</h1>
        {records.length > 0 && <button onClick={handleClearAll} className="btn-danger text-xs"><Trash2 className="h-3 w-3" /> Clear All</button>}
      </div>

      {error && <div className="mb-4 rounded-lg bg-accent-600/10 px-4 py-3 text-sm text-accent-400">{error}</div>}

      {/* Scrape Form */}
      <div className="card mb-6 p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleScrape()}
            placeholder="https://example.com/manga-series"
            className="input-field flex-1"
          />
          <button onClick={handleScrape} disabled={scraping} className="btn-primary">
            {scraping ? <><Loader2 className="h-4 w-4 animate-spin" /> Scraping...</> : <><Search className="h-4 w-4" /> Scrape</>}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => setMode(m.value)}
              className={`rounded-lg border p-3 text-left transition-all ${mode === m.value ? 'border-brand-600 bg-brand-600/10' : 'border-ink-800 bg-ink-900 hover:border-ink-700'}`}
            >
              <m.icon className={`mb-2 h-5 w-5 ${mode === m.value ? 'text-brand-400' : 'text-ink-400'}`} />
              <p className={`text-sm font-medium ${mode === m.value ? 'text-brand-400' : 'text-ink-200'}`}>{m.label}</p>
              <p className="mt-0.5 text-xs text-ink-500">{m.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Scrape Result Preview */}
      {result && (
        <div className="card mb-6 p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                {result.status === 'success' ? <CheckCircle className="h-5 w-5 text-success-400" /> : <XCircle className="h-5 w-5 text-accent-400" />}
                {result.title || 'Scrape Result'}
              </h2>
              <p className="mt-1 text-xs text-ink-500">{result.url} • Mode: {result.mode}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {result.status === 'success' && (
                <>
                  <button onClick={() => handleSave()} className="btn-primary"><Save className="h-4 w-4" /> Save as Parent</button>
                  {parentRecords.length > 0 && (
                    <select
                      value=""
                      onChange={(e) => { const v = e.target.value; if (v) handleSave(v); }}
                      className="input-field w-auto text-sm"
                    >
                      <option value="">Save as child of...</option>
                      {parentRecords.map((p) => <option key={p.id} value={p.id}>{p.title || p.url}</option>)}
                    </select>
                  )}
                </>
              )}
            </div>
          </div>

          {result.summary && <p className="mb-4 text-sm text-ink-300">{result.summary}</p>}

          {result.result && (
            <ScrapeResultDisplay result={result} onEditImages={(imgs) => setEditingImages(imgs)} />
          )}
        </div>
      )}

      {/* Saved Records */}
      <div className="card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Saved Records ({records.length})</h2>
          <div className="flex items-center gap-2">
            <select value={filterMode} onChange={(e) => setFilterMode(e.target.value as ScrapeMode | '')} className="input-field w-auto text-sm">
              <option value="">All Modes</option>
              {MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-sm text-ink-400">
              <input type="checkbox" checked={parentsOnly} onChange={(e) => setParentsOnly(e.target.checked)} className="rounded border-ink-700" /> Parents only
            </label>
            <button onClick={loadRecords} className="btn-ghost"><RefreshCw className="h-4 w-4" /></button>
          </div>
        </div>

        {records.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-500">No saved scrape records yet. Scrape a URL and save it to get started.</p>
        ) : (
          <div className="space-y-2">
            {parentsOnly ? (
              parentRecords.map((r) => (
                <div key={r.id}>
                  <div className="flex items-center gap-3 rounded-lg border border-ink-800 bg-ink-900 p-4">
                    <button onClick={() => handleExpand(r.id)} className="text-ink-400 hover:text-ink-100">
                      {expandedParent === r.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <div className="flex-1">
                      <p className="font-medium text-ink-100">{r.title || r.url}</p>
                      <p className="text-xs text-ink-500">{r.url} • {r.mode} • {new Date(r.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {r.synced && <span className="badge bg-success-600/20 text-success-400"><CheckCircle className="h-3 w-3" /> Synced</span>}
                      <button onClick={() => handleSyncParent(r.id)} disabled={syncing === r.id} className="btn-ghost text-xs" title="Sync to catalog as series">
                        {syncing === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Series
                      </button>
                      <button onClick={() => handleSyncAll(r.id)} disabled={syncing === r.id} className="btn-ghost text-xs" title="Sync parent + all children">
                        {syncing === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />} All
                      </button>
                      <button onClick={() => handleDelete(r.id)} className="btn-ghost text-accent-400"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                  {expandedParent === r.id && children[r.id] && (
                    <div className="ml-8 mt-1 space-y-1 border-l border-ink-800 pl-4">
                      {children[r.id].length === 0 ? (
                        <p className="py-2 text-xs text-ink-500">No children yet. Attach a record below.</p>
                      ) : (
                        children[r.id].map((ch) => (
                          <div key={ch.id} className="flex items-center gap-3 rounded-lg border border-ink-800 bg-ink-900/50 p-3">
                            <span className="badge bg-ink-800 text-ink-400">#{ch.position}</span>
                            <div className="flex-1">
                              <p className="text-sm text-ink-200">{ch.title || ch.url}</p>
                              <p className="text-xs text-ink-500">{ch.url} • {ch.mode}{ch.unique_key && ` • Key: ${ch.unique_key.slice(0, 16)}...`}</p>
                            </div>
                            <div className="flex items-center gap-1">
                              {ch.synced && <span className="badge bg-success-600/20 text-success-400 text-xs">Synced</span>}
                              <button onClick={() => handleSyncChild(ch.id)} disabled={syncing === ch.id} className="btn-ghost text-xs" title="Sync to catalog as chapter">
                                {syncing === ch.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                              </button>
                              <button onClick={() => handleDelete(ch.id)} className="btn-ghost text-accent-400"><Trash2 className="h-3 w-3" /></button>
                            </div>
                          </div>
                        ))
                      )}
                      {orphans.filter((o) => o.id !== r.id).length > 0 && (
                        <div className="py-2">
                          <select
                            value=""
                            onChange={(e) => { const v = e.target.value; if (v) handleAttach(r.id, v); }}
                            className="input-field w-auto text-xs"
                          >
                            <option value="">+ Attach a record as child...</option>
                            {orphans.filter((o) => o.id !== r.id).map((o) => (
                              <option key={o.id} value={o.id}>{o.title || o.url}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            ) : (
              records.map((r) => (
                <div key={r.id} className="flex items-center gap-3 rounded-lg border border-ink-800 bg-ink-900 p-4">
                  <div className="flex-1">
                    <p className="font-medium text-ink-100">{r.title || r.url}</p>
                    <p className="text-xs text-ink-500">{r.url} • {r.mode} • {r.parent_id ? 'Child' : 'Parent'} {r.position ? `#${r.position}` : ''} • {new Date(r.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {r.synced && <span className="badge bg-success-600/20 text-success-400"><CheckCircle className="h-3 w-3" /></span>}
                    {!r.parent_id && childRecords.length > 0 && (
                      <select value="" onChange={(e) => { const v = e.target.value; if (v) handleAttach(r.id, v); }} className="input-field w-auto text-xs" title="Attach a child">
                        <option value="">+ Attach child...</option>
                        {childRecords.filter((c) => !c.parent_id || c.parent_id === r.id).map((c) => <option key={c.id} value={c.id}>{c.title || c.url}</option>)}
                      </select>
                    )}
                    <button onClick={() => handleDelete(r.id)} className="btn-ghost text-accent-400"><Trash2 className="h-3 w-3" /></button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Image Editor Modal */}
      {editingImages && (
        <ImageEditorModal images={editingImages} onSave={(imgs) => {
          if (result) {
            const imagesData = result.result?.images as { images?: ImageItem[] } | undefined;
            if (imagesData) {
              imagesData.images = imgs;
              setResult({ ...result });
            }
          }
          setEditingImages(null);
        }} onCancel={() => setEditingImages(null)} />
      )}
    </div>
  );
}

function extractImages(result: ScrapeResult): ImageItem[] | undefined {
  if (!result.result) return undefined;
  const imagesData = result.result.images as { images?: ImageItem[] } | undefined;
  return imagesData?.images;
}

function ScrapeResultDisplay({ result, onEditImages }: { result: ScrapeResult; onEditImages: (imgs: ImageItem[]) => void }) {
  const data = result.result!;
  const mode: string = result.mode;
  const isFull = mode === 'full';
  const sections: React.ReactNode[] = [];

  if (mode === 'images' || isFull) {
    const images = (data.images as { images?: ImageItem[] })?.images ?? [];
    sections.push(
      <div key="images">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm text-ink-400">{images.length} images found</p>
          <button onClick={() => onEditImages(images)} className="btn-ghost text-xs">Edit image list</button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {images.slice(0, 24).map((img, i) => (
            <div key={i} className="group relative overflow-hidden rounded-lg border border-ink-800">
              <img src={img.src} alt={img.alt} className="aspect-square w-full object-cover" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.2'; }} />
              <div className="absolute inset-x-0 bottom-0 bg-black/70 px-2 py-1 text-xs text-ink-300 opacity-0 transition-opacity group-hover:opacity-100">
                <p className="truncate">{img.alt || `Image ${i + 1}`}</p>
              </div>
            </div>
          ))}
        </div>
        {images.length > 24 && <p className="mt-2 text-xs text-ink-500">...and {images.length - 24} more</p>}
      </div>,
    );
  }

  if (mode === 'links' || isFull) {
    const links = data.links as { all?: string[]; internal?: string[]; external?: string[]; count?: number } | undefined;
    if (links) {
      sections.push(
        <div key="links">
          <p className="mb-2 text-sm text-ink-400">{links.count} links ({links.internal?.length} internal, {links.external?.length} external)</p>
          <div className="max-h-48 overflow-y-auto scrollbar-thin rounded-lg bg-ink-950 p-3">
            {links.all?.slice(0, 50).map((l: string, i: number) => <p key={i} className="truncate text-xs text-brand-400 hover:text-brand-300"><a href={l} target="_blank" rel="noopener noreferrer">{l}</a></p>)}
          </div>
        </div>,
      );
    }
  }

  if (mode === 'article' || isFull) {
    const article = data.article as { content?: string; textContent?: string; title?: string } | undefined;
    if (article?.content) {
      sections.push(<div key="article" className="article-content max-h-96 overflow-y-auto scrollbar-thin rounded-lg bg-ink-950 p-4" dangerouslySetInnerHTML={{ __html: article.content }} />);
    }
  }

  if (mode === 'metadata') {
    const metadata = data.metadata as Record<string, unknown> | undefined;
    if (metadata) {
      sections.push(
        <div key="metadata" className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {Object.entries(metadata).filter(([, v]) => v !== null).map(([k, v]) => (
                <tr key={k} className="border-b border-ink-800">
                  <td className="py-2 pr-4 font-medium text-ink-300">{k}</td>
                  <td className="py-2 text-ink-400">{String(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    }
  }

  if (mode === 'text' || isFull) {
    const fullText = data.fullText as string | undefined;
    if (fullText) {
      sections.push(<div key="text" className="max-h-96 overflow-y-auto scrollbar-thin rounded-lg bg-ink-950 p-4 text-sm text-ink-300">{fullText.slice(0, 2000)}{fullText.length > 2000 && '...'}</div>);
    }
  }

  if (sections.length === 0) {
    return <p className="text-sm text-ink-400">Result data available (mode: {mode})</p>;
  }

  return <div className={isFull ? 'space-y-6' : ''}>{sections}</div>;
}

function ImageEditorModal({ images, onSave, onCancel }: { images: ImageItem[]; onSave: (imgs: ImageItem[]) => void; onCancel: () => void }) {
  const [editList, setEditList] = useState(images);

  const removeImage = (index: number) => setEditList(editList.filter((_, i) => i !== index));
  const moveImage = (index: number, dir: 'up' | 'down') => {
    const newIndex = dir === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= editList.length) return;
    const newList = [...editList];
    [newList[index], newList[newIndex]] = [newList[newIndex], newList[index]];
    setEditList(newList);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div className="card max-h-[80vh] w-full max-w-2xl overflow-y-auto scrollbar-thin p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold">Edit Images ({editList.length})</h2>
        <div className="space-y-2">
          {editList.map((img, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-ink-800 p-2">
              <img src={img.src} alt={img.alt} className="h-16 w-16 rounded object-cover" onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.2'; }} />
              <div className="flex-1">
                <p className="truncate text-xs text-ink-300">{img.src}</p>
                <input value={img.alt} onChange={(e) => { const newList = [...editList]; newList[i] = { ...img, alt: e.target.value }; setEditList(newList); }} className="input-field mt-1 text-xs" placeholder="Alt text" />
              </div>
              <div className="flex flex-col gap-1">
                <button onClick={() => moveImage(i, 'up')} disabled={i === 0} className="text-ink-400 hover:text-ink-100 disabled:opacity-30 text-xs">▲</button>
                <button onClick={() => moveImage(i, 'down')} disabled={i === editList.length - 1} className="text-ink-400 hover:text-ink-100 disabled:opacity-30 text-xs">▼</button>
                <button onClick={() => removeImage(i)} className="text-accent-400 hover:text-accent-300"><Trash2 className="h-3 w-3" /></button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={() => onSave(editList)} className="btn-primary"><Save className="h-4 w-4" /> Save ({editList.length})</button>
          <button onClick={onCancel} className="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  );
}
