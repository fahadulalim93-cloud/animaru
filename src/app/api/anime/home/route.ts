import { NextRequest, NextResponse } from "next/server";
import { getTrending, getPopular } from "@/lib/anilist-api";
import { miruroTrending, miruroPopular, miruroRecent } from "@/lib/miruro-api";
import { malTopAnime, malSeasonNow } from "@/lib/mal-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Normalize any anime item to a consistent MiruroAnimeResult shape.
 */
function normalizeItem(item: any): Record<string, any> {
  let title: { romaji?: string; english?: string; native?: string };
  if (item.title && typeof item.title === "object") {
    title = {
      romaji: item.title.romaji || undefined,
      english: item.title.english || undefined,
      native: item.title.native || undefined,
    };
  } else if (typeof item.title === "string" && item.title) {
    title = { romaji: item.title, english: item.title };
  } else if (item.name) {
    title = { romaji: item.name, english: item.englishName || item.name };
  } else {
    title = { romaji: "Unknown" };
  }

  let coverImage: { extraLarge?: string; large?: string; medium?: string; color?: string } | undefined;
  if (item.coverImage && typeof item.coverImage === "object") {
    coverImage = {
      extraLarge: item.coverImage.extraLarge || undefined,
      large: item.coverImage.large || undefined,
      medium: item.coverImage.medium || undefined,
      color: item.coverImage.color || undefined,
    };
  } else if (item.thumbnail) {
    coverImage = { extraLarge: item.thumbnail, large: item.thumbnail, medium: item.thumbnail };
  } else {
    coverImage = undefined;
  }

  return {
    id: item.id || item._id || 0,
    title,
    coverImage,
    bannerImage: item.bannerImage || undefined,
    type: item.type || undefined,
    format: item.format || undefined,
    status: item.status || undefined,
    description: item.description || undefined,
    season: item.season || undefined,
    seasonYear: item.seasonYear || item.year || undefined,
    episodes: item.episodes ?? undefined,
    duration: item.duration ?? undefined,
    genres: Array.isArray(item.genres) ? item.genres.filter((g: any) => typeof g === "string") : undefined,
    averageScore: item.averageScore ?? (item.score ? Math.round(item.score * 10) : undefined),
    popularity: item.popularity ?? undefined,
    trending: item.trending ?? undefined,
    countryOfOrigin: item.countryOfOrigin || undefined,
    isAdult: item.isAdult || undefined,
  };
}

/**
 * GET /api/anime/home
 * PARALLEL 3-LAYER FALLBACK: AniList (primary) → Miruro (backup 1) → MAL API (backup 2)
 *
 * All 3 layers are raced in parallel — first successful response wins.
 * This is dramatically faster than sequential fallback.
 */
export async function GET(request: NextRequest) {
  try {
    // ---- TRENDING: Race all 3 sources in parallel ----
    const trendingRace = await Promise.any([
      getTrending(1, 20).then(d => d && d.length > 0 ? { data: d, source: "anilist" } : Promise.reject("anilist empty")),
      miruroTrending(1, 20).then(d => d && d.length > 0 ? { data: d, source: "miruro" } : Promise.reject("miruro empty")),
      malTopAnime(1, 20, "airing").then(d => d && d.length > 0 ? { data: d, source: "mal" } : Promise.reject("mal empty")),
    ]).catch(() => ({ data: [], source: "none" }));

    // ---- POPULAR: Race all 3 sources in parallel ----
    const popularRace = await Promise.any([
      getPopular(1, 20).then(d => d && d.length > 0 ? { data: d, source: "anilist" } : Promise.reject("anilist empty")),
      miruroPopular(1, 20).then(d => d && d.length > 0 ? { data: d, source: "miruro" } : Promise.reject("miruro empty")),
      malTopAnime(1, 20, "bypopularity").then(d => d && d.length > 0 ? { data: d, source: "mal" } : Promise.reject("mal empty")),
    ]).catch(() => ({ data: [], source: "none" }));

    // ---- RECENT: Race all 3 sources in parallel ----
    const recentRace = await Promise.any([
      miruroRecent(1, 20).then(d => d && d.length > 0 ? { data: d, source: "miruro" } : Promise.reject("miruro empty")),
      getTrending(1, 20).then(d => d && d.length > 0 ? { data: d, source: "anilist" } : Promise.reject("anilist empty")),
      malSeasonNow(1, 20).then(d => d && d.length > 0 ? { data: d, source: "mal" } : Promise.reject("mal empty")),
    ]).catch(() => ({ data: [], source: "none" }));

    // Also kick off top-rated in parallel
    const topRatedRace = await Promise.any([
      getPopular(1, 20).then(d => d && d.length > 0 ? { data: d, source: "anilist" } : Promise.reject("anilist empty")),
      miruroPopular(1, 20).then(d => d && d.length > 0 ? { data: d, source: "miruro" } : Promise.reject("miruro empty")),
      malTopAnime(1, 20, "all").then(d => d && d.length > 0 ? { data: d, source: "mal" } : Promise.reject("mal empty")),
    ]).catch(() => ({ data: [], source: "none" }));

    const trendingData = (trendingRace.data || []).map(normalizeItem);
    const popularData = (popularRace.data || []).map(normalizeItem);
    const recentData = (recentRace.data || []).map(normalizeItem);
    const topRatedData = (topRatedRace.data || []).map(normalizeItem);

    return NextResponse.json({
      trending: trendingData,
      popular: popularData,
      recent: recentData,
      topRated: topRatedData,
      miruroTrending: trendingData,
      miruroPopular: popularData,
      miruroRecent: recentData,
      _sources: {
        trending: trendingRace.source,
        popular: popularRace.source,
        recent: recentRace.source,
        topRated: topRatedRace.source,
      },
    });
  } catch (error) {
    console.error("[home] Error:", error);
    return NextResponse.json({
      trending: [],
      popular: [],
      recent: [],
      topRated: [],
      miruroTrending: [],
      miruroPopular: [],
      miruroRecent: [],
      error: "Failed to fetch home data",
    }, { status: 500 });
  }
}
