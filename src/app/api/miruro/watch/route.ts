import { NextRequest, NextResponse } from "next/server";
import { miruroWatch, miruroEpisodes } from "@/lib/miruro-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/miruro/watch?provider=kiwi&id=1535&type=sub&slug=1
 *
 * Auto-switches between providers if the requested one fails.
 * If providersMap is available (from episodes cache), it knows which
 * providers have the episode and tries them in priority order.
 */
export async function GET(req: NextRequest) {
  const provider = req.nextUrl.searchParams.get("provider") || "miku";
  const id = parseInt(req.nextUrl.searchParams.get("id") || "0");
  const translationType = (req.nextUrl.searchParams.get("type") || "sub") as "sub" | "dub";
  const slug = req.nextUrl.searchParams.get("slug") || "1";
  const episodeNum = parseInt(req.nextUrl.searchParams.get("epNum") || "0") || undefined;

  if (!id) {
    return NextResponse.json({ success: false, error: "Parameter 'id' (AniList ID) is required" }, { status: 400 });
  }

  try {
    // Try to fetch episodes data to get the providers map for auto-switching
    let providersMap: any = undefined;
    if (episodeNum) {
      const epData = await miruroEpisodes(id);
      if (epData.providersMap && Object.keys(epData.providersMap).length > 0) {
        providersMap = epData.providersMap;
      }
    }

    const data = await miruroWatch(provider, id, translationType, slug, providersMap, episodeNum);

    if (!data || data.sources.length === 0) {
      const tried = data?.triedProviders?.join(", ") || provider;
      return NextResponse.json({
        success: false,
        error: `No stream found. Tried providers: ${tried}`,
        triedProviders: data?.triedProviders || [provider],
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...data,
        // Include which provider actually worked and what was tried
        activeProvider: data.provider,
        triedProviders: data.triedProviders,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
