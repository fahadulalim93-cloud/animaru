// AllAnime GraphQL API Client
// Clean rewrite - Vercel compatible (no Node.js crypto for client-side)
// Server-side API routes handle the decryption

import { wrapM3u8Url } from "./proxy";

const API_URL = "https://api.allanime.day/api";
const CDN_BASE = "https://allanimenews.com";

const HEADERS = {
  Origin: "https://allmanga.to",
  Referer: "https://allmanga.to/",
  "Content-Type": "application/json",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
};

const PERSISTED_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
  Accept: "application/json",
  Referer: "https://allmanga.to/",
  Origin: "https://youtu-chan.com",
};

async function graphqlQuery(query: string, variables?: Record<string, unknown>) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ query, variables }),
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`GraphQL request failed: ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(`GraphQL error: ${json.errors[0]?.message || "Unknown"}`);
  return json.data;
}

function decodeUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("--")) {
    const hex = url.slice(2);
    let result = "";
    for (let i = 0; i < hex.length; i += 2) {
      const byte = parseInt(hex.substr(i, 2), 16) ^ 56;
      result += String.fromCharCode(byte);
    }
    return result;
  }
  if (url.startsWith("ap/")) {
    const hex = url.slice(3);
    let result = "";
    for (let i = 0; i < hex.length; i += 2) {
      result += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    }
    return result;
  }
  return url;
}

export interface AnimeItem {
  _id: string;
  name: string;
  englishName?: string;
  thumbnail?: string;
  score?: number;
  type?: string;
  status?: string;
  genres?: string[];
  availableEpisodes?: Record<string, number>;
  season?: string;
  description?: string;
  nativeName?: string;
  episodeCount?: number;
  altNames?: string[];
  countryOfOrigin?: string;
  tags?: string[];
  studios?: string[];
}

export interface VideoInfo {
  vidResolution: number;
  vidPath: string;
  vidSize: number;
  vidDuration: number;
}

export interface EpisodeInfoResult {
  episodeIdNum: number;
  notes: string | null;
  thumbnails: string[];
  vidInforssub: VideoInfo | null;
  vidInforsdub: VideoInfo | null;
  vidInforsraw: VideoInfo | null;
}

export interface StreamSource {
  url: string;
  rawUrl: string;
  sourceName: string;
  type: "iframe" | "hls" | "mp4";
  provider: string;
  quality?: string;
}

// ---- API Functions ----

export async function getHomePage(
  translationType: string = "sub",
  countryOrigin: string = "JP",
  page: number = 1
) {
  const trendingQuery = `query { shows(search: { sortBy: Trending }, limit: 26, page: ${page}, translationType: ${translationType}, countryOrigin: ${countryOrigin}) { edges { _id name englishName thumbnail score type status genres availableEpisodes season } } }`;
  const recentQuery = `query { shows(search: { sortBy: Latest_Update }, limit: 26, page: ${page}, translationType: ${translationType}, countryOrigin: ${countryOrigin}) { edges { _id name englishName thumbnail score type status genres availableEpisodes season } } }`;

  const [trendingData, recentData] = await Promise.all([
    graphqlQuery(trendingQuery),
    graphqlQuery(recentQuery),
  ]);

  return {
    trending: trendingData?.shows?.edges || [],
    recent: recentData?.shows?.edges || [],
  };
}

export async function searchAnime(
  q: string,
  page: number = 1,
  limit: number = 26,
  translationType?: string
) {
  const searchStr = `{ query: "${q.replace(/"/g, '\\"')}", sortBy: Latest_Update }`;
  let translationStr = translationType ? `translationType: ${translationType}` : "";

  const query = `query { shows(search: ${searchStr}, limit: ${limit}, page: ${page} ${translationStr}) { edges { _id name englishName thumbnail score type status genres availableEpisodes season } } }`;
  const data = await graphqlQuery(query);
  return {
    results: data?.shows?.edges || [],
    pageInfo: { currentPage: page, hasNextPage: (data?.shows?.edges || []).length >= limit },
  };
}

export async function getAnimeInfo(showId: string) {
  const query = `query { show(_id: "${showId}") { _id name englishName nativeName description thumbnail score type status genres availableEpisodes season altNames countryOfOrigin tags studios episodeCount } }`;
  const data = await graphqlQuery(query);
  return data?.show || null;
}

export async function getEpisodes(
  showId: string,
  episodeStart: number = 1,
  episodeEnd: number = 9999
): Promise<EpisodeInfoResult[]> {
  const query = `{ episodeInfos(showId: "${showId}", episodeNumStart: ${episodeStart}.0, episodeNumEnd: ${episodeEnd}.0) { episodeIdNum notes thumbnails vidInforssub vidInforsdub vidInforsraw } }`;
  const data = await graphqlQuery(query);
  const rawEpisodes = data?.episodeInfos || [];
  return rawEpisodes.map((ep: any) => processEpisodeStreams(ep));
}

function processEpisodeStreams(ep: any): EpisodeInfoResult {
  const result: EpisodeInfoResult = {
    episodeIdNum: ep.episodeIdNum || 0,
    notes: ep.notes || null,
    thumbnails: (ep.thumbnails || []).map((t: string) => t.startsWith("http") ? t : `${CDN_BASE}/${t.replace(/^\//, "")}`),
    vidInforssub: null,
    vidInforsdub: null,
    vidInforsraw: null,
  };
  for (const field of ["vidInforssub", "vidInforsdub", "vidInforsraw"] as const) {
    const raw = ep[field];
    if (raw && typeof raw === "object" && raw.vidPath) {
      result[field] = {
        vidResolution: raw.vidResolution || 0,
        vidPath: raw.vidPath.startsWith("http") ? raw.vidPath : `${CDN_BASE}/${raw.vidPath.replace(/^\//, "")}`,
        vidSize: raw.vidSize || 0,
        vidDuration: raw.vidDuration || 0,
      };
    }
  }
  return result;
}

