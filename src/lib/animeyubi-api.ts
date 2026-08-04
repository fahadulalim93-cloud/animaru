/**
 * AniYubi API Client
 * ------------------
 * AniYubi (https://animeyubi.com) is a public anime streaming site that wraps
 * AnimePahe content. It has a Django REST API at /api/v4/ with these endpoints:
 *
 *   1. Search anime:
 *      GET https://animeyubi.com/api/v4/pahe/anime/?format=json&search={query}
 *      → { count, results: [{ id, unique_id, title, image, last_updated }] }
 *      NOTE: search is sorted by last_updated — exact title matches may be deep
 *      in the list. Use AniList GraphQL to get the title first, then search.
 *
 *   2. Get episodes (paginated by anime_id):
 *      GET https://animeyubi.com/api/v4/pahe/episodes/?format=json&anime_id={id}
 *      → { count, results: [{ title, id, videos: [{ title, id, video_type, url, errors }], anime: {...} }] }
 *      Each episode has multiple `videos` — each with a kwik.cx URL
 *      (video_type="mp4" → kwik.cx/f/XXX, video_type="hls" → kwik.cx/e/XXX)
 *
 * Stream URLs are kwik.cx embeds — need to be resolved to direct m3u8/mp4
 * through the kwik.cx scraper. For now, return them as embed URLs.
 *
 * KEY ADVANTAGE: animeyubi.com is NOT Cloudflare-protected — direct fetch works.
 */

import { wrapStreamUrl } from "./proxy";

const ANIMEYUBI_API = "https://animeyubi.com/api/v4";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const HEADERS: Record<string, string> = {
  "User-Agent": UA,
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AniYubiSearchResult {
  id: number;
  unique_id: string;
  title: string;
  image?: string;
  last_updated?: string;
}

export interface AniYubiVideo {
  title: string;
  id: number;
  video_type: "mp4" | "hls" | string;
  url: string;
  errors: number;
}

export interface AniYubiEpisode {
  title: string;
  id: number;
  videos: AniYubiVideo[];
  anime?: {
    id: number;
    unique_id: string;
    title: string;
    jp_title?: string;
    title_romaji?: string;
    synopsis?: string;
    image?: string;
    anime_type?: string;
  };
}

// ─── Search by query ────────────────────────────────────────────────────────

export async function searchAniYubi(
  query: string,
  timeoutMs = 8000
): Promise<AniYubiSearchResult[]> {
  const url = `${ANIMEYUBI_API}/pahe/anime/?format=json&search=${encodeURIComponent(query)}`;
  try {
    const res = await Promise.race([
      fetch(url, { headers: HEADERS, cache: "no-store" }),
      new Promise<Response | null>(r => setTimeout(() => r(null), timeoutMs)),
    ]);
    if (!res || !res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.results) ? data.results : [];
  } catch {
    return [];
  }
}

// ─── Resolve AniList ID → AniYubi anime ID (via title search) ───────────────

const anilistToAniYubiCache = new Map<number, number | null>();

export async function resolveAniYubiId(
  anilistId: number,
  timeoutMs = 10000
): Promise<number | null> {
  if (anilistToAniYubiCache.has(anilistId)) {
    return anilistToAniYubiCache.get(anilistId)!;
  }

  try {
    // Step 1: Get anime title from AniList
    const anilistRes = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({
        query: `query($id:Int){Media(id:$id,type:ANIME){id title{english romaji native}}}`,
        variables: { id: anilistId },
      }),
      cache: "no-store",
    });
    if (!anilistRes.ok) {
      anilistToAniYubiCache.set(anilistId, null);
      return null;
    }
    const anilistData = await anilistRes.json();
    const title = anilistData?.data?.Media?.title?.english
      || anilistData?.data?.Media?.title?.romaji;
    if (!title) {
      anilistToAniYubiCache.set(anilistId, null);
      return null;
    }

    // Step 2: Search AniYubi by title (paginated — may need multiple pages)
    // Try first 3 pages to find exact match
    for (let page = 1; page <= 3; page++) {
      const url = `${ANIMEYUBI_API}/pahe/anime/?format=json&search=${encodeURIComponent(title)}&page=${page}`;
      const res = await Promise.race([
        fetch(url, { headers: HEADERS, cache: "no-store" }),
        new Promise<Response | null>(r => setTimeout(() => r(null), timeoutMs)),
      ]);
      if (!res || !res.ok) break;
      const data = await res.json();
      const results: AniYubiSearchResult[] = data?.results || [];
      if (results.length === 0) break;

      // Look for exact title match (case-insensitive)
      const exact = results.find(r =>
        r.title.toLowerCase() === title.toLowerCase()
      );
      if (exact) {
        console.log(`[AniYubi] anilistId=${anilistId} → animeyubiId=${exact.id} (title="${exact.title}", page ${page})`);
        anilistToAniYubiCache.set(anilistId, exact.id);
        return exact.id;
      }
    }

    console.log(`[AniYubi] anilistId=${anilistId} → no exact match for "${title}"`);
    anilistToAniYubiCache.set(anilistId, null);
    return null;
  } catch {
    anilistToAniYubiCache.set(anilistId, null);
    return null;
  }
}

