// IMDb API Client — imdbapi.dev
// Provides IMDb ID (tt...) lookup for embed servers that accept it (Peachify)

const IMDB_API_BASE = "https://imdbapi.dev/api";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<T | null>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))
  ]).catch(() => null);
}

export interface IMDbSearchResult {
  id: string; title: string; year?: number; type?: string; poster?: string; rating?: number;
}

/** Search IMDb for titles matching a query */
export async function imdbSearch(query: string): Promise<IMDbSearchResult[]> {
  if (!query || query.trim().length < 2) return [];
  try {
    const res = await withTimeout(
      fetch(`${IMDB_API_BASE}/search?query=${encodeURIComponent(query)}`, {
        headers: { Accept: "application/json" },
        next: { revalidate: 1800 },
      }), 8000
    );
    if (!res || !res.ok) return [];
    const data = await res.json();
    return (data.results || data || []).map((item: any) => ({
      id: item.id || item.imdb_id || "",
      title: item.title || item.primaryTitle || "",
      year: item.year || item.startYear || undefined,
      type: item.type || item.titleType || undefined,
      poster: item.poster || item.image || undefined,
      rating: item.rating || item.averageRating || undefined,
    })).filter((r: IMDbSearchResult) => r.id && r.id.startsWith("tt"));
  } catch { return []; }
}

/** Find IMDb ID for an anime by searching with title variants */
export async function imdbFindAnimeId(
  titles: { english?: string; romaji?: string; native?: string }
): Promise<string | null> {
  const queries: string[] = [];
  if (titles.english) queries.push(titles.english);
  if (titles.romaji && titles.romaji !== titles.english) queries.push(titles.romaji);
  if (titles.native) queries.push(titles.native);

  for (const query of queries) {
    try {
      const results = await imdbSearch(query);
      if (results.length === 0) continue;
      const tvMatch = results.find(r => r.type === "TVSeries" || r.type === "tvSeries" || r.type === "series");
      const exactMatch = results.find(r => r.title.toLowerCase() === query.toLowerCase());
      const best = exactMatch || tvMatch || results[0];
      return best.id;
    } catch { continue; }
  }
  return null;
}
