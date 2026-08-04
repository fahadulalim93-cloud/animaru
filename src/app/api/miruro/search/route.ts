import { NextRequest, NextResponse } from "next/server";
import { miruroSearch } from "@/lib/miruro-api";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";
  const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
  const type = req.nextUrl.searchParams.get("type") || "ANIME";

  if (!q) {
    return NextResponse.json({ success: false, error: "Search query 'q' is required" }, { status: 400 });
  }

  try {
    const data = await miruroSearch(q, page);
    return NextResponse.json({ success: true, ...data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
