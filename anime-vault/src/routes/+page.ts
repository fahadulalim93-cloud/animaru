import { getTrending, getRecent, getPopular, type AnimeMedia } from '$lib/anilist';
import { enrichWithTMDB, type AnimeWithTMDB } from '$lib/tmdb';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  // 1. Fetch anime INFO from AniList (title, description, status, episodes, genres, score)
  const [trendingRaw, recentRaw, popularRaw] = await Promise.all([
    getTrending(6),
    getRecent(20),
    getPopular(20),
  ]);

  // 2. Enrich with TMDB images (backdrop for banner, poster for cards)
  // TMDB is the PRIMARY image source — AniList images are only fallback
  const [trending, recent, popular] = await Promise.all([
    enrichWithTMDB(trendingRaw),
    enrichWithTMDB(recentRaw),
    enrichWithTMDB(popularRaw),
  ]);

  return { trending, recent, popular };
};
