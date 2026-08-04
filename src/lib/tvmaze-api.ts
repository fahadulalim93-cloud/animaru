// TVMaze API Client — Free, no API key needed
// Great for episode thumbnails/screencaps

const TVMAZE_BASE = "https://api.tvmaze.com";

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))
  ]).catch(() => fallback);
}

export interface TVMazeEpisode {
  id: number;
  name: string;
  season: number;
  number: number;
  image?: { medium?: string; original?: string } | null;
  summary?: string | null;
  runtime?: number | null;
  airdate?: string | null;
}

export interface TVMazeShow {
  id: number;
  name: string;
  image?: { medium?: string; original?: string } | null;
  externals?: { thetvdb?: number; imdb?: string };
}

/**
 * Search TVMaze for a TV show by name
 */
export async function tvmazeSearchShow(query: string): Promise<TVMazeShow | null> {
  try {
    const res = await withTimeout(
      fetch(`${TVMAZE_BASE}/search/shows?q=${encodeURIComponent(query)}`, {
        next: { revalidate: 3600 },
      }),
      5000,
      null
    );
    if (!res || !res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    // Try exact name match first
    const exact = data.find(
      (r: any) => r.show?.name?.toLowerCase() === query.toLowerCase()
    );
    return (exact?.show || data[0]?.show || null) as TVMazeShow;
  } catch {
    return null;
  }
}

/**
 * Fetch all episodes for a TVMaze show, including images.
 * Returns a Map<absoluteEpisodeNumber, {image, title, summary}>
 */
export async function tvmazeFetchEpisodeImages(
  showId: number,
  maxSeasons: number = 8
): Promise<Map<number, { image: string; title: string; summary: string }>> {
  const episodeMap = new Map<number, { image: string; title: string; summary: string }>();

  try {
    // Fetch all episodes in one call (includes specials)
    const res = await withTimeout(
      fetch(`${TVMAZE_BASE}/shows/${showId}/episodes`, {
        next: { revalidate: 3600 },
      }),
      8000,
      null
    );
    if (!res || !res.ok) return episodeMap;

    const episodes: TVMazeEpisode[] = await res.json();
    if (!Array.isArray(episodes)) return episodeMap;

    // Calculate absolute episode numbers (skip season 0 / specials)
    let absoluteEp = 0;
    let currentSeason = 0;
    const seasonOffsets: Record<number, number> = {};

    for (const ep of episodes) {
      if (ep.season === 0) continue; // skip specials
      if (ep.season > maxSeasons) break;

      absoluteEp++;
      const imageUrl = ep.image?.original || ep.image?.medium || "";

      if (imageUrl) {
        episodeMap.set(absoluteEp, {
          image: imageUrl,
          title: ep.name || "",
          summary: ep.summary?.replace(/<[^>]*>/g, "") || "",
        });
      }
    }
  } catch {
    // TVMaze fetch failed
  }

  return episodeMap;
}

/**
 * Combined: search by anime name and fetch episode images in one call.
 */
export async function tvmazeGetEpisodeStills(
  animeTitle: string
): Promise<{ showId: number; episodes: Map<number, { image: string; title: string; summary: string }> }> {
  const empty = { showId: 0, episodes: new Map<number, { image: string; title: string; summary: string }>() };

  const show = await tvmazeSearchShow(animeTitle);
  if (!show) return empty;

  const episodes = await tvmazeFetchEpisodeImages(show.id);
  return { showId: show.id, episodes };
}
