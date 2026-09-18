import { NextRequest, NextResponse } from "next/server";
import { getCurrentSeason } from "@/lib/cdn/cdn-db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "20", 10);
  const results = getCurrentSeason(limit);
  const now = new Date();
  const month = now.getMonth();
  let season = "WINTER";
  if (month >= 2 && month <= 4) season = "SPRING";
  else if (month >= 5 && month <= 7) season = "SUMMER";
  else if (month >= 8 && month <= 10) season = "FALL";
  return NextResponse.json({
    season, year: now.getFullYear(), total: results.length, limit, offset: 0, page: 1, results,
  }, {
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" },
  });
}
