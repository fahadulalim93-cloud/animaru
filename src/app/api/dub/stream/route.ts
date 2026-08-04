import { NextRequest, NextResponse } from "next/server";
import { getDubStream } from "@/lib/dub-api";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const season = parseInt(req.nextUrl.searchParams.get("season") || "1");
  const ep = parseInt(req.nextUrl.searchParams.get("ep") || "1");

  if (!id) {
    return NextResponse.json({ success: false, error: "Parameter 'id' is required" }, { status: 400 });
  }

  try {
    const results = await getDubStream(id, season, ep);
    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
