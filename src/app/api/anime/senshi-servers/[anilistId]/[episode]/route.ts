import { NextRequest, NextResponse } from "next/server";
import { resolveSenshi } from "@/lib/senshi-direct";
import { wrapM3u8UrlWithReferer } from "@/lib/proxy";
import { getTitle } from "@/lib/anilist-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/anime/senshi-servers/[anilistId]/[episode]
 *
 * Senshi.to scraper — "Deo" source.
 * Flow: AniList title → search senshi.to → episodes → embeds → vidcloud m3u8
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ anilistId: string; episode: string }> }
) {
  const { anilistId, episode } = await params;
  const id = parseInt(anilistId, 10);
  const epNum = parseInt(episode, 10);
  if (isNaN(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid anilistId" }, { status: 400 });
  }

  let anilistTitle = "";
  try {
    anilistTitle = (await getTitle(id)) || "";
  } catch {}

  try {
    const result = await resolveSenshi(id, epNum, anilistTitle);
    if (!result || result.servers.length === 0) {
      return NextResponse.json({
        anilistId: id, episode: epNum, servers: [], total: 0,
        reason: result === null ? "no_match_or_failed" : "no_servers",
      }, { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" } });
    }

    const servers = result.servers.map((s, idx) => ({
      id: `senshi:${s.type}:${idx}`,
      name: s.name,
      source: "senshi" as const,
      provider: "senshi",
      type: s.type,
      quality: s.quality,
      streamUrl: wrapM3u8UrlWithReferer(s.m3u8Url, "https://senshi.to/"),
      isM3U8: true,
      isMP4: false,
      isEmbed: false,
      hardsub: s.name.includes("Hardsub"),
      priority: 0.6,
      subtitleTracks: s.subtitleTracks.map(t => ({
        url: `/api/stream?url=${encodeURIComponent(t.url)}&referer=${encodeURIComponent("https://senshi.to/")}`,
        lang: t.lang, label: t.label,
      })),
      intro: s.intro,
      outro: s.outro,
    }));

    console.log(`[Senshi] AniList ${id} ep${epNum}: ${servers.length} servers`);
    return NextResponse.json({
      anilistId: id, episode: epNum, servers, total: servers.length,
    }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
  } catch (e: any) {
    console.error(`[Senshi] failed for ${id} ep${epNum}:`, e?.message);
    return NextResponse.json({ servers: [], total: 0, error: e?.message || "Failed" });
  }
}
