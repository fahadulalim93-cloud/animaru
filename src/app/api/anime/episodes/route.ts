import { NextRequest, NextResponse } from "next/server";
import { getAnimeDetails, getAnimeBasicInfo } from "@/lib/anilist-api";
import { miruroInfo, miruroEpisodes } from "@/lib/miruro-api";

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

// Fetch Lunar scraper episodes (real per-episode thumbnails on fetch.flixcloud.cc)
async function fetchLunarEpisodes(anilistId: number): Promise<any[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`https://luffytv-fahad.vercel.app/api/anime/scraper/episodes/lunar/${anilistId}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const data = await res.json();
    return data?.episodes || [];
  } catch { return []; }
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

    // ── PARALLEL: Lunar + Animex scraper for thumbnails/titles ──
    let lunarEps: any[] = [];
    let animexEps: any[] = [];
    if (anilistId) {
      const [lunarResult, animexResult] = await Promise.allSettled([
        fetchLunarEpisodes(anilistId),
        fetchAnimexEpisodes(anilistId),
      ]);
      if (lunarResult.status === 'fulfilled') lunarEps = lunarResult.value;
      if (animexResult.status === 'fulfilled') animexEps = animexResult.value;
    }

    const lunarByNum = new Map<number, any>();
    for (const ep of lunarEps) lunarByNum.set(Number(ep.number), ep);
    const animexByNum = new Map<number, any>();
    for (const ep of animexEps) animexByNum.set(Number(ep.number), ep);

    // If scrapers have higher episode counts than AniList, prefer AniList's count
    // (e.g. Mugen Train: AniList says 1, scrapers might return many — AniList wins for MOVIE format)
    const maxScraperEp = Math.max(
      lunarByNum.size > 0 ? Math.max(...lunarByNum.keys()) : 0,
      animexByNum.size > 0 ? Math.max(...animexByNum.keys()) : 0,
    );

    let finalTotal: number;
    if (isMovie && totalEpsFromAniList) {
      // For movies, ALWAYS trust AniList's episode count (usually 1)
      // Scrapers often return wrong episode data for movies
      finalTotal = totalEpsFromAniList;
    } else if (totalEpsFromAniList && totalEpsFromAniList > 0) {
      // For TV series, use the larger of AniList count or scraper max
      // (some anime have AniList=12 but actual=24 from scrapers)
      finalTotal = Math.max(totalEpsFromAniList, maxScraperEp);
    } else if (maxScraperEp > 0) {
      // No AniList count, use scraper count
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
      const lunarEp = lunarByNum.get(i);
      const animexEp = animexByNum.get(i);
      const subEp = miruroEpsResult.sub?.find((e: any) => Number(e.number) === i);
      const dubEp = miruroEpsResult.dub?.find((e: any) => Number(e.number) === i);

      // Title priority: Animex > AniList streamingEpisodes > Miruro > Lunar > "Episode N"
      const title =
        animexEp?.title ||
        anilistEp?.title ||
        subEp?.title || dubEp?.title ||
        lunarEp?.title ||
        `Episode ${i}`;

      // Thumbnail priority: AniList streamingEpisodes > Lunar (real scene stills) > Miruro
      const thumbnail =
        anilistEp?.thumbnail ||
        lunarEp?.thumbnail ||
        subEp?.thumbnail || dubEp?.thumbnail ||
        null;

      finalEpisodes.push({
        episodeIdNum: i,
        title,
        thumbnail,
        description: null,
        source: anilistEp ? "anilist" : (lunarEp ? "lunar" : (subEp ? "miruro" : "numbered")),
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
        hasLunar: lunarEps.length > 0,
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
