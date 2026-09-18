import { NextResponse } from "next/server";
import { getMangaHome } from "@/lib/manga-api";
import { rewriteMangaArray } from "@/lib/cdn/manga-rewrite";

export const runtime = "nodejs";
export const revalidate = 300;

export async function GET() {
  try {
    const sections = await getMangaHome();
    const rewrittenSections = sections.map(s => ({
      ...s,
      items: rewriteMangaArray(s.items || []),
    }));
    return NextResponse.json(
      { sections: rewrittenSections },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1800" } },
    );
  } catch {
    return NextResponse.json({ sections: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}
