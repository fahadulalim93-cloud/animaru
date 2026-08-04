"use client";

// ═══════════════════════════════════════════════════════════════
// Browse Page — Adapted from github.com/Varomine/MioAnime
// Changes: react-router → useAppStore, jikan → AniList, removed auth
// ═══════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAppStore } from "./store";
import { Search, X, Filter, ChevronLeft, ChevronRight, SlidersHorizontal, Check, ChevronDown } from "lucide-react";

// ---- Constants (from MioAnime) ----
const SORT_OPTIONS = [
  { value: "SCORE_DESC", label: "Score (Highest)" },
  { value: "POPULARITY_DESC", label: "Popularity" },
  { value: "TITLE_ENGLISH", label: "Title (A-Z)" },
  { value: "FAVOURITES_DESC", label: "Favorites" },
  { value: "START_DATE_DESC", label: "Newest" },
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
];

const ITEMS_PER_PAGE = 25;

// ---- useDebounce (replaces MioAnime's hook) ----
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// ---- AniList API (replaces jikanApi) ----
// NOTE: AniList v2 GraphQL — sort/type/filters must go INSIDE media(), not on Page().
// sort variable MUST be an array (e.g. ["SCORE_DESC"]) per [MediaSort] type.
async function anilistSearch(params: any) {
  const variables: any = {
    page: params.page || 1,
    perPage: params.perPage || ITEMS_PER_PAGE,
    sort: [params.sort || "POPULARITY_DESC"],   // ← array, not string
    type: "ANIME",
  };

  // Build the media() argument list — all filters live here, not on Page()
  const mediaArgs: string[] = ["sort: $sort", "type: $type"];
  if (params.q) {
    variables.search = params.q;
    mediaArgs.push("search: $search");
  }
  if (params.genres) {
    variables.genres = params.genres.split(",").map((g: string) => g.trim()).filter(Boolean);
    mediaArgs.push("genre_in: $genres");
  }
  if (params.start_date) {
    variables.seasonYear = parseInt(params.start_date.slice(0, 4));
    mediaArgs.push("seasonYear: $seasonYear");
  }
  if (params.season) {
    variables.season = params.season.toUpperCase();
    mediaArgs.push("season: $season");
  }
  if (params.type) {
    // type here is the FORMAT (TV, MOVIE, etc.) — one or many
    const formats = params.type.split(",").map((t: string) => t.trim()).filter(Boolean);
    if (formats.length > 1) {
      variables.formats = formats;
      mediaArgs.push("format_in: $formats");
    } else if (formats.length === 1) {
      variables.format = formats[0];
      mediaArgs.push("format: $format");
    }
  }
  if (params.status) {
    // status is already an AniList enum ("FINISHED" | "RELEASING" | "NOT_YET_RELEASED" | "CANCELLED" | "HIATUS")
    // No remapping needed — the state stores the raw enum value directly.
    variables.status = params.status;
    mediaArgs.push("status: $status");
  }

  // Build the variable declaration list dynamically based on what we set
  const varDecls: string[] = ["$page:Int", "$perPage:Int", "$sort:[MediaSort]", "$type:MediaType"];
  if (variables.search) varDecls.push("$search:String");
  if (variables.genres) varDecls.push("$genres:[String]");
  if (variables.seasonYear) varDecls.push("$seasonYear:Int");
  if (variables.season) varDecls.push("$season:MediaSeason");
  if (variables.format) varDecls.push("$format:MediaFormat");
  if (variables.formats) varDecls.push("$formats:[MediaFormat]");
  if (variables.status) varDecls.push("$status:MediaStatus");

  const query = `query(${varDecls.join(",")}){Page(page:$page,perPage:$perPage){pageInfo{total currentPage lastPage}media(${mediaArgs.join(", ")}){id title{english romaji}coverImage{extraLarge large medium}averageScore format episodes seasonYear status genres}}}`;

  // AniList rate-limits Vercel IPs — retry on 429/500
  const MAX_RETRIES = 3;
  let lastError: any = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
      });
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`AniList rate limited (${res.status})`);
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      const data = await res.json();
      if (data?.errors) {
        console.error("[AniList] GraphQL errors:", data.errors);
        throw new Error(data.errors[0]?.message || "AniList GraphQL error");
      }
      return {
        data: (data?.data?.Page?.media || []).map((m: any) => ({
          mal_id: m.id,
          title: m.title?.english || m.title?.romaji || "Unknown",
          title_english: m.title?.english,
          images: { jpg: { large_image_url: m.coverImage?.large, small_image_url: m.coverImage?.medium } },
          score: m.averageScore ? m.averageScore / 10 : null,
          type: m.format || "TV",
          episodes: m.episodes,
          year: m.seasonYear,
          status: m.status,
        })),
        pagination: {
          items: { total: data?.data?.Page?.pageInfo?.total || 0 },
          last_visible_page: data?.data?.Page?.pageInfo?.lastPage || 1,
        },
      };
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
    }
  }
  throw lastError || new Error("AniList request failed after retries");
}

