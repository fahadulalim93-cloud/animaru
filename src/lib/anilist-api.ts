// AniList GraphQL API Client
// Provides anime metadata, episodes info, recommendations, characters
// No API key needed — public GraphQL endpoint

const ANILIST_API = "https://graphql.anilist.co";

const HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json",
};

/**
 * AniList GraphQL query with retry logic + rate limit handling.
 * AniList returns 429 (rate limited) or 500 (error 1101) when too many
 * requests come from the same IP (Vercel's shared IPs get rate-limited often).
 *
 * Strategy:
 *   1. Try the request
 *   2. If 429 or 500: wait 1s, retry (up to 3 times)
 *   3. If still failing: return null (caller handles fallback)
 */
async function anilistQuery(query: string, variables?: Record<string, unknown>) {
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 1000;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(ANILIST_API, {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({ query, variables }),
        next: { revalidate: 3600 },
      });

      // Rate limited or server error — retry after delay
      if (res.status === 429 || res.status >= 500) {
        if (attempt < MAX_RETRIES - 1) {
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
          continue;
        }
        return null;
      }

      if (!res.ok) return null;

      const json = await res.json();
      if (json.errors) {
        // GraphQL errors are usually not transient — don't retry
        return null;
      }
      return json.data;
    } catch (err) {
      // Network error — retry
      if (attempt < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
        continue;
      }
      return null;
    }
  }
  return null;
}

// ============================================================
// Types
// ============================================================

export interface AniListTitle {
  romaji?: string;
  english?: string;
  native?: string;
}

export interface AniListCoverImage {
  extraLarge?: string;
  large?: string;
  medium?: string;
  color?: string;
}

export interface AniListStreamingEpisode {
  title: string;
  thumbnail: string;
  url: string;
  site: string;
}

export interface AniListNextAiring {
  episode: number;
  airingAt: number;
}

export interface AniListStudio {
  id: number;
  name: string;
  isAnimationStudio: boolean;
}

export interface AniListCharacter {
  id: number;
  name: { full: string; native?: string };
  image?: { large?: string; medium?: string };
  role: string;
}

export interface AniListStaff {
  id: number;
  name: { full: string; native?: string };
  image?: { large?: string; medium?: string };
  role: string;
}

export interface AniListRecommendation {
  id: number;
  rating: number;
  mediaRecommendation?: {
    id: number;
    title: AniListTitle;
    coverImage: AniListCoverImage;
    type?: string;
    episodes?: number;
    averageScore?: number;
    status?: string;
  };
}

export interface AniListMedia {
  id: number;
  idMal?: number;
  title: AniListTitle;
  coverImage: AniListCoverImage;
  bannerImage?: string;
  description?: string;
  type?: string;
  format?: string;
  status?: string;
  episodes?: number;
  duration?: number;
  chapters?: number;
  volumes?: number;
  genres?: string[];
  averageScore?: number;
  meanScore?: number;
  popularity?: number;
  trending?: number;
  favourites?: number;
  season?: string;
  seasonYear?: number;
  countryOfOrigin?: string;
  isAdult?: boolean;
  source?: string;
  hashtags?: string[];
  siteUrl?: string;
  nextAiringEpisode?: AniListNextAiring;
  streamingEpisodes?: AniListStreamingEpisode[];
  studios?: { nodes: AniListStudio[] };
  characters?: { edges: Array<{ node: AniListCharacter; role: string }> };
  staff?: { edges: Array<{ node: AniListStaff; role: string }> };
  recommendations?: { nodes: AniListRecommendation[] };
  relations?: {
    edges: Array<{
      relationType: string;
      node: {
        id: number;
        title: AniListTitle;
        coverImage: AniListCoverImage;
        type?: string;
        format?: string;
        episodes?: number;
        status?: string;
      };
    }>;
  };
  externalLinks?: Array<{
    id: number;
    url: string;
    site: string;
    type: string;
    icon?: string;
    color?: string;
    language?: string;
  }>;
  trailer?: {
    id: string;
    site: string;
    thumbnail: string;
  };
}

export interface AniListSearchResult {
  pageInfo: {
    total: number;
    currentPage: number;
    lastPage: number;
    hasNextPage: boolean;
    perPage: number;
  };
  media: AniListMedia[];
}

// ============================================================
// API Functions
// ============================================================

