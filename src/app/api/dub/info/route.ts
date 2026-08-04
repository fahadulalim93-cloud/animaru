import { NextRequest, NextResponse } from "next/server";
import { getDubAnimeInfo } from "@/lib/dub-api";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json({ success: false, error: "Parameter 'id' is required" }, { status: 400 });
  }

  try {
    const data = await getDubAnimeInfo(id);
    if (!data) {
      return NextResponse.json({ success: false, error: "Anime not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
