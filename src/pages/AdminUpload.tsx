import { useState, useEffect, useCallback } from 'react';
import { Upload, Loader2, Plus, X, Image as ImageIcon, Save, FileText, Check } from 'lucide-react';
import { listSeries, createChapter, setChapterPages, storeImageForChapter, storeCoverImage, updateSeries } from '@/lib/dataAccess';
import type { SeriesWithGenres } from '@/types';

export default function AdminUpload() {
  const [seriesList, setSeriesList] = useState<SeriesWithGenres[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSeries, setSelectedSeries] = useState<string>('');
  const [chapterNumber, setChapterNumber] = useState('');
  const [chapterTitle, setChapterTitle] = useState('');
  const [chapterStatus, setChapterStatus] = useState<'draft' | 'published'>('draft');
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coverMode, setCoverMode] = useState(false);
  const [coverFile, setCoverFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSeriesList(await listSeries({ limit: 100 }));
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    selected.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    setFiles(selected);
  };

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCoverFile(e.target.files?.[0] ?? null);
  };

  const handleUpload = async () => {
    setError(null);
    setResult(null);
    if (!selectedSeries) { setError('Select a series.'); return; }
    if (coverMode) {
      if (!coverFile) { setError('Select a cover image.'); return; }
      setUploading(true);
      try {
        const path = await storeCoverImage(selectedSeries, coverFile);
        await updateSeries(selectedSeries, { cover_image_path: path });
        setResult('Cover image uploaded successfully!');
        setCoverFile(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed.');
      } finally {
        setUploading(false);
      }
      return;
    }
    if (!chapterNumber) { setError('Enter a chapter number.'); return; }
    if (files.length === 0) { setError('Select at least one page image.'); return; }
    setUploading(true);
    try {
      const slug = `chapter-${chapterNumber}`;
      let chapter = await createChapter(selectedSeries, {
        chapter_number: parseFloat(chapterNumber),
        title: chapterTitle || undefined,
        slug,
        status: chapterStatus,
      });
      const pages: Array<{ page_number: number; image_path: string; width?: number; height?: number }> = [];
      for (let i = 0; i < files.length; i++) {
        const pageData = await storeImageForChapter(selectedSeries, chapter.id, i + 1, files[i]);
        pages.push({ page_number: i + 1, ...pageData });
      }
      chapter = await setChapterPages(chapter.id, pages) ?? chapter;
      setResult(`Chapter ${chapterNumber} uploaded with ${files.length} pages!`);
      setChapterNumber('');
      setChapterTitle('');
      setFiles([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-brand-500" /></div>;

  return (
    <div className="mx-auto max-w-3xl animate-fade-in">
      <h1 className="mb-6 flex items-center gap-2 text-2xl font-bold text-ink-100"><Upload className="h-6 w-6 text-brand-500" /> Upload Content</h1>

      {error && <div className="mb-4 rounded-lg bg-accent-600/10 px-4 py-3 text-sm text-accent-400">{error}</div>}
      {result && <div className="mb-4 flex items-center gap-2 rounded-lg bg-success-600/10 px-4 py-3 text-sm text-success-400"><Check className="h-4 w-4" /> {result}</div>}

      <div className="card p-6">
        <div className="mb-4">
          <label className="label">Series</label>
          <select value={selectedSeries} onChange={(e) => setSelectedSeries(e.target.value)} className="input-field">
            <option value="">Select a series...</option>
            {seriesList.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </div>

        <div className="mb-4 flex gap-2">
          <button onClick={() => setCoverMode(false)} className={!coverMode ? 'btn-primary' : 'btn-secondary'}>
            <FileText className="h-4 w-4" /> Chapter Pages
          </button>
          <button onClick={() => setCoverMode(true)} className={coverMode ? 'btn-primary' : 'btn-secondary'}>
            <ImageIcon className="h-4 w-4" /> Cover Image
          </button>
        </div>

        {coverMode ? (
          <div className="space-y-4">
            <div>
              <label className="label">Cover Image</label>
              <input type="file" accept="image/*" onChange={handleCoverChange} className="input-field" />
              {coverFile && <p className="mt-2 text-sm text-ink-400">{coverFile.name} ({(coverFile.size / 1024).toFixed(0)} KB)</p>}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Chapter Number</label>
                <input type="number" step="0.01" value={chapterNumber} onChange={(e) => setChapterNumber(e.target.value)} className="input-field" placeholder="1" />
              </div>
              <div>
                <label className="label">Chapter Title (optional)</label>
                <input value={chapterTitle} onChange={(e) => setChapterTitle(e.target.value)} className="input-field" placeholder="The Beginning" />
              </div>
            </div>
            <div>
              <label className="label">Status</label>
              <select value={chapterStatus} onChange={(e) => setChapterStatus(e.target.value as 'draft' | 'published')} className="input-field">
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </div>
            <div>
              <label className="label">Page Images</label>
              <input type="file" accept="image/*" multiple onChange={handleFileChange} className="input-field" />
              {files.length > 0 && (
                <div className="mt-3 space-y-1">
                  <p className="text-sm text-ink-400">{files.length} pages selected (sorted by name):</p>
                  {files.slice(0, 5).map((f, i) => <p key={i} className="text-xs text-ink-500">{i + 1}. {f.name}</p>)}
                  {files.length > 5 && <p className="text-xs text-ink-500">...and {files.length - 5} more</p>}
                </div>
              )}
            </div>
          </div>
        )}

        <button onClick={handleUpload} disabled={uploading} className="btn-primary mt-6">
          {uploading ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading...</> : <><Save className="h-4 w-4" /> Upload</>}
        </button>
      </div>
    </div>
  );
}
