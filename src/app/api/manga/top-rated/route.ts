import { NextResponse } from "next/server";
import { getTopRatedManga } from "@/lib/manga-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const items = await getTopRatedManga();
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
