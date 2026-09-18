import { NextRequest, NextResponse } from "next/server";
import { getAnimeDetails, resolveMalIdToAnilistId } from "@/lib/anilist-api";
import { miruroInfo } from "@/lib/miruro-api";
import { malAnimeById, malAnimeCharacters, malAnimeRelations, malAnimeRecommendations, malToMiruro, malCharacterToAniListFormat, malRelationToAniListFormat, malRecommendationToAniListFormat } from "@/lib/mal-api";
import { anizipInfo } from "@/lib/anizip-api";
import { rewriteImageUrls, rewriteAnimeImages } from "@/lib/cdn/rewrite-urls";

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

// Layer 3: ani.zip — fast public API fallback (<500ms, never rate-limited)
// Provides episode titles, air dates, and basic metadata when AniList is down.
async function fetchAniZip(anilistId: number) {
  try {
    const data = await anizipInfo(anilistId);
    if (!data) return null;

    const anilistInfo = anizipToAniListFormat(anilistId, data);

    // If we have episode data, include it as an array for the client
    const episodeList = data.episodes
      ? Object.entries(data.episodes)
          .map(([num, ep]) => ({
            number: parseInt(num),
            title: ep.title?.en || ep.title?.xJat || null,
            thumbnail: ep.image || null,
            airDate: ep.airDate || null,
          }))
          .sort((a, b) => a.number - b.number)
      : [];

    return {
      anime: null,
      anilistInfo,
      totalEpisodes: episodeList.length || null,
      nextAiringEpisode: null,
      _anizipEpisodes: episodeList,
      _source: "anizip",
    };
  } catch (err: any) {
    console.warn("[anime/info] ani.zip fallback failed:", err?.message || err);
    return null;
  }
}

