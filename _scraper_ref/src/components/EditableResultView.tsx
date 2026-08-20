import { useState, useMemo, useCallback } from 'react';
import {
  Pencil,
  Eye,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Save,
  Loader2,
  Check,
  FolderArchive,
  Image as ImageIcon,
  Type,
  AlertCircle,
  ExternalLink,
  GripVertical,
} from 'lucide-react';
import type { ScrapeResponse, ImageItem, EditableTextField } from '@/types';
import ResultView from '@/components/ResultView';
import { editRecord, downloadImagesZip } from '@/api';

interface EditableResultViewProps {
  result: ScrapeResponse;
  savedId: string | null;
  onSaved: (id?: string) => void;
  onResultChange: (next: ScrapeResponse) => void;
}

function uid() {
  return `f-${Math.random().toString(36).slice(2, 10)}`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function EditableResultView({
  result,
  savedId,
  onSaved,
  onResultChange,
}: EditableResultViewProps) {
  const [editing, setEditing] = useState(false);
  const [textFields, setTextFields] = useState<EditableTextField[]>([]);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [newImageAlt, setNewImageAlt] = useState('');

  const originalImages = useMemo<ImageItem[]>(
    () => result.result?.images?.images ?? [],
    [result.result?.images?.images],
  );

  const originalTextFields = useMemo<EditableTextField[]>(() => {
    const r = result.result;
    if (!r) return [];
    const fields: EditableTextField[] = [];
    if (r.metadata?.title) fields.push({ id: uid(), key: 'Title', value: r.metadata.title });
    if (r.metadata?.description) fields.push({ id: uid(), key: 'Description', value: r.metadata.description });
    if (r.article?.title) fields.push({ id: uid(), key: 'Article Title', value: r.article.title });
    if (r.article?.byline) fields.push({ id: uid(), key: 'Author', value: r.article.byline });
    if (r.article?.excerpt) fields.push({ id: uid(), key: 'Excerpt', value: r.article.excerpt });
    if (r.structured) {
      r.structured.forEach((b, i) => {
        if (b.text && b.text.length > 1) fields.push({ id: `s-${i}`, key: b.tag, value: b.text });
      });
    }
    if (r.fullText && !r.structured?.length) {
      fields.push({ id: uid(), key: 'Full Text', value: r.fullText });
    }
    if (r.headings) {
      r.headings.forEach((h, i) => {
        fields.push({ id: `h-${i}`, key: `H${h.level}`, value: h.text });
      });
    }
    return fields.slice(0, 40);
  }, [result.result]);

  const enterEdit = useCallback(() => {
    const edited = result as unknown as { editedText?: EditableTextField[]; editedImages?: ImageItem[] };
    setTextFields((edited.editedText ?? originalTextFields).map((f) => ({ ...f })));
    setImages((edited.editedImages ?? originalImages).map((img) => ({ ...img })));
    setSaveError(null);
    setSavedOk(false);
    setEditing(true);
  }, [originalImages, originalTextFields, result]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setSaveError(null);
  }, []);

  const updateField = useCallback((id: string, value: string) => {
    setTextFields((prev) => prev.map((f) => (f.id === id ? { ...f, value } : f)));
  }, []);

  const updateFieldKey = useCallback((id: string, key: string) => {
    setTextFields((prev) => prev.map((f) => (f.id === id ? { ...f, key } : f)));
  }, []);

  const removeField = useCallback((id: string) => {
    setTextFields((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const moveField = useCallback((id: string, dir: -1 | 1) => {
    setTextFields((prev) => {
      const idx = prev.findIndex((f) => f.id === id);
      if (idx < 0) return prev;
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(next, 0, item);
      return copy;
    });
  }, []);

  const addField = useCallback(() => {
    setTextFields((prev) => [...prev, { id: uid(), key: 'New Field', value: '' }]);
  }, []);

  const addImage = useCallback(() => {
    const url = newImageUrl.trim();
    if (!url) return;
    setImages((prev) => [...prev, { src: url, alt: newImageAlt.trim(), width: null, height: null }]);
    setNewImageUrl('');
    setNewImageAlt('');
  }, [newImageUrl, newImageAlt]);

  const removeImage = useCallback((index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const moveImage = useCallback((index: number, dir: -1 | 1) => {
    setImages((prev) => {
      const next = index + dir;
      if (next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(next, 0, item);
      return copy;
    });
  }, []);

  const handleSaveEdits = useCallback(async () => {
    if (!savedId) {
      setSaveError('Save the record to the database first, then edit it.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await editRecord(savedId, { editedText: textFields, editedImages: images });
      const next = { ...result } as ScrapeResponse & { editedText?: EditableTextField[]; editedImages?: ImageItem[] };
      next.editedText = textFields;
      next.editedImages = images;
      onResultChange(next);
      onSaved();
      setSavedOk(true);
      setEditing(false);
      setTimeout(() => setSavedOk(false), 4000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save edits');
    } finally {
      setSaving(false);
    }
  }, [images, onResultChange, onSaved, result, savedId, textFields]);

  const handleZipDownload = useCallback(async () => {
    setZipping(true);
    try {
      const blob = await downloadImagesZip(images, result.url);
      let hostname = 'scrape';
      try { hostname = new URL(result.url).hostname; } catch { /* default */ }
      downloadBlob(blob, `${hostname}-images.zip`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to download images');
    } finally {
      setZipping(false);
    }
  }, [images, result.url]);

  return (
    <div className="space-y-4">
      {/* Mode toggle bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dark-200 bg-white px-4 py-3">
        <div className="mr-auto flex items-center gap-2 text-sm font-medium text-dark-700">
          {editing ? (
            <>
              <Pencil className="h-4 w-4 text-primary-600" />
              Edit Mode — add, remove, or reorder items before saving
            </>
          ) : (
            <>
              <Eye className="h-4 w-4 text-dark-500" />
              View Mode — read-only
            </>
          )}
        </div>
        <button
          onClick={() => (editing ? cancelEdit() : enterEdit())}
          className={editing ? 'btn-secondary text-sm' : 'btn-primary text-sm'}
        >
          {editing ? (
            <>
              <Eye className="h-4 w-4" />
              Done Editing
            </>
          ) : (
            <>
              <Pencil className="h-4 w-4" />
              Edit Data
            </>
          )}
        </button>
        {savedOk && (
          <span className="badge bg-emerald-50 text-emerald-700">
            <Check className="h-3.5 w-3.5" />
            Edits saved
          </span>
        )}
      </div>

      {saveError && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {saveError}
        </div>
      )}

      {!editing ? (
        <ResultView result={result} onSaved={onSaved} />
      ) : (
        <div className="card animate-slide-up p-6 space-y-8">
          {/* Text fields editor */}
          <section>
            <div className="mb-4 flex items-center gap-2">
              <Type className="h-5 w-5 text-primary-600" />
              <h3 className="text-base font-semibold text-dark-900">Text Fields</h3>
              <span className="badge bg-dark-100 text-dark-600">{textFields.length}</span>
              <button onClick={addField} className="btn-ghost ml-auto text-xs">
                <Plus className="h-3.5 w-3.5" />
                Add Field
              </button>
            </div>
            {textFields.length === 0 ? (
              <p className="text-sm text-dark-400">No text fields. Click "Add Field" to create one.</p>
            ) : (
              <div className="space-y-2.5">
                {textFields.map((f, i) => (
                  <div key={f.id} className="flex items-start gap-2 rounded-lg border border-dark-200 bg-dark-50/50 p-3">
                    <div className="flex flex-col items-center pt-1">
                      <span className="mb-1 flex h-6 w-6 items-center justify-center rounded-md bg-primary-100 text-xs font-bold text-primary-700">
                        {i + 1}
                      </span>
                      <GripVertical className="h-3 w-3 text-dark-300" />
                    </div>
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        value={f.key}
                        onChange={(e) => updateFieldKey(f.id, e.target.value)}
                        className="w-full rounded-md border border-dark-200 bg-white px-2.5 py-1.5 text-xs font-medium text-dark-700 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        placeholder="Field label"
                      />
                      <textarea
                        value={f.value}
                        onChange={(e) => updateField(f.id, e.target.value)}
                        rows={2}
                        className="w-full rounded-md border border-dark-200 bg-white px-2.5 py-1.5 text-sm text-dark-800 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                        placeholder="Field value"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => moveField(f.id, -1)}
                        disabled={i === 0}
                        className="rounded p-1 text-dark-400 transition-colors hover:bg-dark-100 hover:text-dark-700 disabled:opacity-30"
                        title="Move up"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => moveField(f.id, 1)}
                        disabled={i === textFields.length - 1}
                        className="rounded p-1 text-dark-400 transition-colors hover:bg-dark-100 hover:text-dark-700 disabled:opacity-30"
                        title="Move down"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => removeField(f.id)}
                        className="rounded p-1 text-dark-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        title="Remove field"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Image editor */}
          <section>
            <div className="mb-4 flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-accent-600" />
              <h3 className="text-base font-semibold text-dark-900">Images</h3>
              <span className="badge bg-dark-100 text-dark-600">{images.length}</span>
              <button
                onClick={handleZipDownload}
                disabled={zipping || images.length === 0}
                className="btn-secondary ml-auto text-xs"
              >
                {zipping ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Zipping...
                  </>
                ) : (
                  <>
                    <FolderArchive className="h-3.5 w-3.5" />
                    Download ZIP
                  </>
                )}
              </button>
            </div>

            {/* Add image form */}
            <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-dark-200 bg-dark-50/50 p-3">
              <div className="flex-1">
                <label className="mb-1 block text-xs text-dark-500">Image URL</label>
                <input
                  type="url"
                  value={newImageUrl}
                  onChange={(e) => setNewImageUrl(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                  className="w-full rounded-md border border-dark-200 bg-white px-2.5 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />
              </div>
              <div className="w-40">
                <label className="mb-1 block text-xs text-dark-500">Alt text</label>
                <input
                  type="text"
                  value={newImageAlt}
                  onChange={(e) => setNewImageAlt(e.target.value)}
                  placeholder="Description"
                  className="w-full rounded-md border border-dark-200 bg-white px-2.5 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />
              </div>
              <button onClick={addImage} disabled={!newImageUrl.trim()} className="btn-primary text-xs">
                <Plus className="h-3.5 w-3.5" />
                Add
              </button>
            </div>

            {images.length === 0 ? (
              <p className="text-sm text-dark-400">No images. Add an image URL above.</p>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {images.map((img, i) => (
                  <div key={`${img.src}-${i}`} className="group relative card overflow-hidden">
                    {/* Position badge */}
                    <div className="absolute left-2 top-2 z-10 flex h-7 min-w-7 items-center justify-center rounded-full bg-primary-600 px-2 text-xs font-bold text-white shadow">
                      #{i + 1}
                    </div>
                    <div className="aspect-square overflow-hidden bg-dark-100">
                      <img
                        src={img.src}
                        alt={img.alt || ''}
                        loading="lazy"
                        className="h-full w-full object-contain transition-transform group-hover:scale-105"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.opacity = '0.3';
                        }}
                      />
                    </div>
                    <div className="p-2">
                      <input
                        type="text"
                        value={img.alt}
                        onChange={(e) =>
                          setImages((prev) =>
                            prev.map((x, idx) => (idx === i ? { ...x, alt: e.target.value } : x)),
                          )
                        }
                        placeholder="Alt text"
                        className="mb-1 w-full truncate rounded border border-dark-200 bg-white px-1.5 py-1 text-xs text-dark-700 focus:border-primary-500 focus:outline-none"
                      />
                      <a
                        href={img.src}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 truncate text-xs text-primary-600 hover:text-primary-700"
                        title={img.src}
                      >
                        <ExternalLink className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{img.src.split('/').pop() || img.src}</span>
                      </a>
                    </div>
                    {/* Controls */}
                    <div className="absolute right-2 top-2 z-10 flex flex-col gap-1">
                      <button
                        onClick={() => moveImage(i, -1)}
                        disabled={i === 0}
                        className="rounded bg-white/90 p-1 text-dark-600 shadow transition-colors hover:bg-white hover:text-dark-900 disabled:opacity-30"
                        title="Move up"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => moveImage(i, 1)}
                        disabled={i === images.length - 1}
                        className="rounded bg-white/90 p-1 text-dark-600 shadow transition-colors hover:bg-white hover:text-dark-900 disabled:opacity-30"
                        title="Move down"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => removeImage(i)}
                        className="rounded bg-white/90 p-1 text-red-500 shadow transition-colors hover:bg-white hover:text-red-600"
                        title="Remove image"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Save bar */}
          <div className="flex flex-wrap items-center gap-3 border-t border-dark-200 pt-4">
            <button onClick={handleSaveEdits} disabled={saving || !savedId} className="btn-primary text-sm">
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save Edits to Database
                </>
              )}
            </button>
            <button onClick={cancelEdit} className="btn-secondary text-sm">
              Cancel
            </button>
            {!savedId && (
              <span className="text-xs text-amber-700">
                Save the record first (below) to enable editing.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
