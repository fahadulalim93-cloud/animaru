import { NextRequest, NextResponse } from "next/server";
import { getComixHomeSections } from "@/lib/comix-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 25;

/**
 * GET /api/manga/comix-home
 *
 * Returns comprehensive home data with all sections:
 * latestUpdates, trending, topRated, mostFollowed, recentlyAdded, genres, filters
 */
export async function GET() {
  try {
    const sections = await getComixHomeSections();
    return NextResponse.json(sections);
  } catch (err: any) {
    console.error("[comix-home] Error:", err?.message || err);
    return NextResponse.json({
      latestUpdates: [],
      trending: [],
      topRated: [],
      mostFollowed: [],
      recentlyAdded: [],
      genres: [],
      types: [],
      filters: null,
    });
  }
}
