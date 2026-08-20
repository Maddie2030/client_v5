import { useEffect, useState } from "react";
import { Upload, FileArchive } from "lucide-react";
import { api } from "../api/client";

export default function AdminUpload() {
  const [seriesList, setSeriesList] = useState([]);
  const [selectedSeries, setSelectedSeries] = useState("");
  const [chapterSlug, setChapterSlug] = useState("");
  const [chapterNumber, setChapterNumber] = useState("");
  const [chapterTitle, setChapterTitle] = useState("");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.listSeries("?limit=100").then(setSeriesList).catch(() => {});
  }, []);

  const handleUpload = async (e) => {
    e.preventDefault();
    setError("");
    setResult(null);
    if (!selectedSeries || !chapterSlug || !file) {
      setError("Please select a series, enter a chapter slug, and choose a file.");
      return;
    }
    setUploading(true);
    try {
      const series = seriesList.find((s) => s.id === selectedSeries);
      const uploadResult = await api.uploadChapter(
        series.slug, chapterSlug, file,
        parseFloat(chapterNumber) || 1,
        chapterTitle || null,
      );
      setResult(uploadResult);
    } catch (err) {
      setError(err?.detail || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 animate-fade-in">
      <h1 className="text-2xl font-bold text-ink-50 mb-6 flex items-center gap-2">
        <Upload size={22} /> Upload Chapter
      </h1>

      {error && <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-2 mb-4 text-sm">{error}</div>}
      {result && (
        <div className="bg-green-900/30 border border-green-700 text-green-300 rounded-lg px-4 py-3 mb-4 text-sm">
          Successfully uploaded {result.page_count} pages ({(result.total_size_bytes / 1024 / 1024).toFixed(1)} MB)
        </div>
      )}

      <form onSubmit={handleUpload} className="bg-ink-900 border border-ink-800 rounded-xl p-6 space-y-4">
        <div>
          <label className="block text-sm text-ink-300 mb-1">Series</label>
          <select value={selectedSeries} onChange={(e) => setSelectedSeries(e.target.value)} required className="w-full bg-ink-800 border border-ink-700 rounded-lg px-4 py-2.5 text-ink-100 focus:outline-none focus:border-brand-500">
            <option value="">Select a series...</option>
            {seriesList.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-ink-300 mb-1">Chapter number</label>
            <input type="number" step="0.01" value={chapterNumber} onChange={(e) => setChapterNumber(e.target.value)} required className="w-full bg-ink-800 border border-ink-700 rounded-lg px-4 py-2.5 text-ink-100 focus:outline-none focus:border-brand-500" />
          </div>
          <div>
            <label className="block text-sm text-ink-300 mb-1">Chapter slug</label>
            <input type="text" placeholder="chapter-1" value={chapterSlug} onChange={(e) => setChapterSlug(e.target.value)} required pattern="[a-z0-9\-]+" className="w-full bg-ink-800 border border-ink-700 rounded-lg px-4 py-2.5 text-ink-100 focus:outline-none focus:border-brand-500" />
          </div>
        </div>

        <div>
          <label className="block text-sm text-ink-300 mb-1">Chapter title (optional)</label>
          <input type="text" value={chapterTitle} onChange={(e) => setChapterTitle(e.target.value)} className="w-full bg-ink-800 border border-ink-700 rounded-lg px-4 py-2.5 text-ink-100 focus:outline-none focus:border-brand-500" />
        </div>

        <div>
          <label className="block text-sm text-ink-300 mb-1">ZIP/CBZ archive</label>
          <div className="border-2 border-dashed border-ink-700 rounded-lg p-6 text-center hover:border-brand-500 transition-colors">
            <FileArchive size={32} className="mx-auto text-ink-500 mb-2" />
            <input type="file" accept=".zip,.cbz,application/zip" onChange={(e) => setFile(e.target.files[0])} required className="text-sm text-ink-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-brand-600 file:text-white file:cursor-pointer" />
            {file && <p className="text-xs text-ink-500 mt-2">{file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)</p>}
          </div>
        </div>

        <button type="submit" disabled={uploading} className="w-full bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors">
          {uploading ? "Uploading..." : "Upload & Publish"}
        </button>
      </form>
    </div>
  );
}
