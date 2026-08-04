import { NextRequest, NextResponse } from "next/server";
import { getFullFranchise } from "@/lib/anilist-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const numericId = parseInt(id);
  if (isNaN(numericId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  try {
    const franchise = await getFullFranchise(numericId);
    return NextResponse.json({
      seasons: franchise.seasons,
      related: franchise.related,
      total: franchise.seasons.length + franchise.related.length,
    });
  } catch (err: any) {
    console.error("[franchise] Error:", err?.message || err);
    return NextResponse.json({ seasons: [], related: [], total: 0, error: err?.message });
  }
}
