import { NextRequest, NextResponse } from "next/server";
import { miruroInfo } from "@/lib/miruro-api";

export async function GET(req: NextRequest) {
  const id = parseInt(req.nextUrl.searchParams.get("id") || "0");
  if (!id) {
    return NextResponse.json({ success: false, error: "Parameter 'id' (AniList ID) is required" }, { status: 400 });
  }

  try {
    const data = await miruroInfo(id);
    if (!data) {
      return NextResponse.json({ success: false, error: "Anime not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