/** Get full anime details by AniList ID */
export async function getAnimeDetails(anilistId: number): Promise<AniListMedia | null> {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        id
        idMal
        title { romaji english native }
        coverImage { extraLarge large medium color }
        bannerImage
        description(asHtml: false)
        type format status
        episodes duration
        genres
        averageScore meanScore popularity trending favourites
        season seasonYear
        countryOfOrigin isAdult source
        siteUrl
        nextAiringEpisode { episode airingAt }
        streamingEpisodes { title thumbnail url site }
        studios { nodes { id name isAnimationStudio } }
        characters(sort: ROLE, perPage: 12) {
          edges { node { id name { full native } image { large medium } } role }
        }
        recommendations(sort: RATING_DESC, perPage: 8) {
          nodes {
            id rating
            mediaRecommendation {
              id title { romaji english native }
              coverImage { extraLarge large medium }
              type episodes averageScore status
            }
          }
        }
        relations {
          edges {
            relationType
            node {
              id title { romaji english native }
              coverImage { extraLarge large medium }
              type format episodes status
            }
          }
        }
        externalLinks { id url site type icon color language }
        trailer { id site thumbnail }
      }
    }
  `;
  try {
    const data = await anilistQuery(query, { id: anilistId });
    return data?.Media || null;
  } catch {
    return null;
  }
}

/** Get streaming episodes info from AniList */
export async function getStreamingEpisodes(anilistId: number): Promise<AniListStreamingEpisode[]> {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        streamingEpisodes { title thumbnail url site }
      }
    }
  `;
  try {
    const data = await anilistQuery(query, { id: anilistId });
    return data?.Media?.streamingEpisodes || [];
  } catch {
    return [];
  }
}

/** Get basic anime info + episode count for building episode lists */
export async function getAnimeBasicInfo(anilistId: number): Promise<{
  id: number;
  title: AniListTitle;
  coverImage: AniListCoverImage;
  bannerImage?: string;
  episodes?: number;
  nextAiringEpisode?: AniListNextAiring;
  streamingEpisodes: AniListStreamingEpisode[];
  status?: string;
  format?: string;
} | null> {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        id
        title { romaji english native }
        coverImage { extraLarge large medium }
        bannerImage
        episodes
        status format
        nextAiringEpisode { episode airingAt }
        streamingEpisodes { title thumbnail url site }
      }
    }
  `;
  try {
    const data = await anilistQuery(query, { id: anilistId });
    return data?.Media || null;
  } catch {
    return null;
  }
}

/** Search anime on AniList */
export async function searchAnime(query: string, page = 1, perPage = 20): Promise<AniListSearchResult | null> {
  const gqlQuery = `
    query ($search: String, $page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { total currentPage lastPage hasNextPage perPage }
        media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
          id
          title { romaji english native }
          coverImage { extraLarge large medium color }
          bannerImage
          type format status
          episodes
          genres
          averageScore popularity
          season seasonYear
          description(asHtml: false)
          nextAiringEpisode { episode airingAt }
        }
      }
    }
  `;
  try {
    const data = await anilistQuery(gqlQuery, { search: query, page, perPage });
    return data?.Page || null;
  } catch {
    return null;
  }
}

/** Get trending anime */
export async function getTrending(page = 1, perPage = 20): Promise<AniListMedia[]> {
  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, sort: TRENDING_DESC) {
          id title { romaji english native }
          coverImage { extraLarge large medium color }
          bannerImage type format status episodes genres
          averageScore popularity season seasonYear
          description(asHtml: false)
          nextAiringEpisode { episode airingAt }
        }
      }
    }
  `;
  try {
    const data = await anilistQuery(query, { page, perPage });
    return data?.Page?.media || [];
  } catch {
    return [];
  }
}

/** Get popular anime */
export async function getPopular(page = 1, perPage = 20): Promise<AniListMedia[]> {
  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, sort: POPULARITY_DESC) {
          id title { romaji english native }
          coverImage { extraLarge large medium color }
          bannerImage type format status episodes genres
          averageScore popularity season seasonYear
          description(asHtml: false)
          nextAiringEpisode { episode airingAt }
        }
      }
    }
  `;
  try {
    const data = await anilistQuery(query, { page, perPage });
    return data?.Page?.media || [];
  } catch {
    return [];
  }
}

/** Get top rated anime */
export async function getTopRated(page = 1, perPage = 20): Promise<AniListMedia[]> {
  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, sort: SCORE_DESC) {
          id title { romaji english native }
          coverImage { extraLarge large medium color }
          bannerImage type format status episodes genres
          averageScore popularity season seasonYear
          description(asHtml: false)
          nextAiringEpisode { episode airingAt }
        }
      }
    }
  `;
  try {
    const data = await anilistQuery(query, { page, perPage });
    return data?.Page?.media || [];
  } catch {
    return [];
  }
}

