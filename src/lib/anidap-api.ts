/**
 * AniDap API Client — REWRITTEN 2026-07-13
 * ----------------------------------------
 * AniDap (https://anidap.se) is a public anime streaming aggregator.
 *
 * API endpoints (all require Origin: https://anidap.se + Referer: https://anidap.se/):
 *
 *   1. AniList → AniDap ID mapping
 *      GET https://anidap.se/api/anime/{anilistId}
 *      → { success: true, data: { id: "one-piece-p8k27", anilistId: 21, ... } }
 *      NOTE: the `id` here is a slug, NOT a number.
 *
 *   2. Available providers for an episode
 *      GET https://chad.anidap.lol/rest/api/servers?id={slug}&epNum={n}
 *      → {
 *          subProviders: [{ id, default, tip }, ...],
 *          dubProviders: [{ id, default, tip }, ...]
 *        }
 *
 *   3. Sources for a specific episode + type + provider
 *      GET https://chad.anidap.lol/rest/api/sources?id={slug}&epNum={n}&type={sub|dub}&providerId={provider}
 *      → {
 *          sources:  [{ url, quality, type }],          // m3u8 or mp4
 *          tracks:   [{ id, url, lang, label, kind, default }] | null,  // WebVTT/SRT captions
 *          chapters: [{ title: "Intro"|"Outro", start, end }] | null,    // intro/outro
 *          headers:  { Referer, Origin } | null
 *        }
 *
 * ACTUAL PROVIDERS (verified 2026-07-13 via /servers endpoint):
 *   sub: beep (soft, fast), mimi (soft, fastest), yuki (soft, multi-q),
 *        loli (HARDSUB, fast), uwu (HARDSUB, fast, HQ), kiwi (HARDSUB, fast, HQ),
 *        sora (soft, fast, HQ)
 *   dub: mimi, yuki, uwu, kiwi, sora
 *
 * Provider tips (from /servers response):
 *   - beep:  "Soft sub, Fast"          — returns captions via chapters only (no VTT tracks)
 *   - mimi:  "Soft sub, Fastest, High quality" — no VTT tracks (captions in video? unclear)
 *   - yuki:  "Soft sub, Good, Multi quality"   — returns VTT tracks (1 English track for OP)
 *   - loli:  "Hard sub, Fast"          — no VTT tracks (subs burned in)
 *   - uwu:   "Hard sub, Fast, High quality"   — no VTT tracks (subs burned in)
 *   - kiwi:  "Hard sub, Fast, High quality"   — no VTT tracks (subs burned in)
 *   - sora:  "Soft sub, Fast, High quality"   — returns MULTIPLE VTT tracks (en, th, vi, id)
 *
 * The previous code listed 13 fake providers (vee, miku, neko, meme, kuro, sax, yume, koto, kami,
 * LIGHT, NEAR, RYU, MISA, etc.) which DON'T EXIST on AniDap. The /sources call would 404 for all
 * of them, so AniDap appeared broken. This rewrite uses the REAL 7-provider catalog.
 *
 * Captions bug:
 *   sora's track URLs sometimes have a triple-slash bug: "https:///subbl.krussdomi.com/..."
 *   We fix this in `normalizeTrackUrl()` by stripping the ":///" and replacing with "://".
 */

// NOTE: AniDap moved from anidap.se → anidap.lol (anidap.se 301-redirects).
// The chad.anidap.lol API backend still works with either origin.
const ANIDAP_FRONT = "https://anidap.lol";
const ANIDAP_API = "https://chad.anidap.lol/rest/api";

import { wrapStreamUrl, wrapM3u8Url } from "./proxy";
import { validateSkipTime } from "./episode-metadata";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const ANIDAP_HEADERS: Record<string, string> = {
  "User-Agent": UA,
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Origin: ANIDAP_FRONT,
  Referer: ANIDAP_FRONT + "/",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-site",
};

