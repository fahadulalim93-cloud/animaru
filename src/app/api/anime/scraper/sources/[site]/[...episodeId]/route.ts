/**
 * GET /api/anime/scraper/sources/[site]/[...episodeId]
 *
 * Returns tagged stream sources for an episode. The episodeId is the opaque
 * string returned by /episodes. Each source has variant/audio/subtitle/quality
 * tags so the frontend can filter by sub/dub/hardsub/harddub.
 *
 * Example: /api/anime/scraper/sources/animex/animex:one-piece-p8k27:1
 */
import { NextRequest, NextResponse } from "next/server";
import { fetchSources, SITES } from "@/lib/unified-scraper";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ site: string; episodeId: string[] }> }
) {
  const { site, episodeId } = await params;
  const epId = episodeId.join("/"); // catch-all rejoined
  // Some IDs have colons which we encoded as /, so also try joining with ":"
  // The URL pattern is /sources/{site}/{...episodeId} so episodeId is an array
  // of path segments. We try both / and : as separators.
  const epIdWithColons = episodeId.join(":");

  if (!SITES.find((s) => s.site === site)) {
    return NextResponse.json(
      { error: `Unknown site: ${site}`, available: SITES.map((s) => s.site) },
      { status: 404 }
    );
  }

  try {
    // Try with colons first (our standard format), then with slashes
    let result = await fetchSources(site, epIdWithColons);
    if (result.sources.length === 0 && result.subtitles.length === 0) {
      result = await fetchSources(site, epId);
    }
    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to fetch sources", message: err?.message || String(err) },
      { status: 500 }
    );
  }
}
