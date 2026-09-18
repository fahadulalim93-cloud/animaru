/**
 * /api/anilist — Server-side AniList GraphQL proxy with SQLite fallback.
 *
 * When AniList is down, detects Page queries and falls back to our
 * 22K anime SQLite DB, returning data in AniList GraphQL response format.
 */

import { NextRequest, NextResponse } from "next/server";
import { cachedQuery, getCacheStats } from "@/lib/anilist-cache";
import { rewriteAnimeArray } from "@/lib/cdn/rewrite-urls";
import { browseFromSqlite, getAnimeByAnilistId, getTrendingFromSqlite, getPopularFromSqlite, getTopRatedFromSqlite, searchAnime, getUpcomingFromSqlite, getAiringScheduleFromSqlite } from "@/lib/anime-db-sqlite";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, variables, ttl } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "Missing or invalid 'query' field" }, { status: 400 });
    }

    const data = await cachedQuery(query, variables, {
      ttl: typeof ttl === "number" ? ttl : undefined,
      timeoutMs: 8000,
      revalidate: 3600,
    });

    if (data !== null && data !== undefined) {
      // Check if this is an empty Page response (AniList returned 0 results)
      // If so, fall through to SQLite fallback instead of returning empty
      const pageData = data?.Page;
      if (pageData && Array.isArray(pageData.media) && pageData.media.length === 0) {
        // Empty response — don't return it, try SQLite fallback
      } else {
        return NextResponse.json({ data }, {
          status: 200,
          headers: { "Cache-Control": "public, s-maxage=3600, max-age=300, stale-while-revalidate=7200" },
        });
      }
    }

    // ── AniList is down — try SQLite fallback ──
    console.log('[anilist-proxy] cachedQuery returned:', data === null ? 'null' : (data?.Page ? 'Page with ' + (data.Page.media?.length || 0) + ' media' : 'other'));
    const sqliteResult = await sqliteFallbackForQuery(query, variables || {});
    if (sqliteResult) {
      return NextResponse.json({ data: sqliteResult }, {
        status: 200,
        headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
      });
    }

    return NextResponse.json({ error: "AniList query failed — all strategies exhausted" }, { status: 502 });
  } catch (err) {
    return NextResponse.json({ error: "Invalid request body", detail: String(err) }, { status: 400 });
  }
}

