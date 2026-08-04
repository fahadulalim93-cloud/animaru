/**
 * AnimeX Download API — fetches download links from animex.one's REST API.
 *
 * API flow:
 *   1. Search: GET https://chad.anidap.lol/rest/api/download?q={query}
 *      Returns: [{ id, title, ... }] — list of anime with download links available
 *
 *   2. Get links: GET https://chad.anidap.lol/rest/api/download?id={id}
 *      Returns: [{ text, url }] — url is base64-encoded (decode to get the actual URL)
 *
 * The download links point to external services (Google Drive, Mega, tinyurl, etc.)
 * — they are NOT direct video files. Users click the link and are taken to the
 * external download page.
 */

const ANIMEX_REST = "https://chad.anidap.lol/rest/api";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface AnimexDownloadResult {
  id: string;
  title: string;
  episodeCount?: number;
  type?: string;
}

export interface AnimexDownloadLink {
  text: string;
  url: string;       // base64-encoded URL
  decodedUrl: string; // decoded actual URL
}

/**
 * Search for anime download links by title.
 */
export async function searchAnimexDownloads(query: string): Promise<AnimexDownloadResult[]> {
  if (!query.trim()) return [];
  try {
    const url = `${ANIMEX_REST}/download?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map((item: any) => ({
      id: item.id || "",
      title: item.title || item.titleEnglish || item.titleRomaji || "Unknown",
      episodeCount: item.episodeCount,
      type: item.type,
    }));
  } catch {
    return [];
  }
}

/**
 * Get download links for a specific anime (by download ID from search results).
 * Returns an array of { text, url, decodedUrl } — url is base64-encoded.
 */
export async function getAnimexDownloadLinks(downloadId: string): Promise<AnimexDownloadLink[]> {
  if (!downloadId) return [];
  try {
    const url = `${ANIMEX_REST}/download?id=${encodeURIComponent(downloadId)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map((item: any) => {
      const rawUrl = item.url || "";
      let decodedUrl = rawUrl;
      try {
        decodedUrl = atob(rawUrl);
      } catch {
        // If base64 decode fails, use the raw URL
        decodedUrl = rawUrl;
      }
      return {
        text: item.text || "Download",
        url: rawUrl,
        decodedUrl,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Convenience: search by title + get download links in one call.
 * Returns the download links for the best-matching anime.
 */
export async function fetchAnimexDownloads(title: string): Promise<AnimexDownloadLink[]> {
  const results = await searchAnimexDownloads(title);
  if (results.length === 0) return [];
  // Pick the best match (first result — the API returns relevance-sorted)
  const best = results[0];
  return getAnimexDownloadLinks(best.id);
}
