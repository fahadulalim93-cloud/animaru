/**
 * Episode Metadata — api.ani.zip + AniSkip
 *
 * 1. api.ani.zip: Fetches episode TITLES + DESCRIPTIONS + thumbnails from TVDB
 *    via the ani.zip mapping API. Much richer than AniList's streamingEpisodes.
 *
 * 2. AniSkip: Fetches intro/outro skip times (start/end timestamps) for
 *    auto-skip. These are community-contributed and work for most popular anime.
 *    URL: https://api.aniskip.com/v2/skip-times/{anilistId}/{episode}
 *
 * Both are cached in-memory for 1 hour.
 */

const ANIZIP_API = "https://api.ani.zip/mappings";
const ANISKIP_API = "https://api.aniskip.com/v2/skip-times";

const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const _anizipCache = new Map<number, { data: any; ts: number }>();
const _aniskipCache = new Map<string, { data: any; ts: number }>();

// ─── Types ──
export interface EpisodeMetadata {
  title?: string;
  description?: string;
  thumbnail?: string;
  airDate?: string;
  airDateUtc?: string;
  runtime?: number;
}

export interface SkipTime {
  type: "op" | "ed" | "recap" | "mixed-op" | "mixed-ed";
  start: number;
  end: number;
  episodeLength: number;
  skipId?: string;
}

export interface EpisodeMetadataResponse {
  episodes: Record<number, EpisodeMetadata>;
  episodeCount?: number;
}

export interface SkipTimesResponse {
  intro: { start: number; end: number } | null;
  outro: { start: number; end: number } | null;
  all: SkipTime[];
}

// ─── api.ani.zip: Episode descriptions ──
export async function getEpisodeMetadata(
  anilistId: number,
): Promise<EpisodeMetadataResponse> {
  const cached = _anizipCache.get(anilistId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${ANIZIP_API}?anilist_id=${anilistId}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return { episodes: {} };
    }

    const data = await res.json();
    const rawEpisodes = data.episodes || {};
    const episodes: Record<number, EpisodeMetadata> = {};

    // Episodes is an object keyed by episode number (as string)
    for (const [epNumStr, epData] of Object.entries(rawEpisodes)) {
      const epNum = parseInt(epNumStr, 10);
      if (isNaN(epNum)) continue;
      const ep = epData as any;
      episodes[epNum] = {
        title: ep.title?.en || ep.title?.["x-jat"] || ep.title?.ja || undefined,
        description: ep.overview || undefined,
        thumbnail: ep.image || undefined,
        airDate: ep.airDate || ep.airdate || undefined,
        airDateUtc: ep.airDateUtc || undefined,
        runtime: ep.runtime || ep.length || undefined,
      };
    }

    const result: EpisodeMetadataResponse = {
      episodes,
      episodeCount: data.episodeCount,
    };

    _anizipCache.set(anilistId, { data: result, ts: Date.now() });
    return result;
  } catch (err) {
    console.error("[episode-metadata] getEpisodeMetadata error:", err);
    return { episodes: {} };
  }
}

// ─── AniSkip: Intro/outro skip times ──
export async function getSkipTimes(
  anilistId: number,
  episodeNum: number,
  episodeLength: number = 0,
): Promise<SkipTimesResponse> {
  const cacheKey = `${anilistId}:${episodeNum}`;
  const cached = _aniskipCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    // URL format: types[]=op&types[]=ed&types[]=mixed-op&types[]=mixed-ed&types[]=recap
    // (the AniSkip API expects types[] syntax — using `types=` without
    // brackets gets parsed as a single value by some backends and only
    // the last type survives)
    const res = await fetch(
      `${ANISKIP_API}/${anilistId}/${episodeNum}?types[]=op&types[]=ed&types[]=mixed-op&types[]=mixed-ed&types[]=recap&episodeLength=${episodeLength}`,
      { signal: controller.signal, headers: { Accept: "application/json" } },
    );
    clearTimeout(timeout);

    if (!res.ok) {
      const result: SkipTimesResponse = { intro: null, outro: null, all: [] };
      _aniskipCache.set(cacheKey, { data: result, ts: Date.now() });
      return result;
    }

    const data = await res.json();
    if (!data.found || !Array.isArray(data.results)) {
      const result: SkipTimesResponse = { intro: null, outro: null, all: [] };
      _aniskipCache.set(cacheKey, { data: result, ts: Date.now() });
      return result;
    }

    const all: SkipTime[] = data.results.map((r: any) => ({
      type: r.skipType as SkipTime["type"],
      start: r.interval.startTime,
      end: r.interval.endTime,
      episodeLength: r.episodeLength,
      skipId: r.skipId,
    }));

    const intro = all.find(s => s.type === "op" || s.type === "mixed-op") || null;
    const outro = all.find(s => s.type === "ed" || s.type === "mixed-ed") || null;

    const result: SkipTimesResponse = {
      intro: validateSkipTime(intro, "intro"),
      outro: validateSkipTime(outro, "outro"),
      all,
    };
    _aniskipCache.set(cacheKey, { data: result, ts: Date.now() });
    return result;
  } catch (err) {
    console.error("[episode-metadata] getSkipTimes error:", err);
    return { intro: null, outro: null, all: [] };
  }
}

// ─── Skip time validation ──────────────────────────────────────────────────
//
// Multiple sources (AniKage, AniKoto, even AniSkip occasionally) return
// garbage skip times. Common failure modes:
//   1. {start: 0, end: 0}  — "no data" sentinel that isn't filtered
//   2. intro at 1270s      — provider swapped intro/outro labels
//   3. outro at start       — same swap, other direction
//   4. start >= end         — zero or negative-length interval
//
// We filter all of these. A valid intro starts within the first 5 minutes
// (300s). A valid outro starts after the first 5 minutes. Both must be
// at least 10 seconds long.
//
// Thresholds:
//   INTRO_MAX_START = 300s  (5 min —intros don't start 5+ minutes in)
//   OUTRO_MIN_START = 300s  (5 min — outros don't start in the first 5 min)
//   MIN_DURATION    = 10s   (skip segment must be at least 10s long)
//
export const INTRO_MAX_START = 300; // 5 minutes
export const OUTRO_MIN_START = 300; // 5 minutes
export const MIN_SKIP_DURATION = 10; // seconds

export function validateSkipTime(
  t: { start: number; end: number } | null | undefined,
  kind: "intro" | "outro",
): { start: number; end: number } | null {
  if (!t) return null;
  if (typeof t.start !== "number" || typeof t.end !== "number") return null;
  if (!isFinite(t.start) || !isFinite(t.end)) return null;
  if (t.start < 0 || t.end < 0) return null;
  if (t.start >= t.end) return null; // zero or negative length
  if (t.end - t.start < MIN_SKIP_DURATION) return null; // too short

  if (kind === "intro") {
    // Intros are at the start of the episode — within the first 5 minutes.
    // If "intro" starts at 1270s, it's actually an outro (provider bug).
    if (t.start > INTRO_MAX_START) return null;
  } else {
    // Outros are at the end — they start after the first 5 minutes.
    // If "outro" starts at 0s or 5s, it's garbage data.
    if (t.start < OUTRO_MIN_START) return null;
  }

  return { start: t.start, end: t.end };
}