async function sqliteFallbackForQuery(query: string, variables: any): Promise<any | null> {
  try {
    const q = query.toLowerCase();

    // ── Airing Schedules query (used by schedule page) ──
    if (q.includes("airingschedules")) {
      // Use AniCore GraphQL to fetch airing anime (has fresh nextAiringEpisode data)
      try {
        const anicoreRes = await fetch("https://anicore.dpdns.org/graphql", {
          method: "POST",
          headers: { "Content-Type": "application/json", "User-Agent": "LuffyTV-CDN-Scraper/3.0" },
          body: JSON.stringify({
            query: `query { airing(limit: 50) { id title titleEnglish status nextAiringEpisode episodeCount episodesKnown externalIds { anilist } images { poster banner } format season seasonYear scores { average } genres { name } } }`
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (anicoreRes.ok) {
          const anicoreData = await anicoreRes.json();
          const airing = anicoreData?.data?.airing || [];
          if (airing.length > 0) {
            // Convert to AniList airingSchedules format
            const schedules = airing
              .filter((a: any) => a.nextAiringEpisode && a.externalIds?.anilist)
              .map((a: any) => ({
                id: parseInt(`${a.externalIds.anilist}${String(a.nextAiringEpisode.episode).padStart(3, "0")}`),
                airingAt: a.nextAiringEpisode.airingAt,
                episode: a.nextAiringEpisode.episode,
                media: {
                  id: a.externalIds.anilist,
                  title: { romaji: a.title, english: a.titleEnglish || a.title, native: undefined },
                  coverImage: a.images?.poster ? { extraLarge: a.images.poster, large: a.images.poster, medium: a.images.poster } : undefined,
                  bannerImage: a.images?.banner || undefined,
                  format: a.format,
                  episodes: a.episodeCount || a.episodesKnown,
                  averageScore: a.scores?.average || undefined,
                  genres: (a.genres || []).map((g: any) => g.name || g),
                  status: a.status,
                },
              }));

            return {
              Page: {
                airingSchedules: schedules,
              },
            };
          }
        }
      } catch (e) {
        console.error("[anilist-proxy] AniCore airing fetch failed:", e);
      }

      // Fallback: SQLite DB airing schedule
      const airing = getAiringScheduleFromSqlite(100);
      const schedules = airing.map((anime: any) => ({
        id: parseInt(`${anime.id}00`),
        airingAt: anime.nextAiringEpisode?.airingAt || 0,
        episode: anime.nextAiringEpisode?.episode || 0,
        media: {
          id: anime.id,
          title: anime.title,
          coverImage: anime.coverImage,
          bannerImage: anime.bannerImage,
          format: anime.format,
          episodes: anime.episodes,
          averageScore: anime.averageScore,
          genres: anime.genres,
          description: anime.description,
          status: anime.status,
        },
      })).filter((s: any) => s.airingAt > 0);

      return {
        Page: {
          airingSchedules: schedules,
        },
      };
    }

    // ── Single Media(id) query ──
    if (q.includes("media(id:") || (q.includes("media(") && variables?.id)) {
      const id = variables?.id;
      if (id && typeof id === "number") {
        const anime = getAnimeByAnilistId(id);
        if (anime) return { Media: anime.Media || anime };
      }
      return null;
    }

    // ── Page(media) query — the browse page ──
    if (q.includes("page(") && q.includes("media(")) {
      const page = variables?.page || 1;
      const perPage = variables?.perPage || 30;

      // Detect sort from variables (array like ["POPULARITY_DESC"])
      let sort = "popularity";
      const sortVar = variables?.sort;
      if (Array.isArray(sortVar) && sortVar.length > 0) {
        const s = String(sortVar[0]).toUpperCase();
        if (s.includes("TRENDING")) sort = "trending";
        else if (s.includes("SCORE")) sort = "score";
        else if (s.includes("POPULARITY")) sort = "popularity";
        else if (s.includes("START_DATE")) sort = "new";
        else if (s.includes("FAVOURITES")) sort = "popularity";
      }
      // Also check query string for sort (inline)
      if (q.includes("trending_desc")) sort = "trending";
      else if (q.includes("score_desc")) sort = "score";
      else if (q.includes("popularity_desc")) sort = "popularity";
      else if (q.includes("start_date_desc")) sort = "new";

      // Check for NOT_YET_RELEASED status (upcoming anime)
      if (variables?.status === "NOT_YET_RELEASED" || q.includes("not_yet_released")) {
        const results = getUpcomingFromSqlite(perPage);
        return formatPageResponse(results, page, perPage, results.length);
      }

      // Detect search term
      let search = variables?.search as string | undefined;
      if (search) {
        const { results, total } = searchAnime(search, perPage, (page - 1) * perPage);
        return formatPageResponse(results, page, perPage, total);
      }

      // Detect genre filter — browse-new.tsx uses genre_in (not genres)
      let genre: string | undefined;
      if (variables?.genre_in && Array.isArray(variables.genre_in) && variables.genre_in.length > 0) {
        genre = variables.genre_in[0]; // use first genre
      } else if (variables?.genres && Array.isArray(variables.genres) && variables.genres.length > 0) {
        genre = variables.genres[0];
      }
      // Don't extract genre from query string — it matches variable declarations

      // Detect year
      let year: number | undefined;
      if (variables?.seasonYear) year = Number(variables.seasonYear);
      else {
        const yearMatch = query.match(/seasonyear:\s*(\d+)/i);
        if (yearMatch) year = parseInt(yearMatch[1]);
      }

      // Detect format — browse-new.tsx uses format_in (not formats)
      let format: string | undefined;
      if (variables?.format_in && Array.isArray(variables.format_in) && variables.format_in.length > 0) {
        format = variables.format_in[0];
      } else if (variables?.format) {
        format = variables.format;
      } else if (variables?.formats && Array.isArray(variables.formats) && variables.formats.length > 0) {
        format = variables.formats[0];
      }
      // Don't extract format from query string — it matches "$format: MediaFormat"

      // Detect status — ONLY from variables, not query string
      // (query string has "$status: MediaStatus" which would match "MediaStatus" as the value)
      let status: string | undefined;
      if (variables?.status && variables.status !== "NOT_YET_RELEASED") status = variables.status;

      // Use browseFromSqlite with all detected filters
      console.log('[anilist-proxy] Calling browseFromSqlite with:', { genre, year, format, status, sort, page, perPage });
      const result = browseFromSqlite({ genre, year, format, status, sort, page, perPage });
      const rewritten = rewriteAnimeArray(result.results);
      return formatPageResponse(rewritten, page, perPage, result.total);
    }

    return null;
  } catch (e) {
    console.error("[anilist-proxy] SQLite fallback failed:", e);
    return null;
  }
}

function formatPageResponse(media: any[], page: number, perPage: number, total: number): any {
  return {
    Page: {
      pageInfo: {
        total,
        currentPage: page,
        lastPage: Math.ceil(total / perPage),
        hasNextPage: page * perPage < total,
        perPage,
      },
      media: media.map((m) => {
        const media = m.Media || m;
        return {
          id: media.id,
          idMal: media.idMal,
          title: media.title,
          coverImage: media.coverImage,
          bannerImage: media.bannerImage,
          type: media.type || "ANIME",
          format: media.format,
          status: media.status,
          episodes: media.episodes,
          duration: media.duration,
          genres: media.genres,
          averageScore: media.averageScore,
          popularity: media.popularity,
          trending: media.trending,
          season: media.season,
          seasonYear: media.seasonYear,
          description: media.description,
          nextAiringEpisode: media.nextAiringEpisode,
          countryOfOrigin: media.countryOfOrigin,
          startDate: media.startDate,
          studios: media.studios,
        };
      }),
    },
  };
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  if (url.searchParams.get("stats") === "1") {
    return NextResponse.json({ source: "luffytv-anilist-cache", ...getCacheStats() });
  }
  return NextResponse.json({ ok: true, endpoint: "/api/anilist", method: "POST" });
}
