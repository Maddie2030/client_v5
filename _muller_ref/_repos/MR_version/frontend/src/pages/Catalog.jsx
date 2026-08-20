import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Search, Filter } from "lucide-react";
import { api } from "../api/client";

export default function Catalog() {
  const [series, setSeries] = useState([]);
  const [genres, setGenres] = useState([]);
  const [search, setSearch] = useState("");
  const [activeGenre, setActiveGenre] = useState(null);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const fetchSeries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (activeGenre) params.set("genre", activeGenre);
      params.set("offset", offset);
      params.set("limit", limit);
      const data = await api.listSeries(`?${params.toString()}`);
      setSeries(data);
    } catch {
      setSeries([]);
    } finally {
      setLoading(false);
    }
  }, [search, activeGenre, offset]);

  useEffect(() => {
    api.getGenres().then(setGenres).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(fetchSeries, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchSeries]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-ink-50 mb-2">Browse Series</h1>
        <p className="text-ink-400">Discover your next favorite manhwa</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
          <input
            type="text"
            placeholder="Search by title or description..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
            className="w-full bg-ink-900 border border-ink-700 rounded-lg pl-10 pr-4 py-2.5 text-ink-100 placeholder-ink-500 focus:outline-none focus:border-brand-500 transition-colors"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => { setActiveGenre(null); setOffset(0); }}
            className={`px-3 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${!activeGenre ? "bg-brand-600 text-white" : "bg-ink-900 text-ink-300 hover:bg-ink-800"}`}
          >
            All
          </button>
          {genres.map((g) => (
            <button
              key={g.id}
              onClick={() => { setActiveGenre(g.id); setOffset(0); }}
              className={`px-3 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${activeGenre === g.id ? "bg-brand-600 text-white" : "bg-ink-900 text-ink-300 hover:bg-ink-800"}`}
            >
              {g.name}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="skeleton rounded-xl aspect-[2/3]" />
          ))}
        </div>
      ) : series.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-ink-400 text-lg">No series found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 animate-fade-in">
          {series.map((s) => (
            <Link key={s.id} to={`/series/${s.slug}`} className="group">
              <div className="relative rounded-xl overflow-hidden bg-ink-900 aspect-[2/3] mb-2 border border-ink-800 group-hover:border-brand-500 transition-colors">
                {s.cover_image_path ? (
                  <img src={`/images/${s.cover_image_path}`} alt={s.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-ink-600">
                    <span className="text-4xl font-bold">{s.title[0]}</span>
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-ink-950 to-transparent p-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${s.status === "ongoing" ? "bg-green-600" : s.status === "completed" ? "bg-blue-600" : "bg-yellow-600"} text-white`}>
                    {s.status}
                  </span>
                </div>
              </div>
              <h3 className="text-sm font-medium text-ink-200 group-hover:text-brand-400 transition-colors line-clamp-2">{s.title}</h3>
            </Link>
          ))}
        </div>
      )}

      {!loading && series.length > 0 && (
        <div className="flex items-center justify-center gap-3 mt-8">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
            className="px-4 py-2 bg-ink-900 text-ink-300 rounded-lg disabled:opacity-40 hover:bg-ink-800 transition-colors"
          >
            Previous
          </button>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={series.length < limit}
            className="px-4 py-2 bg-ink-900 text-ink-300 rounded-lg disabled:opacity-40 hover:bg-ink-800 transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
