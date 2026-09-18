"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAppStore } from "./store";

/* ═══════════════════════════════════════════════════════════════
   LUFFYTV MANGA — v8 (rebuilt from scratch — clean editorial design)
   ─────────────────────────────────────────────────────────────────
   Design philosophy
   • Quiet, editorial typography — let the cover art breathe
   • One accent color used sparingly (only for active states + scores)
   • Generous whitespace, no competing chrome
   • Subtle 8px rounded corners (not the old mixed 3/4/6/8/12/20 mess)
   • Smooth hover lifts, no aggressive scale transforms

   Data layer (unchanged from v7)
   • Home:        /api/manga/home
   • Enrichment:  /api/manga/meta?id=… → /api/manga/banners?ids=…
   • Search:      /api/manga/search?q=…
   • Sub-pages:   /api/manga/{popular,top-rated,recently-added}
   ═══════════════════════════════════════════════════════════════ */

const ACCENT = "#1e88ff";
const ACCENT_DIM = "rgba(30,136,255,0.16)";

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
function getTypeColor(type?: string): string {
  if (!type) return TYPE_COLORS.manga;
  return TYPE_COLORS[type.toLowerCase()] || TYPE_COLORS.manga;
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

export default function MangaPage() {
  const navigate = useAppStore(s => s.navigate);
  const sectionSubPage = useAppStore(s => s.sectionSubPage);

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

  const [subPageData, setSubPageData] = useState<MangaEntry[]>([]);
  const [subPageLoading, setSubPageLoading] = useState(false);

  const [typeFilter] = useState<string>("all");
  const [sort, setSort] = useState<"latest" | "rating" | "az">("latest");

  // ── Load home ──
  // Show the page immediately with home data (posters from /api/manga/home).
  // Enrichment (AniList banners, scores, genres) runs in the background
  // and swaps in when ready — the user sees content instantly.
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/manga/home");
        if (res.ok) {
          const data = await res.json();
          const secs = data.sections || [];
          setSections(secs);
          // Immediately set enriched with poster data so the page renders NOW.
          // No waiting for AniList enrichment — use poster as banner fallback.
          const seen = new Set<string>();
          const candidates: EnrichedManga[] = [];
          for (const m of secs.flatMap((s: MangaSection) => s.items)) {
            if (seen.has(m.id)) continue;
            seen.add(m.id);
            candidates.push({
              ...m,
              banner: m.poster || m.cover || "",
              anilistScore: m.rating || 0,
              anilistGenres: m.genres || [],
              anilistDescription: m.description || "",
              anilistStatus: m.status || "",
              anilistFormat: m.type || "",
            });
          }
          candidates.sort((a, b) => (b.rating || 0) - (a.rating || 0));
          setEnriched(candidates.slice(0, 10));
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, []);

  // ── Background enrichment (AniList banners, scores) ──
  // Runs AFTER the page is already visible. Swaps in real AniList banner
  // images when ready. If it fails, the poster-based fallback stays.
  useEffect(() => {
    if (enriched.length === 0) return;
    let cancelled = false;
    async function enrich() {
      try {
        // Batch: fetch meta for top 5 only (not 8) to reduce latency
        const top = enriched.slice(0, 5);
        const metaResults = await Promise.all(
          top.map(async m => {
            try {
              const res = await fetch(`/api/manga/meta?id=${encodeURIComponent(m.id)}`);
              if (res.ok) {
                const d = await res.json();
                const alId = d.anilistId ? parseInt(String(d.anilistId), 10) : undefined;
                return { ...m, anilistId: alId && !isNaN(alId) ? alId : undefined };
              }
            } catch { /* ignore */ }
            return m;
          }),
        );
        const anilistIds = metaResults
          .map(m => m.anilistId)
          .filter((id): id is number => typeof id === "number" && id > 0);
        if (anilistIds.length === 0 || cancelled) return;
        const bannerRes = await fetch(`/api/manga/banners?ids=${anilistIds.join(",")}`);
        if (!bannerRes.ok || cancelled) return;
        const bannerData = await bannerRes.json();
        const banners: Record<number, any> = bannerData.banners || {};
        // Only update items that got a real banner — keep poster fallback for others
        setEnriched(prev => prev.map(m => {
          const al = m.anilistId ? banners[m.anilistId] : null;
          if (!al) return m;
          return {
            ...m,
            banner: al.banner || m.banner,
            anilistScore: al.score || m.anilistScore,
            anilistGenres: al.genres || m.anilistGenres,
            anilistDescription: al.description || m.anilistDescription,
            anilistStatus: al.status || m.anilistStatus,
            anilistFormat: al.format || m.anilistFormat,
          };
        }));
      } catch {
        // Enrichment failed — keep poster-based fallback (page already visible)
      }
    }
    enrich();
    return () => { cancelled = true; };
  }, [enriched.length]);

  // ── Sub-page data ──
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
        if (sectionSubPage === "popular") endpoint = "/api/manga/popular";
        else if (sectionSubPage === "top-rated") endpoint = "/api/manga/top-rated";
        else if (sectionSubPage === "recently-added") endpoint = "/api/manga/recently-added";
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
  const trending = enriched.length > 0 ? enriched : allItems.slice(0, 12);
  const topRated = [...allItems].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 10);
  const popular = [...allItems].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 12);
  const recent = allItems.slice(0, 12);

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
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-white/10 border-t-[#1e88ff] rounded-full animate-spin" />
          <p className="font-karla text-xs text-white/40 uppercase tracking-[0.2em]">Loading Manga</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white pb-16">
      {/* ═══ PAGE HEADER ═══ */}
      <header className="px-4 md:px-8 lg:px-12 pt-24 pb-2">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <span className="block w-1 h-7 rounded-full bg-[#1e88ff]" />
            <h1 className="font-karla text-2xl md:text-3xl font-extrabold text-white tracking-tight">
              Manga
            </h1>
          </div>
          <p className="font-karla text-sm text-white/40 ml-4">
            Read manga, manhwa &amp; manhua — free, no signup.
          </p>
        </div>
      </header>

      {/* ═══ SEARCH BAR ═══ */}
      <section className="px-4 md:px-8 lg:px-12 pt-6">
        <div className="max-w-3xl mx-auto">
          <SearchBar
            value={searchQuery}
            onChange={onSearchChange}
            onClear={() => {
              setSearchQuery("");
              setSearchMode(false);
              setSearchResults([]);
            }}
            searching={searching}
          />
        </div>
      </section>

      {/* ═══ SEARCH RESULTS ═══ */}
      {searchMode ? (
        <section className="px-4 md:px-8 lg:px-12 py-6 max-w-7xl mx-auto">
          <SectionHeader
            title={`Search Results${searchResults.length > 0 ? ` · ${searchResults.length}` : ""}`}
            subtitle={searching ? "Looking up manga…" : `Matches for “${searchQuery}”`}
          />
          {searchResults.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-4">
              {searchResults.map(m => (
                <PosterCard key={m.id} manga={m} goToDetail={goToDetail} />
              ))}
            </div>
          ) : !searching ? (
            <EmptyState message={`No manga found for “${searchQuery}”.`} />
          ) : null}
        </section>
      ) : sectionSubPage !== "home" ? (
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
   SEARCH BAR — minimal pill, focus ring, clearable
   ═══════════════════════════════════════════════════════════════ */

function SearchBar({ value, onChange, onClear, searching }: {
  value: string;
  onChange: (v: string) => void;
  onClear: () => void;
  searching: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="relative group">
      <div className="absolute inset-0 rounded-full border border-white/[0.06] group-focus-within:border-[#1e88ff]/40 transition-colors pointer-events-none" />
      <div className="relative flex items-center gap-3 px-5 py-3 bg-white/[0.03] rounded-full">
        <svg className="w-4 h-4 text-white/40 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Search manga, manhwa, manhua…"
          className="flex-1 bg-transparent text-sm text-white placeholder-white/30 focus:outline-none font-karla"
        />
        {searching ? (
          <div className="w-4 h-4 border-2 border-white/10 border-t-[#1e88ff] rounded-full animate-spin shrink-0" />
        ) : value ? (
          <button
            onClick={onClear}
            aria-label="Clear search"
            className="w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/60 hover:text-white transition-colors shrink-0"
          >
            <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M5 5l5 5M10 5l-5 5" /></svg>
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SECTION HEADER — eyebrow + title + optional subtitle
   ═══════════════════════════════════════════════════════════════ */

function SectionHeader({ title, subtitle, accent }: { title: string; subtitle?: string; accent?: boolean }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2.5">
        <span className={`block w-1 h-5 rounded-full ${accent ? "bg-[#1e88ff]" : "bg-white/30"}`} />
        <h2 className="font-karla text-lg md:text-xl font-bold text-white tracking-tight">
          {title}
        </h2>
      </div>
      {subtitle && <p className="font-karla text-xs text-white/40 mt-1.5 ml-3.5">{subtitle}</p>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TOP TRENDING — clean ranking rail with elegant big numerals
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
      scrollRef.current.scrollBy({ left: dir === "right" ? 720 : -720, behavior: "smooth" });
    }
  };

  const tabs: { id: TrendingTab; label: string }[] = [
    { id: "trending", label: "Trending" },
    { id: "topRated", label: "Top Rated" },
    { id: "newest", label: "Newest" },
  ];

  return (
    <section className="px-4 md:px-8 lg:px-12 py-8 max-w-7xl mx-auto">
      <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div className="flex items-end gap-4">
          <SectionHeader title="Top Trending" accent />
          <div className="flex gap-1 pb-1">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="font-karla px-3 py-1.5 text-xs font-semibold transition-colors rounded-full"
                style={{
                  background: tab === t.id ? ACCENT_DIM : "transparent",
                  color: tab === t.id ? ACCENT : "rgba(255,255,255,0.4)",
                  border: `1px solid ${tab === t.id ? `${ACCENT}40` : "transparent"}`,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => scroll("left")}
            aria-label="Scroll left"
            className="w-9 h-9 rounded-full bg-white/[0.04] border border-white/10 hover:bg-white/10 hover:border-white/20 flex items-center justify-center text-white/60 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button
            onClick={() => scroll("right")}
            aria-label="Scroll right"
            className="w-9 h-9 rounded-full bg-white/[0.04] border border-white/10 hover:bg-white/10 hover:border-white/20 flex items-center justify-center text-white/60 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
        {items.map((manga, idx) => {
          const cover = getCover(manga);
          const title = getTitle(manga);
          const score = getScore(manga);
          const rank = idx + 1;
          return (
            <button
              key={`${tab}-${manga.id}-${idx}`}
              onClick={() => goToDetail(manga)}
              className="group shrink-0 text-left relative"
              style={{ width: "180px" }}
            >
              <div className="flex items-end gap-3 mb-2">
                {/* Big rank number — minimal stroke style */}
                <span
                  className="font-karla font-black text-white/15 group-hover:text-white/30 transition-colors leading-none select-none"
                  style={{ fontSize: "84px", letterSpacing: "-0.06em", lineHeight: "0.8" }}
                >
                  {rank}
                </span>
                {/* Poster */}
                <div className="relative w-[120px] aspect-[2/3] rounded-lg overflow-hidden bg-white/5 ring-1 ring-white/10 group-hover:ring-white/25 transition-all duration-300">
                  {cover ? (
                    <img src={cover} alt={title} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/10 font-bold text-3xl">{title.charAt(0)}</div>
                  )}
                  {score > 0 && (
                    <div
                      className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-0.5"
                      style={{ background: ACCENT_DIM, color: ACCENT, backdropFilter: "blur(8px)" }}
                    >
                      <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                      {score}
                    </div>
                  )}
                </div>
              </div>
              <p className="font-karla text-sm font-semibold text-white truncate group-hover:text-white/80 transition-colors">
                {title}
              </p>
              <p className="font-karla text-xs text-white/40 mt-0.5">
                {manga.type?.toUpperCase() || "MANGA"}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════
   POSTER CARD — clean grid card with hover lift
   ═══════════════════════════════════════════════════════════════ */

function PosterCard({ manga, goToDetail, fixedWidth = false }: { manga: MangaEntry; goToDetail: (m: any) => void; fixedWidth?: boolean }) {
  const title = getTitle(manga);
  const cover = getCover(manga);
  const score = getScore(manga);

  const addToLibrary = useAppStore(s => s.addToLibrary);
  const removeFromLibrary = useAppStore(s => s.removeFromLibrary);
  const saved = useAppStore(s => s.library.some(e => e.key === `manga:${manga.id}`));

  const toggleSaved = (e: React.MouseEvent) => {
    e.stopPropagation();
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
    <div className={`group relative ${fixedWidth ? "shrink-0 w-[170px] md:w-[185px]" : "w-full min-w-0"}`}>
      <button onClick={() => goToDetail(manga)} className="w-full text-left block">
        <div className="relative w-full aspect-[3/4] bg-white/[0.03] overflow-hidden ring-1 ring-white/[0.06] group-hover:ring-white/20 transition-all duration-300 rounded-lg">
          {cover ? (
            <img src={cover} alt={title} className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/10 font-bold text-3xl">{title.charAt(0)}</div>
          )}

          {/* Hover gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

          {/* Score pill — bottom-left */}
          {score > 0 && (
            <div
              className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-0.5"
              style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)", color: ACCENT }}
            >
              <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              {score}
            </div>
          )}

          {/* Type badge — top-left */}
          {manga.type && (
            <div
              className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
              style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)", color: getTypeColor(manga.type) }}
            >
              {manga.type}
            </div>
          )}

          {/* Read pill on hover */}
          <div className="absolute inset-x-0 bottom-0 p-2 flex justify-center opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 pointer-events-none">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white text-black text-[10px] font-bold">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" /></svg>
              Read
            </span>
          </div>
        </div>
      </button>

      {/* Save button */}
      <button
        onClick={toggleSaved}
        aria-label={saved ? `Remove ${title} from My List` : `Add ${title} to My List`}
        title={saved ? "Remove from My List" : "Add to My List"}
        className={`absolute top-2 right-2 z-10 w-7 h-7 rounded-full flex items-center justify-center border backdrop-blur-md transition-all duration-200 lg:opacity-0 lg:group-hover:opacity-100 ${
          saved
            ? "bg-white text-black border-white opacity-100 lg:opacity-100"
            : "bg-black/70 text-white border-white/25 hover:bg-black/90"
        }`}
      >
        {saved ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        )}
      </button>

      {/* Title */}
      <button onClick={() => goToDetail(manga)} className="w-full text-left mt-2.5 block">
        <p className="font-karla text-sm font-semibold text-white truncate group-hover:text-white/80 transition-colors">{title}</p>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-white/40">
          {manga.status && <span className="truncate">{manga.status}</span>}
        </div>
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   CAROUSEL — horizontal rail with section header + arrows
   ═══════════════════════════════════════════════════════════════ */

function Carousel({ title, items, goToDetail }: {
  title: string;
  items: MangaEntry[];
  goToDetail: (m: any) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: "left" | "right") => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: dir === "right" ? 600 : -600, behavior: "smooth" });
    }
  };

  if (items.length === 0) return null;

  return (
    <section className="px-4 md:px-8 lg:px-12 py-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5 gap-4">
        <SectionHeader title={title} />
        <div className="flex gap-2">
          <button
            onClick={() => scroll("left")}
            aria-label="Scroll left"
            className="w-9 h-9 rounded-full bg-white/[0.04] border border-white/10 hover:bg-white/10 hover:border-white/20 flex items-center justify-center text-white/60 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button
            onClick={() => scroll("right")}
            aria-label="Scroll right"
            className="w-9 h-9 rounded-full bg-white/[0.04] border border-white/10 hover:bg-white/10 hover:border-white/20 flex items-center justify-center text-white/60 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      </div>
      <div ref={scrollRef} className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
        {items.map(m => (
          <PosterCard key={m.id} manga={m} goToDetail={goToDetail} fixedWidth />
        ))}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════
   DISCOVER — grid + sidebar with Top Manga + Recent Updates
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

  const tabs: { id: DiscoverTab; label: string }[] = [
    { id: "trending", label: "Trending" },
    { id: "topRated", label: "Top Rated" },
    { id: "popular", label: "Most Popular" },
  ];

  return (
    <section className="px-4 md:px-8 lg:px-12 py-8 max-w-7xl mx-auto">
      <div className="grid lg:grid-cols-[1fr_360px] gap-8">
        {/* Left: grid */}
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-6">
            <SectionHeader title="Discover" accent />
            <div className="flex items-center gap-2 ml-auto">
              <div className="flex gap-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                {tabs.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className="font-karla px-3 py-1.5 text-xs font-semibold transition-colors rounded-full shrink-0 whitespace-nowrap"
                    style={{
                      background: tab === t.id ? ACCENT_DIM : "transparent",
                      color: tab === t.id ? ACCENT : "rgba(255,255,255,0.4)",
                      border: `1px solid ${tab === t.id ? `${ACCENT}40` : "transparent"}`,
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <select
                value={sort}
                onChange={e => setSort(e.target.value as any)}
                className="font-karla px-3 py-1.5 text-xs font-semibold bg-white/[0.04] border border-white/10 text-white/60 focus:outline-none focus:border-white/20 rounded-full"
              >
                <option value="latest">Latest</option>
                <option value="rating">Rating</option>
                <option value="az">A → Z</option>
              </select>
            </div>
          </div>

          {items.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {items.slice(0, 12).map(m => (
                <PosterCard key={m.id} manga={m} goToDetail={goToDetail} />
              ))}
            </div>
          ) : (
            <EmptyState message="No manga match this filter." />
          )}
        </div>

        {/* Right: sidebar */}
        <aside className="flex flex-col gap-5">
          <SidebarCard title="Top Manga">
            {topRated.slice(0, 5).map((m, i) => (
              <SidebarRow key={m.id} manga={m} goToDetail={goToDetail} rank={i + 1} />
            ))}
          </SidebarCard>

          <SidebarCard title="Recent Updates">
            {recent.slice(0, 5).map(m => (
              <SidebarRow key={m.id} manga={m} goToDetail={goToDetail} />
            ))}
          </SidebarCard>
        </aside>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SIDEBAR CARD — clean panel with header + rows
   ═══════════════════════════════════════════════════════════════ */

function SidebarCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#0D0D0D] p-3">
      <h3 className="font-karla text-xs font-bold uppercase tracking-[0.18em] text-white/40 px-2 pb-3 mb-2 border-b border-white/[0.06]">
        {title}
      </h3>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function SidebarRow({ manga, goToDetail, rank }: { manga: MangaEntry; goToDetail: (m: any) => void; rank?: number }) {
  const cover = getCover(manga);
  const title = getTitle(manga);
  const score = getScore(manga);
  return (
    <button
      onClick={() => goToDetail(manga)}
      className="group flex items-center gap-3 text-left p-2 rounded-lg hover:bg-white/[0.04] transition-colors"
    >
      {rank && (
        <span className="font-karla text-sm font-black text-white/20 group-hover:text-white/40 transition-colors w-5 text-center">
          {rank}
        </span>
      )}
      <div className="shrink-0 w-12 h-16 rounded-md overflow-hidden bg-white/5 ring-1 ring-white/[0.06]">
        {cover && <img src={cover} alt="" className="w-full h-full object-cover" loading="lazy" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-karla text-sm font-semibold text-white truncate group-hover:text-white/80 transition-colors">{title}</p>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {manga.type && (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
              style={{ background: `${getTypeColor(manga.type)}20`, color: getTypeColor(manga.type) }}
            >
              {manga.type}
            </span>
          )}
          {score > 0 && (
            <span className="font-karla text-[10px] text-white/40 flex items-center gap-0.5">
              <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20" style={{ color: ACCENT }}>
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              {score}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SUB-PAGE GRID — for Popular / Top Rated / Recently Added
   ═══════════════════════════════════════════════════════════════ */

function SubPageGrid({ title, items, loading, goToDetail }: {
  title: string;
  items: MangaEntry[];
  loading: boolean;
  goToDetail: (m: any) => void;
}) {
  if (loading) {
    return (
      <section className="px-4 md:px-8 lg:px-12 py-8 max-w-7xl mx-auto">
        <SectionHeader title={title} accent />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] rounded-lg bg-white/[0.03] animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="px-4 md:px-8 lg:px-12 py-8 max-w-7xl mx-auto">
      <SectionHeader
        title={title}
        subtitle={items.length > 0 ? `${items.length} titles` : undefined}
        accent
      />
      {items.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {items.map(m => (
            <PosterCard key={m.id} manga={m} goToDetail={goToDetail} />
          ))}
        </div>
      ) : (
        <EmptyState message="No manga found." />
      )}
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════
   EMPTY STATE — friendly message
   ═══════════════════════════════════════════════════════════════ */

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-16 px-4">
      <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
        <svg className="w-5 h-5 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        </svg>
      </div>
      <p className="font-karla text-sm text-white/40">{message}</p>
    </div>
  );
}
