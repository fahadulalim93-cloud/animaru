// Miruro API Client — REWRITTEN to use direct AniList + direct miruro.tv pipe
// No dependency on any deployed Vercel API.
// - Metadata (search, trending, popular, info): AniList GraphQL directly
// - Episodes + streams: www.miruro.tv/api/secure/pipe directly (base64+gzip codec)
//
// This file is imported by 20+ components/API routes, so the public API
// (function names + return shapes) is kept compatible with the old version.

import { encodePipeRequest, decodePipeResponse, translateId, deepTranslateIds, fetchRawEpisodes, getEpisodes as getMiruroEpisodesDirect, getSourceFromProvider } from "./miruro-direct";
import { wrapStreamUrl, wrapM3u8Url } from "./proxy";

// ─── AniList GraphQL ──────────────────────────────────────────────
const ANILIST_API = "https://graphql.anilist.co";

/**
 * AniList GraphQL query with retry logic + rate limit handling.
 * AniList returns 429 (rate limited) or 500 (error 1101) when too many
 * requests come from the same IP (Vercel's shared IPs get rate-limited often).
 */
async function anilistQuery(query: string, variables?: Record<string, unknown>) {
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 1000;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(ANILIST_API, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
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
      if (json.errors) return null;
      return json.data;
    } catch {
      if (attempt < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)));
        continue;
      }
      return null;
    }
  }
  return null;
}

const MEDIA_FIELDS = `
  id idMal
  title { romaji english native userPreferred }
  coverImage { extraLarge large medium color }
  bannerImage
  type format status
  episodes duration
  genres
  averageScore meanScore popularity trending favourites
  season seasonYear
  countryOfOrigin isAdult source
  description(asHtml: false)
  nextAiringEpisode { episode airingAt }
`;

// ─── Types (kept compatible with old API) ─────────────────────────
export interface MiruroAnimeResult {
  id: number;
  title: { romaji?: string; english?: string; native?: string };
  type?: string;
  format?: string;
  status?: string;
  description?: string;
  season?: string;
  seasonYear?: number;
  episodes?: number;
  duration?: number;
  coverImage?: { extraLarge?: string; large?: string; medium?: string; color?: string };
  bannerImage?: string;
  genres?: string[];
  averageScore?: number;
  popularity?: number;
  trending?: number;
  countryOfOrigin?: string;
  isAdult?: boolean;
}

export interface MiruroEpisode {
  number: number;
  slug: string;
  id?: string;
  title?: string;
  thumbnail?: string;
  image?: string;
  isFiller?: boolean;
  filler?: boolean;
  airDate?: string;
  description?: string;
}

export interface MiruroWatchSource {
  url: string;
  quality?: string;
  isM3U8?: boolean;
  sourceType?: "internal" | "external";
  sourceName?: string;
  type?: string;
}

export interface MiruroWatchResult {
  sources: MiruroWatchSource[];
  subtitles?: { url: string; lang: string; language: string }[];
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
  headers?: Record<string, string>;
  provider: string;
  allProviders?: string[];
  triedProviders?: string[];
}

export interface MiruroSearchResult {
  currentPage: number;
  hasNextPage: boolean;
  totalPages?: number;
  results: MiruroAnimeResult[];
}

export interface MiruroProviderEpisodes {
  episodes: { sub: MiruroEpisode[]; dub: MiruroEpisode[] };
  meta?: { title?: string };
}

export interface MiruroEpisodesResponse {
  providers: Record<string, MiruroProviderEpisodes>;
  mappings?: Record<string, any>;
}

export interface NormalizedEpisodesResult {
  sub: MiruroEpisode[];
  dub: MiruroEpisode[];
  defaultProvider: string;
  allProviders: string[];
  providersMap: Record<string, MiruroProviderEpisodes>;
}

// ─── Search ───────────────────────────────────────────────────────
export async function miruroSearch(query: string, page = 1, perPage = 20): Promise<MiruroSearchResult> {
  const data = await anilistQuery(
    `query ($search: String, $page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { currentPage hasNextPage lastPage }
        media(search: $search, type: ANIME, sort: SEARCH_MATCH) { ${MEDIA_FIELDS} }
      }
    }`,
    { search: query, page, perPage }
  );
  if (!data?.Page) return { currentPage: page, hasNextPage: false, totalPages: 1, results: [] };
  return {
    currentPage: data.Page.pageInfo?.currentPage || page,
    hasNextPage: data.Page.pageInfo?.hasNextPage || false,
    totalPages: data.Page.pageInfo?.lastPage || 1,
    results: data.Page.media || [],
  };
}

