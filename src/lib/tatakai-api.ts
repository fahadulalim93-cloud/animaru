/**
 * TatakaiAPI Client
 *
 * Unified anime API with multi-language dub support including Hindi, Telugu, Tamil.
 * Provides direct M3U8/MP4 streaming URLs from multiple providers:
 * - ToonStream (Hindi dubbed anime & cartoons)
 * - HindiDubbed (animehindidubbed.in)
 * - DesiDubAnime (Hindi dubbed)
 * - AnimeLok (Multi-language/regional)
 * - HiAnime (sub/dub with episode streams)
 *
 * API Base: https://api.tatakai.me
 * Source: https://github.com/snozxyx/tatakaiapi
 */

const TATAKAI_API = "https://api.tatakai.me";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
  Accept: "application/json",
};

// ---- Types ----

export interface TatakaiToonStreamSearchResult {
  id: string;
  title: string;
  slug: string;
  poster?: string;
  type?: string;
  language?: string;
  quality?: string;
  rating?: string;
}

export interface TatakaiToonStreamSeriesInfo {
  title: string;
  slug: string;
  poster?: string;
  cover?: string;
  type?: string;
  description?: string;
  language?: string;
  quality?: string;
  genres?: string[];
  rating?: string;
  duration?: string;
  seasons?: {
    season: string;
    episodes: {
      title: string;
      slug: string;
      episode?: string;
      image?: string;
    }[];
  }[];
}

export interface TatakaiToonStreamMovieInfo {
  title: string;
  slug: string;
  poster?: string;
  type?: string;
  description?: string;
  language?: string;
  quality?: string;
  genres?: string[];
  rating?: string;
  duration?: string;
}

export interface TatakaiStreamSource {
  label?: string;
  type: "hls" | "mp4";
  url: string;
  cover?: string;
  thumbnail?: string;
  subtitles?: { label: string; flag?: string; url: string }[];
  headers?: Record<string, string>;
  proxiedUrl?: string;
}

export interface TatakaiHindiDubbedAnime {
  title: string;
  slug: string;
  poster?: string;
  type?: string;
  language?: string;
  episodes?: {
    title: string;
    url: string;
    server?: string;
  }[];
}

export interface TatakaiAnimeLokLanguage {
  name: string;
  slug: string;
  count?: number;
}

export interface TatakaiAnimeLokAnime {
  id: string;
  title: string;
  poster?: string;
  type?: string;
  language?: string;
}

// ---- Helper: Fetch with timeout and retry ----

async function tatakaiFetch(url: string, retries = 2): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(url, {
        headers: HEADERS,
        signal: controller.signal,
        next: { revalidate: 300 },
      });
      clearTimeout(timeout);
      if (res.ok) return res;
      if (res.status === 429) {
        // Rate limited - wait and retry
        if (i < retries) {
          await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
          continue;
        }
      }
      return res;
    } catch (err) {
      if (i === retries) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error("Max retries exceeded");
}

// ---- ToonStream Provider (Primary Hindi Source) ----

/** Search Hindi dubbed anime via ToonStream */
export async function tatakaiToonStreamSearch(
  query: string,
  page: number = 1
): Promise<TatakaiToonStreamSearchResult[]> {
  try {
    const res = await tatakaiFetch(
      `${TATAKAI_API}/api/v2/anime/toonstream/search/${encodeURIComponent(query)}/${page}`
    );
    if (!res.ok) throw new Error(`ToonStream search failed: ${res.status}`);
    const data = await res.json();
    return data?.results || data?.data || [];
  } catch (err) {
    console.error("[TatakaiAPI] ToonStream search failed:", err);
    return [];
  }
}

/** Get ToonStream series info with episodes */
export async function tatakaiToonStreamSeriesInfo(
  slug: string
): Promise<TatakaiToonStreamSeriesInfo | null> {
  try {
    const res = await tatakaiFetch(
      `${TATAKAI_API}/api/v2/anime/toonstream/series/info/${encodeURIComponent(slug)}`
    );
    if (!res.ok) throw new Error(`Series info failed: ${res.status}`);
    const data = await res.json();
    return data?.results || data?.data || null;
  } catch (err) {
    console.error("[TatakaiAPI] ToonStream series info failed:", err);
    return null;
  }
}

/** Get ToonStream movie info */
export async function tatakaiToonStreamMovieInfo(
  slug: string
): Promise<TatakaiToonStreamMovieInfo | null> {
  try {
    const res = await tatakaiFetch(
      `${TATAKAI_API}/api/v2/anime/toonstream/movie/info/${encodeURIComponent(slug)}`
    );
    if (!res.ok) throw new Error(`Movie info failed: ${res.status}`);
    const data = await res.json();
    return data?.results || data?.data || null;
  } catch (err) {
    console.error("[TatakaiAPI] ToonStream movie info failed:", err);
    return null;
  }
}

