import { NextRequest, NextResponse } from "next/server";
import { cachedQuery } from "@/lib/anilist-cache";

export const revalidate = 300; // 5 min cache

/**
 * GET /api/anime/anilist-trending
 *
 * Returns trending / popular / topRated / season sections.
 *
 * PRIMARY: AniList GraphQL API (fast, CDN-cached, always fresh)
 * FALLBACK: Local SQLite database (if AniList is down)
 *
 * Optional query params:
 *   - section: "trending" | "popular" | "topRated" | "season" | "all" (default: all)
 *   - season: "SPRING" | "SUMMER" | "FALL" | "WINTER" (for season filter)
 *   - year: number (for season filter, e.g. 2025)
 */
export async function GET(request: NextRequest) {
  const section = request.nextUrl.searchParams.get("section") || "all";
  const season = request.nextUrl.searchParams.get("season") || undefined;
  const yearStr = request.nextUrl.searchParams.get("year");
  const year = yearStr ? parseInt(yearStr) : new Date().getFullYear();

  try {
    const results: Record<string, any> = {};

    // ── AniList GraphQL queries (PRIMARY — fast, CDN-cached) ──
    const fetches: Record<string, Promise<any[]>> = {};

    if (section === "all" || section === "trending") {
      fetches.trending = cachedQuery<any>(
        `query { Page(page: 1, perPage: 25) { media(sort: TRENDING_DESC, type: ANIME, isAdult: false) { id idMal title { romaji english } coverImage { large extraLarge color } bannerImage averageScore episodes genres format seasonYear status } } }`,
        {},
        { ttl: 5 * 60 * 1000 }
      ).then(d => d?.Page?.media || []).catch(() => []);
      results._trendingSource = "anilist";
    }

    if (section === "all" || section === "popular") {
      fetches.popular = cachedQuery<any>(
        `query { Page(page: 1, perPage: 25) { media(sort: POPULARITY_DESC, type: ANIME, isAdult: false) { id idMal title { romaji english } coverImage { large extraLarge color } bannerImage averageScore episodes genres format seasonYear status } } }`,
        {},
        { ttl: 5 * 60 * 1000 }
      ).then(d => d?.Page?.media || []).catch(() => []);
      results._popularSource = "anilist";
    }

    if (section === "all" || section === "topRated") {
      fetches.topRated = cachedQuery<any>(
        `query { Page(page: 1, perPage: 25) { media(sort: SCORE_DESC, type: ANIME, isAdult: false) { id idMal title { romaji english } coverImage { large extraLarge color } bannerImage averageScore episodes genres format seasonYear status } } }`,
        {},
        { ttl: 5 * 60 * 1000 }
      ).then(d => d?.Page?.media || []).catch(() => []);
      results._topRatedSource = "anilist";
    }

    if (section === "season" || section === "all") {
      const currentMonth = new Date().getMonth();
      let currentSeason = season;
      if (!currentSeason) {
        if (currentMonth >= 0 && currentMonth <= 2) currentSeason = "WINTER";
        else if (currentMonth >= 3 && currentMonth <= 5) currentSeason = "SPRING";
        else if (currentMonth >= 6 && currentMonth <= 8) currentSeason = "SUMMER";
        else currentSeason = "FALL";
      }
      fetches.season = cachedQuery<any>(
        `query ($season: MediaSeason, $year: Int) { Page(page: 1, perPage: 25) { media(season: $season, seasonYear: $year, sort: POPULARITY_DESC, type: ANIME, isAdult: false) { id idMal title { romaji english } coverImage { large extraLarge color } bannerImage averageScore episodes genres format seasonYear status } } }`,
        { season: currentSeason, year },
        { ttl: 5 * 60 * 1000 }
      ).then(d => d?.Page?.media || []).catch(() => []);
      results._seasonSource = "anilist";
      results.seasonInfo = { season: currentSeason, year };
    }

    // Resolve all in parallel
    const keys = Object.keys(fetches);
    const resolved = await Promise.all(Object.values(fetches));

    // ── FALLBACK: If AniList returned empty for any section, use SQLite ──
    const sqlite = await import("@/lib/anime-db-sqlite");
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      let items = resolved[i] || [];

      if (items.length === 0) {
        // AniList failed — fall back to SQLite
        try {
          if (key === "trending") items = sqlite.getTrendingFromSqlite(25);
          else if (key === "popular") items = sqlite.getPopularFromSqlite(25);
          else if (key === "topRated") items = sqlite.getTopRatedFromSqlite(25);
          else if (key === "season") {
            const seasonResult = sqlite.browseFromSqlite({
              season: results.seasonInfo?.season,
              year,
              sort: "most-popular",
              page: 1,
              perPage: 25,
            });
            items = seasonResult?.results || [];
          }
          results[`_${key}Source`] = "sqlite-fallback";
        } catch {
          items = [];
        }
      }

      results[key] = items; // Use AniList CDN URLs directly (faster than VPS CDN)
    }

    const sourceLog = keys.map(k => `${k}=${results[`_${k}Source`]}`).join(" ");
    console.log(`[anilist-trending] section=${section} sources: ${sourceLog}`);

    return NextResponse.json(results, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (err) {
    console.error("[anilist-trending] Error:", err);
    return NextResponse.json({ error: "Failed to fetch trending data" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
