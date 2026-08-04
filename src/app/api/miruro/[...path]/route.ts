import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Miruro API proxy — forwards requests to the Miruro-API backend
// Frontend calls /api/miruro/episodes/20, /api/miruro/watch/kiwi/20/sub/animepahe-1, etc.

const MIRURO_BASE = process.env.MIRURO_API_URL || "http://127.0.0.1:8001";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const pathStr = path.join("/");
  const searchParams = request.nextUrl.searchParams.toString();
  const url = `${MIRURO_BASE}/${pathStr}${searchParams ? `?${searchParams}` : ""}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Referer": "https://www.miruro.tv/",
        "Origin": "https://www.miruro.tv",
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
    console.error("[miruro-proxy] Error:", err?.message || err);
    return NextResponse.json(
      { error: "Miruro API request failed", detail: err?.message },
      { status: 502 }
    );
  }
}
