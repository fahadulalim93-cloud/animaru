// src/lib/tmdb.ts
// TMDB API — for movie/TV metadata, episode info, backdrops

const TMDB_API = 'https://api.themoviedb.org/3';
const TMDB_KEY = 'dc7bf1ed4ae4ecbebaeb05f632a795c'; // public v3 key
const IMG_BASE = 'https://image.tmdb.org/t/p';

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

export function tmdbImage(path: string | null, size: 'w200' | 'w500' | 'original' = 'w500'): string {
  if (!path) return '';
  return `${IMG_BASE}/${size}${path}`;
}

export async function tmdbFetch<T = any>(path: string, params: Record<string, string> = {}): Promise<T | null> {
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

export async function getTrendingTV(): Promise<TMDBResult[]> {
  const data = await tmdbFetch<{ results: TMDBResult[] }>('/trending/tv/week');
  return data?.results ?? [];
}

export async function getTrendingMovie(): Promise<TMDBResult[]> {
  const data = await tmdbFetch<{ results: TMDBResult[] }>('/trending/movie/week');
  return data?.results ?? [];
}

export async function searchMulti(query: string): Promise<TMDBResult[]> {
  const data = await tmdbFetch<{ results: TMDBResult[] }>('/search/multi', { query });
  return data?.results ?? [];
}
