/**
 * LunarAnime.ru API Client — TypeScript port of the Python LunarProvider.
 *
 * Target: https://lunaranime.ru
 *
 * Endpoints discovered by probing the live site:
 *   GET /api/anime/search?q=...                  → AniList-style search results
 *   GET /api/anime/3rdprovider?anilist_id=...    → Episode list with thumbnail UUIDs
 *
 * Stream proxy (server-side, requires Referer: https://lunaranime.ru/):
 *   GET /api/proxy/hls?uuid={uuid}               → 308 redirect to actual m3u8
 *
 * Lunar is hardsub-only — English subtitles are burned into the video.
 */

const LUNAR_BASE = "https://lunaranime.ru";

const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Referer: "https://lunaranime.ru/",
  Origin: "https://lunaranime.ru",
};

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LunarEpisodeEntry {
  anilist_id: number;
  episode: number;
  imdb: string | null;
  mal_id: string | null;
  thumbnail_url: string;
}

export interface LunarEpisodesResult {
  episodes: Array<{
    number: number;
    /** Unified episode ID — pass to lunarWatch() to get stream sources */
    id: string;
    title: string;
    thumbnail: string;
    variants: ("hardsub")[]; // Lunar is hardsub-only
  }>;
}
export interface LunarSource {
  url: string;
  variant: "hardsub";
  audio: "jp";
  subtitle: "hard";
  quality: string;
  format: "hls";
  provider: "lunar";
  subProvider: string;
  headers: Record<string, string>;
  proxyRequired: true;
  isM3U8: true;
}

export interface LunarWatchResult {
  sources: LunarSource[];
  uuids: string[];
}

// ─── Episode list ────────────────────────────────────────────────────────────

export async function lunarEpisodes(anilistId: number): Promise<LunarEpisodesResult> {
  try {
    const res = await fetch(
      `${LUNAR_BASE}/api/anime/3rdprovider?anilist_id=${anilistId}`,
      { headers: HEADERS, next: { revalidate: 120 } }
    );
    if (!res.ok) return { episodes: [] };
    const data = await res.json();
    const entries: LunarEpisodeEntry[] = Array.isArray(data?.data) ? data.data : [];

    // Group by episode number (multiple entries per episode = multiple sources)
    const byNumber = new Map<number, string[]>();
    const thumbnails = new Map<number, string>();

    for (const e of entries) {
      const num = Number(e.episode) || 0;
      const thumb = e.thumbnail_url || "";
      const uuid = thumb ? thumb.split("/").pop() || "" : "";
      if (!byNumber.has(num)) byNumber.set(num, []);
      if (uuid) byNumber.get(num)!.push(uuid);
      if (!thumbnails.has(num)) thumbnails.set(num, thumb);
    }

    const episodes = Array.from(byNumber.entries())
      .map(([num, uuids]) => ({
        number: num,
        // Unified ID: lunar:{anilistId}:{episodeNum}:{uuid1,uuid2,...}
        id: `lunar:${anilistId}:${num}:${uuids.join(",")}`,
        title: `Episode ${num}`,
        thumbnail: thumbnails.get(num) || "",
        variants: ["hardsub"] as ("hardsub")[],
      }))
      .sort((a, b) => a.number - b.number);

    return { episodes };
  } catch {
    return { episodes: [] };
  }
}

// ─── Sources ────────────────────────────────────────────────────────────────

const LUNAR_INNER_PROVIDERS = ["lulu", "speedfiles", "vidmoly", "voe", "flixcloud"];

export async function lunarWatch(episodeId: string): Promise<LunarWatchResult> {
  try {
    // Parse: lunar:{anilistId}:{epNum}:{uuid1,uuid2,...}
    const parts = episodeId.split(":");
    if (parts.length < 4) return { sources: [], uuids: [] };
    const uuidsStr = parts.slice(3).join(":");
    const uuids = uuidsStr.split(",").filter(Boolean);
    if (uuids.length === 0) return { sources: [], uuids: [] };

    const sources: LunarSource[] = uuids.map((uuid, idx) => {
      const innerProvider = LUNAR_INNER_PROVIDERS[idx % LUNAR_INNER_PROVIDERS.length];
      const proxyUrl = `${LUNAR_BASE}/api/proxy/hls?uuid=${encodeURIComponent(uuid)}`;
      return {
        url: proxyUrl,
        variant: "hardsub",
        audio: "jp",
        subtitle: "hard",
        quality: "auto",
        format: "hls",
        provider: "lunar",
        subProvider: innerProvider,
        headers: {
          Referer: "https://lunaranime.ru/",
          Origin: "https://lunaranime.ru",
        },
        proxyRequired: true,
        isM3U8: true,
      };
    });

    return { sources, uuids };
  } catch {
    return { sources: [], uuids: [] };
  }
}
