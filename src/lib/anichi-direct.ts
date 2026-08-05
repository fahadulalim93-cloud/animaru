/**
 * AniKoto scraper — bypasses Cloudflare, returns streams + subtitles + skip times
 *
 * Site structure:
 *   - Search: /filter?keyword={kw}  → returns anime cards with /anime/{slug}-{id}
 *   - Anime page: /anime/{slug} → has #watch-main with data-id, data-mal-id, data-anilist-id
 *   - Episode list: /ajax/episode/list/{mangaId}?vrf={mangaId}&style= → JSON {status, result: HTML}
 *       Each episode <a> has: data-id, data-num, data-slug, data-mal, data-timestamp, data-sub, data-dub, data-ids (base64 server list)
 *   - Server list: /ajax/server/list?servers={data-ids} → JSON {status, result: HTML}
 *       Each server <li> has: data-ep-id, data-sv-id, data-link-id (base64)
 *       Servers are grouped by type: sub / hsub / dub
 *   - Stream URL: /ajax/server?get={data-link-id} → JSON {status, result: {url, skip_data: {intro: [start,end], outro: [start,end]}}}
 *       The URL is a vidtube.site/megaplay.buzz embed player page
 *
 * Stream types returned:
 *   - "sub" servers → soft sub embed (vidtube.site)
 *   - "hsub" servers → hard sub embed (same CDNs)
 *   - "dub" servers → English dub embed
 *
 * The embed URLs are iframe-able. Our existing embed player (hls-player-new.tsx
 * with isEmbed=true) can play them.
 *
 * Skip times: returned in skip_data as [start, end] in seconds
 */

import { wrapM3u8Url, wrapStreamUrl } from "./proxy";

const ANICHI_BASE = "https://anikototv.to";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100100 Firefox/121.0";

interface AniKotoEpisode {
  num: number;
  slug: string;
  malId: string;
  timestamp: string;
  episodeId: string; // data-id
  serverIds: string; // data-ids (base64)
  hasSub: boolean;
  hasDub: boolean;
}

interface AniKotoServer {
  serverId: string; // data-sv-id
  linkId: string; // data-link-id (base64)
  name: string; // "VidPlay-1", "HD-1", etc.
  type: "sub" | "hsub" | "dub";
  episodeId: string;
}

export interface AniKotoStreamResult {
  provider: "anichi";
  type: "sub" | "dub";
  quality: string;
  streamUrl: string; // embed URL (iframe-able)
  isM3U8: boolean;
  isMP4: boolean;
  isEmbed: boolean;
  hardsub: boolean;
  serverName: string;
  intro: { start: number; end: number } | null;
  outro: { start: number; end: number } | null;
  subtitleTracks: Array<{ url: string; lang: string; label: string }>; // AniKoto embeds don't expose subs directly
}

/**
 * Fetch with proper headers (bypasses basic Cloudflare checks)
 */
async function anichiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    "User-Agent": UA,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "identity",
    ...((options.headers as Record<string, string>) || {}),
  };
  // Always send Referer for ajax calls
  if (url.includes("/ajax/")) {
    headers["Referer"] = `${ANICHI_BASE}/`;
    headers["X-Requested-With"] = "XMLHttpRequest";
  }
  // Add 10s timeout to prevent dead server hangs
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, { ...options, headers, redirect: "follow", signal: controller.signal });
    clearTimeout(timeout);
    return res;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

/**
 * Search AniKoto for anime by title. Returns the best matching slug.
 * Prefers exact title matches (e.g. "One Piece" → "one-piece", not
 * "one-piece-episode-of-luffy-hand-island-adventure").
 * URL: /filter?keyword={kw}
 */
