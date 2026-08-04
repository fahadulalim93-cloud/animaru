import { NextRequest, NextResponse } from "next/server";
import { getVidlinkStreams } from "@/lib/vidlink-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/stream/vidlink?tmdbId=X&type=movie|tv&season=Y&episode=Z
//
// Returns Vidlink direct streams for the given TMDB ID.
// The video URLs returned here should be routed through /api/stream?url=...
// for CORS-free playback in the browser (and to set the correct Referer).
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tmdbIdRaw = searchParams.get("tmdbId");
    const type = (searchParams.get("type") || "movie") as "movie" | "tv";
    const season = searchParams.get("season");
    const episode = searchParams.get("episode");

    if (!tmdbIdRaw) {
      return NextResponse.json(
        { error: "tmdbId parameter required" },
        { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    const tmdbId = parseInt(tmdbIdRaw, 10);
    if (Number.isNaN(tmdbId)) {
      return NextResponse.json(
        { error: "tmdbId must be a number" },
        { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    if (type !== "movie" && type !== "tv") {
      return NextResponse.json(
        { error: "type must be 'movie' or 'tv'" },
        { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    const se = season ? parseInt(season, 10) : undefined;
    const ep = episode ? parseInt(episode, 10) : undefined;

    const streams = await getVidlinkStreams(tmdbId, type, se, ep);

    // Filter out DASH sources (player only supports MP4 + HLS)
    const playableSources = streams.sources.filter(s => s.format !== "dash" && !s.url.includes(".mpd"));

    // Build proxy URLs using the dedicated /api/stream/vidlink-play/[quality] route.
    // This route fetches the video server-side with Referer: https://vidlink.pro/
    // and streams it to the browser. Avoids query param encoding issues.
    const buildProxyUrl = (quality: string) => {
      const params = new URLSearchParams({
        tmdbId: String(tmdbId),
        type,
      });
      if (type === "tv") {
        params.set("season", String(season || 1));
        params.set("episode", String(episode || 1));
      }
      return `/api/stream/vidlink-play/${encodeURIComponent(quality)}?${params.toString()}`;
    };

    return NextResponse.json(
      {
        source: "vidlink",
        sources: playableSources.map((s) => ({
          ...s,
          proxyUrl: buildProxyUrl(s.quality),
        })),
        // Subtitles still use /api/stream (simpler URLs, no ? or & issues)
        subtitles: streams.subtitles.map((sub) => ({
          ...sub,
          proxyUrl: `/api/stream?url=${encodeURIComponent(sub.url)}&referer=${encodeURIComponent("https://vidlink.pro/")}`,
        })),
      },
      { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Vidlink fetch failed";
    return NextResponse.json(
      { error: message },
      { status: 502, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }
}
