// AnimeX API Client — animex.one
//
// Based on the Python AnimexScraper — uses GraphQL for AniList ID mapping
// and REST API for episodes/servers/sources.
//
// Flow:
//   1. AniList ID → GraphQL (graphql.animex.one) → anime slug
//   2. Slug → REST API (pp.animex.one/rest/api/episodes) → episode list
//   3. Slug → REST API (pp.animex.one/rest/api/servers) → sub/dub providers
//   4. Slug → REST API (pp.animex.one/rest/api/sources) → m3u8/mp4 stream URLs
//
// ALL streams go through our HLS proxy (/api/animex/proxy) because:
//   - mimi:  Needs Referer: animex.one, PNG-wrapped TS segments
//   - yuki:  Needs Referer: megaplay.buzz, TS disguised as .jpg
//   - kiwi:  Needs Origin/Referer: anidb.app, Cloudflare protected
//   - mochi: Needs Referer: animex.one, MP4 with expiring tokens
//   - kami:  Needs Referer header
//   - uwu:   Provider not found (usually broken)

const GRAPHQL_URL = "https://graphql.animex.one/graphql";

// Use chad.anidap.lol as the REST API host instead of pp.animex.one.
// Both servers serve the EXACT same API (same backend, same data), but
// pp.animex.one returns {"error":"bot_detected","status":403} when called
// from Vercel's IPs, while chad.anidap.lol does not. The AniDap frontend
// (anidap.se) uses chad.anidap.lol exclusively — it's the same Cloudflare
// Worker but with a more permissive bot policy.
const REST_BASE = "https://chad.anidap.lol/rest/api";

const UPSTREAM_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  // Use anidap.se as Origin/Referer — matches what the AniDap frontend sends
  // when calling chad.anidap.lol. (animex.one would also work but anidap.se
  // is more consistent with the host change above.)
  Origin: "https://animex.one",
  Referer: "https://animex.one/",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-site",
};

// ─── Provider Config ──────────────────────────────────────────────────────────

// Complete provider list in priority order
// Updated: All providers mapped with correct headers, CDN patterns, and proxy requirements
//
// Provider (CB) Reference:
//   beep  — Hard sub, Default sub provider, CDN: bd.24stream.xyz, Multi-quality HLS
//   mimi  — Hard sub, Default dub provider, CDN: hawk.24stream.xyz, PNG-wrapped TS
//   vee   — Soft sub, DASH (.mpd), CDN: cdn.animeonsen.xyz
//   yuki  — Soft sub, Multi quality HLS, CDN: s2.cinewave2.site, TS as .jpg
//   miku  — Hard sub, Best quality HLS, CDN: sxic.oceancrestdigital.shop, .txt sub-playlists
//   neko  — Hard sub, Direct MP4, CDN: neko.yokai.cfd
//   huzz  — Hard sub, HLS, CDN: s2.vidhosters.com
//   mochi — Hard sub, MP4 with token, CDN: tools.fast4speed.rsvp
//   uwu   — Hard sub, HLS, Same CDN as miku
//   koto  — Hard sub, HLS, Same CDN as miku
//   kiwi  — Hard sub, Cloudflare-protected, CDN: anidb.app
//   kami  — Alt provider
const PROVIDER_PRIORITY = [
  "miku",  // Hard sub, Best Quality HLS, WORKS (allanime.uns.bio referer + mobile UA)
  "yuki",  // Soft sub, Multi quality HLS, WORKS (megaplay.buzz referer)
  "beep",  // Hard sub, Default sub, Multi-quality HLS
  "mimi",  // Hard sub, Default dub, PNG-wrapped TS (often CF-blocked)
  "vee",   // Soft sub, DASH manifest (needs DASH player)
  "mochi", // Hard sub, MP4 with expiring token
  "neko",  // Hard sub, Direct MP4 (animeverse.to referer + Firefox UA)
  "huzz",  // Hard sub, HLS (kem.clvd.xyz origin + Firefox UA)
  "uwu",   // Hard sub, HLS, Same CDN as miku
  "koto",  // Hard sub, HLS, Same CDN as miku
  "kiwi",  // Hard sub, Cloudflare-protected (anidb.app origin)
  "kami",  // Alt provider
];

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  kiwi: "K1",
  mochi: "K2",
  mimi: "K3",
  yuki: "K4",
  kami: "K5",
  uwu: "K6",
  beep: "K7",
  vee: "K8",
  miku: "K9",
  neko: "K10",
  huzz: "K11",
  koto: "K12",
};