// ─── Get episodes for an anime ────────────────────────────────────────────────

export async function getAniYubiEpisodes(
  animeyubiId: number,
  timeoutMs = 10000
): Promise<AniYubiEpisode[]> {
  const url = `${ANIMEYUBI_API}/pahe/episodes/?format=json&anime_id=${animeyubiId}`;
  try {
    const res = await Promise.race([
      fetch(url, { headers: HEADERS, cache: "no-store" }),
      new Promise<Response | null>(r => setTimeout(() => r(null), timeoutMs)),
    ]);
    if (!res || !res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.results) ? data.results : [];
  } catch {
    return [];
  }
}

// ─── Verified result ──────────────────────────────────────────────────────────

export interface AniYubiVerifiedResult {
  server: string;
  type: "sub" | "dub";
  streamUrl: string;
  quality: string;
  isM3U8: boolean;
  isMP4: boolean;
  isEmbed: boolean;
  hardsub: boolean;
  tracks: any[];
}

/**
 * Fetch ALL AniYubi servers for an anime episode.
 * Returns a list of playable streams (kwik.cx embed URLs).
 *
 * Flow:
 *   1. Resolve AniList ID → AniYubi anime ID (via title search)
 *   2. Fetch episodes list
 *   3. Find episode by number
 *   4. For each video in that episode, return as a server
 *
 * Note: AniYubi only has SUB versions (no dub). All streams are kwik.cx embeds.
 */
export async function fetchAniYubiSources(
  anilistId: number,
  epNum: number,
  options?: { timeoutMs?: number }
): Promise<AniYubiVerifiedResult[]> {
  const timeoutMs = options?.timeoutMs ?? 10000;
  const verified: AniYubiVerifiedResult[] = [];

  try {
    const animeyubiId = await resolveAniYubiId(anilistId, timeoutMs);
    if (!animeyubiId) {
      console.log(`[AniYubi] anilistId=${anilistId} → no animeyubi match`);
      return [];
    }

    const episodes = await getAniYubiEpisodes(animeyubiId, timeoutMs);
    if (!episodes.length) {
      console.log(`[AniYubi] animeyubiId=${animeyubiId} → no episodes`);
      return [];
    }

    // Find the requested episode (episodes are sorted desc by last_updated, so search all)
    const ep = episodes.find(e => parseInt(e.title, 10) === epNum) || episodes[0];
    if (!ep?.videos?.length) {
      console.log(`[AniYubi] animeyubiId=${animeyubiId} ep${epNum} → no videos`);
      return [];
    }

    // Each video is a kwik.cx stream (mp4=f/, hls=e/)
    // Group by quality and dedupe by URL
    const seen = new Set<string>();
    for (const video of ep.videos) {
      if (!video.url || video.errors > 5) continue;
      if (seen.has(video.url)) continue;
      seen.add(video.url);

      const isHls = video.video_type === "hls" || video.url.includes("/e/");
      const isMp4 = video.video_type === "mp4" || video.url.includes("/f/");
      const isEmbed = video.url.includes("kwik.cx");

      // Parse quality from title like "USS · 720p BD"
      const qualityMatch = video.title.match(/(\d{3,4}p)/i);
      const quality = qualityMatch ? qualityMatch[1] : video.video_type || "auto";

      // Group label from title (e.g. "USS" from "USS · 720p BD")
      const groupMatch = video.title.match(/^([^\s·]+)\s*·/);
      const group = groupMatch ? groupMatch[1] : "Stream";

      verified.push({
        server: `${group} ${quality}`,
        type: "sub",  // AniYubi only has sub
        streamUrl: video.url,  // kwik.cx embed URL — handled by EmbedPlayerWithFallback
        quality,
        isM3U8: isHls,
        isMP4: isMp4,
        isEmbed,
        hardsub: false,  // kwik.cx usually has soft sub VTT tracks
        tracks: [],
      });
    }

    console.log(`[AniYubi] anilistId=${anilistId} ep${epNum} → ${verified.length} streams (from animeyubiId=${animeyubiId})`);
  } catch (e: any) {
    console.error(`[AniYubi] fetchAniYubiSources failed:`, e?.message || e);
  }

  return verified;
}
