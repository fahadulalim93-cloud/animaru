"use client";

import { useState, useEffect } from "react";
import { useAppStore } from "./store";
import { coverUrl, type Novel } from "@/lib/novel-api";
import { Flame, Clock, Tag, Sparkles, Search as SearchIcon } from "lucide-react";

// ============================================================
// NOVEL PAGE — Browse, search, and discover novels
// Black + white theme (matches LuffyTV site)
// Powered by novelarchive.cc API
// ============================================================

const GRID = "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4";

// Same accent + heading gradient the anime/manga sections use, so the novel
// section doesn't read as a different site.
const ACCENT = "#1e88ff";
const TEXT_GRADIENT = "linear-gradient(180deg, #ffffff 0%, #a3a3a3 100%)";

// ── Novel Card ──
function NovelCard({ novel, onClick }: { novel: Novel; onClick: (n: Novel) => void }) {
  const cover = coverUrl(novel, 320);
  const genres = (novel.genres || "").split(",").filter(Boolean).slice(0, 2);
  const totalChapters = parseInt(novel.total_chapters || "0") || 0;
  const isOngoing = novel.release_status === "ongoing" || novel.ongoing === "yes";

  return (
    <button
      onClick={() => onClick(novel)}
      className="group relative bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.16] rounded-xl overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/60 text-left w-full flex flex-col"
    >
      {/* Cover (3:4) */}
      <div className="relative aspect-[3/4] bg-white/[0.04] overflow-hidden">
        {cover ? (
          <img
            src={cover}
            alt={novel.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-10 h-10 text-white/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
            </svg>
          </div>
        )}

        {/* Gradient overlays for badge legibility */}
        <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />

        {/* Ongoing badge — top-left */}
        {isOngoing && (
          <span className="absolute top-2 left-2 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-500/90 text-white backdrop-blur-sm">
            Ongoing
          </span>
        )}

        {/* Rating badge — top-right */}
        {novel.rating > 0 && (
          <span className="absolute top-2 right-2 flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-black/80 text-white backdrop-blur-sm">
            <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            {novel.rating.toFixed(1)}
          </span>
        )}

        {/* Chapter count — bottom-right of cover */}
        {totalChapters > 0 && (
          <span className="absolute bottom-2 right-2 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-black/70 text-white/80 backdrop-blur-sm">
            {totalChapters > 999 ? `${(totalChapters / 1000).toFixed(1)}k` : totalChapters} ch
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-2.5 sm:p-3 flex-1 flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-white line-clamp-2 leading-snug group-hover:text-white transition-colors">
          {novel.title}
        </h3>
        {novel.author && (
          <p className="text-[11px] text-white/40 truncate">{novel.author}</p>
        )}
        {genres.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-auto pt-1.5">
            {genres.map(g => (
              <span
                key={g}
                className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-white/[0.06] text-white/55 border border-white/[0.06] uppercase tracking-wide"
              >
                {g}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

function NovelCardSkeleton() {
  return (
    <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden animate-pulse">
      <div className="aspect-[3/4] bg-white/[0.04]" />
      <div className="p-2.5 sm:p-3 space-y-2">
        <div className="h-3 bg-white/[0.04] rounded w-full" />
        <div className="h-3 bg-white/[0.04] rounded w-2/3" />
        <div className="h-2 bg-white/[0.04] rounded w-1/2" />
      </div>
    </div>
  );
}

// ============================================================
// NOVEL PAGE — Main component
// ============================================================
export default function NovelPage() {
  const navigate = useAppStore(s => s.navigate);
  const [searchQuery, setSearchQuery] = useState("");
  const [trending, setTrending] = useState<Novel[]>([]);
  const [recent, setRecent] = useState<Novel[]>([]);
  const [updated, setUpdated] = useState<Novel[]>([]);
  const [editorsChoice, setEditorsChoice] = useState<Novel[]>([]);
  const [genres, setGenres] = useState<{ value: string; label: string }[]>([]);
  const [searchResults, setSearchResults] = useState<Novel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchMode, setSearchMode] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [heroIdx, setHeroIdx] = useState(0);

  // Load home data
  useEffect(() => {
    (async () => {
      try {
        const [tr, rc, up, ed, gn] = await Promise.all([
          fetch("/api/novels/trending?limit=12").then(r => r.json()).catch(() => ({ novels: [] })),
          fetch("/api/novels/recent?limit=12").then(r => r.json()).catch(() => ({ novels: [] })),
          fetch("/api/novels/recently-updated?limit=12").then(r => r.json()).catch(() => ({ novels: [] })),
          fetch("/api/novels/editors-choice?limit=5").then(r => r.json()).catch(() => ({ novels: [] })),
          fetch("/api/novels/genres").then(r => r.json()).catch(() => ({ genres: [] })),
        ]);
        setTrending(tr.novels || []);
        setRecent(rc.novels || []);
        setUpdated(up.novels || []);
        setEditorsChoice(ed.novels || []);
        setGenres(gn.genres || []);
      } catch (e) {
        console.error("Novel home error:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Rotate hero
  useEffect(() => {
    if (editorsChoice.length === 0) return;
    const interval = setInterval(() => {
      setHeroIdx(prev => (prev + 1) % Math.min(editorsChoice.length, 5));
    }, 7000);
    return () => clearInterval(interval);
  }, [editorsChoice]);

  // Listen for search events from the NovelNavbar
  useEffect(() => {
    const onNovelSearch = (e: Event) => {
      const detail = (e as CustomEvent).detail as string;
      if (detail) {
        setSearchQuery(detail);
        // Scroll to top so search results are visible
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    };
    window.addEventListener("novel-search", onNovelSearch);
    return () => window.removeEventListener("novel-search", onNovelSearch);
  }, []);

  // Listen for tab events from the NovelNavbar (scroll to section)
  useEffect(() => {
    const onNovelTab = (e: Event) => {
      const detail = (e as CustomEvent).detail as string;
      if (detail) {
        // Clear search if we're switching to a section
        if (detail === "trending" || detail === "browse" || detail === "recent") {
          setSearchQuery("");
        }
        // Scroll to the section after a short delay (to ensure DOM is ready)
        setTimeout(() => {
          const el = document.getElementById(`novel-section-${detail}`);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 150);
      }
    };
    window.addEventListener("novel-tab", onNovelTab);
    return () => window.removeEventListener("novel-tab", onNovelTab);
  }, []);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchMode(false);
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchMode(true);
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/novels/search?q=${encodeURIComponent(searchQuery)}&limit=24`);
        const data = await res.json();
        setSearchResults(data.novels || []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleNovelClick = (novel: Novel) => {
    navigate({
      page: "novel-detail",
      novelId: novel.id,
      novelTitle: novel.title,
      novelCover: coverUrl(novel, 400),
      novelAuthor: novel.author || "",
      novelSource: "novelarchive",
    } as any);
  };

  const heroNovel = editorsChoice[heroIdx];

  return (
    <div className="min-h-screen pb-12 bg-black">
      {/* ── HERO SPOTLIGHT ── */}
      {heroNovel ? (
        <HeroSpotlight novel={heroNovel} onRead={() => handleNovelClick(heroNovel)} />
      ) : loading ? (
        <div className="h-[40vh] bg-white/[0.02] animate-pulse" />
      ) : null}

      {/* Search bar that lived in the hero is intentionally removed —
          the NovelNavbar handles search and dispatches `novel-search` events. */}

      {/* ── SEARCH RESULTS ── */}
      {searchMode ? (
        <div className="px-4 max-w-7xl mx-auto pt-8">
          <SectionHeader
            title={`Search Results${searchResults.length > 0 ? ` (${searchResults.length})` : ""}`}
            accent="bg-white"
            icon={SearchIcon}
          />
          {searchLoading ? (
            <div className={GRID}>
              {Array.from({ length: 10 }).map((_, i) => <NovelCardSkeleton key={i} />)}
            </div>
          ) : searchResults.length === 0 ? (
            <p className="text-center text-white/30 text-sm py-16">No novels found. Try a different search.</p>
          ) : (
            <div className={GRID}>
              {searchResults.map(n => <NovelCard key={n.id} novel={n} onClick={handleNovelClick} />)}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* ── TRENDING NOW ── */}
          <Section id="novel-section-trending" title="Trending Now" accent="bg-white" icon={Flame}>
            {loading ? (
              <div className={GRID}>
                {Array.from({ length: 10 }).map((_, i) => <NovelCardSkeleton key={i} />)}
              </div>
            ) : (
              <div className={GRID}>
                {trending.slice(0, 12).map(n => <NovelCard key={n.id} novel={n} onClick={handleNovelClick} />)}
              </div>
            )}
          </Section>

          {/* ── RECENTLY UPDATED ── */}
          <Section id="novel-section-recent" title="Recently Updated" accent="bg-white" icon={Clock}>
            {loading ? (
              <div className={GRID}>
                {Array.from({ length: 10 }).map((_, i) => <NovelCardSkeleton key={i} />)}
              </div>
            ) : (
              <div className={GRID}>
                {updated.slice(0, 12).map(n => <NovelCard key={n.id} novel={n} onClick={handleNovelClick} />)}
              </div>
            )}
          </Section>

          {/* ── BROWSE BY GENRE ── */}
          {genres.length > 0 && (
            <Section id="novel-section-browse" title="Browse by Genre" accent="bg-white" icon={Tag}>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {genres.slice(0, 24).map(g => (
                  <button
                    key={g.value}
                    onClick={() => setSearchQuery(g.label)}
                    className="px-3 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs font-medium text-white/60 hover:border-white/25 hover:text-white hover:bg-white/[0.08] transition-all text-center truncate"
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </Section>
          )}

          {/* ── NEW ARRIVALS ── */}
          <Section title="New Arrivals" accent="bg-white" icon={Sparkles}>
            {loading ? (
              <div className={GRID}>
                {Array.from({ length: 10 }).map((_, i) => <NovelCardSkeleton key={i} />)}
              </div>
            ) : (
              <div className={GRID}>
                {recent.slice(0, 12).map(n => <NovelCard key={n.id} novel={n} onClick={handleNovelClick} />)}
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

// ── Hero Spotlight ───────────────────────────────────────────────────────────

function HeroSpotlight({ novel, onRead }: { novel: Novel; onRead: () => void }) {
  const cover = coverUrl(novel, 800);
  const totalChapters = parseInt(novel.total_chapters || "0") || 0;
  const isOngoing = novel.release_status === "ongoing" || novel.ongoing === "yes";

  return (
    <section className="relative h-[60vh] min-h-[420px] w-full overflow-hidden bg-black">
      {/* Blurred cinematic background */}
      <div className="absolute inset-0">
        {cover && (
          <img
            src={cover}
            alt=""
            aria-hidden
            className="w-full h-full object-cover scale-110 opacity-30"
            style={{ filter: "blur(30px)" }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/85 to-black/40" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/40" />
      </div>

      <div className="relative h-full max-w-7xl mx-auto px-4 sm:px-8 flex items-center pt-20 pb-8">
        <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-center sm:items-end w-full">
          {/* Clean cover image with border */}
          <div className="shrink-0 w-36 sm:w-44 md:w-52 aspect-[3/4] rounded-xl overflow-hidden shadow-2xl shadow-black/70 border border-white/[0.12]">
            {cover ? (
              <img src={cover} alt={novel.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-white/[0.04] flex items-center justify-center">
                <svg className="w-12 h-12 text-white/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
                </svg>
              </div>
            )}
          </div>

          {/* Info: title + author + description + stats + button */}
          <div className="flex-1 min-w-0 space-y-3 sm:space-y-3.5 text-center sm:text-left">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.06] border border-white/[0.12] text-xs font-bold text-white/80">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              Editor&apos;s Choice
            </span>

            <h1
              className="font-karla text-3xl sm:text-4xl md:text-5xl font-extrabold leading-tight bg-clip-text text-transparent"
              style={{ backgroundImage: TEXT_GRADIENT }}
            >
              {novel.title}
            </h1>

            <p className="text-sm sm:text-base text-white/50 font-medium">by {novel.author}</p>

            <p className="text-sm text-white/70 line-clamp-3 max-w-2xl leading-relaxed">
              {(novel.description || "").replace(/\\n/g, " ").slice(0, 280)}
            </p>

            <div className="flex items-center gap-4 text-sm flex-wrap justify-center sm:justify-start">
              {novel.rating > 0 && (
                <span className="flex items-center gap-1 text-white font-bold">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                  {novel.rating.toFixed(1)}
                </span>
              )}
              {totalChapters > 0 && (
                <span className="text-white/50">{totalChapters} chapters</span>
              )}
              {isOngoing && (
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 text-xs font-semibold border border-emerald-500/20">
                  Ongoing
                </span>
              )}
            </div>

            <button
              onClick={onRead}
              className="mt-2 inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white text-black font-bold text-sm hover:bg-white/90 transition-all hover:scale-105 shadow-lg shadow-black/30"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              Start Reading
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Section wrapper ──────────────────────────────────────────────────────────

function SectionHeader({ title, accent, icon: Icon }: { title: string; accent: string; icon: React.ElementType }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className={`w-1 h-6 rounded-full ${accent}`} />
      <Icon className="w-5 h-5 text-white/70" strokeWidth={2.25} />
      <h2
        className="font-karla text-lg sm:text-xl font-bold tracking-tight bg-clip-text text-transparent"
        style={{ backgroundImage: TEXT_GRADIENT }}
      >
        {title}
      </h2>
    </div>
  );
}

function Section({
  id,
  title,
  accent,
  icon,
  children,
}: {
  id?: string;
  title: string;
  accent: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="px-4 max-w-7xl mx-auto pt-10 mb-2 scroll-mt-24">
      <SectionHeader title={title} accent={accent} icon={icon} />
      {children}
    </section>
  );
}
