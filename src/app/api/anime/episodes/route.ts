import { NextRequest, NextResponse } from "next/server";
import { getAnimeDetails, getAnimeBasicInfo } from "@/lib/anilist-api";
import { miruroInfo, miruroEpisodes } from "@/lib/miruro-api";
import { getAnimeByAnilistId } from "@/lib/anime-db-sqlite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Extract the actual ID and detect its source
function parseAnimeId(rawId: string): { anilistId: number | null; allanimeId: string | null } {
  const cleanId = rawId.replace(/^miruro_/, "").replace(/^mal_/, "");
  if (/^\d+$/.test(cleanId)) {
    return { anilistId: parseInt(cleanId), allanimeId: null };
  }
  return { anilistId: null, allanimeId: cleanId };
}

// Fetch Animex scraper episodes (real episode titles)
async function fetchAnimexEpisodes(anilistId: number): Promise<any[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`https://luffytv-fahad.vercel.app/api/anime/scraper/episodes/animex/${anilistId}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const data = await res.json();
    return data?.episodes || [];
  } catch { return []; }
}

/**
 * Last-resort SQLite fallback for episode count.
 *
 * When AniList is down (currently the case — "severe stability issues"), the
 * cachedQuery Layer 5 fallback returns our SQLite raw_json. Some anime have
 * raw_json.episodes = null (anime was ongoing when scraped). For those, we
 * fall back to the SQLite column value (`anime.episodes`) which is at least
 * a non-null number we can show.
 *
 * If raw_json has nextAiringEpisode.episode, we use that - 1 as the most
 * accurate count (currently-airing anime).
 */
function getEpisodesFromSqlite(anilistId: number): {
  episodes: number | null;
  nextAiringEpisode: { episode: number; airingAt: number } | null;
  title: { romaji?: string; english?: string; native?: string } | null;
  streamingEpisodes: any[];
  format: string | null;
  status: string | null;
} {
  const sqliteData = getAnimeByAnilistId(anilistId);
  if (!sqliteData?.Media) {
    return { episodes: null, nextAiringEpisode: null, title: null, streamingEpisodes: [], format: null, status: null };
  }
  const m = sqliteData.Media;
  let episodes: number | null = m.episodes || null;
  // If episodes is null but nextAiringEpisode exists, use episode - 1
  if ((!episodes || episodes === 0) && m.nextAiringEpisode?.episode && m.nextAiringEpisode.episode > 1) {
    episodes = m.nextAiringEpisode.episode - 1;
  }
  return {
    episodes,
    nextAiringEpisode: m.nextAiringEpisode || null,
    title: m.title || null,
    streamingEpisodes: m.streamingEpisodes || [],
    format: m.format || null,
    status: m.status || null,
  };
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    const { anilistId } = parseAnimeId(id);

    let animeTitle: string | null = null;
    let totalEpsFromAniList: number | null = null;
    let anilistEps: any[] = [];
    let isMovie = false;
    let miruroEpsResult: { sub: any[]; dub: any[] } = { sub: [], dub: [] };

    if (anilistId) {
      // ── PARALLEL: AniList details + Miruro episodes + Miruro info ──
      const [anilistDataResult, miruroEpsResult_, miruroInfoResult] = await Promise.allSettled([
        getAnimeDetails(anilistId),
        miruroEpisodes(anilistId),
        miruroInfo(anilistId),
      ]);

      // Process AniList data — Media.episodes is AUTHORITATIVE episode count
      if (anilistDataResult.status === 'fulfilled' && anilistDataResult.value) {
        const anilistData = anilistDataResult.value;
        animeTitle = anilistData.title?.english || anilistData.title?.romaji || null;
        isMovie = anilistData.format === "MOVIE" || anilistData.format === "MOVIE_SPECIAL";

        // Episode count priority (what AniList tells us about episodes shipped):
        //   1. Media.episodes — authoritative for FINISHED anime (e.g. "26 episodes")
        //   2. nextAiringEpisode.episode - 1 — for ONGOING anime (next ep to air = N means N-1 have aired)
        //      e.g. ONE PIECE: Media.episodes=null, nextAiringEpisode.episode=1169 → 1168 aired
        //   3. streamingEpisodes.length — last resort (often incomplete, e.g. only 69 for ONE PIECE)
        if (anilistData.episodes && anilistData.episodes > 0) {
          totalEpsFromAniList = anilistData.episodes;
        } else if (anilistData.nextAiringEpisode && anilistData.nextAiringEpisode.episode > 1) {
          // Ongoing anime: next episode to air is N, so N-1 have shipped
          totalEpsFromAniList = anilistData.nextAiringEpisode.episode - 1;
        } else if (anilistData.streamingEpisodes && anilistData.streamingEpisodes.length > 0) {
          totalEpsFromAniList = anilistData.streamingEpisodes.length;
        }

        // AniList streamingEpisodes are often wrong (e.g. movies returning TV episode data)
        // For movies, ignore streamingEpisodes entirely
        if (anilistData.streamingEpisodes && anilistData.streamingEpisodes.length > 0 && !isMovie) {
          // streamingEpisodes are often newest-first — reverse to get ep 1 first
          const reversedEps = [...anilistData.streamingEpisodes].reverse();
          anilistEps = reversedEps.map((ep: any, i: number) => ({
            episodeIdNum: i + 1,
            title: ep.title || null,
            thumbnail: ep.thumbnail || null,
            url: ep.url || null,
            site: ep.site || null,
            source: "anilist",
          }));
        }
      } else {
        // AniList full details failed, try basic info
        try {
          const anilistData = await getAnimeBasicInfo(anilistId);
          if (anilistData) {
            animeTitle = anilistData.title?.english || anilistData.title?.romaji || null;
            isMovie = anilistData.format === "MOVIE";
            // Same priority: Media.episodes > nextAiringEpisode.episode - 1 > streamingEpisodes.length
            if (anilistData.episodes && anilistData.episodes > 0) {
              totalEpsFromAniList = anilistData.episodes;
            } else if (anilistData.nextAiringEpisode && anilistData.nextAiringEpisode.episode > 1) {
              totalEpsFromAniList = anilistData.nextAiringEpisode.episode - 1;
            }
          }
        } catch { /* basic info fallback failed */ }
      }

      // ── FALLBACK: If AniList returned no episode count, pull from SQLite ──
      // AniList is currently down. cachedQuery Layer 5 already returns SQLite
      // raw_json, but if that raw_json has episodes=null, we still have no count.
      // As a last resort, fall through to the SQLite column value (which was
      // denormalized when we first scraped — should be non-null for most anime).
      if (!totalEpsFromAniList || totalEpsFromAniList === 0) {
        const sqliteEps = getEpisodesFromSqlite(anilistId);
        if (sqliteEps.episodes && sqliteEps.episodes > 0) {
          totalEpsFromAniList = sqliteEps.episodes;
          if (!animeTitle) animeTitle = sqliteEps.title?.english || sqliteEps.title?.romaji || null;
          if (!isMovie) isMovie = sqliteEps.format === "MOVIE";
          console.log(`[episodes] SQLite fallback for ${anilistId}: ${sqliteEps.episodes} episodes`);
        }
      }

      // Process Miruro episodes
      if (miruroEpsResult_.status === 'fulfilled' && miruroEpsResult_.value) {
        miruroEpsResult = miruroEpsResult_.value;
      }

      // Process Miruro info (for title/ep count)
      if (miruroInfoResult.status === 'fulfilled' && miruroInfoResult.value) {
        const miruroInfoData = miruroInfoResult.value;
        if (!animeTitle) animeTitle = miruroInfoData?.title?.english || miruroInfoData?.title?.romaji || null;
        if (!totalEpsFromAniList && miruroInfoData?.episodes) {
          totalEpsFromAniList = miruroInfoData.episodes;
        }
      }
    }

    // ── PARALLEL: Animex scraper for titles ──
    let animexEps: any[] = [];
    if (anilistId) {
      const [animexResult] = await Promise.allSettled([
        fetchAnimexEpisodes(anilistId),
      ]);
      if (animexResult.status === 'fulfilled') animexEps = animexResult.value;
    }

    const animexByNum = new Map<number, any>();
    for (const ep of animexEps) animexByNum.set(Number(ep.number), ep);

    // Scraper count is only used as a FALLBACK when AniList has no count.
    // We NEVER let scrapers override AniList, because scrapers resolve
    // AniList ID → source ID by TITLE search, which frequently matches
    // the WRONG season (e.g. searching for "That Time I Got Reincarnated
    // as a Slime" S2 will match S1's 24-26 episode entry, causing the
    // detail page to show 26 episodes when AniList correctly says 12).
    const maxScraperEp = Math.max(
      animexByNum.size > 0 ? Math.max(...animexByNum.keys()) : 0,
    );

    // If AniList says this season has N episodes but the scraper returned
    // significantly more (e.g. 12 vs 24+), the scraper almost certainly
    // matched a DIFFERENT season via title search. In that case, drop the
    // scraper's enrichment data entirely — those titles/thumbnails belong
    // to a different season and would mislead the user.
    // Threshold: scraper has >50% more episodes than AniList, AND at least
    // 2 extra episodes (to avoid false positives on near-complete scrapers).
    let animexByNumSafe = animexByNum;
    if (
      totalEpsFromAniList && totalEpsFromAniList > 0 &&
      maxScraperEp > totalEpsFromAniList &&
      (maxScraperEp >= totalEpsFromAniList * 1.5 || maxScraperEp - totalEpsFromAniList >= 2)
    ) {
      console.warn(
        `[episodes] Discarding animex enrichment: scraper returned ${maxScraperEp} eps ` +
        `but AniList says ${totalEpsFromAniList} — likely wrong-season match`
      );
      animexByNumSafe = new Map();
    }

    let finalTotal: number;
    if (isMovie && totalEpsFromAniList) {
      // For movies, ALWAYS trust AniList's episode count (usually 1)
      // Scrapers often return wrong episode data for movies
      finalTotal = totalEpsFromAniList;
    } else if (totalEpsFromAniList && totalEpsFromAniList > 0) {
      // For TV series, AniList's Media.episodes is AUTHORITATIVE.
      // Do NOT use Math.max with scraper count — title-based scrapers
      // frequently match a different season (S1 vs S2) and return more
      // episodes than this season actually has. This matches the logic
      // already used by watch-page.tsx (its loadEpisodes trusts AniList).
      finalTotal = totalEpsFromAniList;
    } else if (maxScraperEp > 0) {
      // No AniList count at all — fall back to scraper count
      finalTotal = maxScraperEp;
    } else if (anilistEps.length > 0) {
      // No AniList count, no scrapers, but streamingEpisodes exist
      finalTotal = anilistEps.length;
    } else {
      // No episode data anywhere — return empty (NO MORE FAKE 12-EPISODE FALLBACK)
      return NextResponse.json({
        episodes: [],
        miruroEpisodes: miruroEpsResult,
        allAnimeId: null,
        totalEpisodes: 0,
        _meta: {
          hasMiruro: false,
          hasAnilist: false,
          hasAllAnime: false,
          primarySource: "none",
          title: animeTitle,
          totalFromAniList: totalEpsFromAniList,
          isMovie,
        }
      });
    }

    // Build the final episode list (episodes 1..finalTotal)
    const hasMiruroEps = miruroEpsResult.sub?.length > 0 || miruroEpsResult.dub?.length > 0;
    const finalEpisodes: any[] = [];

    for (let i = 1; i <= finalTotal; i++) {
      const anilistEp = anilistEps.find(e => e.episodeIdNum === i);
      const animexEp = animexByNumSafe.get(i);  // ← safe map (drops wrong-season matches)
      const subEp = miruroEpsResult.sub?.find((e: any) => Number(e.number) === i);
      const dubEp = miruroEpsResult.dub?.find((e: any) => Number(e.number) === i);

      // Title priority: Animex > AniList streamingEpisodes > Miruro > "Episode N"
      const title =
        animexEp?.title ||
        anilistEp?.title ||
        subEp?.title || dubEp?.title ||
        `Episode ${i}`;

      // Thumbnail priority: AniList streamingEpisodes > Miruro
      const thumbnail =
        anilistEp?.thumbnail ||
        subEp?.thumbnail || dubEp?.thumbnail ||
        null;

      finalEpisodes.push({
        episodeIdNum: i,
        title,
        thumbnail,
        description: null,
        source: anilistEp ? "anilist" : (subEp ? "miruro" : "numbered"),
        subSlug: subEp?.slug || subEp?.id || String(i),
        dubSlug: dubEp?.slug || dubEp?.id || null,
      });
    }

    return NextResponse.json({
      episodes: finalEpisodes,
      miruroEpisodes: miruroEpsResult,
      allAnimeId: null,
      totalEpisodes: finalTotal,
      _meta: {
        hasMiruro: hasMiruroEps,
        hasAnilist: anilistEps.length > 0,
        hasAnimex: animexEps.length > 0,
        primarySource: hasMiruroEps ? "miruro" : (anilistEps.length > 0 ? "anilist" : "numbered"),
        title: animeTitle,
        totalFromAniList: totalEpsFromAniList,
        isMovie,
        finalTotal,
      }
    });
  } catch (err: any) {
    console.error("[episodes] Unhandled error:", err?.message || err);
    return NextResponse.json({
      episodes: [],
      miruroEpisodes: { sub: [], dub: [] },
      allAnimeId: null,
      totalEpisodes: null,
      _meta: { error: err?.message || "Unknown error" }
    });
  }
}
