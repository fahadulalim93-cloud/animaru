import { NextRequest, NextResponse } from "next/server";
import { getAnimeDetails } from "@/lib/anilist-api";
import { miruroInfo } from "@/lib/miruro-api";
import { malAnimeById, malAnimeCharacters, malAnimeRelations, malAnimeRecommendations, malToMiruro, malCharacterToAniListFormat, malRelationToAniListFormat, malRecommendationToAniListFormat } from "@/lib/mal-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Layer 1: AniList (primary)
async function fetchAniList(anilistId: number) {
  try {
    const data = await getAnimeDetails(anilistId);
    if (!data) return null;

    const anilistInfo = {
      id: data.id,
      idMal: data.idMal,
      title: data.title,
      coverImage: data.coverImage,
      bannerImage: data.bannerImage,
      description: data.description,
      type: data.type,
      format: data.format,
      status: data.status,
      episodes: data.episodes,
      duration: data.duration,
      genres: data.genres,
      averageScore: data.averageScore,
      meanScore: data.meanScore,
      popularity: data.popularity,
      trending: data.trending,
      season: data.season,
      seasonYear: data.seasonYear,
      countryOfOrigin: data.countryOfOrigin,
      isAdult: data.isAdult,
      source: data.source,
      siteUrl: data.siteUrl,
      nextAiringEpisode: data.nextAiringEpisode,
      studios: data.studios?.nodes || [],
      characters: (data.characters?.edges || []).map((edge: any) => ({
        id: edge.node.id,
        name: edge.node.name,
        image: edge.node.image,
        role: edge.role,
        voiceActors: (edge.voiceActors || []).map((va: any) => ({
          id: va.id,
          name: va.name,
          image: va.image,
          language: va.language,
        })),
      })),
      staff: (data.staff?.edges || []).map((edge: any) => ({
        id: edge.node.id,
        name: edge.node.name,
        image: edge.node.image,
        role: edge.role,
      })),
      recommendations: (data.recommendations?.nodes || []).map((rec: any) => ({
        id: rec.id,
        rating: rec.rating,
        mediaRecommendation: rec.mediaRecommendation ? {
          id: rec.mediaRecommendation.id,
          title: rec.mediaRecommendation.title,
          coverImage: rec.mediaRecommendation.coverImage,
          type: rec.mediaRecommendation.type,
          episodes: rec.mediaRecommendation.episodes,
          averageScore: rec.mediaRecommendation.averageScore,
          status: rec.mediaRecommendation.status,
        } : null,
      })).filter((r: any) => r.mediaRecommendation),
      // Keep original direct relations as fallback
      relations: (data.relations?.edges || []).map((edge: any) => ({
        relationType: edge.relationType,
        id: edge.node.id,
        title: edge.node.title,
        coverImage: edge.node.coverImage,
        type: edge.node.type,
        format: edge.node.format,
        episodes: edge.node.episodes,
        status: edge.node.status,
      })),
      trailer: data.trailer,
      externalLinks: data.externalLinks,
    };

    // Split direct relations into seasons vs related immediately (no blocking)
    const seasons = anilistInfo.relations.filter((r: any) =>
      (r.relationType === "SEQUEL" || r.relationType === "PREQUEL") &&
      (!r.format || r.format === "TV" || r.format === "TV_SHORT" || r.format === "OVA" || r.format === "ONA")
    );
    const related = anilistInfo.relations.filter((r: any) =>
      !seasons.some((s: any) => s.id === r.id)
    );
    (anilistInfo as any).franchiseSeasons = seasons;
    (anilistInfo as any).franchiseRelated = related;

    // Return immediately — franchise traversal will be loaded separately
    return {
      anime: null,
      anilistInfo,
      totalEpisodes: data.episodes || data.nextAiringEpisode?.episode || null,
      nextAiringEpisode: data.nextAiringEpisode || null,
      _source: "anilist",
    };
  } catch (err: any) {
    console.warn("[anime/info] AniList primary failed, trying backups");
    return null;
  }
}

