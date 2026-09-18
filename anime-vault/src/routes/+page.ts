import { getTrending, getRecent, getPopular } from '$lib/anilist';
import { getBackdrops } from '$lib/tmdb';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const [trending, recent, popular] = await Promise.all([
    getTrending(6),
    getRecent(20),
    getPopular(20),
  ]);

  // Fetch TMDB backdrop images for trending anime (higher quality than AniList banners)
  const bannerTitles = trending.map(a => ({
    id: a.id,
    title: a.title.english || a.title.romaji || '',
  }));
  const banners = await getBackdrops(bannerTitles);

  return { trending, recent, popular, banners };
};