// Layer 4: Official MAL API v2 (backup 3 — slow, last resort)
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

  const isMalId = id.startsWith("mal_");
  const isMiruroId = id.startsWith("miruro_");
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

  // When the ID is explicitly prefixed with "mal_", resolve it to an AniList ID first.
  // AniList has a `Media(idMal: $malId)` query that maps MAL → AniList.
  // This is critical because episodes/servers/recommendations all need AniList IDs.
  // Provider timeout must allow AniList retries to complete.
  // AniList: 5s per attempt × 3 attempts + 1s×2 retry delays = up to 17s worst case.
  // 12s gives 2 full retries when the first attempt gets 429 or times out.
  const PROVIDER_TIMEOUT_MS = 12000;
  const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T | null> =>
    Promise.race([
      promise,
      new Promise<null>((r) => setTimeout(() => r(null), ms)),
    ]);

  if (isMalId) {
    // Step 1: Try reverse lookup MAL → AniList (with timeout)
    const anilistId = await withTimeout(resolveMalIdToAnilistId(numericId), PROVIDER_TIMEOUT_MS);
    if (anilistId) {
      // Found the AniList entry — use it as the primary source
      const anilistResult = await withTimeout(fetchAniList(anilistId), PROVIDER_TIMEOUT_MS);
      if (anilistResult) {
        // Stamp the resolved AniList ID so the client uses it for episodes/servers
        if (anilistResult.anilistInfo) {
          (anilistResult.anilistInfo as any)._resolvedAnilistId = anilistId;
        }
        return NextResponse.json(rewriteImageUrls(anilistResult), { headers: CACHE_OK });
      }
      // AniList details failed but we have the ID — try Miruro with the AniList ID
      const miruroResult = await withTimeout(fetchMiruro(anilistId), PROVIDER_TIMEOUT_MS);
      if (miruroResult) {
        if (miruroResult.anilistInfo) {
          (miruroResult.anilistInfo as any)._resolvedAnilistId = anilistId;
        }
        return NextResponse.json(rewriteImageUrls(miruroResult), { headers: CACHE_OK });
      }
    }

    // Step 2: Reverse lookup failed — fall back to MAL directly
    const malResult = await withTimeout(fetchMAL(numericId), PROVIDER_TIMEOUT_MS);
    if (malResult) {
      // Stamp the MAL ID so client knows to use mal_ prefix for episodes
      if (malResult.anilistInfo) {
        (malResult.anilistInfo as any)._resolvedAnilistId = anilistId || null;
        (malResult.anilistInfo as any)._malId = numericId;
      }
      return NextResponse.json(rewriteImageUrls(malResult), { headers: CACHE_OK });
    }

    // Step 3: Last resort — try AniList/Miruro with the raw number (unlikely to work)
    const anilistFallback = await withTimeout(fetchAniList(numericId), PROVIDER_TIMEOUT_MS);
    if (anilistFallback) return NextResponse.json(rewriteImageUrls(anilistFallback), { headers: CACHE_OK });
    const miruroFallback = await withTimeout(fetchMiruro(numericId), PROVIDER_TIMEOUT_MS);
    if (miruroFallback) return NextResponse.json(rewriteImageUrls(miruroFallback), { headers: CACHE_OK });
  } else {
    // FAST RETURN: Try AniList first (usually <2s), fall back to Miruro/MAL.
    // Previously Promise.allSettled blocked on the SLOWEST provider (MAL could
    // hang 15s), making the whole page show "Unknown". Now we return as soon
    // as AniList resolves.
    //
    // Note: Miruro's miruroInfo() calls the SAME AniList GraphQL API, so
    // running it in parallel with fetchAniList causes double API load and
    // rate limiting. We skip Miruro if AniList succeeds.

    // Try AniList FIRST — it has the richest data and is usually fastest (~1-2s)
    const anilistData = await withTimeout(fetchAniList(numericId), PROVIDER_TIMEOUT_MS);
    if (anilistData) return NextResponse.json(rewriteImageUrls(anilistData), { headers: CACHE_OK });

    // AniList failed/timed out — try Miruro (same AniList GraphQL, but different
    // query fields — useful when AniList's detailed query fails but basic one works)
    const miruroData = await withTimeout(fetchMiruro(numericId), PROVIDER_TIMEOUT_MS);
    if (miruroData) return NextResponse.json(rewriteImageUrls(miruroData), { headers: CACHE_OK });

    // AniList + Miruro both failed — try ani.zip as FAST fallback (<500ms).
    // api.ani.zip provides episode titles, air dates, and cross-service mappings.
    // Less detailed than AniList but always available and never rate-limited.
    const anizipData = await withTimeout(fetchAniZip(numericId), PROVIDER_TIMEOUT_MS);
    if (anizipData) return NextResponse.json(rewriteImageUrls(anizipData), { headers: CACHE_OK });

    // All fast sources failed — try MAL as last resort (slow, often >5s)
    const malData = await withTimeout(fetchMAL(numericId), PROVIDER_TIMEOUT_MS);
    if (malData) return NextResponse.json(rewriteImageUrls(malData), { headers: CACHE_OK });
  }

  // All sources failed — try SQLite 20K anime DB as last-resort fallback.
  // This is critical when AniList API is down (like right now).
  try {
    const { getAnimeByAnilistId } = await import("@/lib/anime-db-sqlite");
    const sqliteData = getAnimeByAnilistId(numericId);
    if (sqliteData) {
      const media = sqliteData.Media || sqliteData;
      console.log(`[anime/info] SQLite fallback for AniList ${numericId}: ${media.title?.english || media.title?.romaji}`);
      return NextResponse.json(rewriteImageUrls({
        anime: null,
        anilistInfo: media,
        totalEpisodes: media.episodes || null,
        _source: "sqlite-fallback",
      }), { headers: CACHE_OK });
    }
  } catch (e) {
    console.warn(`[anime/info] SQLite fallback error:`, e);
  }

  // All sources failed — never cache failures
  return NextResponse.json({
    error: "Failed to load anime info from all sources (AniList, Miruro, ani.zip, MAL, SQLite)",
    anime: null,
    anilistInfo: null,
    totalEpisodes: null,
    _source: "failed",
  }, { headers: { "Cache-Control": "no-store" } });
}
