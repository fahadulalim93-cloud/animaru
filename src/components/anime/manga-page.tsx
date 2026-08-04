"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAppStore } from "./store";

/* ═══════════════════════════════════════════════════════════════
   LUFFYTV MANGA — v7 (site-blue, mirrors anime-section-page layout)
   ─────────────────────────────────────────────────────────────────
   DATA
   • Provider: atsumaru via manga-scrape-api.vercel.app
   • Home sections: /api/manga/home (posters only — no banners/scores
     on the home feed)
   • Banner enrichment: /api/manga/banners?ids=…  (AniList GraphQL →
     real bannerImage + score + genres + description for the hero &
     featured titles; anilistId is resolved by fetching /api/manga/detail
     for the top-rated candidates)
   • Search: /api/manga/search?q=…

   STRUCTURE — mirrors anime-section-page.tsx:
   1. Full-screen hero carousel (bottom-left content, square buttons,
      nav dots)
   2. Top Trending rail (Netflix-style ranking numbers + tabs)
   3. Featured Manga card (backdrop + poster + info)
   4. Per-section carousels (scroll arrows)
   5. Discover grid + sidebar (Top Manga + Recent Updates)
   6. Inline search bar + filter chips folded into the page flow
      (no competing second navbar)

   ACCENT — site blue #1e88ff (matches the site's primary accent)
   ═══════════════════════════════════════════════════════════════ */

const ACCENT = "#1e88ff";
// Matches anime-section-page.tsx's heading treatment exactly
const TEXT_GRADIENT = "linear-gradient(180deg, #ffffff 0%, #a3a3a3 100%)";
const HOVER_TITLE_COLORS = ["#8FCBAE", "#84A8D1", "#C98DA8", "#9E8BC4"];

// Type badge colors
const TYPE_COLORS: Record<string, string> = {
  manga: "#8E7CE6",
  manhwa: "#3B82F6",
  manhua: "#F59E0B",
  novel: "#10B981",
  "one shot": "#EC4899",
};

// ────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────

interface MangaEntry {
  id: string;
  title: string;
  englishTitle?: string;
  poster?: string;
  cover?: string;
  type?: string;
  status?: string;
  year?: number;
  genres?: string[];
  source?: string;
  rating?: number;
  chapterCount?: number;
  description?: string;
  anilistId?: number;
}

interface MangaSection {
  title: string;
  type: string;
  items: MangaEntry[];
}

// Enriched with AniList banner/score/genres
interface EnrichedManga extends MangaEntry {
  banner?: string;
  anilistScore?: number;
  anilistGenres?: string[];
  anilistDescription?: string;
  anilistStatus?: string;
  anilistFormat?: string;
}

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────

