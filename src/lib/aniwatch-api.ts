// AniWatch API Client - Direct API for subbed & dubbed anime
// Uses the same backend as zoro.to / aniwatch.to
// Provides both SUB and DUB streams

const ANIWATCH_API = "https://aniwatch-api-one.vercel.app";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36",
  Accept: "application/json",
};

async function aniwatchFetch(path: string, retries = 2): Promise<Response | null> {
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(`${ANIWATCH_API}${path}`, {
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
export interface AniWatchAnime {
  id: string;
  name: string;
  jname?: string;
  poster?: string;
  duration?: string;
  type?: string;
  rating?: string;
  episodes?: { sub?: number; dub?: number };
}

export interface AniWatchSearchResult {
  currentPage: number;
  hasNextPage: boolean;
  results: AniWatchAnime[];
}

export interface AniWatchEpisode {
  number: number;
  title?: string;
  episodeId: string;
  subOrDub?: "sub" | "dub";
}

export interface AniWatchInfo {
  anime: {
    info: {
      id: string;
      name: string;
      jname?: string;
      poster?: string;
      description?: string;
      stats?: {
        rating?: string;
        quality?: string;
        type?: string;
        duration?: string;
        episodes?: { sub?: number; dub?: number };
      };
      season?: string;
    };
    moreInfo?: {
      genres?: string[];
      status?: string;
      studios?: string[];
      aired?: string;
    };
  };
  episodes?: {
    sub?: AniWatchEpisode[];
    dub?: AniWatchEpisode[];
  };
}

export interface AniWatchStream {
  sources: { url: string; quality: string; isM3U8: boolean }[];
  subtitles?: { url: string; lang: string }[];
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
  headers?: Record<string, string>;
}

// ---- API Functions ----

export async function aniwatchSearch(
  query: string,
  page = 1
): Promise<AniWatchSearchResult> {
  try {
    const res = await aniwatchFetch(`/search?q=${encodeURIComponent(query)}&page=${page}`);
    if (!res) return { currentPage: page, hasNextPage: false, results: [] };
    const data = await res.json();
    return {
      currentPage: data?.currentPage || page,
      hasNextPage: data?.hasNextPage || false,
      results: data?.results || data?.animes || [],
    };
  } catch {
    return { currentPage: page, hasNextPage: false, results: [] };
  }
}

export async function aniwatchInfo(id: string): Promise<AniWatchInfo | null> {
  try {
    const res = await aniwatchFetch(`/info?id=${encodeURIComponent(id)}`);
    if (!res) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function aniwatchWatch(
  episodeId: string,
  server?: string,
  category?: "sub" | "dub"
): Promise<AniWatchStream | null> {
  try {
    let path = `/watch?episodeId=${encodeURIComponent(episodeId)}`;
    if (server) path += `&server=${server}`;
    if (category) path += `&category=${category}`;
    const res = await aniwatchFetch(path);
    if (!res) return null;
    const data = await res.json();
    return data?.streamingLink ? {
      sources: data.streamingLink.stream?.sources || data.streamingLink.qualities?.map((q: any) => ({
        url: q.url,
        quality: q.quality,
        isM3U8: q.url?.includes(".m3u8") ?? true,
      })) || [],
      subtitles: data.streamingLink.stream?.subtitles || [],
      headers: data.streamingLink.headers,
    } : data;
  } catch {
    return null;
  }
}

export async function aniwatchHome(): Promise<{
  trending?: AniWatchAnime[];
  popular?: AniWatchAnime[];
  latest?: AniWatchAnime[];
}> {
  try {
    const res = await aniwatchFetch("/home");
    if (!res) return {};
    const data = await res.json();
    return {
      trending: data?.trending || data?.spotlightAnimes || [],
      popular: data?.popular || data?.top10Animes?.today || [],
      latest: data?.latestEpisodeAnimes || [],
    };
  } catch {
    return {};
  }
}

export async function aniwatchGenre(
  genre: string,
  page = 1
): Promise<AniWatchSearchResult> {
  try {
    const res = await aniwatchFetch(`/genre/${encodeURIComponent(genre)}?page=${page}`);
    if (!res) return { currentPage: page, hasNextPage: false, results: [] };
    const data = await res.json();
    return {
      currentPage: data?.currentPage || page,
      hasNextPage: data?.hasNextPage || false,
      results: data?.animes || data?.results || [],
    };
  } catch {
    return { currentPage: page, hasNextPage: false, results: [] };
  }
}
