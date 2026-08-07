/**
 * Kyren API Client
 * ----------------
 * Kyren (https://kyren.moe) is a Next.js anime streaming site with a public
 * API at kyren.moe/api (NOT api.kyren.moe — that subdomain is heavily
 * Cloudflare-protected). The same-origin API on kyren.moe works fine via
 * our Cloudflare Worker proxy (the worker sends proper browser headers
 * including Sec-CH-UA, Referer, Origin, etc., so kyren.moe's CF doesn't
 * challenge it).
 *
 * API shape:
 *   1. Search (by query):
 *      GET https://kyren.moe/api/anime/search?q={query}
 *      → { items: [{ id, idMal, slug, title, titleEnglish, titleRomaji, ... }] }
 *        Note: `id` IS the AniList ID (verified: One Piece = id 21 = AniList 21)
 *
 *   2. Episodes (by AniList ID):
 *      GET https://kyren.moe/api/anime/episodes/{anilistId}
 *      → { data: [{ number, title, titleJp, thumbnail, duration, aired, filler, recap }] }
 *
 *   3. Stream (by AniList ID + episode + title slug + server):
 *      GET https://kyren.moe/api/stream/{anilistId}/{epNum}?lang={sub|dub}&title={slug}&server={server}
 *      → {
 *          ok: true,
 *          sources: [
 *            {
 *              provider: "pahe"|"senshi"|"vidnest-direct"|"megaplay"|"megaplay-direct"|"vidnest"|"vidnest-pahe"|"tryembed"|"animeverse",
 *              url: "https://api.kyren.moe/v1/hls/m/{token}",  // HLS stream (proxied through kyren's CF Worker)
 *              language: "sub"|"dub",
 *              type: "hls"|"embed"|"mp4",
 *              quality: "1080p"|"720p"|"auto",
 *              isDub: bool
 *            }
 *          ],
 *          subtitles: [{ url, lang, label }]  // optional
 *        }
 *
 * The HLS stream URLs (api.kyren.moe/v1/hls/m/...) are wrapped through
 * our Cloudflare Worker proxy (token endpoint /p/{token}) because
 * api.kyren.moe is CF-protected. The worker sends the correct
 * Referer: https://kyren.moe/ header.
 *
 * IMPORTANT: As of 2026-07-13, only `senshi` and `megaplay-direct`
 * servers work reliably. `pahe`, `vidnest`, `vidnest-pahe` return
 * "AnimePahe entry not found" (Kyren's pahe backend is broken), and
 * `vidnest-direct` returns "upstream 403" (vidnest CDN is blocking).
 * See KYREN_HLS_SERVERS for the current working list.
 */

import { wrapM3u8Url, wrapM3u8UrlWithReferer } from "./proxy";

const KYREN_API = "https://kyren.moe/api";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const HEADERS: Record<string, string> = {
  "User-Agent": UA,
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Origin: "https://kyren.moe",
  Referer: "https://kyren.moe/",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
};

/**
 * Fetch a URL using our Cloudflare Worker proxy (legacy /proxy?url= endpoint).
 * Used for API JSON calls. Stream URLs use wrapKyrenStream() (token endpoint).
 */
const WORKER_BASE = process.env.NEXT_PUBLIC_PROXY_BASE || "https://luffytv-proxy.ggy892767.workers.dev";

async function workerFetchJson<T = any>(url: string, timeoutMs = 15000): Promise<T | null> {
  try {
    const wrapped = `${WORKER_BASE}/proxy?url=${encodeURIComponent(url)}&ref=${encodeURIComponent("https://kyren.moe/")}`;
    const res = await Promise.race([
      fetch(wrapped, { headers: { "Accept": "application/json" }, cache: "no-store" }),
      new Promise<Response | null>(r => setTimeout(() => r(null), timeoutMs)),
    ]);
    if (!res || !res.ok) return null;
    const text = await res.text();
    if (!text || text.startsWith("<!DOCTYPE") || text.startsWith("<html")) return null;
    return JSON.parse(text) as T;
  } catch (e: any) {
    console.error(`[Kyren] workerFetchJson failed for ${url.slice(0, 80)}:`, e?.message || e);
    return null;
  }
}

/**
 * Wrap a Kyren stream URL through the Worker proxy (token endpoint /p/{token}).
 * The worker rewrites m3u8 segment URLs automatically.
 */
