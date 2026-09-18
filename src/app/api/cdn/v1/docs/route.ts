import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cdn/v1/docs
 * Minimal docs — doesn't expose endpoint list.
 */
export async function GET() {
  return NextResponse.json({
    service: "LuffyTV CDN",
    host: "https://cdn.luffytv.live",
    cors: "*",
  }, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, s-maxage=3600",
    },
  });
}
