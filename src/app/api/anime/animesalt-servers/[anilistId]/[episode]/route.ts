import { NextRequest, NextResponse } from "next/server";
import { fetchAnimeSaltServers } from "@/lib/animesalt-api";
import { cachedQuery } from "@/lib/anilist-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

/**
 * GET /api/anime/animesalt-servers/[anilistId]/[episode]?title=...
 *
 * AnimeSalt Hindi/Tamil/Telugu/English/Japanese multi-audio streams.
 *
 * Slug resolution: AniList title → slugified → probe /series/{slug}/.
 * If 404, fall back to /letter/{X}/ scan with normalized fuzzy match.
 * Season resolution: title-based ("Season 2", "S2", roman numerals)
 * then prequel walk (skipping Cour/Part entries which are same-season).
 *
 * ASCDN stream extraction:
 *   1. GET episode page → extract as-cdn{N}.top/video/{hash}
 *   2. POST as-cdn{N}.top/player/index.php?data={hash}&do=getVideo
 *      → JSON { hls: true, videoSource: master.m3u8?md5=...&expires=... }
 *   3. Return m3u8 URL directly — multi-audio HLS, no decryption.
 */

// ── In-memory season cache (avoid repeated AniList calls) ──
const seasonCache = new Map<number, { season: number; ts: number }>();
const SEASON_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function extractSeasonFromTitle(title: string): number {
  if (!title) return 0;

  let m = title.match(/(\d+)(?:st|nd|rd|th)\s+season/i);
  if (m) return parseInt(m[1], 10);

  m = title.match(/season\s+(\d+)/i);
  if (m) return parseInt(m[1], 10);

  m = title.match(/\bS(\d+)\b/i);
  if (m) return parseInt(m[1], 10);

  // Roman numerals (II, III, IV, V, ...) — only count if > 1
  m = title.match(/\b(II|III|IV|V(?:I{0,3})?|IX|X{1,3}I{0,3})\b(?!\w)/);
  if (m) {
    const romanMap: Record<string, number> = {
      I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10,
    };
    const n = romanMap[m[1]];
    if (n && n > 1) return n;
  }

  return 0;
}

async function resolveSeasonNumber(anilistId: number): Promise<number> {
  const cached = seasonCache.get(anilistId);
  if (cached && Date.now() - cached.ts < SEASON_CACHE_TTL) return cached.season;

  try {
    const data = await cachedQuery(
      `query ($id: Int!) {
        Media(id: $id, type: ANIME) {
          id
          title { english romaji }
          format
          relations { edges { relationType node { id title { english romaji } format } } }
        }
      }`,
      { id: anilistId },
    );

    const media = data?.data?.Media;
    if (media) {
      const eng = media.title?.english || "";
      const rom = media.title?.romaji || "";
      let season = extractSeasonFromTitle(eng);
      if (season === 0) season = extractSeasonFromTitle(rom);
      if (season > 0) {
        seasonCache.set(anilistId, { season, ts: Date.now() });
        return season;
      }

      // Walk PREQUEL chain, skipping Cour/Part entries (same season)
      let currentId = anilistId;
      let seasonCount = 1;
      const visited = new Set<number>();
      visited.add(currentId);

      for (let i = 0; i < 10; i++) {
        if (!media.relations?.edges && currentId === anilistId) break;
        let prequelData;
        if (currentId === anilistId) {
          prequelData = media;
        } else {
          try {
            prequelData = await cachedQuery(
              `query ($id: Int!) {
                Media(id: $id, type: ANIME) {
                  id
                  title { english romaji }
                  format
                  relations { edges { relationType node { id title { english romaji } format } } }
                }
              }`,
              { id: currentId },
            );
            prequelData = prequelData?.data?.Media;
          } catch { break; }
        }
        if (!prequelData) break;

        const edges = prequelData.relations?.edges || [];
        const prequel = edges.find((e: any) =>
          e.relationType === "PREQUEL" &&
          (!e.node?.format || e.node.format === "TV" || e.node.format === "TV_SHORT" || e.node.format === "ONA"),
        );
        if (!prequel || visited.has(prequel.node.id)) break;
        visited.add(prequel.node.id);

        const prequelEng = prequel.node.title?.english || "";
        const prequelRom = prequel.node.title?.romaji || "";
        let prequelSeason = extractSeasonFromTitle(prequelEng);
        if (prequelSeason === 0) prequelSeason = extractSeasonFromTitle(prequelRom);

        if (prequelSeason > 0) {
          seasonCount = prequelSeason + 1;
          break;
        }

        const isCourOrPart =
          /\b(?:cour|part)\s*\d+\b/i.test(prequelEng) ||
          /\b(?:cour|part)\s*\d+\b/i.test(prequelRom);
        if (!isCourOrPart) seasonCount++;

        currentId = prequel.node.id;
      }

      seasonCache.set(anilistId, { season: seasonCount, ts: Date.now() });
      return seasonCount;
    }
  } catch {
    /* fall through to default */
  }

  return 1;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ anilistId: string; episode: string }> },
) {
  const { anilistId, episode } = await params;
  const id = parseInt(anilistId, 10);
  const epNum = parseInt(episode, 10);

  if (isNaN(id) || id <= 0 || isNaN(epNum) || epNum < 1) {
    return NextResponse.json(
      { error: "Invalid anilistId or episode", servers: [], total: 0 },
      { status: 400 },
    );
  }

  const title = req.nextUrl.searchParams.get("title") || "";

  // Resolve season from AniList title + prequel chain
  const season = await resolveSeasonNumber(id);

  // Fetch the AniList title if not provided in the query string
  let englishTitle = title;
  let romajiTitle = "";
  if (!englishTitle) {
    try {
      const data = await cachedQuery(
        `query ($id: Int!) {
          Media(id: $id, type: ANIME) {
            title { english romaji }
          }
        }`,
        { id },
      );
      englishTitle = data?.data?.Media?.title?.english || "";
      romajiTitle = data?.data?.Media?.title?.romaji || "";
    } catch {
      /* ignore */
    }
  }

  if (!englishTitle && !romajiTitle) {
    return NextResponse.json(
      { error: "Anime title unavailable — pass ?title= in the URL", servers: [], total: 0 },
      { status: 400 },
    );
  }

  const result = await fetchAnimeSaltServers(id, epNum, season, englishTitle, romajiTitle);

  return NextResponse.json(
    {
      anilistId: id,
      episode: epNum,
      season,
      matchedSlug: result.matchedSlug,
      videoHash: result.videoHash,
      languages: result.languages,
      servers: result.servers,
      total: result.servers.length,
    },
    { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" } },
  );
}
