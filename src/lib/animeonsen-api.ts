/**
 * AnimeOnsen API Client
 * =====================
 *
 * AnimeOnsen (animeonsen.xyz) is a streaming platform with its own CDN
 * and subtitle system. It uses a JWT-based auth flow:
 *
 *   1. Visit animeonsen.xyz → server sets `ao.session` cookie
 *   2. Cookie value is base64-encoded, then each char's code is shifted +1
 *      to produce a JWT token
 *   3. Use JWT as `Authorization: Bearer <token>` + `ao.session` cookie
 *      on all API calls to api.animeonsen.xyz
 *
 * API endpoints (v4):
 *   GET /v4/content/index?start=0&limit=30   → browse anime list
 *   GET /v4/content/{contentId}              → anime metadata
 *   GET /v4/content/{contentId}/episodes     → episode list (titles only)
 *   GET /v4/content/{contentId}/playback?episode=N  → stream + subtitle URLs
 *
 * Stream format: HLS m3u8 on cdn.animeonsen.xyz
 * Subtitles: VTT files served from api.animeonsen.xyz
 *
 * Cloudflare note: Some endpoints are CF-protected. The /v4/content/index,
 * /v4/content/{id}, and /v4/content/{id}/episodes endpoints are accessible
 * with proper auth. The playback endpoint may require the worker proxy.
 */

import { wrapStreamUrl, wrapM3u8Url, workerWrap } from "./proxy";

const ONSEN_HOME = "https://www.animeonsen.xyz/";
const ONSEN_API = "https://api.animeonsen.xyz";
const SCRAPER_TIMEOUT_MS = 5000;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OnsenContent {
  content_id: string;
  content_title: string;
  content_title_en?: string;
  total_episodes: number;
  is_movie?: boolean;
  subtitle_support?: boolean;
  mal_id?: number;
  genres?: string[];
  date_added?: number;
}

export interface OnsenEpisode {
  episode: number;
  title_en?: string;
  title_jp?: string;
}

export interface OnsenPlayback {
  videoUrl?: string;       // HLS m3u8 URL
  subtitleUrls?: Array<{ url: string; lang: string; label: string }>;
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
}

export interface OnsenVerifiedResult {
  provider: "animeonsen";
  type: "sub" | "dub";
  quality: string;
  streamUrl: string;
  isMP4: boolean;
  isM3U8: boolean;
  isDASH?: boolean;  // DASH .mpd stream (needs dash.js player)
  subtitleTracks: Array<{ url: string; lang: string; label: string }>;
  intro?: { start: number; end: number } | null;
  outro?: { start: number; end: number } | null;
}

// ─── Session cache (cookie + JWT token) ──────────────────────────────────────

interface OnsenSession {
  cookie: string;   // raw ao.session cookie value
  token: string;    // decoded JWT token
  expires: number;
}

let _session: OnsenSession | null = null;
const SESSION_TTL_MS = 25 * 60 * 1000; // 25 min (cookie lasts ~30 min)

// ─── Cookie acquisition + JWT decoding ──────────────────────────────────────

async function getSession(): Promise<OnsenSession> {
  if (_session && Date.now() < _session.expires) {
    return _session;
  }

  console.log("[AnimeOnsen] acquiring fresh session...");
  const start = Date.now();

  // Step 1: Visit home page to get ao.session cookie (5s timeout)
  const homeRes = await Promise.race([
    fetch(ONSEN_HOME, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      cache: "no-store",
    }),
    new Promise<Response | null>(r => setTimeout(() => r(null), 5000)),
  ]);

  if (!homeRes || !homeRes.ok) {
    throw new Error(`Failed to fetch animeonsen.xyz home: ${homeRes ? `HTTP ${homeRes.status}` : 'timeout'}`);
  }

  // Extract ao.session cookie from Set-Cookie header
  const setCookie = homeRes.headers.getSetCookie?.() || [];
  let cookieVal: string | null = null;

  for (const c of setCookie) {
    const match = c.match(/ao\.session=([^;]+)/);
    if (match) {
      cookieVal = match[1];
      break;
    }
  }

  // Fallback: parse from cookie header
  if (!cookieVal) {
    const cookieHeader = homeRes.headers.get("cookie") || "";
    const match = cookieHeader.match(/ao\.session=([^;]+)/);
    if (match) cookieVal = match[1];
  }

  if (!cookieVal) {
    throw new Error("ao.session cookie not found in response");
  }

  // Step 2: Decode cookie → JWT token
  // Cookie is base64-encoded. Decode it, then shift each char's code +1.
  const token = decodeOnsenToken(cookieVal);

  _session = {
    cookie: cookieVal,
    token,
    expires: Date.now() + SESSION_TTL_MS,
  };

  console.log(`[AnimeOnsen] session acquired in ${Date.now() - start}ms (token length: ${token.length})`);
  return _session;
}