const PROVIDER_TIPS: Record<string, string> = {
  miku: "Hard sub, Best Quality",
  yuki: "Soft sub, Multi quality + subs",
  vee: "Soft sub, DASH",
  beep: "Hard sub, Fast (Default sub)",
  mimi: "Hard sub, Fastest (Default dub)",
  mochi: "Hard sub, MP4",
  neko: "Hard sub, MP4 Direct",
  huzz: "Hard sub, HLS Alt",
  uwu: "Hard sub, HLS Alt",
  koto: "Hard sub, HLS Rare",
  kiwi: "Hard sub, CF-Protected",
  kami: "Alt provider",
};

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface AnimexAnimeInfo {
  slug: string;
  anilistId: number;
  titleRomaji: string;
  titleEnglish: string;
}

export interface AnimexEpisode {
  number: number;
  title?: string;
  isFiller?: boolean;
}

export interface AnimexProvider {
  id: string;
  tip?: string;
  default: boolean;
}

export interface AnimexServers {
  subProviders: AnimexProvider[];
  dubProviders: AnimexProvider[];
}

export interface AnimexSource {
  url: string;
  quality: string;
  type: string;
}

export interface AnimexWatchResult {
  sources: Array<{
    url: string;
    quality?: string;
    isM3U8: boolean;
    isMP4: boolean;
    sourceName: string;
    sourceType: "internal" | "external";
    provider: string;
    needsProxy: boolean;
    headers?: Record<string, string>;
  }>;
  subtitles: Array<{ url: string; lang: string; language: string }>;
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
  provider: string;
  triedProviders: string[];
  allProviders: string[];
}

// ─── Helper Functions ────────────────────────────────────────────────────────

function detectFormat(streamType: string, url: string): string {
  if (streamType.includes("mpegurl") || url.includes(".m3u8")) return "m3u8";
  if (streamType.includes("dash") || url.includes(".mpd")) return "mpd";
  if (streamType.includes("mp4") || url.includes(".mp4")) return "mp4";
  return streamType.split("/").pop() || "unknown";
}

// ─── Fetch Helpers ────────────────────────────────────────────────────────────
//
// We use curl (via child_process) for ALL Animex API calls — GraphQL + REST.
// Reason: Node's fetch / undici gets Cloudflare-challenged (403 bot_detected)
// when called from Vercel's IPs, but curl has a different TLS fingerprint that
// Cloudflare doesn't block. Same technique we use for Kyren.
//
// IMPORTANT: We use DYNAMIC import() for node:child_process so that this file
// can be imported from client-side code (unified-scraper.ts is imported by
// scraper-anime-page.tsx which is a client component). The dynamic import is
// only evaluated when curlFetch() actually runs at request time on the server.
//

