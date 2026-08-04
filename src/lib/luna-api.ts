/**
 * Luna-Stream API Client
 * ----------------------
 * Luna-Stream (https://luna-stream.me) is a public anime streaming aggregator
 * with a backend API at https://api.luna-stream.me.
 *
 * The API is Cloudflare-protected, so all calls must go through our Cloudflare
 * Worker proxy (which sends proper browser headers + Referer).
 *
 * API shape:
 *   GET https://api.luna-stream.me/anime/{provider}/sources?id={anilistId}&epNum={n}
 *   → {
 *       success: true,
 *       data: {
 *         sources:   [{ url, quality, type, isM3U8, proxyUrl, server, headers }],
 *         subtitles: [{ id, url, label, srcLang }] | [{ file, label, kind, default }],
 *         tracks:    [{ file, label, kind, default }]   // megaplay-style
 *         intro:     { startTime, endTime } | undefined,
 *         outro:     { startTime, endTime } | undefined,
 *         headers:   { Referer, Origin } | undefined,
 *       }
 *     }
 *
 * The `id` parameter is the AniList ID directly (no slug resolution needed).
 *
 * Available providers (verified working 2026-07-13):
 *   - anizone:    HLS from seiryuu.vid-cdn.xyz, multi-language ASS subtitles
 *   - megaplay:   HLS from cdn.mewstream.buzz, VTT captions, intro/outro
 *   - senshi:     HLS from ninstream.com (hardsub)
 *   - anidb:      HLS from hls.anidb.app (already proxied through luna)
 *   - animesalt:  HLS from as-cdn21.top (already proxied through luna)
 *   - hadfree:    MP4 from stream.neongambit.com, intro/outro
 *   - anibd:      HLS from playeng.animeapps.top (already proxied through luna)
 *   - animenexus: HLS from api.anime.nexus, ASS subtitles, multi-quality
 *
 * Providers that exist but currently fail (anidap, animepahe, allanime,
 * animeverse, animegg, animelok, toonworld, kuroanime, piratexplay, reanime,
 * hindianime, kayoanime, desidub, fouranimo, anilink, anineko, animeheaven,
 * anikoto):
 *   These return 400/500 because luna's backend can't reach them or they need
 *   extra params. We skip them. We can revisit later if luna fixes them.
 *
 * Subtitle format note:
 *   - anizone + animenexus return .ass subtitles (text/x-ass)
 *   - megaplay returns .vtt subtitles
 *   - sora (via anidap, not luna) returns .srt
 *   Our HLS player (hls-player-new.tsx) supports VTT natively. ASS needs
 *   conversion (not currently handled — we pass them through and the browser
 *   may not render them, but at least the URL is preserved for future support).
 *
 * Intro/outro format:
 *   Luna returns { startTime, endTime } (not { start, end }). We normalize
 *   to { start, end } and validate via validateSkipTime().
 */

import { wrapM3u8Url, wrapStreamUrl, wrapM3u8UrlWithReferer } from "./proxy";
import { validateSkipTime } from "./episode-metadata";

const LUNA_API = "https://api.luna-stream.me";
const WORKER_BASE =
  process.env.NEXT_PUBLIC_PROXY_BASE ||
  "https://luffytv-proxy.ggy892767.workers.dev";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

// ─── Providers ──────────────────────────────────────────────────────────────

export type LunaProvider =
  | "anizone"
  | "megaplay"
  | "senshi"
  | "anidb"
  | "animesalt"
  | "anibd"
  | "animenexus";

// NOTE: "hadfree" removed — stream.neongambit.com returns 403 for ALL referers
// (the CDN is broken or requires auth we don't have).
// NOTE: "animenexus" kept but often returns 403/429 — api.anime.nexus is
// CF-protected and blocks our worker. It works occasionally.
export const LUNA_PROVIDERS: LunaProvider[] = [
  "anizone",
  "megaplay",
  "senshi",
  "anidb",
  "animesalt",
  "anibd",
  "animenexus",
];

