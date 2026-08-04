import { NextRequest, NextResponse } from "next/server";
import { searchAnime } from "@/lib/anilist-api";
import { malSearch } from "@/lib/mal-api";
import { miruroSearch } from "@/lib/miruro-api";

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
        results,
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
        results,
        hasNextPage: data.hasNextPage || false,
        currentPage: data.currentPage || page,
        _source: "miruro",
      });
    }
  } catch (err: any) {
    console.error("[anime/search] Miruro error:", err?.message || err);
  }

  // Layer 3: Official MAL API v2 (backup 2)
  try {
    const data = await malSearch(q, page, 25);
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
        results,
        hasNextPage: data.hasNextPage || false,
        currentPage: data.currentPage || page,
        _source: "mal",
      });
    }
  } catch (err: any) {
    console.error("[anime/search] MAL error:", err?.message || err);
  }

  // All 3 failed
  return NextResponse.json({ results: [], hasNextPage: false, _source: "failed" });
}
