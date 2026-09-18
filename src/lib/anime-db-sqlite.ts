/**
 * Anime DB — SQLite Fallback Layer
 * =================================
 * Opens the 20K-anime SQLite database (113MB) read-only and provides:
 *   - getAnimeByAnilistId(id) → returns AniList-formatted JSON
 *   - searchAnime(query) → FTS5 full-text search across all titles
 *
 * The DB is mounted at /data/anime-db.sqlite (read-only volume mount).
 * Falls back to /app/data/anime-db.sqlite if /data isn't mounted.
 *
 * Each row's `raw_json` column contains the FULL AniList GraphQL response
 * (same format as what AniList returns), so we can return it directly
 * without any transformation — the app treats it identically to a live
 * AniList response.
 */

// Use 'any' for the Database type to avoid needing @types/better-sqlite3
let db: any = null;
let dbLoadAttempted = false;
let dbLastAttempt = 0;
let dbLoadError: string | null = null;

const POSSIBLE_PATHS = [
  "/data/anime-db.sqlite",          // Coolify volume mount (primary)
  "/app/data/anime-db.sqlite",      // Copied into container
  "./data/anime-db.sqlite",         // Relative to cwd
  "data/anime-db.sqlite",           // Without leading ./
];

/**
 * Lazily open the SQLite database. Returns null if file not found.
 * Opens in read-only mode so we never accidentally corrupt the DB.
 */
function getDb(): any | null {
  if (db) return db;
  // ── Retry logic ──
  // If the first attempt failed (e.g., file not yet mounted), allow retries
  // every 30 seconds instead of permanently giving up. This handles the case
  // where the SQLite file is copied/mounted AFTER the container starts.
  if (dbLoadAttempted && Date.now() - dbLastAttempt < 30000) return null;
  dbLoadAttempted = true;
  dbLastAttempt = Date.now();

  try {
    const fs = require("fs");
    let dbPath: string | null = null;
    for (const p of POSSIBLE_PATHS) {
      try {
        if (fs.existsSync(p) && fs.statSync(p).size > 1000) {
          dbPath = p;
          break;
        }
      } catch {}
    }
    if (!dbPath) {
      dbLoadError = "SQLite DB not found at any expected path";
      console.warn(`[anime-db-sqlite] ${dbLoadError}. Tried: ${POSSIBLE_PATHS.join(", ")}`);
      return null;
    }

    // Use Node.js 22 built-in node:sqlite module (no npm package needed)
    // Requires --experimental-sqlite flag at startup (see nixpacks.toml)
    // Use eval('require') to bypass Turbopack/Next.js bundler which can't
    // resolve 'node:sqlite' (it's a built-in Node module, not an npm package)
    const { DatabaseSync } = eval("require")("node:sqlite");
    db = new DatabaseSync(dbPath, { readOnly: true });
    console.log(`[anime-db-sqlite] Opened ${dbPath} (${(fs.statSync(dbPath).size / 1024 / 1024).toFixed(1)} MB)`);
    return db;
  } catch (e) {
    dbLoadError = e instanceof Error ? e.message : String(e);
    console.warn(`[anime-db-sqlite] Failed to open: ${dbLoadError}`);
    return null;
  }
}

/**
 * Get anime by AniList ID. Returns the raw_json as AniList GraphQL response
 * format: { Media: { id, title, coverImage, ... } }
 *
 * Returns null if:
 *   - SQLite DB not available (file missing)
 *   - Anime not found in DB
 */
export function getAnimeByAnilistId(anilistId: number): any | null {
  const database = getDb();
  if (!database) return null;

  try {
    const row = database.prepare(
      "SELECT raw_json FROM anime WHERE anilist_id = ?"
    ).get(anilistId) as { raw_json: string } | undefined;

    if (!row?.raw_json) return null;

    const parsed = JSON.parse(row.raw_json);
    // raw_json is either { Media: {...} } or { id, title, ... } (bare Media object)
    const media = parsed.Media || parsed;
    if (!media || !media.id) return null;

    // Return in AniList GraphQL response format so cachedQuery() treats it
    // identically to a live AniList response
    return { Media: media };
  } catch {
    return null;
  }
}

