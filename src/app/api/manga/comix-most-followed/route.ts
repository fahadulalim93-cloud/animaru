import { NextRequest, NextResponse } from "next/server";
import { getComixMostFollowed } from "@/lib/comix-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 25;

/**
 * GET /api/manga/comix-most-followed?page=1
 */
export async function GET(request: NextRequest) {
  const page = parseInt(request.nextUrl.searchParams.get("page") || "1");

  try {
    const items = await getComixMostFollowed(page);
    return NextResponse.json({ items });
  } catch (err: any) {
    console.error("[comix-most-followed] Error:", err?.message || err);
    return NextResponse.json({ items: [] });
  }
}
