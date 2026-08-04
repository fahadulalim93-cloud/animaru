"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import { useAppStore, getTMDBTitle, getTMDBBackdrop, getTMDBYear, type TMDBContentItem } from "./store";
import MovieCard from "./movie-card";

const GROTESK = "var(--font-space-grotesk), 'Space Grotesk', sans-serif";
const ACCENT = "#1e88ff";

const CATEGORIES = [
  { id: "popular", label: "Fan Favorites" },
  { id: "top_rated", label: "Hall of Fame" },
  { id: "now_playing", label: "In Theaters" },
  { id: "upcoming", label: "Coming Soon" },
];

const GENRES = [
  { id: 28, name: "Action" }, { id: 12, name: "Adventure" }, { id: 16, name: "Animation" },
  { id: 35, name: "Comedy" }, { id: 80, name: "Crime" }, { id: 99, name: "Documentary" },
  { id: 18, name: "Drama" }, { id: 10751, name: "Family" }, { id: 14, name: "Fantasy" },
  { id: 36, name: "History" }, { id: 27, name: "Horror" }, { id: 10402, name: "Music" },
  { id: 9648, name: "Mystery" }, { id: 10749, name: "Romance" }, { id: 878, name: "Sci-Fi" },
  { id: 53, name: "Thriller" }, { id: 10752, name: "War" }, { id: 37, name: "Western" },
];

// ── Ticket-icon row heading ──
function ReelHeading({ eyebrow, title }: { eyebrow?: string; title: string }) {
  return (
    <div>
      {eyebrow && <span className="block text-[10px] font-extrabold uppercase tracking-[0.22em] text-[#48a6ff] mb-1" style={{ fontFamily: GROTESK }}>{eyebrow}</span>}
      <h2 className="inline-flex items-center gap-2.5 text-lg sm:text-xl font-extrabold text-[#e8eaee] tracking-tight" style={{ fontFamily: GROTESK }}>
        <svg className="w-4 h-4 text-[#48a6ff]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <rect x="3" y="6" width="18" height="12" rx="2" strokeDasharray="2 2" />
          <circle cx="8" cy="12" r="1.4" fill="currentColor" stroke="none" />
        </svg>
        {title}
      </h2>
    </div>
  );
}

