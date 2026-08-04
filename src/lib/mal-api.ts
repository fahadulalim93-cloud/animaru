// Official MAL API v2 Client — MyAnimeList REST API
// Uses X-MAL-CLIENT-ID header — no OAuth needed for public read endpoints
// No rate limit issues like the old Jikan API (which caused 429 errors)
// API docs: https://myanimelist.net/apiconfig/references/api/v2

// ============================================================
// MAL API Types
// ============================================================

export interface MALAnimeNode {
  id: number;
  title: string;
  main_picture?: {
    medium?: string;
    large?: string;
  };
  alternative_titles?: {
    synonyms?: string[];
    en?: string;
    ja?: string;
  };
  start_date?: string;
  end_date?: string;
  synopsis?: string;
  mean?: number;
  rank?: number;
  popularity?: number;
  num_list_users?: number;
  num_scoring_users?: number;
  nsfw?: string;
  genres?: Array<{ id: number; name: string }>;
  created_at?: string;
  updated_at?: string;
  media_type?: string;
  status?: string;
  num_episodes?: number;
  start_season?: {
    year?: number;
    season?: string;
  };
  broadcast?: {
    day_of_the_week?: string;
    start_time?: string;
  };
  source?: string;
  average_episode_duration?: number;
  rating?: string;
  studios?: Array<{ id: number; name: string }>;
  pictures?: Array<{ medium?: string; large?: string }>;
  background?: string;
  related_anime?: Array<{
    node: { id: number; title: string; main_picture?: { medium?: string; large?: string } };
    relation_type: string;
  }>;
  recommendations?: Array<{
    node: { id: number; title: string; main_picture?: { medium?: string; large?: string } };
    num_recommendations: number;
  }>;
  opening_themes?: Array<string>;
  ending_themes?: Array<string>;
}

export interface MALAnimeDetail extends MALAnimeNode {
  // Extended fields from /anime/{id}?fields=...
}

export interface MALCharacterNode {
  id: number;
  first_name?: string;
  last_name?: string;
  main_picture?: { medium?: string; large?: string };
  alternative_names?: string[];
}

export interface MALPersonNode {
  id: number;
  first_name?: string;
  last_name?: string;
  main_picture?: { medium?: string; large?: string };
  alternative_names?: string[];
}

export interface MALAnimeCharacter {
  role: string;
  character: MALCharacterNode;
  voice_actors?: Array<{
    role: string;
    person: MALPersonNode;
    language: string;
  }>;
}

// ============================================================
// MiruroAnimeResult (re-exported for compatibility)
// ============================================================

export interface MiruroAnimeResult {
  id: number;
  title: { romaji?: string; english?: string; native?: string };
  type?: string;
  format?: string;
  status?: string;
  description?: string;
  season?: string;
  seasonYear?: number;
  episodes?: number;
  duration?: number;
  coverImage?: { extraLarge?: string; large?: string; medium?: string; color?: string };
  bannerImage?: string;
  genres?: string[];
  averageScore?: number;
  popularity?: number;
  trending?: number;
  countryOfOrigin?: string;
  isAdult?: boolean;
}

export interface MiruroSearchResult {
  currentPage: number;
  hasNextPage: boolean;
  results: MiruroAnimeResult[];
}

// ============================================================
// Official MAL API Configuration
// ============================================================

// MAL API v2 — Public client ID for read-only access
// This is the official API — no 429 rate limit issues
const MAL_CLIENT_ID = "6114d00ca681b7701d1e15fe11a4987e";
const MAL_BASE = "https://api.myanimelist.net/v2";

// Simple in-memory cache with TTL
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T, ttlMs: number): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

// Default cache TTLs (in milliseconds) — generous since MAL is reliable
const CACHE_TTL = {
  SEARCH: 3 * 60 * 1000,     // 3 minutes
  TOP: 10 * 60 * 1000,       // 10 minutes
  SEASON: 10 * 60 * 1000,    // 10 minutes
  DETAIL: 30 * 60 * 1000,    // 30 minutes
  CHARACTERS: 30 * 60 * 1000, // 30 minutes
  RANKING: 10 * 60 * 1000,   // 10 minutes
} as const;

