import { NextRequest, NextResponse } from "next/server";
import { anivexaCheckProviders } from "@/lib/anivexa-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * AniVexa Servers Availability Check
 *
 * GET /api/anivexa/servers?anilistId=16498
 *
 * Checks which providers (anineko, allmanga) are available.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const anilistId = parseInt(searchParams.get("anilistId") || "0");

    if (!anilistId) {
      return NextResponse.json(
        { error: "anilistId parameter required" },
        { status: 400 }
      );
    }

    const providers = await anivexaCheckProviders(anilistId);

    return NextResponse.json({
      anilistId,
      providers,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to check providers";
    console.error("[anivexa/servers] Error:", message);
    return NextResponse.json(
      { error: message, providers: [] },
      { status: 500 }
    );
  }
}
