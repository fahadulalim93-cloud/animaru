import { NextRequest, NextResponse } from "next/server";
import { miruroEpisodes } from "@/lib/miruro-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/miruro/episodes?id=1535
 *
 * Returns episodes with provider information for auto-switching support
 */
export async function GET(req: NextRequest) {
  const id = parseInt(req.nextUrl.searchParams.get("id") || "0");
  if (!id) {
    return NextResponse.json({ success: false, error: "Parameter 'id' (AniList ID) is required" }, { status: 400 });
  }

  try {
    const data = await miruroEpisodes(id);
    return NextResponse.json({
      success: true,
      sub: data.sub,
      dub: data.dub,
      defaultProvider: data.defaultProvider,
      allProviders: data.allProviders,
      // Don't send full providersMap to client (too large), but send provider names
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
