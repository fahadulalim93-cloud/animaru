import { NextRequest, NextResponse } from "next/server";
import { searchAnime } from "@/lib/cdn/cdn-db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "20", 10);
  const offset = parseInt(req.nextUrl.searchParams.get("offset") || "0", 10);
  if (!q.trim()) return NextResponse.json({ total: 0, limit, offset, page: 1, results: [] });
  const { results, total } = searchAnime(q, limit, offset);
  return NextResponse.json({
    total, limit, offset, page: Math.floor(offset / limit) + 1, results,
  }, {
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, s-maxage=60, stale-while-revalidate=600" },
  });
}
