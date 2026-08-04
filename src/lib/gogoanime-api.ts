/**
 * GogoAnime Direct API Client
 * 
 * Stable Japanese sub + English dub streaming via GogoAnime scraping.
 * Provides search, episode listing, and direct M3U8/MP4 stream URLs.
 * This is the most reliable free anime streaming source available.
 */

const GOGO_BASE = "https://gogoanime3.co";
const GOGO_AJAX = "https://gogoanime3.co";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

// ---- Types ----

export interface GogoSearchResult {
  id: string;        // e.g., "naruto-dub"
  title: string;
  image?: string;
  releaseDate?: string;
  type?: string;     // "sub" or "dub"
}

export interface GogoEpisode {
  number: number;
  id: string;        // Episode slug for stream URL
  title?: string;
  url?: string;
}

export interface GogoStreamSource {
  file: string;      // M3U8 or MP4 URL
  label?: string;    // Quality label e.g., "1080p", "720p"
  type: "hls" | "mp4";
}

// ---- Helper ----

async function gogoFetch(url: string, retries = 2): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(url, {
        headers: HEADERS,
        signal: controller.signal,
        redirect: "follow",
        next: { revalidate: 300 },
      });
      clearTimeout(timeout);
      if (res.ok) return res;
      if (res.status === 429 || res.status >= 500) {
        if (i < retries) {
          await new Promise(r => setTimeout(r, 1500 * (i + 1)));
          continue;
        }
      }
      return res;
    } catch (err) {
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error("Max retries exceeded");
}

// ---- API Functions ----

/** Search anime on GogoAnime */
export async function gogoSearch(
  query: string,
  page: number = 1
): Promise<GogoSearchResult[]> {
  try {
    const res = await gogoFetch(
      `${GOGO_BASE}/search.html?keyword=${encodeURIComponent(query)}&page=${page}`
    );
    const html = await res.text();
    return parseSearchResults(html);
  } catch (err) {
    console.error("[GogoAPI] Search failed:", err);
    return [];
  }
}

