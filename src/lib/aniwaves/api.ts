/**
 * AniWaves API — aniwaves.ru scraper
 * 
 * Flow:
 * 1. Search by title → get aniwaves ID + slug
 * 2. Get episode list → get episode data-ids
 * 3. Get server list → get server link-ids
 * 4. Get sources → get embed URL (play.echovideo.ru)
 * 
 * The embed URL is loaded as an iframe — the player (JWPlayer) handles
 * the m3u8 internally.
 */

const BASE = "https://aniwaves.ru";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "X-Requested-With": "XMLHttpRequest",
  "Referer": BASE + "/",
};

interface AniWavesSearchResult {
  title: string;
  slug: string;
  aniwavesId: number;
  url: string;
  poster?: string;
}

interface AniWavesEpisode {
  number: number;
  title?: string;
  airDate?: string;
  hasSub: boolean;
  hasDub: boolean;
  dataIds: string;
}

interface AniWavesServer {
  serverId: number;
  serverName: string;
  type: "sub" | "dub";
  linkId: string;
}

interface AniWavesSource {
  url: string;
  server: number;
  intro?: { start: number; end: number };
  outro?: { start: number; end: number };
}

/**
 * Search anime by title on aniwaves.ru
 */
export async function searchAniWaves(query: string): Promise<AniWavesSearchResult[]> {
  try {
    const url = `${BASE}/ajax/anime/search?keyword=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const data = await res.json();
    let html = "";
    if (typeof data?.result === "string") html = data.result;
    else if (typeof data?.result?.html === "string") html = data.result.html;
    else if (typeof data === "string") html = data;
    
    // Parse results from HTML
    const results: AniWavesSearchResult[] = [];
    const regex = /href="\/watch\/([a-z0-9-]+)-(\d+)"/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
      const slug = match[1];
      const aniwavesId = parseInt(match[2]);
      // Extract title from the link text
      const titleRegex = new RegExp(`href="/watch/${slug}-${aniwavesId}"[^>]*>([^<]+)`);
      const titleMatch = titleRegex.exec(html);
      const title = titleMatch ? titleMatch[1].trim() : slug.replace(/-/g, " ");
      
      results.push({
        title,
        slug,
        aniwavesId,
        url: `${BASE}/watch/${slug}-${aniwavesId}`,
      });
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * Find aniwaves anime by AniList ID (searches by title)
 */
export async function findAniWavesByTitle(title: string): Promise<AniWavesSearchResult | null> {
  const results = await searchAniWaves(title);
  if (results.length === 0) return null;
  // Return first result (best match)
  return results[0];
}

/**
 * Get episode list for an anime
 */
export async function getEpisodes(aniwavesId: number): Promise<AniWavesEpisode[]> {
  try {
    const url = `${BASE}/ajax/episode/list/${aniwavesId}`;
    const res = await fetch(url, { 
      headers: { ...HEADERS, Referer: `${BASE}/watch/${aniwavesId}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    let html = "";
    if (typeof data?.result === "string") html = data.result;
    else if (typeof data?.result?.html === "string") html = data.result.html;
    
    const episodes: AniWavesEpisode[] = [];
    const regex = /data-num="(\d+)"[^>]*data-ids="([^"]*)"[^>]*data-sub="(\d)"[^>]*data-dub="(\d)"/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
      episodes.push({
        number: parseInt(match[1]),
        dataIds: match[2],
        hasSub: match[3] === "1",
        hasDub: match[4] === "1",
      });
    }
    return episodes;
  } catch {
    return [];
  }
}

/**
 * Get available servers for an episode
 */
export async function getServers(aniwavesId: number, episode: number): Promise<AniWavesServer[]> {
  try {
    const url = `${BASE}/ajax/server/list?servers=${aniwavesId}&eps=${episode}`;
    const res = await fetch(url, {
      headers: { ...HEADERS, Referer: `${BASE}/watch/${aniwavesId}/ep-${episode}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    let html = "";
    if (typeof data?.result === "string") html = data.result;
    else if (typeof data?.result?.html === "string") html = data.result.html;
    
    const servers: AniWavesServer[] = [];
    // Parse server entries: data-sv-id="4" data-link-id="..."
    const regex = /data-sv-id="(\d+)"[^>]*data-link-id="([^"]+)"/g;
    const typeRegex = /data-type="(sub|dub)"/g;
    
    // Find all type sections
    const sections = html.split(/data-type="(sub|dub)"/);
    let currentType: "sub" | "dub" = "sub";
    
    let match;
    while ((match = regex.exec(html)) !== null) {
      // Find the nearest type section
      const beforeText = html.substring(0, match.index);
      const lastTypeMatch = /data-type="(sub|dub)"/g.exec(beforeText);
      if (lastTypeMatch) currentType = lastTypeMatch[1] as "sub" | "dub";
      
      const serverId = parseInt(match[1]);
      const linkId = match[2];
      const serverName = serverId === 4 ? "Echovideo" : serverId === 1 ? "Server 1" : serverId === 2 ? "Server 2" : `Server ${serverId}`;
      
      servers.push({
        serverId,
        serverName,
        type: currentType,
        linkId,
      });
    }
    return servers;
  } catch {
    return [];
  }
}

/**
 * Get the embed URL for a server
 */
export async function getSourceUrl(linkId: string, aniwavesId: number, episode: number): Promise<string | null> {
  try {
    const url = `${BASE}/ajax/sources?id=${linkId}&asi=&autoPlay=0`;
    const res = await fetch(url, {
      headers: { ...HEADERS, Referer: `${BASE}/watch/${aniwavesId}/ep-${episode}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.result;
    if (typeof result === "object" && result?.url) {
      return result.url;
    }
    if (typeof result === "string") {
      // Try to extract URL from string
      const urlMatch = result.match(/(https?:\/\/[^\s"]+)/);
      if (urlMatch) return urlMatch[1];
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Full resolve: AniList ID → title → search → episodes → servers → embed URL
 */
export async function resolveAniWavesStreams(
  anilistId: number,
  episode: number,
  title: string,
): Promise<Array<{
  id: string;
  name: string;
  source: string;
  type: string;
  quality: string;
  streamUrl: string;
  isM3U8: boolean;
  isEmbed: boolean;
}>> {
  // Step 1: Search by title
  const searchResult = await findAniWavesByTitle(title);
  if (!searchResult) return [];
  
  // Step 2: Get servers for this episode
  const servers = await getServers(searchResult.aniwavesId, episode);
  if (servers.length === 0) return [];
  
  // Step 3: Get embed URL for each server (parallel)
  const sources = await Promise.all(
    servers.map(async (server) => {
      const embedUrl = await getSourceUrl(server.linkId, searchResult.aniwavesId, episode);
      if (!embedUrl) return null;
      return {
        id: `aniwaves:${server.type}:${server.serverId}`,
        name: `Waves ${server.serverName}${server.type === "dub" ? " (Dub)" : ""}`,
        source: "aniwaves" as const,
        type: server.type,
        quality: "1080p",
        streamUrl: embedUrl,
        isM3U8: false,
        isEmbed: true,
      };
    })
  );
  
  return sources.filter(Boolean) as any[];
}
