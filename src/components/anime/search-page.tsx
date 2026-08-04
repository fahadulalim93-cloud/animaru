"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAppStore, type TMDBContentItem } from "./store";

interface SearchPageProps {
  initialQuery?: string;
}

// ── Unified search result type ──
interface SearchResult {
  id: number;
  title: string;
  subTitle?: string;   // romaji/native title
  image: string;
  format?: string;
  type?: string;
  status?: string;
  episodes?: number;
  seasonYear?: number;
  genres?: string[];
  averageScore?: number;
  description?: string;
  source: "anilist" | "tmdb";
  mediaType?: "anime" | "movie" | "tv";
  tmdbId?: number;
}

const mono = "'Space Mono', 'Courier New', monospace";
const outfit = "var(--font-outfit), 'Outfit', sans-serif";

// ── Genre list for filter panel ──
const GENRE_OPTIONS = [
  "Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror",
  "Mystery", "Psychological", "Romance", "Sci-Fi", "Slice of Life",
  "Sports", "Supernatural", "Thriller", "Isekai", "Mecha",
  "Music", "Ecchi", "Mahou Shoujo", "Historical",
];

const FORMAT_OPTIONS = ["TV", "MOVIE", "OVA", "ONA", "TV_SHORT", "SPECIAL"];

export default function SearchPage({ initialQuery }: SearchPageProps) {
  const navigate = useAppStore(s => s.navigate);
  const [query, setQuery] = useState(initialQuery || "");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedFormats, setSelectedFormats] = useState<string[]>([]);
  const [activeFilterTab, setActiveFilterTab] = useState<"all" | "anime" | "movies" | "tv">("all");
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Real-time search with debounce ──
  const performSearch = useCallback(async (q: string, tab?: string) => {
    if (!q.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }

    // Cancel previous request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setSearched(true);

    const currentTab = tab || activeFilterTab;
    const searchResults: SearchResult[] = [];

    try {
      const promises: Promise<void>[] = [];

      // Search AniList (anime)
      if (currentTab === "all" || currentTab === "anime") {
        promises.push(
          fetch(`/api/anime/search?q=${encodeURIComponent(q)}&page=1`, { signal: controller.signal })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
              if (data?.results) {
                for (const item of data.results) {
                  searchResults.push({
                    id: item.id,
                    title: item.title?.english || item.title?.romaji || "Unknown",
                    subTitle: item.title?.native || item.title?.romaji,
                    image: item.coverImage?.extraLarge || item.coverImage?.large || item.coverImage?.medium || "",
                    format: item.format,
                    type: item.type,
                    status: item.status,
                    episodes: item.episodes,
                    seasonYear: item.seasonYear,
                    genres: item.genres,
                    averageScore: item.averageScore,
                    description: item.description,
                    source: "anilist",
                    mediaType: "anime",
                  });
                }
              }
            })
            .catch(() => {})
        );
      }

      // Search TMDB (movies & TV)
      if (currentTab === "all" || currentTab === "movies" || currentTab === "tv") {
        const searchType = currentTab === "movies" ? "movie" : currentTab === "tv" ? "tv" : "multi";
        promises.push(
          fetch(`/api/tmdb/search?q=${encodeURIComponent(q)}&type=${searchType}`, { signal: controller.signal })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
              if (data?.results) {
                for (const item of data.results as TMDBContentItem[]) {
                  if ((item.media_type as any) === "person") continue;
                  searchResults.push({
                    id: item.id * -1, // negative to avoid collision with anilist ids
                    title: item.title || item.name || "Unknown",
                    image: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : "",
                    format: item.media_type === "movie" ? "MOVIE" : "TV",
                    type: item.media_type === "movie" ? "Movie" : "TV Show",
                    seasonYear: item.release_date ? parseInt(item.release_date.split("-")[0]) : item.first_air_date ? parseInt(item.first_air_date.split("-")[0]) : undefined,
                    averageScore: item.vote_average ? Math.round(item.vote_average * 10) : undefined,
                    description: item.overview,
                    source: "tmdb",
                    mediaType: item.media_type === "movie" ? "movie" : "tv",
                    tmdbId: item.id,
                  });
                }
              }
            })
            .catch(() => {})
        );
      }

      await Promise.all(promises);

      if (!controller.signal.aborted) {
        // Apply filters
        let filtered = searchResults;

        if (selectedGenres.length > 0) {
          filtered = filtered.filter(r =>
            r.genres?.some(g => selectedGenres.includes(g))
          );
        }

        if (selectedFormats.length > 0) {
          filtered = filtered.filter(r =>
            r.format && selectedFormats.includes(r.format)
          );
        }

        // Sort: AniList first, then by score
        filtered.sort((a, b) => {
          if (a.source === "anilist" && b.source !== "anilist") return -1;
          if (a.source !== "anilist" && b.source === "anilist") return 1;
          return (b.averageScore || 0) - (a.averageScore || 0);
        });

        setResults(filtered);
        setLoading(false);
      }
    } catch {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [activeFilterTab, selectedGenres, selectedFormats]);

  // Debounced input handler
  const handleInputChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      performSearch(value);
    }, 350);
  };

  // Initial search from URL
  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
      performSearch(initialQuery);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  // Re-search when filter tab changes
  const handleTabChange = (tab: "all" | "anime" | "movies" | "tv") => {
    setActiveFilterTab(tab);
    if (query.trim()) {
      performSearch(query, tab);
    }
  };

  // Re-search when genre/format filters change
  useEffect(() => {
    if (query.trim() && searched) {
      performSearch(query);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGenres, selectedFormats]);

  const handleResultClick = (result: SearchResult) => {
    if (result.source === "anilist") {
      navigate({ page: "anime", id: String(result.id) });
    } else if (result.mediaType === "movie") {
      navigate({ page: "movie-detail", id: result.tmdbId! });
    } else {
      navigate({ page: "tv-detail", id: result.tmdbId! });
    }
  };

  const handlePlayClick = (e: React.MouseEvent, result: SearchResult) => {
    e.stopPropagation();
    if (result.source === "anilist") {
      navigate({ page: "watch", id: String(result.id), episode: 1 });
    } else if (result.mediaType === "movie") {
      navigate({ page: "movie-watch", id: result.tmdbId! });
    } else {
      navigate({ page: "tv-watch", id: result.tmdbId!, season: 1, episode: 1 });
    }
  };

  const clearAll = () => {
    setQuery("");
    setResults([]);
    setSearched(false);
    setSelectedGenres([]);
    setSelectedFormats([]);
    inputRef.current?.focus();
  };

  const toggleGenre = (genre: string) => {
    setSelectedGenres(prev =>
      prev.includes(genre) ? prev.filter(g => g !== genre) : [...prev, genre]
    );
  };

  const toggleFormat = (format: string) => {
    setSelectedFormats(prev =>
      prev.includes(format) ? prev.filter(f => f !== format) : [...prev, format]
    );
  };

  // ── Result row component ──
  const ResultRow = ({ result, index }: { result: SearchResult; index: number }) => (
    <div
      onClick={() => handleResultClick(result)}
      className="flex items-center gap-4 p-3 rounded-xl cursor-pointer transition-all duration-200 hover:bg-white/[0.04] border border-transparent hover:border-white/[0.06] group"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      {/* Thumbnail */}
      <div className="relative w-16 h-22 sm:w-20 sm:h-[110px] rounded-lg overflow-hidden bg-[#0a0a0a] shrink-0 border border-white/[0.06]">
        {result.image ? (
          <img
            src={result.image}
            alt={result.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-6 h-6 text-white/10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z" />
            </svg>
          </div>
        )}
        {/* Format badge */}
        {result.format && (
          <div className="absolute top-1 left-1 text-[7px] font-bold px-1.5 py-0.5 rounded bg-[#D4A017]/90 text-white backdrop-blur-sm">
            {result.format === "TV_SHORT" ? "TV SHORT" : result.format}
          </div>
        )}
        {/* Hover play overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div className="w-8 h-8 rounded-full bg-[#D4A017]/90 flex items-center justify-center shadow-lg shadow-[#D4A017]/30">
            <svg className="w-3.5 h-3.5 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3 className="text-sm sm:text-base font-semibold text-white line-clamp-1 group-hover:text-[#D4A017] transition-colors">
          {result.title}
        </h3>
        {result.subTitle && result.subTitle !== result.title && (
          <p className="text-[11px] text-white/30 line-clamp-1 mt-0.5">{result.subTitle}</p>
        )}

        {/* Metadata row */}
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {result.format && (
            <span className="text-[10px] font-bold text-white/50 bg-white/[0.05] px-2 py-0.5 rounded-full">
              {result.format === "TV_SHORT" ? "TV Short" : result.format === "ONA" ? "ONA" : result.format === "OVA" ? "OVA" : result.format === "MOVIE" ? "Movie" : result.format === "SPECIAL" ? "Special" : result.format}
            </span>
          )}
          {result.seasonYear && (
            <span className="text-[10px] text-white/40">{result.seasonYear}</span>
          )}
          {result.episodes != null && result.episodes > 0 && (
            <span className="text-[10px] text-white/40">{result.episodes} eps</span>
          )}
          {result.averageScore != null && result.averageScore > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-[#FFD700] font-bold">
              <svg className="w-3 h-3 text-[#FFD700]" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              {result.averageScore}%
            </span>
          )}
          {result.status && (
            <span className={`text-[10px] font-medium ${result.status === "RELEASING" ? "text-emerald-400" : result.status === "FINISHED" ? "text-white/30" : "text-white/25"}`}>
              {result.status === "RELEASING" ? "Airing" : result.status === "FINISHED" ? "Complete" : result.status === "NOT_YET_RELEASED" ? "Upcoming" : result.status}
            </span>
          )}
        </div>

        {/* Genre tags */}
        {result.genres && result.genres.length > 0 && (
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {result.genres.slice(0, 4).map(g => (
              <span key={g} className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#D4A017]/10 text-[#D4A017]/80 border border-[#D4A017]/15">
                {g}
              </span>
            ))}
          </div>
        )}

        {/* Description snippet */}
        {result.description && (
          <p className="hidden sm:block text-[11px] text-white/25 line-clamp-1 mt-1.5">
            {result.description.replace(/<[^>]+>/g, "").slice(0, 120)}
          </p>
        )}
      </div>

      {/* Right side: Source badge + Play button */}
      <div className="hidden sm:flex flex-col items-center gap-2 shrink-0">
        <span className="text-[8px] font-bold uppercase tracking-wider text-white/15" style={{ fontFamily: mono }}>
          {result.source === "anilist" ? "AniList" : "TMDB"}
        </span>
        <button
          onClick={(e) => handlePlayClick(e, result)}
          className="w-9 h-9 rounded-full bg-[#D4A017]/15 hover:bg-[#D4A017] flex items-center justify-center transition-all duration-200 group-hover:bg-[#D4A017] shadow-lg shadow-[#D4A017]/0 group-hover:shadow-[#D4A017]/20 cursor-pointer"
        >
          <svg className="w-4 h-4 text-[#D4A017] group-hover:text-white ml-0.5 transition-colors" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        </button>
      </div>
    </div>
  );

  // ── Loading skeleton rows ──
  const SkeletonRow = () => (
    <div className="flex items-center gap-4 p-3 rounded-xl">
      <div className="w-16 h-22 sm:w-20 sm:h-[110px] rounded-lg skeleton shrink-0" />
      <div className="flex-1 space-y-2.5">
        <div className="h-4 w-3/4 rounded skeleton" />
        <div className="h-3 w-1/2 rounded skeleton" />
        <div className="flex gap-2">
          <div className="h-5 w-12 rounded-full skeleton" />
          <div className="h-5 w-8 rounded-full skeleton" />
          <div className="h-5 w-10 rounded-full skeleton" />
        </div>
        <div className="flex gap-1.5">
          <div className="h-4 w-14 rounded-full skeleton" />
          <div className="h-4 w-12 rounded-full skeleton" />
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ paddingTop: '90px', overflowX: 'hidden', width: '100%', maxWidth: '100vw', boxSizing: 'border-box', minHeight: '100vh' }}>
      {/* Background gold ambient glow */}
      <div style={{
        position: "fixed",
        top: "15%",
        left: "50%",
        transform: "translateX(-50%)",
        width: "50%",
        height: 350,
        background: "radial-gradient(ellipse, rgba(212,160,23,0.03) 0%, rgba(212,160,23,0.008) 40%, transparent 65%)",
        filter: "blur(80px)",
        pointerEvents: "none",
        zIndex: 0,
      }} />

      <div style={{ position: "relative", zIndex: 1 }}>
        {/* ── Search Header ── */}
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          {/* Title */}
          <div className="text-center mb-6">
            <h1 style={{ fontFamily: outfit, fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 800, lineHeight: 1.15, marginBottom: 8 }}>
              <span className="text-white">Find your next </span>
              <span style={{ color: "#D4A017" }}>adventure</span>
            </h1>
            <p style={{ fontFamily: mono, fontSize: 11, color: "rgba(255,255,255,0.3)", letterSpacing: "0.05em" }}>
              Search anime, movies & TV shows
            </p>
          </div>

          {/* Search Bar */}
          <div className="mb-4">
            <div className="flex items-center gap-2 p-1.5 rounded-xl bg-[#0d0a04]/80 border border-[#D4A017]/15 focus-within:border-[#D4A017]/30 focus-within:shadow-[0_0_12px_rgba(212,160,23,0.04)] transition-all backdrop-blur-sm">
              <div className="flex items-center gap-2.5 flex-1 pl-3">
                <svg className="w-4.5 h-4.5 text-[#D4A017]/40 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  ref={inputRef}
                  autoFocus
                  value={query}
                  onChange={e => handleInputChange(e.target.value)}
                  placeholder="Search anime, movies, TV shows..."
                  className="flex-1 bg-transparent text-white placeholder-white/20 text-sm outline-none"
                  style={{ fontFamily: outfit }}
                />
                {loading && (
                  <svg className="w-4 h-4 text-[#D4A017] animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                )}
                {query && !loading && (
                  <button type="button" onClick={clearAll} className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-white/25 hover:text-white/60 hover:bg-white/[0.08] transition-colors">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                )}
              </div>
              {/* Filters button */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                  showFilters || selectedGenres.length > 0 || selectedFormats.length > 0
                    ? "bg-[#D4A017]/15 text-[#D4A017] border border-[#D4A017]/30"
                    : "bg-white/[0.04] text-white/35 border border-white/[0.06] hover:text-white/60 hover:bg-white/[0.06]"
                }`}
                style={{ fontFamily: mono }}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                Filters
                {(selectedGenres.length > 0 || selectedFormats.length > 0) && (
                  <span className="w-4 h-4 rounded-full bg-[#D4A017] text-black text-[8px] flex items-center justify-center font-bold">
                    {selectedGenres.length + selectedFormats.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-2 justify-center mb-4">
            {(["all", "anime", "movies", "tv"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => handleTabChange(tab)}
                className={`px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-full transition-all border ${
                  activeFilterTab === tab
                    ? "bg-[#D4A017]/15 text-[#D4A017] border-[#D4A017]/30"
                    : "bg-white/[0.02] text-white/30 border-white/[0.06] hover:text-white/50 hover:bg-white/[0.04]"
                }`}
                style={{ fontFamily: mono }}
              >
                {tab === "all" ? "All" : tab === "anime" ? "Anime" : tab === "movies" ? "Movies" : "TV Shows"}
              </button>
            ))}
          </div>

          {/* Expandable Filters Panel */}
          {showFilters && (
            <div className="mb-6 p-4 rounded-xl bg-[#0a0a04]/80 border border-[#D4A017]/15 backdrop-blur-sm space-y-4">
              {/* Genres */}
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-[#D4A017]/60" style={{ fontFamily: mono }}>Genres</span>
                  {selectedGenres.length > 0 && (
                    <button onClick={() => setSelectedGenres([])} className="text-[8px] text-white/20 hover:text-white/40 transition-colors" style={{ fontFamily: mono }}>CLEAR</button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {GENRE_OPTIONS.map(genre => (
                    <button
                      key={genre}
                      onClick={() => toggleGenre(genre)}
                      className={`px-2.5 py-1 rounded-full text-[9px] font-bold transition-all border ${
                        selectedGenres.includes(genre)
                          ? "bg-[#D4A017]/20 text-[#D4A017] border-[#D4A017]/30"
                          : "bg-white/[0.03] text-white/25 border-white/[0.06] hover:text-white/40 hover:bg-white/[0.05]"
                      }`}
                    >
                      {genre}
                    </button>
                  ))}
                </div>
              </div>

              {/* Format */}
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-[#D4A017]/60" style={{ fontFamily: mono }}>Format</span>
                  {selectedFormats.length > 0 && (
                    <button onClick={() => setSelectedFormats([])} className="text-[8px] text-white/20 hover:text-white/40 transition-colors" style={{ fontFamily: mono }}>CLEAR</button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {FORMAT_OPTIONS.map(format => (
                    <button
                      key={format}
                      onClick={() => toggleFormat(format)}
                      className={`px-2.5 py-1 rounded-full text-[9px] font-bold transition-all border ${
                        selectedFormats.includes(format)
                          ? "bg-[#D4A017]/20 text-[#D4A017] border-[#D4A017]/30"
                          : "bg-white/[0.03] text-white/25 border-white/[0.06] hover:text-white/40 hover:bg-white/[0.05]"
                      }`}
                    >
                      {format === "TV_SHORT" ? "TV Short" : format}
                    </button>
                  ))}
                </div>
              </div>

              {/* Clear all filters */}
              {(selectedGenres.length > 0 || selectedFormats.length > 0) && (
                <button
                  onClick={() => { setSelectedGenres([]); setSelectedFormats([]); }}
                  className="w-full py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[10px] font-bold uppercase tracking-wider text-white/30 hover:text-white/50 hover:bg-white/[0.05] transition-all"
                  style={{ fontFamily: mono }}
                >
                  Clear All Filters
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Gold Divider ── */}
        <div className="max-w-3xl mx-auto px-4 sm:px-6" style={{ position: "relative", height: 2, marginBottom: 24, marginTop: 8 }}>
          <div style={{ position: "absolute", top: -6, left: "20%", right: "20%", height: 12, background: "radial-gradient(ellipse at 50% 50%, rgba(212,160,23,0.04) 0%, transparent 70%)", filter: "blur(8px)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "linear-gradient(90deg, transparent 5%, rgba(212,160,23,0.1) 15%, rgba(212,160,23,0.25) 35%, rgba(212,160,23,0.35) 50%, rgba(212,160,23,0.25) 65%, rgba(212,160,23,0.1) 85%, transparent 95%)" }} />
        </div>

        {/* ── Results ── */}
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}
            </div>
          ) : results.length > 0 ? (
            <div className="space-y-1">
              {/* Result count */}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-[9px] font-bold uppercase tracking-wider text-white/20" style={{ fontFamily: mono }}>
                  {results.length} result{results.length !== 1 ? 's' : ''}
                </span>
                <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, rgba(212,160,23,0.15), transparent)" }} />
              </div>

              {/* Results list */}
              {results.map((result, i) => (
                <ResultRow key={`${result.source}-${result.id}`} result={result} index={i} />
              ))}

              {/* Load more hint */}
              {results.length >= 20 && (
                <div className="text-center py-6">
                  <p className="text-[10px] text-white/15" style={{ fontFamily: mono }}>
                    Showing top results. Try a more specific search for better results.
                  </p>
                </div>
              )}
            </div>
          ) : query && searched ? (
            <div className="text-center py-16">
              <div className="space-y-3">
                <div className="w-14 h-14 mx-auto rounded-full bg-[#D4A017]/8 flex items-center justify-center">
                  <svg className="w-7 h-7 text-[#D4A017]/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                  </svg>
                </div>
                <p className="text-white/25 text-sm" style={{ fontFamily: outfit }}>No results for &quot;{query}&quot;</p>
                <p className="text-white/12 text-xs" style={{ fontFamily: mono }}>Try different keywords or check the spelling</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-16">
              <div className="space-y-3">
                <div className="w-14 h-14 mx-auto rounded-full bg-[#D4A017]/6 flex items-center justify-center">
                  <svg className="w-7 h-7 text-[#D4A017]/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                  </svg>
                </div>
                <p className="text-white/25 text-sm" style={{ fontFamily: outfit }}>Type to start searching</p>
                <p className="text-white/12 text-[10px]" style={{ fontFamily: mono }}>Results appear as you type</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
