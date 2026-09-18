// AnimeX API Client — animex.one
// REWRITTEN 2026-08-12 — GraphQL schema changed
//
// Flow:
//   1. AniList ID → GraphQL searchAnime (graphql.animex.one) → anime id (= slug)
//   2. Slug → REST API (pp.animex.one/rest/api/servers) → sub/dub providers
//   3. Slug → REST API (pp.animex.one/rest/api/sources) → m3u8/mp4 stream URLs
//
// GraphQL schema (updated 2026-08):
//   searchAnime(query: String!, limit: Int) → AnimeConnection { items: [AnimeNode] }
//   AnimeNode { id (this IS the slug), anilistId, titles (JSON) }
//   anime(id: String!) → AnimeNode { id, titles }
//
// ALL streams go through our worker proxy (/p/{token}) because:
//   - mimi:  Needs Referer: animex.one
//   - yuki:  Needs Referer: megaplay.buzz
//   - kiwi:  Needs Origin/Referer: anidb.app, CF protected
//   - mochi: Needs Referer: animex.one
//   - kami:  Needs Referer header

const GRAPHQL_URL = "https://graphql.animex.one/graphql";

// Use pp.animex.one as the REST API host.
// This is AnimeX's OWN API endpoint. Shares backend with chad.anidap.lol
// but using the correct per-site endpoint ensures proper origin/referer.
const REST_BASE = "https://pp.animex.one/rest/api";

const UPSTREAM_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  // Use animex.one as Origin/Referer — matches what the AnimeX frontend sends
  // when calling pp.animex.one.
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
  kiwi: "Ace",
  mochi: "Sabo",
  mimi: "Dragon",
  yuki: "Garp",
  kami: "Roger",
  uwu: "Whitebeard",
  beep: "Marco",
  vee: "Jozu",
  miku: "Vista",
  neko: "Thatch",
  huzz: "Katakuri",
  koto: "Cracker",
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
// on VPS IPs, but curl has a different TLS fingerprint that Cloudflare doesn't
// block. curl resolves in 0.3-0.8s vs the old 3-10s double-fetch pattern.
//
// IMPORTANT: We use DYNAMIC import() for node:child_process so that this file
// can be imported from client-side code (unified-scraper.ts is imported by
// scraper-anime-page.tsx which is a client component). The dynamic import is
// only evaluated when curlFetch() actually runs at request time on the server.
//

/**
 * curl-based fetch — bypasses Cloudflare bot_detection by using curl's
 * different TLS fingerprint. Falls back to Node fetch if curl fails.
 */
async function curlFetch(
  url: string,
  options: RequestInit = {},
  timeoutMs = 6000
): Promise<Response> {
  const method = (options.method || "GET").toUpperCase();
  const headers = { ...UPSTREAM_HEADERS, ...(options.headers as Record<string, string> || {}) };

  try {
    const { execFile } = await import("node:child_process");
    const args: string[] = [
      "-s", "--max-time", String(Math.ceil(timeoutMs / 1000)),
      "--compressed", "-L", // follow redirects
    ];
    for (const [k, v] of Object.entries(headers)) {
      args.push("-H", `${k}: ${v}`);
    }
    if (method === "POST" && options.body) {
      const body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
      args.push("-X", "POST", "-H", "Content-Type: application/json", "-d", body);
    }
    args.push(url);

    const result = await new Promise<string>((resolve, reject) => {
      execFile("curl", args, { timeout: timeoutMs + 2000, maxBuffer: 2 * 1024 * 1024 }, (err, stdout) => {
        if (err) reject(err);
        else resolve(stdout);
      });
    });

    // Parse JSON response
    let jsonData: any;
    try { jsonData = JSON.parse(result); } catch { jsonData = null; }

    // Return a Response-like object
    const resp: any = {
      ok: true, status: 200, statusText: "OK",
      headers: new Headers({ "content-type": "application/json" }),
      async json() { return jsonData; },
      async text() { return result; },
    };
    return resp as Response;
  } catch {
    // curl failed — fall back to Node fetch
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, headers, signal: controller.signal, redirect: "follow" });
      clearTimeout(timeout);
      // Check for CF challenge (HTML instead of JSON)
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("text/html")) {
        // CF blocked — try worker proxy
        try {
          const WORKER_PROXY = process.env.NEXT_PUBLIC_PROXY_BASE || "https://api.luffytv.live";
          const proxyUrl = `${WORKER_PROXY}/proxy?url=${encodeURIComponent(url)}`;
          const c2 = new AbortController();
          const t2 = setTimeout(() => c2.abort(), timeoutMs);
          const proxyRes = await fetch(proxyUrl, { ...options, headers, signal: c2.signal, redirect: "follow" });
          clearTimeout(t2);
          return proxyRes;
        } catch {
          const errResp: any = {
            ok: false, status: 403, statusText: "Forbidden",
            headers: new Headers({ "content-type": "text/html" }),
            _body: "Cloudflare challenge page",
            async json() { return null; }, async text() { return this._body; },
          };
          return errResp as Response;
        }
      }
      return res;
    } catch (e: any) {
      const errResp: any = {
        ok: false, status: 502, statusText: "Bad Gateway",
        headers: new Headers(),
        _body: JSON.stringify({ error: e?.message || "fetch failed" }),
        async json() { try { return JSON.parse(this._body); } catch { return null; } },
        async text() { return this._body; },
      };
      return errResp as Response;
    } finally { clearTimeout(timeout); }
  }
}

