// TMDB API Client — Movies, TV Shows, and Anime info
// Uses TMDB_API_KEY (v3) and TMDB_READ_ACCESS_TOKEN (v4 Bearer)

const TMDB_API_KEY = process.env.TMDB_API_KEY || "";
const TMDB_READ_TOKEN = process.env.TMDB_READ_ACCESS_TOKEN || "";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p";

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (TMDB_READ_TOKEN) {
    headers.Authorization = `Bearer ${TMDB_READ_TOKEN}`;
  }
  return headers;
}

const HEADERS = buildHeaders();

function tmdbUrl(endpoint: string, extraParams?: Record<string, string>): string {
  const url = new URL(`${TMDB_BASE}${endpoint}`);
  if (TMDB_API_KEY && !TMDB_API_KEY.startsWith("eyJ")) {
    url.searchParams.set("api_key", TMDB_API_KEY);
  }
  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))
  ]).catch((err) => {
    if (err instanceof Error && err.message === "timeout") return fallback;
    // Re-throw non-timeout errors so callers can handle them
    throw err;
  });
}

// ============================================================
// Types
// ============================================================

export interface TMDBShow {
  id: number;
  name?: string;
  title?: string;
  original_name?: string;
  original_title?: string;
  overview?: string;
  poster_path?: string;
  backdrop_path?: string;
  vote_average?: number;
  vote_count?: number;
  genres?: Array<{ id: number; name: string }>;
  number_of_seasons?: number;
  number_of_episodes?: number;
  seasons?: Array<{
    id: number; name: string; season_number: number;
    episode_count: number; poster_path?: string; air_date?: string;
  }>;
  videos?: { results: Array<{ id: string; key: string; name: string; site: string; type: string }> };
  similar?: { results: TMDBShow[] };
  recommendations?: { results: TMDBShow[] };
  credits?: {
    cast: Array<{ id: number; name: string; character?: string; profile_path?: string; order?: number }>;
    crew?: Array<{ id: number; name: string; job?: string; department?: string; profile_path?: string }>;
  };
  external_ids?: { imdb_id?: string; tvdb_id?: number };
  networks?: Array<{ id: number; name: string; logo_path?: string }>;
  production_companies?: Array<{ id: number; name: string; logo_path?: string }>;
  release_date?: string;
  first_air_date?: string;
  runtime?: number;
  episode_run_time?: number[];
  status?: string;
  tagline?: string;
  belongs_to_collection?: { id: number; name: string; poster_path?: string; backdrop_path?: string };
  adult?: boolean;
  popularity?: number;
  origin_country?: string[];
  original_language?: string;
  spoken_languages?: Array<{ english_name: string; iso_639_1: string; name?: string }>;
  type?: string; // for TMDB search results
  media_type?: string;
}

export interface TMDBSeasonDetail {
  id: number;
  name: string;
  season_number: number;
  episodes: Array<{
    id: number;
    name: string;
    overview?: string;
    episode_number: number;
    season_number: number;
    still_path?: string;
    air_date?: string;
    runtime?: number;
    vote_average?: number;
  }>;
}

export interface TMDBGenre {
  id: number;
  name: string;
}

// ============================================================
// Image URL Helper
// ============================================================

export function tmdbImageUrl(path: string | null | undefined, size: "w92" | "w185" | "w342" | "w500" | "w780" | "original" = "w500"): string {
  if (!path) return "";
  return `${TMDB_IMG}/${size}${path}`;
}

export function isTmdbConfigured(): boolean {
  return !!(TMDB_API_KEY || TMDB_READ_TOKEN);
}

// ============================================================
// Search
// ============================================================

/** Search TMDB for TV shows */
export async function tmdbSearchTV(query: string, page = 1): Promise<{ results: TMDBShow[]; total_pages: number; total_results: number }> {
  if (!isTmdbConfigured()) return { results: [], total_pages: 0, total_results: 0 };
  try {
    const res = await withTimeout(
      fetch(tmdbUrl("/search/tv", { query, page: String(page) }), {
        headers: HEADERS, next: { revalidate: 300 },
      }), 8000, null
    );
    if (!res) return { results: [], total_pages: 0, total_results: 0 };
    if (!res.ok) return { results: [], total_pages: 0, total_results: 0 };
    return await res.json();
  } catch { return { results: [], total_pages: 0, total_results: 0 }; }
}

