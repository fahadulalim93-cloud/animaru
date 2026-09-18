// api.ani.zip — Free public anime mappings API
// Provides episode titles, air dates, thumbnails, and cross-service mappings
// (AniList ↔ TVDB ↔ AniDB). No API key needed.
//
// Used as a FAST fallback when AniList is rate-limited (429) or slow.
// Typical response: <500ms. Never rate-limits.

const ANIZIP_API = "https://api.ani.zip/mappings";

export interface AniZipEpisode {
  tvdbShowId?: number;
  tvdbId?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  absoluteEpisodeNumber?: number;
  title?: {
    en?: string;
    ja?: string;
    xJat?: string;
    [lang: string]: string | undefined;
  };
  airDate?: string;
  airDateUtc?: string;
  runtime?: number;
  overview?: string;
  image?: string;
  episode?: string;
  anidbEid?: number;
  length?: number;
  airdate?: string;
}

export interface AniZipMappings {
  titles?: {
    en?: string;
    ja?: string;
    xJat?: string;
    [lang: string]: string | undefined;
  };
  episodes?: Record<string, AniZipEpisode>;
  tvdbSeriesId?: number;
  anidbAid?: number;
  mappings?: {
    tvdb?: number;
    anidb?: number;
    anilist?: number;
  };
}

/**
 * Fetch anime mappings from api.ani.zip by AniList ID.
 * Returns null on any error (timeout, network, etc.).
 */
export async function anizipInfo(anilistId: number): Promise<AniZipMappings | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000); // 6s timeout

  try {
    const res = await fetch(`${ANIZIP_API}?anilist_id=${anilistId}`, {
      signal: controller.signal,
      next: { revalidate: 3600 }, // Cache for 1h (same as AniList)
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = await res.json();
    if (!data || (!data.titles && !data.episodes)) return null;
    return data as AniZipMappings;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Convert ani.zip mappings to an AniList-compatible info object.
 * Used as a FAST fallback when AniList fails entirely.
 */
export function anizipToAniListFormat(
  anilistId: number,
  data: AniZipMappings
): {
  id: number;
  title: { romaji?: string; english?: string; native?: string };
  coverImage: { extraLarge?: string; large?: string; medium?: string };
  episodes?: number;
  status?: string;
  _source: string;
} {
  return {
    id: anilistId,
    title: {
      english: data.titles?.en,
      romaji: data.titles?.xJat,
      native: data.titles?.ja,
    },
    coverImage: {}, // ani.zip doesn't provide images
    episodes: data.episodes ? Object.keys(data.episodes).length : undefined,
    status: undefined,
    _source: "anizip",
  };
}