/** Get ToonStream episode streaming sources */
export async function tatakaiToonStreamEpisodeSources(
  slug: string
): Promise<TatakaiStreamSource[]> {
  try {
    const res = await tatakaiFetch(
      `${TATAKAI_API}/api/v2/anime/toonstream/episode/sources/${encodeURIComponent(slug)}`
    );
    if (!res.ok) throw new Error(`Episode sources failed: ${res.status}`);
    const data = await res.json();
    return data?.results || data?.data || [];
  } catch (err) {
    console.error("[TatakaiAPI] ToonStream episode sources failed:", err);
    return [];
  }
}

/** Get ToonStream movie streaming sources */
export async function tatakaiToonStreamMovieSources(
  slug: string
): Promise<TatakaiStreamSource[]> {
  try {
    const res = await tatakaiFetch(
      `${TATAKAI_API}/api/v2/anime/toonstream/movie/sources/${encodeURIComponent(slug)}`
    );
    if (!res.ok) throw new Error(`Movie sources failed: ${res.status}`);
    const data = await res.json();
    return data?.results || data?.data || [];
  } catch (err) {
    console.error("[TatakaiAPI] ToonStream movie sources failed:", err);
    return [];
  }
}

/** Get ToonStream home page (latest series/movies) */
export async function tatakaiToonStreamHome(): Promise<{
  latestSeries: TatakaiToonStreamSearchResult[];
  latestMovies: TatakaiToonStreamSearchResult[];
}> {
  try {
    const res = await tatakaiFetch(
      `${TATAKAI_API}/api/v2/anime/toonstream/home`
    );
    if (!res.ok) throw new Error(`ToonStream home failed: ${res.status}`);
    const data = await res.json();
    return {
      latestSeries: data?.results?.latestSeries || data?.data?.latestSeries || [],
      latestMovies: data?.results?.latestMovies || data?.data?.latestMovies || [],
    };
  } catch (err) {
    console.error("[TatakaiAPI] ToonStream home failed:", err);
    return { latestSeries: [], latestMovies: [] };
  }
}

/** Get ToonStream series listing */
export async function tatakaiToonStreamSeries(
  page: number = 1
): Promise<TatakaiToonStreamSearchResult[]> {
  try {
    const res = await tatakaiFetch(
      `${TATAKAI_API}/api/v2/anime/toonstream/series/${page}`
    );
    if (!res.ok) throw new Error(`ToonStream series failed: ${res.status}`);
    const data = await res.json();
    return data?.results || data?.data || [];
  } catch (err) {
    console.error("[TatakaiAPI] ToonStream series failed:", err);
    return [];
  }
}

/** Get ToonStream movies listing */
export async function tatakaiToonStreamMovies(
  page: number = 1
): Promise<TatakaiToonStreamSearchResult[]> {
  try {
    const res = await tatakaiFetch(
      `${TATAKAI_API}/api/v2/anime/toonstream/movies/${page}`
    );
    if (!res.ok) throw new Error(`ToonStream movies failed: ${res.status}`);
    const data = await res.json();
    return data?.results || data?.data || [];
  } catch (err) {
    console.error("[TatakaiAPI] ToonStream movies failed:", err);
    return [];
  }
}

// ---- HindiDubbed Provider ----

/** Get HindiDubbed home page */
export async function tatakaiHindiDubbedHome(): Promise<{
  trending: TatakaiHindiDubbedAnime[];
  latest: TatakaiHindiDubbedAnime[];
}> {
  try {
    const res = await tatakaiFetch(
      `${TATAKAI_API}/api/v2/anime/hindidubbed/home`
    );
    if (!res.ok) throw new Error(`HindiDubbed home failed: ${res.status}`);
    const data = await res.json();
    return {
      trending: data?.results?.trending || data?.data?.trending || [],
      latest: data?.results?.latest || data?.data?.latest || [],
    };
  } catch (err) {
    console.error("[TatakaiAPI] HindiDubbed home failed:", err);
    return { trending: [], latest: [] };
  }
}

/** Search Hindi dubbed anime */
export async function tatakaiHindiDubbedSearch(
  title: string
): Promise<TatakaiHindiDubbedAnime[]> {
  try {
    const res = await tatakaiFetch(
      `${TATAKAI_API}/api/v2/anime/hindidubbed/search/${encodeURIComponent(title)}`
    );
    if (!res.ok) throw new Error(`HindiDubbed search failed: ${res.status}`);
    const data = await res.json();
    return data?.results || data?.data || [];
  } catch (err) {
    console.error("[TatakaiAPI] HindiDubbed search failed:", err);
    return [];
  }
}

/** Get HindiDubbed anime info with episodes */
export async function tatakaiHindiDubbedInfo(
  slug: string
): Promise<TatakaiHindiDubbedAnime | null> {
  try {
    const res = await tatakaiFetch(
      `${TATAKAI_API}/api/v2/anime/hindidubbed/anime/${encodeURIComponent(slug)}`
    );
    if (!res.ok) throw new Error(`HindiDubbed info failed: ${res.status}`);
    const data = await res.json();
    return data?.results || data?.data || null;
  } catch (err) {
    console.error("[TatakaiAPI] HindiDubbed info failed:", err);
    return null;
  }
}