// ============================================================
// HTTP Client with Official MAL API headers
// ============================================================

async function malFetch<T>(
  endpoint: string,
  cacheTtl: number,
  useCache = true
): Promise<T | null> {
  const cacheKey = `${MAL_BASE}${endpoint}`;

  // Check cache first
  if (useCache) {
    const cached = getCached<T>(cacheKey);
    if (cached !== null) return cached;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(`${MAL_BASE}${endpoint}`, {
      headers: {
        "X-MAL-CLIENT-ID": MAL_CLIENT_ID,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    // MAL API rarely returns 429 (unlike third-party APIs)
    // But if it does, just wait a bit and retry once
    if (res.status === 429) {
      console.warn("[MAL] Rate limited (429) — rare, waiting 2s before retry...");
      await new Promise((r) => setTimeout(r, 2000));
      const retryRes = await fetch(`${MAL_BASE}${endpoint}`, {
        headers: {
          "X-MAL-CLIENT-ID": MAL_CLIENT_ID,
          Accept: "application/json",
        },
      });
      if (!retryRes.ok) {
        console.error(`[MAL] Retry failed: ${retryRes.status}`);
        return null;
      }
      const data = await retryRes.json();
      setCache(cacheKey, data, cacheTtl);
      return data as T;
    }

    if (!res.ok) {
      // Silent fail — MAL is backup only, AniList is primary
      // Don't log scary errors that confuse users — just skip to next fallback
      console.warn(`[MAL] Backup API skipped (${res.status}) — using AniList/Miruro instead`);
      return null;
    }

    const data = await res.json();
    setCache(cacheKey, data, cacheTtl);
    return data as T;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      console.error(`[MAL] Request timed out for ${endpoint}`);
    } else {
      console.error(`[MAL] Request error for ${endpoint}:`, err);
    }
    return null;
  }
}

// ============================================================
// Status Mapping: MAL → AniList/Miruro format
// ============================================================

const STATUS_MAP: Record<string, string> = {
  "currently_airing": "RELEASING",
  "finished_airing": "FINISHED",
  "not_yet_aired": "NOT_YET_RELEASED",
  "on_hiatus": "PAUSED",
};

const FORMAT_MAP: Record<string, string> = {
  "tv": "TV",
  "ova": "OVA",
  "ona": "ONA",
  "movie": "MOVIE",
  "special": "SPECIAL",
  "music": "MUSIC",
  "unknown": undefined as any,
};

const SEASON_MAP: Record<string, string> = {
  "winter": "WINTER",
  "spring": "SPRING",
  "summer": "SUMMER",
  "fall": "FALL",
};

// ============================================================
// Converter: MAL → MiruroAnimeResult
// ============================================================

/**
 * Convert a MAL anime node to MiruroAnimeResult format.
 * This allows MAL data to be used as a drop-in replacement
 * when AniList/Miruro are unavailable.
 *
 * IMPORTANT: The `id` field will be the MAL ID, not AniList ID.
 * Code using this should be aware that id === mal_id when sourced from MAL.
 */
export function malToMiruro(node: MALAnimeNode): MiruroAnimeResult {
  const mainPic = node.main_picture || {};
  const altTitles = node.alternative_titles || {};

  const coverImage: MiruroAnimeResult["coverImage"] = {
    extraLarge: mainPic.large || undefined,
    large: mainPic.medium || undefined,
    medium: mainPic.medium || undefined,
    color: undefined,
  };

  const bannerImage = mainPic.large || mainPic.medium || undefined;

  // Build genres
  const genres: string[] = (node.genres || []).map((g) => g.name);

  // Convert mean score from MAL 10-point to AniList 100-point scale
  const averageScore = node.mean != null ? Math.round(node.mean * 10) : undefined;

  // Map status
  const status = node.status ? STATUS_MAP[node.status] || node.status : undefined;

  // Determine if adult content
  const isAdult = node.nsfw === "white" ? false : (node.nsfw === "gray" || node.nsfw === "black");

  // Map media_type to format
  const format = node.media_type ? (FORMAT_MAP[node.media_type] || node.media_type.toUpperCase()) : undefined;

  // Parse duration from seconds to minutes
  const duration = node.average_episode_duration
    ? Math.round(node.average_episode_duration / 60)
    : undefined;

  // Capitalize season
  const season = node.start_season?.season
    ? SEASON_MAP[node.start_season.season] || node.start_season.season.toUpperCase()
    : undefined;

  return {
    id: node.id,
    title: {
      romaji: altTitles.ja || node.title || undefined,
      english: altTitles.en || node.title || undefined,
      native: altTitles.ja || undefined,
    },
    type: node.media_type?.toUpperCase() || undefined,
    format,
    status,
    description: node.synopsis || undefined,
    season,
    seasonYear: node.start_season?.year || undefined,
    episodes: node.num_episodes || undefined,
    duration,
    coverImage,
    bannerImage,
    genres: genres.length > 0 ? genres : undefined,
    averageScore,
    popularity: node.popularity ?? undefined,
    trending: node.rank ?? undefined,
    countryOfOrigin: "JP",
    isAdult,
  };
}

// ============================================================
// API Functions
// ============================================================

/**
 * Search for anime by query string.
 * Uses the official MAL /anime endpoint with q parameter.
 */
export async function malSearch(
  query: string,
  page = 1,
  limit = 25
): Promise<MiruroSearchResult> {
  try {
    const params = new URLSearchParams({
      q: query,
      page: String(page),
      limit: String(Math.min(limit, 100)), // MAL allows up to 100 per page
      // Minimal fields to avoid 400 errors — MAL API is picky about valid fields per endpoint
      fields: "alternative_titles,start_season,media_type,num_episodes,mean,rank,popularity,nsfw,genres,status",
    });

    const response = await malFetch<{ data: Array<{ node: MALAnimeNode }>; paging?: { next?: string } }>(
      `/anime?${params.toString()}`,
      CACHE_TTL.SEARCH
    );

    if (!response?.data) {
      return { currentPage: page, hasNextPage: false, results: [] };
    }

    const hasNextPage = !!response.paging?.next;
    const results = response.data
      .map((item) => malToMiruro(item.node))
      .filter((r) => !r.isAdult);

    return {
      currentPage: page,
      hasNextPage,
      results,
    };
  } catch (err) {
    console.error("[MAL] Search error:", err);
    return { currentPage: page, hasNextPage: false, results: [] };
  }
}

/**
 * Get top anime ranking.
 * ranking_type: "all" | "airing" | "upcoming" | "tv" | "ova" | "movie" | "bypopularity" | "favorite"
 */
export async function malTopAnime(
  page = 1,
  limit = 25,
  rankingType?: string
): Promise<MiruroAnimeResult[]> {
  try {
    const params = new URLSearchParams({
      ranking_type: rankingType || "all",
      page: String(page),
      limit: String(Math.min(limit, 100)),
      // Only use fields that are valid for the ranking endpoint
      fields: "alternative_titles,start_season,media_type,num_episodes,mean,rank,popularity,nsfw,genres,status",
    });

    const response = await malFetch<{ data: Array<{ node: MALAnimeNode }> }>(
      `/anime/ranking?${params.toString()}`,
      CACHE_TTL.RANKING
    );

    if (!response?.data) return [];
    return response.data
      .map((item) => malToMiruro(item.node))
      .filter((r) => !r.isAdult);
  } catch (err) {
    console.error("[MAL] Top anime error:", err);
    return [];
  }
}

/**
 * Get currently airing anime for this season.
 */
export async function malSeasonNow(
  page = 1,
  limit = 25
): Promise<MiruroAnimeResult[]> {
  try {
    const now = new Date();
    const month = now.getMonth();
    let season: string;
    let year = now.getFullYear();

    if (month >= 0 && month <= 2) season = "winter";
    else if (month >= 3 && month <= 5) season = "spring";
    else if (month >= 6 && month <= 8) season = "summer";
    else season = "fall";

    const params = new URLSearchParams({
      season,
      year: String(year),
      page: String(page),
      limit: String(Math.min(limit, 100)),
      fields: "alternative_titles,start_season,media_type,num_episodes,mean,rank,popularity,nsfw,genres,status",
    });

    const response = await malFetch<{ data: Array<{ node: MALAnimeNode }> }>(
      `/anime/season/${year}/${season}?${params.toString()}`,
      CACHE_TTL.SEASON
    );

    if (!response?.data) return [];
    return response.data
      .map((item) => malToMiruro(item.node))
      .filter((r) => !r.isAdult);
  } catch (err) {
    console.error("[MAL] Season now error:", err);
    return [];
  }
}

/**
 * Get upcoming anime for next season.
 */
export async function malSeasonUpcoming(
  page = 1,
  limit = 25
): Promise<MiruroAnimeResult[]> {
  try {
    const now = new Date();
    const month = now.getMonth();
    let season: string;
    let year = now.getFullYear();

    // Next season
    if (month >= 0 && month <= 2) season = "spring";
    else if (month >= 3 && month <= 5) season = "summer";
    else if (month >= 6 && month <= 8) season = "fall";
    else { season = "winter"; year += 1; }

    const params = new URLSearchParams({
      season,
      year: String(year),
      page: String(page),
      limit: String(Math.min(limit, 100)),
      fields: "alternative_titles,start_season,media_type,num_episodes,mean,rank,popularity,nsfw,genres,status",
    });

    const response = await malFetch<{ data: Array<{ node: MALAnimeNode }> }>(
      `/anime/season/${year}/${season}?${params.toString()}`,
      CACHE_TTL.SEASON
    );

    if (!response?.data) return [];
    return response.data
      .map((item) => malToMiruro(item.node))
      .filter((r) => !r.isAdult);
  } catch (err) {
    console.error("[MAL] Season upcoming error:", err);
    return [];
  }
}

/**
 * Get anime by specific season and year.
 */
export async function malSeason(
  year: number,
  season: string,
  page = 1,
  limit = 25
): Promise<MiruroAnimeResult[]> {
  try {
    const seasonPath = season.toLowerCase();
    const params = new URLSearchParams({
      page: String(page),
      limit: String(Math.min(limit, 100)),
      fields: "alternative_titles,start_season,media_type,num_episodes,mean,rank,popularity,nsfw,genres,status",
    });

    const response = await malFetch<{ data: Array<{ node: MALAnimeNode }> }>(
      `/anime/season/${year}/${seasonPath}?${params.toString()}`,
      CACHE_TTL.SEASON
    );

    if (!response?.data) return [];
    return response.data
      .map((item) => malToMiruro(item.node))
      .filter((r) => !r.isAdult);
  } catch (err) {
    console.error("[MAL] Season error:", err);
    return [];
  }
}

/**
 * Get full anime details by MAL ID.
 * Returns the raw MAL anime node for maximum detail.
 */
export async function malAnimeById(
  malId: number
): Promise<MALAnimeDetail | null> {
  try {
    const params = new URLSearchParams({
      fields: "alternative_titles,start_season,broadcast,source,average_episode_duration,rating,studios,pictures,background,related_anime,recommendations,synopsis,genres,media_type,status,num_episodes,mean,rank,popularity,nsfw",
    });

    const response = await malFetch<{ data: MALAnimeDetail }>(
      `/anime/${malId}?${params.toString()}`,
      CACHE_TTL.DETAIL
    );

    return (response as any)?.data || response as any || null;
  } catch (err) {
    console.error("[MAL] Anime by ID error:", err);
    return null;
  }
}

/**
 * Get anime details converted to MiruroAnimeResult format by MAL ID.
 */
export async function malAnimeByIdAsMiruro(
  malId: number
): Promise<MiruroAnimeResult | null> {
  try {
    const detail = await malAnimeById(malId);
    if (!detail) return null;
    return malToMiruro(detail);
  } catch (err) {
    console.error("[MAL] Anime by ID (Miruro) error:", err);
    return null;
  }
}

/**
 * Get anime characters and voice actors by MAL ID.
 */
export async function malAnimeCharacters(
  malId: number
): Promise<MALAnimeCharacter[]> {
  try {
    const response = await malFetch<{ data: MALAnimeCharacter[] }>(
      `/anime/${malId}/characters`,
      CACHE_TTL.CHARACTERS
    );

    return (response as any)?.data || response || [];
  } catch (err) {
    console.error("[MAL] Characters error:", err);
    return [];
  }
}

/**
 * Get related anime for an anime by MAL ID.
 */
export async function malAnimeRelations(
  malId: number
): Promise<Array<{ relation_type: string; node: { id: number; title: string; main_picture?: { medium?: string; large?: string } } }>> {
  try {
    const detail = await malAnimeById(malId);
    if (!detail?.related_anime) return [];
    return detail.related_anime;
  } catch (err) {
    console.error("[MAL] Relations error:", err);
    return [];
  }
}

/**
 * Get recommendations for an anime by MAL ID.
 */
export async function malAnimeRecommendations(
  malId: number
): Promise<Array<{ node: { id: number; title: string; main_picture?: { medium?: string; large?: string } }; num_recommendations: number }>> {
  try {
    const detail = await malAnimeById(malId);
    if (!detail?.recommendations) return [];
    return detail.recommendations;
  } catch (err) {
    console.error("[MAL] Recommendations error:", err);
    return [];
  }
}

// ============================================================
// Utility Functions (AniList format compatibility)
// ============================================================

/**
 * Convert MALAnimeCharacter data to a simplified format
 * compatible with AniList character structure.
 */
export function malCharacterToAniListFormat(char: MALAnimeCharacter) {
  const charNode = char.character;
  const charFullName = [charNode.first_name, charNode.last_name].filter(Boolean).join(" ");

  return {
    id: charNode.id,
    name: {
      full: charFullName || "",
      native: charNode.alternative_names?.[0] || undefined,
    },
    image: {
      large: charNode.main_picture?.large || undefined,
      medium: charNode.main_picture?.medium || undefined,
    },
    role: char.role?.toUpperCase() || "SUPPORTING",
    voiceActors: (char.voice_actors || []).map((va) => ({
      id: va.person.id,
      name: {
        full: [va.person.first_name, va.person.last_name].filter(Boolean).join(" ") || "",
      },
      image: {
        large: va.person.main_picture?.large || undefined,
      },
      language: va.language || "Japanese",
    })),
  };
}

/**
 * Convert MAL relation data to a simplified format
 * compatible with AniList relation structure.
 */
export function malRelationToAniListFormat(rel: { relation_type: string; node: { id: number; title: string; main_picture?: { medium?: string; large?: string } } }) {
  return {
    relationType: rel.relation_type?.toUpperCase().replace(/\s+/g, "_") || "OTHER",
    id: rel.node.id,
    title: {
      romaji: rel.node.title,
      english: rel.node.title,
    },
    coverImage: rel.node.main_picture ? {
      extraLarge: rel.node.main_picture.large || undefined,
      large: rel.node.main_picture.medium || undefined,
    } : undefined,
    type: "ANIME",
    format: "TV",
  };
}

/**
 * Convert MAL recommendation data to a simplified format
 * compatible with AniList recommendation structure.
 */
export function malRecommendationToAniListFormat(rec: { node: { id: number; title: string; main_picture?: { medium?: string; large?: string } }; num_recommendations: number }) {
  return {
    id: rec.node.id,
    rating: rec.num_recommendations || 0,
    mediaRecommendation: {
      id: rec.node.id,
      title: {
        romaji: rec.node.title,
        english: rec.node.title,
      },
      coverImage: rec.node.main_picture ? {
        extraLarge: rec.node.main_picture.large || undefined,
        large: rec.node.main_picture.medium || undefined,
        medium: rec.node.main_picture.medium || undefined,
      } : undefined,
    },
  };
}

/**
 * Clear the MAL response cache.
 */
export function malClearCache(): void {
  cache.clear();
}

/**
 * Get the current cache size.
 */
export function malCacheSize(): number {
  return cache.size;
}