export async function getEpisodeSources(
  showId: string,
  episodeString: string,
  translationType: string = "sub"
): Promise<StreamSource[]> {
  const variables = JSON.stringify({ showId, translationType, episodeString });
  const extensions = JSON.stringify({
    persistedQuery: { version: 1, sha256Hash: "d405d0edd690624b66baba3068e0edc3ac90f1597d898a1ec8db4e5c43c00fec" },
  });

  let data: any;
  try {
    const res = await fetch(
      `${API_URL}?variables=${encodeURIComponent(variables)}&extensions=${encodeURIComponent(extensions)}`,
      { headers: PERSISTED_HEADERS, next: { revalidate: 60 } }
    );
    if (!res.ok) throw new Error(`Persisted query failed: ${res.status}`);
    const json = await res.json();
    if (json.errors) throw new Error(`GraphQL error`);
    data = json.data;
  } catch {
    const query = `query ($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) { episode(showId: $showId, translationType: $translationType, episodeString: $episodeString) { episodeString sourceUrls } }`;
    data = await graphqlQuery(query, { showId, translationType, episodeString });
  }

  const episode = data?.episode;
  const tobeparsedData = data?.tobeparsed || episode?.tobeparsed;

  // If encrypted, delegate to server-side decrypt API route
  if (tobeparsedData && typeof tobeparsedData === "string") {
    try {
      // Use absolute URL for server-side compatibility
      const baseUrl = typeof window !== 'undefined' ? '' : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
      const decryptRes = await fetch(`${baseUrl}/api/anime/decrypt?tobeparsed=${encodeURIComponent(tobeparsedData)}`);
      if (decryptRes.ok) {
        const decrypted = await decryptRes.json();
        if (decrypted.sources?.length) return processSources(decrypted.sources);
      }
    } catch { /* fallthrough */ }
  }

  if (Array.isArray(episode?.sourceUrls)) {
    const sources = episode.sourceUrls.map((s: any) => ({
      sourceUrl: typeof s === "string" ? s : s.sourceUrl || "",
      sourceName: typeof s === "string" ? "Unknown" : s.sourceName || "Unknown",
      type: typeof s === "string" ? undefined : s.type,
    }));
    return processSources(sources);
  }

  return [];
}

function extractProvider(sourceName: string): string {
  const match = sourceName.match(/^([^:]+):\/\/(.+)/);
  if (match) return match[1].trim();
  const parts = sourceName.split("-");
  if (parts.length >= 2) return parts[0].trim();
  return sourceName.trim();
}

function processSources(allSources: Array<{ sourceUrl: string; sourceName: string; type?: string }>): StreamSource[] {
  const sources: StreamSource[] = [];
  for (const s of allSources) {
    let url = s.sourceUrl || "";
    if (!url) continue;
    if (url.startsWith("--") || url.startsWith("ap/")) url = decodeUrl(url);
    if (!url.startsWith("http")) continue;

    const sourceName = s.sourceName || "Unknown";
    const apiType = s.type || "";
    const provider = extractProvider(sourceName);

    let type: "iframe" | "hls" | "mp4";
    if (apiType === "iframe" || url.includes("/embed") || url.includes("/e/") ||
        url.includes("vibeplayer") || url.includes("otakuvid") || url.includes("megaplay") ||
        url.includes("mp4upload") || url.includes("vidnest") || url.includes("ok.ru") || url.includes("allanime.uns")) {
      type = "iframe";
    } else if (url.includes(".m3u8") || apiType === "hls" || url.includes("/clock.json") ||
               provider.includes("Default") || url.includes("wixmp")) {
      type = "hls";
    } else {
      type = "mp4";
    }

    let streamUrl = url;
    if (type === "hls" || type === "mp4") {
      streamUrl = wrapM3u8Url(url);
    }

    sources.push({ url: streamUrl, rawUrl: url, sourceName, type, provider });
  }
  return sources;
}

export async function getGenreAnime(genre: string, page = 1, limit = 26) {
  const query = `query { shows(search: { genres: ["${genre}"], sortBy: Trending }, limit: ${limit}, page: ${page}, translationType: sub, countryOrigin: JP) { edges { _id name englishName thumbnail score type status genres availableEpisodes season } } }`;
  const data = await graphqlQuery(query);
  return data?.shows?.edges || [];
}

export const GENRES = [
  "Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror",
  "Mystery", "Romance", "Sci-Fi", "Slice of Life", "Sports",
  "Supernatural", "Thriller", "Ecchi", "Harem", "Mecha",
  "Music", "Psychological", "School", "Seinen", "Shoujo",
  "Shounen", "Isekai", "Demons", "Military", "Space",
  "Historical", "Parody", "Samurai", "Vampire",
];

export async function getSchedule(page: number = 1) {
  const query = `query { shows(search: { sortBy: Latest_Update }, limit: 30, page: ${page}, translationType: sub, countryOrigin: JP) { edges { _id name englishName thumbnail score type status genres availableEpisodes season } } }`;
  const data = await graphqlQuery(query);
  return data?.shows?.edges || [];
}

export { decodeUrl, CDN_BASE };
