import { NextResponse } from "next/server";
import { getComixFilterOptions } from "@/lib/comix-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 25;

/**
 * GET /api/manga/comix-filters
 *
 * Returns all available filter options from comix.to:
 * genres, types, demographics, statuses, sorts, formats, years
 */
export async function GET() {
  try {
    const filters = await getComixFilterOptions();
    if (!filters) {
      return NextResponse.json({ error: "Failed to fetch filter options" }, { status: 500 });
    }
    return NextResponse.json(filters);
  } catch (err: any) {
    console.error("[comix-filters] Error:", err?.message || err);
    return NextResponse.json({ error: err?.message || "Failed" }, { status: 500 });
  }
}