// ─── Info ─────────────────────────────────────────────────────────
export async function miruroInfo(anilistId: number): Promise<MiruroAnimeResult | null> {
  const data = await anilistQuery(
    `query ($id: Int) { Media(id: $id, type: ANIME) { ${MEDIA_FIELDS} } }`,
    { id: anilistId }
  );
  return data?.Media || null;
}

// ─── Trending ─────────────────────────────────────────────────────
export async function miruroTrending(page = 1, perPage = 20): Promise<MiruroAnimeResult[]> {
  const data = await anilistQuery(
    `query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, sort: TRENDING_DESC) { ${MEDIA_FIELDS} }
      }
    }`,
    { page, perPage }
  );
  return data?.Page?.media || [];
}

// ─── Popular ──────────────────────────────────────────────────────
export async function miruroPopular(page = 1, perPage = 20): Promise<MiruroAnimeResult[]> {
  const data = await anilistQuery(
    `query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, sort: POPULARITY_DESC) { ${MEDIA_FIELDS} }
      }
    }`,
    { page, perPage }
  );
  return data?.Page?.media || [];
}

// ─── Recent ───────────────────────────────────────────────────────
export async function miruroRecent(page = 1, perPage = 20): Promise<MiruroAnimeResult[]> {
  const data = await anilistQuery(
    `query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, status: RELEASING, sort: START_DATE_DESC) { ${MEDIA_FIELDS} }
      }
    }`,
    { page, perPage }
  );
  return data?.Page?.media || [];
}

// ─── Episodes (direct from miruro.tv pipe) ────────────────────────
export async function miruroEpisodes(anilistId: number): Promise<NormalizedEpisodesResult> {
  try {
    const result = await getMiruroEpisodesDirect(anilistId);
    // Convert to old-compatible shape
    const sub: MiruroEpisode[] = result.sub.map(ep => ({
      number: ep.number,
      slug: ep.id || String(ep.number),
      id: ep.id,
      title: ep.title || `Episode ${ep.number}`,
      thumbnail: ep.thumbnail || ep.image || "",
      isFiller: ep.isFiller || ep.filler || false,
      airDate: ep.airDate || "",
    }));
    const dub: MiruroEpisode[] = result.dub.map(ep => ({
      number: ep.number,
      slug: ep.id || String(ep.number),
      id: ep.id,
      title: ep.title || `Episode ${ep.number}`,
      thumbnail: ep.thumbnail || ep.image || "",
      isFiller: ep.isFiller || ep.filler || false,
      airDate: ep.airDate || "",
    }));
    // Build providersMap for compatibility
    const providersMap: Record<string, MiruroProviderEpisodes> = {};
    if (result.raw?.providers) {
      for (const [name, p] of Object.entries(result.raw.providers)) {
        providersMap[name] = {
          episodes: {
            sub: (p.episodes?.sub || []).map((ep: any) => ({
              number: ep.number,
              slug: ep.id || String(ep.number),
              id: ep.id,
              title: ep.title || `Episode ${ep.number}`,
              thumbnail: ep.thumbnail || ep.image || "",
            })),
            dub: (p.episodes?.dub || []).map((ep: any) => ({
              number: ep.number,
              slug: ep.id || String(ep.number),
              id: ep.id,
              title: ep.title || `Episode ${ep.number}`,
              thumbnail: ep.thumbnail || ep.image || "",
            })),
          },
        };
      }
    }
    return {
      sub,
      dub,
      defaultProvider: result.defaultProvider,
      allProviders: result.providers,
      providersMap,
    };
  } catch {
    return { sub: [], dub: [], defaultProvider: "", allProviders: [], providersMap: {} };
  }
}

// ─── Watch single provider (for yumezone compatibility) ──────────
export async function miruroWatchProvider(
  provider: string,
  anilistId: number,
  translationType: "sub" | "dub",
  episodeSlug: string
): Promise<MiruroWatchResult | null> {
  try {
    const epNum = parseInt(episodeSlug, 10) || 1;
    const result = await getSourceFromProvider(anilistId, epNum, translationType, provider);
    if (!result?.url) return null;
    const ref = result.streamReferer || "";
    const isMP4 = !result.isM3U8;
    const proxyUrl = isMP4
      ? `/api/anime/scraper/stream?url=${encodeURIComponent(result.url)}&ref=${encodeURIComponent(ref || "https://www.miruro.tv/")}`
      : wrapM3u8UrlWithReferer(result.url, result.streamReferer || ref);
    return {
      sources: [{
        url: proxyUrl,
        quality: result.quality || "auto",
        isM3U8: result.isM3U8,
        sourceType: "internal",
        sourceName: provider,
      }],
      subtitles: result.subtitles.map(s => ({
        url: s.url, lang: s.lang, language: s.language || s.lang || "English",
      })),
      intro: result.intro,
      outro: result.outro,
      headers: { Referer: ref || "https://www.miruro.tv/" },
      provider,
    };
  } catch {
    return null;
  }
}