export async function searchAniKoto(title: string): Promise<string | null> {
  try {
    const url = `${ANICHI_BASE}/filter?keyword=${encodeURIComponent(title)}`;
    const res = await anichiFetch(url);
    if (!res.ok) return null;
    const html = await res.text();

    // Collect ALL anime slugs from search results
    // The site may use different domain patterns in hrefs: anichi.to, anikoto.pro, anikototv.to
    const slugs: string[] = [];
    const seen = new Set<string>();
    const matches = html.matchAll(/href="https?:\/\/(?:anichi\.to|anikoto\.pro|anikototv\.to|anikoto\.to)\/anime\/([a-z0-9-]+)"/gi);
    for (const m of matches) {
      const slug = m[1];
      if (seen.has(slug)) continue;
      seen.add(slug);
      slugs.push(slug);
    }
    if (slugs.length === 0) return null;
    if (slugs.length === 1) return slugs[0];

    // Normalize the search title for comparison
    const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    // Score each slug: exact match > starts with title > contains title
    let bestSlug = slugs[0];
    let bestScore = -1;
    for (const slug of slugs) {
      let score = 0;
      if (slug === normalizedTitle) score = 100;
      else if (slug.startsWith(normalizedTitle + "-") || slug.startsWith(normalizedTitle)) score = 80;
      else if (slug.includes(normalizedTitle)) score = 60;
      else score = 10;
      // Penalize movies/specials
      if (slug.includes("movie") || slug.includes("film") || slug.includes("special") || slug.includes("recap") || slug.includes("episode-of")) score -= 20;
      // Prefer shorter slugs (main series over specials)
      score -= slug.length * 0.05;
      if (score > bestScore) {
        bestScore = score;
        bestSlug = slug;
      }
    }
    return bestSlug;
  } catch {
    return null;
  }
}

/**
 * Get the internal mangaId (data-id) + MAL ID from an anime page.
 * URL: /anime/{slug}
 */