// ── Horizontal rail with arrow controls ──
function Rail({ title, eyebrow, items }: { title: string; eyebrow?: string; items: TMDBContentItem[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollBy = (dir: 1 | -1) => scrollRef.current?.scrollBy({ left: dir * scrollRef.current.clientWidth * 0.8, behavior: "smooth" });

  if (items.length === 0) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <ReelHeading eyebrow={eyebrow} title={title} />
        <div className="hidden sm:flex items-center gap-2">
          {([-1, 1] as const).map(dir => (
            <button
              key={dir}
              onClick={() => scrollBy(dir)}
              className="w-8 h-8 rounded-full flex items-center justify-center border border-white/10 text-[#a1a7b3] hover:text-white hover:border-[#48a6ff]/60 transition-colors"
              aria-label={dir === 1 ? "Scroll right" : "Scroll left"}
            >
              <svg className={`w-4 h-4 ${dir === -1 ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path d="M9 6l6 6-6 6" /></svg>
            </button>
          ))}
        </div>
      </div>
      <div ref={scrollRef} className="flex gap-3 overflow-x-auto scroll-container pb-2 -mx-1 px-1">
        {items.map((item, i) => (
          <div key={`${item.id}-${i}`} className="shrink-0 w-[130px] sm:w-[150px] lg:w-[168px]">
            <MovieCard item={item} priority={i < 6} />
          </div>
        ))}
      </div>
    </section>
  );
}

export default function MoviesPage() {
  const navigate = useAppStore(s => s.navigate);

  const [trending, setTrending] = useState<TMDBContentItem[]>([]);
  const [popular, setPopular] = useState<TMDBContentItem[]>([]);
  const [topRated, setTopRated] = useState<TMDBContentItem[]>([]);
  const [nowPlaying, setNowPlaying] = useState<TMDBContentItem[]>([]);
  const [upcoming, setUpcoming] = useState<TMDBContentItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const get = async (url: string): Promise<TMDBContentItem[]> => {
        try {
          const res = await fetch(url);
          if (!res.ok) return [];
          const data = await res.json();
          return data.results || [];
        } catch { return []; }
      };
      const [tr, po, top, now, up] = await Promise.all([
        get("/api/tmdb/trending?type=movie&time=day"),
        get("/api/tmdb/movies?category=popular&page=1"),
        get("/api/tmdb/movies?category=top_rated&page=1"),
        get("/api/tmdb/movies?category=now_playing&page=1"),
        get("/api/tmdb/movies?category=upcoming&page=1"),
      ]);
      if (cancelled) return;
      setTrending(tr);
      setPopular(po);
      setTopRated(top);
      setNowPlaying(now);
      setUpcoming(up);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // ── Marquee hero ──
  const heroItems = trending.filter(t => t.backdrop_path && t.overview).slice(0, 6);
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    if (heroItems.length < 2) return;
    const t = setInterval(() => setSlide(s => (s + 1) % heroItems.length), 6500);
    return () => clearInterval(t);
  }, [heroItems.length]);
  const hero = heroItems[slide % Math.max(heroItems.length, 1)];

  // Ticker strip — titles from across all rails
  const tickerItems = [...trending.slice(0, 8), ...popular.slice(0, 8)].filter(Boolean);

  // ── Explorer ──
  const [category, setCategory] = useState("popular");
  const [genre, setGenre] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [gridItems, setGridItems] = useState<TMDBContentItem[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [gridLoading, setGridLoading] = useState(true);
  const explorerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setGridLoading(true);
      try {
        const params = new URLSearchParams({ category: genre ? "discover" : category, page: String(page) });
        if (genre) params.set("genre", String(genre));
        const res = await fetch(`/api/tmdb/movies?${params}`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          setGridItems(data.results || []);
          setTotalPages(Math.min(data.total_pages || 1, 500));
        }
      } catch { /* ignore */ }
      if (!cancelled) setGridLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [category, genre, page]);

  const heroScore = hero?.vote_average ? (hero.vote_average > 10 ? hero.vote_average / 10 : hero.vote_average) : 0;

  return (
    <div className="space-y-10 fade-in pb-4">
      {/* ═══ Marquee hero — "Now Showing" ═══ */}
      {hero && (
        <div className="ltv-cinema-marquee">
          <div className="ltv-cinema-lights" aria-hidden="true">
            {Array.from({ length: 24 }).map((_, i) => <i key={i} />)}
          </div>
          <div className="relative w-full h-[52vh] sm:h-[62vh] lg:h-[72vh] rounded-2xl overflow-hidden border border-white/[0.06] bg-[#0a0d13]">
            {heroItems.map((item, i) => (
              <img
                key={item.id}
                src={getTMDBBackdrop(item)}
                alt={getTMDBTitle(item)}
                className="absolute inset-0 w-full h-full object-cover transition-opacity duration-700"
                style={{ opacity: i === slide ? 1 : 0 }}
              />
            ))}
            <div className="absolute inset-0 bg-gradient-to-r from-[#050608] via-[#050608]/55 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#050608] via-transparent to-transparent" />

            <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-10 lg:p-12">
              <div className="flex items-end gap-6">
                <div className="max-w-2xl">
                  <span className="inline-flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.24em] text-[#48a6ff] mb-3" style={{ fontFamily: GROTESK }}>
                    <span className="w-5 h-px bg-[#48a6ff]" />
                    Now Showing · Screen {slide + 1}
                  </span>
                  <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#e8eaee] tracking-tight line-clamp-2 mb-3" style={{ fontFamily: GROTESK }}>
                    {getTMDBTitle(hero)}
                  </h1>
                  <div className="flex items-center gap-2 mb-4 flex-wrap">
                    {getTMDBYear(hero) && <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-[#a1a7b3] border border-white/10 bg-white/[0.04]">{getTMDBYear(hero)}</span>}
                    <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-[#a1a7b3] border border-white/10 bg-white/[0.04]">HD</span>
                  </div>
                  {hero.overview && <p className="text-sm text-[#a1a7b3] line-clamp-2 max-w-lg mb-6 leading-relaxed">{hero.overview}</p>}
                  <div className="flex items-center gap-3">
                    <button onClick={() => navigate({ page: "movie-watch", id: hero.id })} className="ltv-cinema-stub" style={{ fontFamily: GROTESK }}>
                      <span className="ltv-cinema-stub-tab">ADMIT<br />ONE</span>
                      <span className="ltv-cinema-stub-label">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                        Watch Now
                      </span>
                    </button>
                    <button
                      onClick={() => navigate({ page: "movie-detail", id: hero.id })}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-[#e8eaee] border border-white/15 bg-[#0a0d13]/80 hover:border-[#48a6ff]/50 transition-colors"
                      style={{ fontFamily: GROTESK }}
                    >
                      Details
                    </button>
                  </div>
                </div>

                {heroScore > 0 && (
                  <div className="ltv-cinema-stamp hidden sm:flex">
                    <b>{heroScore.toFixed(1)}</b>
                    <span>Rated</span>
                  </div>
                )}
              </div>
            </div>

            {heroItems.length > 1 && (
              <div className="absolute bottom-6 right-6 sm:right-10 hidden sm:flex items-center gap-2">
                {heroItems.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setSlide(i)}
                    aria-label={`Slide ${i + 1}`}
                    className="h-1.5 rounded-full transition-all duration-300"
                    style={{ width: i === slide ? 22 : 8, background: i === slide ? ACCENT : "rgba(255,255,255,0.25)" }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {!hero && <div className="w-full h-[52vh] sm:h-[62vh] lg:h-[72vh] rounded-2xl skeleton" />}

      {/* ═══ Ticker strip ═══ */}
      {tickerItems.length > 0 && (
        <div className="ltv-cinema-ticker">
          <div className="ltv-cinema-ticker-track">
            {[...tickerItems, ...tickerItems].map((item, i) => (
              <span key={`${item.id}-${i}`} className="ltv-cinema-ticker-item">
                <span className="ltv-cinema-ticker-dot" />
                Now Showing <strong>{getTMDBTitle(item)}</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ═══ Rails ═══ */}
      <Rail title="Now Showing" eyebrow="What everyone's watching" items={trending.slice(0, 18)} />
      <Rail title="Fan Favorites" items={popular.slice(0, 18)} />
      <Rail title="Hall of Fame" items={topRated.slice(0, 18)} />
      <Rail title="In Theaters" eyebrow="Currently screening" items={nowPlaying.slice(0, 18)} />
      <Rail title="Coming Soon" items={upcoming.slice(0, 18)} />

      {/* ═══ Explorer — "Box Office" browse ═══ */}
      <section ref={explorerRef} className="space-y-5 pt-4">
        <div className="flex items-end justify-between gap-3 border-t border-white/[0.06] pt-8">
          <ReelHeading eyebrow="Explore" title="Box Office — Browse All" />
        </div>

        {/* Category tabs — ticket admission style */}
        <div className="flex items-center gap-3 overflow-x-auto scroll-container pb-1 pt-1">
          {CATEGORIES.map(cat => {
            const active = category === cat.id && !genre;
            return (
              <button
                key={cat.id}
                onClick={() => { setCategory(cat.id); setGenre(null); setPage(1); }}
                className={`ltv-cinema-chip shrink-0 px-5 py-2.5 text-[13px] font-bold rounded-lg transition-all whitespace-nowrap border ${
                  active ? "text-white border-transparent" : "text-[#a1a7b3] border-white/[0.08] hover:text-white hover:border-white/20"
                }`}
                style={{ fontFamily: GROTESK, background: active ? ACCENT : "rgba(255,255,255,0.03)" }}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Genre chips */}
        <div className="flex items-center gap-2 overflow-x-auto scroll-container pb-1">
          <button
            onClick={() => { setGenre(null); setPage(1); }}
            className={`shrink-0 px-3.5 py-1.5 text-[11px] font-bold rounded-full border transition-colors whitespace-nowrap ${
              !genre ? "text-[#48a6ff] border-[#48a6ff]/40 bg-[#1e88ff]/10" : "text-[#767d8a] border-white/[0.06] hover:text-[#c4c9d2]"
            }`}
            style={{ fontFamily: GROTESK }}
          >
            All Genres
          </button>
          {GENRES.map(g => {
            const active = genre === g.id;
            return (
              <button
                key={g.id}
                onClick={() => { setGenre(active ? null : g.id); setPage(1); }}
                className={`shrink-0 px-3.5 py-1.5 text-[11px] font-bold rounded-full border transition-colors whitespace-nowrap ${
                  active ? "text-[#48a6ff] border-[#48a6ff]/40 bg-[#1e88ff]/10" : "text-[#767d8a] border-white/[0.06] hover:text-[#c4c9d2] hover:border-white/[0.14]"
                }`}
                style={{ fontFamily: GROTESK }}
              >
                {g.name}
              </button>
            );
          })}
        </div>

        {/* Grid */}
        {gridLoading ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
            {Array.from({ length: 14 }).map((_, i) => (
              <div key={i} className="aspect-[2/3] skeleton rounded-xl" />
            ))}
          </div>
        ) : gridItems.length > 0 ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
            {gridItems.map(item => (
              <MovieCard key={item.id} item={{ ...item, media_type: "movie" }} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20 rounded-2xl bg-[#0a0d13] border border-white/[0.06]">
            <svg className="w-12 h-12 mx-auto text-[#5b616c] mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
            </svg>
            <p className="text-[#767d8a] text-sm">No movies found</p>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => { setPage(p => Math.max(1, p - 1)); explorerRef.current?.scrollIntoView({ behavior: "smooth" }); }}
              disabled={page === 1}
              className="px-5 py-2.5 text-[13px] font-bold rounded-full text-[#a1a7b3] border border-white/[0.08] hover:text-white hover:border-[#48a6ff]/40 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
              style={{ fontFamily: GROTESK }}
            >
              Previous
            </button>
            <span className="text-[13px] text-[#a1a7b3] px-3 font-semibold" style={{ fontFamily: GROTESK }}>
              {page} <span className="text-[#5b616c]">/</span> {totalPages}
            </span>
            <button
              onClick={() => { setPage(p => Math.min(totalPages, p + 1)); explorerRef.current?.scrollIntoView({ behavior: "smooth" }); }}
              disabled={page === totalPages}
              className="px-5 py-2.5 text-[13px] font-bold rounded-full text-[#a1a7b3] border border-white/[0.08] hover:text-white hover:border-[#48a6ff]/40 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
              style={{ fontFamily: GROTESK }}
            >
              Next
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
