import { NextResponse } from "next/server";
import { getRecentlyAddedManga } from "@/lib/manga-api";
import { rewriteMangaArray } from "@/lib/cdn/manga-rewrite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const items = await getRecentlyAddedManga();
    return NextResponse.json({ items: rewriteMangaArray(items) });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
