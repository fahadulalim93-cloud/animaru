/**
 * AnimeX Fast — resolves the "mimi" provider's m3u8 URL directly.
 *
 * The user observed that AnimeX mimi loads faster than AniDB. This module
 * resolves the m3u8 URL in 2 quick steps:
 *   1. AniList ID → slug (via AnimeX GraphQL at graphql.animex.one)
 *   2. Fetch sources for the "mimi" provider (via chad.anidap.lol REST API)
 *
 * Returns the direct m3u8 URL (from vivibebe.site) for hls.js playback.
 * No iframe, no embed page scraping — just the raw m3u8.
 *
 * Slug mappings are cached in-memory for 1 hour.
 */

const ANIMEX_GRAPHQL = "https://graphql.animex.one/graphql";
const ANIMEX_REST = "https://chad.anidap.lol/rest/api";

const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.5",
  Origin: "https://animex.one",
  Referer: "https://animex.one/",
};

// ── Caches ──
const slugCache = new Map<number, string | null>(); // anilistId → slug
const sourceCache = new Map<string, any>(); // "slug:ep:type:provider" → sources data
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const cacheTimestamps = new Map<string, number>();

function isCacheFresh(key: string): boolean {
  const ts = cacheTimestamps.get(key);
  if (!ts) return false;
  return Date.now() - ts < CACHE_TTL;
}

// ── Types ──
export interface AnimexFastResult {
  m3u8Url: string;
  slug: string;
  provider: string;
  type: "sub" | "dub";
  quality: string;
  /** Intro chapter for auto-skip (if available) */
  intro?: { start: number; end: number } | null;
  /** Outro chapter for auto-skip (if available) */
  outro?: { start: number; end: number } | null;
  /** Subtitle tracks (if available) */
  tracks?: Array<{ url: string; lang: string; label: string }>;
}

// ── Step 1: Resolve AniList ID → AnimeX slug ──
async function resolveSlug(anilistId: number): Promise<string | null> {
  const cacheKey = `animex:${anilistId}`;
  if (slugCache.has(anilistId) && isCacheFresh(cacheKey)) {
    return slugCache.get(anilistId)!;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(ANIMEX_GRAPHQL, {
      method: "POST",
      headers: { ...HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `query($id:Int!){anime(anilistId:$id){id anilistId titleEnglish titleRomaji}}`,
        variables: { id: anilistId },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`[animex-fast] GraphQL HTTP ${res.status} for AniList ${anilistId}`);
      slugCache.set(anilistId, null);
      cacheTimestamps.set(cacheKey, Date.now());
      return null;
    }

    const data = await res.json();
    const slug = data?.data?.anime?.id || null;

    if (slug) {
      console.log(`[animex-fast] resolved AniList ${anilistId} → slug "${slug}"`);
    }

    slugCache.set(anilistId, slug);
    cacheTimestamps.set(cacheKey, Date.now());
    return slug;
  } catch (err) {
    console.error(`[animex-fast] resolveSlug error:`, err);
    slugCache.set(anilistId, null);
    cacheTimestamps.set(cacheKey, Date.now());
    return null;
  }
}

// ── Step 2: Fetch sources for a specific provider ──
async function getSources(
  slug: string,
  epNum: number,
  type: "sub" | "dub",
  provider: string,
): Promise<any | null> {
  const cacheKey = `animex-src:${slug}:${epNum}:${type}:${provider}`;
  if (sourceCache.has(cacheKey) && isCacheFresh(cacheKey)) {
    return sourceCache.get(cacheKey)!;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(
      `${ANIMEX_REST}/sources?id=${encodeURIComponent(slug)}&epNum=${epNum}&type=${type}&providerId=${provider}`,
      { headers: HEADERS, signal: controller.signal },
    );
    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`[animex-fast] sources HTTP ${res.status} for ${slug} ep${epNum} ${provider}`);
      return null;
    }

    const data = await res.json();
    sourceCache.set(cacheKey, data);
    cacheTimestamps.set(cacheKey, Date.now());
    return data;
  } catch (err) {
    console.error(`[animex-fast] getSources error:`, err);
    return null;
  }
}

// ── Main: resolve m3u8 for AnimeX mimi provider ──
export async function resolveAnimexMimi(
  anilistId: number,
  episodeNum: number,
  type: "sub" | "dub",
): Promise<AnimexFastResult | null> {
  return resolveAnimexProvider(anilistId, episodeNum, type, "mimi");
}

