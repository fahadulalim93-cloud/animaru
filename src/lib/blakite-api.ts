/**
 * Blakite API Client
 * ------------------
 * Blakite (https://blakiteapi.xyz) is a Hindi/English dubbed anime + K-Drama
 * streaming API. The main endpoint returns the entire catalog as a single JSON
 * payload containing movies, series, and dramas with language tags (Hindi, Hindi Dub,
 * English Dub, Korean, etc.).
 *
 * Streaming URLs use the Blogger-based frontend at blakiteanime.buzz:
 *   /2026/08/streaming.html?type={Movie|Series|Drama}&id={uniqueId}&s={season}&ep={episode}
 *
 * API flow:
 *   1. Fetch full catalog: GET https://blakiteapi.xyz/api/getAllAnime.php
 *      → Returns { success, data: { movies: {}, series: {}, dramas: {} } }
 *   2. Filter by language (Hindi / Hindi Dub) for Hindi content
 *   3. Build streaming URL from the uniqueId + type
 *   4. The streaming page is an iframe embed that loads video via their CDN
 *
 * The API works without authentication on the free tier (100 req/day).
 * Premium (₹999/mo) gives unlimited requests + 4K quality.
 *
 * CDN domains used by Blakite:
 *   - stream.blakiteanime.buzz (streaming frontend)
 *   - Various embed CDNs via the Blogger streaming.html page
 */

const BLAKITE_API_BASE = "https://blakiteapi.xyz";
const BLAKITE_STREAM_BASE = "https://www.blakiteanime.buzz";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// Cache TTL for the full catalog (it's a large payload — cache for 30 min)
const CATALOG_CACHE_TTL = 30 * 60 * 1000;

// =====================================================
// TYPES
// =====================================================

export interface BlakiteImageSet {
  poster: string;
  backdrop: string;
  thumbnail: string;
}

export interface BlakiteTmdbData {
  genres: string[];
  keywords: string[];
  releaseDate: string;
}

export interface BlakiteSeason {
  seasonNumber: number;
  totalEpisodes: number;
  status: string;
  updatedAt: string;
}

export interface BlakiteMovie {
  title: string;
  language: string;
  IMAGES: BlakiteImageSet;
  TMDB_DATA: BlakiteTmdbData;
  status: string;
  updatedAt: string;
  createdAt: string;
}

export interface BlakiteSeries {
  title: string;
  language: string;
  IMAGES: BlakiteImageSet;
  TMDB_DATA: BlakiteTmdbData;
  status: string;
  seasons: Record<string, BlakiteSeason>;
  updatedAt: string;
  createdAt: string;
}

export interface BlakiteDrama {
  title: string;
  language: string;
  IMAGES: BlakiteImageSet;
  TMDB_DATA?: BlakiteTmdbData;
  status: string;
  seasons?: Record<string, BlakiteSeason>;
  updatedAt: string;
  createdAt: string;
}

export interface BlakiteCatalog {
  movies: Record<string, BlakiteMovie>;
  series: Record<string, BlakiteSeries>;
  dramas: Record<string, BlakiteDrama>;
}

export interface BlakiteCatalogResponse {
  success: boolean;
  data: BlakiteCatalog;
}

/** Unified item for search/filter results */
export interface BlakiteAnimeItem {
  id: string;
  title: string;
  language: string;
  type: "movie" | "series" | "drama";
  status: string;
  poster: string;
  backdrop: string;
  genres: string[];
  seasons?: Record<string, BlakiteSeason>;
  releaseDate: string;
}

export interface BlakiteServer {
  id: string;
  name: string;
  source: "blakite";
  type: "movie" | "series" | "drama";
  language: string;
  quality: string;
  streamUrl: string;
  isM3U8: boolean;
  isMP4: boolean;
  isEmbed: boolean;
  priority: number;
}

// =====================================================
// CATALOG CACHE
// =====================================================

let cachedCatalog: BlakiteCatalog | null = null;
let cachedAt = 0;

/**
 * Fetch the full Blakite anime catalog.
 * Cached in-memory for 30 minutes to avoid hammering the API.
 */
