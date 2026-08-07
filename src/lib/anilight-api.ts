/**
 * AniLight API Client
 * -------------------
 * AniLight (https://anilight.live) is a public anime streaming aggregator.
 * Its API at api.anilight.live is FULLY OPEN (no auth, no rate limit) and
 * returns direct m3u8 stream URLs that work without proxying.
 *
 * API shape:
 *   1. Search (by query, returns AniList + MAL IDs):
 *      GET https://api.anilight.live/api/search?q={query}
 *      → [{ id, slug, anilistId, idMal, title{romaji,english,native}, coverImage, ... }]
 *
 *   2. Watch (by MAL ID — AniLight does NOT accept AniList IDs):
 *      GET https://api.anilight.live/api/watch/mal?id={malId}&epNum={n}
 *      → {
 *          hostBase: "https://nekostream.site",
 *          stream: {
 *            sub: {
 *              success: true,
 *              playerUrl: "https://mewcdn.online/player/plyr.php#...",
 *              originalMasterUrl: "https://vibeplayer.site/public/stream/{hash}/master.m3u8",
 *              masterUrl: "https://nanobyte.bigdreamsmalldih.site/public/stream/{hash}/master.m3u8",
 *              qualities: [
 *                { quality: "360p",  url: "https://nanobyte.bigdreamsmalldih.site/.../360.m3u8" },
 *                { quality: "720p",  url: "https://nanobyte.bigdreamsmalldih.site/.../720.m3u8" },
 *                { quality: "1080p", url: "https://nanobyte.bigdreamsmalldih.site/.../1080.m3u8" }
 *              ],
 *              headers: { Referer: "https://kwik.cx/" }
 *            },
 *            dub: { ... same shape, or { success: false } if no dub }
 *          },
 *          tracks: [
 *            { id, url, kind, lang, label, default }
 *          ]
 *        }
 *
 * Stream CDNs (vibeplayer.site, nanobyte.bigdreamsmalldih.site) are served by
 * ESA (not Cloudflare) and return valid m3u8 with no bot protection — verified
 * to work DIRECTLY from Vercel and from the browser with no proxy.
 *
 * Note: AniLight uses MAL IDs for the watch endpoint. We resolve
 * AniList → MAL via the AniList GraphQL API.
 */

const ANILIGHT_API = "https://api.anilight.live/api";
const ANILIST_GRAPHQL = "https://graphql.anilist.co";

import { wrapStreamUrl, wrapM3u8Url } from "./proxy";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const HEADERS: Record<string, string> = {
  "User-Agent": UA,
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
};

// ─── Worker proxy helper ────────────────────────────────────────────────────
// AniLight's API is Cloudflare-protected — direct fetch from Vercel IPs gets
// the "Just a moment..." CF challenge page instead of JSON.
// Route ALL AniLight API calls through our Cloudflare Worker, which runs on
// Cloudflare's own network and bypasses the challenge.
//
// Fallback to the known worker URL if NEXT_PUBLIC_PROXY_BASE is not set
// (e.g. in local dev where .env doesn't have it).
const WORKER_BASE = process.env.NEXT_PUBLIC_PROXY_BASE || "https://luffytv-proxy.ggy892767.workers.dev";

function workerWrap(url: string): string {
  return `${WORKER_BASE}/proxy?url=${encodeURIComponent(url)}&ref=${encodeURIComponent("https://anilight.live/")}`;
}

