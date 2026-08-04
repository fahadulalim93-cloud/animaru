import { NextRequest, NextResponse } from "next/server";
import { getComixTrending } from "@/lib/comix-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 25;

/**
 * GET /api/manga/comix-trending?sort=views_7d&page=1
 *
 * Returns trending/popular manga from comix.to.
 * Sort options: views_7d, views_30d, views_90d, views_total, follows_total, score
 */
export async function GET(request: NextRequest) {
  const sort = (request.nextUrl.searchParams.get("sort") || "views_7d") as
    | "views_7d" | "views_30d" | "views_90d" | "views_total" | "follows_total" | "score";
  const page = parseInt(request.nextUrl.searchParams.get("page") || "1");

  try {
    const items = await getComixTrending(sort, page);
    return NextResponse.json({ items });
  } catch (err: any) {
    console.error("[comix-trending] Error:", err?.message || err);
    return NextResponse.json({ items: [] });
  }
}