async function anilistGetSeasonal(year: string, season: string, params: any) {
  return anilistSearch({ ...params, start_date: `${year}-01-01`, season });
}

async function anilistGetGenres() {
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "{ GenreCollection }" }),
  });
  const data = await res.json();
  return { data: (data?.data?.GenreCollection || []).map((name: string, i: number) => ({ mal_id: i, name })) };
}

// ---- AnimeCard (inline, replaces AnimeCard component) ----
function AnimeCard({ anime, onClick }: { anime: any; onClick: (a: any) => void }) {
  const imageUrl = anime.images?.jpg?.large_image_url || anime.images?.jpg?.small_image_url || "";
  const title = anime.title_english || anime.title || "Untitled";
  const score = anime.score;
  const type = anime.type || "";
  const episodes = anime.episodes;

  return (
    <div className="anime-card" onClick={() => onClick(anime)}>
      <img className="anime-card-image" src={imageUrl} alt={title} loading="lazy"
        onError={(e) => { (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='300'%3E%3Crect fill='%23111' width='200' height='300'/%3E%3C/svg%3E"; }} />
      <div className="anime-card-overlay">
        <div className="anime-card-info">
          {score && <span className="anime-card-score">★ {score.toFixed(1)}</span>}
          {type && <span className="anime-card-type">{type}</span>}
          {episodes && <span className="anime-card-eps">{episodes} eps</span>}
        </div>
        <h3 className="anime-card-title">{title}</h3>
        {anime.year && <span className="anime-card-year">{anime.year}</span>}
      </div>
    </div>
  );
}

// ---- Main Component (from MioAnime Browse.jsx, adapted) ----
export default function BrowsePageNew() {
  const { navigate } = useAppStore();

  // ---- State (from MioAnime) ----
  const [queryText, setQueryText] = useState("");
  const [selectedGenreIds, setSelectedGenreIds] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState("SCORE_DESC");
  const [year, setYear] = useState("");
  const [season, setSeason] = useState("");
  const [selectedFormats, setSelectedFormats] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const [allGenres, setAllGenres] = useState<any[]>([]);
  const [genreSearchText, setGenreSearchText] = useState("");
  const [genreDropdownOpen, setGenreDropdownOpen] = useState(false);

  const [animeList, setAnimeList] = useState<any[]>([]);
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
  const debouncedGenreSearch = useDebounce(genreSearchText, 300);
  const debouncedQuery = useDebounce(queryText, 500);

  // ---- Fetch genres (from MioAnime) ----
  useEffect(() => {
    let cancelled = false;
    async function fetchGenres() {
      try {
        const response = await anilistGetGenres();
        if (!cancelled && response?.data) setAllGenres(response.data);
      } catch (err) { console.error("Failed to fetch genres:", err); }
    }
    fetchGenres();
    return () => { cancelled = true; };
  }, []);

  // ---- Close dropdowns on outside click (from MioAnime) ----
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (genreDropdownRef.current && !genreDropdownRef.current.contains(e.target as Node) &&
          genreInputRef.current && !genreInputRef.current.contains(e.target as Node)) setGenreDropdownOpen(false);
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(e.target as Node) &&
          sortTriggerRef.current && !sortTriggerRef.current.contains(e.target as Node)) setSortDropdownOpen(false);
      if (yearDropdownRef.current && !yearDropdownRef.current.contains(e.target as Node) &&
          yearTriggerRef.current && !yearTriggerRef.current.contains(e.target as Node)) setYearDropdownOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ---- Filter fingerprint for page reset (from MioAnime) ----
  const filterFingerprint = useMemo(() => {
    return JSON.stringify({ selectedGenreIds, sortBy, year, season, selectedFormats, status, debouncedQuery });
  }, [selectedGenreIds, sortBy, year, season, selectedFormats, status, debouncedQuery]);

  useEffect(() => {
    if (prevFiltersRef.current && prevFiltersRef.current !== filterFingerprint) setPage(1);
    prevFiltersRef.current = filterFingerprint;
  }, [filterFingerprint]);

  // ---- Fetch anime (from MioAnime, adapted for AniList) ----
  useEffect(() => {
    let cancelled = false;
    async function fetchAnime() {
      setLoading(true);
      setError(null);
      try {
        let response;
        const useSeasonal = season && year;
        if (useSeasonal) {
          const params: any = { page, perPage: ITEMS_PER_PAGE };
          if (selectedGenreIds.length > 0) params.genres = selectedGenreIds.join(",");
          if (selectedFormats.length === 1) params.type = selectedFormats[0];
          params.sort = sortBy;
          response = await anilistGetSeasonal(year, season, params);
        } else {
          const params: any = { page, perPage: ITEMS_PER_PAGE, sort: sortBy };
          if (debouncedQuery) params.q = debouncedQuery;
          if (selectedGenreIds.length > 0) params.genres = selectedGenreIds.join(",");
          if (year) { params.start_date = `${year}-01-01`; }
          if (selectedFormats.length > 0) params.type = selectedFormats.join(",");
          if (status) params.status = status;
          response = await anilistSearch(params);
        }
        if (!cancelled && response) {
          setAnimeList(response.data || []);
          setTotalResults(response.pagination?.items?.total || response.data?.length || 0);
          setLastPage(response.pagination?.last_visible_page || 1);
        }
      } catch (err: any) {
        if (!cancelled) { setError(err.message || "Failed to fetch anime"); setAnimeList([]); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchAnime();
    return () => { cancelled = true; };
  }, [selectedGenreIds, sortBy, year, season, selectedFormats, status, page, debouncedQuery]);

  // ---- Genre handlers (from MioAnime) ----
  const toggleGenre = useCallback((genreId: number) => {
    setSelectedGenreIds((prev) => {
      const id = String(genreId);
      return prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id];
    });
  }, []);

  const removeGenre = useCallback((genreId: number) => {
    setSelectedGenreIds((prev) => prev.filter((g) => g !== String(genreId)));
  }, []);

  const filteredGenres = useMemo(() => {
    if (!debouncedGenreSearch) return allGenres;
    const q = debouncedGenreSearch.toLowerCase();
    return allGenres.filter((g) => g.name.toLowerCase().includes(q));
  }, [allGenres, debouncedGenreSearch]);

  const selectedGenreObjects = useMemo(() => {
    return allGenres.filter((g) => selectedGenreIds.includes(String(g.mal_id)));
  }, [allGenres, selectedGenreIds]);

  // ---- Sidebar handlers (from MioAnime) ----
  const toggleSeason = useCallback((s: string) => {
    setSeason((prev) => {
      const newSeason = prev === s ? "" : s;
      if (newSeason && !year) setYear(String(new Date().getFullYear()));
      return newSeason;
    });
  }, [year]);

  const toggleFormat = useCallback((fmt: string) => {
    setSelectedFormats((prev) => prev.includes(fmt) ? prev.filter((f) => f !== fmt) : [...prev, fmt]);
  }, []);

  const toggleStatus = useCallback((st: string) => {
    setStatus((prev) => prev === st ? "" : st);
  }, []);

  const clearAllFilters = useCallback(() => {
    setSelectedGenreIds([]); setSortBy("SCORE_DESC"); setYear(""); setSeason("");
    setSelectedFormats([]); setStatus(""); setPage(1); setGenreSearchText(""); setQueryText("");
  }, []);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (season) count++;
    if (selectedFormats.length > 0) count += selectedFormats.length;
    if (status) count++;
    return count;
  }, [season, selectedFormats, status]);

  // ---- Pagination (from MioAnime) ----
  const getPageNumbers = useCallback(() => {
    const pages: (number | string)[] = [];
    const maxVisible = 7;
    if (lastPage <= maxVisible) {
      for (let i = 1; i <= lastPage; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push("...");
      const start = Math.max(2, page - 1), end = Math.min(lastPage - 1, page + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (page < lastPage - 2) pages.push("...");
      pages.push(lastPage);
    }
    return pages;
  }, [page, lastPage]);

  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [page]);

  const handleCardClick = useCallback((anime: any) => {
    navigate({ page: "anime", id: String(anime.mal_id) });
  }, [navigate]);

  // ---- Render (from MioAnime Browse.jsx) ----
  return (
    <div className="browse-page">
      <div className="browse-top-bar">
        <div className="browse-anime-search">
          <Search size={16} className="browse-anime-search-icon" />
          <input type="text" className="browse-anime-input" placeholder="Search anime by name..."
            value={queryText} onChange={(e) => setQueryText(e.target.value)} />
          {queryText && <button className="browse-clear-x" onClick={() => setQueryText("")}><X size={14} /></button>}
        </div>

        <div className="browse-genre-search" ref={genreInputRef}>
          <div className="browse-genre-search-wrapper">
            <Search size={16} className="browse-genre-search-icon" />
            <input type="text" className="browse-genre-input" placeholder="Search genres..."
              value={genreSearchText}
              onChange={(e) => { setGenreSearchText(e.target.value); setGenreDropdownOpen(true); }}
              onFocus={() => setGenreDropdownOpen(true)} />
            {genreSearchText && <button className="browse-clear-x" onClick={() => { setGenreSearchText(""); setGenreDropdownOpen(false); }}><X size={14} /></button>}
          </div>
          {selectedGenreObjects.length > 0 && (
            <div className="browse-genre-pills">
              {selectedGenreObjects.map((genre) => (
                <span key={genre.mal_id} className="browse-genre-pill">{genre.name}
                  <button className="browse-genre-pill-remove" onClick={() => removeGenre(genre.mal_id)}><X size={12} /></button>
                </span>
              ))}
            </div>
          )}
          {genreDropdownOpen && (
            <div className="browse-genre-dropdown" ref={genreDropdownRef}>
              {filteredGenres.length > 0 ? filteredGenres.map((genre) => {
                const isSelected = selectedGenreIds.includes(String(genre.mal_id));
                return <div key={genre.mal_id} className={`browse-genre-option ${isSelected ? "selected" : ""}`} onClick={() => toggleGenre(genre.mal_id)}>
                  <span className="browse-genre-option-check"><Check size={10} /></span>{genre.name}
                </div>;
              }) : <div className="browse-genre-no-results">No genres found</div>}
            </div>
          )}
        </div>

        <div className="browse-custom-dropdown" ref={sortTriggerRef}>
          <span className="browse-select-label">Sort</span>
          <button className={`browse-custom-dropdown-btn ${sortDropdownOpen ? "active" : ""}`} onClick={() => setSortDropdownOpen(!sortDropdownOpen)}>
            {SORT_OPTIONS.find((o) => o.value === sortBy)?.label || "Score (Highest)"}
            <ChevronDown size={14} className="browse-custom-dropdown-chevron" />
          </button>
          {sortDropdownOpen && (
            <div className="browse-custom-dropdown-menu" ref={sortDropdownRef}>
              {SORT_OPTIONS.map((opt) => (
                <div key={opt.value} className={`browse-custom-dropdown-option ${sortBy === opt.value ? "selected" : ""}`}
                  onClick={() => { setSortBy(opt.value); setSortDropdownOpen(false); }}>
                  <span className="browse-genre-option-check"><Check size={10} /></span>{opt.label}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="browse-custom-dropdown" ref={yearTriggerRef}>
          <span className="browse-select-label">Year</span>
          <button className={`browse-custom-dropdown-btn ${yearDropdownOpen ? "active" : ""}`} onClick={() => setYearDropdownOpen(!yearDropdownOpen)}>
            {year || "All Years"}
            <ChevronDown size={14} className="browse-custom-dropdown-chevron" />
          </button>
          {yearDropdownOpen && (
            <div className="browse-custom-dropdown-menu browse-custom-dropdown-menu--year" ref={yearDropdownRef}>
              <div className={`browse-custom-dropdown-option ${!year ? "selected" : ""}`} onClick={() => { setYear(""); setYearDropdownOpen(false); }}>
                <span className="browse-genre-option-check"><Check size={10} /></span>All Years
              </div>
              {YEARS.map((y) => (
                <div key={y} className={`browse-custom-dropdown-option ${String(year) === String(y) ? "selected" : ""}`}
                  onClick={() => { setYear(String(y)); setYearDropdownOpen(false); }}>
                  <span className="browse-genre-option-check"><Check size={10} /></span>{y}
                </div>
              ))}
            </div>
          )}
        </div>

        <button className="browse-mobile-filter-toggle" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
          <Filter size={16} />Filters{activeFilterCount > 0 && <span className="filter-count">{activeFilterCount}</span>}
        </button>
      </div>

      <div className="browse-content">
        <aside className={`browse-filters-sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
          <div className="browse-sidebar-title"><SlidersHorizontal size={18} />Filters</div>
          <div className="browse-filter-section">
            <div className="browse-filter-label">Season</div>
            <div className="browse-filter-options">
              {SEASONS.map((s) => (
                <button key={s} className={`browse-filter-btn ${season === s ? "active" : ""}`} onClick={() => toggleSeason(s)}>
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="browse-filter-section">
            <div className="browse-filter-label">Format</div>
            <div className="browse-filter-options">
              {FORMATS.map((fmt) => (
                <button key={fmt.value} className={`browse-filter-btn ${selectedFormats.includes(fmt.value) ? "active" : ""}`} onClick={() => toggleFormat(fmt.value)}>
                  {fmt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="browse-filter-section">
            <div className="browse-filter-label">Status</div>
            <div className="browse-filter-options">
              {STATUSES.map((st) => (
                <button key={st.value} className={`browse-filter-btn ${status === st.value ? "active" : ""}`} onClick={() => toggleStatus(st.value)}>
                  {st.label}
                </button>
              ))}
            </div>
          </div>
          <button className="browse-sidebar-clear" onClick={clearAllFilters}>Clear All Filters</button>
        </aside>

        <div className="browse-main">
          <div className="browse-results-header">
            <p className="browse-results-count">
              {loading ? "Loading results..." : <>Found <span>{totalResults.toLocaleString()}</span> anime</>}
            </p>
          </div>

          {loading && (
            <div className="browse-skeleton-grid">
              {Array.from({ length: ITEMS_PER_PAGE }).map((_, i) => (
                <div key={i} className="browse-skeleton-card" style={{ animationDelay: `${i * 0.04}s` }} />
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="browse-no-results">
              <Search size={56} className="browse-no-results-icon" />
              <h3 className="browse-no-results-title">Something went wrong</h3>
              <p className="browse-no-results-text">{error}</p>
              <button className="browse-clear-filters-btn" onClick={() => setPage(page)}>Try Again</button>
            </div>
          )}

          {!loading && !error && animeList.length === 0 && (
            <div className="browse-no-results">
              <Search size={56} className="browse-no-results-icon" />
              <h3 className="browse-no-results-title">No results found</h3>
              <p className="browse-no-results-text">Try adjusting your filters or search criteria to find what you're looking for.</p>
              <button className="browse-clear-filters-btn" onClick={clearAllFilters}><X size={14} />Clear All Filters</button>
            </div>
          )}

          {!loading && !error && animeList.length > 0 && (
            <>
              <div className="browse-results-grid">
                {animeList.map((anime) => (
                  <AnimeCard key={anime.mal_id} anime={anime} onClick={handleCardClick} />
                ))}
              </div>
              {lastPage > 1 && (
                <div className="browse-pagination">
                  <button className="browse-pagination-btn" disabled={page <= 1} onClick={() => setPage(Math.max(1, page - 1))}><ChevronLeft size={16} /></button>
                  {getPageNumbers().map((p, idx) => p === "..." ? (
                    <span key={`e-${idx}`} className="browse-pagination-ellipsis">…</span>
                  ) : (
                    <button key={p} className={`browse-pagination-btn ${page === p ? "active" : ""}`} onClick={() => setPage(p as number)}>{p}</button>
                  ))}
                  <button className="browse-pagination-btn" disabled={page >= lastPage} onClick={() => setPage(Math.min(lastPage, page + 1))}><ChevronRight size={16} /></button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
