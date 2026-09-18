import { NextRequest, NextResponse } from "next/server";
import { cachedQuery } from "@/lib/anilist-cache";

export const revalidate = 300; // 5 min cache

/**
 * GET /api/anime/browse
 *
 * Browse anime. PRIMARY: AniList GraphQL API (fast, CDN-cached).
 * FALLBACK: Local SQLite database (if AniList fails).
 *
 * Query params:
 *   sort    — "most-popular" | "high-rated" | "trending" | "new"
 *   genre   — e.g. "Action", "Comedy"
 *   year    — e.g. 2024
 *   format  — "TV" | "MOVIE" | "OVA" | "ONA" | "SPECIAL" | "MUSIC"
 *   status  — "RELEASING" | "FINISHED" | "NOT_YET_RELEASED" | "CANCELLED"
 *   season  — "WINTER" | "SPRING" | "SUMMER" | "FALL"
 *   search  — text search
 *   page    — page number (default 1)
 *   perPage — items per page (default 30)
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const sort = params.get("sort") || "most-popular";
  const genre = params.get("genre") || "";
  const year = params.get("year") || "";
  const format = params.get("format") || "";
  const status = params.get("status") || "";
  const season = params.get("season") || "";
  const search = params.get("search") || "";
  const page = parseInt(params.get("page") || "1");
  const perPage = parseInt(params.get("perPage") || "30");

  // Map sort to AniList sort
  const sortMap: Record<string, string> = {
    "most-popular": "POPULARITY_DESC",
    "high-rated": "SCORE_DESC",
    "trending": "TRENDING_DESC",
    "new": "START_DATE_DESC",
  };
  const anilistSort = sortMap[sort] || "POPULARITY_DESC";

  try {
    // ── PRIMARY: AniList GraphQL API ──
    const query = `
      query ($page: Int, $perPage: Int, $sort: [MediaSort], $genre: String, $year: Int, $format: MediaFormat, $status: MediaStatus, $season: MediaSeason, $search: String) {
        Page(page: $page, perPage: $perPage) {
          media(sort: $sort, type: ANIME, isAdult: false, genre: $genre, seasonYear: $year, format: $format, status: $status, season: $season, search: $search) {
            id idMal title { romaji english } coverImage { large extraLarge color } bannerImage
            averageScore episodes genres format seasonYear status description duration
            nextAiringEpisode { airingAt timeUntilAiring episode }
          }
          pageInfo { hasNextPage total currentPage lastPage }
        }
      }
    `;

    const data = await cachedQuery<any>(query, {
      page,
      perPage,
      sort: [anilistSort],
      genre: genre || undefined,
      year: year ? Number(year) : undefined,
      format: format || undefined,
      status: status || undefined,
      season: season || undefined,
      search: search || undefined,
    }, { ttl: 5 * 60 * 1000 });

    const media = data?.Page?.media || [];
    const pageInfo = data?.Page?.pageInfo || {};

    if (media.length > 0) {
      // Return raw AniList objects — frontend expects objects (title{}, coverImage{})
      return NextResponse.json({
        results: media,
        pageInfo,
        total: pageInfo.total || media.length,
        hasNextPage: pageInfo.hasNextPage || false,
        currentPage: pageInfo.currentPage || page,
        _source: "anilist",
      }, {
        headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
      });
    }

    // ── FALLBACK: SQLite database ──
    const { browseFromSqlite } = await import("@/lib/anime-db-sqlite");
    const result = browseFromSqlite({
      genre: genre || undefined,
      year: year ? Number(year) : undefined,
      format: format || undefined,
      status: status || undefined,
      season: season || undefined,
      search: search || undefined,
      sort: sort || undefined,
      page,
      perPage,
    });

    if (!result || !result.results || result.results.length === 0) {
      return NextResponse.json({
        results: [],
        total: 0,
        hasNextPage: false,
        currentPage: page,
        _source: "empty",
      });
    }

    const results = result.results.map((m: any) => ({
      id: m.id,
      title: m.title,
      coverImage: m.coverImage,
      bannerImage: m.bannerImage,
      type: m.type,
      format: m.format,
      status: m.status,
      episodes: m.episodes,
      duration: m.duration,
      genres: m.genres,
      averageScore: m.averageScore,
      popularity: m.popularity,
      trending: m.trending,
      season: m.season,
      seasonYear: m.seasonYear,
      description: m.description,
      nextAiringEpisode: m.nextAiringEpisode,
    }));

    return NextResponse.json({
      results,
      pageInfo: result.pageInfo,
      total: result.total,
      hasNextPage: result.pageInfo?.hasNextPage || false,
      currentPage: result.pageInfo?.currentPage || page,
      _source: "sqlite-fallback",
    }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (e: any) {
    console.error("[anime/browse] Error:", e);
    return NextResponse.json({
      results: [],
      total: 0,
      hasNextPage: false,
      currentPage: page,
      _source: "failed",
      error: e?.message || "Failed",
    });
  }
}
