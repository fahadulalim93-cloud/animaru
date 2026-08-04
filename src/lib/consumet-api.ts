// Consumet API Client - Stable multi-provider anime streaming API
// Supports subbed & dubbed content via GogoAnime, Zoro, AnimePahe providers
// NOTE: Public api.consumet.org was shut down mid-2024. Use self-hosted instance or fallback to gogoanime-api.ts

const CONSUMET_BASE = process.env.CONSUMET_API_URL || "https://api.consumet.org";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36",
  Accept: "application/json",
};

async function consumetFetch(path: string, retries = 2): Promise<Response | null> {
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(`${CONSUMET_BASE}${path}`, {
        headers: HEADERS,
        signal: controller.signal,
        next: { revalidate: 300 },
      });
      clearTimeout(timeout);
      if (res.ok) return res;
      if (res.status >= 500 && i < retries) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        continue;
      }
      return null;
    } catch {
      if (i === retries) return null;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  return null;
}

// ---- Types ----
export interface ConsumetAnimeResult {
  id: string;
  title: string;
  image?: string;
  releaseDate?: string;
  subOrDub?: string;
  type?: string;
  url?: string;
}

export interface ConsumetSearchResult {
  currentPage: number;
  hasNextPage: boolean;
  results: ConsumetAnimeResult[];
}

export interface ConsumetEpisode {
  id: string;
  number: number;
  title?: string;
  description?: string;
  image?: string;
  airDate?: string;
}

export interface ConsumetEpisodeList {
  episodes: ConsumetEpisode[];
  totalEpisodes?: number;
}

export interface ConsumetStreamSource {
  url: string;
  quality: string;
  isM3U8?: boolean;
}

export interface ConsumetWatchResult {
  headers?: Record<string, string>;
  sources: ConsumetStreamSource[];
  subtitles?: { url: string; lang: string }[];
  download?: string;
}

export interface ConsumetAnimeInfo {
  id: string;
  title: string;
  url?: string;
  image?: string;
  releaseDate?: string;
  description?: string;
  subOrDub?: string;
  type?: string;
  status?: string;
  otherName?: string;
  genres?: string[];
  totalEpisodes?: number;
  episodes?: ConsumetEpisode[];
}

// ---- GogoAnime Provider ----

export async function gogoSearch(query: string, page = 1): Promise<ConsumetSearchResult> {
  try {
    const res = await consumetFetch(`/anime/gogoanime/${encodeURIComponent(query)}?page=${page}`);
    if (!res) return { currentPage: page, hasNextPage: false, results: [] };
    return await res.json();
  } catch {
    return { currentPage: page, hasNextPage: false, results: [] };
  }
}

export async function gogoInfo(id: string): Promise<ConsumetAnimeInfo | null> {
  try {
    const res = await consumetFetch(`/anime/gogoanime/info/${encodeURIComponent(id)}`);
    if (!res) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function gogoWatch(episodeId: string): Promise<ConsumetWatchResult | null> {
  try {
    const res = await consumetFetch(`/anime/gogoanime/watch/${encodeURIComponent(episodeId)}`);
    if (!res) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function gogoRecent(page = 1, type: number = 1): Promise<ConsumetAnimeResult[]> {
  try {
    const res = await consumetFetch(`/anime/gogoanime/recent-episodes?page=${page}&type=${type}`);
    if (!res) return [];
    const data = await res.json();
    return data?.results || [];
  } catch {
    return [];
  }
}

export async function gogoTopAiring(page = 1): Promise<ConsumetAnimeResult[]> {
  try {
    const res = await consumetFetch(`/anime/gogoanime/top-airing?page=${page}`);
    if (!res) return [];
    const data = await res.json();
    return data?.results || [];
  } catch {
    return [];
  }
}

// ---- Zoro/AniWatch Provider (supports dub!) ----

export async function zoroSearch(query: string, page = 1): Promise<ConsumetSearchResult> {
  try {
    const res = await consumetFetch(`/anime/zoro/${encodeURIComponent(query)}?page=${page}`);
    if (!res) return { currentPage: page, hasNextPage: false, results: [] };
    return await res.json();
  } catch {
    return { currentPage: page, hasNextPage: false, results: [] };
  }
}

export async function zoroInfo(id: string): Promise<ConsumetAnimeInfo | null> {
  try {
    const res = await consumetFetch(`/anime/zoro/info/${encodeURIComponent(id)}`);
    if (!res) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function zoroWatch(episodeId: string): Promise<ConsumetWatchResult | null> {
  try {
    const res = await consumetFetch(`/anime/zoro/watch/${encodeURIComponent(episodeId)}`);
    if (!res) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ---- AnimePahe Provider ----

export async function paheSearch(query: string, page = 1): Promise<ConsumetSearchResult> {
  try {
    const res = await consumetFetch(`/anime/animepahe/${encodeURIComponent(query)}?page=${page}`);
    if (!res) return { currentPage: page, hasNextPage: false, results: [] };
    return await res.json();
  } catch {
    return { currentPage: page, hasNextPage: false, results: [] };
  }
}

export async function paheInfo(id: string): Promise<ConsumetAnimeInfo | null> {
  try {
    const res = await consumetFetch(`/anime/animepahe/info/${encodeURIComponent(id)}`);
    if (!res) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function paheWatch(episodeId: string): Promise<ConsumetWatchResult | null> {
  try {
    const res = await consumetFetch(`/anime/animepahe/watch/${encodeURIComponent(episodeId)}`);
    if (!res) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ---- Helper: Try multiple providers for streaming ----
export async function getStreamFromProviders(
  episodeId: string,
  providers: Array<{ watch: (id: string) => Promise<ConsumetWatchResult | null> }>
): Promise<ConsumetWatchResult | null> {
  for (const provider of providers) {
    const result = await provider.watch(episodeId);
    if (result?.sources?.length) return result;
  }
  return null;
}
