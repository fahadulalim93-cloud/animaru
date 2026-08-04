import { NextRequest, NextResponse } from "next/server";
import { resolveAnimeggStreams } from "@/lib/animegg-direct";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/anime/animegg-servers/[slug]/[episode]?type=sub|dub
 *
 * Returns stream URLs for one episode of an anime on animegg.org.
 *
 * Path params:
 *   - slug: the URL slug (no numeric ID — animegg uses kebab-case slugs only)
 *   - episode: 1-based episode number
 *
 * Query params:
 *   - type: "sub" | "dub" | "both" (default "both")
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; episode: string }> }
) {
  const { slug, episode } = await params;
  const epNum = parseInt(episode, 10);
  const typeParam = _req.nextUrl.searchParams.get("type") || "both";

  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }
  if (isNaN(epNum) || epNum < 1) {
    return NextResponse.json({ error: "Invalid episode" }, { status: 400 });
  }

  const types: Array<"sub" | "dub"> =
    typeParam === "sub" ? ["sub"] :
    typeParam === "dub" ? ["dub"] :
    ["sub", "dub"];

  try {
    const results = await resolveAnimeggStreams(slug, epNum, types);

    const servers = results.map((r, idx) => ({
      id: `animegg:${slug}:${r.type}:${idx}`,
      name: r.serverName,
      source: "animegg" as const,
      provider: "animegg",
      type: r.type,
      quality: r.quality,
      streamUrl: r.streamUrl,
      isM3U8: r.isM3U8,
      isMP4: r.isMP4,
      isEmbed: r.isEmbed,
      priority: 0.5,
      subtitleTracks: r.subtitleTracks,
      intro: null,
      outro: null,
    }));

    console.log(`[Animegg-Servers] ${slug} ep${epNum}: ${servers.length} servers`);

    return NextResponse.json({
      slug,
      episode: epNum,
      servers,
      total: servers.length,
    }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
    });
  } catch (e: any) {
    console.error(`[Animegg-Servers] failed for ${slug} ep${epNum}:`, e?.message || e);
    return NextResponse.json({
      servers: [],
      total: 0,
      error: e?.message || "Failed",
    });
  }
}