/** Get HindiDubbed episode HLS stream */
export async function tatakaiHindiDubbedStream(
  url: string,
  server?: string
): Promise<TatakaiStreamSource[]> {
  try {
    const serverParam = server ? `&server=${encodeURIComponent(server)}` : "";
    const res = await tatakaiFetch(
      `${TATAKAI_API}/api/v2/anime/hindidubbed/episode/hls?url=${encodeURIComponent(url)}${serverParam}`
    );
    if (!res.ok) throw new Error(`HindiDubbed stream failed: ${res.status}`);
    const data = await res.json();
    return data?.results || data?.data || [];
  } catch (err) {
    console.error("[TatakaiAPI] HindiDubbed stream failed:", err);
    return [];
  }
}

// ---- AnimeLok Provider (Multi-language) ----

/** Get available languages from AnimeLok */
export async function tatakaiAnimeLokLanguages(): Promise<TatakaiAnimeLokLanguage[]> {
  try {
    const res = await tatakaiFetch(
      `${TATAKAI_API}/api/v2/anime/animelok/languages`
    );
    if (!res.ok) throw new Error(`AnimeLok languages failed: ${res.status}`);
    const data = await res.json();
    return data?.results || data?.data || [];
  } catch (err) {
    console.error("[TatakaiAPI] AnimeLok languages failed:", err);
    return [];
  }
}

/** Get anime by language from AnimeLok */
export async function tatakaiAnimeLokByLanguage(
  language: string,
  page: number = 1
): Promise<TatakaiAnimeLokAnime[]> {
  try {
    const res = await tatakaiFetch(
      `${TATAKAI_API}/api/v2/anime/animelok/languages/${encodeURIComponent(language)}?page=${page}`
    );
    if (!res.ok) throw new Error(`AnimeLok language failed: ${res.status}`);
    const data = await res.json();
    return data?.results || data?.data || [];
  } catch (err) {
    console.error("[TatakaiAPI] AnimeLok by language failed:", err);
    return [];
  }
}

// ---- HiAnime V2 Endpoints (sub/dub) ----

/** Search anime via HiAnime v2 */
export async function tatakaiHiAnimeSearch(
  query: string,
  page: number = 1
): Promise<any[]> {
  try {
    const res = await tatakaiFetch(
      `${TATAKAI_API}/api/v2/hianime/search?q=${encodeURIComponent(query)}&page=${page}`
    );
    if (!res.ok) throw new Error(`HiAnime search failed: ${res.status}`);
    const data = await res.json();
    return data?.results?.animes || data?.data || [];
  } catch (err) {
    console.error("[TatakaiAPI] HiAnime search failed:", err);
    return [];
  }
}

/** Get HiAnime anime info */
export async function tatakaiHiAnimeInfo(animeId: string): Promise<any | null> {
  try {
    const res = await tatakaiFetch(
      `${TATAKAI_API}/api/v2/hianime/anime/${encodeURIComponent(animeId)}`
    );
    if (!res.ok) throw new Error(`HiAnime info failed: ${res.status}`);
    const data = await res.json();
    return data?.results || data?.data || null;
  } catch (err) {
    console.error("[TatakaiAPI] HiAnime info failed:", err);
    return null;
  }
}

/** Get HiAnime episode servers */
export async function tatakaiHiAnimeEpisodeServers(
  animeEpisodeId: string
): Promise<any[]> {
  try {
    const res = await tatakaiFetch(
      `${TATAKAI_API}/api/v2/hianime/episode/servers?animeEpisodeId=${encodeURIComponent(animeEpisodeId)}`
    );
    if (!res.ok) throw new Error(`HiAnime servers failed: ${res.status}`);
    const data = await res.json();
    return data?.results || data?.data || [];
  } catch (err) {
    console.error("[TatakaiAPI] HiAnime servers failed:", err);
    return [];
  }
}

/** Get HiAnime episode stream sources */
export async function tatakaiHiAnimeStream(
  animeEpisodeId: string,
  server?: string,
  category?: "sub" | "dub" | "raw"
): Promise<{
  streamingLink?: { url: string; type?: string };
  tracks?: { url: string; label: string }[];
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
  servers?: any[];
} | null> {
  try {
    const params = new URLSearchParams({
      animeEpisodeId,
    });
    if (server) params.set("server", server);
    if (category) params.set("category", category);

    const res = await tatakaiFetch(
      `${TATAKAI_API}/api/v2/hianime/episode/stream?${params.toString()}`
    );
    if (!res.ok) throw new Error(`HiAnime stream failed: ${res.status}`);
    const data = await res.json();
    return data?.results || data?.data || null;
  } catch (err) {
    console.error("[TatakaiAPI] HiAnime stream failed:", err);
    return null;
  }
}

// ---- Health Check ----

/** Check if TatakaiAPI is reachable */
export async function tatakaiHealthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${TATAKAI_API}/health`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
