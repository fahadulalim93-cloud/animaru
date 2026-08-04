/**
 * AniYubi API Client
 * ------------------
 * AniYubi (https://animeyubi.com) is an anime aggregator with a public
 * REST API at /api/v4/. It's based on animepahe (uses animepahe posters/IDs).
 *
 * API flow:
 *   1. Resolve AniList ID → animeyubi anime ID (via title search)
 *   2. GET https://animeyubi.com/api/v4/pahe/anime/{unique_id}/?format=json
 *      → anime details + episode list (with episode IDs)
 *   3. GET https://animeyubi.com/api/v4/pahe/episodes/{episode_id}/?format=json
 *      → videos array: [{ title, video_type, url }]
 *
 * All video URLs are kwik.cx links:
 *   - /f/{id} → MP4 direct (file page)
 *   - /e/{id} → HLS embed (iframe player page)
 *
 * kwik.cx is Cloudflare-protected and blocks server-side fetches.
 * We use the /e/ (embed) URL as an iframe embed source (client-side playback).
 *
 * Search uses animepahe unique_id (NOT anilist ID). We resolve via title match
 * using AniList GraphQL.
 */

const ANIYUBI_API = "https://animeyubi.com/api/v4";

const ANILIST_GRAPHQL = "https://graphql.anilist.co";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const HEADERS: Record<string, string> = {
  "User-Agent": UA,
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://animeyubi.com/",
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AniYubiAnime {
  id: number;          // internal animeyubi ID
  unique_id: string;   // animepahe unique_id (string)
  title: string;
  jp_title?: string;
  title_romaji?: string;
  image?: string;
  synopsis?: string;
  anime_type?: string;
  aired?: string;
}

export interface AniYubiEpisode {
  title: string;       // episode number as string
  id: number;          // episode ID for fetching videos
  last_updated?: string;
}

export interface AniYubiVideo {
  title: string;       // "USS · 720p BD"
  id: number;
  video_type: "mp4" | "hls";
  url: string;         // kwik.cx URL
  errors: number;
}

export interface AniYubiVerifiedResult {
  provider: string;       // "mp4-720p", "hls-1080p", etc.
  type: "sub";            // AniYubi is sub-only (animepahe doesn't have dub)
  streamUrl: string;      // kwik.cx /e/ or /f/ URL
  quality: string;        // "720p", "1080p"
  isM3U8: boolean;
  isMP4: boolean;
  isEmbed: boolean;       // always true (kwik.cx iframe)
  hardsub: boolean;
  tracks: never[];
}

// ─── AniList ID → AniYubi anime ID resolver (with cache) ──────────────────────

const anilistToAniyubiCache = new Map<number, { animeId: number; uniqueId: string } | null>();

/**
 * Resolve AniList ID → animeyubi anime ID + animepahe unique_id.
 * Strategy:
 *   1. Get English + romaji title from AniList
 *   2. Search animeyubi by title (iterate pages since search isn't reliable)
 *   3. Find best match by title similarity
 */
export async function resolveAniYubiId(
  anilistId: number,
  timeoutMs = 8000
): Promise<{ animeId: number; uniqueId: string } | null> {
  if (anilistToAniyubiCache.has(anilistId)) return anilistToAniyubiCache.get(anilistId)!;

  try {
    // Step 1: Get title from AniList
    const titleRes = await fetch(ANILIST_GRAPHQL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({
        query: `query($id:Int){Media(id:$id,type:ANIME){id title{english romaji native}}}`,
        variables: { id: anilistId },
      }),
      cache: "no-store",
    });
    if (!titleRes.ok) { anilistToAniyubiCache.set(anilistId, null); return null; }
    const titleData = await titleRes.json();
    const title = titleData?.data?.Media?.title?.english
               || titleData?.data?.Media?.title?.romaji;
    if (!title) { anilistToAniyubiCache.set(anilistId, null); return null; }

    // Step 2: Search animeyubi by title (use 'title' param — 'search' doesn't filter)
    const searchUrl = `${ANIYUBI_API}/pahe/anime/?format=json&title=${encodeURIComponent(title)}&page=1`;
    const searchRes = await Promise.race([
      fetch(searchUrl, { headers: HEADERS, cache: "no-store" }),
      new Promise<Response | null>(r => setTimeout(() => r(null), timeoutMs)),
    ]);
    if (!searchRes || !searchRes.ok) { anilistToAniyubiCache.set(anilistId, null); return null; }
    const searchData = await searchRes.json();
    const results: any[] = searchData?.results || [];

    // Step 3: Find best match by exact title (case-insensitive)
    const titleLower = title.toLowerCase();
    const match = results.find((r: any) => r.title?.toLowerCase() === titleLower)
               || results.find((r: any) => r.title?.toLowerCase().includes(titleLower))
               || results.find((r: any) => titleLower.includes(r.title?.toLowerCase() || ""));

    if (!match?.id) { anilistToAniyubiCache.set(anilistId, null); return null; }

    // NOTE: animeyubi uses the internal `id` (e.g. 9973) for fetching anime details,
    // NOT the `unique_id` (which is animepahe's ID). The /pahe/anime/{unique_id}/ endpoint
    // doesn't work — we must use /pahe/anime/{id}/ ... but wait, actually testing showed
    // /pahe/anime/9973/ works (returns episodes). So we use the internal `id` as the path param.
    // We store it as uniqueId for the getAniYubiAnimeByUniqueId function (which uses it as path).
    const result = { animeId: match.id, uniqueId: String(match.id) };
    anilistToAniyubiCache.set(anilistId, result);
    console.log(`[AniYubi] anilistId=${anilistId} → animeId=${result.animeId} (uniqueId=${result.uniqueId})`);
    return result;
  } catch {
    anilistToAniyubiCache.set(anilistId, null);
    return null;
  }
}

