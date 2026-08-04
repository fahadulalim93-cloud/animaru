import { NextRequest, NextResponse } from "next/server";
import { searchMoviebox, getMovieboxStreams } from "@/lib/moviebox-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/stream/moviebox
//
// Two modes:
//   1. Search: ?query=X
//      → { source: "moviebox", results: [{ title, slug, subjectId, poster }] }
//
//   2. Streams: ?subjectId=X&detailPath=Y&season=Z&episode=W
//      → { source: "moviebox", sources: [...], hls: [...] }
//
// All video URLs are wrapped through /api/stream?url=... for CORS-free
// playback in the browser (and to attach the correct Referer header).
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query");
    const subjectId = searchParams.get("subjectId");
    const detailPath = searchParams.get("detailPath");
    const season = searchParams.get("season");
    const episode = searchParams.get("episode");

    // ── Search mode ──
    if (query) {
      const results = await searchMoviebox(query);
      return NextResponse.json(
        { source: "moviebox", results },
        { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } }
      );
    }

    // ── Stream mode ──
    if (!subjectId || !detailPath) {
      return NextResponse.json(
        { error: "Either ?query=X OR ?subjectId=X&detailPath=Y (with optional season/episode) is required" },
        { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    const se = season ? parseInt(season, 10) : undefined;
    const ep = episode ? parseInt(episode, 10) : undefined;

    const streams = await getMovieboxStreams(subjectId, detailPath, se, ep);

    // Wrap each video/hls URL through /api/stream so the browser can play
    // it without CORS issues. The Referer must be the moviebox player page,
    // but our proxy falls back to the URL's own origin which is what the
    // stream domain expects anyway.
    const wrap = (url: string) => {
      // The stream domain (e.g. netfilm.world) requires same-origin Referer.
      // We let the proxy auto-detect it; pass nothing custom so the proxy
      // uses the URL's origin.
      return `/api/stream?url=${encodeURIComponent(url)}`;
    };

    return NextResponse.json(
      {
        source: "moviebox",
        sources: streams.sources.map((s) => ({
          ...s,
          proxyUrl: wrap(s.url),
        })),
        hls: streams.hls.map((h) => ({
          ...h,
          proxyUrl: wrap(h.url),
        })),
      },
      { headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Moviebox fetch failed";
    return NextResponse.json(
      { error: message },
      { status: 502, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }
}