function getTitle(m: MangaEntry | EnrichedManga): string {
  return m.englishTitle || m.title || "Unknown";
}
function getCover(m: MangaEntry | EnrichedManga): string {
  return m.poster || m.cover || "";
}
function getBanner(m: EnrichedManga): string {
  return m.banner || m.poster || m.cover || "";
}
function getScore(m: MangaEntry | EnrichedManga): number {
  const e = m as EnrichedManga;
  if (e.anilistScore && e.anilistScore > 0) {
    return e.anilistScore > 20 ? e.anilistScore : Math.round(e.anilistScore * 10);
  }
  if (!m.rating) return 0;
  return m.rating > 10 ? Math.round(m.rating) : Math.round(m.rating * 10);
}
function getGenres(m: EnrichedManga): string[] {
  return m.anilistGenres?.length ? m.anilistGenres : (m.genres || []);
}
function getDescription(m: EnrichedManga): string {
  const d = m.anilistDescription || m.description || "";
  return d.replace(/<[^>]*>/g, "");
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

export default function MangaPage() {
  const navigate = useAppStore(s => s.navigate);
  const sectionSubPage = useAppStore(s => s.sectionSubPage);

  // Helper: navigate to manga detail, storing poster as fallback
  // (mangaball info endpoint is broken for some manga, so the detail
  // page may get an empty poster — this ensures we always have one)
  const goToDetail = useCallback((manga: { id: string; poster?: string; cover?: string; title?: string; englishTitle?: string }) => {
    try {
      const poster = manga.poster || manga.cover || "";
      const title = manga.englishTitle || manga.title || "";
      if (poster) sessionStorage.setItem(`manga-poster-${manga.id}`, poster);
      if (title) sessionStorage.setItem(`manga-title-${manga.id}`, title);
    } catch { /* ignore */ }
    navigate({ page: "manga-detail", id: manga.id });
  }, [navigate]);

  const [sections, setSections] = useState<MangaSection[]>([]);
  const [searchResults, setSearchResults] = useState<MangaEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [enriched, setEnriched] = useState<EnrichedManga[]>([]);

  // Sub-page data (Popular, Top Rated, Recently Added, Schedule)
  const [subPageData, setSubPageData] = useState<MangaEntry[]>([]);
  const [subPageLoading, setSubPageLoading] = useState(false);

  // Inline filter state (folded into page, not a second navbar)
  const [typeFilter] = useState<string>("all");
  const [sort, setSort] = useState<"latest" | "rating" | "az">("latest");

  // ── Load home ──
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/manga/home");
        if (res.ok) {
          const data = await res.json();
          setSections(data.sections || []);
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, []);

  // ── Enrich top manga with AniList banners (for hero + featured) ──
  useEffect(() => {
    if (sections.length === 0) return;
    let cancelled = false;
    async function enrich() {
      try {
        const seen = new Set<string>();
        const candidates: MangaEntry[] = [];
        for (const m of sections.flatMap(s => s.items)) {
          if (seen.has(m.id)) continue;
          seen.add(m.id);
          candidates.push(m);
        }
        candidates.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        const top = candidates.slice(0, 10);

        // Fetch META ONLY (no chapters) for anilistId (parallel, capped at 8).
        // Uses the lightweight /api/manga/meta endpoint instead of /api/manga/detail
        // to avoid the expensive cross-provider chapter merge on the home page.
        const infos = await Promise.all(
          top.slice(0, 8).map(async m => {
            try {
              const res = await fetch(`/api/manga/meta?id=${encodeURIComponent(m.id)}`);
              if (res.ok) {
                const d = await res.json();
                // anilistId may come back as a string from the API — parse to number
                const alId = d.anilistId ? parseInt(String(d.anilistId), 10) : undefined;
                return { ...m, anilistId: alId && !isNaN(alId) ? alId : undefined };
              }
            } catch { /* ignore */ }
            return m;
          }),
        );

        const anilistIds = infos
          .map(m => m.anilistId)
          .filter((id): id is number => typeof id === "number" && id > 0);

        if (anilistIds.length === 0) {
          if (!cancelled) setEnriched(infos as EnrichedManga[]);
          return;
        }

        const bannerRes = await fetch(`/api/manga/banners?ids=${anilistIds.join(",")}`);
        const bannerData = bannerRes.ok ? await bannerRes.json() : { banners: {} };
        const banners: Record<number, any> = bannerData.banners || {};

        const enrichedManga: EnrichedManga[] = infos.map(m => {
          const al = m.anilistId ? banners[m.anilistId] : null;
          return {
            ...m,
            banner: al?.banner || "",
            anilistScore: al?.score || 0,
            anilistGenres: al?.genres || [],
            anilistDescription: al?.description || "",
            anilistStatus: al?.status || "",
            anilistFormat: al?.format || "",
          };
        });

        // Banners first, then by score
        enrichedManga.sort((a, b) => {
          const ab = a.banner ? 1 : 0;
          const bb = b.banner ? 1 : 0;
          if (ab !== bb) return bb - ab;
          return getScore(b) - getScore(a);
        });

        if (!cancelled) setEnriched(enrichedManga);
      } catch (err) {
        console.error("[manga-page] enrich error:", err);
      }
    }
    enrich();
    return () => { cancelled = true; };
  }, [sections]);

  // ── Load sub-page data (Popular / Top Rated / Recently Added / Schedule) ──
  useEffect(() => {
    if (sectionSubPage === "home") {
      setSubPageData([]);
      return;
    }
    let cancelled = false;
    async function loadSubPage() {
      setSubPageLoading(true);
      try {
        let endpoint = "";
        let label = "";
        if (sectionSubPage === "popular") { endpoint = "/api/manga/popular"; label = "Popular"; }
        else if (sectionSubPage === "top-rated") { endpoint = "/api/manga/top-rated"; label = "Top Rated"; }
        else if (sectionSubPage === "recently-added") { endpoint = "/api/manga/recently-added"; label = "Recently Added"; }
        if (!endpoint) { setSubPageLoading(false); return; }
        const res = await fetch(endpoint);
        if (res.ok && !cancelled) {
          const data = await res.json();
          setSubPageData(data.items || data.results || []);
        }
      } catch { /* ignore */ }
      if (!cancelled) setSubPageLoading(false);
    }
    loadSubPage();
    return () => { cancelled = true; };
  }, [sectionSubPage]);

  // ── Search (debounced) ──
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchMode(false);
      setSearchResults([]);
      return;
    }
    setSearchMode(true);
    setSearching(true);
    try {
      const res = await fetch(`/api/manga/search?q=${encodeURIComponent(query.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
      }
    } catch { /* ignore */ }
    setSearching(false);
  }, []);

  const onSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => handleSearch(value), 450);
  };

  // ── Derived ──
  const allItems = (() => {
    const seen = new Set<string>();
    const out: MangaEntry[] = [];
    for (const m of sections.flatMap(s => s.items)) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      out.push(m);
    }
    return out;
  })();
  // Render the hero as soon as /api/manga/home lands, using the titles' own
  // poster art. Waiting for `enriched` meant sitting through two more round
  // trips (meta x8 -> banners) before anything appeared above the fold; the
  // enriched version swaps in seamlessly once it arrives.
  const heroItems: EnrichedManga[] = enriched.length > 0
    ? enriched.slice(0, 6)
    : ([...allItems].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 6) as EnrichedManga[]);
  const trending = enriched.length > 0 ? enriched : allItems.slice(0, 12);
  const topRated = [...allItems].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 10);
  const popular = [...allItems].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 12);
  const recent = allItems.slice(0, 12);
  const featured = enriched.find(m => m.banner) || enriched[0] || popular[0];

  // Filter logic for the Discover grid
  const applyFilters = (items: MangaEntry[]) => {
    let out = [...items];
    if (typeFilter !== "all") {
      out = out.filter(m => (m.type || "manga").toLowerCase() === typeFilter);
    }
    if (sort === "rating") out.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    else if (sort === "az") out.sort((a, b) => getTitle(a).localeCompare(getTitle(b)));
    return out;
  };

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-white/10 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white pb-12">
      {/* ═══ HERO (only on home sub-page) ═══ */}
      {!searchMode && sectionSubPage === "home" && heroItems.length > 0 && (
        <HeroCarousel items={heroItems} goToDetail={goToDetail} />
      )}

      {/* ═══ INLINE SEARCH + FILTER BAR ═══ */}
      {/* When the hero isn't showing (search mode, or a non-home sub-page),
          this becomes the first thing on the page, so it needs its own
          clearance under the fixed topbar — the hero handles that itself by
          being full-bleed on purpose. */}
      <section className={`px-4 md:px-8 lg:px-8 py-6 ${(searchMode || sectionSubPage !== "home" || heroItems.length === 0) ? "pt-16" : ""}`}>
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          {/* Search */}
          <div className="relative flex-1">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search manga…"
              value={searchQuery}
              onChange={e => onSearchChange(e.target.value)}
              className="w-full pl-12 pr-4 py-2.5 bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-white/30 transition-colors"
              style={{ borderRadius: "4px" }}
            />
            {searching && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-white/10 border-t-white rounded-full animate-spin" />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ═══ SEARCH RESULTS ═══ */}
      {searchMode ? (
        <section className="px-4 md:px-8 lg:px-8 py-4">
          <div className="flex items-center justify-between mb-4">
            <h2
              className="font-karla text-xl font-bold bg-clip-text text-transparent"
              style={{ backgroundImage: TEXT_GRADIENT }}
            >
              Search Results {searchResults.length > 0 && `(${searchResults.length})`}
            </h2>
            <button
              onClick={() => {
                setSearchQuery("");
                setSearchMode(false);
                setSearchResults([]);
              }}
              className="text-xs text-white/40 hover:text-white transition-colors"
            >
              Clear
            </button>
          </div>
          {searchResults.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
              {searchResults.map(m => (
                <PosterCard key={m.id} manga={m} goToDetail={goToDetail} />
              ))}
            </div>
          ) : !searching ? (
            <div className="text-center py-12 text-white/40 text-sm">
              No manga found for &quot;{searchQuery}&quot;
            </div>
          ) : null}
        </section>
      ) : sectionSubPage !== "home" ? (
        /* ═══ SUB-PAGE GRID (Popular / Top Rated / Recently Added / Schedule) ═══ */
        <SubPageGrid
          title={sectionSubPage === "popular" ? "Popular Manga"
            : sectionSubPage === "top-rated" ? "Top Rated Manga"
            : sectionSubPage === "recently-added" ? "Recently Added Manga"
            : "Manga"}
          items={subPageData}
          loading={subPageLoading}
          goToDetail={goToDetail}
        />
      ) : (
        <>
          {/* ═══ TOP TRENDING ═══ */}
          <TopTrending trending={trending} topRated={topRated} goToDetail={goToDetail} />

          {/* ═══ CAROUSELS ═══ */}
          {sections.map((section, si) => (
            <Carousel
              key={si}
              title={section.title}
              items={applyFilters(section.items)}
              goToDetail={goToDetail}
            />
          ))}

          {/* ═══ DISCOVER ═══ */}
          <Discover
            trending={trending}
            popular={popular}
            topRated={topRated}
            recent={recent}
            goToDetail={goToDetail}
            typeFilter={typeFilter}
            sort={sort}
            setSort={setSort}
            applyFilters={applyFilters}
          />
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SUB-PAGE GRID — Popular / Top Rated / Recently Added / Schedule
   A full-width poster grid with a title header.
   ═══════════════════════════════════════════════════════════════ */

function SubPageGrid({ title, items, loading, goToDetail }: {
  title: string;
  items: MangaEntry[];
  loading: boolean;
  goToDetail: (m: any) => void;
}) {
  if (loading) {
    return (
      <section className="px-4 md:px-8 lg:px-8 py-8">
        <div className="h-8 w-64 skeleton rounded mb-6" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-32 skeleton rounded-lg" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="px-4 md:px-8 lg:px-8 py-8 max-w-7xl mx-auto">
      <h2
        className="font-karla text-2xl font-extrabold bg-clip-text text-transparent mb-6"
        style={{ backgroundImage: TEXT_GRADIENT }}
      >
        {title}
      </h2>
      {items.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {items.map(m => (
            <RecentUpdateCard key={m.id} manga={m} goToDetail={goToDetail} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-white/40 text-sm">
          No manga found.
        </div>
      )}
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════
   RECENT UPDATE CARD — 2-column wide card (matches screenshot style)
   Poster on left, title + type + rating + status on right
   ═══════════════════════════════════════════════════════════════ */

function RecentUpdateCard({ manga, goToDetail }: { manga: MangaEntry; goToDetail: (m: any) => void }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const displayTitle = manga.englishTitle || manga.title;
  const poster = manga.poster || manga.cover || "";
  const score = manga.rating ? (manga.rating > 10 ? Math.round(manga.rating) : Math.round(manga.rating * 10)) : 0;
  const tColor = manga.type ? (TYPE_COLORS[manga.type.toLowerCase()] || "#8E7CE6") : "#8E7CE6";

  return (
    <button
      onClick={() => goToDetail(manga)}
      className="group flex items-center gap-4 p-3 bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/20 transition-all text-left w-full"
      style={{ borderRadius: "8px" }}
    >
      {/* Poster thumbnail */}
      <div className="shrink-0 w-16 h-24 sm:w-20 sm:h-28 rounded-lg overflow-hidden bg-white/5 relative">
        {!imgLoaded && <div className="absolute inset-0 skeleton" />}
        {poster && (
          <img
            src={poster}
            alt={displayTitle}
            className={`w-full h-full object-cover transition-all duration-300 group-hover:scale-105 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
            onLoad={() => setImgLoaded(true)}
            loading="lazy"
          />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        {/* Top row: type badge + time */}
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
            style={{ background: `${tColor}20`, color: tColor, border: `1px solid ${tColor}40` }}
          >
            {manga.type || "Manga"}
          </span>
          {manga.status && (
            <span className="text-[9px] text-white/40 font-medium uppercase tracking-wider">
              {manga.status}
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="font-karla text-sm font-bold text-white line-clamp-1 group-hover:text-white/80 transition-colors">
          {displayTitle}
        </h3>

        {/* Bottom row: rating + chapter hint */}
        <div className="flex items-center gap-3 flex-wrap text-[10px] text-white/40">
          {score > 0 && (
            <span className="flex items-center gap-0.5" style={{ color: ACCENT }}>
              <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              {score}%
            </span>
          )}
          {manga.source && manga.source === "mangaball" && (
            <span className="px-1.5 py-0.5 rounded bg-white/5 text-white/50 font-medium uppercase text-[8px]">
              Multi-lang
            </span>
          )}
          <span className="text-white/30">Tap to read</span>
        </div>
      </div>

      {/* Arrow */}
      <svg className="w-4 h-4 text-white/20 group-hover:text-white/60 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════
   HERO — compact detail-page-style banner (mirrors anime-detail.tsx):
   fixed-height banner, poster overlapping its bottom edge, title/pills/
   description block, Read Now + Share action row. Rotates through the
   top enriched titles, same as before, just restyled.
   ═══════════════════════════════════════════════════════════════ */

function HeroCarousel({ items, goToDetail }: { items: EnrichedManga[]; goToDetail: (m: any) => void }) {
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (paused || items.length === 0) return;
    timerRef.current = setTimeout(() => {
      setCurrent(prev => (prev + 1) % items.length);
      setDescExpanded(false);
    }, 8000);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [current, paused, items.length]);

  if (items.length === 0) return null;

  const manga = items[current];
  const title = getTitle(manga);
  const nativeTitle = manga.title && manga.title !== title ? manga.title : "";
  // The manga's OWN art (AniList manga bannerImage, else its poster). This used
  // to prefer a TMDB backdrop looked up from the *anime adaptation*, which is
  // why unrelated anime key art showed behind manga titles — and it cost an
  // extra request per slide.
  const banner = getBanner(manga);
  const cover = getCover(manga);
  const score = getScore(manga);
  const description = getDescription(manga);
  const status = manga.anilistStatus || manga.status || "";

  const pills: string[] = [];
  if (manga.chapterCount) pills.push(`${manga.chapterCount} Chapters`);
  if (score > 0) pills.push(`${score}%`);
  if (manga.year) pills.push(String(manga.year));
  if (status) pills.push(status);

  const goToIndex = (i: number) => { setCurrent(i); setDescExpanded(false); };
  const shareManga = () => {
    if (navigator.share) navigator.share({ title, url: window.location.href });
    else navigator.clipboard.writeText(window.location.href);
  };

  return (
    <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {/* ═══ BANNER — fixed height, poster overlaps its bottom edge ═══ */}
      <div className="relative w-full h-[46vh] sm:h-[54vh] min-h-[340px] overflow-hidden bg-black">
        {banner && (
          <img
            src={banner}
            alt=""
            className="object-cover"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", animation: "ltv-hero-crossfade 1.2s ease-in-out" }}
            key={`bg-${current}`}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-transparent" />
        {items.length > 1 && (
          <div className="absolute bottom-3 right-4 z-20 hidden lg:flex items-center gap-1.5">
            {items.slice(0, 8).map((_, i) => (
              <button
                key={i}
                onClick={() => goToIndex(i)}
                className={`h-1 rounded-full transition-all ${i === current ? "w-6 bg-white" : "w-1 bg-white/30"}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* ═══ MOBILE HERO — centered stacked layout ═══ */}
      <div key={`m-content-${current}`} className="lg:hidden relative z-10 px-4 -mt-[100px] flex flex-col items-center text-center" style={{ animation: "ltv-hero-content-slide 1s ease-out" }}>
        {cover && (
          <div className="w-[130px] aspect-[2/3] rounded-lg overflow-hidden shrink-0 bg-white/10 shadow-2xl mb-3">
            <img src={cover} alt={title} className="w-full h-full object-cover" />
          </div>
        )}
        {nativeTitle && <p className="text-white/50 text-sm mb-1 line-clamp-1">{nativeTitle}</p>}
        <h1
          className="font-karla text-xl font-bold bg-clip-text text-transparent line-clamp-2"
          style={{ backgroundImage: TEXT_GRADIENT }}
        >
          {title}
        </h1>
        {pills.length > 0 && (
          <div className="flex items-center justify-center gap-2 flex-wrap mt-3">
            {pills.map((p, i) => (
              <span key={i} className="px-4 py-1 bg-white text-black rounded font-semibold text-sm">{p}</span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-center gap-3 mt-4">
          <button
            onClick={() => goToDetail(manga)}
            title="Read Now"
            className="bg-white hover:bg-white/90 rounded-full h-11 px-6 flex items-center justify-center transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="black"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" /></svg>
          </button>
          <button
            onClick={shareManga}
            title="Share"
            className="w-10 h-10 rounded-full bg-white/[0.06] hover:bg-white/10 flex items-center justify-center text-white transition-colors"
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>
          </button>
        </div>
        {description && (
          <div className="mt-4 max-w-sm">
            <p className={`text-white/60 text-sm ${descExpanded ? "" : "line-clamp-1"}`}>{description}</p>
            {!descExpanded && (
              <button onClick={() => setDescExpanded(true)} className="mt-2 px-4 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/10 text-sm font-semibold text-white transition-colors">
                See Details
              </button>
            )}
          </div>
        )}
      </div>

      {/* ═══ DESKTOP HERO — poster + title/pills/description, pulled up over the banner ═══ */}
      <div key={`d-content-${current}`} className="hidden lg:block relative z-10 px-3 sm:px-4 -mt-[60px] sm:-mt-[90px]" style={{ animation: "ltv-hero-content-slide 1s ease-out" }}>
        <div className="flex items-start gap-3 sm:gap-4">
          {cover && (
            <div className="w-[130px] sm:w-[160px] md:w-[185px] aspect-[2/3] rounded-md overflow-hidden shrink-0 bg-white/10 shadow-2xl">
              <img src={cover} alt={title} className="w-full h-full object-cover" />
            </div>
          )}
          <div className="flex flex-col justify-end flex-1 min-w-0 pt-3 sm:pt-6">
            {nativeTitle && <p className="text-white/50 pb-1 line-clamp-1 w-[60%]">{nativeTitle}</p>}
            <h1
              className="font-karla text-2xl sm:text-3xl font-bold pb-3 bg-clip-text text-transparent"
              style={{ backgroundImage: TEXT_GRADIENT }}
            >
              {title}
            </h1>
            {pills.length > 0 && (
              <div className="flex items-center w-full gap-2 flex-wrap pb-4">
                {pills.map((p, i) => (
                  <span key={i} className="px-4 py-1 bg-white text-black rounded font-semibold">{p}</span>
                ))}
              </div>
            )}
            {description && (
              <div className="relative w-full max-w-3xl group">
                {!descExpanded && (
                  <div className="absolute z-30 flex items-end justify-center top-0 w-full h-full opacity-0 group-hover:opacity-100 bg-gradient-to-b from-transparent to-black to-95% transition-opacity duration-300">
                    <button type="button" onClick={() => setDescExpanded(true)} className="text-center font-bold text-white py-1 w-full">
                      Read More
                    </button>
                  </div>
                )}
                <p className={`text-white/60 ${descExpanded ? "" : "line-clamp-2"}`}>
                  {description}
                </p>
              </div>
            )}

            {/* Action row — Read Now, Share (nested here, not below the whole
                flex row, so it stays tight under the description instead of
                being pushed down by the poster's full height) */}
            <div className="flex flex-wrap items-center gap-2.5 mt-3">
              <button
                onClick={() => goToDetail(manga)}
                className="flex items-center gap-2 bg-white text-black font-bold rounded-full h-10 px-5 text-sm hover:bg-white/90 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="black"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" /></svg>
                Read Now
              </button>
              <button
                onClick={shareManga}
                title="Share"
                className="w-10 h-10 rounded-full bg-white/[0.06] hover:bg-white/10 flex items-center justify-center text-white transition-colors"
              >
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TOP TRENDING — Netflix-style ranking (mirrors anime-section-page)
   ═══════════════════════════════════════════════════════════════ */

type TrendingTab = "trending" | "topRated" | "newest";

function TopTrending({ trending, topRated, goToDetail }: {
  trending: EnrichedManga[];
  topRated: MangaEntry[];
  goToDetail: (m: any) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<TrendingTab>("trending");

  const newest = [...trending].slice(0, 10);
  const tabData: Record<TrendingTab, any[]> = {
    trending,
    topRated: topRated as any,
    newest: newest.length > 0 ? newest : trending,
  };
  const items = (tabData[tab] || trending).slice(0, 10);

  if (items.length === 0) return null;

  const scroll = (dir: "left" | "right") => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: dir === "right" ? 700 : -700, behavior: "smooth" });
    }
  };

  return (
    <section className="px-4 md:px-8 lg:px-8 py-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5" fill="currentColor" style={{ color: ACCENT }} viewBox="0 0 24 24">
            <path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z" />
          </svg>
          <h2
            className="font-karla text-xl font-bold bg-clip-text text-transparent"
            style={{ backgroundImage: TEXT_GRADIENT }}
          >
            Top Trending
          </h2>
          <div className="flex gap-1 ml-4">
            {([
              { id: "trending" as const, label: "Trending" },
              { id: "topRated" as const, label: "Top Rated" },
              { id: "newest" as const, label: "Newest" },
            ]).map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="px-3 py-1.5 text-xs font-semibold transition-colors"
                style={{
                  borderRadius: "4px",
                  background: tab === t.id ? ACCENT : "transparent",
                  color: tab === t.id ? "#fff" : "rgba(255,255,255,0.4)",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => scroll("left")} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button onClick={() => scroll("right")} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      </div>
      <div ref={scrollRef} className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
        {items.map((manga, idx) => {
          const cover = getCover(manga);
          const title = getTitle(manga);
          const score = getScore(manga);
          const rank = idx + 1;
          const accent = HOVER_TITLE_COLORS[idx % HOVER_TITLE_COLORS.length];
          return (
            <button
              key={`${tab}-${manga.id}-${idx}`}
              onClick={() => goToDetail(manga)}
              className="group shrink-0 text-left"
              style={{ width: "170px", ["--accent" as any]: accent }}
            >
              <div className="relative w-full aspect-[2/3] bg-white/5 overflow-visible ring-1 ring-transparent group-hover:ring-white/20 transition-all duration-300" style={{ borderRadius: "8px" }}>
                <div className="absolute inset-0 overflow-hidden" style={{ borderRadius: "8px" }}>
                  {cover ? (
                    <img src={cover} alt={title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/10 font-bold text-2xl">{title.charAt(0)}</div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/50 to-transparent" />
                </div>
                <span
                  className="absolute select-none"
                  style={{
                    fontSize: "75px",
                    fontStyle: "italic",
                    fontWeight: 900,
                    lineHeight: "0.85",
                    color: "#c8c8c8",
                    WebkitTextStroke: "2px #0a0a0a",
                    paintOrder: "stroke fill",
                    left: "4px",
                    bottom: "4px",
                    zIndex: 20,
                    fontFamily: "Arial Black, Impact, sans-serif",
                    letterSpacing: "-0.05em",
                    textShadow: "3px 3px 0 #0a0a0a",
                  }}
                >
                  {rank}
                </span>
                {score > 0 && (
                  <div className="absolute top-2 right-2 px-2 py-0.5 bg-black/80 backdrop-blur-sm text-xs font-bold text-white z-30" style={{ borderRadius: "3px" }}>
                    ★ {score}%
                  </div>
                )}
              </div>
              <div className="mt-2.5">
                <p className="font-karla text-sm font-semibold text-white truncate transition-colors duration-200 group-hover:text-[var(--accent)]">{title}</p>
                <p className="text-xs text-white/40 mt-0.5">
                  {manga.type?.toUpperCase() || "MANGA"}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════
   FEATURED MANGA — rounded card (mirrors anime-section-page)
   ═══════════════════════════════════════════════════════════════ */

function FeaturedMangaSection({ manga, goToDetail }: { manga: EnrichedManga; goToDetail: (m: any) => void }) {
  const title = getTitle(manga);
  const cover = getCover(manga);
  const banner = getBanner(manga);
  const score = getScore(manga);
  const description = getDescription(manga);
  const genres = getGenres(manga);
  const bgImage = banner || cover;

  return (
    <section className="px-4 md:px-8 lg:px-8 py-4">
      <div className="relative w-full overflow-hidden" style={{ borderRadius: "20px", minHeight: "300px" }}>
        {bgImage && (
          <img src={bgImage} alt="" className="object-cover" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} loading="lazy" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/50 to-black/20" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

        <div className="relative flex items-center gap-6 p-6 md:p-8 lg:p-10" style={{ zIndex: 10 }}>
          <div className="shrink-0 w-[120px] h-[170px] md:w-[150px] md:h-[210px] overflow-hidden" style={{ borderRadius: "12px" }}>
            {cover && <img src={cover} alt={title} className="w-full h-full object-cover" loading="lazy" />}
          </div>

          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="currentColor" style={{ color: ACCENT }} viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <span className="font-karla text-xs font-bold text-white/60 uppercase tracking-wider">Featured Manga</span>
              </div>
              <span className="font-karla px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-white/10 text-white/50 border border-white/10">
                Editor&apos;s Pick
              </span>
            </div>

            <h2
              className="font-karla text-2xl md:text-3xl lg:text-4xl font-extrabold bg-clip-text text-transparent leading-tight tracking-tight"
              style={{ backgroundImage: TEXT_GRADIENT }}
            >
              {title}
            </h2>

            <div className="flex items-center gap-3 flex-wrap">
              {score > 0 && (
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg" style={{ background: `${ACCENT}20`, border: `1px solid ${ACCENT}40` }}>
                  <svg className="w-3.5 h-3.5" fill="currentColor" style={{ color: ACCENT }} viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <span className="text-sm font-bold" style={{ color: ACCENT }}>{score}%</span>
                </div>
              )}
              {genres.slice(0, 3).map(g => (
                <span key={g} className="px-2.5 py-1 rounded-lg text-xs font-medium text-white/60 bg-white/5 border border-white/10">
                  {g}
                </span>
              ))}
            </div>

            {description && (
              <p className="font-karla font-light text-sm text-white/50 leading-relaxed line-clamp-2 max-w-xl">
                {description.slice(0, 200)}{description.length > 200 ? "..." : ""}
              </p>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={() => goToDetail(manga)}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-white text-black font-bold text-sm hover:bg-white/90 transition-colors"
                style={{ borderRadius: "8px" }}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
                </svg>
                Read Now
              </button>
              <button
                onClick={() => goToDetail(manga)}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-white/10 text-white font-bold text-sm hover:bg-white/20 transition-colors border border-white/20 backdrop-blur-sm"
                style={{ borderRadius: "8px" }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                Details
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════
   POSTER CARD (mirrors anime-section-page PosterCard)
   ═══════════════════════════════════════════════════════════════ */

/** `fixedWidth` is for the horizontal carousels, where each card must keep its
 *  own width and not shrink. In a CSS grid the column already sets the width,
 *  so the card must be w-full/min-w-0 there — otherwise it overflows its cell
 *  on narrow screens and the titles collide. */
function PosterCard({ manga, goToDetail, fixedWidth = false }: { manga: MangaEntry; goToDetail: (m: any) => void; fixedWidth?: boolean }) {
  const title = getTitle(manga);
  const cover = getCover(manga);
  const score = getScore(manga);

  const addToLibrary = useAppStore(s => s.addToLibrary);
  const removeFromLibrary = useAppStore(s => s.removeFromLibrary);
  // Subscribing to `library` (not calling isInLibrary()) is what makes the
  // button re-render the moment it's toggled.
  const saved = useAppStore(s => s.library.some(e => e.key === `manga:${manga.id}`));

  const toggleSaved = (e: React.MouseEvent) => {
    e.stopPropagation(); // don't open the detail page
    if (saved) {
      removeFromLibrary("manga", manga.id);
    } else {
      addToLibrary({
        kind: "manga",
        mediaId: manga.id,
        title,
        cover,
        meta: manga.type || undefined,
        score: score > 0 ? score : undefined,
        resume: { page: "manga-detail", id: manga.id },
      });
    }
  };

  return (
    /* The wrapper is a plain div so the save button can sit *beside* the main
       button rather than inside it — a <button> inside a <button> is invalid
       HTML and React will not hydrate it correctly. */
    <div className={`group relative ${fixedWidth ? "shrink-0 w-[170px] md:w-[185px]" : "w-full min-w-0"}`}>
      <button onClick={() => goToDetail(manga)} className="w-full text-left">
        <div
          className="relative w-full aspect-[3/4] bg-white/5 overflow-hidden ring-1 ring-white/[0.06] group-hover:ring-white/25 group-hover:-translate-y-1 group-hover:shadow-xl group-hover:shadow-black/60 transition-all duration-300"
          style={{ borderRadius: "6px" }}
        >
          {cover ? (
            <img src={cover} alt={title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/10 font-bold text-2xl">{title.charAt(0)}</div>
          )}

          {/* Darkening wash so the hover controls stay readable on bright covers */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

          {score > 0 && (
            <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/80 backdrop-blur-sm text-xs font-bold text-white" style={{ borderRadius: "3px" }}>
              ★ {score}%
            </div>
          )}
          {manga.type && (
            <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-black/80 backdrop-blur-sm text-[8px] font-bold text-white/80 uppercase" style={{ borderRadius: "3px" }}>
              {manga.type}
            </div>
          )}

          {/* "Read" pill slides up on hover */}
          <div className="absolute inset-x-0 bottom-0 p-2 flex justify-end opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 pointer-events-none">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white text-black text-[10px] font-bold">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" /></svg>
              Read
            </span>
          </div>
        </div>
      </button>

      {/* Save / unsave. Always visible on touch (no hover there), fades in on
          pointer devices. */}
      <button
        onClick={toggleSaved}
        aria-label={saved ? `Remove ${title} from My List` : `Add ${title} to My List`}
        title={saved ? "Remove from My List" : "Add to My List"}
        className={`absolute top-2 right-2 z-10 w-7 h-7 rounded-full flex items-center justify-center border backdrop-blur-md transition-all duration-200 hover:scale-110 lg:opacity-0 lg:group-hover:opacity-100 ${
          saved
            ? "bg-white text-black border-white opacity-100 lg:opacity-100"
            : "bg-black/70 text-white border-white/25 hover:bg-black/90"
        }`}
      >
        {saved ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        )}
      </button>

      <button onClick={() => goToDetail(manga)} className="w-full text-left mt-2 block">
        <p className="font-karla text-sm font-semibold text-white truncate group-hover:text-white/80 transition-colors">{title}</p>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-white/40">
          {manga.status && <span className="truncate">{manga.status}</span>}
        </div>
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   CAROUSEL (mirrors anime-section-page Carousel)
   ═══════════════════════════════════════════════════════════════ */

function Carousel({ title, items, goToDetail }: {
  title: string;
  items: MangaEntry[];
  goToDetail: (m: any) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: "left" | "right") => {
    if (scrollRef.current) {
      const amount = 600;
      scrollRef.current.scrollBy({ left: dir === "right" ? amount : -amount, behavior: "smooth" });
    }
  };

  if (items.length === 0) return null;

  return (
    <section className="px-4 md:px-8 lg:px-8 py-4">
      <div className="flex items-center justify-between mb-4">
        <h2
          className="font-karla text-xl font-bold bg-clip-text text-transparent"
          style={{ backgroundImage: TEXT_GRADIENT }}
        >
          {title}
        </h2>
        <div className="flex gap-2">
          <button onClick={() => scroll("left")} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button onClick={() => scroll("right")} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      </div>
      <div ref={scrollRef} className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
        {items.map(m => (
          <PosterCard key={m.id} manga={m} goToDetail={goToDetail} fixedWidth />
        ))}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════
   DISCOVER — tabs + grid + sidebar (mirrors anime-section-page)
   ═══════════════════════════════════════════════════════════════ */

type DiscoverTab = "trending" | "topRated" | "popular";

function Discover({ trending, popular, topRated, recent, goToDetail, typeFilter, sort, setSort, applyFilters }: {
  trending: EnrichedManga[];
  popular: MangaEntry[];
  topRated: MangaEntry[];
  recent: MangaEntry[];
  goToDetail: (m: any) => void;
  typeFilter: string;
  sort: "latest" | "rating" | "az";
  setSort: (s: "latest" | "rating" | "az") => void;
  applyFilters: (items: MangaEntry[]) => MangaEntry[];
}) {
  const [tab, setTab] = useState<DiscoverTab>("trending");
  const tabData = { trending, topRated, popular };
  const items = applyFilters(tabData[tab]);

  return (
    <section className="px-4 md:px-8 lg:px-8 py-4">
      <div className="grid lg:grid-cols-[1fr_380px] gap-1">
        {/* Left: Discover tabs + grid */}
        <div>
          {/* Mobile stacks the title above the tab/sort row so nothing is forced
              off-screen; from sm up it's the original single row. */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mb-4">
            <h2
              className="font-karla text-xl font-bold bg-clip-text text-transparent"
              style={{ backgroundImage: TEXT_GRADIENT }}
            >
              Discover
            </h2>
            <div className="flex items-center gap-2 min-w-0">
              {/* Tabs scroll sideways on narrow screens instead of wrapping/clipping */}
              <div className="flex gap-1 overflow-x-auto min-w-0" style={{ scrollbarWidth: "none" }}>
                {([
                  { id: "trending" as const, label: "Trending" },
                  { id: "topRated" as const, label: "Top Rated" },
                  { id: "popular" as const, label: "Most Popular" },
                ]).map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className="px-3 py-1.5 text-xs font-semibold transition-colors shrink-0 whitespace-nowrap"
                    style={{
                      borderRadius: "4px",
                      background: tab === t.id ? ACCENT : "transparent",
                      color: tab === t.id ? "#fff" : "rgba(255,255,255,0.4)",
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {/* Sort dropdown */}
              <select
                value={sort}
                onChange={e => setSort(e.target.value as any)}
                className="ml-auto shrink-0 px-2 py-1.5 text-xs font-semibold bg-white/5 border border-white/10 text-white/60 focus:outline-none"
                style={{ borderRadius: "4px" }}
              >
                <option value="latest">Latest</option>
                <option value="rating">Rating</option>
                <option value="az">A → Z</option>
              </select>
            </div>
          </div>

          {items.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-3">
              {items.slice(0, 12).map(m => (
                <PosterCard key={m.id} manga={m} goToDetail={goToDetail} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-white/40 text-sm">No manga match this filter.</div>
          )}
        </div>

        {/* Right: Top Manga + Recent Updates sidebar.
            The 52px offset only exists to line the sidebar up with the Discover
            grid past the header row — on mobile the sidebar stacks underneath,
            so the offset would just be a stray gap. */}
        <div className="flex flex-col gap-3 lg:mt-[52px]">
          {/* Top Manga */}
          <div>
            <div className="flex flex-col gap-2 rounded-xl border border-white/[0.08] bg-[#0D0D0D] p-2">
              <h3
                className="font-karla text-sm font-extrabold bg-clip-text text-transparent uppercase tracking-wider px-1 pt-1 pb-2 border-b border-white/[0.06]"
                style={{ backgroundImage: TEXT_GRADIENT }}
              >
                Top Manga
              </h3>
              {topRated.slice(0, 5).map(m => {
                const cover = getCover(m);
                const title = getTitle(m);
                const score = getScore(m);
                return (
                  <button
                    key={m.id}
                    onClick={() => goToDetail(m)}
                    className="relative flex items-center gap-2.5 text-left group overflow-hidden rounded-lg border border-white/[0.06] bg-[#0D0D0D] transition-all duration-300 hover:border-white/20"
                  >
                    {cover && (
                      <img src={cover} alt="" className="absolute inset-0 w-full h-full object-cover transition-all duration-500 group-hover:grayscale-0 group-hover:brightness-50" style={{ filter: "grayscale(1) brightness(0.25)", opacity: 0.6 }} loading="lazy" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-r from-[#0D0D0D] via-[#0D0D0D]/70 to-transparent transition-opacity duration-300 group-hover:via-[#0D0D0D]/50" />
                    <div className="relative shrink-0 w-[64px] h-[90px] overflow-hidden rounded z-10 transition-transform duration-300 group-hover:scale-105">
                      {cover && <img src={cover} alt="" className="w-full h-full object-cover" loading="lazy" />}
                    </div>
                    <div className="relative min-w-0 flex-1 z-10 py-2 pr-2 transition-transform duration-300 group-hover:translate-x-1">
                      <p className="font-karla text-sm font-bold text-white truncate group-hover:text-white transition-colors">{title}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 text-xs text-white/40 flex-wrap">
                        {m.type && <span className="px-1 py-0.5 rounded bg-white/10 text-white/50 font-medium uppercase">{m.type}</span>}
                        {m.status && <span>{m.status}</span>}
                        {score > 0 && (
                          <span className="flex items-center gap-0.5" style={{ color: ACCENT }}>
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                            {score}%
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Recent Updates */}
          <div>
            <div className="flex flex-col gap-2 rounded-xl border border-white/[0.08] bg-[#0D0D0D] p-2">
              <h3
                className="font-karla text-sm font-extrabold bg-clip-text text-transparent uppercase tracking-wider px-1 pt-1 pb-2 border-b border-white/[0.06]"
                style={{ backgroundImage: TEXT_GRADIENT }}
              >
                Recent Updates
              </h3>
              {recent.slice(0, 5).map(m => {
                const cover = getCover(m);
                const title = getTitle(m);
                return (
                  <button
                    key={m.id}
                    onClick={() => goToDetail(m)}
                    className="relative flex items-center gap-2.5 text-left group overflow-hidden rounded-lg border border-white/[0.06] bg-[#0D0D0D] transition-all duration-300 hover:border-white/20"
                  >
                    {cover && (
                      <img src={cover} alt="" className="absolute inset-0 w-full h-full object-cover transition-all duration-500 group-hover:grayscale-0 group-hover:brightness-50" style={{ filter: "grayscale(1) brightness(0.25)", opacity: 0.6 }} loading="lazy" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-r from-[#0D0D0D] via-[#0D0D0D]/70 to-transparent transition-opacity duration-300 group-hover:via-[#0D0D0D]/50" />
                    <div className="relative shrink-0 w-[64px] h-[90px] overflow-hidden rounded z-10 transition-transform duration-300 group-hover:scale-105">
                      {cover && <img src={cover} alt="" className="w-full h-full object-cover" loading="lazy" />}
                    </div>
                    <div className="relative min-w-0 flex-1 z-10 py-2 pr-2 transition-transform duration-300 group-hover:translate-x-1">
                      <p className="font-karla text-sm font-bold text-white truncate group-hover:text-white transition-colors">{title}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 text-xs text-white/40 flex-wrap">
                        {m.type && <span className="px-1 py-0.5 rounded bg-white/10 text-white/50 font-medium uppercase">{m.type}</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