export const LUNA_PROVIDER_META: Record<LunaProvider, {
  name: string; hardsub: boolean; type: "sub" | "dub" | "both";
}> = {
  anizone:    { name: "L1",    hardsub: false, type: "sub" },
  megaplay:   { name: "L2",   hardsub: false, type: "sub" },
  senshi:     { name: "L3",     hardsub: true,  type: "sub" },
  anidb:      { name: "L4",      hardsub: false, type: "sub" },
  animesalt:  { name: "L5",  hardsub: false, type: "sub" },
  anibd:      { name: "L6",      hardsub: true,  type: "sub" },
  animenexus: { name: "L7", hardsub: false, type: "sub" },
};

// ─── Types ──────────────────────────────────────────────────────────────────

interface LunaSource {
  url: string;
  quality?: string;
  type?: string;          // "hls" | "mp4" | undefined
  isM3U8?: boolean;
  isMP4?: boolean;
  audio?: string;         // "sub" | "dub"
  server?: string;
  headers?: { Referer?: string; Origin?: string };
  proxyUrl?: string;      // luna's own proxy path
}

interface LunaSubtitle {
  id?: string;
  url?: string;
  file?: string;          // megaplay-style
  label?: string;
  kind?: string;
  srcLang?: string;
  lang?: string;
  default?: boolean;
}

interface LunaSourcesResponse {
  success: boolean;
  data?: {
    sources: LunaSource[];
    subtitles?: LunaSubtitle[];
    tracks?: LunaSubtitle[];        // megaplay-style
    intro?: { startTime: number; endTime: number };
    outro?: { startTime: number; endTime: number };
    headers?: { Referer?: string; Origin?: string };
  };
  error?: string;
  message?: string;
}

export interface LunaVerifiedResult {
  provider: LunaProvider;
  type: "sub" | "dub";
  /** Best playable stream URL (already wrapped through our Worker proxy) */
  streamUrl: string;
  quality: string;
  isM3U8: boolean;
  isMP4: boolean;
  hardsub: boolean;
  /** Subtitle tracks (URLs wrapped through our Worker proxy) */
  tracks: Array<{ url: string; lang: string; label: string }>;
  intro: { start: number; end: number } | null;
  outro: { start: number; end: number } | null;
}

// ─── Worker proxy fetch helper ──────────────────────────────────────────────

/**
 * Fetch a URL through our Cloudflare Worker proxy (legacy /proxy?url= endpoint).
 * Used for API JSON calls to luna-stream.me (which is CF-protected).
 */