function decodeOnsenToken(cookieVal: string): string {
  // URL-decode the cookie value
  const decoded = decodeURIComponent(cookieVal);

  // Base64-decode
  const binary = atob(decoded);

  // Shift each char's code +1 (Caesar cipher)
  return binary
    .split("")
    .map((c) => String.fromCharCode(c.charCodeAt(0) + 1))
    .join("");
}

// ─── Authenticated API fetch ────────────────────────────────────────────────

async function onsenFetch(path: string, timeoutMs = SCRAPER_TIMEOUT_MS): Promise<any | null> {
  try {
    const session = await getSession();
    const url = `${ONSEN_API}${path}`;

    const res = await Promise.race([
      fetch(url, {
        headers: {
          "User-Agent": UA,
          Accept: "application/json",
          "Authorization": `Bearer ${session.token}`,
          "Cookie": `ao.session=${session.cookie}`,
          "Origin": "https://www.animeonsen.xyz",
          "Referer": "https://www.animeonsen.xyz/",
        },
        cache: "no-store",
      }),
      new Promise<Response | null>((r) => setTimeout(() => r(null), timeoutMs)),
    ]);

    if (!res || !res.ok) {
      console.error(`[AnimeOnsen] ${path} → HTTP ${res?.status || "timeout"}`);
      // Reset session on auth failure
      if (res?.status === 401) {
        _session = null;
      }
      return null;
    }

    const text = await res.text();
    if (text.startsWith("<")) {
      // CF challenge page
      console.error(`[AnimeOnsen] ${path} → CF challenge`);
      return null;
    }

    return JSON.parse(text);
  } catch (e: any) {
    console.error(`[AnimeOnsen] ${path} failed:`, e?.message || e);
    return null;
  }
}

// ─── Browse anime list ──────────────────────────────────────────────────────

export async function getOnsenContentList(
  start = 0,
  limit = 30
): Promise<OnsenContent[]> {
  const data = await onsenFetch(`/v4/content/index?start=${start}&limit=${limit}`);
  return data?.content || [];
}

// ─── Get anime info ─────────────────────────────────────────────────────────

export async function getOnsenContent(contentId: string): Promise<OnsenContent | null> {
  return onsenFetch(`/v4/content/${contentId}`);
}

// ─── Get episode list ───────────────────────────────────────────────────────

export async function getOnsenEpisodes(
  contentId: string
): Promise<OnsenEpisode[]> {
  const data = await onsenFetch(`/v4/content/${contentId}/episodes`);
  if (!data) return [];

  // Response shape: { "1": { contentTitle_episode_en, contentTitle_episode_jp }, "2": {...}, ... }
  const episodes: OnsenEpisode[] = [];
  for (const [epNum, epData] of Object.entries(data)) {
    const d = epData as any;
    episodes.push({
      episode: parseInt(epNum, 10),
      title_en: d.contentTitle_episode_en,
      title_jp: d.contentTitle_episode_jp,
    });
  }

  return episodes.sort((a, b) => a.episode - b.episode);
}

// ─── Get playback (stream + subtitles) ──────────────────────────────────────

export async function getOnsenPlayback(
  contentId: string,
  episodeNum: number
): Promise<OnsenPlayback | null> {
  // The correct endpoint is /v4/content/{id}/video/{episode}
  // Returns: { metadata: {...}, uri: { stream: ".mpd URL", subtitles: {lang: url} } }
  const data = await onsenFetch(`/v4/content/${contentId}/video/${episodeNum}`);
  if (!data) return null;

  const uri = data.uri || {};
  const videoUrl = uri.stream || "";
  const subs = uri.subtitles || {};

  const subtitleUrls = Object.entries(subs).map(([lang, url]) => ({
    url: url as string,
    lang,
    label: lang,
  })).filter((s) => s.url);

  // Parse intro/outro from metadata
  const meta = data.metadata || {};
  const epData = meta.episode;
  let intro: { start: number; end: number } | null = null;
  if (Array.isArray(epData) && epData[1]?.skipIntro_s && epData[1]?.skipIntro_e) {
    intro = {
      start: parseFloat(epData[1].skipIntro_s) || 0,
      end: parseFloat(epData[1].skipIntro_e) || 0,
    };
  }

  return {
    videoUrl,
    subtitleUrls,
    intro: intro || undefined,
    outro: undefined,
  };
}

// ─── AniList ID → AnimeOnsen content_id resolution ──────────────────────────

