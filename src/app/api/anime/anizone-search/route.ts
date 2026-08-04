import { NextRequest, NextResponse } from "next/server";
import { searchAniZone } from "@/lib/anizone-api";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q");
  if (!query) {
    return NextResponse.json({ error: "q parameter required" }, { status: 400 });
  }

  try {
    const data = await searchAniZone(query);
    if (!data) {
      return NextResponse.json({ error: "Search failed" }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error("[anizone-search] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