function wrapKyrenStream(url: string): string {
  return wrapM3u8UrlWithReferer(url, "https://kyren.moe/");
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type KyrenServer =
  | "pahe"
  | "senshi"
  | "vidnest-direct"
  | "megaplay-direct"
  | "vidnest"
  | "vidnest-pahe";

/**
 * Working Kyren HLS servers.
 *
 * NOTE: As of 2026-07-13, Kyren's backend returns permanent errors for
 * pahe, vidnest, vidnest-pahe ("AnimePahe entry not found") and
 * vidnest-direct ("upstream 403"). These servers are broken UPSTREAM —
 * Kyren's own backend can't reach AnimePahe or vidnest's CDN.
 * We've removed them from the default list so we don't waste 4 broken
 * HTTP requests per episode load (was adding ~3-4s to instant-servers
 * resolution time).
 *
 * Only `senshi` and `megaplay-direct` work reliably. If Kyren fixes
 * pahe/vidnest upstream, re-add them here.
 */
export const KYREN_HLS_SERVERS: KyrenServer[] = [
  "senshi",
  "megaplay-direct",
];

export const KYREN_SERVER_NAMES: Record<KyrenServer, string> = {
  pahe: "Mihawk",
  senshi: "Crocodile",
  "vidnest-direct": "Doflamingo",
  "megaplay-direct": "Hancock",
  vidnest: "Kuma",
  "vidnest-pahe": "Moria",
};

export interface KyrenSearchItem {
  id: number;          // AniList ID
  idMal: number | null;
  slug: string;
  title: string;
  titleEnglish?: string;
  titleRomaji?: string;
  titleJp?: string;
  image?: string;
  bannerImage?: string;
  isAdult?: boolean;
  genres?: string[];
  synopsis?: string;
}

export interface KyrenSearchResponse {
  items: KyrenSearchItem[];
}

export interface KyrenEpisode {
  number: number;
  title: string;
  titleJp?: string;
  thumbnail?: string;
  duration?: number;
  aired?: string;
  filler?: boolean;
  recap?: boolean;
}

export interface KyrenEpisodesResponse {
  data: KyrenEpisode[];
}

export interface KyrenSource {
  provider: string;
  url: string;
  language: string;
  type: string;        // "hls" | "embed" | "mp4"
  quality: string;
  rawQuality?: string;
  isDub?: boolean;
}

export interface KyrenSubtitle {
  url: string;
  lang: string;
  label?: string;
}

export interface KyrenStreamResponse {
  ok: boolean;
  sources: KyrenSource[];
  subtitles?: KyrenSubtitle[];
  error?: string;
}

// ─── Search (returns items with AniList IDs) ──────────────────────────────────

const searchCache = new Map<string, KyrenSearchItem | null>();

export async function resolveKyrenAnime(
  anilistId: number,
  timeoutMs = 8000
): Promise<KyrenSearchItem | null> {
  const cacheKey = `id:${anilistId}`;
  if (searchCache.has(cacheKey)) return searchCache.get(cacheKey)!;

  // Kyren's search doesn't match by `id` field directly when we pass a number.
  // We need to search by the anime title instead. Use AniList GraphQL to get
  // the title, then search Kyren by that title.
  try {
    // Step 1: Get the anime title from AniList
    const anilistRes = await Promise.race([
      fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: "query($id:Int){Media(id:$id,type:ANIME){id title{romaji english} idMal}}",
          variables: { id: anilistId },
        }),
        cache: "no-store",
      }),
      new Promise<Response | null>(r => setTimeout(() => r(null), timeoutMs)),
    ]);
    if (!anilistRes || !anilistRes.ok) {
      searchCache.set(cacheKey, null);
      return null;
    }
    const anilistData = await anilistRes.json();
    const media = anilistData?.data?.Media;
    if (!media) {
      searchCache.set(cacheKey, null);
      return null;
    }
    const title = media.title?.english || media.title?.romaji;
    if (!title) {
      searchCache.set(cacheKey, null);
      return null;
    }

    // Step 2: Search Kyren by title (using curl to bypass CF challenge)
    const data = await workerFetchJson<KyrenSearchResponse>(
      `${KYREN_API}/anime/search?q=${encodeURIComponent(title)}`,
      timeoutMs
    );
    if (!data) {
      searchCache.set(cacheKey, null);
      return null;
    }
    const items = data?.items || [];
    // Find the item whose `id` matches the AniList ID (exact match)
    const match = items.find(i => i.id === anilistId);
    if (!match) {
      console.log(`[Kyren] anilistId=${anilistId} not found in ${items.length} results for "${title}"`);
      searchCache.set(cacheKey, null);
      return null;
    }
    console.log(`[Kyren] anilistId=${anilistId} → slug=${match.slug}, title=${match.titleEnglish || match.titleRomaji}`);
    searchCache.set(cacheKey, match);
    return match;
  } catch (e: any) {
    console.error(`[Kyren] resolveKyrenAnime failed:`, e?.message || e);
    searchCache.set(cacheKey, null);
    return null;
  }
}

