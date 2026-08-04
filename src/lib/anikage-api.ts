/**
 * AniKage API Client — REWRITTEN to use anikage-scraper-api
 * ----------------------------------------------------------
 * Uses https://anikage-scraper-api.sapis.workers.dev (dedicated scraper API)
 * instead of scraping anikage.cc directly.
 *
 * The scraper API returns:
 *   - streamUrl: prox.anikage.cc/m3u8/{token} (already proxied!)
 *   - embeds: multiple embed URLs (vibeplayer, streamsb, ok.ru, otakuhg, etc.)
 *   - subtitles: proxied through prox.anikage.cc
 *
 * prox.anikage.cc is Cloudflare-protected → route through our worker.
 *
 * API flow:
 *   1. Search: GET /api/search?q={query} → { data: { results: [{ slug, anilistId, title }] } }
 *   2. Servers: GET /api/servers?slug={slug}&episode={ep} → [{ id, default }]
 *   3. Streams: GET /api/streams?slug={slug}&episode={ep}&provider={id}&lang={sub|dub}
 *      → { data: { sources: [{ streamUrl, quality, isM3U8 }], embeds: [{ url, type, server }], subtitles: [...] } }
 */

// wrapStreamUrl removed — AniKage HLS URLs (prox.anikage.cc) are used directly
// (they have their own CORS + Referer handling). Embed URLs are also used directly.

const SCRAPER_API = "https://anikage-scraper-api.sapis.workers.dev";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const HEADERS: Record<string, string> = {
  "User-Agent": UA,
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AnikageVerifiedResult {
  server: string;
  type: "sub" | "dub";
  streamUrl: string;
  quality: string;
  isM3U8: boolean;
  isMP4: boolean;
  isEmbed: boolean;
  hardsub: boolean;
  tracks: Array<{ url: string; lang: string; label: string }>;
  intro: { start: number; end: number } | null;
  outro: { start: number; end: number } | null;
}

// ─── Slug cache ──────────────────────────────────────────────────────────────

const slugCache = new Map<number, string | null>();

async function resolveSlug(anilistId: number): Promise<string | null> {
  if (slugCache.has(anilistId)) return slugCache.get(anilistId)!;

  try {
    // Get title from AniList
    const titleRes = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({
        query: `query($id:Int){Media(id:$id,type:ANIME){id title{english romaji native}}}`,
        variables: { id: anilistId },
      }),
    });
    if (!titleRes.ok) { slugCache.set(anilistId, null); return null; }
    const titleData = await titleRes.json();
    const title = titleData?.data?.Media?.title?.english || titleData?.data?.Media?.title?.romaji;
    if (!title) { slugCache.set(anilistId, null); return null; }

    // Search scraper API
    const res = await fetch(`${SCRAPER_API}/api/search?q=${encodeURIComponent(title)}`, {
      headers: HEADERS, cache: "no-store",
    });
    if (!res.ok) { slugCache.set(anilistId, null); return null; }
    const data = await res.json();
    const results = data?.data?.results || [];
    const match = results.find((r: any) => r.anilistId === anilistId) || results[0];
    if (!match?.slug) { slugCache.set(anilistId, null); return null; }

    slugCache.set(anilistId, match.slug);
    console.log(`[AniKage] anilistId=${anilistId} → slug=${match.slug}`);
    return match.slug;
  } catch {
    slugCache.set(anilistId, null);
    return null;
  }
}

// ─── Fetch servers list ──────────────────────────────────────────────────────

async function getServers(slug: string, epNum: number): Promise<string[]> {
  try {
    const res = await fetch(`${SCRAPER_API}/api/servers?slug=${slug}&episode=${epNum}`, {
      headers: HEADERS, cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    const servers = data?.data || [];
    return servers.map((s: any) => s.id).filter(Boolean);
  } catch {
    return [];
  }
}

// ─── Main: fetch ALL AniKage sources ─────────────────────────────────────────

export async function fetchAnikageSources(
  anilistId: number,
  epNum: number,
  options?: { timeoutMs?: number }
): Promise<AnikageVerifiedResult[]> {
  const timeoutMs = options?.timeoutMs ?? 8000;

  const slug = await resolveSlug(anilistId);
  if (!slug) {
    console.log(`[AniKage] no slug for anilistId=${anilistId}`);
    return [];
  }

  const servers = await getServers(slug, epNum);
  if (servers.length === 0) {
    console.log(`[AniKage] no servers for slug=${slug} ep${epNum}`);
    return [];
  }

  console.log(`[AniKage] ${slug} ep${epNum}: ${servers.length} servers — fetching streams`);

  // Fetch streams for each server in parallel (both sub + dub)
  const jobs: Array<{ server: string; lang: "sub" | "dub" }> = [];
  for (const s of servers) {
    jobs.push({ server: s, lang: "sub" });
    jobs.push({ server: s, lang: "dub" });
  }

  const results = await Promise.allSettled(
    jobs.map(async (job): Promise<AnikageVerifiedResult[]> => {
      try {
        const url = `${SCRAPER_API}/api/streams?slug=${slug}&episode=${epNum}&provider=${job.server}&lang=${job.lang}`;
        const res = await Promise.race([
          fetch(url, { headers: HEADERS, cache: "no-store" }),
          new Promise<Response | null>(r => setTimeout(() => r(null), timeoutMs)),
        ]);
        if (!res || !res.ok) return [];
        const data = await res.json();
        if (!data?.success) return [];

        const sources = data?.data?.sources || [];
        const embeds = []; // Skip embeds — only show m3u8 sources as user requested
        const subtitles = data?.data?.subtitles || [];
        const verified: AnikageVerifiedResult[] = [];

        // Process HLS/MP4 sources (prox.anikage.cc/m3u8/{token} or /stream/{token})
        // These are AniKage's OWN proxy URLs — used directly by the browser.
        // NO m3u8 verification (was too slow and prox.anikage.cc blocks server-side fetch).
        // The player will handle errors if a stream is dead.
        for (const src of sources) {
          if (!src?.streamUrl) continue;
          verified.push({
            server: `${job.server}-${src.quality || "auto"}`,
            type: job.lang,
            streamUrl: src.streamUrl,
            quality: src.quality || "auto",
            isM3U8: src.isM3U8 !== false,
            isMP4: false,
            isEmbed: false,
            hardsub: src.type === "hardsub",
            tracks: subtitles.filter((s: any) => s?.file).map((s: any) => ({
              url: s.file,
              lang: s.lang || "en",
              label: s.label || "English",
            })),
            intro: null,
            outro: null,
          });
        }

        // Embeds are SKIPPED — user only wants m3u8 servers
        // for (const embed of embeds) { ... }

        return verified;
      } catch {
        return [];
      }
    })
  );

  const allResults: AnikageVerifiedResult[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") allResults.push(...r.value);
  }

  // STRICT FILTER: only return servers with a valid streamUrl
  const filtered = allResults.filter(r => r.streamUrl && r.streamUrl.length > 10);

  console.log(`[AniKage] ${filtered.length} servers verified (from ${jobs.length} jobs)`);
  return filtered;
}
