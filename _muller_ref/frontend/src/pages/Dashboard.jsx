import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, Bell, BookOpen, Bookmark, ChevronLeft, ChevronRight,
  Clock3, History, RefreshCw, Sparkles, Star, TrendingUp,
} from "lucide-react";
import { api } from "../api/client";

const cover = (item) => item.cover_image_path || item.series_cover;
const title = (item) => item.title || item.series_title || "Untitled series";
const slug = (item) => item.slug || item.series_slug;
const rating = (item) => item.rating ?? item.average_rating ?? item.score ?? null;
const statusLabel = (value) => String(value || "series").replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const statusClass = (value) => ({
  ongoing: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  completed: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  hiatus: "border-amber-400/30 bg-amber-400/10 text-amber-300",
}[value] || "border-brand-400/30 bg-brand-400/10 text-brand-300");

export default function Dashboard() {
  const [catalog, setCatalog] = useState({ popular: [], recent: [], new: [] });
  const [catalogState, setCatalogState] = useState("loading");
  const [account, setAccount] = useState({ bookmarks: [], subscriptions: [], history: [] });
  const [accountLoading, setAccountLoading] = useState(true);
  const [tab, setTab] = useState("discover");

  const loadCatalog = () => {
    setCatalogState("loading");
    Promise.all([
      api.listSeries("?offset=0&limit=18"),
      api.listSeries("?offset=18&limit=18"),
      api.listSeries("?offset=36&limit=18"),
    ]).then(([popular, recent, fresh]) => {
      const list = (value) => Array.isArray(value) ? value : value?.items || value?.series || [];
      const all = [...list(popular), ...list(recent), ...list(fresh)].filter((item, index, items) => (
        items.findIndex((candidate) => candidate.id === item.id || candidate.slug === item.slug) === index
      ));
      setCatalog({
        popular: [...all].sort((a, b) => (
          Number(rating(b) || 0) - Number(rating(a) || 0)
          || new Date(b.updated_at || 0) - new Date(a.updated_at || 0)
        )).slice(0, 18),
        recent: [...all].sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0)).slice(0, 18),
        new: [...all].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 18),
      });
      setCatalogState("ready");
    }).catch(() => setCatalogState("error"));
  };

  useEffect(() => {
    loadCatalog();
    Promise.all([
      api.listBookmarks().catch(() => []),
      api.listSubscriptions().catch(() => []),
      api.getHistory().catch(() => []),
    ]).then(([bookmarks, subscriptions, history]) => {
      setAccount({ bookmarks, subscriptions, history });
      setAccountLoading(false);
    });
  }, []);

  const tabs = [
    { id: "discover", label: "Discover", icon: <Sparkles size={16} /> },
    { id: "bookmarks", label: "Bookmarks", icon: <Bookmark size={16} />, count: account.bookmarks.length },
    { id: "subscriptions", label: "Subscriptions", icon: <Bell size={16} />, count: account.subscriptions.length },
    { id: "history", label: "History", icon: <History size={16} />, count: account.history.length },
  ];

  return (
    <main className="min-h-[100dvh] bg-ink-950 pb-16 text-ink-100">
      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-7 lg:px-10">
        <header className="mb-8 flex items-end justify-between gap-4">
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-brand-400">
              <span className="h-px w-6 bg-brand-400" /> Your reading shelf
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-ink-50 sm:text-4xl">Find your next <span className="text-brand-400">chapter.</span></h1>
          </div>
          <div className="hidden rounded-full border border-ink-800 bg-ink-900/70 px-3 py-1.5 text-xs text-ink-400 sm:block">
            <Clock3 className="mr-1.5 inline-block text-brand-400" size={14} /> A quiet place to read
          </div>
        </header>

        <nav className="mb-8 flex gap-1 overflow-x-auto border-b border-ink-800/80" aria-label="Dashboard sections">
          {tabs.map((item) => (
            <button key={item.id} type="button" onClick={() => setTab(item.id)}
              aria-pressed={tab === item.id} data-testid={`button-tab-${item.id}`}
              className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${tab === item.id ? "border-brand-400 text-brand-300" : "border-transparent text-ink-500 hover:text-ink-200"}`}>
              {item.icon}{item.label}
              {item.count !== undefined && <span className="rounded-full bg-ink-800 px-2 py-0.5 text-[11px] text-ink-400">{item.count}</span>}
            </button>
          ))}
        </nav>

        {tab === "discover" && <Discovery catalog={catalog} state={catalogState} retry={loadCatalog} />}
        {tab === "bookmarks" && (accountLoading ? <GridSkeleton /> : <SeriesGrid items={account.bookmarks} emptyText="Stories you save will wait here." />)}
        {tab === "subscriptions" && (accountLoading ? <GridSkeleton /> : <SeriesGrid items={account.subscriptions} emptyText="Subscribe to a series to keep its new chapters close." showUnread />)}
        {tab === "history" && (accountLoading ? <ListSkeleton /> : <HistoryList items={account.history} />)}
      </div>
    </main>
  );
}

function Discovery({ catalog, state, retry }) {
  const featured = useMemo(() => [...catalog.popular, ...catalog.recent].filter((item, index, arr) => arr.findIndex((x) => x.id === item.id) === index).slice(0, 5), [catalog]);
  if (state === "loading") return <div className="space-y-10"><div className="skeleton h-[350px] rounded-3xl" /><GridSkeleton /></div>;
  if (state === "error") return <div className="rounded-3xl border border-ink-800 bg-ink-900/60 px-6 py-20 text-center"><p className="mb-4 text-ink-300">The shelf is taking a moment to open.</p><button type="button" onClick={retry} className="inline-flex items-center gap-2 rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-ink-950 transition-transform hover:scale-105"><RefreshCw size={15} /> Try again</button></div>;
  if (!featured.length) return <EmptyDiscovery />;
  return <div className="space-y-11 animate-fade-in">
    <HeroCarousel items={featured} />
    <SeriesCarousel title="Popular right now" eyebrow="The community shelf" icon={<TrendingUp size={17} />} items={catalog.popular} />
    <SeriesCarousel title="Recently updated" eyebrow="Fresh chapters landed" icon={<Clock3 size={17} />} items={catalog.recent} />
    <SeriesCarousel title="New releases" eyebrow="Just added to the library" icon={<Sparkles size={17} />} items={catalog.new} />
  </div>;
}

function HeroCarousel({ items }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef(null);
  useEffect(() => {
    if (paused || items.length < 2) return undefined;
    timer.current = setInterval(() => setIndex((value) => (value + 1) % items.length), 5000);
    return () => clearInterval(timer.current);
  }, [paused, items.length]);
  const item = items[index];
  const image = cover(item);
  const shift = (direction) => setIndex((index + direction + items.length) % items.length);
  return <section className="relative overflow-hidden rounded-3xl border border-ink-800 bg-[#20252e]" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }} onTouchStart={() => setPaused(true)} onTouchEnd={() => setPaused(false)} role="region" aria-roledescription="carousel" aria-label="Featured series">
    <div className="absolute inset-0 opacity-30" style={image ? { backgroundImage: `url(/images/${image})`, backgroundSize: "cover", backgroundPosition: "center", filter: "blur(24px)" } : undefined} />
    <div className="absolute inset-0 bg-gradient-to-r from-[#181b22] via-[#181b22]/95 to-brand-900/20" />
    <div className="relative flex min-h-[350px] items-center gap-8 p-6 sm:min-h-[390px] sm:p-12">
      <div className="hidden h-64 w-44 shrink-0 overflow-hidden rounded-2xl border border-ink-600/60 bg-ink-800 shadow-2xl shadow-black/30 sm:block">
        {image ? <img src={`/images/${image}`} alt="" className="h-full w-full object-cover" /> : <Fallback title={title(item)} />}
      </div>
      <div className="max-w-xl">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-brand-300">Featured this week</p>
        <h2 className="mb-3 text-3xl font-bold leading-tight text-ink-50 sm:text-5xl">{title(item)}</h2>
        <p className="mb-6 line-clamp-3 max-w-lg text-sm leading-7 text-ink-300">{item.description || "A new story is waiting to become your next favorite."}</p>
        <Link to={`/series/${slug(item)}`} className="group inline-flex items-center gap-2 rounded-full bg-brand-400 px-5 py-2.5 text-sm font-bold text-ink-950 transition-transform hover:scale-105" data-testid={`link-featured-${slug(item)}`}>Open series <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" /></Link>
      </div>
    </div>
    {items.length > 1 && <div className="absolute bottom-5 right-6 flex items-center gap-3 sm:right-10">
      <button type="button" aria-label="Previous featured series" onClick={() => shift(-1)} data-testid="button-featured-previous" className="rounded-full border border-ink-600 bg-ink-950/40 p-2 text-ink-200 transition-colors hover:border-brand-400 hover:text-brand-300"><ChevronLeft size={17} /></button>
      <div className="flex gap-1.5" aria-label={`Slide ${index + 1} of ${items.length}`}>{items.map((entry, i) => <button key={entry.id || i} type="button" aria-label={`Show featured series ${i + 1}`} onClick={() => setIndex(i)} className={`h-1.5 rounded-full transition-all ${i === index ? "w-7 bg-brand-400" : "w-1.5 bg-ink-500"}`} />)}</div>
      <button type="button" aria-label="Next featured series" onClick={() => shift(1)} data-testid="button-featured-next" className="rounded-full border border-ink-600 bg-ink-950/40 p-2 text-ink-200 transition-colors hover:border-brand-400 hover:text-brand-300"><ChevronRight size={17} /></button>
    </div>}
  </section>;
}

function SeriesCarousel({ title: heading, eyebrow, icon, items }) {
  const ref = useRef(null);
  const scroll = (amount) => ref.current?.scrollBy({ left: amount, behavior: "smooth" });
  return <section>
    <div className="mb-4 flex items-end justify-between">
      <div><p className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-brand-400">{icon}{eyebrow}</p><h2 className="text-xl font-bold text-ink-100 sm:text-2xl">{heading}</h2></div>
      <div className="flex gap-2"><button type="button" aria-label={`Scroll ${heading} backwards`} onClick={() => scroll(-400)} className="rounded-full border border-ink-800 p-2 text-ink-400 transition-colors hover:border-brand-500 hover:text-brand-300"><ChevronLeft size={17} /></button><button type="button" aria-label={`Scroll ${heading} forwards`} onClick={() => scroll(400)} className="rounded-full border border-ink-800 p-2 text-ink-400 transition-colors hover:border-brand-500 hover:text-brand-300"><ChevronRight size={17} /></button></div>
    </div>
    {items.length ? <div ref={ref} className="hide-scrollbar flex snap-x gap-4 overflow-x-auto pb-2">{items.map((item, i) => <div key={item.id || `${slug(item)}-${i}`} className="w-[145px] shrink-0 snap-start sm:w-[174px]"><SeriesCard item={item} /></div>)}</div> : <p className="rounded-xl border border-dashed border-ink-800 py-8 text-center text-sm text-ink-500">Nothing here yet. Check back soon.</p>}
  </section>;
}

function SeriesCard({ item }) {
  const image = cover(item);
  const score = rating(item);
  const numericScore = Number(score);
  return <Link to={`/series/${slug(item)}`} className="group block" data-testid={`card-series-${item.id || slug(item)}`}>
    <div className="relative mb-3 aspect-[2/3] overflow-hidden rounded-xl border border-ink-800 bg-ink-900 shadow-lg shadow-black/10 transition-all duration-300 group-hover:-translate-y-1 group-hover:border-brand-400/70 group-hover:shadow-brand-900/20">
      {image ? <img src={`/images/${image}`} alt={title(item)} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" /> : <Fallback title={title(item)} />}
      <span className={`absolute left-2 top-2 rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wide backdrop-blur-sm ${statusClass(item.status)}`}>{statusLabel(item.status)}</span>
    </div>
    <h3 className="line-clamp-1 text-sm font-semibold text-ink-200 transition-colors group-hover:text-brand-300">{title(item)}</h3>
    <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-500" aria-label={score ? `${numericScore.toFixed(1)} out of 5 stars` : "Rating not available"}>
      <span className="flex items-center" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, index) => (
          <Star key={index} size={11} fill={score && index + 1 <= Math.round(numericScore) ? "currentColor" : "none"} className={score && index + 1 <= Math.round(numericScore) ? "text-gold-400" : "text-ink-700"} />
        ))}
      </span>
      <span>{score ? numericScore.toFixed(1) : "Unrated"}</span>
    </div>
  </Link>;
}

function Fallback({ title: name }) { return <div className="flex h-full w-full items-end bg-gradient-to-br from-brand-900 via-ink-800 to-ink-950 p-4 text-2xl font-bold text-brand-200">{name.charAt(0)}</div>; }
function EmptyDiscovery() { return <div className="rounded-3xl border border-dashed border-ink-800 py-24 text-center"><Sparkles className="mx-auto mb-4 text-brand-400" size={28} /><h2 className="mb-2 text-xl font-bold">Your shelf is being arranged</h2><p className="text-sm text-ink-500">New series will appear here as soon as they are published.</p></div>; }
function SeriesGrid({ items, emptyText, showUnread }) {
  if (!items.length) return <div className="rounded-2xl border border-dashed border-ink-800 py-20 text-center text-sm text-ink-500">{emptyText}</div>;
  return <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-4 lg:grid-cols-6">{items.map((item, i) => <div key={item.id || i} className="relative"><SeriesCard item={item} />{showUnread && item.unread_count > 0 && <span className="absolute right-2 top-2 rounded-full bg-brand-400 px-2 py-0.5 text-xs font-bold text-ink-950">{item.unread_count}</span>}</div>)}</div>;
}
function HistoryList({ items }) {
  if (!items.length) return <div className="rounded-2xl border border-dashed border-ink-800 py-20 text-center text-sm text-ink-500">Your reading trail is empty. Start a story and it will show up here.</div>;
  return <div className="space-y-2">{items.map((h, i) => <Link key={h.id || i} to={`/read/${h.series_slug}/${h.chapter_slug}`} className="flex items-center justify-between rounded-xl border border-ink-800 bg-ink-900/70 px-4 py-3 transition-colors hover:border-brand-800 hover:bg-ink-800" data-testid={`link-history-${i}`}><div className="flex items-center gap-3"><BookOpen size={18} className="text-brand-400" /><div><p className="text-sm text-ink-200">{h.series_title}</p><p className="text-xs text-ink-500">Ch. {h.chapter_number} {h.chapter_title || ""}</p></div></div><span className="text-xs text-ink-500">{new Date(h.read_at).toLocaleDateString()}</span></Link>)}</div>;
}
function GridSkeleton() { return <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">{Array.from({ length: 6 }).map((_, i) => <div key={i}><div className="skeleton aspect-[2/3] rounded-xl" /><div className="skeleton mt-3 h-4 w-4/5 rounded" /></div>)}</div>; }
function ListSkeleton() { return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>; }