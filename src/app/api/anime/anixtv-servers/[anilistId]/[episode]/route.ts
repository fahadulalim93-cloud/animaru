import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * GET /api/anime/anixtv-servers/[anilistId]/[episode]
 *
 * AnixTV Hindi dub, standalone.
 *
 * Season resolution: Extract season number from the anime title first
 * (most reliable — AniList titles include "Season 2", "S2", roman numerals),
 * then fall back to walking the PREQUEL chain via AniList (skipping Cour/Part
 * entries which are within the same season).
 *
 * This is REQUIRED because AnixTV's `season` parameter selects which season's
 * episodes to return — it does NOT use the AniList ID for season selection.
 *
 * Example (Mushoku Tensei):
 *   - AniList S2 ID = 146065, title = "... Season 2"
 *   - AnixTV: id=146065&season=1 → returns S1E1 (WRONG!)
 *   - AnixTV: id=146065&season=2 → returns S2E1 (CORRECT!)
 *
 * Previous bugs:
 *   - "always season=1": Always returned S1 episodes for all seasons
 *   - "naive prequel walk": Counted Cour/Part entries as separate seasons
 *     (e.g. Cour 2 of S1 counted as S2, pushing actual S2 to S3)
 */

const ANIXTV_BASE = "https://anixtv.in";
const ANILIST_GQL = "https://graphql.anilist.co";

// ── In-memory season cache (avoids repeated AniList calls) ──
const seasonCache = new Map<number, { season: number; ts: number }>();
const SEASON_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Extract season number from an anime title string.
 * Returns 0 if the title doesn't contain an explicit season indicator.
 */
function extractSeasonFromTitle(title: string): number {
  if (!title) return 0;

  // '2nd Season', '3rd Season', etc.
  let m = title.match(/(\d+)(?:st|nd|rd|th)\s+season/i);
  if (m) return parseInt(m[1], 10);

  // 'Season 2', 'Season 3', etc.
  m = title.match(/season\s+(\d+)/i);
  if (m) return parseInt(m[1], 10);

  // 'S2', 'S3', etc. (standalone, not mid-word like 'Slime')
  m = title.match(/\bS(\d+)\b/i);
  if (m) return parseInt(m[1], 10);

  // Roman numerals after title: 'Title II', 'Title III', 'Title IV'
  // Only count if > 1 (I could be part of the title)
  m = title.match(/\b(II|III|IV|V(?:I{0,3})?|IX|X{1,3}I{0,3})\b(?!\w)/);
  if (m) {
    const romanMap: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
    const n = romanMap[m[1]];
    if (n && n > 1) return n;
  }

  return 0; // no explicit season indicator
}

/**
 * Resolve the actual season number for an AniList ID.
 *
 * Strategy (in order of reliability):
 *   1. Parse the anime title for "Season N" / "SN" / Roman numerals
 *   2. Walk PREQUEL chain, skipping Cour/Part entries (same season)
 *   3. Default to 1 (first season)
 */