/**
 * Fetch with timeout — uses standard fetch (NOT curl).
 *
 * chad.anidap.lol is NOT Cloudflare-protected, so regular fetch works fine.
 * The old curl-based approach failed on Vercel because:
 *   1. child_process.execFile("curl") may not be available on Vercel
 *   2. Spawning a process per request adds ~200ms overhead
 *   3. curl's TLS fingerprint isn't needed for chad.anidap.lol
 *
 * Only GraphQL (graphql.animex.one) might need CF bypass, but testing shows
 * it also works with regular fetch from Vercel's IPs.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 10000
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { ...UPSTREAM_HEADERS, ...(options.headers as Record<string, string>) };
    const res = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
      redirect: "follow",
    });
    // Check if we got a Cloudflare challenge page (HTML instead of JSON)
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("text/html")) {
      // Return a 403-like response
      const errResp: any = {
        ok: false,
        status: 403,
        statusText: "Forbidden",
        headers: new Headers({ "content-type": "text/html" }),
        _body: "Cloudflare challenge page",
        async json() { return null; },
        async text() { return this._body; },
      };
      return errResp as Response;
    }
    return res;
  } catch (e: any) {
    // Return a 502-like response on fetch failure
    const errResp: any = {
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      headers: new Headers(),
      _body: JSON.stringify({ error: e?.message || "fetch failed" }),
      async json() { try { return JSON.parse(this._body); } catch { return null; } },
      async text() { return this._body; },
    };
    return errResp as Response;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Slug Mapping (AniList ID → AnimeX slug via GraphQL) ────────────────────
// This replaces the old HTML scraping approach with a clean GraphQL query

// Cache for slug lookups (AniList ID → slug)
const slugCache = new Map<number, AnimexAnimeInfo | null>();
// Negative cache for failed lookups (prevents repeated failing requests)
const negCache = new Map<number, number>(); // anilistId → expire timestamp
const NEG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function animexGetAnime(
  anilistId: number
): Promise<AnimexAnimeInfo | null> {
  // parseInt never throws, returns NaN for non-numeric input
  const parsed = parseInt(String(anilistId));
  if (isNaN(parsed) || parsed <= 0) return null;
  anilistId = parsed;

  // Check positive cache
  const cached = slugCache.get(anilistId);
  if (cached !== undefined) return cached;

  // Check negative cache
  const negExpiry = negCache.get(anilistId);
  if (negExpiry && Date.now() < negExpiry) return null;

  try {
    // GraphQL query: resolve AniList ID → AnimeX slug
    const res = await fetchWithTimeout(GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "query($id:Int){anime(anilistId:$id){id anilistId titleEnglish titleRomaji}}",
        variables: { id: anilistId },
      }),
    }, 10000);

    if (!res.ok) {
      // Negative cache on failure
      negCache.set(anilistId, Date.now() + NEG_CACHE_TTL);
      return null;
    }

    const data = await res.json();
    const anime = data?.data?.anime;

    if (!anime || !anime.id) {
      // No slug found — negative cache
      negCache.set(anilistId, Date.now() + NEG_CACHE_TTL);
      slugCache.set(anilistId, null);
      return null;
    }

    const info: AnimexAnimeInfo = {
      slug: anime.id,
      anilistId,
      titleRomaji: anime.titleRomaji || "",
      titleEnglish: anime.titleEnglish || "",
    };

    slugCache.set(anilistId, info);
    return info;
  } catch {
    // Network error — negative cache with short TTL
    negCache.set(anilistId, Date.now() + NEG_CACHE_TTL);
    return null;
  }
}

// ─── Episodes ────────────────────────────────────────────────────────────────

const episodesCache = new Map<number, AnimexEpisode[]>();

export async function animexEpisodes(slug: string): Promise<AnimexEpisode[]> {
  try {
    const res = await fetchWithTimeout(
      `${REST_BASE}/episodes?id=${encodeURIComponent(slug)}`
    );
    if (!res.ok) return [];
    const data = await res.json();

    let rawEps: any[];
    if (Array.isArray(data)) {
      rawEps = data;
    } else if (data?.data) {
      rawEps = Array.isArray(data.data) ? data.data : [];
    } else if (data?.episodes) {
      rawEps = Array.isArray(data.episodes) ? data.episodes : [];
    } else {
      return [];
    }

    return rawEps.map((ep: any) => ({
      number: ep.number || 0,
      title: ep.title || ep.titles?.en || ep.titles?.["x-jat"] || ep.titles?.romaji || "",
      isFiller: ep.isFiller || false,
    }));
  } catch {
    return [];
  }
}

// ─── Servers ─────────────────────────────────────────────────────────────────

export async function animexServers(
  slug: string,
  epNum: number
): Promise<AnimexServers> {
  try {
    const res = await fetchWithTimeout(
      `${REST_BASE}/servers?id=${encodeURIComponent(slug)}&epNum=${epNum}`
    );
    if (!res.ok) return { subProviders: [], dubProviders: [] };
    const data = await res.json();

    if (data.subProviders || data.dubProviders) {
      return {
        subProviders: data.subProviders || [],
        dubProviders: data.dubProviders || [],
      };
    }
    return { subProviders: [], dubProviders: [] };
  } catch {
    return { subProviders: [], dubProviders: [] };
  }
}

// ─── Sources ─────────────────────────────────────────────────────────────────

export async function animexSources(
  slug: string,
  epNum: number,
  type: "sub" | "dub",
  providerId: string
): Promise<{
  sources: AnimexSource[];
  headers: Record<string, string>;
  tracks: Array<{ url: string; lang: string; label: string; kind: string }>;
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
} | null> {
  try {
    const res = await fetchWithTimeout(
      `${REST_BASE}/sources?id=${encodeURIComponent(slug)}&epNum=${epNum}&type=${type}&providerId=${encodeURIComponent(providerId)}`
    );
    if (!res.ok) return null;
    const data = await res.json();

    if (data?.error) return null;
    if (!data?.sources?.length) return null;

    return {
      sources: data.sources.map((s: any) => ({
        url: s.url || "",
        quality: s.quality || "auto",
        type: s.type || "",
      })),
      headers: data.headers || {},
      tracks: data.tracks || [],
      intro: data.intro || undefined,
      outro: data.outro || undefined,
    };
  } catch {
    return null;
  }
}

// ─── Watch (Auto-race providers) ────────────────────────────────────────────

export async function animexWatch(
  anilistId: number,
  episodeNum: number,
  translationType: "sub" | "dub",
  requestedProvider?: string
): Promise<AnimexWatchResult> {
  // Step 1: Resolve AniList ID → slug (via GraphQL)
  const animeInfo = await animexGetAnime(anilistId);
  if (!animeInfo) {
    return {
      sources: [],
      subtitles: [],
      provider: requestedProvider || "",
      triedProviders: [],
      allProviders: [],
    };
  }

  const slug = animeInfo.slug;

  // Step 2: Get servers for this episode
  const servers = await animexServers(slug, episodeNum);
  const providers =
    translationType === "dub"
      ? servers.dubProviders
      : servers.subProviders;

  if (providers.length === 0) {
    return {
      sources: [],
      subtitles: [],
      provider: "",
      triedProviders: [],
      allProviders: [],
    };
  }

  // Step 3: Build provider list (requested first, then priority order)
  const providerIds = providers.map((p) => p.id);
  let providersToTry: string[] = [];

  if (requestedProvider && providerIds.includes(requestedProvider)) {
    providersToTry = [
      requestedProvider,
      ...PROVIDER_PRIORITY.filter(
        (p) => p !== requestedProvider && providerIds.includes(p)
      ),
    ];
  } else {
    providersToTry = PROVIDER_PRIORITY.filter((p) => providerIds.includes(p));
  }
  // Add any remaining providers not in priority list
  for (const p of providerIds) {
    if (!providersToTry.includes(p)) providersToTry.push(p);
  }

  // Step 4: Try providers in order (sequential, not parallel — avoid rate limiting)
  for (const providerId of providersToTry) {
    const sourceData = await animexSources(slug, episodeNum, translationType, providerId);
    if (!sourceData || sourceData.sources.length === 0) continue;

    const { sources, headers, tracks, intro, outro } = sourceData;
    const displayName = getProviderDisplayName(providerId);

    const normalizedSources: AnimexWatchResult["sources"] = [];

    for (const s of sources) {
      const format = detectFormat(s.type, s.url);
      const isM3U8 = format === "m3u8" || s.url.includes(".m3u8") || (s.url.includes(".txt") && s.type?.includes("mpegurl"));
      const isMP4 = format === "mp4" || s.url.includes(".mp4");
      const isDASH = format === "mpd" || s.url.includes(".mpd");

      // Skip DASH — we don't have a DASH player yet
      if (isDASH) continue;

      normalizedSources.push({
        url: s.url,
        quality: s.quality || (isM3U8 ? "Auto" : "Default"),
        isM3U8,
        isMP4,
        sourceName: `${displayName} ${s.quality || format}`,
        sourceType: "internal" as const,
        provider: providerId,
        needsProxy: true, // ALL providers need proxy
        headers: Object.keys(headers).length > 0 ? headers : undefined,
      });
    }

    // Build subtitles from tracks
    const subtitles: Array<{ url: string; lang: string; language: string }> = [];
    if (tracks && tracks.length > 0) {
      for (const t of tracks) {
        if (t.kind === "captions" || t.kind === "subtitles") {
          subtitles.push({
            url: t.url,
            lang: t.lang || "en",
            language: t.label || t.lang || "English",
          });
        }
      }
    }

    // Build intro/outro
    let introResult: { start: number; end: number } | undefined;
    let outroResult: { start: number; end: number } | undefined;
    if (intro) introResult = intro;
    if (outro) outroResult = outro;

    if (normalizedSources.length > 0) {
      return {
        sources: normalizedSources,
        subtitles,
        intro: introResult,
        outro: outroResult,
        provider: providerId,
        triedProviders: providersToTry.slice(0, providersToTry.indexOf(providerId) + 1),
        allProviders: providersToTry,
      };
    }
  }

  return {
    sources: [],
    subtitles: [],
    provider: requestedProvider || "",
    triedProviders: providersToTry,
    allProviders: providersToTry,
  };
}

// ─── Exports ────────────────────────────────────────────────────────────────────

export const ANIMEX_PROVIDERS = PROVIDER_PRIORITY;
export type AnimexProviderId = (typeof PROVIDER_PRIORITY)[number];

export function getProviderDisplayName(provider: string): string {
  return (
    PROVIDER_DISPLAY_NAMES[provider] ||
    provider.charAt(0).toUpperCase() + provider.slice(1)
  );
}

export function getProviderTip(provider: string): string {
  return PROVIDER_TIPS[provider] || "";
}

export function getProviderPriority(): string[] {
  return [...PROVIDER_PRIORITY];
}
