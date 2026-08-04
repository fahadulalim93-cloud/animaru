/**
 * AnimePahe API Client — REWRITTEN 2026-07-14
 * ============================================
 *
 * Uses a Python scraper deployed on Render that bypasses Cloudflare
 * using cloudscraper. The scraper is at animepahe-scraper/app.py.
 *
 * Deploy the scraper:
 *   1. Push animepahe-scraper/ folder to GitHub
 *   2. Deploy on Render.com → New Web Service → connect repo
 *   3. Set ANIMEPAHE_SCRAPER_URL env var on Vercel to your Render URL
 *
 * Scraper endpoints:
 *   GET /search?q=               → search anime by title
 *   GET /anime/<session>/episodes → episode list
 *   GET /play/<session>/<ep>      → m3u8 + qualities + subtitles
 *   GET /health                   → status check
 *
 * AniList ID → anime_session resolution:
 *   1. Get anime title from AniList GraphQL
 *   2. Search on animepahe via scraper /search?q={title}
 *   3. Match by title (exact or fuzzy)
 *
 * Stream proxying:
 *   m3u8 URLs are on vault-XX.uwucdn.top / vault-XX.owocdn.top —
 *   require Referer: https://kwik.cx/. Our Worker proxy handles this
 *   via the CDN_REFERERS rules (kwik.cx → kwik.cx referer).
 *   Subtitle URLs go through /api/stream with the correct referer.
 */

import { wrapM3u8Url, wrapM3u8UrlWithReferer } from "./proxy";
import { validateSkipTime } from "./episode-metadata";

// ─── Config ──────────────────────────────────────────────────────────────────

const SCRAPER_URL = (
  process.env.ANIMEPAHE_SCRAPER_URL ||
  "https://luffytv-animepahe-scraper.onrender.com"
).replace(/\/$/, "");

const SCRAPER_TIMEOUT_MS = 10000;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AnimePaheSearchResult {
  title: string;
  session: string;  // anime session UUID
  id: number;       // animepahe anime ID
  poster: string;
  episodes: number;
  status: string;
  season: string;
  year: number;
  score: string;
}

export interface AnimePaheEpisode {
  episode: number;
  session: string;  // episode session (hex)
  title: string;
  thumbnail: string;
  duration: string;
  audio: string;
}

export interface AnimePaheSource {
  url: string;
  quality: string;
  audio: string;
  kwikUrl: string;
}

export interface AnimePaheSubtitle {
  url: string;
  label: string;
  lang: string;
}

export interface AnimePaheStreams {
  sources: AnimePaheSource[];
  subtitles: AnimePaheSubtitle[];
}

export interface AnimePaheVerifiedResult {
  provider: string;
  type: "sub" | "dub";
  streamUrl: string;
  quality: string;
  isM3U8: boolean;
  isMP4: boolean;
  hardsub: boolean;
  tracks: Array<{ url: string; lang: string; label: string }>;
  intro: { start: number; end: number } | null;
  outro: { start: number; end: number } | null;
}

// ─── Caches ──────────────────────────────────────────────────────────────────

const sessionCache = new Map<number, string | null>(); // anilistId → anime session
const episodeCache = new Map<string, AnimePaheEpisode[]>(); // session → episodes
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const cacheTimestamps = new Map<string, number>();

function isCacheFresh(key: string): boolean {
  const ts = cacheTimestamps.get(key);
  if (!ts) return false;
  return Date.now() - ts < CACHE_TTL;
}

// ─── Fetch helper ────────────────────────────────────────────────────────────

