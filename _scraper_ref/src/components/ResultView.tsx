import { useState } from 'react';
import {
  FileText,
  Type,
  Link2,
  Image as ImageIcon,
  Tags,
  FileSearch,
  Layers,
  Copy,
  Check,
  Download,
  Clock,
  ExternalLink,
  AlertCircle,
  Save,
  FolderArchive,
  Link as LinkIcon,
  Loader2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { ScrapeResponse, ImageItem, EditableTextField } from '@/types';
import { MODE_MAP } from '@/modes';
import { saveScrape, downloadImagesZip, attachToParent, getHistory } from '@/api';

interface ResultViewProps {
  result: ScrapeResponse;
  onSaved?: (id?: string) => void;
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  };

  return (
    <button onClick={handleCopy} className="btn-ghost text-xs" title="Copy to clipboard">
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied!' : label || 'Copy'}
    </button>
  );
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadJSON(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function StatCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof FileText }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-dark-200 bg-white p-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div>
        <p className="text-xs text-dark-500">{label}</p>
        <p className="text-lg font-semibold text-dark-900">{value}</p>
      </div>
    </div>
  );
}

function ArticleResultView({ result }: { result: ScrapeResponse }) {
  const article = result.result?.article;
  if (!article) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Readability could not extract an article from this page. The content may not be article-shaped.
          Showing available metadata and links instead.
        </div>
        {result.result?.metadata && <MetadataView metadata={result.result.metadata} />}
        {result.result?.links && <LinksView links={result.result.links} />}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Words" value={article.length} icon={Type} />
        <StatCard label="Reading Time" value={`${article.readingTimeMinutes} min`} icon={Clock} />
        <StatCard label="Site" value={article.siteName || '—'} icon={FileText} />
        <StatCard label="Author" value={article.byline || '—'} icon={FileText} />
      </div>

      {article.excerpt && (
        <div className="rounded-lg border-l-4 border-primary-400 bg-primary-50 p-4">
          <p className="text-sm italic text-dark-700">{article.excerpt}</p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <h3 className="text-base font-semibold text-dark-900">Article Content</h3>
        <CopyButton text={article.textContent || ''} label="Copy text" />
        <button
          onClick={() => downloadText('article.txt', article.textContent || '')}
          className="btn-ghost text-xs"
        >
          <Download className="h-3.5 w-3.5" />
          Download
        </button>
      </div>

      {article.content && (
        <div
          className="article-content max-h-[600px] overflow-y-auto rounded-lg border border-dark-200 p-6 scrollbar-thin"
          dangerouslySetInnerHTML={{ __html: article.content }}
        />
      )}

      {result.result?.metadata && (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-primary-600 hover:text-primary-700">
            View page metadata
          </summary>
          <div className="mt-3">
            <MetadataView metadata={result.result.metadata} />
          </div>
        </details>
      )}
    </div>
  );
}

function TextResultView({ result }: { result: ScrapeResponse }) {
  const r = result.result;
  if (!r) return null;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Characters" value={r.textLength || 0} icon={Type} />
        <StatCard label="Words" value={r.wordCount || 0} icon={FileText} />
        <StatCard label="Headings" value={r.headings?.length || 0} icon={Layers} />
      </div>

      {r.headings && r.headings.length > 0 && (
        <div>
          <h3 className="mb-3 text-base font-semibold text-dark-900">Page Headings</h3>
          <div className="space-y-1">
            {r.headings.map((h, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-sm"
                style={{ paddingLeft: `${(h.level - 1) * 16}px` }}
              >
                <span className="rounded bg-dark-100 px-1.5 py-0.5 font-mono text-xs text-dark-500">
                  {h.tag}
                </span>
                <span className="text-dark-700">{h.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-base font-semibold text-dark-900">Full Page Text</h3>
          <CopyButton text={r.fullText || ''} label="Copy" />
          <button
            onClick={() => downloadText('page-text.txt', r.fullText || '')}
            className="btn-ghost text-xs"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </button>
        </div>
        <div className="max-h-[500px] overflow-y-auto rounded-lg border border-dark-200 bg-dark-50 p-4 font-mono text-sm leading-relaxed text-dark-700 scrollbar-thin">
          {r.fullText || 'No text found.'}
        </div>
      </div>

      {r.structured && r.structured.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-primary-600 hover:text-primary-700">
            View structured text blocks ({r.structured.length})
          </summary>
          <div className="mt-3 max-h-[400px] space-y-1.5 overflow-y-auto scrollbar-thin">
            {r.structured.map((block, i) => (
              <div key={i} className="rounded-md border border-dark-200 bg-white p-3">
                <span className="mb-1 inline-block rounded bg-dark-100 px-1.5 py-0.5 font-mono text-xs text-dark-500">
                  {block.tag}
                </span>
                <p className="text-sm text-dark-700">{block.text}</p>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function LinksView({ links }: { links: NonNullable<ScrapeResponse['result']>['links'] }) {
  if (!links) return null;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total Links" value={links.count} icon={Link2} />
        <StatCard label="Internal" value={links.internalCount} icon={Link2} />
        <StatCard label="External" value={links.externalCount} icon={ExternalLink} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-base font-semibold text-dark-900">Internal Links</h3>
            <CopyButton text={links.internal.join('\n')} label="Copy all" />
          </div>
          <div className="max-h-[400px] space-y-1.5 overflow-y-auto scrollbar-thin">
            {links.internal.length === 0 ? (
              <p className="text-sm text-dark-400">No internal links found.</p>
            ) : (
              links.internal.map((link, i) => (
                <a
                  key={i}
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-primary-600 transition-colors hover:bg-primary-50 hover:text-primary-700"
                >
                  <Link2 className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">{link}</span>
                </a>
              ))
            )}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-base font-semibold text-dark-900">External Links</h3>
            <CopyButton text={links.external.join('\n')} label="Copy all" />
          </div>
          <div className="max-h-[400px] space-y-1.5 overflow-y-auto scrollbar-thin">
            {links.external.length === 0 ? (
              <p className="text-sm text-dark-400">No external links found.</p>
            ) : (
              links.external.map((link, i) => (
                <a
                  key={i}
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-accent-600 transition-colors hover:bg-accent-50 hover:text-accent-700"
                >
                  <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">{link}</span>
                </a>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ImagesViewProps {
  images: NonNullable<ScrapeResponse['result']>['images'];
  sourceUrl: string;
}

function ImagesView({ images, sourceUrl }: ImagesViewProps) {
  const [zipping, setZipping] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);

  if (!images) return null;

  const handleZipDownload = async () => {
    setZipping(true);
    setZipError(null);
    try {
      const blob = await downloadImagesZip(images.images as ImageItem[], sourceUrl);
      let hostname = 'scrape';
      try { hostname = new URL(sourceUrl).hostname; } catch { /* keep default */ }
      downloadBlob(blob, `${hostname}-images.zip`);
    } catch (err) {
      setZipError(err instanceof Error ? err.message : 'Failed to download images');
    } finally {
      setZipping(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <StatCard label="Total Images" value={images.count} icon={ImageIcon} />
        {images.images.length > 0 && (
          <button
            onClick={handleZipDownload}
            disabled={zipping}
            className="btn-primary text-sm"
          >
            {zipping ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Zipping...
              </>
            ) : (
              <>
                <FolderArchive className="h-4 w-4" />
                Download All as ZIP
              </>
            )}
          </button>
        )}
      </div>

      {zipError && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {zipError}
        </div>
      )}

      {images.images.length === 0 ? (
        <p className="text-sm text-dark-400">No images found on this page.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {images.images.map((img, i) => (
              <div key={i} className="group card overflow-hidden">
                <div className="aspect-square overflow-hidden bg-dark-100">
                  <img
                    src={img.src}
                    alt={img.alt || ''}
                    loading="lazy"
                    className="h-full w-full object-contain transition-transform group-hover:scale-105"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
                <div className="p-2">
                  <p className="truncate text-xs text-dark-600" title={img.alt}>
                    {img.alt || 'No alt text'}
                  </p>
                  <a
                    href={img.src}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 block truncate text-xs text-primary-600 hover:text-primary-700"
                    title={img.src}
                  >
                    {img.src.split('/').pop() || img.src}
                  </a>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-center">
            <button
              onClick={handleZipDownload}
              disabled={zipping}
              className="btn-secondary"
            >
              {zipping ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Zipping {images.images.length} images...
                </>
              ) : (
                <>
                  <FolderArchive className="h-4 w-4" />
                  Download All Images as ZIP ({images.images.length})
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function MetadataView({ metadata }: { metadata: NonNullable<ScrapeResponse['result']>['metadata'] }) {
  if (!metadata) return null;
  const entries = Object.entries(metadata).filter(([, v]) => v !== null && v !== undefined && v !== '');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Links" value={entries.length} icon={Tags} />
        <StatCard label="Language" value={metadata.lang || '—'} icon={Tags} />
        <StatCard label="OG Type" value={metadata.ogType || '—'} icon={Tags} />
        <StatCard label="Site Name" value={metadata.ogSiteName || '—'} icon={Tags} />
      </div>

      <div className="overflow-hidden rounded-lg border border-dark-200">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-dark-100">
            {entries.map(([key, value]) => (
              <tr key={key} className="hover:bg-dark-50">
                <td className="w-40 flex-shrink-0 px-4 py-2.5 font-mono text-xs text-dark-500">
                  {key}
                </td>
                <td className="px-4 py-2.5 text-dark-700">
                  {key === 'ogImage' || key === 'twitterImage' || key === 'favicon' ? (
                    <a
                      href={String(value)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-600 hover:text-primary-700"
                    >
                      {String(value)}
                    </a>
                  ) : (
                    String(value)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {metadata.ogImage && (
        <div>
          <p className="mb-2 text-sm font-medium text-dark-700">Open Graph Image</p>
          <img
            src={metadata.ogImage}
            alt="Open Graph preview"
            className="max-w-sm rounded-lg border border-dark-200"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}
    </div>
  );
}

function PdfResultView({ result }: { result: ScrapeResponse }) {
  const r = result.result;
  if (!r) return null;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Pages" value={r.pages || 0} icon={FileSearch} />
        <StatCard label="Characters" value={r.text?.length || 0} icon={Type} />
        <StatCard label="Words" value={r.text?.split(/\s+/).filter(Boolean).length || 0} icon={FileText} />
      </div>

      {r.info && Object.keys(r.info).length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-primary-600 hover:text-primary-700">
            PDF metadata info
          </summary>
          <div className="mt-3 overflow-hidden rounded-lg border border-dark-200">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-dark-100">
                {Object.entries(r.info).map(([key, value]) => (
                  <tr key={key}>
                    <td className="w-40 px-4 py-2 font-mono text-xs text-dark-500">{key}</td>
                    <td className="px-4 py-2 text-dark-700">{String(value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <div>
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-base font-semibold text-dark-900">Extracted Text</h3>
          <CopyButton text={r.text || ''} label="Copy" />
          <button
            onClick={() => downloadText('pdf-text.txt', r.text || '')}
            className="btn-ghost text-xs"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </button>
        </div>
        <div className="max-h-[500px] overflow-y-auto rounded-lg border border-dark-200 bg-dark-50 p-4 font-mono text-sm leading-relaxed text-dark-700 scrollbar-thin">
          {r.text || 'No text could be extracted from this PDF.'}
        </div>
      </div>
    </div>
  );
}

function FullResultView({ result }: { result: ScrapeResponse }) {
  const r = result.result;
  if (!r) return null;

  // Recursive crawl results
  if (r.pages_crawled && r.pages_crawled.length > 0) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Pages Crawled" value={r.totalPages || r.pages_crawled.length} icon={Layers} />
          <StatCard label="Max Depth" value={r.maxDepth || 1} icon={Layers} />
          <StatCard label="Visited" value={r.visitedCount || r.pages_crawled.length} icon={FileText} />
          <StatCard label="Total Text" value={r.pages_crawled.reduce((s, p) => s + (p.textLength || 0), 0)} icon={Type} />
        </div>

        <div className="space-y-2">
          {r.pages_crawled.map((page, i) => (
            <div key={i} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <a
                    href={page.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-primary-600 hover:text-primary-700"
                  >
                    {page.title || page.url}
                  </a>
                  <p className="mt-0.5 truncate text-xs text-dark-500">{page.url}</p>
                  {page.error ? (
                    <p className="mt-2 text-xs text-red-600">{page.error}</p>
                  ) : (
                    <p className="mt-2 text-sm text-dark-600">
                      {page.textLength} chars — {page.textPreview?.slice(0, 200)}...
                    </p>
                  )}
                </div>
                {page.textLength && (
                  <span className="badge bg-primary-50 text-primary-700 flex-shrink-0">
                    {page.textLength} chars
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => downloadJSON('crawl-results.json', r)}
          className="btn-secondary"
        >
          <Download className="h-4 w-4" />
          Download Results (JSON)
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Words" value={r.wordCount || 0} icon={Type} />
        <StatCard label="Links" value={r.links?.count || 0} icon={Link2} />
        <StatCard label="Images" value={r.images?.count || 0} icon={ImageIcon} />
        <StatCard label="Headings" value={r.headings?.length || 0} icon={Layers} />
      </div>

      {r.article && r.article.textContent && (
        <details open className="group card p-4">
          <summary className="cursor-pointer text-base font-semibold text-dark-900">
            Article (Reader Mode)
          </summary>
          <div className="mt-4 space-y-3">
            {r.article.excerpt && (
              <p className="text-sm italic text-dark-600">{r.article.excerpt}</p>
            )}
            <div
              className="article-content max-h-[300px] overflow-y-auto scrollbar-thin"
              dangerouslySetInnerHTML={{ __html: r.article.content || '' }}
            />
          </div>
        </details>
      )}

      {r.metadata && (
        <details className="group card p-4">
          <summary className="cursor-pointer text-base font-semibold text-dark-900">
            Metadata & SEO
          </summary>
          <div className="mt-4">
            <MetadataView metadata={r.metadata} />
          </div>
        </details>
      )}

      {r.links && (
        <details className="group card p-4">
          <summary className="cursor-pointer text-base font-semibold text-dark-900">
            Links ({r.links.count})
          </summary>
          <div className="mt-4">
            <LinksView links={r.links} />
          </div>
        </details>
      )}

      {r.images && (
        <details className="group card p-4">
          <summary className="cursor-pointer text-base font-semibold text-dark-900">
            Images ({r.images.count})
          </summary>
          <div className="mt-4">
            <ImagesView images={r.images} sourceUrl={result.url} />
          </div>
        </details>
      )}

      <div>
        <div className="mb-3 flex items-center gap-2">
          <h3 className="text-base font-semibold text-dark-900">Full Page Text</h3>
          <CopyButton text={r.fullText || ''} label="Copy" />
          <button
            onClick={() => downloadJSON('full-scrape.json', r)}
            className="btn-ghost text-xs"
          >
            <Download className="h-3.5 w-3.5" />
            Download JSON
          </button>
        </div>
        <div className="max-h-[400px] overflow-y-auto rounded-lg border border-dark-200 bg-dark-50 p-4 font-mono text-sm leading-relaxed text-dark-700 scrollbar-thin">
          {r.fullText || 'No text found.'}
        </div>
      </div>
    </div>
  );
}

// Action bar at the bottom: Save to Database + Attach to Parent
interface ActionBarProps {
  result: ScrapeResponse;
  onSaved: (id?: string) => void;
}

function ActionBar({ result, onSaved }: ActionBarProps) {
  const edited = result as ScrapeResponse & { editedText?: EditableTextField[]; editedImages?: ImageItem[] };
  const [savedId, setSavedId] = useState<string | null>(result.id || null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const [showAttach, setShowAttach] = useState(false);
  const [parents, setParents] = useState<Array<{ _id: string; title: string | null; url: string }> | null>(null);
  const [loadingParents, setLoadingParents] = useState(false);
  const [selectedParent, setSelectedParent] = useState<string>('');
  const [attaching, setAttaching] = useState(false);
  const [attachMsg, setAttachMsg] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setSavedMsg(null);
    try {
      const res = await saveScrape({
        url: result.url,
        mode: result.mode,
        title: result.title,
        summary: result.summary,
        status: result.status,
        result: result.result,
        error: result.error,
        editedText: edited.editedText ?? undefined,
        editedImages: edited.editedImages ?? undefined,
      });
      setSavedId(res.id);
      setSavedMsg(`Saved! ID: ${res.id}`);
      onSaved(res.id);
    } catch (err) {
      setSavedMsg(`Error: ${err instanceof Error ? err.message : 'Save failed'}`);
    } finally {
      setSaving(false);
      setTimeout(() => setSavedMsg(null), 5000);
    }
  };

  const loadParents = async () => {
    setLoadingParents(true);
    try {
      const res = await getHistory(50, undefined, true);
      // Exclude self if already saved
      const filtered = res.history.filter((h) => h._id !== savedId);
      setParents(filtered.map((h) => ({ _id: h._id, title: h.title, url: h.url })));
    } catch {
      setParents([]);
    } finally {
      setLoadingParents(false);
    }
  };

  const handleAttach = async () => {
    if (!selectedParent || !savedId) return;
    setAttaching(true);
    setAttachMsg(null);
    try {
      await attachToParent(savedId, selectedParent);
      setAttachMsg('Successfully attached to parent!');
      setShowAttach(false);
      onSaved(savedId);
    } catch (err) {
      setAttachMsg(`Error: ${err instanceof Error ? err.message : 'Attach failed'}`);
    } finally {
      setAttaching(false);
      setTimeout(() => setAttachMsg(null), 5000);
    }
  };

  const toggleAttach = () => {
    if (!showAttach && !parents) {
      loadParents();
    }
    setShowAttach(!showAttach);
  };

  return (
    <div className="mt-6 border-t border-dark-200 pt-6">
      <div className="flex flex-wrap items-center gap-3">
        {/* Save to Database */}
        {savedId ? (
          <span className="badge bg-emerald-50 text-emerald-700">
            <Check className="h-3.5 w-3.5" />
            Saved to Database
            <span className="ml-1 font-mono text-xs opacity-70">({savedId.slice(-8)})</span>
          </span>
        ) : (
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save to Database
              </>
            )}
          </button>
        )}

        {/* Attach to Parent (only if saved) */}
        {savedId && (
          <button onClick={toggleAttach} className="btn-secondary text-sm">
            <LinkIcon className="h-4 w-4" />
            Attach to Parent
            {showAttach ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        )}

        {/* Status messages */}
        {savedMsg && (
          <span className={`text-sm ${savedMsg.startsWith('Error') ? 'text-red-600' : 'text-emerald-600'}`}>
            {savedMsg}
          </span>
        )}
        {attachMsg && (
          <span className={`text-sm ${attachMsg.startsWith('Error') ? 'text-red-600' : 'text-emerald-600'}`}>
            {attachMsg}
          </span>
        )}
      </div>

      {/* Attach to Parent panel */}
      {showAttach && savedId && (
        <div className="mt-4 rounded-lg border border-dark-200 bg-dark-50 p-4 animate-slide-up">
          <p className="mb-3 text-sm font-medium text-dark-700">
            Select a parent record to attach this scrape as a child:
          </p>
          {loadingParents ? (
            <div className="flex items-center gap-2 text-sm text-dark-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading saved records...
            </div>
          ) : parents && parents.length === 0 ? (
            <p className="text-sm text-dark-500">
              No parent records available. Save another scrape first, then attach this one to it.
            </p>
          ) : (
            <>
              <select
                value={selectedParent}
                onChange={(e) => setSelectedParent(e.target.value)}
                className="input-field text-sm"
              >
                <option value="">— Select a parent record —</option>
                {parents?.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.title || p.url} ({p._id.slice(-8)})
                  </option>
                ))}
              </select>
              <button
                onClick={handleAttach}
                disabled={!selectedParent || attaching}
                className="btn-primary mt-3 text-sm"
              >
                {attaching ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Attaching...
                  </>
                ) : (
                  <>
                    <LinkIcon className="h-4 w-4" />
                    Confirm Attachment
                  </>
                )}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function ResultView({ result, onSaved }: ResultViewProps) {
  const modeConfig = MODE_MAP[result.mode];
  const Icon = modeConfig?.icon || FileText;

  if (result.status === 'error') {
    return (
      <div className="card animate-slide-up p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-red-50">
            <AlertCircle className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-dark-900">Scrape Failed</h3>
            <p className="mt-1 text-sm text-red-600">{result.error || 'An error occurred during scraping.'}</p>
            <p className="mt-2 text-xs text-dark-500">URL: {result.url}</p>
          </div>
        </div>
      </div>
    );
  }

  const renderResult = () => {
    switch (result.mode) {
      case 'article':
        return <ArticleResultView result={result} />;
      case 'text':
        return <TextResultView result={result} />;
      case 'links':
        return result.result?.links ? <LinksView links={result.result.links} /> : null;
      case 'images':
        return result.result?.images ? <ImagesView images={result.result.images} sourceUrl={result.url} /> : null;
      case 'metadata':
        return result.result?.metadata ? <MetadataView metadata={result.result.metadata} /> : null;
      case 'pdf':
        return <PdfResultView result={result} />;
      case 'full':
        return <FullResultView result={result} />;
      default:
        return null;
    }
  };

  return (
    <div className="card animate-slide-up p-6 sm:p-8">
      <div className="mb-6 flex items-start justify-between gap-4 border-b border-dark-200 pb-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-dark-900">{result.title || result.url}</h2>
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 flex items-center gap-1 truncate text-sm text-primary-600 hover:text-primary-700"
            >
              <ExternalLink className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{result.url}</span>
            </a>
          </div>
        </div>
        <span className="badge bg-emerald-50 text-emerald-700 flex-shrink-0">
          <Check className="h-3 w-3" />
          Success
        </span>
      </div>

      {result.summary && (
        <p className="mb-6 rounded-lg bg-dark-50 px-4 py-3 text-sm text-dark-600">{result.summary}</p>
      )}

      {renderResult()}

      <ActionBar result={result} onSaved={onSaved || (() => {})} />
    </div>
  );
}