/** Search TMDB for movies */
export async function tmdbSearchMovie(query: string, page = 1): Promise<{ results: TMDBShow[]; total_pages: number; total_results: number }> {
  if (!isTmdbConfigured()) return { results: [], total_pages: 0, total_results: 0 };
  try {
    const res = await withTimeout(
      fetch(tmdbUrl("/search/movie", { query, page: String(page) }), {
        headers: HEADERS, next: { revalidate: 300 },
      }), 8000, null
    );
    if (!res) return { results: [], total_pages: 0, total_results: 0 };
    if (!res.ok) return { results: [], total_pages: 0, total_results: 0 };
    return await res.json();
  } catch { return { results: [], total_pages: 0, total_results: 0 }; }
}

/** Multi-search TMDB (movies + TV + people) */
export async function tmdbSearchMulti(query: string, page = 1): Promise<{ results: TMDBShow[]; total_pages: number; total_results: number }> {
  if (!isTmdbConfigured()) return { results: [], total_pages: 0, total_results: 0 };
  try {
    const res = await withTimeout(
      fetch(tmdbUrl("/search/multi", { query, page: String(page) }), {
        headers: HEADERS, next: { revalidate: 300 },
      }), 8000, null
    );
    if (!res) return { results: [], total_pages: 0, total_results: 0 };
    if (!res.ok) return { results: [], total_pages: 0, total_results: 0 };
    const data = await res.json();
    // Filter out person results
    data.results = (data.results || []).filter((r: TMDBShow) => r.media_type !== "person");
    return data;
  } catch { return { results: [], total_pages: 0, total_results: 0 }; }
}

// ============================================================
// Trending
// ============================================================

/** Get trending all (movies + TV) for the day/week */
export async function tmdbTrendingAll(timeWindow: "day" | "week" = "week", page = 1): Promise<{ results: TMDBShow[]; total_pages: number }> {
  if (!isTmdbConfigured()) return { results: [], total_pages: 0 };
  try {
    const res = await withTimeout(
      fetch(tmdbUrl(`/trending/all/${timeWindow}`, { page: String(page) }), {
        headers: HEADERS, next: { revalidate: 1800 },
      }), 8000, null
    );
    if (!res) return { results: [], total_pages: 0 };
    if (!res.ok) return { results: [], total_pages: 0 };
    return await res.json();
  } catch { return { results: [], total_pages: 0 }; }
}

/** Get trending movies */
export async function tmdbTrendingMovies(timeWindow: "day" | "week" = "week", page = 1): Promise<{ results: TMDBShow[]; total_pages: number }> {
  if (!isTmdbConfigured()) return { results: [], total_pages: 0 };
  try {
    const res = await withTimeout(
      fetch(tmdbUrl(`/trending/movie/${timeWindow}`, { page: String(page) }), {
        headers: HEADERS, next: { revalidate: 1800 },
      }), 8000, null
    );
    if (!res) return { results: [], total_pages: 0 };
    if (!res.ok) return { results: [], total_pages: 0 };
    return await res.json();
  } catch { return { results: [], total_pages: 0 }; }
}

/** Get trending TV shows */
export async function tmdbTrendingTV(timeWindow: "day" | "week" = "week", page = 1): Promise<{ results: TMDBShow[]; total_pages: number }> {
  if (!isTmdbConfigured()) return { results: [], total_pages: 0 };
  try {
    const res = await withTimeout(
      fetch(tmdbUrl(`/trending/tv/${timeWindow}`, { page: String(page) }), {
        headers: HEADERS, next: { revalidate: 1800 },
      }), 8000, null
    );
    if (!res) return { results: [], total_pages: 0 };
    if (!res.ok) return { results: [], total_pages: 0 };
    return await res.json();
  } catch { return { results: [], total_pages: 0 }; }
}

// ============================================================
// Movies
// ============================================================

