/**
 * AnimeHeaven.me API Client
 * --------------------------
 * AnimeHeaven is a PHP-based anime site with direct MP4 streams.
 *
 * Flow:
 *   1. Search: GET /search.php?s={title} → parse anime.php?{id} links
 *   2. Episodes: GET /anime.php?{id} → parse gatea("{epId}") calls + episode numbers
 *   3. Stream: Set cookie key={epId}, GET /gate.php → parse <source src="..."> tags
 *      Returns direct MP4 URLs from py/ct/ck.animeheaven.me
 *
 * MP4 URLs work without Referer but have CORS restricted to animeheaven.me.
 * We wrap them through our worker proxy which adds permissive CORS headers.
 */

const BASE = "https://animeheaven.me";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const HEADERS: Record<string, string> = {
  "User-Agent": UA,
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://animeheaven.me/",
};

// Use aniwatchtv proxy (same as all other sources) — NOT the worker
import { wrapStreamUrl } from "./proxy";

export interface AnimeHeavenResult {
  provider: string;
  type: "sub";
  streamUrl: string;
  quality: string;
  isM3U8: boolean;
  isMP4: boolean;
  isEmbed: boolean;
  hardsub: boolean;
  tracks: never[];
}

// Search for anime
async function searchAnimeHeaven(title: string, timeoutMs = 8000): Promise<string | null> {
  try {
    const res = await Promise.race([
      fetch(`${BASE}/search.php?s=${encodeURIComponent(title)}`, { headers: HEADERS, cache: "no-store" }),
      new Promise<Response | null>(r => setTimeout(() => r(null), timeoutMs)),
    ]);
    if (!res || !res.ok) return null;
    const html = await res.text();
    // Parse anime.php?{id} links
    const match = html.match(/href='anime\.php\?([a-zA-Z0-9]+)'[^>]*>[^<]*<img[^>]*alt='([^']+)'/);
    if (match) return match[1]; // Return the first anime ID
    // Fallback: just find any anime.php link
    const fallback = html.match(/href='anime\.php\?([a-zA-Z0-9]+)'/);
    return fallback ? fallback[1] : null;
  } catch {
    return null;
  }
}

// Get episode IDs from anime page
async function getEpisodes(animeId: string, epNum: number, timeoutMs = 8000): Promise<{ epId: string; epNum: number } | null> {
  try {
    const res = await Promise.race([
      fetch(`${BASE}/anime.php?${animeId}`, { headers: HEADERS, cache: "no-store" }),
      new Promise<Response | null>(r => setTimeout(() => r(null), timeoutMs)),
    ]);
    if (!res || !res.ok) return null;
    const html = await res.text();

    // Find all episodes: gatea("epId") ... Episode ... 1167 ...
    // Use string matching instead of regex to avoid parsing issues
    const gateMatches = html.match(/gatea\("([a-f0-9]+)"\)/g) || [];
    const epNumMatches = html.match(/watch2 bc '>(\d+)</g) || [];
    for (let i = 0; i < gateMatches.length && i < epNumMatches.length; i++) {
      const epId = gateMatches[i].match(/gatea\("([a-f0-9]+)"\)/)?.[1];
      const num = parseInt(epNumMatches[i].match(/(\d+)/)?.[1] || "0", 10);
      if (epId && num === epNum) return { epId, epNum: num };
    }
    // If exact episode not found, try first episode
    const firstMatch = html.match(/gatea\("([a-f0-9]+)"\)/);
    if (firstMatch) return { epId: firstMatch[1], epNum: 1 };
    return null;
  } catch {
    return null;
  }
}

// Get stream URL from gate.php
async function getStreamUrl(epId: string, timeoutMs = 8000): Promise<string | null> {
  try {
    const res = await Promise.race([
      fetch(`${BASE}/gate.php`, {
        headers: { ...HEADERS, Cookie: `key=${epId}` },
        cache: "no-store",
      }),
      new Promise<Response | null>(r => setTimeout(() => r(null), timeoutMs)),
    ]);
    if (!res || !res.ok) return null;
    const html = await res.text();
    // Parse <source src='URL' type='video/mp4'>
    const match = html.match(/<source src='([^']+)' type='video\/mp4'/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// Main: fetch AnimeHeaven sources
export async function fetchAnimeHeavenSources(
  anilistId: number,
  epNum: number,
  options?: { timeoutMs?: number }
): Promise<AnimeHeavenResult[]> {
  const timeoutMs = options?.timeoutMs ?? 8000;

  // Get title from AniList
  let title: string;
  try {
    const titleRes = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({
        query: `query($id:Int){Media(id:$id,type:ANIME){id title{english romaji native}}}`,
        variables: { id: anilistId },
      }),
      cache: "no-store",
    });
    const titleData = await titleRes.json();
    title = titleData?.data?.Media?.title?.english || titleData?.data?.Media?.title?.romaji || "";
    if (!title) return [];
  } catch {
    return [];
  }

  // Step 1: Search
  const animeId = await searchAnimeHeaven(title, timeoutMs);
  if (!animeId) {
    console.log(`[AnimeHeaven] no results for "${title}"`);
    return [];
  }

  // Step 2: Get episode ID
  const epData = await getEpisodes(animeId, epNum, timeoutMs);
  if (!epData) {
    console.log(`[AnimeHeaven] no episode ${epNum} found`);
    return [];
  }

  // Step 3: Get stream URL
  const mp4Url = await getStreamUrl(epData.epId, timeoutMs);
  if (!mp4Url) {
    console.log(`[AnimeHeaven] no stream URL for ep ${epNum}`);
    return [];
  }

  console.log(`[AnimeHeaven] found MP4: ${mp4Url.slice(0, 80)}...`);

  // Wrap through aniwatchtv proxy (same as all other sources)
  const streamUrl = wrapStreamUrl(mp4Url);

  return [{
    provider: "animeheaven",
    type: "sub" as const,
    streamUrl,
    quality: "auto",
    isM3U8: false,
    isMP4: true,
    isEmbed: false,
    hardsub: false,
    tracks: [],
  }];
}
