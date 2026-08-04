import { NextRequest, NextResponse } from "next/server";
import { animexGetAnime, animexServers } from "@/lib/animex-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * AnimeX Servers Availability Check
 *
 * GET /api/animex/servers?anilistId=172463&episode=1
 *
 * Uses GraphQL to resolve AniList ID → slug, then checks
 * which sub/dub providers are available for the episode.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const anilistId = parseInt(searchParams.get("anilistId") || "0");
    const episode = parseInt(searchParams.get("episode") || "1");

    if (!anilistId) {
      return NextResponse.json({ error: "anilistId required" }, { status: 400 });
    }

    const animeInfo = await animexGetAnime(anilistId);
    if (!animeInfo) {
      return NextResponse.json({
        anime: null,
        episode,
        subProviders: [],
        dubProviders: [],
        providers: [],
      });
    }

    const servers = await animexServers(animeInfo.slug, episode);

    // Build combined list of available provider IDs
    const subIds = servers.subProviders.map((p) => p.id);
    const dubIds = servers.dubProviders.map((p) => p.id);
    const allIds = [...new Set([...subIds, ...dubIds])];

    return NextResponse.json({
      anime: animeInfo,
      episode,
      subProviders: servers.subProviders,
      dubProviders: servers.dubProviders,
      providers: allIds,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: message, providers: [] }, { status: 500 });
  }
}