// ─── Stream (returns HLS sources for a specific episode + server) ─────────────

export async function getKyrenStream(
  anilistId: number,
  epNum: number,
  type: "sub" | "dub",
  server: KyrenServer,
  titleSlug: string,
  timeoutMs = 10000
): Promise<KyrenStreamResponse | null> {
  // Kyren expects:
  //   /api/stream/{anilistId}/{epNum}?lang={sub|dub}&title={slug-without-id-prefix}&server={server}
  // The `title` param is the slug WITHOUT the leading "{id}-" prefix
  // (e.g. "one-piece" from slug "21-one-piece")
  const title = titleSlug.replace(/^\d+-/, "");
  const params = new URLSearchParams({
    lang: type,
    title,
    server,
  });
  const url = `${KYREN_API}/stream/${anilistId}/${epNum}?${params.toString()}`;

  try {
    const data = await workerFetchJson<KyrenStreamResponse>(url, timeoutMs);
    if (!data?.ok || !data?.sources?.length) return null;
    return data;
  } catch {
    return null;
  }
}

// ─── Verified result (pre-checked, ready to play) ─────────────────────────────

export interface KyrenVerifiedResult {
  server: KyrenServer;
  type: "sub" | "dub";
  /** HLS stream URL (api.kyren.moe/v1/hls/m/...) — plays directly, no proxy needed */
  streamUrl: string;
  /** Quality label, e.g. "1080p" */
  quality: string;
  isM3U8: boolean;
  isMP4: boolean;
  /** Subtitles (optional — kyren sometimes returns them) */
  tracks: KyrenSubtitle[];
}

/**
 * Fetch + verify Kyren streams for an anime episode.
 * Tries ALL HLS servers in parallel and returns the ones that work.
 *
 * The HLS URLs (api.kyren.moe/v1/hls/m/...) have permissive CORS headers
 * (access-control-allow-origin: *) and play DIRECTLY from the browser — no
 * proxy needed.
 */
export async function fetchAllKyrenSources(
  anilistId: number,
  epNum: number,
  options?: { sub?: boolean; dub?: boolean; timeoutMs?: number }
): Promise<KyrenVerifiedResult[]> {
  const wantSub = options?.sub ?? true;
  const wantDub = options?.dub ?? true;
  // Per-request timeout: 8s (was 10s — Kyren's API responds in <1s when
  // working, so 8s gives ample headroom for slow connections without
  // adding unnecessary delay to the instant-servers route).
  const timeoutMs = options?.timeoutMs ?? 8000;

  const anime = await resolveKyrenAnime(anilistId, timeoutMs);
  if (!anime) {
    console.log(`[Kyren] no anime found for anilistId=${anilistId} — skipping`);
    return [];
  }

  // Build job list: for each (type, server) pair, try to get a stream
  const jobs: Array<{ server: KyrenServer; type: "sub" | "dub" }> = [];
  if (wantSub) {
    for (const server of KYREN_HLS_SERVERS) jobs.push({ server, type: "sub" });
  }
  if (wantDub) {
    for (const server of KYREN_HLS_SERVERS) jobs.push({ server, type: "dub" });
  }

  console.log(`[Kyren] trying ${jobs.length} server×type combos for anilistId=${anilistId} ep${epNum}`);

  const results = await Promise.allSettled(
    jobs.map(async (job): Promise<KyrenVerifiedResult | null> => {
      const data = await getKyrenStream(anilistId, epNum, job.type, job.server, anime.slug, timeoutMs);
      if (!data?.sources?.length) return null;

      // Pick the first HLS source (skip embed + mp4)
      const hls = data.sources.find(s => s.type === "hls" && s.url);
      if (!hls) return null;

      return {
        server: job.server,
        type: job.type,
        streamUrl: wrapKyrenStream(hls.url),  // wrap through Worker proxy (CF-protected)
        quality: hls.quality || "auto",
        isM3U8: true,
        isMP4: false,
        tracks: data.subtitles || [],
      };
    })
  );

  const verified: KyrenVerifiedResult[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) verified.push(r.value);
  }

  console.log(`[Kyren] ${verified.length}/${jobs.length} server×type combos yielded playable HLS streams`);
  return verified;
}