async function fetchFromScraper<T>(path: string, timeoutMs = SCRAPER_TIMEOUT_MS): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${SCRAPER_URL}${path}`, {
      headers: { "User-Agent": UA, "Accept": "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);
    if (!res.ok) {
      console.error(`[AnimePahe] ${path} → HTTP ${res.status}`);
      return null;
    }
    return await res.json() as T;
  } catch (err) {
    console.error(`[AnimePahe] ${path} error:`, err);
    return null;
  }
}

// ─── AniList ID → AnimePahe session ──────────────────────────────────────────

async function resolveSession(anilistId: number, title?: string): Promise<string | null> {
  const cacheKey = `session:${anilistId}`;
  if (sessionCache.has(anilistId) && isCacheFresh(cacheKey)) {
    return sessionCache.get(anilistId)!;
  }

  // Get title from AniList if not provided
  if (!title) {
    try {
      const res = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `query($id:Int){Media(id:$id,type:ANIME){title{english romaji}}}`,
          variables: { id: anilistId },
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        title = data?.data?.Media?.title?.english || data?.data?.Media?.title?.romaji || "";
      }
    } catch { /* ignore */ }
  }

  if (!title) {
    sessionCache.set(anilistId, null);
    cacheTimestamps.set(cacheKey, Date.now());
    return null;
  }

  // Search on animepahe
  const data = await fetchFromScraper<{ results: AnimePaheSearchResult[] }>(`/search?q=${encodeURIComponent(title)}`);
  if (!data?.results?.length) {
    sessionCache.set(anilistId, null);
    cacheTimestamps.set(cacheKey, Date.now());
    return null;
  }

  // Try to find exact match
  const titleLower = title.toLowerCase();
  const match = data.results.find(r => r.title.toLowerCase() === titleLower)
    || data.results.find(r => r.title.toLowerCase().includes(titleLower))
    || data.results[0];

  if (match?.session) {
    console.log(`[AnimePahe] anilistId=${anilistId} → session=${match.session} (${match.title})`);
    sessionCache.set(anilistId, match.session);
    cacheTimestamps.set(cacheKey, Date.now());
    return match.session;
  }

  sessionCache.set(anilistId, null);
  cacheTimestamps.set(cacheKey, Date.now());
  return null;
}

// ─── Get episodes for an anime ───────────────────────────────────────────────

export async function getEpisodes(anilistId: number, title?: string): Promise<AnimePaheEpisode[]> {
  const session = await resolveSession(anilistId, title);
  if (!session) return [];

  const cacheKey = `eps:${session}`;
  if (episodeCache.has(session) && isCacheFresh(cacheKey)) {
    return episodeCache.get(session)!;
  }

  const data = await fetchFromScraper<{ episodes: AnimePaheEpisode[]; last_page: number }>(
    `/anime/${session}/episodes?page=1`
  );

  if (!data?.episodes?.length) return [];

  // Fetch remaining pages if needed
  let allEpisodes = data.episodes;
  const lastPage = data.last_page || 1;
  for (let p = 2; p <= Math.min(lastPage, 5); p++) {
    const pageData = await fetchFromScraper<{ episodes: AnimePaheEpisode[] }>(
      `/anime/${session}/episodes?page=${p}`
    );
    if (pageData?.episodes) {
      allEpisodes = allEpisodes.concat(pageData.episodes);
    }
  }

  episodeCache.set(session, allEpisodes);
  cacheTimestamps.set(cacheKey, Date.now());
  return allEpisodes;
}

// ─── Get streams for an episode ──────────────────────────────────────────────

export async function getStreams(
  anilistId: number,
  epNum: number,
  title?: string,
): Promise<AnimePaheStreams | null> {
  const episodes = await getEpisodes(anilistId, title);
  if (!episodes.length) return null;

  // Find the episode by number
  const ep = episodes.find(e => e.episode === epNum) || episodes[0];
  if (!ep) return null;

  // Get the anime session
  const session = await resolveSession(anilistId, title);
  if (!session) return null;

  // Fetch playable streams
  const data = await fetchFromScraper<AnimePaheStreams>(
    `/play/${session}/${ep.session}`,
    15000
  );

  if (!data?.sources?.length) return null;
  return data;
}

// ─── Main: fetch ALL AnimePahe sources ───────────────────────────────────────

export async function fetchAnimePaheSources(
  anilistId: number,
  epNum: number,
  title?: string,
): Promise<AnimePaheVerifiedResult[]> {
  try {
    const streams = await getStreams(anilistId, epNum, title);
    if (!streams?.sources?.length) return [];

    const results: AnimePaheVerifiedResult[] = [];

    for (const src of streams.sources) {
      if (!src.url) continue;

      // Wrap m3u8 URL through the Worker proxy
      // The m3u8 is on vault-XX.uwucdn.top which needs Referer: https://kwik.cx/
      const streamUrl = wrapM3u8UrlWithReferer(src.url, "https://kwik.cx/");

      // Wrap subtitle URLs through /api/stream (for CORS + VTT conversion)
      const tracks = (streams.subtitles || []).map(sub => ({
        url: `/api/stream?url=${encodeURIComponent(sub.url)}&referer=${encodeURIComponent("https://kwik.cx/")}`,
        lang: sub.lang || "en",
        label: sub.label || "English",
      }));

      // Determine type based on audio
      const type: "sub" | "dub" = src.audio === "eng" ? "dub" : "sub";

      results.push({
        provider: `pahe-${src.quality}`,
        type,
        streamUrl,
        quality: src.quality,
        isM3U8: true,
        isMP4: false,
        hardsub: false,
        tracks,
        intro: null,
        outro: null,
      });
    }

    console.log(`[AnimePahe] ${results.length} sources for anilistId=${anilistId} ep${epNum}`);
    return results;
  } catch (err) {
    console.error(`[AnimePahe] fetchAnimePaheSources error:`, err);
    return [];
  }
}

// ─── Health check ────────────────────────────────────────────────────────────

export async function checkScraperHealth(): Promise<boolean> {
  const data = await fetchFromScraper<{ status: string }>("/health", 5000);
  return data?.status === "ok";
}
