import { NextRequest, NextResponse } from "next/server";
import { browseAnime } from "@/lib/cdn/cdn-db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const page = parseInt(searchParams.get("page") || "1", 10);
  const perPage = parseInt(searchParams.get("perPage") || "30", 10);
  const sort = searchParams.get("sort") || "popular";
  const season = searchParams.get("season") || undefined;
  const yearStr = searchParams.get("year");
  const year = yearStr ? parseInt(yearStr, 10) : undefined;
  const status = searchParams.get("status") || undefined;
  const genre = searchParams.get("genre") || undefined;
  const format = searchParams.get("format") || undefined;
  const { results, total } = browseAnime({ page, perPage, sort, season, year, status, genre, format });
  return NextResponse.json({
    total, limit: perPage, offset: (page - 1) * perPage, page, perPage,
    lastPage: Math.ceil(total / perPage), hasNextPage: page * perPage < total, results,
  }, {
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
  });
}