export async function blakiteFetchCatalog(): Promise<BlakiteCatalog | null> {
  const now = Date.now();
  if (cachedCatalog && now - cachedAt < CATALOG_CACHE_TTL) {
    return cachedCatalog;
  }

  try {
    const url = `${BLAKITE_API_BASE}/api/getAllAnime.php`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept": "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      console.error(`[Blakite] catalog fetch failed: ${res.status}`);
      return cachedCatalog; // return stale cache if available
    }

    const json: BlakiteCatalogResponse = await res.json();
    if (!json.success || !json.data) {
      console.error("[Blakite] catalog response missing data");
      return cachedCatalog;
    }

    cachedCatalog = json.data;
    cachedAt = now;
    return cachedCatalog;
  } catch (err) {
    console.error("[Blakite] Failed to fetch catalog:", err);
    return cachedCatalog; // return stale cache on error
  }
}

// =====================================================
// SEARCH & FILTER
// =====================================================

/**
 * Get all Hindi-dubbed items from the Blakite catalog.
 * Filters for language containing "Hindi".
 */
export async function blakiteGetHindiItems(): Promise<BlakiteAnimeItem[]> {
  const catalog = await blakiteFetchCatalog();
  if (!catalog) return [];

  const items: BlakiteAnimeItem[] = [];

  // Helper: determine if an entry is Hindi content.
  // The Blakite API uses various language tags:
  //   - "Hindi Subbed", "Hindi", "Hindi Dub" → obvious Hindi
  //   - "ORG" → original language, BUT the title often contains "(Hindi Dubbed)"
  //     or "(Hindi Subbed)" as a suffix. We include these too.
  const isHindiEntry = (language: string, title: string): boolean => {
    const lang = language.toLowerCase();
    const ttl = title.toLowerCase();
    return lang.includes("hindi") || ttl.includes("hindi");
  };

  // Movies
  for (const [id, movie] of Object.entries(catalog.movies)) {
    if (isHindiEntry(movie.language, movie.title)) {
      items.push({
        id,
        title: movie.title,
        language: movie.language,
        type: "movie",
        status: movie.status,
        poster: movie.IMAGES.poster,
        backdrop: movie.IMAGES.backdrop,
        genres: movie.TMDB_DATA.genres,
        releaseDate: movie.TMDB_DATA.releaseDate,
      });
    }
  }

  // Series
  for (const [id, series] of Object.entries(catalog.series)) {
    if (isHindiEntry(series.language, series.title)) {
      items.push({
        id,
        title: series.title,
        language: series.language,
        type: "series",
        status: series.status,
        poster: series.IMAGES.poster,
        backdrop: series.IMAGES.backdrop,
        genres: series.TMDB_DATA.genres,
        seasons: series.seasons,
        releaseDate: series.TMDB_DATA.releaseDate,
      });
    }
  }

  // Dramas (K-Dramas sometimes have Hindi dubs too)
  for (const [id, drama] of Object.entries(catalog.dramas)) {
    if (isHindiEntry(drama.language, drama.title)) {
      items.push({
        id,
        title: drama.title,
        language: drama.language,
        type: "drama",
        status: drama.status,
        poster: drama.IMAGES.poster,
        backdrop: drama.IMAGES.backdrop,
        genres: drama.TMDB_DATA?.genres || [],
        seasons: drama.seasons,
        releaseDate: drama.TMDB_DATA?.releaseDate || "",
      });
    }
  }

  return items;
}

/**
 * Search the Blakite catalog for items matching a query string.
 * Searches title (case-insensitive) and filters for Hindi content.
 */
export async function blakiteSearchHindi(
  query: string
): Promise<BlakiteAnimeItem[]> {
  const allItems = await blakiteGetHindiItems();
  const q = query.toLowerCase().trim();
  if (!q) return allItems;

  return allItems.filter((item) =>
    item.title.toLowerCase().includes(q)
  );
}

/**
 * Get a specific item from the catalog by its uniqueId.
 */
export async function blakiteGetItem(
  uniqueId: string
): Promise<BlakiteAnimeItem | null> {
  const catalog = await blakiteFetchCatalog();
  if (!catalog) return null;

  // Check movies
  if (catalog.movies[uniqueId]) {
    const m = catalog.movies[uniqueId];
    return {
      id: uniqueId,
      title: m.title,
      language: m.language,
      type: "movie",
      status: m.status,
      poster: m.IMAGES.poster,
      backdrop: m.IMAGES.backdrop,
      genres: m.TMDB_DATA.genres,
      releaseDate: m.TMDB_DATA.releaseDate,
    };
  }

  // Check series
  if (catalog.series[uniqueId]) {
    const s = catalog.series[uniqueId];
    return {
      id: uniqueId,
      title: s.title,
      language: s.language,
      type: "series",
      status: s.status,
      poster: s.IMAGES.poster,
      backdrop: s.IMAGES.backdrop,
      genres: s.TMDB_DATA.genres,
      seasons: s.seasons,
      releaseDate: s.TMDB_DATA.releaseDate,
    };
  }

  // Check dramas
  if (catalog.dramas[uniqueId]) {
    const d = catalog.dramas[uniqueId];
    return {
      id: uniqueId,
      title: d.title,
      language: d.language,
      type: "drama",
      status: d.status,
      poster: d.IMAGES.poster,
      backdrop: d.IMAGES.backdrop,
      genres: d.TMDB_DATA?.genres || [],
      seasons: d.seasons,
      releaseDate: d.TMDB_DATA?.releaseDate || "",
    };
  }

  return null;
}

