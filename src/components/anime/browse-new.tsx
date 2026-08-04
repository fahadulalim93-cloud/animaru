"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Search, X, Filter, ChevronLeft, ChevronRight, SlidersHorizontal, Check, ChevronDown, Plus } from "lucide-react";
import { useAppStore } from "./store";
import BrowseTabs from "./browse-tabs";
import "./Browse.css";

// ---- Constants ----
const SORT_OPTIONS = [
  { value: "POPULARITY_DESC", label: "Popularity" },
  { value: "SCORE_DESC", label: "Score (Highest)" },
  { value: "START_DATE_DESC", label: "Newest" },
  { value: "START_DATE_ASC", label: "Oldest" },
  { value: "TITLE_ROMAJI_ASC", label: "Title (A–Z)" },
  { value: "FAVOURITES_DESC", label: "Favorites" },
];

const YEARS = Array.from({ length: 2026 - 1990 + 1 }, (_, i) => 2026 - i);

const SEASONS = ["WINTER", "SPRING", "SUMMER", "FALL"];

const FORMATS = [
  { value: "TV", label: "TV" },
  { value: "TV_SHORT", label: "TV Short" },
  { value: "MOVIE", label: "Movie" },
  { value: "OVA", label: "OVA" },
  { value: "ONA", label: "ONA" },
  { value: "SPECIAL", label: "Special" },
  { value: "MUSIC", label: "Music" },
];

const STATUSES = [
  { value: "FINISHED", label: "Finished Airing" },
  { value: "RELEASING", label: "Currently Airing" },
  { value: "NOT_YET_RELEASED", label: "Not Yet Aired" },
  { value: "CANCELLED", label: "Cancelled" },
];

const ITEMS_PER_PAGE = 25;

// ── AniList genre list (top 30) ──
const ANILIST_GENRES = [
  "Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror", "Mystery",
  "Romance", "Sci-Fi", "Slice of Life", "Sports", "Supernatural", "Thriller",
  "Psychological", "Ecchi", "Demons", "Magic", "Military", "Music", "Parody",
  "Police", "School", "Space", "Vampire", "Zombies", "Martial Arts",
  "Historical", "Game", "Mecha", "Cyberpunk",
];

// ── AniList GraphQL query helper ──
async function anilistQuery(query: string, variables: Record<string, unknown>) {
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query, variables }),
        next: { revalidate: 1800 },
      });
      if (res.status === 429 || res.status >= 500) {
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
      }
      if (!res.ok) throw new Error(`AniList request failed: ${res.status}`);
      const json = await res.json();
      if (json.errors) throw new Error(`AniList GraphQL error: ${json.errors[0]?.message || "Unknown"}`);
      return json.data;
    } catch (err) {
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw new Error("AniList request failed after retries");
}

// ── Anime type ──
interface BrowseAnime {
  id: number;
  title: { romaji?: string; english?: string; native?: string };
  coverImage?: { extraLarge?: string; large?: string; medium?: string; color?: string };
  format?: string;
  status?: string;
  episodes?: number;
  genres?: string[];
  averageScore?: number;
  popularity?: number;
  seasonYear?: number;
  season?: string;
}

// "+" add-to-list — same behavior as every other poster card site-wide:
// no AniList linked yet → the connect prompt; linked → the sync/edit modal.
function handleAddToList(e: React.MouseEvent, anime: { id: number; title: string; cover?: string }) {
  e.stopPropagation();
  const { anilistToken, malToken, openConnectListModal, openEditListModal } = useAppStore.getState();
  if (anilistToken) { openEditListModal(anime); return; }
  if (!malToken) { openConnectListModal(); return; }
}

