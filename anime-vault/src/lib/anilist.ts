// src/lib/anilist.ts
// AniList GraphQL API — for anime banners, cover images, metadata

const ANILIST_API = 'https://graphql.anilist.co';

const MEDIA_FIELDS = `
  id
  idMal
  title { romaji english native userPreferred }
  coverImage { extraLarge large medium color }
  bannerImage
  description(asHtml: false)
  type
  format
  status
  season
  seasonYear
  episodes
  duration
  genres
  averageScore
  popularity
  trending
  nextAiringEpisode { episode airingAt }
`;

export interface AnimeMedia {
  id: number;
  idMal: number | null;
  title: { romaji: string; english: string | null; native: string; userPreferred: string };
  coverImage: { extraLarge: string; large: string; medium: string; color: string };
  bannerImage: string | null;
  description: string | null;
  type: string;
  format: string;
  status: string;
  season: string | null;
  seasonYear: number | null;
  episodes: number | null;
  duration: number | null;
  genres: string[];
  averageScore: number | null;
  popularity: number | null;
  trending: number | null;
  nextAiringEpisode: { episode: number; airingAt: number } | null;
}

async function anilistQuery<T = any>(query: string, variables: Record<string, unknown> = {}): Promise<T | null> {
  try {
    const res = await fetch(ANILIST_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data as T;
  } catch {
    return null;
  }
}

export async function getTrending(limit = 5): Promise<AnimeMedia[]> {
  const data = await anilistQuery<{ Page: { media: AnimeMedia[] } }>(
    `query { Page(page: 1, perPage: ${limit}) { media(sort: TRENDING_DESC, type: ANIME, isAdult: false) { ${MEDIA_FIELDS} } } }`
  );
  return data?.Page?.media ?? [];
}

export async function getRecent(limit = 20): Promise<AnimeMedia[]> {
  const data = await anilistQuery<{ Page: { media: AnimeMedia[] } }>(
    `query { Page(page: 1, perPage: ${limit}) { media(sort: START_DATE_DESC, type: ANIME, isAdult: false) { ${MEDIA_FIELDS} } } }`
  );
  return data?.Page?.media ?? [];
}

export async function getPopular(limit = 20): Promise<AnimeMedia[]> {
  const data = await anilistQuery<{ Page: { media: AnimeMedia[] } }>(
    `query { Page(page: 1, perPage: ${limit}) { media(sort: POPULARITY_DESC, type: ANIME, isAdult: false) { ${MEDIA_FIELDS} } } }`
  );
  return data?.Page?.media ?? [];
}

export async function searchAnime(keyword: string, limit = 36): Promise<AnimeMedia[]> {
  const data = await anilistQuery<{ Page: { media: AnimeMedia[] } }>(
    `query ($search: String) { Page(page: 1, perPage: ${limit}) { media(search: $search, sort: SEARCHMATCH, type: ANIME, isAdult: false) { ${MEDIA_FIELDS} } } }`,
    { search: keyword }
  );
  return data?.Page?.media ?? [];
}