const anilistToOnsenCache = new Map<number, { contentId: string; title: string; expires: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function normalizeTitle(t: string): string {
  return (t || "")
    .toLowerCase()
    .replace(/\s*(season|cour|part)\s*\d+/gi, "")
    .replace(/:\s*.+$/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function resolveOnsenContentId(
  anilistId: number,
  titles: { english?: string; romaji?: string; native?: string }
): Promise<{ contentId: string; title: string } | null> {
  // Check cache
  const cached = anilistToOnsenCache.get(anilistId);
  if (cached && cached.expires > Date.now()) {
    return { contentId: cached.contentId, title: cached.title };
  }

  // Get content list (browse first 30 items)
  const contentList = await getOnsenContentList(0, 30);
  if (!contentList.length) return null;

  // Build normalized title variants
  const variants = [
    titles.english,
    titles.romaji,
    titles.english ? normalizeTitle(titles.english) : undefined,
    titles.romaji ? normalizeTitle(titles.romaji) : undefined,
  ].filter((t): t is string => !!t && t.length >= 3);

  // Try to find match
  for (const v of variants) {
    const norm = normalizeTitle(v);
    for (const item of contentList) {
      const itemNorm = normalizeTitle(item.content_title_en || item.content_title);
      if (itemNorm === norm || itemNorm.includes(norm) || norm.includes(itemNorm)) {
        const result = { contentId: item.content_id, title: item.content_title_en || item.content_title };
        anilistToOnsenCache.set(anilistId, {
          ...result,
          expires: Date.now() + CACHE_TTL_MS,
        });
        console.log(`[AnimeOnsen] anilistId=${anilistId} → contentId=${result.contentId} ("${result.title}")`);
        return result;
      }
    }
  }

  return null;
}

// ─── Convenience: fetch all sources for an episode ──────────────────────────

export async function fetchAllOnsenSources(
  anilistId: number,
  episodeNum: number,
  titles: { english?: string; romaji?: string; native?: string },
  options?: { sub?: boolean; dub?: boolean; timeoutMs?: number }
): Promise<OnsenVerifiedResult[]> {
  const wantSub = options?.sub ?? true;
  const wantDub = options?.dub ?? true;
  const timeoutMs = options?.timeoutMs ?? 8000;

  try {
    // Step 1: Resolve AniList ID → AnimeOnsen content_id
    const resolved = await resolveOnsenContentId(anilistId, titles);
    if (!resolved) return [];

    // Step 2: Get playback (stream + subtitles)
    const playback = await getOnsenPlayback(resolved.contentId, episodeNum);
    if (!playback?.videoUrl) {
      console.log(`[AnimeOnsen] no video URL for "${resolved.title}" ep${episodeNum}`);
      return [];
    }

    const results: OnsenVerifiedResult[] = [];

    // AnimeOnsen streams are HLS m3u8 with soft subtitles (VTT tracks)
    // Default to "sub" type (AnimeOnsen doesn't have dubs)
    const type: "sub" | "dub" = "sub";
    if (!wantSub) return [];

    // Wrap the .mpd URL through aniwatchtv proxy
    // AnimeOnsen CDN requires Referer: https://www.animeonsen.xyz/
    // The proxy.ts CDN_REFERER_PATTERNS already handles *.animeonsen.xyz
    const proxiedUrl = wrapM3u8Url(playback.videoUrl);

    // Return RAW subtitle URLs — the instant-servers route will wrap them
    // through the dedicated subtitle worker (luffytv-subs) which handles
    // SRT→VTT conversion + correct Referer injection. Double-wrapping
    // (workerWrap here + subs worker later) breaks the URL.
    const proxiedSubs = (playback.subtitleUrls || []).map((s) => ({
      url: s.url,
      lang: s.lang,
      label: s.label,
    }));

    results.push({
      provider: "animeonsen",
      type,
      quality: "720p",
      streamUrl: proxiedUrl,
      isMP4: false,
      isM3U8: false,
      isDASH: true,  // DASH .mpd — watch page needs dash.js to play
      subtitleTracks: proxiedSubs,
      intro: (playback.intro as any) || undefined,
      outro: (playback.outro as any) || undefined,
    });

    console.log(`[AnimeOnsen] ${anilistId} ep${episodeNum}: ${results.length} stream (m3u8=${!!playback.videoUrl}, subs=${playback.subtitleUrls?.length || 0})`);
    return results;
  } catch (e: any) {
    console.error(`[AnimeOnsen] fetchAllSources failed for ${anilistId} ep${episodeNum}:`, e?.message || e);
    return [];
  }
}

export const ONSEN_ENABLED = true;