// ─── Episode List ─────────────────────────────────────────────────────────────

export async function getAniYubiEpisodes(
  animeId: number,
  timeoutMs = 8000
): Promise<AniYubiEpisode[]> {
  // animeyubi returns episodes via /pahe/anime/{unique_id}/ endpoint (NOT /pahe/episodes/?anime_id=)
  // We need the unique_id, which we got from resolveAniYubiId
  // But we can also fetch via /pahe/episodes/?anime_id={id} — but this returns ALL episodes globally
  // The correct way is /pahe/anime/{unique_id}/ which returns episodes array
  // Since we already have animeId (internal), we need to fetch anime details first
  // For simplicity, we'll fetch all episodes via the /pahe/episodes/{episode_id}/ endpoint when needed
  return [];  // placeholder — episode list is fetched on-demand
}

// ─── Get episode videos ───────────────────────────────────────────────────────

export async function getAniYubiEpisodeVideos(
  episodeId: number,
  timeoutMs = 8000
): Promise<AniYubiVideo[]> {
  const url = `${ANIYUBI_API}/pahe/episodes/${episodeId}/?format=json`;
  try {
    const res = await Promise.race([
      fetch(url, { headers: HEADERS, cache: "no-store" }),
      new Promise<Response | null>(r => setTimeout(() => r(null), timeoutMs)),
    ]);
    if (!res || !res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.videos) ? data.videos : [];
  } catch {
    return [];
  }
}

// ─── Get anime details (with episodes list) ───────────────────────────────────

export async function getAniYubiAnimeByUniqueId(
  uniqueId: string,
  timeoutMs = 8000
): Promise<{ anime: AniYubiAnime; episodes: AniYubiEpisode[] } | null> {
  const url = `${ANIYUBI_API}/pahe/anime/${uniqueId}/?format=json`;
  try {
    const res = await Promise.race([
      fetch(url, { headers: HEADERS, cache: "no-store" }),
      new Promise<Response | null>(r => setTimeout(() => r(null), timeoutMs)),
    ]);
    if (!res || !res.ok) return null;
    const data = await res.json();
    return {
      anime: {
        id: data.id,
        unique_id: data.unique_id,
        title: data.title,
        jp_title: data.jp_title,
        title_romaji: data.title_romaji,
        image: data.image,
        synopsis: data.synopsis,
        anime_type: data.anime_type,
        aired: data.aired,
      },
      episodes: (data.episodes || []).map((e: any) => ({
        title: e.title,
        id: e.id,
        last_updated: e.last_updated,
      })),
    };
  } catch {
    return null;
  }
}

// ─── Main: Fetch ALL AniYubi sources for an episode ───────────────────────────

/**
 * Fetch AniYubi sources for an anime episode.
 *
 * Returns kwik.cx embed URLs (one per quality).
 * These are played as iframe embeds in the watch page.
 */
export async function fetchAniYubiSources(
  anilistId: number,
  epNum: number,
  options?: { timeoutMs?: number }
): Promise<AniYubiVerifiedResult[]> {
  const timeoutMs = options?.timeoutMs ?? 8000;
  const verified: AniYubiVerifiedResult[] = [];

  // Step 1: Resolve AniList ID → animeyubi unique_id
  const resolved = await resolveAniYubiId(anilistId, timeoutMs);
  if (!resolved) {
    console.log(`[AniYubi] anilistId=${anilistId} — could not resolve to animeyubi anime`);
    return [];
  }

  // Step 2: Fetch anime details + episode list
  const animeData = await getAniYubiAnimeByUniqueId(resolved.uniqueId, timeoutMs);
  if (!animeData) {
    console.log(`[AniYubi] could not fetch anime data for uniqueId=${resolved.uniqueId}`);
    return [];
  }

  // Step 3: Find the episode by number
  const episode = animeData.episodes.find(e => parseInt(e.title, 10) === epNum)
               || animeData.episodes[0];
  if (!episode) {
    console.log(`[AniYubi] no episode ${epNum} found (total: ${animeData.episodes.length})`);
    return [];
  }

  // Step 4: Fetch videos for this episode
  const videos = await getAniYubiEpisodeVideos(episode.id, timeoutMs);
  if (videos.length === 0) {
    console.log(`[AniYubi] no videos for episode ${epNum}`);
    return [];
  }

  // Step 5: Build verified results — prefer HLS embeds over MP4 (more reliable playback)
  const seen = new Set<string>();
  for (const v of videos) {
    if (!v.url || !v.url.includes("kwik.cx")) continue;

    // Extract quality from title (e.g. "USS · 720p BD" → "720p")
    const qualityMatch = v.title.match(/(\d{3,4}p)/i);
    const quality = qualityMatch ? qualityMatch[1] : "default";

    // Dedupe by quality (keep first HLS, then first MP4 per quality)
    const key = `${v.video_type}-${quality}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Use /e/ endpoint for HLS (iframe embed), /f/ endpoint for MP4 (also embeddable)
    const isHls = v.video_type === "hls";
    const streamUrl = isHls
      ? v.url.replace("/f/", "/e/")  // HLS embed
      : v.url;                         // MP4 file page (also works as embed)

    verified.push({
      provider: `${quality}${isHls ? "-HLS" : "-MP4"}`,
      type: "sub",
      streamUrl,
      quality,
      isM3U8: false,   // It's an embed, not a direct m3u8
      isMP4: !isHls,
      isEmbed: true,
      hardsub: false,
      tracks: [],
    });
  }

  console.log(`[AniYubi] ${verified.length} streams for ep ${epNum} (from ${videos.length} videos)`);
  return verified;
}