// ─── Watch (direct from miruro.tv pipe, specific provider) ────────
export async function miruroWatch(
  provider: string,
  anilistId: number,
  translationType: "sub" | "dub",
  episodeSlug: string,
  providersMap?: Record<string, MiruroProviderEpisodes>,
  episodeNum?: number
): Promise<MiruroWatchResult & { triedProviders: string[] }> {
  const triedProviders: string[] = [];
  const epNum = episodeNum || parseInt(episodeSlug, 10) || 1;

  // Build provider list to try
  let providersToTry: string[] = [provider];
  if (providersMap) {
    const available = Object.keys(providersMap);
    providersToTry = [provider, ...available.filter(p => p !== provider)];
  }

  for (const currentProvider of providersToTry) {
    triedProviders.push(currentProvider);
    try {
      const result = await getSourceFromProvider(anilistId, epNum, translationType, currentProvider);
      if (result?.url) {
        const sources: MiruroWatchSource[] = [
          {
            url: result.url,
            quality: result.quality || "auto",
            isM3U8: result.isM3U8,
            sourceType: "internal",
            sourceName: currentProvider,
          },
        ];
        // Wrap through stream proxy with correct referer
        const ref = result.streamReferer || "";
        const isMP4 = !result.isM3U8;
    const proxyUrl = isMP4
      ? `/api/anime/scraper/stream?url=${encodeURIComponent(result.url)}&ref=${encodeURIComponent(ref || "https://www.miruro.tv/")}`
      : wrapM3u8UrlWithReferer(result.url, result.streamReferer || ref);
        sources[0].url = proxyUrl;

        return {
          sources,
          subtitles: result.subtitles.map(s => ({
            url: s.url, lang: s.lang, language: s.language || s.lang || "English",
          })),
          intro: result.intro,
          outro: result.outro,
          headers: { Referer: ref || "https://www.miruro.tv/" },
          provider: currentProvider,
          allProviders: providersToTry,
          triedProviders,
        };
      }
    } catch {
      // try next provider
    }
  }

  return {
    sources: [],
    subtitles: [],
    intro: undefined,
    outro: undefined,
    headers: {},
    provider: triedProviders[triedProviders.length - 1] || provider,
    allProviders: providersToTry,
    triedProviders,
  };
}

// ─── Provider helpers (kept for compatibility) ────────────────────
export const MIRURO_PROVIDERS = [
  "kiwi", "pewe", "bee", "bonk", "bun", "ally", "nun", "twin", "cog", "moo", "hop", "telli",
];

export type MiruroProvider = string;

export function getProviderDisplayName(provider: string): string {
  const names: Record<string, string> = {
    kiwi: "King", pewe: "Queen", bee: "Yamato", bonk: "WhosWho", bun: "PageOne",
    ally: "Smoothie", nun: "Perospero", twin: "Hawkins", cog: "Killer", moo: "Blackbeard",
    hop: "BigMom", telli: "Kaido",
  };
  return names[provider] || provider.charAt(0).toUpperCase() + provider.slice(1);
}

export function getAvailableProvidersForEpisode(
  providersMap: Record<string, MiruroProviderEpisodes>,
  episodeNum: number,
  category: "sub" | "dub"
): string[] {
  const available: string[] = [];
  for (const [name, data] of Object.entries(providersMap)) {
    const eps = category === "dub" ? data.episodes?.dub : data.episodes?.sub;
    if (eps?.some(ep => ep.number === episodeNum)) {
      available.push(name);
    }
  }
  return available;
}

export function getEpisodeSlugForProvider(
  providersMap: Record<string, MiruroProviderEpisodes>,
  providerName: string,
  episodeNum: number,
  category: "sub" | "dub"
): string | null {
  const providerData = providersMap[providerName];
  if (!providerData?.episodes) return null;
  const eps = category === "dub" ? providerData.episodes.dub : providerData.episodes.sub;
  const ep = eps.find(e => e.number === episodeNum);
  if (!ep) return null;
  return ep.slug || ep.id || String(ep.number);
}
