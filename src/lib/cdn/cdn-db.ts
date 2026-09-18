/**
 * LuffyTV CDN — SQLite DB layer
 *
 * Reads from /data/luffytv-cdn-data/anime-db-v2.sqlite
 * Builds responses from denormalized columns (NOT raw_json which was
 * swapped during AniCore list scrape).
 */

let db: any = null;
let dbLoadAttempted = false;
let dbLoadError: string | null = null;

const DB_PATH = "/data/luffytv-cdn-data/anime-db-v2.sqlite";

function getDb(): any | null {
  if (db) return db;
  if (dbLoadAttempted) return null;
  dbLoadAttempted = true;
  try {
    const fs = require("fs");
    if (!fs.existsSync(DB_PATH) || fs.statSync(DB_PATH).size < 1000) {
      dbLoadError = `DB not found at ${DB_PATH}`;
      console.warn(`[cdn-db] ${dbLoadError}`);
      return null;
    }
    const { DatabaseSync } = eval("require")("node:sqlite");
    db = new DatabaseSync(DB_PATH, { readOnly: true });
    console.log(`[cdn-db] Opened ${DB_PATH} (${(fs.statSync(DB_PATH).size / 1024 / 1024).toFixed(1)} MB)`);
    return db;
  } catch (e) {
    dbLoadError = e instanceof Error ? e.message : String(e);
    console.warn(`[cdn-db] Failed to open: ${dbLoadError}`);
    return null;
  }
}

export interface CdnStats {
  titles: number;
  images: number;
  stored: number;
  warming: number;
  mapped: number;
  adult: number;
  lastSyncAt: number | null;
  loadedAt: number;
}

export function getStats(): CdnStats {
  const database = getDb();
  const loadedAt = Date.now();
  if (!database) {
    return { titles: 0, images: 0, stored: 0, warming: 0, mapped: 0, adult: 0, lastSyncAt: null, loadedAt };
  }
  try {
    const titles = (database.prepare("SELECT COUNT(*) as c FROM anime").get() as { c: number }).c;
    let adult = 0;
    try { adult = (database.prepare("SELECT COUNT(*) as c FROM anime WHERE is_adult = 1").get() as { c: number }).c; } catch {}
    let images = 0;
    try {
      const fs = require("fs");
      const coverDir = "/data/luffytv-cdn-data/images/cover";
      const bannerDir = "/data/luffytv-cdn-data/images/banner";
      if (fs.existsSync(coverDir)) images += fs.readdirSync(coverDir).filter((f: string) => f.endsWith(".jpg") || f.endsWith(".png")).length;
      if (fs.existsSync(bannerDir)) images += fs.readdirSync(bannerDir).filter((f: string) => f.endsWith(".jpg") || f.endsWith(".png")).length;
    } catch {}
    let lastSyncAt: number | null = null;
    try {
      const row = database.prepare("SELECT value FROM meta WHERE key = 'lastSyncAt'").get() as { value: string } | undefined;
      if (row?.value) lastSyncAt = parseInt(row.value, 10);
    } catch {}
    return { titles, images, stored: images, warming: 0, mapped: titles, adult, lastSyncAt, loadedAt };
  } catch {
    return { titles: 0, images: 0, stored: 0, warming: 0, mapped: 0, adult: 0, lastSyncAt: null, loadedAt };
  }
}

/**
 * Convert a DB row to a response object using denormalized columns.
 * This is the key fix — we build the response from columns, not raw_json.
 */
function rowToAnime(row: any): any {
  if (!row) return null;
  let genres: any[] = [];
  try { genres = JSON.parse(row.genres || "[]"); } catch {}
  let studios: any[] = [];
  try { studios = JSON.parse(row.studios || "[]"); } catch {}
  let themes: any[] = [];
  try { themes = JSON.parse(row.themes || "[]"); } catch {}
  let demographics: any[] = [];
  try { demographics = JSON.parse(row.demographics || "[]"); } catch {}
  let externalIds: any = {};
  try { externalIds = JSON.parse(row.cross_ids || "{}"); } catch {}

  return {
    anilist_id: row.anilist_id,
    mal_id: row.mal_id,
    anime_id: row.anime_id,
    title: {
      romaji: row.title_romaji,
      english: row.title_english,
      native: row.title_native,
      user_preferred: row.title_preferred || row.title_english || row.title_romaji,
    },
    cover_image: {
      extra_large: row.poster,
      large: row.poster,
      medium: row.poster,
    },
    banner_image: row.banner,
    description: row.synopsis || row.description || null,
    synopsis: row.synopsis || null,
    episodes_total: row.episodes_total,
    duration: row.duration,
    format: row.format,
    status: row.status,
    season: row.season,
    season_year: row.season_year,
    start_date: row.start_date,
    end_date: row.end_date,
    genres: genres,
    themes: themes,
    demographics: demographics,
    studios: studios,
    average_score: row.average_score,
    popularity: row.popularity,
    trending_score: row.trending_score,
    is_adult: row.is_adult === 1,
    data_quality: row.data_quality,
    trailer: {
      url: row.trailer_url,
      youtube_id: row.trailer_youtube_id,
      thumbnail: row.trailer_thumbnail,
    },
    external_ids: {
      mal: row.mal_id,
      anilist: row.anilist_id,
      kitsu: row.kitsu_id,
      tvdb: row.tvdb_id,
      tmdb: row.tmdb_id,
      imdb: row.imdb_id,
    },
    background: row.background,
    content_rating: row.content_rating,
  };
}

