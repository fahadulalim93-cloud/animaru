import { NextResponse } from "next/server";
import { getAniZoneTags } from "@/lib/anizone-api";

export async function GET() {
  try {
    const data = await getAniZoneTags();
    if (!data) {
      return NextResponse.json({ error: "Failed to fetch tags" }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error("[anizone-tags] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