// =====================================================
// STREAMING URL GENERATION
// =====================================================

/**
 * Build the Blakite streaming page URL for a given item.
 *
 * The streaming page is a Blogger page that loads an embed player.
 * Format: /2026/08/streaming.html?type={type}&id={id}[&s={season}&ep={episode}]
 *
 * For movies: type=Movie, no season/episode
 * For series: type=Series, s=seasonNumber, ep=episodeNumber
 * For dramas: type=Drama, s=seasonNumber, ep=episodeNumber
 */
export function blakiteBuildStreamUrl(
  uniqueId: string,
  itemType: "movie" | "series" | "drama",
  episode: number = 1,
  season: number = 1
): string {
  const typeParam =
    itemType === "movie"
      ? "Movie"
      : itemType === "series"
        ? "Series"
        : "Drama";

  let url = `${BLAKITE_STREAM_BASE}/2026/08/streaming.html?type=${typeParam}&id=${encodeURIComponent(uniqueId)}`;

  if (itemType !== "movie") {
    url += `&s=${season}&ep=${episode}`;
  }

  return url;
}

/**
 * Resolve streaming servers for a Blakite anime item.
 *
 * Returns embed URLs pointing to the Blakite streaming page.
 * The actual video is loaded inside an iframe on that page.
 * We return it as an embed/iframe server — the LuffyTV watch page
 * will render it in an iframe.
 *
 * For series/dramas with multiple seasons, you can specify which
 * season and episode to resolve.
 */
export async function blakiteResolveStreams(
  uniqueId: string,
  episode: number = 1,
  season: number = 1
): Promise<BlakiteServer[]> {
  const item = await blakiteGetItem(uniqueId);
  if (!item) return [];

  const streamUrl = blakiteBuildStreamUrl(uniqueId, item.type, episode, season);

  // Determine quality based on language tag
  const quality = item.language.toLowerCase().includes("4k")
    ? "4K"
    : "1080p";

  const servers: BlakiteServer[] = [
    {
      id: `blakite:${uniqueId}:embed`,
      name: `Blakite ${item.type === "movie" ? "Movie" : item.type === "series" ? "Hindi Dub" : "K-Drama Hindi"}`,
      source: "blakite",
      type: item.type,
      language: item.language,
      quality,
      streamUrl,
      isM3U8: false,
      isMP4: false,
      isEmbed: true,
      priority: 1.0,
    },
  ];

  // If the item has multiple seasons, also add a direct season link
  if (item.seasons && Object.keys(item.seasons).length > 1 && season > 1) {
    const sKey = String(season);
    const seasonInfo = item.seasons[sKey];
    if (seasonInfo) {
      servers.push({
        id: `blakite:${uniqueId}:s${season}:embed`,
        name: `Blakite S${season} Hindi Dub`,
        source: "blakite",
        type: item.type,
        language: item.language,
        quality,
        streamUrl,
        isM3U8: false,
        isMP4: false,
        isEmbed: true,
        priority: 0.9,
      });
    }
  }

  return servers;
}

/**
 * Quick helper: search Blakite catalog by AniList title
 * to find the matching Blakite uniqueId for cross-referencing.
 */
export async function blakiteFindByTitle(
  title: string
): Promise<BlakiteAnimeItem | null> {
  const results = await blakiteSearchHindi(title);
  if (results.length === 0) return null;

  // Exact match first
  const exact = results.find(
    (r) => r.title.toLowerCase() === title.toLowerCase()
  );
  if (exact) return exact;

  // Then first partial match
  return results[0];
}

/**
 * Get the total number of Hindi items in the Blakite catalog.
 */
export async function blakiteGetHindiCount(): Promise<number> {
  const items = await blakiteGetHindiItems();
  return items.length;
}