/**
 * Search anime by title using FTS5 (full-text search).
 * Returns up to `limit` results (default 20).
 *
 * Matches against romaji, english, and native titles simultaneously.
 * FTS5 returns results in <1ms even for 20K rows.
 */
export function searchAnime(query: string, limit: number = 20): Array<{
  anilistId: number;
  malId: number | null;
  titleRomaji: string | null;
  titleEnglish: string | null;
  titleNative: string | null;
  poster: string | null;
  episodes: number | null;
  format: string | null;
  status: string | null;
  genres: string | null;
  averageScore: number | null;
  seasonYear: number | null;
}> {
  const database = getDb();
  if (!database) return [];

  try {
    // Escape FTS5 special chars by wrapping in double quotes
    const escaped = query.replace(/["']/g, "").trim();
    if (!escaped) return [];

    // FTS5 MATCH query — searches all three title columns
    const ftsQuery = `"${escaped}"*`; // prefix match
    const rows = database.prepare(`
      SELECT
        a.anilist_id,
        a.mal_id,
        a.title_romaji,
        a.title_english,
        a.title_native,
        a.poster,
        a.episodes,
        a.format,
        a.status,
        a.genres,
        a.raw_json
      FROM anime_search s
      JOIN anime a ON a.anilist_id = s.rowid
      WHERE s.anime_search MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(ftsQuery, limit) as any[];

    return rows.map((r) => {
      let avgScore: number | null = null;
      let seasonYear: number | null = null;
      try {
        const parsed = JSON.parse(r.raw_json);
        const media = parsed.Media || parsed;
        avgScore = media.averageScore || null;
        seasonYear = media.seasonYear || null;
      } catch {}

      return {
        anilistId: r.anilist_id,
        malId: r.mal_id,
        titleRomaji: r.title_romaji,
        titleEnglish: r.title_english,
        titleNative: r.title_native,
        poster: r.poster,
        episodes: r.episodes,
        format: r.format,
        status: r.status,
        genres: r.genres,
        averageScore: avgScore,
        seasonYear: seasonYear,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Check if the SQLite DB is available (file exists + can open).
 */
export function isSqliteAvailable(): boolean {
  return getDb() !== null;
}

/**
 * Get total anime count in the DB.
 */
export function getAnimeCount(): number {
  const database = getDb();
  if (!database) return 0;
  try {
    const row = database.prepare("SELECT COUNT(*) as count FROM anime").get() as { count: number };
    return row.count;
  } catch {
    return 0;
  }
}

/**
 * Pre-warm the in-memory cache. Call this on app startup so the first
 * request doesn't have to parse 20K records (takes ~200ms on first call).
 * After pre-warming, all subsequent trending/popular/search calls are instant.
 */
export function prewarmCache(): void {
  if (_allMediaCache) return; // already warmed
  const count = getAnimeCount();
  if (count === 0) return;
  console.log(`[anime-db-sqlite] Pre-warming cache with ${count} anime...`);
  getAllMedia(); // populates _allMediaCache
  // Pre-sort common queries so first request is instant
  getTrendingFromSqlite(25);
  getPopularFromSqlite(25);
  getTopRatedFromSqlite(25);
  getRecentFromSqlite(25);
  getUpcomingFromSqlite(25);
  console.log(`[anime-db-sqlite] Cache pre-warmed successfully`);
}

/**
 * Get trending anime from the SQLite DB.
 *
 * Our DB doesn't have a `trending` or `popularity` field, so we synthesize a
 * "trending score" that combines:
 *   - averageScore (how good it is)
 *   - seasonYear recency (newer anime get a small boost — recent hits rank higher)
 *   - RELEASING status (currently-airing anime are more "trending")
 *
 * This is a proxy for AniList's TRENDING_DESC sort. When AniList comes back,
 * live trending data will be used instead.
 */
export function getTrendingFromSqlite(limit: number = 25): any[] {
  return getTrendingScored(limit);
}

/**
 * Get popular anime from the SQLite DB (sorted by averageScore DESC,
 * with a small recency tiebreaker so newer anime rank above equally-rated
 * older ones).
 */
export function getPopularFromSqlite(limit: number = 25): any[] {
  return getSortedFromSqlite("popularity", limit);
}

/**
 * Get top-rated anime from the SQLite DB (sorted by averageScore DESC).
 * Pure quality ranking — no recency boost.
 */
export function getTopRatedFromSqlite(limit: number = 25): any[] {
  return getSortedFromSqlite("averageScore", limit);
}

/**
 * Get upcoming / not-yet-released anime from the SQLite DB.
 * Returns anime with status=NOT_YET_RELEASED, sorted by startDate ASC
 * (soonest upcoming first).
 */
export function getUpcomingFromSqlite(limit: number = 25): any[] {
  const cacheKey = `upcoming:${limit}`;
  if (_sortedCache[cacheKey]) return _sortedCache[cacheKey];

  const mediaList = getAllMedia();
  if (mediaList.length === 0) return [];

  const upcoming = mediaList
    .filter((m) => m.status === "NOT_YET_RELEASED")
    .sort((a, b) => {
      // Sort by startDate year+month (soonest first)
      const aDate = a.startDate ? (a.startDate.year || 9999) * 100 + (a.startDate.month || 99) : 999999;
      const bDate = b.startDate ? (b.startDate.year || 9999) * 100 + (b.startDate.month || 99) : 999999;
      return aDate - bDate;
    })
    .slice(0, limit);

  _sortedCache[cacheKey] = upcoming;
  return upcoming;
}

/**
 * Get recently-added anime from the SQLite DB (sorted by anilist_id DESC).
 * Higher AniList IDs = newer anime (AniList assigns IDs sequentially).
 * This is a proxy for "Recently Added" — newer shows appear first.
 */
export function getRecentFromSqlite(limit: number = 25): any[] {
  return getSortedFromSqlite("__recent__", limit);
}

/**
 * Get anime by season from the SQLite DB.
 * Filtered by season + seasonYear, sorted by averageScore DESC.
 */
export function getBySeasonFromSqlite(season: string, year: number, limit: number = 25): any[] {
  const cacheKey = `season:${season}:${year}:${limit}`;
  if (_sortedCache[cacheKey]) return _sortedCache[cacheKey];

  const mediaList = getAllMedia();
  if (mediaList.length === 0) return [];

  const filtered = mediaList
    .filter((m) => m.season === season.toUpperCase() && m.seasonYear === year)
    .sort((a, b) => (b.averageScore || 0) - (a.averageScore || 0))
    .slice(0, limit);

  _sortedCache[cacheKey] = filtered;
  return filtered;
}

/**
 * Browse the SQLite DB with filters. Used as fallback for /api/anime/browse
 * when AniList is down.
 *
 * Filters:
 *   - genre: string (case-sensitive match against genres[])
 *   - year: number (seasonYear match)
 *   - format: string (TV, MOVIE, OVA, ONA, SPECIAL, MUSIC)
 *   - status: string (FINISHED, RELEASING, NOT_YET_RELEASED, CANCELLED)
 *   - search: string (FTS5 match against titles)
 *   - sort: "most-popular" | "high-rated" | "trending" | "new"
 *   - page, perPage: pagination
 *
 * Returns { results, pageInfo, total }.
 */
export function browseFromSqlite(filters: {
  genre?: string;
  year?: number;
  format?: string;
  status?: string;
  search?: string;
  sort?: string;
  page?: number;
  perPage?: number;
}): { results: any[]; pageInfo: any; total: number } {
  const page = Math.max(1, filters.page || 1);
  const perPage = Math.min(50, filters.perPage || 30);

  let mediaList: any[] = [];

  // Search filter — use FTS5 for fast title search
  if (filters.search && filters.search.trim().length >= 2) {
    const escaped = filters.search.replace(/["']/g, "").trim();
    const ftsQuery = `"${escaped}"*`;
    try {
      const database = getDb();
      if (!database) return { results: [], pageInfo: {}, total: 0 };
      const rows = database.prepare(`
        SELECT a.raw_json
        FROM anime_search s
        JOIN anime a ON a.anilist_id = s.rowid
        WHERE s.anime_search MATCH ?
        ORDER BY rank
        LIMIT 500
      `).all(ftsQuery) as { raw_json: string }[];
      for (const r of rows) {
        try {
          const parsed = JSON.parse(r.raw_json);
          const m = parsed.Media || parsed;
          if (m && m.id) mediaList.push(m);
        } catch {}
      }
    } catch {
      return { results: [], pageInfo: {}, total: 0 };
    }
  } else {
    mediaList = [...getAllMedia()];
  }

  // Apply filters
  if (filters.genre) {
    const g = filters.genre;
    mediaList = mediaList.filter((m) =>
      Array.isArray(m.genres) && m.genres.some((x: string) => x === g)
    );
  }
  if (filters.year) {
    mediaList = mediaList.filter((m) => m.seasonYear === filters.year);
  }
  if (filters.format) {
    mediaList = mediaList.filter((m) => m.format === filters.format);
  }
  if (filters.status) {
    mediaList = mediaList.filter((m) => m.status === filters.status);
  }

  // Sort
  const sort = filters.sort || "most-popular";
  if (sort === "high-rated") {
    mediaList.sort((a, b) => (b.averageScore || 0) - (a.averageScore || 0));
  } else if (sort === "new") {
    // Sort by anilist_id DESC (newest IDs first)
    mediaList.sort((a, b) => b.id - a.id);
  } else if (sort === "trending") {
    mediaList.sort((a, b) => computeTrendingScore(b) - computeTrendingScore(a));
  } else {
    // "most-popular" — synthesize popularity from score + recency
    mediaList.sort((a, b) => computePopularityScore(b) - computePopularityScore(a));
  }

  const total = mediaList.length;
  const offset = (page - 1) * perPage;
  const results = mediaList.slice(offset, offset + perPage);

  return {
    results,
    pageInfo: {
      total,
      currentPage: page,
      lastPage: Math.ceil(total / perPage),
      hasNextPage: offset + perPage < total,
      perPage,
    },
    total,
  };
}

// ── Trending score formula ──
// Combines averageScore with a recency boost (newer anime trend higher)
// and a status boost (RELEASING > FINISHED > NOT_YET_RELEASED).
function computeTrendingScore(m: any): number {
  const score = m.averageScore || 0;
  const year = m.seasonYear || 0;
  const currentYear = new Date().getFullYear();
  // Recency boost: +20 if released this year, +10 if last year, +5 if 2 years ago
  let recencyBoost = 0;
  if (year >= currentYear) recencyBoost = 20;
  else if (year >= currentYear - 1) recencyBoost = 10;
  else if (year >= currentYear - 2) recencyBoost = 5;
  // Status boost: RELEASING anime are "trending"
  let statusBoost = 0;
  if (m.status === "RELEASING") statusBoost = 15;
  else if (m.status === "NOT_YET_RELEASED") statusBoost = 8;
  return score + recencyBoost + statusBoost;
}

function computePopularityScore(m: any): number {
  const score = m.averageScore || 0;
  const year = m.seasonYear || 0;
  const currentYear = new Date().getFullYear();
  // Small recency tiebreaker for popular (less aggressive than trending)
  let recencyBoost = 0;
  if (year >= currentYear) recencyBoost = 5;
  else if (year >= currentYear - 1) recencyBoost = 3;
  return score + recencyBoost;
}

function getTrendingScored(limit: number): any[] {
  const cacheKey = `trending:${limit}`;
  if (_sortedCache[cacheKey]) return _sortedCache[cacheKey];

  const mediaList = getAllMedia();
  if (mediaList.length === 0) return [];

  const sorted = [...mediaList]
    .map((m) => ({ m, score: computeTrendingScore(m) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.m);

  _sortedCache[cacheKey] = sorted;
  return sorted;
}

/**
 * Internal: read all anime, sort by a given field, return top N.
 * Since SQLite's raw_json is JSON (not queryable), we parse in JS and sort.
 * The DB has ~20K records — parsing + sorting takes ~50ms.
 * Results are cached in memory after first call (subsequent calls = 0ms).
 */

// ── In-memory cache for sorted lists (survives across requests in the same process) ──
let _allMediaCache: any[] | null = null;
let _sortedCache: Record<string, any[]> = {};

function getAllMedia(): any[] {
  if (_allMediaCache) return _allMediaCache;
  
  const database = getDb();
  if (!database) return [];

  try {
    const rows = database.prepare(
      "SELECT raw_json FROM anime"
    ).all() as { raw_json: string }[];

    const mediaList: any[] = [];
    for (const r of rows) {
      try {
        const parsed = JSON.parse(r.raw_json);
        const media = parsed.Media || parsed;
        if (media && media.id) {
          mediaList.push(media);
        }
      } catch {}
    }
    _allMediaCache = mediaList;
    console.log(`[anime-db-sqlite] Loaded ${mediaList.length} anime into memory cache`);
    return mediaList;
  } catch {
    return [];
  }
}

function getSortedFromSqlite(sortField: string, limit: number): any[] {
  // Check cache first
  const cacheKey = `${sortField}:${limit}`;
  if (_sortedCache[cacheKey]) return _sortedCache[cacheKey];

  const mediaList = getAllMedia();
  if (mediaList.length === 0) return [];

  let sorted: any[];
  if (sortField === "__recent__") {
    // Sort by anilist_id DESC (higher IDs = newer anime)
    sorted = [...mediaList].sort((a, b) => b.id - a.id);
  } else if (sortField === "popularity") {
    // Synthesize popularity from averageScore + small recency tiebreaker
    sorted = [...mediaList].sort((a, b) => computePopularityScore(b) - computePopularityScore(a));
  } else {
    // Sort by the requested field (descending)
    sorted = [...mediaList].sort((a, b) => {
      const av = (a as any)[sortField] || 0;
      const bv = (b as any)[sortField] || 0;
      return bv - av;
    });
  }

  const result = sorted.slice(0, limit);
  _sortedCache[cacheKey] = result;
  return result;
}

/**
 * Get a batch of anime for pre-warming the PostgreSQL cache.
 * Returns up to `limit` anime starting from `offset`, sorted by popularity
 * (averageScore DESC).
 */
export function getAnimeBatch(offset: number = 0, limit: number = 50): any[] {
  const database = getDb();
  if (!database) return [];

  try {
    const rows = database.prepare(`
      SELECT raw_json FROM anime
      ORDER BY anilist_id
      LIMIT ? OFFSET ?
    `).all(limit, offset) as { raw_json: string }[];

    const results: any[] = [];
    for (const r of rows) {
      try {
        const parsed = JSON.parse(r.raw_json);
        const media = parsed.Media || parsed;
        if (media?.id) results.push({ Media: media });
      } catch {}
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * Get airing schedule from SQLite DB — anime with status=RELEASING
 * that have nextAiringEpisode in the raw_json.
 * Used as fallback when AniList is down.
 */
export function getAiringScheduleFromSqlite(limit: number = 50): any[] {
  const mediaList = getAllMedia();
  if (mediaList.length === 0) return [];

  // Filter to RELEASING anime that have nextAiringEpisode
  const airing = mediaList
    .filter((m) => m.status === "RELEASING" || m.status === "Releasing")
    .filter((m) => m.nextAiringEpisode?.airingAt)
    .sort((a, b) => (a.nextAiringEpisode?.airingAt || 0) - (b.nextAiringEpisode?.airingAt || 0))
    .slice(0, limit);

  // Format to match the schedule page expected shape
  return airing.map((m) => ({
    _id: ` airing_${m.id}`,
    name: m.title?.romaji || m.title?.english || "Unknown",
    englishName: m.title?.english || m.title?.romaji || "Unknown",
    thumbnail: m.coverImage?.large || m.coverImage?.medium || "",
    score: m.averageScore ? (m.averageScore / 10).toFixed(2) : null,
    type: m.format || "TV",
    status: m.status,
    genres: m.genres || [],
    id: m.id,
    nextAiringEpisode: m.nextAiringEpisode,
    title: m.title,
    coverImage: m.coverImage,
    bannerImage: m.bannerImage,
    episodes: m.episodes,
    season: m.season,
    seasonYear: m.seasonYear,
    description: m.description,
  }));
}
