// Zenshin API Client — resolves AniList IDs to TMDB/IMDb IDs
// No API key needed. Source: https://api.zenchiapi.com

const ZENSHIN_BASE = "https://api.zenchiapi.com";

interface ZenshinMappings {
  themoviedb_id?: number;
  imdb_id?: string;
  thetvdb_id?: number;
  anidb_id?: number;
  ka_id?: number;
  season?: {
    tmdb?: number;
    anidb?: number;
    ka?: number;
  };
}

interface ZenshinResponse {
  anilist_id: number;
  mainTitle?: string;
  mappings?: ZenshinMappings;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<T | null>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))
  ]).catch(() => null);
}

/**
 * Get mappings for an anime by its AniList ID
 * Returns TMDB ID, IMDb ID, TVDB ID, and season number
 */
export async function zenshinByAnilistId(anilistId: number): Promise<ZenshinResponse | null> {
  try {
    const res = await withTimeout(
      fetch(`${ZENSHIN_BASE}/anime/${anilistId}`, {
        next: { revalidate: 1800 },
      }),
      8000
    );
    if (!res || !res.ok) return null;
    const data = await res.json();
    return data;
  } catch {
    return null;
  }
}

/**
 * Batch fetch mappings for multiple AniList IDs
 */
export async function zenshinBatch(anilistIds: number[]): Promise<Map<number, ZenshinResponse>> {
  const results = new Map<number, ZenshinResponse>();
  await Promise.allSettled(
    anilistIds.map(async (id) => {
      const data = await zenshinByAnilistId(id);
      if (data) results.set(id, data);
    })
  );
  return results;
}