/** Popular movies */
export async function tmdbPopularMovies(page = 1): Promise<{ results: TMDBShow[]; total_pages: number }> {
  if (!isTmdbConfigured()) return { results: [], total_pages: 0 };
  try {
    const res = await withTimeout(
      fetch(tmdbUrl("/movie/popular", { page: String(page) }), {
        headers: HEADERS, next: { revalidate: 3600 },
      }), 8000, null
    );
    if (!res) return { results: [], total_pages: 0 };
    if (!res.ok) return { results: [], total_pages: 0 };
    return await res.json();
  } catch { return { results: [], total_pages: 0 }; }
}

/** Top rated movies */
export async function tmdbTopRatedMovies(page = 1): Promise<{ results: TMDBShow[]; total_pages: number }> {
  if (!isTmdbConfigured()) return { results: [], total_pages: 0 };
  try {
    const res = await withTimeout(
      fetch(tmdbUrl("/movie/top_rated", { page: String(page) }), {
        headers: HEADERS, next: { revalidate: 3600 },
      }), 8000, null
    );
    if (!res) return { results: [], total_pages: 0 };
    if (!res.ok) return { results: [], total_pages: 0 };
    return await res.json();
  } catch { return { results: [], total_pages: 0 }; }
}

/** Now playing movies */
export async function tmdbNowPlayingMovies(page = 1): Promise<{ results: TMDBShow[]; total_pages: number }> {
  if (!isTmdbConfigured()) return { results: [], total_pages: 0 };
  try {
    const res = await withTimeout(
      fetch(tmdbUrl("/movie/now_playing", { page: String(page) }), {
        headers: HEADERS, next: { revalidate: 3600 },
      }), 8000, null
    );
    if (!res) return { results: [], total_pages: 0 };
    if (!res.ok) return { results: [], total_pages: 0 };
    return await res.json();
  } catch { return { results: [], total_pages: 0 }; }
}

/** Upcoming movies */
export async function tmdbUpcomingMovies(page = 1): Promise<{ results: TMDBShow[]; total_pages: number }> {
  if (!isTmdbConfigured()) return { results: [], total_pages: 0 };
  try {
    const res = await withTimeout(
      fetch(tmdbUrl("/movie/upcoming", { page: String(page) }), {
        headers: HEADERS, next: { revalidate: 3600 },
      }), 8000, null
    );
    if (!res) return { results: [], total_pages: 0 };
    if (!res.ok) return { results: [], total_pages: 0 };
    return await res.json();
  } catch { return { results: [], total_pages: 0 }; }
}

/** Discover movies with optional genre filter */
export async function tmdbDiscoverMovies(params: { genre?: number; sort_by?: string; page?: number; with_original_language?: string; vote_count_gte?: number }): Promise<{ results: TMDBShow[]; total_pages: number }> {
  if (!isTmdbConfigured()) return { results: [], total_pages: 0 };
  try {
    const extraParams: Record<string, string> = { page: String(params.page || 1) };
    if (params.genre) extraParams.with_genres = String(params.genre);
    if (params.sort_by) extraParams.sort_by = params.sort_by;
    if (params.with_original_language) extraParams.with_original_language = params.with_original_language;
    if (params.vote_count_gte) extraParams["vote_count.gte"] = String(params.vote_count_gte);
    const res = await withTimeout(
      fetch(tmdbUrl("/discover/movie", extraParams), {
        headers: HEADERS, next: { revalidate: 3600 },
      }), 8000, null
    );
    if (!res) return { results: [], total_pages: 0 };
    if (!res.ok) return { results: [], total_pages: 0 };
    return await res.json();
  } catch { return { results: [], total_pages: 0 }; }
}