export async function getAniKotoAnimeInfo(slug: string): Promise<{
  mangaId: string;
  malId: string | null;
  anilistId: string | null;
} | null> {
  try {
    const url = `${ANICHI_BASE}/anime/${slug}`;
    const res = await anichiFetch(url);
    if (!res.ok) return null;
    const html = await res.text();
    // The #watch-main div has data-id, data-mal-id, data-anilist-id
    // But /anime/{slug} might not have #watch-main — try /watch/{slug}/ep-1 instead
    const watchMatch = html.match(/id="watch-main"\s+data-id="(\d+)"(?:\s+data-mal-id="(\d+)")?(?:\s+data-anilist-id="(\d+)")?/);
    if (watchMatch) {
      return {
        mangaId: watchMatch[1],
        malId: watchMatch[2] || null,
        anilistId: watchMatch[3] || null,
      };
    }
    // If no #watch-main, fetch the first episode page to get the mangaId
    const epMatch = html.match(/href="https:\/\/anichi\.to\/watch\/([a-z0-9-]+)\/ep-1"/i);
    if (epMatch) {
      const epUrl = `${ANICHI_BASE}/watch/${epMatch[1]}/ep-1`;
      const epRes = await anichiFetch(epUrl);
      if (epRes.ok) {
        const epHtml = await epRes.text();
        const m = epHtml.match(/id="watch-main"\s+data-id="(\d+)"(?:\s+data-mal-id="(\d+)")?(?:\s+data-anilist-id="(\d+)")?/);
        if (m) {
          return {
            mangaId: m[1],
            malId: m[2] || null,
            anilistId: m[3] || null,
          };
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get episode list for an anime.
 * URL: /ajax/episode/list/{mangaId}?vrf={mangaId}&style=
 */
export async function getAniKotoEpisodes(mangaId: string): Promise<AniKotoEpisode[]> {
  try {
    const url = `${ANICHI_BASE}/ajax/episode/list/${mangaId}?vrf=${mangaId}&style=`;
    const res = await anichiFetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    if (data.status !== 200 || !data.result) return [];
    const html: string = data.result;
    // Each episode is an <a> with data-id, data-num, data-slug, data-mal, data-timestamp, data-sub, data-dub, data-ids
    const episodeRegex = /data-id="(\d+)"\s+data-num="(\d+)"\s+data-slug="([^"]+)"\s+data-mal="([^"]+)"\s+data-timestamp="([^"]+)"\s+data-sub="(\d)"\s+data-dub="(\d)"\s+data-ids="([^"]+)"/g;
    const episodes: AniKotoEpisode[] = [];
    let match;
    while ((match = episodeRegex.exec(html)) !== null) {
      episodes.push({
        episodeId: match[1],
        num: parseInt(match[2], 10),
        slug: match[3],
        malId: match[4],
        timestamp: match[5],
        hasSub: match[6] === "1",
        hasDub: match[7] === "1",
        serverIds: match[8],
      });
    }
    return episodes;
  } catch {
    return [];
  }
}

/**
 * Get server list for an episode.
 * URL: /ajax/server/list?servers={data-ids}
 */
export async function getAniKotoServers(serverIdsBase64: string): Promise<AniKotoServer[]> {
  try {
    const url = `${ANICHI_BASE}/ajax/server/list?servers=${encodeURIComponent(serverIdsBase64)}`;
    const res = await anichiFetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    if (data.status !== 200 || !data.result) return [];
    const html: string = data.result;
    // Servers are in <div class="type" data-type="sub|hsub|dub"><ul><li data-ep-id data-sv-id data-link-id>Name</li></ul></div>
    const servers: AniKotoServer[] = [];
    const typeRegex = /<div class="type"\s+data-type="(sub|hsub|dub)"[^>]*>([\s\S]*?)<\/div>/g;
    let typeMatch;
    while ((typeMatch = typeRegex.exec(html)) !== null) {
      const type = typeMatch[1] as "sub" | "hsub" | "dub";
      const ul = typeMatch[2];
      const liRegex = /data-ep-id="(\d+)"[^>]*data-sv-id="([^"]+)"[^>]*data-link-id="([^"]+)"[^>]*>([^<]+)</g;
      let liMatch;
      while ((liMatch = liRegex.exec(ul)) !== null) {
        servers.push({
          episodeId: liMatch[1],
          serverId: liMatch[2],
          linkId: liMatch[3],
          name: liMatch[4].trim(),
          type,
        });
      }
    }
    return servers;
  } catch {
    return [];
  }
}

/**
 * Get the stream URL for a server.
 * URL: /ajax/server?get={linkId}
 * Returns: { url, skip_data: { intro: [start, end], outro: [start, end] } }
 *
 * The returned URL is an embed page (vidtube.site, megaplay.buzz, vidwish.live).
 * We fetch that embed page and extract the actual m3u8 URL from it, so we can
 * play it directly in our HLS player instead of using an iframe.
 */
export async function getAniKotoStream(linkId: string): Promise<{
  url: string;          // direct m3u8 URL (extracted from embed)
  intro: { start: number; end: number } | null;
  outro: { start: number; end: number } | null;
  subtitleTracks: Array<{ url: string; lang: string; label: string }>;
} | null> {
  try {
    // 1. Get the embed URL from AniKoto
    const url = `${ANICHI_BASE}/ajax/server?get=${encodeURIComponent(linkId)}`;
    const res = await anichiFetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 200 || !data.result) return null;
    const result = data.result;
    const embedUrl: string = result.url || "";
    if (!embedUrl) return null;

    const skipData = result.skip_data || {};
    const intro = Array.isArray(skipData.intro) && skipData.intro.length === 2 && (skipData.intro[0] > 0 || skipData.intro[1] > 0)
      ? { start: skipData.intro[0], end: skipData.intro[1] }
      : null;
    const outro = Array.isArray(skipData.outro) && skipData.outro.length === 2 && (skipData.outro[0] > 0 || skipData.outro[1] > 0)
      ? { start: skipData.outro[0], end: skipData.outro[1] }
      : null;

    // 2. Extract the m3u8 from the embed page
    const extracted = await extractM3u8FromEmbed(embedUrl);
    if (!extracted) return null;

    return {
      url: extracted.m3u8Url,
      intro,
      outro,
      subtitleTracks: extracted.subtitleTracks,
    };
  } catch {
    return null;
  }
}

/**
 * Extract the direct m3u8 URL from an embed page.
 *
 * Supports these embed CDNs:
 *   - vidtube.site  → /stream/getSourcesNew?id={data-id}&type={sub|dub}
 *   - megaplay.buzz → /stream/getSourcesNew?id={data-id}&type={sub|dub}
 *   - vidwish.live  → same pattern (same player)
 *   - vivibebe.site → m3u8 is directly in the HTML: /public/stream/{hash}/master.m3u8
 *
 * Returns null if the m3u8 can't be extracted (e.g. obfuscated player).
 */
async function extractM3u8FromEmbed(embedUrl: string): Promise<{
  m3u8Url: string;
  subtitleTracks: Array<{ url: string; lang: string; label: string }>;
} | null> {
  try {
    const parsed = new URL(embedUrl);
    const hostname = parsed.hostname;
    const path = parsed.pathname;

    // Determine the type (sub/dub) from the URL path
    const type = path.includes("/dub") ? "dub" : "sub";

    // Fetch the embed page HTML
    const embedRes = await fetch(embedUrl, {
      headers: {
        "User-Agent": UA,
        Referer: ANICHI_BASE + "/",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
    });
    if (!embedRes.ok) return null;
    const html = await embedRes.text();

    // ── vivibebe.site: m3u8 is directly in the HTML ──
    // Pattern: const src = "https://vivibebe.site/public/stream/{hash}/master.m3u8";
    if (hostname.includes("vivibebe") || hostname.includes("vibeplayer")) {
      const m3u8Match = html.match(/(?:src|file|source)\s*=\s*["'](https?:\/\/[^"']+\.m3u8)["']/i);
      if (m3u8Match) {
        return { m3u8Url: m3u8Match[1], subtitleTracks: [] };
      }
      // Fallback: construct from the hash in the path
      const hashMatch = path.match(/\/([a-f0-9]{16,})/i);
      if (hashMatch) {
        return {
          m3u8Url: `https://${hostname}/public/stream/${hashMatch[1]}/master.m3u8`,
          subtitleTracks: [],
        };
      }
    }

    // ── vidtube.site / megaplay.buzz / vidwish.live: use getSourcesNew API ──
    // The embed page has: <div id="megaplay-player" data-id="{id}" ...>
    // The API is at: /stream/getSourcesNew?id={id}&type={sub|dub}
    const dataIdMatch = html.match(/data-id="(\d+)"/);
    if (dataIdMatch) {
      const dataId = dataIdMatch[1];
      const apiUrl = `https://${hostname}/stream/getSourcesNew?id=${dataId}&type=${type}`;
      const apiRes = await fetch(apiUrl, {
        headers: {
          "User-Agent": UA,
          Referer: `https://${hostname}/`,
          "X-Requested-With": "XMLHttpRequest",
          Accept: "application/json, text/plain, */*",
        },
        redirect: "follow",
      });
      if (apiRes.ok) {
        const apiData = await apiRes.json();
        const m3u8Url = apiData?.sources?.file || apiData?.sources?.[0]?.file;
        if (m3u8Url) {
          // Extract subtitle tracks if present
          const subtitleTracks: Array<{ url: string; lang: string; label: string }> = [];
          const tracks = apiData?.tracks || [];
          for (const t of tracks) {
            if (t.file && t.kind === "captions") {
              subtitleTracks.push({
                url: t.file,
                lang: "en",
                label: t.label || "English",
              });
            }
          }
          return { m3u8Url, subtitleTracks };
        }
      }
    }

    // ── Fallback: search for any m3u8 URL in the HTML ──
    const anyM3u8 = html.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/i);
    if (anyM3u8) {
      return { m3u8Url: anyM3u8[0], subtitleTracks: [] };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Main entry: resolve all streams for an anime + episode.
 * Returns one result per server (sub/hsub/dub).
 */
export async function resolveAniKotoStreams(
  anilistId: number,
  episodeNum: number,
  title?: string,
): Promise<AniKotoStreamResult[]> {
  try {
    // 1. Search for the anime by title
    if (!title) return [];
    const slug = await searchAniKoto(title);
    if (!slug) return [];

    // 2. Get the mangaId
    const info = await getAniKotoAnimeInfo(slug);
    if (!info) return [];

    // 3. Get episodes
    const episodes = await getAniKotoEpisodes(info.mangaId);
    if (episodes.length === 0) return [];

    // 4. Find the requested episode
    const episode = episodes.find(e => e.num === episodeNum);
    if (!episode) return [];

    // 5. Get servers
    const servers = await getAniKotoServers(episode.serverIds);
    if (servers.length === 0) return [];

    // 6. For each server, get the stream URL (limit to first 6 to avoid too many requests)
    const results: AniKotoStreamResult[] = [];
    const serversToFetch = servers.slice(0, 6); // VidPlay-1, HD-1, Vidstream-2, VidCloud-1 + hsub + dub
    const streamPromises = serversToFetch.map(async (server) => {
      const stream = await getAniKotoStream(server.linkId);
      if (!stream || !stream.url) return null;
      const type: "sub" | "dub" = server.type === "dub" ? "dub" : "sub";
      const hardsub = server.type === "hsub";
      return {
        provider: "anichi" as const,
        type,
        quality: "1080p",
        streamUrl: stream.url, // DIRECT m3u8 URL (extracted from embed)
        isM3U8: true,          // played in our HLS player
        isMP4: false,
        isEmbed: false,        // NOT an embed — direct m3u8
        hardsub,
        serverName: server.name,
        intro: stream.intro,
        outro: stream.outro,
        subtitleTracks: stream.subtitleTracks, // includes subs from getSourcesNew API
      } satisfies AniKotoStreamResult;
    });
    const settled = await Promise.allSettled(streamPromises);
    for (const r of settled) {
      if (r.status === "fulfilled" && r.value) results.push(r.value);
    }
    console.log(`[AniKoto] ${anilistId} ep${episodeNum}: ${results.length} streams from ${slug}`);
    return results;
  } catch (e: any) {
    console.log(`[AniKoto] error for ${anilistId} ep${episodeNum}: ${e?.message || e}`);
    return [];
  }
}
