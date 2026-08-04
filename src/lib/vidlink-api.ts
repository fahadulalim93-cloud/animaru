// ============================================================
// VIDLINK API — Direct stream scraper for Movies/TV
//
// Flow:
//   1. Encrypt TMDB ID: GET https://enc-dec.app/api/enc-vidlink?text={tmdbId}
//      → returns the encrypted ID string used by vidlink.pro
//   2. Fetch streams:
//      Movie: GET https://vidlink.pro/api/b/movie/{encrypted}?multiLang=1
//      TV:    GET https://vidlink.pro/api/b/tv/{encrypted}?multiLang=1&se={season}&ep={episode}
//   3. Response shape:
//      {
//        sourceId: "mwVault",
//        stream: {
//          id: "primary",
//          type: "file",
//          qualities: {
//            "360": { type: "mp4", url: "https://...", codecName: "hevc", size: "..." },
//            "480": { type: "mp4", url: "https://...", ... },
//            "720": { type: "mp4", url: "https://...", ... },
//            "1080": { type: "mp4", url: "https://...", ... }
//          },
//          alternates: {
//            dash: { type: "dash", playlist: "https://...", ... },
//            hls: { type: "hls", playlist: "https://...", ... }
//          },
//          captions: [
//            { id: "...", url: "https://...", language: "English", type: "srt" },
//            ...
//          ]
//        }
//      }
// ============================================================

export interface VidlinkSource {
  url: string;
  quality: string;
  format: string;
}

export interface VidlinkSubtitle {
  url: string;
  lang: string;
  label: string;
}

export interface VidlinkStreams {
  sources: VidlinkSource[];
  subtitles: VidlinkSubtitle[];
}

const ENC_DEC_API = "https://enc-dec.app/api/enc-vidlink";
const VIDLINK_API = "https://vidlink.pro/api/b";

// No caching — Vidlink stream URLs have time-limited tokens that expire
// after ~1 hour. Each request must fetch fresh URLs.

const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://vidlink.pro/",
  Origin: "https://vidlink.pro",
};

/**
 * Encrypt the TMDB ID using the enc-dec.app service.
 */
export async function encryptTmdbId(tmdbId: number): Promise<string> {
  const url = `${ENC_DEC_API}?text=${encodeURIComponent(String(tmdbId))}`;
  const res = await fetch(url, {
    headers: DEFAULT_HEADERS,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`enc-dec failed: ${res.status}`);
  }
  const data = await res.json();
  const encrypted =
    (data && (data.result || data.encrypted || data.data || data.token)) ||
    (typeof data === "string" ? data : "");
  if (!encrypted || typeof encrypted !== "string") {
    throw new Error("enc-dec returned no encrypted payload");
  }
  return encrypted.trim();
}

/**
 * Parse Vidlink's response into a clean { sources, subtitles } object.
 *
 * Handles the actual response shape:
 *   { stream: { qualities: { "360": {url, type}, ... }, captions: [...] } }
 *
 * Also handles alternate shapes for forward-compatibility.
 */
function normaliseStreams(raw: unknown): VidlinkStreams {
  const out: VidlinkStreams = { sources: [], subtitles: [] };
  if (!raw || typeof raw !== "object") return out;

  const root = raw as Record<string, unknown>;

  // The stream data is nested under `stream` key
  const stream = (root.stream as Record<string, unknown>) || root;

  // ── Sources ──
  // Vidlink returns qualities as an object: { "360": {url, type}, "480": {...}, ... }
  const qualities = stream.qualities as Record<string, unknown> | undefined;
  if (qualities && typeof qualities === "object") {
    for (const [quality, val] of Object.entries(qualities)) {
      if (!val || typeof val !== "object") continue;
      const obj = val as Record<string, unknown>;
      const url = (obj.url as string) || (obj.link as string) || "";
      if (!url) continue;
      const format = String(obj.type || (url.includes(".m3u8") ? "hls" : "mp4")).toLowerCase();
      out.sources.push({ url, quality: `${quality}p`, format });
    }
  }

  // Also check alternates (HLS/DASH playlists)
  const alternates = stream.alternates as Record<string, unknown> | undefined;
  if (alternates && typeof alternates === "object") {
    // HLS alternate
    if (alternates.hls && typeof alternates.hls === "object") {
      const hls = alternates.hls as Record<string, unknown>;
      const url = (hls.playlist as string) || (hls.url as string) || "";
      if (url) {
        out.sources.push({ url, quality: "auto", format: "hls" });
      }
    }
    // DASH alternate
    if (alternates.dash && typeof alternates.dash === "object") {
      const dash = alternates.dash as Record<string, unknown>;
      const url = (dash.playlist as string) || (dash.url as string) || "";
      if (url) {
        out.sources.push({ url, quality: "auto", format: "dash" });
      }
    }
  }

  // Fallback: try flat arrays (for compatibility with other response shapes)
  if (out.sources.length === 0) {
    const rawSources = (root.sources as unknown) || (root.streams as unknown) || [];
    const sourceList: unknown[] = Array.isArray(rawSources)
      ? rawSources
      : typeof rawSources === "object" && rawSources !== null
        ? Object.values(rawSources as Record<string, unknown>)
        : [];
    for (const s of sourceList) {
      if (!s || typeof s !== "object") continue;
      const obj = s as Record<string, unknown>;
      const url = (obj.url as string) || (obj.link as string) || (obj.file as string) || "";
      if (!url) continue;
      const quality = String(obj.quality || obj.resolution || obj.height || "auto");
      const format = String(obj.format || obj.type || (url.includes(".m3u8") ? "hls" : "mp4")).toLowerCase();
      out.sources.push({ url, quality, format });
    }
  }

  // ── Subtitles ──
  const captions = stream.captions as unknown[];
  const rawSubs = Array.isArray(captions)
    ? captions
    : (root.subtitles as unknown[]) || (root.tracks as unknown[]) || [];

  for (const sub of rawSubs) {
    if (!sub || typeof sub !== "object") continue;
    const obj = sub as Record<string, unknown>;
    const url = (obj.url as string) || (obj.link as string) || (obj.file as string) || "";
    if (!url) continue;
    const lang = String(obj.lang || obj.language || obj.code || "und");
    const label = String(obj.label || obj.name || obj.title || obj.language || lang);
    out.subtitles.push({ url, lang, label });
  }

  return out;
}

/**
 * Fetch streams from Vidlink for a movie or TV episode.
 */
export async function getVidlinkStreams(
  tmdbId: number,
  type: "movie" | "tv",
  season?: number,
  episode?: number
): Promise<VidlinkStreams> {
  const encrypted = await encryptTmdbId(tmdbId);

  let url: string;
  if (type === "tv") {
    const se = season && season > 0 ? season : 1;
    const ep = episode && episode > 0 ? episode : 1;
    // TV uses path-based season/episode: /api/b/tv/{enc}/{se}/{ep}
    // (NOT query params — query params return HTML, not JSON)
    url = `${VIDLINK_API}/tv/${encrypted}/${se}/${ep}?multiLang=1`;
  } else {
    url = `${VIDLINK_API}/movie/${encrypted}?multiLang=1`;
  }

  const res = await fetch(url, {
    headers: DEFAULT_HEADERS,
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    throw new Error(`vidlink.pro API failed: ${res.status}`);
  }
  const data = await res.json();
  const streams = normaliseStreams(data);
  if (streams.sources.length === 0) {
    throw new Error("vidlink.pro returned no playable sources");
  }
  return streams;
}
