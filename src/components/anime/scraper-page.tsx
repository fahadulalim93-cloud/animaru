"use client";

/**
 * Scraper Home Page — search AniList + browse trending/popular.
 *
 * This is the entry point to the unified scraper. Users can:
 *   - Search anime by title (calls /api/anime/scraper/search)
 *   - Browse trending (AniList TRENDING_DESC)
 *   - Browse popular (AniList POPULARITY_DESC)
 *   - Click an anime → /scraper/anime/{anilistId}
 */

import { useEffect, useState, useCallback } from "react";
import { useAppStore } from "@/components/anime/store";

interface AniListItem {
  id: number;
  title: { romaji?: string; english?: string; native?: string };
  coverImage?: { extraLarge?: string; large?: string; medium?: string };
  bannerImage?: string;
  format?: string;
  status?: string;
  episodes?: number;
  genres?: string[];
  averageScore?: number;
  popularity?: number;
  seasonYear?: number;
  description?: string;
}

interface SearchResponse {
  pageInfo?: { total: number; currentPage: number; lastPage: number; hasNextPage: boolean };
  media: AniListItem[];
}

export default function ScraperPage() {
  const navigate = useAppStore((s) => s.navigate);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AniListItem[] | null>(null);
  const [trending, setTrending] = useState<AniListItem[]>([]);
  const [popular, setPopular] = useState<AniListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"trending" | "popular" | "search">("trending");

  // Load trending + popular on mount
  useEffect(() => {
    (async () => {
      try {
        const [tRes, pRes] = await Promise.all([
          fetch("/api/anime/scraper/search?q=trending&perPage=20").then((r) => r.json()),
          fetch("/api/anime/scraper/search?q=popular&perPage=20").then((r) => r.json()),
        ]);
        // AniList search doesn't have "trending" — let's fetch real trending via AniList
        const tr = await fetch("/api/anime/anilist-trending?perPage=20").then((r) => r.json());
        const po = await fetch("/api/anime/home").then((r) => r.json());
        setTrending(tr?.media || tr?.results || []);
        setPopular(po?.popular?.media || po?.popular || []);
      } catch (e) {
        console.error("Failed to load trending/popular", e);
      }
    })();
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setTab("search");
    try {
      const res = await fetch(`/api/anime/scraper/search?q=${encodeURIComponent(q)}&perPage=30`);
      const data: SearchResponse = await res.json();
      setSearchResults(data.media || []);
    } catch (e) {
      console.error("Search failed", e);
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSearch(query);
  };

  const display: AniListItem[] = tab === "search" ? (searchResults || []) : tab === "trending" ? trending : popular;

  return (
    <div className="min-h-screen text-white">
      {/* Hero header */}
      <div className="relative overflow-hidden border-b border-white/5 mb-8">
        <div className="absolute inset-0 bg-gradient-to-br from-[#ffffff]/10 via-transparent to-[#D4A017]/10 pointer-events-none" />
        <div className="relative px-4 lg:px-8 py-10 lg:py-14 max-w-[1400px] mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-[#ffffff] to-[#D4A017] text-white font-bold text-sm">
              UI
            </span>
            <div>
              <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight" style={{ fontFamily: "var(--font-space-grotesk), 'Space Grotesk', sans-serif" }}>
                Unified Scraper
              </h1>
              <p className="text-xs text-white/50 mt-0.5">
                AniList metadata · Miruro + Animex + Lunar streams · Sub/Dub/Hardsub/Harddub
              </p>
            </div>
          </div>

          <form onSubmit={onSubmit} className="flex gap-2 max-w-2xl">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search anime by title..."
              className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:border-[#ffffff]/50 focus:bg-white/10 transition"
              autoFocus
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="px-5 py-3 bg-[#ffffff] hover:bg-[#ffffff]/90 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-bold transition"
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </form>

          {/* Tab switcher */}
          <div className="flex items-center gap-2 mt-6">
            {(["trending", "popular", "search"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-1.5 text-xs font-bold rounded-full transition ${
                  tab === t
                    ? "bg-white/10 text-white"
                    : "text-white/40 hover:text-white/70"
                }`}
              >
                {t === "trending" ? "Trending" : t === "popular" ? "Popular" : "Search Results"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="max-w-[1400px] mx-auto px-4 lg:px-8">
        {loading && tab === "search" ? (
          <div className="text-center py-20 text-white/40 text-sm">Searching AniList...</div>
        ) : display.length === 0 ? (
          <div className="text-center py-20 text-white/40 text-sm">
            {tab === "search" ? "No results found. Try a different search." : "Loading..."}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-white/70">
                {tab === "trending" ? "Trending Now" : tab === "popular" ? "All-Time Popular" : `Search: "${query}"`}
              </h2>
              <span className="text-xs text-white/40">{display.length} results</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 lg:gap-4">
              {display.map((item) => (
                <AnimeCard key={item.id} item={item} onClick={() => navigate({ page: "scraper-anime", id: String(item.id) })} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AnimeCard({ item, onClick }: { item: AniListItem; onClick: () => void }) {
  const title = item.title?.english || item.title?.romaji || item.title?.native || "Unknown";
  const cover = item.coverImage?.extraLarge || item.coverImage?.large || item.coverImage?.medium || "";
  return (
    <button
      onClick={onClick}
      className="group text-left rounded-lg overflow-hidden bg-white/[0.03] border border-white/5 hover:border-white/20 hover:bg-white/[0.06] transition"
    >
      <div className="aspect-[2/3] relative overflow-hidden bg-white/5">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/20 text-xs">No image</div>
        )}
        {item.averageScore && (
          <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 bg-black/70 backdrop-blur text-[10px] font-bold text-[#D4A017] rounded">
            {item.averageScore}%
          </div>
        )}
      </div>
      <div className="p-2">
        <div className="text-xs font-bold text-white line-clamp-2 leading-tight">{title}</div>
        <div className="text-[10px] text-white/40 mt-1">
          {item.seasonYear ? item.seasonYear : ""}
          {item.format ? ` · ${item.format}` : ""}
          {item.episodes ? ` · ${item.episodes} ep` : ""}
        </div>
      </div>
    </button>
  );
}
