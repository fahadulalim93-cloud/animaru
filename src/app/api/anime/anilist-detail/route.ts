import { NextRequest, NextResponse } from "next/server";
import { getAnimeDetails, getAnimeCharactersAndStaff } from "@/lib/anilist-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15; // 15s — enough for 4s timeout × 3 strategies × 1 retry

/**
 * GET /api/anime/anilist-detail?id=12345
 * Returns full AniList detail including characters, voice actors, staff,
 * studios, recommendations, relations, trailer, nextAiringEpisode, etc.
 *
 * Strategy:
 *   1. Try AniList (cached) for full details + characters/staff (parallel)
 *   2. If AniList returns null (rate-limited / timeout), the cachedQuery
 *      layer auto-falls back to the embedded anime DB (10K records,
 *      1.5MB JSON shipped in repo). This returns the core detail page data
 *      (title, episodes, format, year, cross-site IDs) but no characters/
 *      staff/recommendations.
 *   3. Detect embedded-DB fallback via details._source === "embedded-db"
 *      and skip the (futile) characters/staff retry — return partial data.
 */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const anilistId = parseInt(id);
  if (isNaN(anilistId)) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  try {
    // Step 1: Get core details (with embedded DB fallback baked in)
    const details = await getAnimeDetails(anilistId);

    if (!details) {
      return NextResponse.json({
        characters: [],
        staff: [],
        recommendations: [],
        relations: [],
        studios: [],
        trailer: null,
        details: null,
        _source: "failed",
      });
    }

    // Step 2: Detect embedded-DB fallback — skip characters/staff if so
    // (embedded DB has no character/staff data — would just timeout again)
    const isEmbeddedDb = (details as any)._source === "embedded-db";

    let charactersAndStaff: any = null;
    if (!isEmbeddedDb) {
      // Only query AniList for characters/staff if AniList is alive
      charactersAndStaff = await getAnimeCharactersAndStaff(anilistId);
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

    // Include cross-site ID mappings from embedded DB (used by streaming sources
    // like AnimeX, Anivexa, HindiAnime which need MAL/TVDB/AniDB IDs)
    const mappings = (details as any).mappings || undefined;

    return NextResponse.json({
      details,
      characters: charactersAndStaff?.characters || [],
      staff: charactersAndStaff?.staff || [],
      recommendations,
      relations,
      studios,
      trailer,
      mappings,
      _source: isEmbeddedDb ? "embedded-db" : "anilist",
    });
  } catch (err) {
    console.error("[anilist-detail] error:", err);
    return NextResponse.json({
      characters: [],
      staff: [],
      recommendations: [],
      relations: [],
      studios: [],
      trailer: null,
      details: null,
      _source: "failed",
    });
  }
}