async function resolveSeasonNumber(anilistId: number): Promise<number> {
  // Check cache
  const cached = seasonCache.get(anilistId);
  if (cached && Date.now() - cached.ts < SEASON_CACHE_TTL) {
    return cached.season;
  }

  // Step 1: Get title from AniList
  let englishTitle = "";
  let romajiTitle = "";
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 5000);
    const res = await fetch(ANILIST_GQL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        query: `query($id:Int){Media(id:$id,type:ANIME){title{english romaji}}}`,
        variables: { id: anilistId },
      }),
      signal: ac.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    if (res.ok) {
      const json = await res.json();
      const t = json?.data?.Media?.title;
      englishTitle = t?.english || "";
      romajiTitle = t?.romaji || "";
    }
  } catch { /* best-effort */ }

  // Step 2: Try title-based extraction (english first, then romaji)
  let season = extractSeasonFromTitle(englishTitle);
  if (season === 0) season = extractSeasonFromTitle(romajiTitle);

  if (season > 0) {
    // Title had explicit season info — cache and return
    seasonCache.set(anilistId, { season, ts: Date.now() });
    return season;
  }

  // Step 3: Title didn't have season info — walk PREQUEL chain
  // Skip Cour/Part entries (they're the same season, not a new one)
  season = 1;
  let currentId = anilistId;
  const visited = new Set<number>([anilistId]);

  for (let step = 0; step < 10; step++) {
    // Check cache at this node
    const stepCached = seasonCache.get(currentId);
    if (stepCached && Date.now() - stepCached.ts < SEASON_CACHE_TTL) {
      season = stepCached.season + (season - 1);
      break;
    }

    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 5000);
      const res = await fetch(ANILIST_GQL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          query: `query($id:Int){Media(id:$id,type:ANIME){relations{edges{relationType}node{id format title{english romaji}}}}}`,
          variables: { id: currentId },
        }),
        signal: ac.signal,
        cache: "no-store",
      });
      clearTimeout(timer);

      if (!res.ok) break;
      const json = await res.json();
      const edges = json?.data?.Media?.relations?.edges;
      if (!Array.isArray(edges)) break;

      // Find PREQUEL that is a TV season (not movie/OVA/special)
      const prequel = edges.find((e: any) =>
        e.relationType === "PREQUEL" &&
        (!e.node?.format || e.node.format === "TV" || e.node.format === "TV_SHORT" || e.node.format === "ONA")
      );

      if (!prequel || visited.has(prequel.node.id)) break;

      visited.add(prequel.node.id);

      // Check prequel title for season info
      const prequelEng = prequel.node.title?.english || "";
      const prequelRom = prequel.node.title?.romaji || "";
      let prequelSeason = extractSeasonFromTitle(prequelEng);
      if (prequelSeason === 0) prequelSeason = extractSeasonFromTitle(prequelRom);

      if (prequelSeason > 0) {
        // Prequel has explicit season number — we're one after it
        season = prequelSeason + 1;
        seasonCache.set(currentId, { season, ts: Date.now() });
        break;
      }

      // No explicit season in title — check if it's a Cour/Part (same season)
      const isCourOrPart = /\b(?:cour|part)\s*\d+\b/i.test(prequelEng) ||
                           /\b(?:cour|part)\s*\d+\b/i.test(prequelRom);
      if (!isCourOrPart) {
        // It's a real previous season — increment counter
        season++;
      }
      // Cour/Part = same season, don't increment

      currentId = prequel.node.id;
    } catch {
      break;
    }
  }

  // Cache the result
  seasonCache.set(anilistId, { season, ts: Date.now() });
  return season;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ anilistId: string; episode: string }> },
) {
  const { anilistId, episode } = await params;
  const id = parseInt(anilistId, 10);
  const epNum = parseInt(episode, 10);

  if (isNaN(id) || id <= 0 || isNaN(epNum) || epNum < 1) {
    return NextResponse.json({ error: "Invalid anilistId or episode", servers: [], total: 0 }, { status: 400 });
  }

  const title = req.nextUrl.searchParams.get("title") || "";

  // Resolve correct season number (title-based + prequel walk fallback)
  const season = await resolveSeasonNumber(id);

  const streamUrl =
    `${ANIXTV_BASE}/anime-watch?action=hindi_1_player&id=${id}` +
    `&season=${season}&episode=${epNum}&title=${encodeURIComponent(title)}`;

  return NextResponse.json(
    {
      anilistId: id,
      episode: epNum,
      season,
      seasonSource: "title+prequel-walk",
      servers: [
        {
          id: `anixtv:hindi_1:s${season}:dub`,
          name: "AnixTV Hindi",
          source: "anixtv",
          provider: "hindi_1",
          type: "dub",
          quality: "1080p",
          streamUrl,
          isM3U8: false,
          isMP4: false,
          isEmbed: true,
          // Route through /api/embed/proxy — it strips sandbox detection,
          // injects anti-sandbox overrides, and for CF-protected sites like
          // anixtv.in, internally routes through the CF Worker to bypass
          // bot protection. This matches the reference Vercel app (luffytv2).
          noProxy: false,
          useEmbedProxy: true,
          hardsub: false,
          subtitleTracks: [],
          intro: null,
          outro: null,
        },
      ],
      total: 1,
    },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
