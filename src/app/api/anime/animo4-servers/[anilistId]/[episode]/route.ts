import { NextRequest, NextResponse } from "next/server";
import { resolveAnimo4Streams } from "@/lib/animo4-direct";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/anime/animo4-servers/[anilistId]/[episode]?slug=...&type=sub|dub
 *
 * Returns stream URLs for one episode of an anime on 4animo.xyz.
 *
 * Query params:
 *   - slug (required): the URL slug from the 4animo catalog, e.g.
 *     "demon-slayer-kimetsu-no-yaiba-9411"
 *   - type: "sub" | "dub" | "both" (default "both")
 *
 * The anilistId is unused — 4animo uses its own IDs (extracted from the slug).
 * We accept anilistId in the path so the watch-page can use the same URL
 * pattern as other providers.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ anilistId: string; episode: string }> }
) {
  const { episode } = await params;
  const epNum = parseInt(episode, 10);
  const slug = _req.nextUrl.searchParams.get("slug") || "";
  const typeParam = _req.nextUrl.searchParams.get("type") || "both";

  if (!slug) {
    return NextResponse.json({ error: "Missing slug parameter" }, { status: 400 });
  }
  if (isNaN(epNum) || epNum < 1) {
    return NextResponse.json({ error: "Invalid episode" }, { status: 400 });
  }

  // Extract the 4animo anime ID from the slug (trailing -NNN)
  const idMatch = slug.match(/-(\d{1,6})$/);
  if (!idMatch) {
    return NextResponse.json({ error: "Slug must end with -{numericId}" }, { status: 400 });
  }
  const id = parseInt(idMatch[1], 10);

  const types: Array<"sub" | "dub"> =
    typeParam === "sub" ? ["sub"] :
    typeParam === "dub" ? ["dub"] :
    ["sub", "dub"];

  try {
    const results = await resolveAnimo4Streams(id, epNum, slug, types);

    const servers = results.map((r, idx) => {
      const urlKey = `${r.type}:${r.serverName}:${idx}`;
      return {
        id: `animo4:${id}:${urlKey}`,
        name: `4animo ${r.serverName}${r.type === "dub" ? " (Dub)" : ""}`,
        source: "animo4" as const,
        provider: r.serverName.toLowerCase().replace(/\s/g, ""),
        type: r.type,
        quality: r.quality,
        streamUrl: r.streamUrl,
        isM3U8: r.isM3U8,
        isMP4: r.isMP4,
        isEmbed: r.isEmbed,
        priority: 0.7,
        subtitleTracks: r.subtitleTracks.map(t => ({
          url: t.url,
          lang: t.lang,
          label: t.label,
        })),
        intro: r.intro ?? null,
        outro: r.outro ?? null,
      };
    });

    console.log(`[Animo4-Servers] ${slug} ep${epNum}: ${servers.length} servers`);

    return NextResponse.json({
      anilistId: id,
      episode: epNum,
      servers,
      total: servers.length,
    }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
    });
  } catch (e: any) {
    console.error(`[Animo4-Servers] failed for ${slug} ep${epNum}:`, e?.message || e);
    return NextResponse.json({
      servers: [],
      total: 0,
      error: e?.message || "Failed",
    });
  }
}