async function workerFetchJson<T = any>(
  url: string,
  timeoutMs = 12000,
): Promise<T | null> {
  try {
    const wrapped = `${WORKER_BASE}/proxy?url=${encodeURIComponent(url)}&ref=${encodeURIComponent("https://luna-stream.me/")}`;
    const res = await Promise.race([
      fetch(wrapped, {
        headers: { Accept: "application/json", "User-Agent": UA },
        cache: "no-store",
      }),
      new Promise<Response | null>(r => setTimeout(() => r(null), timeoutMs)),
    ]);
    if (!res || !res.ok) return null;
    const text = await res.text();
    if (!text || text.startsWith("<!DOCTYPE") || text.startsWith("<html")) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// ─── Fetch sources for one provider ─────────────────────────────────────────

async function getLunaSources(
  anilistId: number,
  epNum: number,
  provider: LunaProvider,
  timeoutMs = 12000,
): Promise<LunaSourcesResponse | null> {
  const url = `${LUNA_API}/anime/${provider}/sources?id=${anilistId}&epNum=${epNum}`;
  return workerFetchJson<LunaSourcesResponse>(url, timeoutMs);
}

// ─── Determine if a URL needs our worker proxy ──────────────────────────────

/**
 * Wrap a stream URL through our Worker proxy if needed.
 *
 * Luna returns 3 kinds of URLs:
 *   1. Already-proxied URLs: "https://api.luna-stream.me/anime/{provider}/proxy?url=..."
 *      These work directly from the browser (CORS-enabled by luna).
 *   2. Direct CDN URLs: "https://cdn.mewstream.buzz/...", "https://ninstream.com/...", etc.
 *      These need our Worker proxy (they require a Referer and don't have CORS).
 *   3. Self-hosted: "https://stream.neongambit.com/..."
 *      May need proxy.
 *
 * We always wrap direct CDN URLs through our worker for reliability.
 */
function wrapLunaStreamUrl(url: string, referer?: string): string {
  if (!url) return "";
  // Luna's own proxy URLs work directly — don't double-wrap
  if (url.startsWith(`${LUNA_API}/anime/`) && url.includes("/proxy?url=")) {
    return url;
  }
  // Direct CDN URL — wrap through our worker
  if (referer) {
    return wrapM3u8UrlWithReferer(url, referer);
  }
  return wrapM3u8Url(url);
}

// ─── Main: fetch ALL Luna sources in parallel ───────────────────────────────

export async function fetchAllLunaSources(
  anilistId: number,
  epNum: number,
  options?: { timeoutMs?: number }
): Promise<LunaVerifiedResult[]> {
  const timeoutMs = options?.timeoutMs ?? 12000;

  console.log(`[Luna] AniList ${anilistId} ep${epNum}: trying ${LUNA_PROVIDERS.length} providers in parallel`);

  const results = await Promise.allSettled(
    LUNA_PROVIDERS.map(async (provider): Promise<LunaVerifiedResult | null> => {
      const data = await getLunaSources(anilistId, epNum, provider, timeoutMs);
      if (!data?.success || !data?.data?.sources?.length) return null;

      // Pick the first source (luna usually returns 1 per provider)
      const src = data.data.sources[0];
      if (!src?.url) return null;

      // Determine stream type
      const isM3U8 = src.isM3U8 === true ||
                     src.type === "hls" ||
                     src.url.includes(".m3u8");
      const isMP4 = src.isMP4 === true ||
                    src.type === "mp4" ||
                    src.url.includes(".mp4");

      // Determine audio type (sub/dub)
      const audioType: "sub" | "dub" = src.audio === "dub" ? "dub" : "sub";

      // Wrap the stream URL — use the source's headers.Referer if available,
      // otherwise let our worker figure it out from CDN_RULES.
      const referer = src.headers?.Referer || data.data.headers?.Referer;
      const streamUrl = wrapLunaStreamUrl(src.url, referer);

      // Collect subtitles from both `subtitles` and `tracks` fields
      // (luna uses different field names per provider)
      const rawSubs: LunaSubtitle[] = [
        ...(data.data.subtitles || []),
        ...(data.data.tracks || []),
      ];
      const tracks = rawSubs
        .filter(s => s?.url || s?.file)
        .map(s => {
          const subUrl = s.url || s.file || "";
          // Return RAW subtitle URL — do NOT wrap through the worker proxy here.
          // The instant-servers route will wrap it through the dedicated subtitle
          // worker (luffytv-subs) which handles SRT→VTT conversion + correct
          // Referer injection. Double-wrapping (main proxy + subs proxy) breaks
          // the URL because the subs worker tries to fetch an already-wrapped URL.
          return {
            url: subUrl,
            lang: s.srcLang || s.lang || "en",
            label: s.label || s.srcLang || s.lang || "English",
          };
        });

      // Validate intro/outro — luna returns { startTime, endTime }
      const intro = validateSkipTime(
        data.data.intro
          ? { start: data.data.intro.startTime, end: data.data.intro.endTime }
          : null,
        "intro",
      );
      const outro = validateSkipTime(
        data.data.outro
          ? { start: data.data.outro.startTime, end: data.data.outro.endTime }
          : null,
        "outro",
      );

      const meta = LUNA_PROVIDER_META[provider];

      return {
        provider,
        type: audioType,
        streamUrl,
        quality: src.quality || "auto",
        isM3U8,
        isMP4,
        hardsub: meta?.hardsub ?? false,
        tracks,
        intro,
        outro,
      };
    }),
  );

  const verified: LunaVerifiedResult[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) verified.push(r.value);
  }

  console.log(`[Luna] ${verified.length}/${LUNA_PROVIDERS.length} providers yielded playable streams`);
  return verified;
}
