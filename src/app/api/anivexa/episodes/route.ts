import { NextRequest, NextResponse } from "next/server";
import { anivexaCheckProviders } from "@/lib/anivexa-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/anivexa/episodes?id=ANILIST_ID
 * Fetch episodes from Anivexa providers
 */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const anilistId = parseInt(id.replace(/^miruro_/, "").replace(/^mal_/, ""));
  if (isNaN(anilistId)) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  try {
    // Check which providers are available
    const providers = await anivexaCheckProviders(anilistId);

    return NextResponse.json({
      anilistId,
      episodes: { sub: [], dub: [], defaultProvider: "", allProviders: [], providersMap: {} },
      mappings: null,
      providers: providers || [],
      defaultProvider: "",
      _meta: {
        hasSub: false,
        hasDub: false,
        providerCount: Array.isArray(providers) ? providers.length : 0,
      }
    });
  } catch (err: any) {
    console.error("[Anivexa Episodes] Error:", err?.message);
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}
