// TVDB API Client — fetches episode screencaps from TheTVDB.com
// These are the artworks.thetvdb.com images that other anime sites use
// for episode thumbnails.
// URL format: https://artworks.thetvdb.com/banners/v4/episode/{id}/screencap/{hash}.jpg

const TVDB_API_KEY = process.env.TVDB_API_KEY || "";
const TVDB_BASE = "https://api4.thetvdb.com/v4";

let tvdbToken: string | null = null;
let tokenExpiry = 0;

interface TVDBEpisode {
  id: number;
  name?: string;
  overview?: string;
  aired?: string;
  seasonNumber?: number;
  number?: number;
  image?: string;
}

export function isTvdbConfigured(): boolean {
  return !!TVDB_API_KEY;
}

/** Authenticate with TVDB v4 API — returns JWT token */
async function tvdbLogin(): Promise<string | null> {
  if (!TVDB_API_KEY) return null;
  if (tvdbToken && Date.now() < tokenExpiry) return tvdbToken;

  try {
    const res = await fetch(`${TVDB_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apikey: TVDB_API_KEY }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    tvdbToken = data?.data?.token;
    tokenExpiry = Date.now() + 23 * 60 * 60 * 1000;
    return tvdbToken;
  } catch {
    return null;
  }
}

/** Search for a series on TVDB by name */
export async function tvdbSearchSeries(query: string): Promise<number | null> {
  if (!TVDB_API_KEY) return null;
  const token = await tvdbLogin();
  if (!token) return null;

  try {
    const res = await fetch(
      `${TVDB_BASE}/search?query=${encodeURIComponent(query)}&type=series&limit=1`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.[0]?.tvdb_id || data?.data?.[0]?.id || null;
  } catch {
    return null;
  }
}

/**
 * Fetch all episodes with images for a TVDB series.
 * Returns Map<absoluteEpisodeNumber, { image, title, overview }>
 */
export async function tvdbFetchEpisodeImages(
  tvdbSeriesId: number
): Promise<Map<number, { image: string; title: string; overview: string }>> {
  const episodeMap = new Map<number, { image: string; title: string; overview: string }>();
  if (!TVDB_API_KEY) return episodeMap;

  const token = await tvdbLogin();
  if (!token) return episodeMap;

  try {
    let page = 0;
    let hasMore = true;
    const allEpisodes: TVDBEpisode[] = [];

    while (hasMore && page < 5) {
      const res = await fetch(
        `${TVDB_BASE}/series/${tvdbSeriesId}/episodes/default?page=${page}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) break;
      const data = await res.json();
      const eps = data?.data?.episodes || data?.data || [];
      if (eps.length === 0) { hasMore = false; break; }
      allEpisodes.push(...eps);
      hasMore = data?.links?.next != null;
      page++;
    }

    // Sort by season + episode number, skip specials (season 0)
    const sorted = allEpisodes
      .filter(ep => (ep.seasonNumber || 0) > 0)
      .sort((a, b) => {
        const sa = a.seasonNumber || 1, sb = b.seasonNumber || 1;
        const ea = a.number || 1, eb = b.number || 1;
        return sa === sb ? ea - eb : sa - sb;
      });

    let absoluteNum = 0;
    for (const ep of sorted) {
      absoluteNum++;
      if (ep.image) {
        const imageUrl = ep.image.startsWith("http")
          ? ep.image
          : `https://artworks.thetvdb.com/banners/${ep.image}`;
        episodeMap.set(absoluteNum, {
          image: imageUrl,
          title: ep.name || "",
          overview: ep.overview || "",
        });
      }
    }

    return episodeMap;
  } catch {
    return episodeMap;
  }
}

/**
 * Full pipeline: search by anime title → fetch episode images.
 * Returns Map<absoluteEpisodeNumber, { image, title, overview }>.
 */
export async function tvdbGetEpisodeStills(
  animeTitle: string
): Promise<Map<number, { image: string; title: string; overview: string }>> {
  if (!TVDB_API_KEY) return new Map();

  const seriesId = await tvdbSearchSeries(animeTitle);
  if (!seriesId) return new Map();

  return tvdbFetchEpisodeImages(seriesId);
}