/**
 * Fetch with timeout — uses curl first, falls back to Node fetch + proxy.
 * This is the primary fetch function for ALL AnimeX API calls.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 6000
): Promise<Response> {
  return curlFetch(url, options, timeoutMs);
}

// ─── Slug Mapping (AniList ID → AnimeX slug via GraphQL) ────────────────────
// Uses the NEW GraphQL schema (2026-08): searchAnime instead of GetAnime
// searchAnime(query: String!, limit: Int) → { items: [{ id, anilistId, titles }] }
// The `id` field IS the slug (e.g. "one-piece-p8k27")

// Cache for slug lookups (AniList ID → slug)
const slugCache = new Map<number, AnimexAnimeInfo | null>();
// Negative cache for failed lookups (prevents repeated failing requests)
const negCache = new Map<number, number>(); // anilistId → expire timestamp
const NEG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Cache for title→anilistId reverse lookups (used by searchAnime approach)
const titleToAnilistCache = new Map<string, number>();

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
    // STRATEGY 1: Direct anime query with slug (if we already have a cached slug)
    // Not typically used on first call, but useful for refresh

    // STRATEGY 2: Search by AniList ID using searchAnime
    // The GraphQL searchAnime requires query >= 3 chars and does text search,
    // not numeric matching. So searching "21" (2 chars) fails.
    // Instead, we fetch the anime title from AniList first, then search by title.
    // Fallback: if AniList is unreachable, try padded ID as last resort.
    let qStr: string | null = null;
    try {
      // Fetch title from AniList to use as search query
      const alRes = await fetchWithTimeout(
        `https://graphql.anilist.co/graphql`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: `query($id: Int!) { Media(id: $id, type: ANIME) { title { romaji english } } }`,
            variables: { id: anilistId },
          }),
        },
        4000,
      );
      if (alRes.ok) {
        const alData = await alRes.json();
        const title = alData?.data?.Media?.title;
        qStr = title?.english || title?.romaji || null;
      }
    } catch { /* AniList unreachable — fall through */ }

    // If no title, try padded ID (won't match well but avoids the 3-char error)
    if (!qStr) qStr = String(anilistId).padStart(3, "0");

    const searchRes = await fetchWithTimeout(GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `query($q: String!) { searchAnime(query: $q, limit: 10) { items { id anilistId titles } } }`,
        variables: { q: qStr },
      }),
    }, 8000);

    if (searchRes.ok) {
      const data = await searchRes.json();
      const items = data?.data?.searchAnime?.items || [];

      // Find exact match by anilistId
      const match = items.find((item: any) => item.anilistId === anilistId);

      if (match?.id) {
        const titles = match.titles || {};
        const info: AnimexAnimeInfo = {
          slug: match.id, // id IS the slug in the new schema
          anilistId,
          titleRomaji: titles["x-jat"] || titles.en || "",
          titleEnglish: titles.en || "",
        };
        slugCache.set(anilistId, info);
        return info;
      }
    }

    // STRATEGY 3: If search by ID failed, try the anime(id: String) query
    // with the AniList ID as string (some versions of the API support this)
    const directRes = await fetchWithTimeout(GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `query($id: String!) { anime(id: $id) { id titles } }`,
        variables: { id: String(anilistId) },
      }),
    }, 6000);

    if (directRes.ok) {
      const data = await directRes.json();
      const anime = data?.data?.anime;
      if (anime?.id) {
        const titles = anime.titles || {};
        const info: AnimexAnimeInfo = {
          slug: anime.id,
          anilistId,
          titleRomaji: titles["x-jat"] || titles.en || "",
          titleEnglish: titles.en || "",
        };
        slugCache.set(anilistId, info);
        return info;
      }
    }

    // No slug found — negative cache
    negCache.set(anilistId, Date.now() + NEG_CACHE_TTL);
    return null;
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

// ─── Fetch ALL providers in parallel (same pattern as AniDap) ────────────────
// This replaces the old mimi-only approach. All providers are fetched in
// parallel via Promise.allSettled, just like AniDap's fetchAllAniDapSources.
// Fast providers (mimi, beep, yuki) resolve in ~1-2s; slow ones (kiwi) in ~3-4s.
// Total time ≈ max(individual provider times).

export interface AnimexVerifiedResult {
  provider: string;
  type: "sub" | "dub";
  sources: AnimexSource[];
  tracks: Array<{ url: string; lang: string; label: string; kind: string }>;
  intro: { start: number; end: number } | null;
  outro: { start: number; end: number } | null;
  /** Best playable stream URL */
  streamUrl: string;
  /** Highest quality label, e.g. "1080p" */
  quality: string;
  /** Whether the stream is HLS (m3u8) or MP4 */
  isM3U8: boolean;
  isMP4: boolean;
  /** Whether subtitles are burned into the video (hardsub) */
  hardsub: boolean;
}