/** Get anime info and episode list */
export async function gogoAnimeInfo(
  animeId: string
): Promise<{
  title: string;
  image?: string;
  type?: string;
  summary?: string;
  genre?: string[];
  episodes: GogoEpisode[];
} | null> {
  try {
    const res = await gogoFetch(`${GOGO_BASE}/category/${animeId}`);
    const html = await res.text();

    const title = extractBetween(html, '<h1', '</h1>')[0]
      ?.replace(/<[^>]*>/g, "")
      ?.trim() || animeId;

    const imageMatch = html.match(/class=["']anime_info_body_bg["'][^>]*src=["']([^"']*)["']/i) ||
      html.match(/<img[^>]+src=["']([^"']*anime[^"']*)["']/i);
    const image = imageMatch ? imageMatch[1] : undefined;

    const typeMatch = html.match(/<span[^>]*>Type:\s*<\/span>\s*<a[^>]*>([^<]*)<\/a>/i) ||
      html.match(/Type[:\s]*([^<\n]+)/i);
    const type = typeMatch ? typeMatch[1].trim() : undefined;

    const summaryMatch = html.match(/<span[^>]*>Plot Summary:\s*<\/span>([\s\S]*?)<\/p>/i);
    const summary = summaryMatch ? summaryMatch[1].replace(/<[^>]*>/g, "").trim() : undefined;

    const genreMatches = [...html.matchAll(/<span[^>]*>Genre:\s*<\/span>([\s\S]*?)<\/p>/gi)];
    const genre: string[] = [];
    if (genreMatches[0]) {
      const genreLinks = [...genreMatches[0][1].matchAll(/>([^<]+)<\/a>/g)];
      for (const gl of genreLinks) {
        if (gl[1].trim()) genre.push(gl[1].trim());
      }
    }

    // Extract episode IDs from the episode list page
    const episodes = parseEpisodeList(html);

    // If no episodes found on the category page, try the ajax endpoint
    if (episodes.length === 0) {
      const ajaxEpisodes = await gogoEpisodesAjax(animeId);
      if (ajaxEpisodes.length > 0) {
        return { title, image, type, summary, genre, episodes: ajaxEpisodes };
      }
    }

    return { title, image, type, summary, genre, episodes };
  } catch (err) {
    console.error("[GogoAPI] Info failed:", err);
    return null;
  }
}

/** Get episodes via AJAX endpoint (fallback) */
export async function gogoEpisodesAjax(
  animeId: string
): Promise<GogoEpisode[]> {
  try {
    // First get the anime page to find the internal ID
    const res = await gogoFetch(`${GOGO_BASE}/category/${animeId}`);
    const html = await res.text();

    // Find the anime movie ID for AJAX
    const movieIdMatch = html.match(/movie_id\s*=\s*['"]?(\d+)['"]?/);
    if (!movieIdMatch) return [];

    const movieId = movieIdMatch[1];
    const ajaxRes = await gogoFetch(
      `${GOGO_AJAX}/ajax/load-list-episode?ep_start=0&ep_end=9999&id=${movieId}`
    );
    const ajaxHtml = await ajaxRes.text();
    return parseEpisodeList(ajaxHtml);
  } catch {
    return [];
  }
}

/** Get streaming sources for an episode */
export async function gogoStreamSources(
  episodeId: string
): Promise<GogoStreamSource[]> {
  try {
    // Step 1: Fetch the episode page
    const res = await gogoFetch(`${GOGO_BASE}/${episodeId}`);
    const html = await res.text();

    // Step 2: Find the streaming iframe URL
    const iframeMatch = html.match(/<iframe[^>]+src=["']([^"']*)["']/i) ||
      html.match(/data-iframe-src=["']([^"']*)["']/i);
    
    // Fallback: try finding the play button data
    const playMatch = !iframeMatch ? html.match(/href=["']([^"']*streaming[^"']*)["']/i) : null;

    const iframeUrl = iframeMatch ? iframeMatch[1] : playMatch ? playMatch[1] : "";
    if (!iframeUrl) return [];

    // Step 3: Fetch the streaming page
    const streamRes = await gogoFetch(iframeUrl);
    const streamHtml = await streamRes.text();

    // Step 4: Extract the stream data from the page
    const sources: GogoStreamSource[] = [];

    // Look for JSON data in the page
    const jsonDataMatch = streamHtml.match(/file:\s*'([^']+)'/) ||
      streamHtml.match(/"file"\s*:\s*"([^"]+)"/) ||
      streamHtml.match(/sources:\s*\[\{file:\s*"([^"]+)"/);

    if (jsonDataMatch) {
      const fileUrl = jsonDataMatch[1];
      if (fileUrl.includes(".m3u8")) {
        // Try to get the full playlist with quality options
        try {
          const playlistRes = await fetch(fileUrl, {
            headers: { ...HEADERS, Referer: iframeUrl },
            next: { revalidate: 60 },
          });
          const playlistText = await playlistRes.text();
          
          // Check if it's a master playlist with multiple qualities
          if (playlistText.includes("#EXT-X-STREAM-INF")) {
            const streamMatches = [...playlistText.matchAll(
              /#EXT-X-STREAM-INF:.*?RESOLUTION=\d+x(\d+).*?\n([^\n]+)/g
            )];
            for (const sm of streamMatches) {
              const quality = sm[1];
              let url = sm[2].trim();
              if (!url.startsWith("http")) {
                url = new URL(url, fileUrl).href;
              }
              sources.push({
                file: url,
                label: `${quality}p`,
                type: "hls",
              });
            }
          }

          // If no quality variants found, use the single stream
          if (sources.length === 0) {
            sources.push({
              file: fileUrl,
              label: "Auto",
              type: "hls",
            });
          }
        } catch {
          sources.push({
            file: fileUrl,
            label: "Auto",
            type: "hls",
          });
        }
      } else if (fileUrl.includes(".mp4")) {
        sources.push({
          file: fileUrl,
          label: "HD",
          type: "mp4",
        });
      }
    }

    // Also try to find sources from script tags
    if (sources.length === 0) {
      const scriptMatches = [...streamHtml.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
      for (const sm of scriptMatches) {
        const script = sm[1];
        // Look for m3u8 URLs in scripts
        const m3u8Match = script.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/);
        if (m3u8Match) {
          sources.push({
            file: m3u8Match[0],
            label: "Auto",
            type: "hls",
          });
          break;
        }
        // Look for mp4 URLs
        const mp4Match = script.match(/https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/);
        if (mp4Match) {
          sources.push({
            file: mp4Match[0],
            label: "HD",
            type: "mp4",
          });
          break;
        }
      }
    }

    return sources;
  } catch (err) {
    console.error("[GogoAPI] Stream sources failed:", err);
    return [];
  }
}

/** Get both sub and dub anime IDs for a title */
export async function gogoSearchSubDub(
  query: string
): Promise<{ sub?: GogoSearchResult; dub?: GogoSearchResult }> {
  try {
    const [subResults, dubResults] = await Promise.all([
      gogoSearch(query),
      gogoSearch(query + " dub"),
    ]);

    return {
      sub: subResults.length > 0 ? subResults[0] : undefined,
      dub: dubResults.length > 0 ? dubResults[0] : undefined,
    };
  } catch {
    return {};
  }
}

/** Get recent episodes */
export async function gogoRecent(
  page: number = 1,
  type: "sub" | "dub" | "raw" = "sub"
): Promise<GogoSearchResult[]> {
  try {
    const typeNum = type === "dub" ? 2 : type === "raw" ? 3 : 1;
    const res = await gogoFetch(
      `${GOGO_BASE}/recent-release-anime.html?page=${page}&type=${typeNum}`
    );
    const html = await res.text();
    return parseRecentEpisodes(html);
  } catch {
    return [];
  }
}

/** Get popular anime */
export async function gogoPopular(
  page: number = 1
): Promise<GogoSearchResult[]> {
  try {
    const res = await gogoFetch(
      `${GOGO_BASE}/popular.html?page=${page}`
    );
    const html = await res.text();
    return parseSearchResults(html);
  } catch {
    return [];
  }
}

/** Get the currently airing anime with new episodes */
export async function gogoAiring(
  page: number = 1
): Promise<GogoSearchResult[]> {
  try {
    const res = await gogoFetch(
      `${GOGO_BASE}/airing.html?page=${page}`
    );
    const html = await res.text();
    return parseSearchResults(html);
  } catch {
    return [];
  }
}

// ---- Parsers ----

function extractBetween(html: string, start: string, end: string): string[] {
  const results: string[] = [];
  let pos = 0;
  while (true) {
    const s = html.indexOf(start, pos);
    if (s === -1) break;
    const e = html.indexOf(end, s + start.length);
    if (e === -1) break;
    results.push(html.slice(s, e + end.length));
    pos = e + end.length;
  }
  return results;
}

function parseSearchResults(html: string): GogoSearchResult[] {
  const results: GogoSearchResult[] = [];
  const items = extractBetween(html, '<li>', '</li>');

  for (const item of items) {
    const titleMatch = item.match(/title=["']([^"']*)["']/i) ||
      item.match(/<a[^>]*>([^<]*)<\/a>/i);
    const hrefMatch = item.match(/href=["']([^"']*\/category\/[^"']*)["']/i);
    const imgMatch = item.match(/src=["']([^"']*?)["']/i);

    if (titleMatch || hrefMatch) {
      let id = "";
      if (hrefMatch) {
        const idMatch = hrefMatch[1].match(/\/category\/([^/?#]+)/);
        id = idMatch ? idMatch[1] : "";
      }

      const title = titleMatch ? titleMatch[1].replace(/&amp;/g, "&").trim() : id;
      const isDub = title.toLowerCase().includes("dub") || id.toLowerCase().includes("dub");

      results.push({
        id: id || title.toLowerCase().replace(/\s+/g, "-"),
        title,
        image: imgMatch ? imgMatch[1] : undefined,
        type: isDub ? "dub" : "sub",
      });
    }
  }

  // Alternative parsing if the li-based parsing didn't work
  if (results.length === 0) {
    const divItems = extractBetween(html, 'class="items"', '</ul>');
    if (divItems.length > 0) {
      const picItems = [...divItems[0].matchAll(/class=["']img["'][\s\S]*?<a[^>]*href=["']([^"']*)["'][^>]*>[\s\S]*?<img[^>]*src=["']([^"']*)["'][^>]*>[\s\S]*?<a[^>]*>([^<]*)<\/a>/gi)];
      for (const m of picItems) {
        const idMatch = m[1].match(/\/category\/([^/?#]+)/);
        const id = idMatch ? idMatch[1] : "";
        const title = m[3].trim().replace(/&amp;/g, "&");
        const isDub = title.toLowerCase().includes("dub") || id.toLowerCase().includes("dub");
        results.push({
          id,
          title,
          image: m[2],
          type: isDub ? "dub" : "sub",
        });
      }
    }
  }

  // Third try - very broad search
  if (results.length === 0) {
    const animeLinks = [...html.matchAll(/href=["']([^"']*\/category\/([^"']+))["'][^>]*>[\s\S]*?(?:<img[^>]*src=["']([^"']*)["'])?[\s\S]*?<[^>]*>([^<]*)?</gi)];
    for (const m of animeLinks) {
      const id = m[2];
      const title = (m[4] || id).replace(/&amp;/g, "&").trim();
      const isDub = title.toLowerCase().includes("dub") || id.toLowerCase().includes("dub");
      results.push({
        id,
        title,
        image: m[3] || undefined,
        type: isDub ? "dub" : "sub",
      });
    }
  }

  return results;
}

function parseEpisodeList(html: string): GogoEpisode[] {
  const episodes: GogoEpisode[] = [];

  // Method 1: Find episode links in the standard format
  const epLinks = [...html.matchAll(
    /href=["']([^"']*\/([^"']+)-episode-(\d+))["'][^>]*>[\s\S]*?(?:Episode\s*)?(\d+)/gi
  )];

  for (const m of epLinks) {
    const url = m[1];
    const slug = m[2];
    const num = parseInt(m[3] || m[4]) || episodes.length + 1;
    const id = url.replace(/^\//, "").replace(/^https?:\/\/[^/]+\/?/, "");

    episodes.push({
      number: num,
      id: id || `${slug}-episode-${num}`,
      title: `Episode ${num}`,
      url: url.startsWith("http") ? url : `${GOGO_BASE}/${id}`,
    });
  }

  // Deduplicate by episode number
  const seen = new Set<number>();
  const uniqueEpisodes = episodes.filter(ep => {
    if (seen.has(ep.number)) return false;
    seen.add(ep.number);
    return true;
  });

  // Sort by episode number
  uniqueEpisodes.sort((a, b) => a.number - b.number);

  return uniqueEpisodes;
}

function parseRecentEpisodes(html: string): GogoSearchResult[] {
  const results: GogoSearchResult[] = [];
  const items = extractBetween(html, '<li>', '</li>');

  for (const item of items) {
    const titleMatch = item.match(/title=["']([^"']*)["']/i) ||
      item.match(/<a[^>]*>([^<]*)<\/a>/i);
    const hrefMatch = item.match(/href=["']([^"']*)["']/i);
    const imgMatch = item.match(/src=["']([^"']*?)["']/i);

    if (titleMatch || hrefMatch) {
      let id = "";
      if (hrefMatch) {
        const idMatch = hrefMatch[1].match(/\/category\/([^/?#]+)/);
        if (idMatch) {
          id = idMatch[1];
        } else {
          const epIdMatch = hrefMatch[1].match(/\/([^/?#]+)-episode-\d+/);
          id = epIdMatch ? epIdMatch[1] : "";
        }
      }

      const title = titleMatch ? titleMatch[1].replace(/&amp;/g, "&").trim() : id;
      const isDub = title.toLowerCase().includes("dub") || id.toLowerCase().includes("dub");

      results.push({
        id: id || title.toLowerCase().replace(/\s+/g, "-"),
        title,
        image: imgMatch ? imgMatch[1] : undefined,
        type: isDub ? "dub" : "sub",
      });
    }
  }

  return results;
}