// Layer 2: Miruro (backup 1)
async function fetchMiruro(anilistId: number) {
  try {
    const data = await miruroInfo(anilistId);
    if (!data) return null;

    const anilistInfo = {
      id: anilistId,
      idMal: null,
      title: data.title,
      coverImage: data.coverImage,
      bannerImage: data.bannerImage,
      description: data.description,
      type: data.type,
      format: data.format,
      status: data.status,
      episodes: data.episodes,
      duration: data.duration,
      genres: data.genres,
      averageScore: data.averageScore,
      season: data.season,
      seasonYear: data.seasonYear,
      countryOfOrigin: data.countryOfOrigin,
      isAdult: data.isAdult,
      studios: [],
      characters: [],
      staff: [],
      recommendations: [],
      relations: [],
      trailer: null,
      externalLinks: [],
    };

    return {
      anime: null,
      anilistInfo,
      totalEpisodes: data.episodes || null,
      nextAiringEpisode: null,
      _source: "miruro",
    };
  } catch (err: any) {
    console.warn("[anime/info] Miruro backup failed, trying MAL");
    return null;
  }
}

// Layer 3: Official MAL API v2 (backup 2)
async function fetchMAL(malId: number) {
  try {
    const malData = await malAnimeById(malId);
    if (!malData) return null;

    const miruroResult = malToMiruro(malData);

    // Fetch extra data in parallel
    const [charsData, relsData, recsData] = await Promise.all([
      malAnimeCharacters(malId),
      malAnimeRelations(malId),
      malAnimeRecommendations(malId),
    ]);

    const anilistInfo = {
      id: malId,
      idMal: malId,
      title: miruroResult.title,
      coverImage: miruroResult.coverImage,
      bannerImage: miruroResult.bannerImage,
      description: miruroResult.description,
      type: miruroResult.type,
      format: miruroResult.format,
      status: miruroResult.status,
      episodes: miruroResult.episodes,
      duration: miruroResult.duration,
      genres: miruroResult.genres,
      averageScore: miruroResult.averageScore,
      season: miruroResult.season,
      seasonYear: miruroResult.seasonYear,
      countryOfOrigin: miruroResult.countryOfOrigin,
      isAdult: miruroResult.isAdult,
      studios: (malData.studios || []).map((s: any) => ({ id: s.id, name: s.name, isAnimationStudio: true })),
      characters: charsData.map(malCharacterToAniListFormat),
      staff: [],
      recommendations: recsData.map(malRecommendationToAniListFormat),
      relations: relsData.map(malRelationToAniListFormat),
      trailer: null,
      externalLinks: [],
    };

    return {
      anime: null,
      anilistInfo,
      totalEpisodes: miruroResult.episodes || null,
      nextAiringEpisode: null,
      _source: "mal",
    };
  } catch (err: any) {
    console.warn("[anime/info] MAL backup failed");
    return null;
  }
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const cleanId = id.replace(/^miruro_/, "").replace(/^mal_/, "");
  const numericId = /^\d+$/.test(cleanId) ? parseInt(cleanId) : null;

  if (!numericId) {
    return NextResponse.json({ error: "Invalid anime ID", anime: null, anilistInfo: null });
  }

  // Successful responses are CDN-cached (1h fresh, 24h stale-while-revalidate).
  // Critical on Vercel: shared egress IPs get 429-rate-limited by AniList fast,
  // which made detail pages randomly fail with no images. Failures are never
  // cached so the next request retries fresh.
  const CACHE_OK = { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" };

  // 3-layer cascade: AniList → Miruro → Official MAL API
  // Layer 1: Try AniList first
  const anilistResult = await fetchAniList(numericId);
  if (anilistResult) return NextResponse.json(anilistResult, { headers: CACHE_OK });

  // Layer 2: Try Miruro
  const miruroResult = await fetchMiruro(numericId);
  if (miruroResult) return NextResponse.json(miruroResult, { headers: CACHE_OK });

  // Layer 3: Try Official MAL API v2
  const malResult = await fetchMAL(numericId);
  if (malResult) return NextResponse.json(malResult, { headers: CACHE_OK });

  // All 3 failed — never cache failures
  return NextResponse.json({
    error: "Failed to load anime info from all sources",
    anime: null,
    anilistInfo: null,
    totalEpisodes: null,
    _source: "failed",
  }, { headers: { "Cache-Control": "no-store" } });
}
