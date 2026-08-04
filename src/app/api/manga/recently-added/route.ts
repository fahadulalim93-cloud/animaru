import { NextResponse } from "next/server";
import { getRecentlyAddedManga } from "@/lib/manga-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const items = await getRecentlyAddedManga();
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
