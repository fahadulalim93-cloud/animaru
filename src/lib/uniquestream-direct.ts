/**
 * UniqueStream.net scraper — direct m3u8 streams with multi-language hardsubs
 *
 * API: https://anime.uniquestream.net/api/v1
 *   - /search?q={query} → series + movies
 *   - /series/{contentId} → seasons with content_ids
 *   - /season/{seasonId}/episodes?page=1&limit=100 → episode list
 *   - /episode/{episodeId}/media/hls/{audioLocale} → HLS stream URL + hardsub variants
 *
 * Stream response:
 *   {
 *     "hls": {
 *       "playlist": "https://get4.mediacache.cc/.../master.m3u8?sign=...&expires=...",
 *       "locale": "ja-JP",
 *       "hard_subs": [{ "locale": "en-US", "playlist": "..." }, ...],
 *       "subtitles": null  // no soft subs — only hardsub variants
 *     },
 *     "coming_soon": null  // null = available, true = not yet
 *   }
 *
 * The m3u8 URLs are signed + expire after ~24h. They work directly (no proxy needed).
 */

const API = "https://anime.uniquestream.net/api/v1";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

export interface UniqueStreamResult {
  provider: "uniquestream";
  type: "sub" | "dub";
  quality: string;
  streamUrl: string;     // direct m3u8 URL (signed, expires in ~24h)
  isM3U8: boolean;
  isMP4: boolean;
  isEmbed: boolean;
  hardsub: boolean;
  serverName: string;
  subtitleTracks: Array<{ url: string; lang: string; label: string }>; // empty — hardsub only
}

async function apiFetch(path: string): Promise<any> {
  try {
    const res = await fetch(`${API}${path}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Search for a series by title. Returns the first matching series content_id.
 */
async function searchSeries(title: string): Promise<string | null> {
  const data = await apiFetch(`/search?q=${encodeURIComponent(title)}&page=1&limit=5`);
  const series = data?.series || [];
  if (series.length === 0) return null;

  // Best match by title
  const normalized = title.toLowerCase();
  const exact = series.find((s: any) =>
    (s.title || "").toLowerCase() === normalized ||
    (s.english_name || "").toLowerCase() === normalized
  );
  return (exact || series[0]).content_id;
}

/**
 * Get all seasons for a series.
 */
async function getSeasons(seriesId: string): Promise<Array<{ content_id: string; season_number: number; title: string }>> {
  const data = await apiFetch(`/series/${seriesId}`);
  return (data?.seasons || []).map((s: any) => ({
    content_id: s.content_id,
    season_number: s.season_number,
    title: s.title,
  }));
}

/**
 * Get episodes for a season. Returns array of { content_id, episode_number, title }.
 */
async function getEpisodes(seasonId: string): Promise<Array<{ content_id: string; episode_number: number; title: string }>> {
  const data = await apiFetch(`/season/${seasonId}/episodes?page=1&limit=100`);
  return (data || []).map((ep: any) => ({
    content_id: ep.content_id,
    episode_number: ep.episode_number,
    title: ep.title,
  }));
}

/**
 * Get the HLS stream URL for an episode.
 * Tries multiple audio locales (en-US, ja-JP).
 * Returns the m3u8 URL + hardsub variants.
 */
async function getStream(
  episodeId: string,
  audioLocale: string = "en-US"
): Promise<{ m3u8Url: string; hardSubs: Array<{ locale: string; url: string }> } | null> {
  const data = await apiFetch(`/episode/${episodeId}/media/hls/${audioLocale}`);
  if (!data || data.coming_soon === true) return null;

  const hls = data.hls;
  if (!hls?.playlist) return null;

  const hardSubs = (hls.hard_subs || []).map((hs: any) => ({
    locale: hs.locale,
    url: hs.playlist,
  }));

  return {
    m3u8Url: hls.playlist,
    hardSubs,
  };
}

/**
 * Main entry: resolve all streams for an anime + episode.
 *
 * Flow:
 *   1. Search by title → find series content_id
 *   2. Get seasons → find the right season (season 1 for ep 1-12, etc.)
 *   3. Get episodes for that season → find the requested episode
 *   4. Get HLS stream URL (try en-US first, then ja-JP)
 *   5. Return the m3u8 + hardsub variants
 */
export async function resolveUniqueStreamStreams(
  anilistId: number,
  episodeNum: number,
  title?: string,
): Promise<UniqueStreamResult[]> {
  try {
    if (!title) return [];

    // 1. Search for the series
    const seriesId = await searchSeries(title);
    if (!seriesId) return [];

    // 2. Get seasons
    const seasons = await getSeasons(seriesId);
    if (seasons.length === 0) return [];

    // 3. Find the right season + episode
    // Try each season until we find the episode
    let episodeId: string | null = null;
    for (const season of seasons) {
      const episodes = await getEpisodes(season.content_id);
      const ep = episodes.find(e => Math.floor(e.episode_number) === episodeNum);
      if (ep) {
        episodeId = ep.content_id;
        break;
      }
    }
    if (!episodeId) return [];

    // 4. Get stream URL — try multiple audio locales
    const results: UniqueStreamResult[] = [];

    // Try English dub first
    const enStream = await getStream(episodeId, "en-US");
    if (enStream) {
      results.push({
        provider: "uniquestream",
        type: "dub",
        quality: "1080p",
        streamUrl: enStream.m3u8Url,
        isM3U8: true,
        isMP4: false,
        isEmbed: false,
        hardsub: false,
        serverName: "UniqueStream EN",
        subtitleTracks: [],
      });

      // Add hardsub variants (English hardsub from Japanese audio)
      const enHardSub = enStream.hardSubs.find(hs => hs.locale === "en-US");
      if (enHardSub) {
        results.push({
          provider: "uniquestream",
          type: "sub",
          quality: "1080p",
          streamUrl: enHardSub.url,
          isM3U8: true,
          isMP4: false,
          isEmbed: false,
          hardsub: true,
          serverName: "UniqueStream EN Hardsub",
          subtitleTracks: [],
        });
      }
    }

    // Try Japanese audio (subbed)
    const jaStream = await getStream(episodeId, "ja-JP");
    if (jaStream) {
      results.push({
        provider: "uniquestream",
        type: "sub",
        quality: "1080p",
        streamUrl: jaStream.m3u8Url,
        isM3U8: true,
        isMP4: false,
        isEmbed: false,
        hardsub: false,
        serverName: "UniqueStream JP",
        subtitleTracks: [],
      });

      // Add English hardsub variant from Japanese audio
      const enHardSub = jaStream.hardSubs.find(hs => hs.locale === "en-US");
      if (enHardSub) {
        results.push({
          provider: "uniquestream",
          type: "sub",
          quality: "1080p",
          streamUrl: enHardSub.url,
          isM3U8: true,
          isMP4: false,
          isEmbed: false,
          hardsub: true,
          serverName: "UniqueStream JP+EN Sub",
          subtitleTracks: [],
        });
      }
    }

    console.log(`[UniqueStream] ${anilistId} ep${episodeNum}: ${results.length} streams from ${seriesId}`);
    return results;
  } catch (e: any) {
    console.log(`[UniqueStream] error for ${anilistId} ep${episodeNum}: ${e?.message || e}`);
    return [];
  }
}