// Providers that serve SOFT SUB (subtitles as separate track, not burned in).
const ANIMEX_SOFTSUB = new Set(["beep", "yuki"]);

export async function fetchAllAnimexSources(
  anilistId: number,
  epNum: number,
  options?: { sub?: boolean; dub?: boolean; timeoutMs?: number }
): Promise<AnimexVerifiedResult[]> {
  // Step 1: Resolve AniList ID → slug
  const animeInfo = await animexGetAnime(anilistId);
  if (!animeInfo) {
    console.log(`[AnimeX] no slug for anilistId=${anilistId} — skipping`);
    return [];
  }
  const slug = animeInfo.slug;

  const wantSub = options?.sub ?? true;
  const wantDub = options?.dub ?? true;
  const timeoutMs = options?.timeoutMs ?? 8000;

  // Step 2: Discover available providers via /servers
  const serversData = await animexServers(slug, epNum);
  const subProviderIds: string[] = (serversData.subProviders || []).map((p: any) => p.id);
  const dubProviderIds: string[] = (serversData.dubProviders || []).map((p: any) => p.id);

  // Fallback: if /servers returned nothing, try the full priority list
  const subProviders = wantSub && subProviderIds.length > 0 ? subProviderIds : wantSub ? PROVIDER_PRIORITY : [];
  const dubProviders = wantDub && dubProviderIds.length > 0 ? dubProviderIds : wantDub ? PROVIDER_PRIORITY : [];

  // Step 3: Build job list
  const jobs: Array<{ provider: string; type: "sub" | "dub" }> = [];
  for (const p of subProviders) jobs.push({ provider: p, type: "sub" });
  for (const p of dubProviders) jobs.push({ provider: p, type: "dub" });

  console.log(`[AnimeX] ${slug} ep${epNum}: trying ${jobs.length} providers (${subProviders.length} sub + ${dubProviders.length} dub) in parallel`);

  // Step 4: Fetch ALL sources in parallel
  const results = await Promise.allSettled(
    jobs.map(async (job): Promise<AnimexVerifiedResult | null> => {
      const sourceData = await Promise.race([
        animexSources(slug, epNum, job.type, job.provider),
        new Promise<null>(r => setTimeout(() => r(null), timeoutMs)),
      ]);
      if (!sourceData?.sources?.length) return null;

      // Pick the best playable source (prefer m3u8, then mp4, skip DASH)
      const isHls = (s: AnimexSource) =>
        (s.type && s.type.includes("mpegurl")) || s.url.includes(".m3u8") || s.url.endsWith(".txt");
      const isMp4 = (s: AnimexSource) =>
        (s.type && s.type.includes("mp4")) || s.url.includes(".mp4");
      const isDash = (s: AnimexSource) =>
        (s.type && s.type.includes("dash")) || s.url.includes(".mpd");

      // Quality ranking
      const qRank = (q: string): number => {
        const m = (q || "").match(/(\d{3,4})p?/i);
        if (m) return parseInt(m[1], 10);
        if (/auto/i.test(q)) return 1;
        return 0;
      };

      const playable =
        sourceData.sources.filter(s => isHls(s) && !isDash(s)).sort((a, b) => qRank(b.quality) - qRank(a.quality))[0] ||
        sourceData.sources.filter(isMp4).sort((a, b) => qRank(b.quality) - qRank(a.quality))[0] ||
        sourceData.sources[0];

      if (!playable?.url || isDash(playable)) return null;

      const m3u8 = isHls(playable);
      const mp4 = isMp4(playable);

      // Parse intro/outro from chapters
      let intro: { start: number; end: number } | null = null;
      let outro: { start: number; end: number } | null = null;
      try {
        const { validateSkipTime } = await import("./episode-metadata");
        if (sourceData.intro) intro = validateSkipTime(sourceData.intro, "intro");
        if (sourceData.outro) outro = validateSkipTime(sourceData.outro, "outro");
      } catch {}

      // Process tracks
      const tracks = (sourceData.tracks || [])
        .filter((t: any) => t.kind === "captions" || t.kind === "subtitles")
        .map((t: any) => ({
          url: t.url,
          lang: t.lang || "en",
          label: t.label || t.lang || "English",
          kind: t.kind || "captions",
        }));

      return {
        provider: job.provider,
        type: job.type,
        sources: sourceData.sources,
        tracks,
        intro,
        outro,
        streamUrl: playable.url,
        quality: playable.quality || "auto",
        isM3U8: m3u8,
        isMP4: mp4,
        hardsub: !ANIMEX_SOFTSUB.has(job.provider),
      };
    })
  );

  const verified: AnimexVerifiedResult[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) verified.push(r.value);
  }

  console.log(`[AnimeX] ${verified.length}/${jobs.length} providers yielded playable streams`);
  return verified;
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
