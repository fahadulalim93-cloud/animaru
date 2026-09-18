import { NextResponse } from "next/server";
import { getStats } from "@/lib/cdn/cdn-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cdn/v1/stats
 *
 * Live stats mirroring cdn.aniclipse.com/v1/stats — total titles, images
 * stored, last sync time. Count reflects whatever is currently in the DB.
 */
export async function GET() {
  const stats = getStats();
  return NextResponse.json(stats, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, s-maxage=10, stale-while-revalidate=60",
    },
  });
}