// ── Generic: resolve m3u8 for any AnimeX provider ──
export async function resolveAnimexProvider(
  anilistId: number,
  episodeNum: number,
  type: "sub" | "dub",
  provider: string,
): Promise<AnimexFastResult | null> {
  try {
    const slug = await resolveSlug(anilistId);
    if (!slug) return null;

    const sourceData = await getSources(slug, episodeNum, type, provider);
    if (!sourceData?.sources?.length) return null;

    // Find the m3u8 source
    const m3u8Source = sourceData.sources.find(
      (s: any) =>
        s.url?.includes(".m3u8") ||
        s.type?.includes("mpegurl") ||
        s.type?.includes("hls"),
    );

    if (!m3u8Source?.url) return null;

    // Parse intro/outro from chapters
    // Validate each one — chapter titles can be misleading (e.g. "preview"
    // labeled as "ed"), and we only want real intro/outro segments.
    let intro: { start: number; end: number } | null = null;
    let outro: { start: number; end: number } | null = null;
    if (Array.isArray(sourceData.chapters)) {
      // Inline import to avoid circular dependency issues at module load
      const { validateSkipTime } = await import("./episode-metadata");
      for (const ch of sourceData.chapters) {
        if (/intro/i.test(ch.title || "")) {
          intro = validateSkipTime({ start: ch.start, end: ch.end }, "intro") || intro;
        }
        if (/outro|ending|ed/i.test(ch.title || "")) {
          outro = validateSkipTime({ start: ch.start, end: ch.end }, "outro") || outro;
        }
      }
    }

    // Parse subtitle tracks
    const tracks: Array<{ url: string; lang: string; label: string }> = [];
    if (Array.isArray(sourceData.tracks)) {
      for (const t of sourceData.tracks) {
        if (t.kind === "captions" || t.kind === "subtitles") {
          tracks.push({ url: t.url, lang: t.lang || "en", label: t.label || t.lang || "English" });
        }
      }
    }

    return {
      m3u8Url: m3u8Source.url,
      slug,
      provider,
      type,
      quality: m3u8Source.quality || "auto",
      intro,
      outro,
      tracks: tracks.length > 0 ? tracks : undefined,
    };
  } catch (err) {
    console.error(`[animex-fast] resolveAnimexProvider error:`, err);
    return null;
  }
}

// ── Batch: resolve sub + dub in parallel (mimi first, fallback to other providers) ──
export async function resolveAnimexMimiBoth(
  anilistId: number,
  episodeNum: number,
): Promise<{ sub: AnimexFastResult | null; dub: AnimexFastResult | null }> {
  // Try mimi first (fastest). If it fails, try other providers in parallel.
  const [subMimi, dubMimi] = await Promise.all([
    resolveAnimexMimi(anilistId, episodeNum, "sub"),
    resolveAnimexMimi(anilistId, episodeNum, "dub"),
  ]);

  // If mimi worked for both, return immediately
  if (subMimi && dubMimi) return { sub: subMimi, dub: dubMimi };

  // Otherwise, try fallback providers for the ones that failed
  // These are the providers that return UNIQUE m3u8 URLs (verified via animex-servers API)
  // NOTE: "beep" removed — not working (playeng.animeapps.top often 403s)
  // NOTE: "uwu" removed — not working (vault-XX.uwucdn.top CF-vs-CF block)
  const FALLBACK_PROVIDERS = ["yuki", "kiwi", "loli", "sora"];

  const subFallback = !subMimi
    ? Promise.any(
        FALLBACK_PROVIDERS.map(p =>
          resolveAnimexProvider(anilistId, episodeNum, "sub", p).then(r => r || Promise.reject())
        )
      ).catch(() => null)
    : Promise.resolve(subMimi);

  const dubFallback = !dubMimi
    ? Promise.any(
        FALLBACK_PROVIDERS.map(p =>
          resolveAnimexProvider(anilistId, episodeNum, "dub", p).then(r => r || Promise.reject())
        )
      ).catch(() => null)
    : Promise.resolve(dubMimi);

  const [sub, dub] = await Promise.all([subFallback, dubFallback]);
  return { sub, dub };
}
