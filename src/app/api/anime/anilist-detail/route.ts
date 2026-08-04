import { NextRequest, NextResponse } from "next/server";
import { getAnimeDetails, getAnimeCharactersAndStaff } from "@/lib/anilist-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/anime/anilist-detail?id=12345
 * Returns full AniList detail including characters, voice actors, staff,
 * studios, recommendations, relations, trailer, nextAiringEpisode, etc.
 *
 * ONLY uses AniList API — no external fallback.
 */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const anilistId = parseInt(id);
  if (isNaN(anilistId)) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  try {
    // Fetch both in parallel
    const [details, charactersAndStaff] = await Promise.all([
      getAnimeDetails(anilistId),
      getAnimeCharactersAndStaff(anilistId),
    ]);

    if (!details) {
      return NextResponse.json({ characters: [], staff: [], _source: "failed" });
    }

    // Extract recommendations from details
    const recommendations = (details.recommendations?.nodes || [])
      .filter((r: any) => r.mediaRecommendation)
      .map((r: any) => ({
        id: r.mediaRecommendation.id,
        title: r.mediaRecommendation.title,
        coverImage: r.mediaRecommendation.coverImage,
        type: r.mediaRecommendation.type,
        episodes: r.mediaRecommendation.episodes,
        averageScore: r.mediaRecommendation.averageScore,
        status: r.mediaRecommendation.status,
        rating: r.rating,
      }));

    // Extract relations
    const relations = (details.relations?.edges || []).map((edge: any) => ({
      relationType: edge.relationType,
      id: edge.node.id,
      title: edge.node.title,
      coverImage: edge.node.coverImage,
      type: edge.node.type,
      format: edge.node.format,
      episodes: edge.node.episodes,
      status: edge.node.status,
    }));

    // Extract studios
    const studios = (details.studios?.nodes || []).map((s: any) => ({
      id: s.id,
      name: s.name,
      isAnimationStudio: s.isAnimationStudio,
    }));

    // Extract trailer
    const trailer = details.trailer || null;

    return NextResponse.json({
      details,
      characters: charactersAndStaff?.characters || [],
      staff: charactersAndStaff?.staff || [],
      recommendations,
      relations,
      studios,
      trailer,
      _source: "anilist",
    });
  } catch (err) {
    console.error("[anilist-detail] AniList error:", err);
    return NextResponse.json({ characters: [], staff: [], recommendations: [], relations: [], studios: [], trailer: null, details: null, _source: "failed" });
  }
}