/** Movie details */
export async function tmdbMovieDetails(movieId: number): Promise<TMDBShow | null> {
  if (!isTmdbConfigured()) return null;
  try {
    const res = await withTimeout(
      fetch(tmdbUrl(`/movie/${movieId}`, {
        append_to_response: "videos,similar,recommendations,credits,external_ids",
      }), {
        headers: HEADERS, next: { revalidate: 3600 },
      }), 8000, null
    );
    if (!res) return null;
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ============================================================
// TV Shows
// ============================================================

/** Popular TV shows */
export async function tmdbPopularTV(page = 1): Promise<{ results: TMDBShow[]; total_pages: number }> {
  if (!isTmdbConfigured()) return { results: [], total_pages: 0 };
  try {
    const res = await withTimeout(
      fetch(tmdbUrl("/tv/popular", { page: String(page) }), {
        headers: HEADERS, next: { revalidate: 3600 },
      }), 8000, null
    );
    if (!res) return { results: [], total_pages: 0 };
    if (!res.ok) return { results: [], total_pages: 0 };
    return await res.json();
  } catch { return { results: [], total_pages: 0 }; }
}

/** Top rated TV shows */
export async function tmdbTopRatedTV(page = 1): Promise<{ results: TMDBShow[]; total_pages: number }> {
  if (!isTmdbConfigured()) return { results: [], total_pages: 0 };
  try {
    const res = await withTimeout(
      fetch(tmdbUrl("/tv/top_rated", { page: String(page) }), {
        headers: HEADERS, next: { revalidate: 3600 },
      }), 8000, null
    );
    if (!res) return { results: [], total_pages: 0 };
    if (!res.ok) return { results: [], total_pages: 0 };
    return await res.json();
  } catch { return { results: [], total_pages: 0 }; }
}

/** On the air TV shows */
export async function tmdbOnTheAirTV(page = 1): Promise<{ results: TMDBShow[]; total_pages: number }> {
  if (!isTmdbConfigured()) return { results: [], total_pages: 0 };
  try {
    const res = await withTimeout(
      fetch(tmdbUrl("/tv/on_the_air", { page: String(page) }), {
        headers: HEADERS, next: { revalidate: 3600 },
      }), 8000, null
    );
    if (!res) return { results: [], total_pages: 0 };
    if (!res.ok) return { results: [], total_pages: 0 };
    return await res.json();
  } catch { return { results: [], total_pages: 0 }; }
}

/** Discover TV with optional genre filter */
export async function tmdbDiscoverTV(params: { genre?: number; sort_by?: string; page?: number; with_original_language?: string; vote_count_gte?: number }): Promise<{ results: TMDBShow[]; total_pages: number }> {
  if (!isTmdbConfigured()) return { results: [], total_pages: 0 };
  try {
    const extraParams: Record<string, string> = { page: String(params.page || 1) };
    if (params.genre) extraParams.with_genres = String(params.genre);
    if (params.sort_by) extraParams.sort_by = params.sort_by;
    if (params.with_original_language) extraParams.with_original_language = params.with_original_language;
    if (params.vote_count_gte) extraParams["vote_count.gte"] = String(params.vote_count_gte);
    const res = await withTimeout(
      fetch(tmdbUrl("/discover/tv", extraParams), {
        headers: HEADERS, next: { revalidate: 3600 },
      }), 8000, null
    );
    if (!res) return { results: [], total_pages: 0 };
    if (!res.ok) return { results: [], total_pages: 0 };
    return await res.json();
  } catch { return { results: [], total_pages: 0 }; }
}

/** TV show details */
export async function tmdbTVDetails(tmdbId: number): Promise<TMDBShow | null> {
  if (!isTmdbConfigured()) return null;
  try {
    const res = await withTimeout(
      fetch(tmdbUrl(`/tv/${tmdbId}`, {
        append_to_response: "videos,similar,recommendations,credits,external_ids",
      }), {
        headers: HEADERS, next: { revalidate: 3600 },
      }), 8000, null
    );
    if (!res) return null;
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

/** TV season details (episode list) */
export async function tmdbSeasonDetails(tvId: number, seasonNumber: number): Promise<TMDBSeasonDetail | null> {
  if (!isTmdbConfigured()) return null;
  try {
    const res = await withTimeout(
      fetch(tmdbUrl(`/tv/${tvId}/season/${seasonNumber}`), {
        headers: HEADERS, next: { revalidate: 3600 },
      }), 8000, null
    );
    if (!res) return null;
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ============================================================
// Genres
// ============================================================

/** Get movie genres */
export async function tmdbMovieGenres(): Promise<TMDBGenre[]> {
  if (!isTmdbConfigured()) return [];
  try {
    const res = await withTimeout(
      fetch(tmdbUrl("/genre/movie/list"), {
        headers: HEADERS, next: { revalidate: 86400 },
      }), 8000, null
    );
    if (!res) return [];
    if (!res.ok) return [];
    const data = await res.json();
    return data.genres || [];
  } catch { return []; }
}

/** Get TV genres */
export async function tmdbTVGenres(): Promise<TMDBGenre[]> {
  if (!isTmdbConfigured()) return [];
  try {
    const res = await withTimeout(
      fetch(tmdbUrl("/genre/tv/list"), {
        headers: HEADERS, next: { revalidate: 86400 },
      }), 8000, null
    );
    if (!res) return [];
    if (!res.ok) return [];
    const data = await res.json();
    return data.genres || [];
  } catch { return []; }
}

// ============================================================
// Anime-specific helpers
// ============================================================

/** Smart search for anime TMDB ID by trying multiple title variants */
export async function tmdbFindAnimeTMDBId(
  titles: { english?: string; romaji?: string; native?: string }
): Promise<{ tmdbId: number; name: string; poster_path?: string; backdrop_path?: string; vote_average?: number } | null> {
  if (!isTmdbConfigured()) return null;
  const queries: string[] = [];
  if (titles.english) queries.push(titles.english);
  if (titles.romaji && titles.romaji !== titles.english) queries.push(titles.romaji);
  if (titles.native) queries.push(titles.native);

  for (const query of queries) {
    try {
      const results = await tmdbSearchTV(query);
      if (results.results.length > 0) {
        const exactMatch = results.results.find(
          (r: TMDBShow) => (r.name?.toLowerCase() === query.toLowerCase()) ||
                      (r.original_name?.toLowerCase() === query.toLowerCase())
        );
        const best = exactMatch || results.results[0];
        return {
          tmdbId: best.id,
          name: best.name || best.original_name || query,
          poster_path: best.poster_path,
          backdrop_path: best.backdrop_path,
          vote_average: best.vote_average,
        };
      }
    } catch { continue; }
  }
  return null;
}

/**
 * Fetch episode stills (thumbnails) for all seasons of a TMDB TV show.
 * Returns a Map<episodeNumber, stillUrl> for quick lookup.
 * episodeNumber is absolute (s1e1=1, s1e2=2, s2e1=13 if s1 has 12 eps, etc.)
 */
export async function tmdbFetchAllEpisodeStills(
  tmdbId: number,
  maxSeasons: number = 8
): Promise<Map<number, { still: string; title: string; overview: string }>> {
  const episodeMap = new Map<number, { still: string; title: string; overview: string }>();
  if (!isTmdbConfigured()) return episodeMap;

  // First get show details to know how many seasons there are
  const show = await tmdbTVDetails(tmdbId);
  if (!show || !show.seasons) return episodeMap;

  const seasons = show.seasons
    .filter(s => s.season_number > 0) // skip specials (season 0)
    .slice(0, maxSeasons);

  // Fetch all seasons in parallel
  const seasonResults = await Promise.all(
    seasons.map(s => tmdbSeasonDetails(tmdbId, s.season_number))
  );

  let absoluteEp = 0;
  for (const season of seasonResults) {
    if (!season?.episodes) continue;
    for (const ep of season.episodes) {
      absoluteEp++;
      // Always add the episode — use still_path if available,
      // otherwise use the show's backdrop as fallback
      const stillUrl = ep.still_path
        ? tmdbImageUrl(ep.still_path, "w500")
        : (show.backdrop_path ? tmdbImageUrl(show.backdrop_path, "w500") : "");
      episodeMap.set(absoluteEp, {
        still: stillUrl,
        title: ep.name || "",
        overview: ep.overview || "",
      });
    }
  }

  return episodeMap;
}

/** Find TMDB ID from external ID (IMDb, TVDB) */
export async function tmdbFindByExternalId(externalId: string, source: "imdb_id" | "tvdb_id"): Promise<TMDBShow | null> {
  if (!isTmdbConfigured()) return null;
  try {
    const res = await withTimeout(
      fetch(tmdbUrl(`/find/${encodeURIComponent(externalId)}`, {
        external_source: source,
      }), {
        headers: HEADERS, next: { revalidate: 3600 },
      }), 8000, null
    );
    if (!res) return null;
    if (!res.ok) return null;
    const data = await res.json();
    return (data.tv_results?.[0] || data.movie_results?.[0] || null);
  } catch { return null; }
}
