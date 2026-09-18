// src/lib/tmdb.ts
// TMDB API — for banner images, backdrops, logos
// Uses hardcoded key as fallback (set TMDB_API_KEY in .env for production)

const TMDB_API = 'https://api.themoviedb.org/3';
const TMDB_KEY = process.env?.TMDB_API_KEY || 'dc7bf1ed4ae4ecbebaeb05f632a795c';
const IMG_BASE = 'https://image.tmdb.org/t/p';

export function tmdbImage(path: string | null, size: 'w200' | 'w500' | 'w780' | 'w1280' | 'original' = 'w500'): string {
  if (!path) return '';
  return `${IMG_BASE}/${size}${path}`;
}

async function tmdbFetch<T = any>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  const url = new URL(`${TMDB_API}${path}`);
  url.searchParams.set('api_key', TMDB_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  try {
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

export interface TMDBResult {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
  genre_ids: number[];
  media_type: string;
}

// Get backdrop image URL for an anime title from TMDB
export async function getBackdropUrl(title: string): Promise<string | null> {
  const data = await tmdbFetch<{ results: TMDBResult[] }>('/search/tv', { query: title });
  const match = data?.results?.[0];
  if (match?.backdrop_path) {
    return tmdbImage(match.backdrop_path, 'original');
  }
  return null;
}

// Batch fetch backdrops for multiple anime
export async function getBackdrops(titles: { id: number; title: string }[]): Promise<Record<number, string>> {
  const banners: Record<number, string> = {};
  await Promise.all(
    titles.map(async ({ id, title }) => {
      const url = await getBackdropUrl(title);
      if (url) banners[id] = url;
    })
  );
  return banners;
}
