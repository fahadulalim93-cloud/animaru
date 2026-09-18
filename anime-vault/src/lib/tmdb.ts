// src/lib/tmdb.ts
// TMDB API — PRIMARY source for all images (banners, posters, logos)
// TMDB_API_KEY set in .env

const TMDB_API = 'https://api.themoviedb.org/3';
const TMDB_KEY = process.env?.TMDB_API_KEY || 'dc7bf1ed4ae4ecbebaeb05f632a795c';
const IMG_BASE = 'https://image.tmdb.org/t/p';

// Image URL builders
export function tmdbBackdrop(path: string | null, size: 'w780' | 'w1280' | 'original' = 'original'): string {
  if (!path) return '';
  return `${IMG_BASE}/${size}${path}`;
}

export function tmdbPoster(path: string | null, size: 'w200' | 'w342' | 'w500' | 'original' = 'w500'): string {
  if (!path) return '';
  return `${IMG_BASE}/${size}${path}`;
}

export function tmdbLogo(path: string | null, size: 'w92' | 'w154' | 'w185' | 'original' = 'w185'): string {
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

export interface TMDBShow {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  vote_average: number;
  genre_ids: number[];
  origin_country: string[];
  original_language: string;
}

export interface AnimeWithTMDB {
  // From AniList (info)
  anilistId: number;
  title: string;
  description: string;
  status: string;
  season: string | null;
  seasonYear: number | null;
  episodes: number | null;
  genres: string[];
  averageScore: number | null;
  // From TMDB (images)
  backdrop: string;      // TMDB backdrop (original) — for hero banner
  poster: string;         // TMDB poster (w500) — for cards
  tmdbId: number | null;
}

// Search TMDB for a TV show by name → get backdrop + poster paths
async function searchTMDB(title: string): Promise<{ backdrop_path: string | null; poster_path: string | null; id: number | null }> {
  const data = await tmdbFetch<{ results: TMDBShow[] }>('/search/tv', { query: title });
  const match = data?.results?.[0];
  if (match) {
    return {
      backdrop_path: match.backdrop_path,
      poster_path: match.poster_path,
      id: match.id,
    };
  }
  return { backdrop_path: null, poster_path: null, id: null };
}

// Merge AniList data with TMDB images
export async function enrichWithTMDB<T extends { id: number; title: { english: string | null; romaji: string }; bannerImage: string | null; coverImage: { extraLarge: string; large: string } }>(
  anime: T[]
): Promise<AnimeWithTMDB[]> {
  const enriched = await Promise.all(
    anime.map(async (a) => {
      const title = a.title.english || a.title.romaji;
      const tmdb = await searchTMDB(title);

      return {
        anilistId: a.id,
        title,
        description: '',
        status: '',
        season: null,
        seasonYear: null,
        episodes: null,
        genres: [],
        averageScore: null,
        // TMDB images (PRIMARY) — fallback to AniList if TMDB doesn't have it
        backdrop: tmdb.backdrop_path ? tmdbBackdrop(tmdb.backdrop_path, 'original') : (a.bannerImage || ''),
        poster: tmdb.poster_path ? tmdbPoster(tmdb.poster_path, 'w500') : (a.coverImage.extraLarge || ''),
        tmdbId: tmdb.id,
      } as AnimeWithTMDB;
    })
  );
  return enriched;
}