/** Get anime by season */
export async function getSeasonAnime(season: string, year: number, page = 1, perPage = 20): Promise<AniListMedia[]> {
  const query = `
    query ($season: MediaSeason, $seasonYear: Int, $page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, season: $season, seasonYear: $seasonYear, sort: POPULARITY_DESC) {
          id title { romaji english native }
          coverImage { extraLarge large medium color }
          bannerImage type format status episodes genres
          averageScore popularity season seasonYear
          description(asHtml: false)
          nextAiringEpisode { episode airingAt }
        }
      }
    }
  `;
  try {
    const data = await anilistQuery(query, { season: season.toUpperCase(), seasonYear: year, page, perPage });
    return data?.Page?.media || [];
  } catch {
    return [];
  }
}

/** Get characters and voice actors (seiyuu) for an anime */
export async function getAnimeCharactersAndStaff(anilistId: number): Promise<{
  characters: Array<{
    id: number;
    name: { full: string; native?: string };
    image?: { large?: string; medium?: string };
    role: string;
    voiceActors?: Array<{
      id: number;
      name: { full: string; native?: string };
      image?: { large?: string; medium?: string };
      language: string;
    }>;
  }>;
  staff: Array<{
    id: number;
    name: { full: string; native?: string };
    image?: { large?: string; medium?: string };
    role: string;
  }>;
} | null> {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        characters(sort: ROLE, perPage: 20) {
          edges {
            node {
              id
              name { full native }
              image { large medium }
            }
            role
            voiceActors(language: JAPANESE) {
              id
              name { full native }
              image { large medium }
              language
            }
          }
        }
        staff(perPage: 12) {
          edges {
            node {
              id
              name { full native }
              image { large medium }
            }
            role
          }
        }
      }
    }
  `;
  try {
    const data = await anilistQuery(query, { id: anilistId });
    const media = data?.Media;
    if (!media) return null;
    return {
      characters: (media.characters?.edges || []).map((edge: any) => ({
        id: edge.node.id,
        name: edge.node.name,
        image: edge.node.image,
        role: edge.role,
        voiceActors: (edge.voiceActors || []).map((va: any) => ({
          id: va.id,
          name: va.name,
          image: va.image,
          language: va.language,
        })),
      })),
      staff: (media.staff?.edges || []).map((edge: any) => ({
        id: edge.node.id,
        name: edge.node.name,
        image: edge.node.image,
        role: edge.role,
      })),
    };
  } catch {
    return null;
  }
}

/** Get just the relations for an anime (lightweight query for franchise traversal) */
export async function getAnimeRelations(anilistId: number): Promise<{
  id: number;
  title: AniListTitle;
  format?: string;
  seasonYear?: number;
  relations: Array<{
    relationType: string;
    id: number;
    title: AniListTitle;
    coverImage: AniListCoverImage;
    type?: string;
    format?: string;
    episodes?: number;
    status?: string;
  }>;
} | null> {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        id
        title { romaji english native }
        format
        seasonYear
        relations {
          edges {
            relationType
            node {
              id title { romaji english native }
              coverImage { extraLarge large medium }
              type format episodes status
            }
          }
        }
      }
    }
  `;
  try {
    const data = await anilistQuery(query, { id: anilistId });
    const media = data?.Media;
    if (!media) return null;
    return {
      id: media.id,
      title: media.title,
      format: media.format,
      seasonYear: media.seasonYear,
      relations: (media.relations?.edges || []).map((edge: any) => ({
        relationType: edge.relationType,
        id: edge.node.id,
        title: edge.node.title,
        coverImage: edge.node.coverImage,
        type: edge.node.type,
        format: edge.node.format,
        episodes: edge.node.episodes,
        status: edge.node.status,
      })),
    };
  } catch {
    return null;
  }
}

/**
 * Traverse the full franchise tree by following PREQUEL/SEQUEL chains.
 * Returns ALL related anime (seasons + related) found across the franchise.
 * Max depth = 5 to prevent infinite loops.
 */
