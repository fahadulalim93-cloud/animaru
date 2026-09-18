import { NextRequest, NextResponse } from "next/server";
import { searchAnime } from "@/lib/anilist-api";
import { miruroSearch } from "@/lib/miruro-api";
import { rewriteAnimeArray } from "@/lib/cdn/rewrite-urls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") || "";
  const page = parseInt(request.nextUrl.searchParams.get("page") || "1");

  if (!q) return NextResponse.json({ results: [], hasNextPage: false });

  // Layer 1: AniList (primary)
  try {
    const data = await searchAnime(q, page, 25);
    if (data && data.media && data.media.length > 0) {
      const results = data.media.map(m => ({
        id: m.id,
        title: m.title,
        coverImage: m.coverImage,
        bannerImage: m.bannerImage,
        type: m.type,
        format: m.format,
        status: m.status,
        episodes: m.episodes,
        genres: m.genres,
        averageScore: m.averageScore,
        popularity: m.popularity,
        season: m.season,
        seasonYear: m.seasonYear,
        description: m.description,
        nextAiringEpisode: m.nextAiringEpisode,
      }));

      return NextResponse.json({
        results: rewriteAnimeArray(results),
        hasNextPage: data.pageInfo?.hasNextPage || false,
        currentPage: data.pageInfo?.currentPage || page,
        _source: "anilist",
      });
    }
  } catch (err: any) {
    console.error("[anime/search] AniList error:", err?.message || err);
  }

  // Layer 2: Miruro (backup 1)
  try {
    const data = await miruroSearch(q, page);
    if (data && data.results && data.results.length > 0) {
      const results = data.results.map(m => ({
        id: m.id,
        title: m.title,
        coverImage: m.coverImage,
        bannerImage: m.bannerImage,
        type: m.type,
        format: m.format,
        status: m.status,
        episodes: m.episodes,
        genres: m.genres,
        averageScore: m.averageScore,
        popularity: m.popularity,
        season: m.season,
        seasonYear: m.seasonYear,
        description: m.description,
        nextAiringEpisode: undefined,
      }));

      return NextResponse.json({
        results: rewriteAnimeArray(results),
        hasNextPage: data.hasNextPage || false,
        currentPage: data.currentPage || page,
        _source: "miruro",
      });
    }
  } catch (err: any) {
    console.error("[anime/search] Miruro error:", err?.message || err);
  }

  // NO MAL FALLBACK — MAL IDs (mal_) break the detail page routing.
  // Instead, use the SQLite 20K anime DB for search when AniList is down.
  try {
    const { searchAnime, getAnimeByAnilistId } = await import("@/lib/anime-db-sqlite");
    const sqliteResults = searchAnime(q, 25);
    if (sqliteResults.length > 0) {
      // Build results — fetch full raw_json for each to get proper title/coverImage objects
      const results = sqliteResults.map(r => {
        // Default from search result fields
        let titleObj: any = { english: r.titleEnglish, romaji: r.titleRomaji, native: r.titleNative };
        let coverImage: any = r.poster;
        let bannerImage: string | null = null;
        let description: string | null = null;
        let genres: string[] = r.genres ? r.genres.split(",").map((g: string) => g.trim()) : [];
        let averageScore = r.averageScore;
        let season: string | null = null;

        // Get full data from raw_json (sync, no await needed)
        const full = getAnimeByAnilistId(r.anilistId);
        if (full) {
          const media = full.Media || full;
          if (media.title) titleObj = media.title;
          if (media.coverImage) coverImage = media.coverImage;
          if (media.bannerImage) bannerImage = media.bannerImage;
          if (media.description) description = media.description;
          if (media.genres) genres = media.genres;
          if (media.averageScore) averageScore = media.averageScore;
          if (media.season) season = media.season;
        }

        return {
          id: r.anilistId,
          title: titleObj,
          coverImage: typeof coverImage === 'string' ? { large: coverImage, medium: coverImage } : coverImage,
          bannerImage,
          type: "TV",
          format: r.format,
          status: r.status,
          episodes: r.episodes,
          genres,
          averageScore,
          season,
          seasonYear: r.seasonYear,
          description,
          nextAiringEpisode: undefined,
        };
      });
      console.log(`[anime/search] SQLite fallback: ${results.length} results for "${q}"`);
      return NextResponse.json({
        results: rewriteAnimeArray(results),
        hasNextPage: false,
        currentPage: page,
        _source: "sqlite",
      });
    }
  } catch (err: any) {
    console.error("[anime/search] SQLite error:", err?.message || err);
  }

  return NextResponse.json({ results: [], page, hasMore: false });
}