// ─── m3u8 verification ──────────────────────────────────────────────────────
// Fetch the first few bytes of the proxied m3u8 URL and check if it starts
// with #EXTM3U. If the CDN is down, the proxy returns a Cloudflare error page
// (HTML) which does NOT start with #EXTM3U — so we filter it out.
async function verifyM3u8Playable(proxiedUrl: string, timeoutMs = 3000): Promise<boolean> {
  try {
    const res = await Promise.race([
      fetch(proxiedUrl, { headers: HEADERS, cache: "no-store" }),
      new Promise<Response | null>(r => setTimeout(() => r(null), timeoutMs)),
    ]);
    if (!res || !res.ok) return false;
    const text = await res.text();
    // Valid m3u8 must start with #EXTM3U (after any whitespace/BOM)
    const trimmed = text.trimStart().replace(/^\uFEFF/, "");
    return trimmed.startsWith("#EXTM3U");
  } catch {
    return false;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AniLightSearchResult {
  id: number;
  slug: string;
  anilistId: number;
  idMal: number | null;
  title: { romaji?: string; english?: string; native?: string };
  coverImage?: { large?: string; medium?: string; color?: string };
  coverImageAnilist?: string;
  bannerImage?: string;
  isAdult?: boolean;
  genres?: string[];
  synopsis?: string;
  [k: string]: any;
}

export interface AniLightQuality {
  quality: string; // "360p", "720p", "1080p"
  url: string;
}

export interface AniLightStreamSide {
  success: boolean;
  playerUrl?: string;
  originalMasterUrl?: string;
  masterUrl?: string;
  qualities?: AniLightQuality[];
  headers?: Record<string, string>;
}

export interface AniLightTrack {
  id: string;
  url: string;
  kind: string;
  lang: string;
  label: string;
  default?: boolean;
}

export interface AniLightWatchResponse {
  hostBase: string;
  download: { sub: any; dub: any };
  stream: {
    sub: AniLightStreamSide;
    dub: AniLightStreamSide;
  };
  tracks: AniLightTrack[] | null;
}

// ─── AniList ID → MAL ID resolver (with cache) ────────────────────────────────

const anilistToMalCache = new Map<number, number | null>();

export async function resolveMalId(anilistId: number): Promise<number | null> {
  if (anilistToMalCache.has(anilistId)) return anilistToMalCache.get(anilistId)!;

  try {
    const res = await fetch(ANILIST_GRAPHQL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({
        query: "query($id:Int){Media(id:$id,type:ANIME){id idMal}}",
        variables: { id: anilistId },
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      anilistToMalCache.set(anilistId, null);
      return null;
    }
    const data = await res.json();
    const malId = data?.data?.Media?.idMal;
    if (!malId) {
      console.log(`[AniLight] anilistId=${anilistId} has no MAL ID`);
      anilistToMalCache.set(anilistId, null);
      return null;
    }
    console.log(`[AniLight] anilistId=${anilistId} → malId=${malId}`);
    anilistToMalCache.set(anilistId, malId);
    return malId;
  } catch (e: any) {
    console.error(`[AniLight] resolveMalId failed:`, e?.message || e);
    anilistToMalCache.set(anilistId, null);
    return null;
  }
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function searchAniLight(query: string): Promise<AniLightSearchResult[]> {
  try {
    const res = await fetch(
      workerWrap(`${ANILIGHT_API}/search?q=${encodeURIComponent(query)}`),
      { headers: HEADERS, cache: "no-store" }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

// ─── AniList ID → AniLight slug resolver (with cache) ────────────────────────

const slugCache = new Map<number, { slug: string; anilightId: number } | null>();

/**
 * Resolve AniList ID → AniLight slug + internal ID.
 * Uses AniList GraphQL to get the English title, then searches AniLight.
 */
export async function resolveAniLightSlug(anilistId: number): Promise<{ slug: string; anilightId: number } | null> {
  if (slugCache.has(anilistId)) return slugCache.get(anilistId)!;

  try {
    // Step 1: Get anime title from AniList
    const res = await fetch(ANILIST_GRAPHQL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({
        query: `query($id:Int){Media(id:$id,type:ANIME){id title{english romaji native}}}`,
        variables: { id: anilistId },
      }),
    });
    if (!res.ok) { slugCache.set(anilistId, null); return null; }
    const data = await res.json();
    const title = data?.data?.Media?.title?.english || data?.data?.Media?.title?.romaji;
    if (!title) { slugCache.set(anilistId, null); return null; }

    // Step 2: Search AniLight by title
    const results = await searchAniLight(title);
    const match = results.find(r => r.anilistId === anilistId) || results[0];
    if (!match?.slug || !match?.id) { slugCache.set(anilistId, null); return null; }

    const result = { slug: match.slug, anilightId: match.id };
    slugCache.set(anilistId, result);
    console.log(`[AniLight] anilistId=${anilistId} → slug=${result.slug}, anilightId=${result.anilightId}`);
    return result;
  } catch {
    slugCache.set(anilistId, null);
    return null;
  }
}

// ─── Watch by slug (returns episode list + server providers) ─────────────────

export interface AniLightWatchBySlugResponse {
  id: number;
  episodes: Array<{
    number: number;
    title: string;
    embed_url?: { sub?: string; dub?: string };
  }>;
  servers: {
    subProviders: Array<{ id: string; tip: string; default: boolean }>;
    dubProviders: Array<{ id: string; tip: string; default: boolean }>;
  };
  nextAiringEpisode?: any;
}

/**
 * Method 1: Fetch watch data by slug.
 * Returns the AniLight internal ID + episode list + server provider IDs.
 * Use the internal ID + provider IDs with /api/sources to get stream URLs.
 */
export async function getAniLightWatchBySlug(
  slug: string,
  timeoutMs = 8000
): Promise<AniLightWatchBySlugResponse | null> {
  const url = `${ANILIGHT_API}/watch/${slug}`;
  try {
    const res = await Promise.race([
      fetch(workerWrap(url), { headers: HEADERS, cache: "no-store" }),
      new Promise<Response | null>(r => setTimeout(() => r(null), timeoutMs)),
    ]);
    if (!res || !res.ok) return null;
    return await res.json() as AniLightWatchBySlugResponse;
  } catch {
    return null;
  }
}

// ─── Watch (returns streams + tracks for a specific episode) ──────────────────

export async function getAniLightWatch(
  malId: number,
  epNum: number,
  timeoutMs = 8000
): Promise<AniLightWatchResponse | null> {
  const url = `${ANILIGHT_API}/watch/mal?id=${malId}&epNum=${epNum}`;
  const wrapped = workerWrap(url);
  try {
    const res = await Promise.race([
      fetch(wrapped, { headers: HEADERS, cache: "no-store" }),
      new Promise<Response | null>(r => setTimeout(() => r(null), timeoutMs)),
    ]);
    if (!res || !res.ok) return null;
    return await res.json() as AniLightWatchResponse;
  } catch {
    return null;
  }
}

// ─── Verified result (pre-checked, ready to play) ─────────────────────────────

export interface AniLightVerifiedResult {
  type: "sub" | "dub";
  /** Best playable stream URL — uses nanobyte.bigdreamsmalldih.site (ESA CDN, no proxy needed) */
  streamUrl: string;
  /** Highest quality label, e.g. "1080p" */
  quality: string;
  /** Whether the stream is HLS (m3u8) — always true for AniLight */
  isM3U8: boolean;
  isMP4: boolean;
  /** WebVTT subtitle tracks (softsub) */
  tracks: AniLightTrack[];
  /** All available qualities (360p, 720p, 1080p) */
  qualities: AniLightQuality[];
}

// ─── Death Note server names (AniLight's server IDs) ─────────────────────────
//
// AniLight has hidden server providers using Death Note character names.
// Each returns a DIFFERENT stream URL (different CDN, different quality).
// Discovered via the /api/sources endpoint:
//   GET /api/sources?id={anilistId}&epNum={n}&type={sub|dub}&providerId={name}
//
// Servers and their characteristics (from testing):
//   light  → vibeplayer.site (HLS, hard sub)
//   near   → hls.anidb.app (HLS, hard sub)
//   ryu    → tools.fast4speed.rsvp (HLS, hard sub)
//   misa   → s1.streamzone1.site (HLS, soft sub + VTT tracks)
//   kiwi   → kwik.cx (HLS, hard sub)
//   meg    → embed (iframe, skip)
//   misora → cdn.mewstream.buzz (HLS, hard sub)
//   raye   → cdn.animex.su (HLS, hard sub)
//   rem    → vibeplayer.site (HLS, soft sub + VTT tracks)
//
export const ANILIGHT_SERVERS = [
  "light", "near", "ryu", "misa", "kiwi", "misora", "raye", "rem",
] as const;

export type AniLightServer = typeof ANILIGHT_SERVERS[number];

export const ANILIGHT_SERVER_NAMES: Record<string, string> = {
  light: "Weevil", near: "Perona", ryu: "Enel", misa: "Magellan",
  kiwi: "Buggy", misora: "Caesar", raye: "Vergo", rem: "Monet",
};

// ─── Per-server source fetch (via /api/sources) ──────────────────────────────

export interface AniLightServerSource {
  url: string;
  quality: string;
  type: string;
  server?: string;
}

export interface AniLightServerResponse {
  sources: AniLightServerSource[];
  tracks?: AniLightTrack[] | null;
  audio?: any;
  chapters?: Array<{ title: string; start: number; end: number }> | null;
  error?: string;
}

/**
 * Fetch sources from a specific AniLight server (Death Note name).
 * Uses the /api/sources endpoint (different from /api/watch/mal).
 *
 * @param anilightId  AniLight INTERNAL ID (from /api/watch/{slug} response, NOT AniList ID)
 * @param epNum       Episode number
 * @param type        "sub" or "dub"
 * @param server      Server provider ID (e.g. "light", "misa", "near", "ryu")
 */
export async function getAniLightServerSources(
  anilightId: number,
  epNum: number,
  type: "sub" | "dub",
  server: string,
  timeoutMs = 8000
): Promise<AniLightServerResponse | null> {
  const url = `${ANILIGHT_API}/sources?id=${anilightId}&epNum=${epNum}&type=${type}&providerId=${server}`;
  try {
    const res = await Promise.race([
      fetch(workerWrap(url), { headers: HEADERS, cache: "no-store" }),
      new Promise<Response | null>(r => setTimeout(() => r(null), timeoutMs)),
    ]);
    if (!res || !res.ok) return null;
    const data = await res.json() as AniLightServerResponse;
    if (data?.error || !data?.sources?.length) return null;
    return data;
  } catch {
    return null;
  }
}

// ─── Main: fetch ALL AniLight servers (Death Note names + quality variants) ──

export interface AniLightVerifiedResult {
  /** Server name — either a Death Note name (light, near, ryu, etc.) or "1080p"/"720p"/"360p" */
  server: string;
  type: "sub" | "dub";
  /** Stream URL — may need proxy depending on CDN */
  streamUrl: string;
  /** Quality label */
  quality: string;
  isM3U8: boolean;
  isMP4: boolean;
  /** Whether this is hard sub (subs burned in) or soft sub (VTT tracks) */
  hardsub: boolean;
  /** WebVTT subtitle tracks (only for soft sub servers like misa/rem) */
  tracks: AniLightTrack[];
}

/**
 * Fetch ALL AniLight servers for an anime episode.
 *
 * Uses BOTH methods the user described:
 *
 * METHOD 1 (by slug):
 *   1. Resolve AniList ID → AniLight slug + internal ID (via /api/search)
 *   2. Call /api/watch/{slug} → get episode list + server provider IDs
 *      (subProviders + dubProviders — each has {id, tip, default})
 *   3. For each provider ID, call /api/sources?id={anilightId}&epNum={ep}&type={sub|dub}&providerId={id}
 *      → returns { sources: [{url, quality, type}], tracks, chapters }
 *
 * METHOD 2 (by MAL ID):
 *   1. Resolve AniList ID → MAL ID (via AniList GraphQL)
 *   2. Call /api/watch/mal?id={malId}&epNum={ep}
 *      → returns { stream: { sub: { qualities: [{quality, url}] }, dub: {...} }, tracks }
 *      (multi-quality streams from nanobyte.bigdreamsmalldih.site — ESA CDN, plays directly)
 *      (also returns captions/subtitles in tracks field)
 *
 * Both methods run in parallel. Results are merged — quality variants from Method 2
 * + Death Note servers from Method 1.
 */
export async function fetchAniLightSources(
  anilistId: number,
  epNum: number,
  options?: { sub?: boolean; dub?: boolean; timeoutMs?: number }
): Promise<AniLightVerifiedResult[]> {
  const wantSub = options?.sub ?? true;
  const wantDub = options?.dub ?? true;
  const timeoutMs = options?.timeoutMs ?? 8000;

  const verified: AniLightVerifiedResult[] = [];

  // ─── Run Method 1 (by slug) + Method 2 (by MAL ID) in parallel ────────────
  const [slugResult, malResult] = await Promise.allSettled([
    // Method 1: resolve slug + fetch server list + fetch sources for each server
    (async () => {
      const slugInfo = await resolveAniLightSlug(anilistId);
      if (!slugInfo) return null;
      const watchData = await getAniLightWatchBySlug(slugInfo.slug, timeoutMs);
      if (!watchData) return null;
      return { slugInfo, watchData };
    })(),
    // Method 2: resolve MAL ID + fetch quality variants
    (async () => {
      const malId = await resolveMalId(anilistId);
      if (!malId) return null;
      const watchData = await getAniLightWatch(malId, epNum, timeoutMs);
      return watchData;
    })(),
  ]);

  // ─── Method 2 results: quality variants (1080p/720p/360p) ─────────────────
  let qualityCount = 0;
  if (malResult.status === "fulfilled" && malResult.value?.stream) {
    const watchData = malResult.value;
    const tracks = (watchData.tracks || []).filter(t => t?.url);

    const collectQualities = async (side: AniLightStreamSide, type: "sub" | "dub") => {
      if (!side?.success || !side.qualities?.length) return;
      // Verify ALL qualities in PARALLEL (not sequential) to save time
      const checks = side.qualities.filter(q => q.url).map(async (q) => {
        const wrappedUrl = wrapM3u8Url(q.url);
        const isValid = await verifyM3u8Playable(wrappedUrl, 3000);
        if (!isValid) {
          console.log(`[AniLight] Quality ${q.quality} (${type}) — m3u8 not playable, skipping`);
          return null;
        }
        return {
          server: q.quality,
          type,
          streamUrl: wrappedUrl,
          quality: q.quality,
          isM3U8: true,
          isMP4: false,
          hardsub: false,
          tracks, qualities: [] as any,
        };
      });
      const results = await Promise.allSettled(checks);
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) {
          verified.push(r.value);
          qualityCount++;
        }
      }
    };

    if (wantSub) await collectQualities(watchData.stream.sub, "sub");
    if (wantDub) await collectQualities(watchData.stream.dub, "dub");
    console.log(`[AniLight] Method 2 (MAL): ${qualityCount} quality variants`);
  }

  // ─── Method 1 results: Death Note servers (light, misa, near, etc.) ───────
  let deathNoteCount = 0;
  if (slugResult.status === "fulfilled" && slugResult.value) {
    const { slugInfo, watchData } = slugResult.value;

    // Build job list from the DYNAMIC server list returned by /api/watch/{slug}
    // (instead of the old hardcoded ANILIGHT_SERVERS list)
    const jobs: Array<{ server: string; type: "sub" | "dub" }> = [];
    if (wantSub) {
      for (const p of (watchData.servers?.subProviders || [])) {
        jobs.push({ server: p.id, type: "sub" });
      }
    }
    if (wantDub) {
      for (const p of (watchData.servers?.dubProviders || [])) {
        jobs.push({ server: p.id, type: "dub" });
      }
    }

    console.log(`[AniLight] Method 1 (slug): ${slugInfo.slug} anilightId=${slugInfo.anilightId} — ${jobs.length} server×type combos`);

    const results = await Promise.allSettled(
      jobs.map(async (job): Promise<AniLightVerifiedResult | null> => {
        // Use the AniLight INTERNAL ID (not AniList ID) for /api/sources
        const data = await getAniLightServerSources(slugInfo.anilightId, epNum, job.type, job.server, timeoutMs);
        if (!data?.sources?.length) return null;

        const source = data.sources[0];
        if (!source?.url) return null;

        const isHls = source.type?.includes("mpegurl") || source.url.includes(".m3u8");
        const isMp4 = source.type?.includes("mp4") || source.url.includes(".mp4");

        // Determine hardsub: servers with VTT tracks are soft sub
        const hasTracks = (data.tracks || []).length > 0;
        const hardsub = !hasTracks;

        // Route the DIRECT stream URL through our proxy
        const streamUrl = wrapStreamUrl(source.url);

        // Verify the m3u8 is actually playable (not a Cloudflare error page)
        if (isHls) {
          const isValid = await verifyM3u8Playable(streamUrl, 3000);
          if (!isValid) {
            console.log(`[AniLight] Server ${job.server} (${job.type}) — m3u8 not playable, skipping`);
            return null;
          }
        }

        const tracks = (data.tracks || []).filter(t => t?.url);

        return {
          server: job.server,
          type: job.type,
          streamUrl,
          quality: source.quality || "auto",
          isM3U8: isHls,
          isMP4: isMp4,
          hardsub,
          tracks, qualities: [] as any,
        };
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        verified.push(r.value);
        deathNoteCount++;
      }
    }
  }

  console.log(`[AniLight] ${verified.length} total servers (${qualityCount} quality + ${deathNoteCount} Death Note)`);
  return verified;
}
