import { NextRequest, NextResponse } from "next/server";
import { miruroTrending } from "@/lib/miruro-api";

export async function GET(req: NextRequest) {
  const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
  const perPage = parseInt(req.nextUrl.searchParams.get("perPage") || "20");

  try {
    const results = await miruroTrending(page, perPage);
    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