// ─── Provider catalog (VERIFIED — see header comment) ──────────────────────
//
// NOTE: "uwu" is removed from the active provider list because vault-XX.uwucdn.top
// (the CDN uwu uses) is Cloudflare-protected and blocks our Cloudflare Worker's
// fetch() with a 403. This is a CF-vs-CF issue — Workers fetching CF-protected
// sites sometimes get challenged. Direct curl works, but the worker can't bypass it.
// NOTE: "vee" is removed — returns DASH .mpd streams from cdn.animeonsen.xyz
// which our player doesn't support well. Re-add if DASH support is added.

export type AniDapProvider =
  | "beep"   | "mimi"  | "yuki"  | "loli"
  | "kiwi"  | "sora"  | "uwu"  | "vee";

export const ANIDAP_SUB_PROVIDERS: AniDapProvider[] = [
  "beep", "mimi", "yuki", "loli", "kiwi", "sora",
  // "uwu" — disabled (vault-XX.uwucdn.top returns 403 to our worker)
  // "vee" — disabled (returns DASH .mpd, player doesn't support well)
];

export const ANIDAP_DUB_PROVIDERS: AniDapProvider[] = [
  "mimi", "yuki", "kiwi", "sora",
  // "uwu" — disabled (vault-XX.uwucdn.top returns 403 to our worker)
  // "vee" — disabled (returns DASH .mpd, player doesn't support well)
];

export const ANIDAP_PROVIDER_META: Record<AniDapProvider, {
  name: string; hardsub: boolean; dub: boolean; sub: boolean; tip: string;
}> = {
  beep: { name: "Smoker",  hardsub: false, sub: true,  dub: false, tip: "Soft sub, Fast" },
  mimi: { name: "Tashigi", hardsub: false, sub: true,  dub: true,  tip: "Soft sub, Fastest, High quality" },
  yuki: { name: "Coby",    hardsub: false, sub: true,  dub: true,  tip: "Soft sub, Good, Multi quality" },
  loli: { name: "Aokiji",  hardsub: true,  sub: true,  dub: false, tip: "Hard sub, Fast" },
  vee:  { name: "Kizaru",  hardsub: false, sub: true,  dub: false, tip: "Soft sub, Fast" },
  uwu:  { name: "Akainu",  hardsub: true,  sub: true,  dub: true,  tip: "Hard sub, Fast, High quality (disabled — CF block)" },
  kiwi: { name: "Fujitora",hardsub: true,  sub: true,  dub: true,  tip: "Hard sub, Fast, High quality" },
  sora: { name: "Sengoku", hardsub: false, sub: true,  dub: true,  tip: "Soft sub, Fast, High quality" },
};

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AniDapSource {
  url: string;
  quality: string;       // "1080p", "720p", "auto"
  type: string;          // "video/mpegurl" | "video/mp4" | undefined
}

export interface AniDapTrack {
  id: string;
  url: string;
  lang: string;
  label: string;
  kind: string;          // "captions" | "subtitles"
  default?: boolean;
}

export interface AniDapChapter {
  title: string;         // "Intro" | "Outro"
  start: number;         // seconds
  end: number;           // seconds
}

export interface AniDapSourcesResponse {
  sources: AniDapSource[];
  tracks: AniDapTrack[] | null;
  audio: any;
  chapters: AniDapChapter[] | null;
  headers: { Origin?: string; Referer?: string; [k: string]: string | undefined } | null;
}

export interface AniDapDetailResponse {
  success: boolean;
  data?: {
    id: string;          // AniDap slug like "one-piece-p8k27"
    anilistId?: number;
    malId?: number;
    titleRomaji?: string;
    titleEnglish?: string;
    [k: string]: any;
  };
  error?: string;
}

// ─── AniList ID → AniDap slug resolver (with cache) ─────────────────────────

const anidapIdCache = new Map<number, string | null>();