// ── Anime Card (browse-specific) ──
function BrowseAnimeCard({ anime, navigate }: { anime: BrowseAnime; navigate: (r: any) => void }) {
  const title = anime.title?.english || anime.title?.romaji || anime.title?.native || "Untitled";
  const cover = anime.coverImage?.extraLarge || anime.coverImage?.large || anime.coverImage?.medium;
  const score = anime.averageScore || 0;

  return (
    <div
      className="browse-anime-card"
      onClick={() => navigate({ page: "anime", id: String(anime.id) })}
    >
      <div className="browse-anime-card-poster">
        <button
          onClick={(e) => handleAddToList(e, { id: anime.id, title, cover })}
          className="browse-anime-card-add"
          title="Add to list"
          aria-label="Add to list"
        >
          <Plus size={14} strokeWidth={2.5} />
        </button>
        {cover ? (
          <img src={cover} alt={title} loading="lazy" />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)", fontSize: 24, fontWeight: 700 }}>
            {title.charAt(0)}
          </div>
        )}
        {score > 0 && (
          <div className="browse-anime-card-score">
            <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            {score}%
          </div>
        )}
        {anime.format && (
          <div className="browse-anime-card-format">{anime.format.replace("_", " ")}</div>
        )}
      </div>
      <div className="browse-anime-card-info">
        <h3 className="browse-anime-card-title">{title}</h3>
        <div className="browse-anime-card-meta">
          {anime.seasonYear && <span>{anime.seasonYear}</span>}
          {anime.episodes && (
            <>
              <span className="browse-anime-card-meta-dot" />
              <span>{anime.episodes} eps</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Browse() {
  const navigate = useAppStore((s) => s.navigate);

  // ---- State ----
  const [queryText, setQueryText] = useState("");
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<string>("POPULARITY_DESC");
  const [year, setYear] = useState<string>("");
  const [season, setSeason] = useState<string>("");
  const [selectedFormats, setSelectedFormats] = useState<string[]>([]);
  const [status, setStatus] = useState<string>("");
  const [page, setPage] = useState(1);

  const [genreSearchText, setGenreSearchText] = useState("");
  const [genreDropdownOpen, setGenreDropdownOpen] = useState(false);

  const [animeList, setAnimeList] = useState<BrowseAnime[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  const genreDropdownRef = useRef<HTMLDivElement>(null);
  const genreInputRef = useRef<HTMLDivElement>(null);

  const sortDropdownRef = useRef<HTMLDivElement>(null);
  const sortTriggerRef = useRef<HTMLDivElement>(null);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);

  const yearDropdownRef = useRef<HTMLDivElement>(null);
  const yearTriggerRef = useRef<HTMLDivElement>(null);
  const [yearDropdownOpen, setYearDropdownOpen] = useState(false);

  const prevFiltersRef = useRef("");

  // Debounce query text
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(queryText), 500);
    return () => clearTimeout(t);
  }, [queryText]);

  // Debounce genre search
  const [debouncedGenreSearch, setDebouncedGenreSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedGenreSearch(genreSearchText), 300);
    return () => clearTimeout(t);
  }, [genreSearchText]);

  // ---- Close dropdowns on outside click ----
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        genreDropdownRef.current &&
        !genreDropdownRef.current.contains(e.target as Node) &&
        genreInputRef.current &&
        !genreInputRef.current.contains(e.target as Node)
      ) {
        setGenreDropdownOpen(false);
      }
      if (
        sortDropdownRef.current &&
        !sortDropdownRef.current.contains(e.target as Node) &&
        sortTriggerRef.current &&
        !sortTriggerRef.current.contains(e.target as Node)
      ) {
        setSortDropdownOpen(false);
      }
      if (
        yearDropdownRef.current &&
        !yearDropdownRef.current.contains(e.target as Node) &&
        yearTriggerRef.current &&
        !yearTriggerRef.current.contains(e.target as Node)
      ) {
        setYearDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ---- Build a filter fingerprint for page-reset detection ----
  const filterFingerprint = useMemo(() => {
    return JSON.stringify({ selectedGenres, sortBy, year, season, selectedFormats, status, debouncedQuery });
  }, [selectedGenres, sortBy, year, season, selectedFormats, status, debouncedQuery]);

  // ---- Reset page to 1 when filters change ----
  useEffect(() => {
    if (prevFiltersRef.current && prevFiltersRef.current !== filterFingerprint) {
      setPage(1);
    }
    prevFiltersRef.current = filterFingerprint;
  }, [filterFingerprint]);

  // ---- Fetch anime from AniList ----
  useEffect(() => {
    let cancelled = false;

    async function fetchAnime() {
      setLoading(true);
      setError(null);

      try {
        // Build GraphQL variables
        const variables: Record<string, unknown> = {
          page,
          perPage: ITEMS_PER_PAGE,
        };

        // Determine sort
        variables.sort = [sortBy];

        // Search query
        if (debouncedQuery) {
          variables.search = debouncedQuery;
        }

        // Genres (AniList uses genre_in)
        if (selectedGenres.length > 0) {
          variables.genre_in = selectedGenres;
        }

        // Formats (AniList uses format_in)
        if (selectedFormats.length > 0) {
          variables.format_in = selectedFormats;
        }

        // Status
        if (status) {
          variables.status = status;
        }

        // Year + Season
        if (year) {
          variables.seasonYear = parseInt(year);
        }
        if (season) {
          variables.season = season;
        }

        const query = `
          query (
            $page: Int,
            $perPage: Int,
            $sort: [MediaSort],
            $search: String,
            $genre_in: [String],
            $format_in: [MediaFormat],
            $status: MediaStatus,
            $season: MediaSeason,
            $seasonYear: Int
          ) {
            Page(page: $page, perPage: $perPage) {
              pageInfo { total currentPage lastPage hasNextPage perPage }
              media(
                type: ANIME,
                sort: $sort,
                search: $search,
                genre_in: $genre_in,
                format_in: $format_in,
                status: $status,
                season: $season,
                seasonYear: $seasonYear,
                isAdult: false
              ) {
                id
                title { romaji english native }
                coverImage { extraLarge large medium color }
                format status
                episodes
                genres
                averageScore popularity
                season seasonYear
              }
            }
          }
        `;

        const data = await anilistQuery(query, variables);
        if (!cancelled && data?.Page) {
          setAnimeList(data.Page.media || []);
          setTotalResults(data.Page.pageInfo?.total || 0);
          setLastPage(data.Page.pageInfo?.lastPage || 1);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || "Failed to fetch anime");
          setAnimeList([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAnime();
    return () => {
      cancelled = true;
    };
  }, [selectedGenres, sortBy, year, season, selectedFormats, status, page, debouncedQuery]);

  // ---- Genre handlers ----
  const toggleGenre = useCallback((genre: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  }, []);

  const removeGenre = useCallback((genre: string) => {
    setSelectedGenres((prev) => prev.filter((g) => g !== genre));
  }, []);

  // ---- Filter displayed genres by search text ----
  const filteredGenres = useMemo(() => {
    if (!debouncedGenreSearch) return ANILIST_GENRES;
    const q = debouncedGenreSearch.toLowerCase();
    return ANILIST_GENRES.filter((g) => g.toLowerCase().includes(q));
  }, [debouncedGenreSearch]);

  // ---- Sidebar filter handlers ----
  const toggleSeason = useCallback((s: string) => {
    setSeason((prev) => {
      const newSeason = prev === s ? "" : s;
      if (newSeason && !year) {
        setYear(String(new Date().getFullYear()));
      }
      return newSeason;
    });
  }, [year]);

  const toggleFormat = useCallback((fmt: string) => {
    setSelectedFormats((prev) =>
      prev.includes(fmt) ? prev.filter((f) => f !== fmt) : [...prev, fmt]
    );
  }, []);

  const toggleStatus = useCallback((st: string) => {
    setStatus((prev) => (prev === st ? "" : st));
  }, []);

  const clearAllFilters = useCallback(() => {
    setSelectedGenres([]);
    setSortBy("POPULARITY_DESC");
    setYear("");
    setSeason("");
    setSelectedFormats([]);
    setStatus("");
    setPage(1);
    setGenreSearchText("");
    setQueryText("");
  }, []);

  // ---- Count active sidebar filters for mobile badge ----
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (season) count++;
    if (selectedFormats.length > 0) count += selectedFormats.length;
    if (status) count++;
    return count;
  }, [season, selectedFormats, status]);

  // ---- Pagination helpers ----
  const getPageNumbers = useCallback(() => {
    const pages: (number | string)[] = [];
    const maxVisible = 7;

    if (lastPage <= maxVisible) {
      for (let i = 1; i <= lastPage; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push("...");
      const start = Math.max(2, page - 1);
      const end = Math.min(lastPage - 1, page + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (page < lastPage - 2) pages.push("...");
      pages.push(lastPage);
    }

    return pages;
  }, [page, lastPage]);

  // ---- Scroll to top on page change ----
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [page]);

  // ---- Render ----
  return (
    <div className="browse-page">
      {/* Content-type switcher + global search */}
      <BrowseTabs active="anime" />
      <div className="browse-hero">
        <div className="browse-hero-search">
          <Search size={18} className="browse-hero-search-icon" />
          <input
            type="text"
            placeholder="Search anime, manga, music..."
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
          />
        </div>
      </div>

      {/* Top Filter Bar */}
      <div className="browse-top-bar">
        {/* Anime Name Search */}
        <div className="browse-anime-search">
          <Search size={16} className="browse-anime-search-icon" />
          <input
            type="text"
            className="browse-anime-input"
            placeholder="Search anime by name..."
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
          />
          {queryText && (
            <button className="browse-clear-x" onClick={() => setQueryText("")} aria-label="Clear search">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Genre Multi-Select Search */}
        <div className="browse-genre-search" ref={genreInputRef}>
          <div className="browse-genre-search-wrapper">
            <Search size={16} className="browse-genre-search-icon" />
            <input
              type="text"
              className="browse-genre-input"
              placeholder="Search genres..."
              value={genreSearchText}
              onChange={(e) => {
                setGenreSearchText(e.target.value);
                setGenreDropdownOpen(true);
              }}
              onFocus={() => setGenreDropdownOpen(true)}
            />
            {genreSearchText && (
              <button
                className="browse-clear-x"
                onClick={() => {
                  setGenreSearchText("");
                  setGenreDropdownOpen(false);
                }}
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Selected Genre Pills */}
          {selectedGenres.length > 0 && (
            <div className="browse-genre-pills">
              {selectedGenres.map((genre) => (
                <span key={genre} className="browse-genre-pill">
                  {genre}
                  <button
                    className="browse-genre-pill-remove"
                    onClick={() => removeGenre(genre)}
                    aria-label={`Remove ${genre}`}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Genre Dropdown */}
          {genreDropdownOpen && (
            <div className="browse-genre-dropdown" ref={genreDropdownRef}>
              {filteredGenres.length > 0 ? (
                filteredGenres.map((genre) => {
                  const isSelected = selectedGenres.includes(genre);
                  return (
                    <div
                      key={genre}
                      className={`browse-genre-option ${isSelected ? "selected" : ""}`}
                      onClick={() => toggleGenre(genre)}
                    >
                      <span className="browse-genre-option-check">
                        <Check size={10} />
                      </span>
                      {genre}
                    </div>
                  );
                })
              ) : (
                <div className="browse-genre-no-results">No genres found</div>
              )}
            </div>
          )}
        </div>

        {/* Sort By (Custom Dropdown) */}
        <div className="browse-custom-dropdown" ref={sortTriggerRef}>
          <span className="browse-select-label">Sort</span>
          <button
            type="button"
            className={`browse-custom-dropdown-btn ${sortDropdownOpen ? "active" : ""}`}
            onClick={() => setSortDropdownOpen((prev) => !prev)}
            aria-label="Select sorting option"
          >
            {SORT_OPTIONS.find((o) => o.value === sortBy)?.label || "Popularity"}
            <ChevronDown size={14} className="browse-custom-dropdown-chevron" />
          </button>

          {sortDropdownOpen && (
            <div className="browse-custom-dropdown-menu" ref={sortDropdownRef}>
              {SORT_OPTIONS.map((opt) => {
                const isSelected = sortBy === opt.value;
                return (
                  <div
                    key={opt.value}
                    className={`browse-custom-dropdown-option ${isSelected ? "selected" : ""}`}
                    onClick={() => {
                      setSortBy(opt.value);
                      setSortDropdownOpen(false);
                    }}
                  >
                    <span className="browse-genre-option-check">
                      <Check size={10} />
                    </span>
                    {opt.label}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Year (Custom Dropdown) */}
        <div className="browse-custom-dropdown" ref={yearTriggerRef}>
          <span className="browse-select-label">Year</span>
          <button
            type="button"
            className={`browse-custom-dropdown-btn ${yearDropdownOpen ? "active" : ""}`}
            onClick={() => setYearDropdownOpen((prev) => !prev)}
            aria-label="Select year"
          >
            {year || "All Years"}
            <ChevronDown size={14} className="browse-custom-dropdown-chevron" />
          </button>

          {yearDropdownOpen && (
            <div className="browse-custom-dropdown-menu browse-custom-dropdown-menu--year" ref={yearDropdownRef}>
              <div
                className={`browse-custom-dropdown-option ${!year ? "selected" : ""}`}
                onClick={() => {
                  setYear("");
                  setYearDropdownOpen(false);
                }}
              >
                <span className="browse-genre-option-check">
                  <Check size={10} />
                </span>
                All Years
              </div>
              {YEARS.map((y) => {
                const isSelected = String(year) === String(y);
                return (
                  <div
                    key={y}
                    className={`browse-custom-dropdown-option ${isSelected ? "selected" : ""}`}
                    onClick={() => {
                      setYear(String(y));
                      setYearDropdownOpen(false);
                    }}
                  >
                    <span className="browse-genre-option-check">
                      <Check size={10} />
                    </span>
                    {y}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Mobile Filter Toggle */}
        <button
          className="browse-mobile-filter-toggle"
          onClick={() => setSidebarCollapsed((prev) => !prev)}
        >
          <Filter size={16} />
          Filters
          {activeFilterCount > 0 && <span className="filter-count">{activeFilterCount}</span>}
        </button>
      </div>

      {/* Content: Sidebar (LEFT) + Main */}
      <div className="browse-content">
        {/* Sidebar Filters — NOW ON THE LEFT */}
        <aside className={`browse-filters-sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
          <div className="browse-sidebar-title">
            <SlidersHorizontal size={18} />
            Filters
          </div>

          {/* Season */}
          <div className="browse-filter-section">
            <div className="browse-filter-label">Season</div>
            <div className="browse-filter-options">
              {SEASONS.map((s) => (
                <button
                  key={s}
                  className={`browse-filter-btn ${season === s ? "active" : ""}`}
                  onClick={() => toggleSeason(s)}
                >
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Format */}
          <div className="browse-filter-section">
            <div className="browse-filter-label">Format</div>
            <div className="browse-filter-options">
              {FORMATS.map((fmt) => (
                <button
                  key={fmt.value}
                  className={`browse-filter-btn ${selectedFormats.includes(fmt.value) ? "active" : ""}`}
                  onClick={() => toggleFormat(fmt.value)}
                >
                  {fmt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Status */}
          <div className="browse-filter-section">
            <div className="browse-filter-label">Status</div>
            <div className="browse-filter-options">
              {STATUSES.map((st) => (
                <button
                  key={st.value}
                  className={`browse-filter-btn ${status === st.value ? "active" : ""}`}
                  onClick={() => toggleStatus(st.value)}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {/* Clear All */}
          <button className="browse-sidebar-clear" onClick={clearAllFilters}>
            Clear All Filters
          </button>
        </aside>

        {/* Main Grid */}
        <div className="browse-main">
          {/* Results Header */}
          <div className="browse-results-header">
            <p className="browse-results-count">
              {loading ? (
                "Loading results..."
              ) : (
                <>
                  Found <span>{totalResults.toLocaleString()}</span> anime
                </>
              )}
            </p>
          </div>

          {/* Loading Skeleton */}
          {loading && (
            <div className="browse-skeleton-grid">
              {Array.from({ length: ITEMS_PER_PAGE }).map((_, i) => (
                <div key={i} className="browse-skeleton-card" style={{ animationDelay: `${i * 0.04}s` }} />
              ))}
            </div>
          )}

          {/* Error State */}
          {!loading && error && (
            <div className="browse-no-results">
              <Search size={56} className="browse-no-results-icon" />
              <h3 className="browse-no-results-title">Something went wrong</h3>
              <p className="browse-no-results-text">{error}</p>
              <button className="browse-clear-filters-btn" onClick={() => setPage(page)}>
                Try Again
              </button>
            </div>
          )}

          {/* No Results */}
          {!loading && !error && animeList.length === 0 && (
            <div className="browse-no-results">
              <Search size={56} className="browse-no-results-icon" />
              <h3 className="browse-no-results-title">No results found</h3>
              <p className="browse-no-results-text">
                Try adjusting your filters or search criteria to find what you&apos;re looking for.
              </p>
              <button className="browse-clear-filters-btn" onClick={clearAllFilters}>
                <X size={14} />
                Clear All Filters
              </button>
            </div>
          )}

          {/* Results Grid */}
          {!loading && !error && animeList.length > 0 && (
            <>
              <div className="browse-results-grid">
                {animeList.map((anime) => (
                  <BrowseAnimeCard key={anime.id} anime={anime} navigate={navigate} />
                ))}
              </div>

              {/* Pagination */}
              {lastPage > 1 && (
                <div className="browse-pagination">
                  <button
                    className="browse-pagination-btn browse-pagination-nav"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    aria-label="Previous page"
                  >
                    <ChevronLeft size={16} />
                  </button>

                  {getPageNumbers().map((p, idx) =>
                    p === "..." ? (
                      <span key={`ellipsis-${idx}`} className="browse-pagination-ellipsis">
                        …
                      </span>
                    ) : (
                      <button
                        key={p}
                        className={`browse-pagination-btn ${page === p ? "active" : ""}`}
                        onClick={() => setPage(p as number)}
                      >
                        {p}
                      </button>
                    )
                  )}

                  <button
                    className="browse-pagination-btn browse-pagination-nav"
                    disabled={page >= lastPage}
                    onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                    aria-label="Next page"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
