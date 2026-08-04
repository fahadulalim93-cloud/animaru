import { NextResponse } from "next/server";
import { getAniZoneHome } from "@/lib/anizone-api";

export async function GET() {
  try {
    const data = await getAniZoneHome();
    if (!data) {
      return NextResponse.json({ error: "Failed to fetch AniZone home" }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error("[anizone-home] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