// SQL columns to SELECT for all queries
const SELECT_COLS = "anilist_id, mal_id, anime_id, title_romaji, title_english, title_native, title_preferred, poster, banner, description, episodes_total, duration, format, status, season, season_year, start_date, end_date, genres, average_score, popularity, trending_score, is_adult, country_of_origin, dubbed, next_airing_episode, next_airing_at, external_links, characters, artworks, cross_ids, raw_json, kitsu_id, tvdb_id, tmdb_id, imdb_id, data_quality, synopsis, background, trailer_url, trailer_youtube_id, trailer_thumbnail, themes, demographics, explicit_genres, studios, statistics, titles_synonyms, content_rating, sources";

export function getAnimeById(anilistId: number): any | null {
  const database = getDb();
  if (!database) return null;
  try {
    const row = database.prepare(`SELECT ${SELECT_COLS} FROM anime WHERE anilist_id = ?`).get(anilistId);
    return rowToAnime(row);
  } catch { return null; }
}

export function getAnimeList(sort: string, limit: number = 20, offset: number = 0): any[] {
  const database = getDb();
  if (!database) return [];
  try {
    let orderBy = "popularity DESC";
    if (sort === "top" || sort === "score") orderBy = "average_score DESC";
    else if (sort === "newest") orderBy = "anilist_id DESC";
    else if (sort === "trending") orderBy = "trending_score DESC";
    const rows = database.prepare(`SELECT ${SELECT_COLS} FROM anime WHERE is_adult = 0 ORDER BY ${orderBy} LIMIT ? OFFSET ?`).all(limit, offset);
    return rows.map(rowToAnime).filter(Boolean);
  } catch { return []; }
}

export function searchAnime(query: string, limit: number = 20, offset: number = 0): { results: any[]; total: number } {
  const database = getDb();
  if (!database) return { results: [], total: 0 };
  try {
    const escaped = query.replace(/[%_]/g, "").trim();
    if (!escaped) return { results: [], total: 0 };
    const likePattern = `%${escaped}%`;
    const rows = database.prepare(`
      SELECT ${SELECT_COLS} FROM anime
      WHERE title_romaji LIKE ? COLLATE NOCASE
         OR title_english LIKE ? COLLATE NOCASE
         OR title_native LIKE ? COLLATE NOCASE
      ORDER BY popularity DESC
      LIMIT ? OFFSET ?
    `).all(likePattern, likePattern, likePattern, limit, offset);
    let total = 0;
    try {
      total = (database.prepare(`
        SELECT COUNT(*) as c FROM anime
        WHERE title_romaji LIKE ? COLLATE NOCASE
           OR title_english LIKE ? COLLATE NOCASE
           OR title_native LIKE ? COLLATE NOCASE
      `).get(likePattern, likePattern, likePattern) as { c: number }).c;
    } catch {}
    const results = rows.map(rowToAnime).filter(Boolean);
    return { results, total };
  } catch { return { results: [], total: 0 }; }
}

export function browseAnime(filters: { genre?: string; year?: number; format?: string; status?: string; season?: string; sort?: string; page?: number; perPage?: number; }): { results: any[]; total: number } {
  const database = getDb();
  if (!database) return { results: [], total: 0 };
  try {
    const page = Math.max(1, filters.page || 1);
    const perPage = Math.min(50, filters.perPage || 30);
    const offset = (page - 1) * perPage;
    const where: string[] = ["is_adult = 0"];
    const args: any[] = [];
    if (filters.genre) { where.push("genres LIKE ?"); args.push(`%"${filters.genre}"%`); }
    if (filters.year) { where.push("season_year = ?"); args.push(filters.year); }
    if (filters.format) { where.push("format = ?"); args.push(filters.format); }
    if (filters.status) { where.push("status = ?"); args.push(filters.status.toUpperCase()); }
    if (filters.season) { where.push("season = ?"); args.push(filters.season.toUpperCase()); }
    let orderBy = "popularity DESC";
    const sort = filters.sort || "popular";
    if (sort === "top" || sort === "score") orderBy = "average_score DESC";
    else if (sort === "newest") orderBy = "anilist_id DESC";
    else if (sort === "trending") orderBy = "trending_score DESC";
    const rows = database.prepare(`SELECT ${SELECT_COLS} FROM anime WHERE ${where.join(" AND ")} ORDER BY ${orderBy} LIMIT ? OFFSET ?`).all(...args, perPage, offset);
    let total = 0;
    try { total = (database.prepare(`SELECT COUNT(*) as c FROM anime WHERE ${where.join(" AND ")}`).get(...args) as { c: number }).c; } catch {}
    const results = rows.map(rowToAnime).filter(Boolean);
    return { results, total };
  } catch { return { results: [], total: 0 }; }
}

export function getCurrentSeason(limit: number = 20): any[] {
  const database = getDb();
  if (!database) return [];
  try {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    let season = "WINTER";
    if (month >= 2 && month <= 4) season = "SPRING";
    else if (month >= 5 && month <= 7) season = "SUMMER";
    else if (month >= 8 && month <= 10) season = "FALL";
    const rows = database.prepare(`SELECT ${SELECT_COLS} FROM anime WHERE season = ? AND season_year = ? AND is_adult = 0 ORDER BY popularity DESC LIMIT ?`).all(season, year, limit);
    return rows.map(rowToAnime).filter(Boolean);
  } catch { return []; }
}

export function getSchedule(fromTs: number, toTs: number): any[] {
  const database = getDb();
  if (!database) return [];
  try {
    const rows = database.prepare(`
      SELECT ${SELECT_COLS} FROM anime
      WHERE status = 'RELEASING' AND next_airing_at IS NOT NULL AND next_airing_at >= ? AND next_airing_at <= ?
      ORDER BY next_airing_at ASC LIMIT 100
    `).all(fromTs, toTs);
    return rows.map(rowToAnime).filter(Boolean);
  } catch { return []; }
}
