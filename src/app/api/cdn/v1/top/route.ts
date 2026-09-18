import { NextRequest, NextResponse } from "next/server";
import { getAnimeList } from "@/lib/cdn/cdn-db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "20", 10);
  const offset = parseInt(req.nextUrl.searchParams.get("offset") || "0", 10);
  const results = getAnimeList("top", limit, offset);
  return NextResponse.json({
    total: results.length, limit, offset, page: Math.floor(offset / limit) + 1, results,
  }, {
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
  });
}
