/**
 * Animetsu Scraper API Client
 * ---------------------------
 * Uses the animetsu-scraper-jade.vercel.app API to fetch stream sources
 * from animetsu.live.
 *
 * API flow:
 *   1. Resolve AniList ID → Animetsu ID:
 *      GET /api/scrape/animetsu-id?anilist={anilistId}
 *      → { animetsuId, matchedTitle, ... }
 *   2. Get sources:
 *      GET /api/scrape/sources?id={animetsuId}&ep={epNum}&server={kite|dio|sage|meg}&type={sub|dub}
 *      → { sources: [{ url, type, quality, isMaster }], subtitles, skips }
 *
 * Providers: kite, dio, sage, meg
 * Each returns: master m3u8 + 360p/720p/1080p HLS URLs
 * URLs are relative (/api/proxy/m3u8?url=...) — prepend the scraper base URL.
 * hls.js resolves relative URLs in the m3u8 against the m3u8's URL.
 *
 * The scraper handles proxying through swiftstream.top — no extra proxy needed.
 */

const SCRAPER_BASE = "https://animetsu-scraper-jade.vercel.app";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const HEADERS: Record<string, string> = {
  "User-Agent": UA,
  "Accept": "application/json, text/plain, */*",
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AnimetsuSource {
  url: string;           // relative: /api/proxy/m3u8?url=...
  type: string;          // "master" | "hls"
  quality: string;       // "auto" | "360p" | "720p" | "1080p"
  isMaster: boolean;
  originalUrl: string;
}

export interface AnimetsuSubtitle {
  url: string;
  lang: string;
}

export interface AnimetsuSkips {
  intro: { start: number; end: number };
  outro: { start: number; end: number };
}

export interface AnimetsuSourcesResponse {
  sources: AnimetsuSource[];
  subtitles: AnimetsuSubtitle[];
  skips: AnimetsuSkips;
}

export interface AnimetsuVerifiedResult {
  provider: string;      // "kite", "dio", "sage", "meg"
  type: "sub" | "dub";
  streamUrl: string;     // full URL (master m3u8 through scraper)
  quality: string;       // "auto" (master)
  isM3U8: boolean;
  isMP4: boolean;
  isEmbed: boolean;
  hardsub: boolean;
  tracks: Array<{ url: string; lang: string; label: string }>;
  intro: { start: number; end: number } | null;
  outro: { start: number; end: number } | null;
}

// ─── Resolve AniList ID → Animetsu ID ────────────────────────────────────────

const animetsuIdCache = new Map<number, string | null>();

export async function resolveAnimetsuId(anilistId: number, timeoutMs = 8000): Promise<string | null> {
  if (animetsuIdCache.has(anilistId)) return animetsuIdCache.get(anilistId)!;

  try {
    const url = `${SCRAPER_BASE}/api/scrape/animetsu-id?anilist=${anilistId}`;
    const res = await Promise.race([
      fetch(url, { headers: HEADERS, cache: "no-store" }),
      new Promise<Response | null>(r => setTimeout(() => r(null), timeoutMs)),
    ]);
    if (!res || !res.ok) { animetsuIdCache.set(anilistId, null); return null; }
    const data = await res.json();
    const animetsuId = data?.animetsuId;
    if (!animetsuId) { animetsuIdCache.set(anilistId, null); return null; }
    animetsuIdCache.set(anilistId, animetsuId);
    console.log(`[Animetsu] anilistId=${anilistId} → animetsuId=${animetsuId}`);
    return animetsuId;
  } catch {
    animetsuIdCache.set(anilistId, null);
    return null;
  }
}

// ─── Fetch sources for a specific provider ───────────────────────────────────

async function getAnimetsuSources(
  animetsuId: string,
  epNum: number,
  server: string,
  type: "sub" | "dub",
  timeoutMs = 8000
): Promise<AnimetsuSourcesResponse | null> {
  const url = `${SCRAPER_BASE}/api/scrape/sources?id=${animetsuId}&ep=${epNum}&server=${server}&type=${type}`;
  try {
    const res = await Promise.race([
      fetch(url, { headers: HEADERS, cache: "no-store" }),
      new Promise<Response | null>(r => setTimeout(() => r(null), timeoutMs)),
    ]);
    if (!res || !res.ok) return null;
    return await res.json() as AnimetsuSourcesResponse;
  } catch {
    return null;
  }
}

// ─── Main: Fetch ALL Animetsu providers ──────────────────────────────────────

const ANIMETSU_PROVIDERS = ["kite", "dio", "sage", "meg"] as const;

export async function fetchAnimetsuSources(
  anilistId: number,
  epNum: number,
  options?: { sub?: boolean; dub?: boolean; timeoutMs?: number }
): Promise<AnimetsuVerifiedResult[]> {
  const wantSub = options?.sub ?? true;
  const wantDub = options?.dub ?? true;
  const timeoutMs = options?.timeoutMs ?? 8000;

  const animetsuId = await resolveAnimetsuId(anilistId, timeoutMs);
  if (!animetsuId) {
    console.log(`[Animetsu] no animetsuId for anilistId=${anilistId}`);
    return [];
  }

  // Build job list: provider × type
  const jobs: Array<{ server: string; type: "sub" | "dub" }> = [];
  if (wantSub) for (const s of ANIMETSU_PROVIDERS) jobs.push({ server: s, type: "sub" });
  if (wantDub) for (const s of ANIMETSU_PROVIDERS) jobs.push({ server: s, type: "dub" });

  // Fetch all providers in parallel
  const results = await Promise.allSettled(
    jobs.map(async (job): Promise<AnimetsuVerifiedResult | null> => {
      const data = await getAnimetsuSources(animetsuId, epNum, job.server, job.type, timeoutMs);
      if (!data?.sources?.length) return null;

      // Use the master m3u8 (contains all quality variants)
      const master = data.sources.find(s => s.isMaster) || data.sources[0];
      if (!master?.url) return null;

      // Make URL absolute (prepend scraper base if relative)
      const streamUrl = master.url.startsWith("http")
        ? master.url
        : `${SCRAPER_BASE}${master.url}`;

      // Verify the m3u8 is actually playable (not a 502/403 error page)
      try {
        const checkRes = await Promise.race([
          fetch(streamUrl, { headers: HEADERS, cache: "no-store" }),
          new Promise<Response | null>(r => setTimeout(() => r(null), 3000)),
        ]);
        if (!checkRes || !checkRes.ok) {
          console.log(`[Animetsu] ${job.server} (${job.type}) — m3u8 check failed (${checkRes?.status || 'timeout'}), skipping`);
          return null;
        }
        const text = await checkRes.text();
        if (!text.trimStart().replace(/^\uFEFF/, "").startsWith("#EXTM3U")) {
          console.log(`[Animetsu] ${job.server} (${job.type}) — not valid m3u8, skipping`);
          return null;
        }
      } catch {
        console.log(`[Animetsu] ${job.server} (${job.type}) — m3u8 check error, skipping`);
        return null;
      }

      // Parse subtitles
      const tracks = (data.subtitles || []).filter(s => s?.url).map(s => ({
        url: s.url.startsWith("http") ? s.url : `${SCRAPER_BASE}${s.url}`,
        lang: s.lang || "en",
        label: s.lang || "English",
      }));

      // Parse intro/outro skips
      const skips = data.skips || {};
      const intro = skips.intro && skips.intro.end > 0 ? skips.intro : null;
      const outro = skips.outro && skips.outro.end > 0 ? skips.outro : null;

      return {
        provider: job.server,
        type: job.type,
        streamUrl,
        quality: "auto",
        isM3U8: true,
        isMP4: false,
        isEmbed: false,
        hardsub: false,
        tracks,
        intro,
        outro,
      };
    })
  );

  const verified: AnimetsuVerifiedResult[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) verified.push(r.value);
  }

  console.log(`[Animetsu] ${verified.length}/${jobs.length} providers returned sources`);
  return verified;
}
