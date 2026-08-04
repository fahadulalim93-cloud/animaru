import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ANILIST_API = "https://graphql.anilist.co";

async function anilistBrowseQuery(variables: Record<string, unknown>) {
  const sortMap: Record<string, string> = {
    "most-popular": "POPULARITY_DESC",
    "high-rated": "SCORE_DESC",
    "trending": "TRENDING_DESC",
    "new": "START_DATE_DESC",
  };

  const sort = sortMap[variables.sort as string] || "POPULARITY_DESC";

  // Build the media filter arguments
  const filters: string[] = ["type: ANIME"];
  if (variables.genre) filters.push(`genre: "${variables.genre}"`);
  if (variables.year) filters.push(`seasonYear: ${variables.year}`);
  if (variables.format) filters.push(`format: ${variables.format}`);
  if (variables.status) filters.push(`status: ${variables.status}`);
  if (variables.season) filters.push(`season: ${variables.season}`);
  if (variables.search) filters.push(`search: "${variables.search}"`);

  const filterStr = filters.join(", ");

  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { total currentPage lastPage hasNextPage perPage }
        media(${filterStr}, sort: ${sort}, isAdult: false) {
          id
          title { romaji english native }
          coverImage { extraLarge large medium color }
          bannerImage
          type format status
          episodes duration
          genres
          averageScore popularity trending
          season seasonYear
          description(asHtml: false)
          nextAiringEpisode { episode airingAt }
          countryOfOrigin
        }
      }
    }
  `;

  const res = await fetch(ANILIST_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      query,
      variables: { page: variables.page || 1, perPage: variables.perPage || 30 },
    }),
    next: { revalidate: 300 },
  });

  if (!res.ok) throw new Error(`AniList request failed: ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(`AniList GraphQL error: ${json.errors[0]?.message}`);
  return json.data;
}

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

  try {
    const data = await anilistBrowseQuery({
      sort, genre, year, format, status, season, search, page, perPage,
    });

    if (data?.Page?.media?.length > 0) {
      const results = data.Page.media.map((m: any) => ({
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
        countryOfOrigin: m.countryOfOrigin,
      }));

      return NextResponse.json({
        results,
        pageInfo: data.Page.pageInfo,
        total: data.Page.pageInfo?.total || results.length,
        hasNextPage: data.Page.pageInfo?.hasNextPage || false,
        currentPage: data.Page.pageInfo?.currentPage || page,
        _source: "anilist",
      });
    }
  } catch (err: any) {
    console.error("[anime/browse] AniList error:", err?.message || err);
  }

  // Fallback: return empty results
  return NextResponse.json({
    results: [],
    total: 0,
    hasNextPage: false,
    currentPage: page,
    _source: "failed",
  });
}
