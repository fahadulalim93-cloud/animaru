import { NextRequest, NextResponse } from "next/server";
import { rewriteAnimeArray } from "@/lib/cdn/rewrite-urls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/anime/home
 *
 * Returns trending / popular / topRated / recent / upcoming sections.
 *
 * ALL data comes from our LOCAL SQLite database (anime-db.sqlite).
 * Does NOT use AniList API. The DB is kept fresh by the daily scraper
 * (scrape-anilist-fill.mjs runs at 4 AM + auto-sync-airing.cjs runs hourly).
 *
 * This is faster (0ms network latency — local file) and more reliable
 * (no dependency on AniList's uptime).
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
    averageScore: item.averageScore ?? undefined,
    popularity: item.popularity ?? undefined,
    trending: item.trending ?? undefined,
    countryOfOrigin: item.countryOfOrigin || undefined,
    isAdult: item.isAdult || undefined,
  };
}

export async function GET(request: NextRequest) {
  try {
    const sqlite = await import("@/lib/anime-db-sqlite");

    // ── Pull all sections from SQLite in parallel ──
    const [trendingRaw, popularRaw, topRatedRaw, recentRaw, upcomingRaw] = await Promise.all([
      Promise.resolve(sqlite.getTrendingFromSqlite(20)).catch(() => []),
      Promise.resolve(sqlite.getPopularFromSqlite(20)).catch(() => []),
      Promise.resolve(sqlite.getTopRatedFromSqlite(20)).catch(() => []),
      Promise.resolve(sqlite.getRecentFromSqlite(20)).catch(() => []),
      Promise.resolve(sqlite.getUpcomingFromSqlite(20)).catch(() => []),
    ]);

    let trendingList = trendingRaw.map((m: any) => normalizeItem(m));
    let popularList = popularRaw.map((m: any) => normalizeItem(m));
    let topRatedList = topRatedRaw.map((m: any) => normalizeItem(m));
    let recentList = recentRaw.map((m: any) => normalizeItem(m));
    let upcomingList = upcomingRaw.map((m: any) => normalizeItem(m));

    // ── Rewrite all image URLs to use cdn.luffytv.live ──
    trendingList = rewriteAnimeArray(trendingList);
    popularList = rewriteAnimeArray(popularList);
    recentList = rewriteAnimeArray(recentList);
    topRatedList = rewriteAnimeArray(topRatedList);
    upcomingList = rewriteAnimeArray(upcomingList);

    return NextResponse.json({
      trending: trendingList,
      popular: popularList,
      recent: recentList,
      topRated: topRatedList,
      upcoming: upcomingList,
      miruroTrending: trendingList,
      miruroPopular: popularList,
      miruroRecent: recentList,
      _sources: {
        trending: "sqlite",
        popular: "sqlite",
        recent: "sqlite",
        topRated: "sqlite",
        upcoming: "sqlite",
      },
    }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (error) {
    console.error("[home] Error:", error);
    return NextResponse.json({
      trending: [],
      popular: [],
      recent: [],
      topRated: [],
      upcoming: [],
      miruroTrending: [],
      miruroPopular: [],
      miruroRecent: [],
      error: "Failed to fetch home data",
    }, { status: 500 });
  }
}
