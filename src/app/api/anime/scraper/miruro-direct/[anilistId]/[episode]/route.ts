/**
 * GET /api/anime/scraper/miruro-direct/[anilistId]/[episode]
 *
 * Scrapes www.miruro.tv/api/secure/pipe DIRECTLY.
 *
 * Query params:
 *   type:     "sub" | "dub" (default: sub)
 *   provider: specific provider name (e.g., "kiwi", "bee", "bonk")
 *             if omitted, auto-picks the first working provider
 *
 * Returns:
 *   {
 *     url: "/api/anime/scraper/stream?...",
 *     quality: "1080p",
 *     isM3U8: true,
 *     provider: "kiwi",
 *     ...
 *   }
 */
import { NextRequest, NextResponse } from "next/server";
import { getPlayableSource, getSourceFromProvider } from "@/lib/miruro-direct";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ anilistId: string; episode: string }> }
) {
  const { anilistId, episode } = await params;
  const id = parseInt(anilistId, 10);
  const epNum = parseInt(episode, 10);
  if (isNaN(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid anilistId" }, { status: 400 });
  }
  if (isNaN(epNum) || epNum <= 0) {
    return NextResponse.json({ error: "Invalid episode" }, { status: 400 });
  }

  const url = new URL(req.url);
  const category = (url.searchParams.get("type") || "sub") as "sub" | "dub";
  const requestedProvider = url.searchParams.get("provider") || "";

  try {
    let result;
    if (requestedProvider) {
      // User selected a specific provider — fetch just that one
      result = await getSourceFromProvider(id, epNum, category, requestedProvider);
    } else {
      // Auto-pick: try providers in priority order
      result = await getPlayableSource(id, epNum, category);
    }

    if (!result) {
      return NextResponse.json(
        {
          error: "No playable source found",
          provider: requestedProvider || "auto",
          anilistId: id,
          episode: epNum,
          category,
        },
        { status: 404 }
      );
    }

    const streamReferer = result.streamReferer || "";
    const proxyUrl = `/api/anime/scraper/stream?provider=miruro&subProvider=${encodeURIComponent(result.provider)}&mode=manifest&url=${encodeURIComponent(result.url)}${streamReferer ? `&referer=${encodeURIComponent(streamReferer)}` : ""}`;

    return NextResponse.json({
      url: proxyUrl,
      directUrl: result.url,
      quality: result.quality,
      isM3U8: result.isM3U8,
      provider: result.provider,
      subtitles: result.subtitles,
      intro: result.intro,
      outro: result.outro,
      sourceType: result.isM3U8 ? "hls" : "mp4",
      streamReferer,
    }, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Miruro direct scrape failed", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
