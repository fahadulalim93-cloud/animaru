/**
 * anibd.app scraper — direct m3u8 streams (no login, no embeds).
 *
 * API flow (all public, CORS-enabled):
 *   1. Episode list: GET https://epeng.animeapps.top/api2.php?epid={anilistId}
 *      Returns: [{ server_name, id, server_data: [{ name, slug, link }] }]
 *      Uses AniList ID directly — no slug/title search needed.
 *
 *   2. Stream URL: GET https://epeng.animeapps.top/apilink.php?data={linkId}
 *      Returns: [{ server: "SR", link: "https://playeng.animeapps.top/r2/play2.php?id=ani9&url={hash}" }]
 *
 *   3. Extract m3u8: fetch the play page HTML → parse config.videoUrl
 *      config.videoUrl = "/r2/cachehd/{hash}/index.m3u8"
 *      Full URL: https://playeng.animeapps.top{videoUrl}
 *      CORS: access-control-allow-origin: * (no proxy needed!)
 */

const EPENG_API = "https://epeng.animeapps.top";
const PLAY_BASE = "https://playeng.animeapps.top";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface AnibdServer {
  serverName: string;
  serverId: number;
  linkId: string;
}

export interface AnibdStreamResult {
  provider: "anibd";
  type: "sub" | "dub";
  quality: string;
  streamUrl: string;       // direct m3u8 URL
  isM3U8: boolean;
  isMP4: boolean;
  isEmbed: boolean;
  serverName: string;
  subtitleTracks: Array<{ url: string; lang: string; label: string }>;
  intro: null;
  outro: null;
}

/**
 * Fetch the episode list for an anime by AniList ID.
 * Returns servers with their episode → linkId mapping.
 */
export async function fetchAnibdEpisodes(
  anilistId: number,
  episodeNum: number
): Promise<AnibdServer[]> {
  try {
    const url = `${EPENG_API}/api2.php?epid=${anilistId}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];

    const servers: AnibdServer[] = [];
    for (const server of data) {
      const serverName = server.server_name || `Server ${server.id}`;
      const serverId = server.id;
      const episodes = server.server_data || [];

      // Find the episode matching the requested number
      // Episode names are like "01", "02", etc.
      const epStr = String(episodeNum).padStart(2, "0");
      const ep = episodes.find(
        (e: any) => e.name === epStr ||
                    e.name === String(episodeNum) ||
                    e.slug === epStr ||
                    e.slug === String(episodeNum)
      );
      if (ep && ep.link) {
        servers.push({ serverName, serverId, linkId: ep.link });
      }
    }
    return servers;
  } catch {
    return [];
  }
}

/**
 * Resolve a linkId to a direct m3u8 URL.
 * Calls apilink.php → gets play page URL → fetches play page → extracts m3u8.
 */
export async function resolveAnibdStream(
  linkId: string
): Promise<string | null> {
  try {
    // Step 1: Get play page URL from apilink.php
    const apiUrl = `${EPENG_API}/apilink.php?data=${linkId}`;
    const apiRes = await fetch(apiUrl, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!apiRes.ok) return null;
    const apiData = await apiRes.json();
    if (!Array.isArray(apiData) || apiData.length === 0) return null;

    // Try each server (SR, SB, etc.) — return the first that works
    for (const server of apiData) {
      const playUrl = server.link;
      if (!playUrl) continue;

      // Step 2: Fetch the play page HTML
      const playRes = await fetch(playUrl, {
        headers: { "User-Agent": UA, Referer: "https://anibd.app/" },
        signal: AbortSignal.timeout(8000),
      });
      if (!playRes.ok) continue;
      const html = await playRes.text();

      // Step 3: Extract m3u8 from config.videoUrl
      const m = html.match(/videoUrl\s*:\s*["']([^"']+)["']/);
      if (m && m[1]) {
        const videoPath = m[1];
        // If it's a relative path, prepend the play page origin
        if (videoPath.startsWith("/")) {
          return `${PLAY_BASE}${videoPath}`;
        }
        return videoPath;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Convenience: fetch episodes + resolve stream URLs in one call.
 * Returns one stream per server.
 */
export async function resolveAnibdStreams(
  anilistId: number,
  episodeNum: number
): Promise<AnibdStreamResult[]> {
  const servers = await fetchAnibdEpisodes(anilistId, episodeNum);
  if (servers.length === 0) return [];

  const results: AnibdStreamResult[] = [];

  await Promise.all(servers.map(async (server) => {
    const m3u8Url = await resolveAnibdStream(server.linkId);
    if (!m3u8Url) return;

    // Determine sub/dub from server name
    const nameLower = server.serverName.toLowerCase();
    const type: "sub" | "dub" = nameLower.includes("dub") ? "dub" : "sub";

    results.push({
      provider: "anibd",
      type,
      quality: "1080p",
      streamUrl: m3u8Url,
      isM3U8: true,
      isMP4: false,
      isEmbed: false,
      serverName: server.serverName,
      subtitleTracks: [],
      intro: null,
      outro: null,
    });
  }));

  return results;
}
