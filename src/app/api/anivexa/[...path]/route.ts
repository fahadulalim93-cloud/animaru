import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Anivexa API proxy — forwards requests to the Anivexa-API backend
// Frontend calls /api/anivexa/episodes/20, /api/anivexa/watch/allmanga/20/sub/allmanga-1, etc.

const ANIVEXA_BASE = process.env.ANIVEXA_API_URL || "https://anivexa-api.vercel.app";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const pathStr = path.join("/");
  const searchParams = request.nextUrl.searchParams.toString();
  const url = `${ANIVEXA_BASE}/${pathStr}${searchParams ? `?${searchParams}` : ""}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
      signal: AbortSignal.timeout(20000),
    });

    const data = await res.json();
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, max-age=300",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err: any) {
    console.error("[anivexa-proxy] Error:", err?.message || err);
    return NextResponse.json(
      { error: "Anivexa API request failed", detail: err?.message },
      { status: 502 }
    );
  }
}
