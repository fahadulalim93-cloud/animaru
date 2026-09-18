import { getTrending, getRecent, getPopular } from '$lib/anilist';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const [trending, recent, popular] = await Promise.all([
    getTrending(5),
    getRecent(20),
    getPopular(20),
  ]);
  return { trending, recent, popular };
};
