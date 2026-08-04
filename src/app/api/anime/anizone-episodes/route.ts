import { NextRequest, NextResponse } from "next/server";
import { getAniZoneEpisodeIndex } from "@/lib/anizone-api";

export async function GET(req: NextRequest) {
  const page = parseInt(req.nextUrl.searchParams.get("page") || "1");

  try {
    const data = await getAniZoneEpisodeIndex(page);
    if (!data) {
      return NextResponse.json({ error: "Failed to fetch episodes" }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error("[anizone-episodes] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
