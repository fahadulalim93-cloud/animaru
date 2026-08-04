import { NextRequest, NextResponse } from "next/server";
import { getVidlinkStreams } from "@/lib/vidlink-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/stream/vidlink-play/[quality]?tmdbId=X&type=movie&season=Y&episode=Z
 *
 * Fetches the stream from Vidlink and proxies it directly with the correct
 * Referer header. This avoids query param encoding issues that break when
 * the MP4 URL contains ? and & characters.
 *
 * The browser's <video> element uses this URL directly as the src.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ quality: string }> },
) {
  try {
    const { quality: qualityParam } = await params;
    const sp = request.nextUrl.searchParams;
    const tmdbId = parseInt(sp.get("tmdbId") || "0", 10);
    const type = (sp.get("type") || "movie") as "movie" | "tv";
    const season = sp.get("season") ? parseInt(sp.get("season")!, 10) : undefined;
    const episode = sp.get("episode") ? parseInt(sp.get("episode")!, 10) : undefined;

    if (!tmdbId) {
      return NextResponse.json({ error: "tmdbId required" }, { status: 400 });
    }

    // Fetch streams from Vidlink
    const streams = await getVidlinkStreams(tmdbId, type, season, episode);

    // Find the requested quality (or default to highest MP4)
    const mp4Sources = streams.sources.filter(s => s.format !== "dash" && !s.url.includes(".mpd"));
    if (mp4Sources.length === 0) {
      return NextResponse.json({ error: "No MP4 sources" }, { status: 404 });
    }

    const source = mp4Sources.find(s => s.quality === qualityParam) || mp4Sources[0];
    const videoUrl = source.url;

    // Fetch the video with correct Referer
    const range = request.headers.get("range");
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      "Accept": "*/*",
      "Referer": "https://vidlink.pro/",
      "Origin": "https://vidlink.pro",
    };
    if (range) headers["Range"] = range;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    const res = await fetch(videoUrl, { headers, redirect: "follow", signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok && res.status !== 206) {
      return NextResponse.json(
        { error: `Upstream ${res.status}` },
        { status: res.status, headers: { "Access-Control-Allow-Origin": "*" } },
      );
    }

    // Stream the video response directly to the browser
    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", res.headers.get("content-type") || "video/mp4");
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Allow-Headers", "Range, Content-Type");
    responseHeaders.set("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges");
    responseHeaders.set("Cache-Control", "no-store, no-cache, must-revalidate");

    const cl = res.headers.get("content-length");
    const cr = res.headers.get("content-range");
    const ar = res.headers.get("accept-ranges");
    if (cl) responseHeaders.set("Content-Length", cl);
    if (cr) responseHeaders.set("Content-Range", cr);
    if (ar) responseHeaders.set("Accept-Ranges", ar);

    return new NextResponse(res.body, {
      status: res.status,
      headers: responseHeaders,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Proxy failed";
    return NextResponse.json(
      { error: message },
      { status: 500, headers: { "Access-Control-Allow-Origin": "*" } },
    );
  }
}