export async function resolveAniDapId(anilistId: number): Promise<string | null> {
  if (anidapIdCache.has(anilistId)) return anidapIdCache.get(anilistId)!;

  try {
    const res = await fetch(`${ANIDAP_FRONT}/api/anime/${anilistId}`, {
      headers: ANIDAP_HEADERS,
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[AniDap] resolveAniDapId HTTP ${res.status} for anilistId=${anilistId}`);
      anidapIdCache.set(anilistId, null);
      return null;
    }
    const data: AniDapDetailResponse = await res.json();
    if (!data?.success || !data.data?.id) {
      console.error(`[AniDap] resolveAniDapId no data for anilistId=${anilistId}`);
      anidapIdCache.set(anilistId, null);
      return null;
    }
    const id = data.data.id;
    console.log(`[AniDap] anilistId=${anilistId} → anidapId=${id}`);
    anidapIdCache.set(anilistId, id);
    return id;
  } catch (e: any) {
    console.error(`[AniDap] resolveAniDapId failed:`, e?.message || e);
    anidapIdCache.set(anilistId, null);
    return null;
  }
}

// ─── Fetch sources for a specific provider ──────────────────────────────────

export async function getAniDapSources(
  anidapId: string,
  epNum: number,
  type: "sub" | "dub",
  provider: AniDapProvider,
  timeoutMs = 10000
): Promise<AniDapSourcesResponse | null> {
  const url = `${ANIDAP_API}/sources?id=${encodeURIComponent(anidapId)}&epNum=${epNum}&type=${type}&providerId=${provider}`;

  try {
    const res = await Promise.race([
      fetch(url, { headers: ANIDAP_HEADERS, cache: "no-store" }),
      new Promise<Response | null>(r => setTimeout(() => r(null), timeoutMs)),
    ]);
    if (!res || !res.ok) {
      // Quietly skip — provider may not have this episode
      return null;
    }
    const data: AniDapSourcesResponse = await res.json();
    if (!data?.sources?.length) return null;
    return data;
  } catch {
    return null;
  }
}

// ─── Discover which providers have this episode ─────────────────────────────

interface AniDapServerEntry {
  id: string;
  default?: boolean;
  tip?: string;
}

interface AniDapServersResponse {
  subProviders: AniDapServerEntry[];
  dubProviders: AniDapServerEntry[];
  error?: string;
}

export async function discoverAniDapServers(
  anidapId: string,
  epNum: number,
  timeoutMs = 8000
): Promise<{ sub: AniDapProvider[]; dub: AniDapProvider[] }> {
  const url = `${ANIDAP_API}/servers?id=${encodeURIComponent(anidapId)}&epNum=${epNum}`;
  try {
    const res = await Promise.race([
      fetch(url, { headers: ANIDAP_HEADERS, cache: "no-store" }),
      new Promise<Response | null>(r => setTimeout(() => r(null), timeoutMs)),
    ]);
    if (!res || !res.ok) return { sub: [], dub: [] };
    const data: AniDapServersResponse = await res.json();
    if (data?.error) return { sub: [], dub: [] };

    const filterProviders = (list: AniDapServerEntry[] | undefined): AniDapProvider[] => {
      if (!Array.isArray(list)) return [];
      return list
        .filter(s => s?.id && ANIDAP_PROVIDER_META[s.id as AniDapProvider])
        .map(s => s.id as AniDapProvider);
    };

    return {
      sub: filterProviders(data.subProviders),
      dub: filterProviders(data.dubProviders),
    };
  } catch {
    return { sub: [], dub: [] };
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Fix the triple-slash bug in sora's track URLs:
 *   "https:///subbl.krussdomi.com/..." → "https://subbl.krussdomi.com/..."
 */
function normalizeTrackUrl(url: string): string {
  if (!url) return "";
  return url.replace(/^https?:\/\/\/+/i, "https://");
}

/**
 * Wrap an AniDap stream URL through our Cloudflare Worker proxy.
 * The worker adds the correct Referer per CDN (see CDN_RULES in worker code).
 */
export function buildAniDapProxyUrl(streamUrl: string, isMP4 = false): string {
  if (!streamUrl) return "";
  // All AniDap streams go through the worker — the worker has referer rules
  // for all the CDNs AniDap uses (24stream.xyz, mewstream.buzz, krussdomi.com,
  // anidb.app, vibeplayer.site, etc.).
  return isMP4 ? wrapStreamUrl(streamUrl) : wrapM3u8Url(streamUrl);
}

/**
 * Wrap an AniDap caption track URL through the worker proxy.
 * Fixes the triple-slash bug first.
 */
export function buildAniDapSubtitleProxyUrl(subtitleUrl: string): string {
  const fixed = normalizeTrackUrl(subtitleUrl);
  if (!fixed) return "";
  return wrapStreamUrl(fixed);
}

// ─── Verified result type ───────────────────────────────────────────────────

export interface AniDapVerifiedResult {
  provider: AniDapProvider;
  type: "sub" | "dub";
  sources: AniDapSource[];
  tracks: AniDapTrack[];
  chapters: AniDapChapter[];
  intro: { start: number; end: number } | null;
  outro: { start: number; end: number } | null;
  /** Best playable stream URL (already proxied through our Worker) */
  streamUrl: string;
  /** Highest quality label, e.g. "1080p" */
  quality: string;
  /** Whether the stream is HLS (m3u8) or MP4 or DASH (mpd) */
  isM3U8: boolean;
  isMP4: boolean;
  isDASH: boolean;
  /** Whether subtitles are burned into the video (hardsub) */
  hardsub: boolean;
}

/**
 * Fetch sources from EVERY available provider in parallel.
 *
 * Strategy:
 *   1. Call /servers to get the list of providers that actually have this episode.
 *      This is fast (<1s) and tells us exactly which providers to query.
 *   2. For each provider, call /sources to get the m3u8 + tracks + chapters.
 *      All calls run in parallel (7 sub + 5 dub = 12 max calls).
 *   3. Validate skip times (filter out {0,0} and swapped intro/outro).
 *   4. Return only providers that yielded a playable stream.
 *
 * If /servers fails (rare), fall back to trying ALL providers from the catalog.
 *
 * Total time: ~3-5s (parallel calls, each <2s).
 */
export async function fetchAllAniDapSources(
  anilistId: number,
  epNum: number,
  options?: { sub?: boolean; dub?: boolean; timeoutMs?: number }
): Promise<AniDapVerifiedResult[]> {
  const anidapId = await resolveAniDapId(anilistId);
  if (!anidapId) {
    console.log(`[AniDap] no anidapId for anilistId=${anilistId} — skipping`);
    return [];
  }

  const wantSub = options?.sub ?? true;
  const wantDub = options?.dub ?? true;
  const timeoutMs = options?.timeoutMs ?? 10000;

  // ── STEP 1: Discover available providers via /servers ──
  let subProviders: AniDapProvider[] = [];
  let dubProviders: AniDapProvider[] = [];
  if (wantSub || wantDub) {
    const discovered = await discoverAniDapServers(anidapId, epNum);
    subProviders = wantSub ? discovered.sub : [];
    dubProviders = wantDub ? discovered.dub : [];
  }

  // Fallback: if /servers returned nothing, try the full catalog
  if (wantSub && subProviders.length === 0) {
    subProviders = ANIDAP_SUB_PROVIDERS;
  }
  if (wantDub && dubProviders.length === 0) {
    dubProviders = ANIDAP_DUB_PROVIDERS;
  }

  // ── STEP 2: Build job list (provider + type pairs) ──
  const jobs: Array<{ provider: AniDapProvider; type: "sub" | "dub" }> = [];
  for (const p of subProviders) jobs.push({ provider: p, type: "sub" });
  for (const p of dubProviders) jobs.push({ provider: p, type: "dub" });

  console.log(`[AniDap] ${anidapId} ep${epNum}: trying ${jobs.length} providers (${subProviders.length} sub + ${dubProviders.length} dub) in parallel`);

  // ── STEP 3: Fetch all sources in parallel ──
  const results = await Promise.allSettled(
    jobs.map(async (job): Promise<AniDapVerifiedResult | null> => {
      const data = await getAniDapSources(anidapId, epNum, job.type, job.provider, timeoutMs);
      if (!data?.sources?.length) return null;

      // Pick the best playable source (prefer HLS m3u8, then MP4, then DASH)
      const isHls = (s: AniDapSource) =>
        (s.type && s.type.includes("mpegurl")) || s.url.includes(".m3u8") || s.url.endsWith(".txt");
      const isMp4 = (s: AniDapSource) =>
        (s.type && s.type.includes("mp4")) || s.url.includes(".mp4");
      const isDash = (s: AniDapSource) =>
        (s.type && s.type.includes("dash")) || s.url.includes(".mpd");

      // Quality ranking — 1080p > 720p > 480p > 360p > auto
      const qRank = (q: string): number => {
        const m = (q || "").match(/(\d{3,4})p?/i);
        if (m) return parseInt(m[1], 10);
        if (/auto/i.test(q)) return 1;
        return 0;
      };

      const playable =
        data.sources.filter(isHls).sort((a, b) => qRank(b.quality) - qRank(a.quality))[0] ||
        data.sources.filter(isMp4).sort((a, b) => qRank(b.quality) - qRank(a.quality))[0] ||
        data.sources.filter(isDash).sort((a, b) => qRank(b.quality) - qRank(a.quality))[0] ||
        data.sources[0];

      if (!playable?.url) return null;

      const m3u8 = isHls(playable);
      const mp4 = isMp4(playable);
      const dash = isDash(playable);
      // DASH (.mpd) URLs go through wrapStreamUrl (not wrapM3u8Url) so the worker
      // doesn't try to rewrite the manifest as m3u8.
      const proxyUrl = dash
        ? wrapStreamUrl(playable.url)
        : buildAniDapProxyUrl(playable.url, mp4);

      // Parse intro/outro from chapters — VALIDATE to filter bad data
      const chapters = data.chapters || [];
      const introChapter = chapters.find(c => /intro/i.test(c.title));
      const outroChapter = chapters.find(c => /outro|ending|ed\b/i.test(c.title));
      const intro = validateSkipTime(
        introChapter ? { start: introChapter.start, end: introChapter.end } : null,
        "intro",
      );
      const outro = validateSkipTime(
        outroChapter ? { start: outroChapter.start, end: outroChapter.end } : null,
        "outro",
      );

      // Process caption tracks — fix URL bug + wrap through proxy
      const rawTracks = (data.tracks || []).filter(t => t?.url);
      const tracks: AniDapTrack[] = rawTracks.map(t => ({
        id: t.id,
        url: normalizeTrackUrl(t.url),
        lang: t.lang || "en",
        label: t.label || t.lang || "English",
        kind: t.kind || "captions",
        default: t.default,
      }));

      return {
        provider: job.provider,
        type: job.type,
        sources: data.sources,
        tracks,
        chapters,
        intro,
        outro,
        streamUrl: proxyUrl,
        quality: playable.quality || "auto",
        isM3U8: m3u8,
        isMP4: mp4,
        isDASH: dash,
        hardsub: ANIDAP_PROVIDER_META[job.provider]?.hardsub ?? false,
      };
    })
  );

  const verified: AniDapVerifiedResult[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) verified.push(r.value);
  }

  console.log(`[AniDap] ${verified.length}/${jobs.length} providers yielded playable streams`);
  return verified;
}
