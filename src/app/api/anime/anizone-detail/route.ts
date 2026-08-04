import { NextRequest, NextResponse } from "next/server";
import { getAniZoneDetail } from "@/lib/anizone-api";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "slug parameter required" }, { status: 400 });
  }

  try {
    const data = await getAniZoneDetail(slug);
    if (!data) {
      return NextResponse.json({ error: "Anime not found" }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error("[anizone-detail] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