export async function getFullFranchise(
  anilistId: number,
  maxDepth: number = 5
): Promise<{
  seasons: Array<{
    relationType: string;
    id: number;
    title: AniListTitle;
    coverImage: AniListCoverImage;
    type?: string;
    format?: string;
    episodes?: number;
    status?: string;
    seasonYear?: number;
  }>;
  related: Array<{
    relationType: string;
    id: number;
    title: AniListTitle;
    coverImage: AniListCoverImage;
    type?: string;
    format?: string;
    episodes?: number;
    status?: string;
  }>;
}> {
  const visited = new Set<number>();
  const allRelations: Map<number, {
    relationType: string;
    id: number;
    title: AniListTitle;
    coverImage: AniListCoverImage;
    type?: string;
    format?: string;
    episodes?: number;
    status?: string;
    seasonYear?: number;
    isMainSeason: boolean;
  }> = new Map();

  // The starting anime is also part of the franchise
  visited.add(anilistId);

  async function traverse(currentId: number, depth: number) {
    if (depth > maxDepth) return;
    if (visited.has(currentId)) return;
    visited.add(currentId);

    const data = await getAnimeRelations(currentId);
    if (!data) return;

    for (const rel of data.relations) {
      // Skip if already known
      if (allRelations.has(rel.id) || rel.id === anilistId) continue;

      // Determine if this is a main season (SEQUEL/PREQUEL with TV/OVA/ONA format)
      const isMainSeason = (rel.relationType === "SEQUEL" || rel.relationType === "PREQUEL")
        && (!rel.format || rel.format === "TV" || rel.format === "TV_SHORT" || rel.format === "OVA" || rel.format === "ONA");

      allRelations.set(rel.id, {
        ...rel,
        seasonYear: undefined,
        isMainSeason,
      });

      // For SEQUEL/PREQUEL, traverse deeper to find the full chain
      if (rel.relationType === "SEQUEL" || rel.relationType === "PREQUEL") {
        await traverse(rel.id, depth + 1);
      }
    }
  }

  // Start traversal from the current anime's relations
  const startData = await getAnimeRelations(anilistId);
  if (startData) {
    for (const rel of startData.relations) {
      if (rel.id === anilistId) continue;

      const isMainSeason = (rel.relationType === "SEQUEL" || rel.relationType === "PREQUEL")
        && (!rel.format || rel.format === "TV" || rel.format === "TV_SHORT" || rel.format === "OVA" || rel.format === "ONA");

      allRelations.set(rel.id, {
        ...rel,
        seasonYear: undefined,
        isMainSeason,
      });

      // For SEQUEL/PREQUEL, traverse deeper
      if (rel.relationType === "SEQUEL" || rel.relationType === "PREQUEL") {
        await traverse(rel.id, 1);
      }
    }
  }

  // Separate into seasons and related
  const seasons: typeof allRelations extends Map<any, infer V> ? V[] : never = [];
  const related: typeof allRelations extends Map<any, infer V> ? V[] : never = [];

  for (const [, rel] of allRelations) {
    const { isMainSeason, ...rest } = rel;
    if (isMainSeason) {
      seasons.push(rest as any);
    } else {
      related.push(rest as any);
    }
  }

  // Sort seasons by seasonYear if available (we'll sort by ID as a proxy)
  seasons.sort((a, b) => a.id - b.id);

  return { seasons, related };
}

/**
 * Reverse lookup: MAL ID → AniList ID.
 * Uses AniList's `Media(idMal: $malId)` to find the corresponding AniList entry.
 * Returns the AniList ID if found, or null.
 * This is CRITICAL for the detail page: when search falls through to MAL,
 * results have `mal_XXX` IDs. We need the AniList ID for episodes/servers/etc.
 */
export async function resolveMalIdToAnilistId(malId: number): Promise<number | null> {
  const query = `
    query ($idMal: Int) {
      Media(idMal: $idMal, type: ANIME) {
        id
        idMal
      }
    }
  `;
  try {
    const data = await anilistQuery(query, { idMal: malId });
    if (data?.Media?.id) {
      console.log(`[AniList] Resolved MAL ID ${malId} → AniList ID ${data.Media.id}`);
      return data.Media.id;
    }
    console.warn(`[AniList] No AniList entry found for MAL ID ${malId}`);
    return null;
  } catch (err) {
    console.warn(`[AniList] Failed to resolve MAL ID ${malId}:`, err);
    return null;
  }
}

/** Get upcoming next episodes for the schedule */
export async function getAiringSchedule(page = 1, perPage = 20): Promise<any[]> {
  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        airingSchedules(airingAt_greater: ${Math.floor(Date.now() / 1000) - 86400}, sort: TIME_DESC) {
          id airingAt episode
          media {
            id title { romaji english native }
            coverImage { extraLarge large medium }
            type format episodes
          }
        }
      }
    }
  `;
  try {
    const data = await anilistQuery(query, { page, perPage });
    return data?.Page?.airingSchedules || [];
  } catch {
    return [];
  }
}
