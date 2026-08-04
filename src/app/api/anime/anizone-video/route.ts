import { NextRequest, NextResponse } from "next/server";
import { getAniZoneEpisodeVideo } from "@/lib/anizone-api";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  const ep = req.nextUrl.searchParams.get("ep");

  if (!slug || !ep) {
    return NextResponse.json(
      { error: "slug and ep parameters required" },
      { status: 400 },
    );
  }

  try {
    const data = await getAniZoneEpisodeVideo(slug, parseInt(ep));
    if (!data) {
      return NextResponse.json(
        { error: "Episode video not found" },
        { status: 404 },
      );
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error("[anizone-video] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
