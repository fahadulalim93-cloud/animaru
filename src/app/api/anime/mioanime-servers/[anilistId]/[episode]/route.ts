/**
 * GET /api/anime/mioanime-servers/[anilistId]/[episode]
 *
 * Returns MioAnime servers (AniZone + Verse + Senshi + AllAnime).
 * Separate endpoint so it doesn't block other providers.
 */
import { NextRequest, NextResponse } from "next/server";
import { fetchMioAnimeSources } from "@/lib/mioanime-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ anilistId: string; episode: string }> }
) {
  const { anilistId, episode } = await params;
  const id = parseInt(anilistId, 10);
  const epNum = parseInt(episode, 10);
  if (isNaN(id) || id <= 0) {
    return NextResponse.json({ servers: [] }, { status: 400 });
  }

  try {
    const results = await fetchMioAnimeSources(id, epNum, { timeoutMs: 10000 }).catch(() => []);

    const servers: any[] = [];
    const maNameMap: Record<string, string> = {
      "AniZone": "Vivi", "MegaPlay": "Shirahoshi", "Senshi": "Carrot",
      "AniDB": "Pedro", "AnimeSalt": "Reiju", "AniBD": "Pudding",
      "AnimeNexus": "Koala", "AllAnime": "Robin",
    };
    for (const r of results) {
      const typeTag = r.type === "dub" ? " (Dub)" : (r.hardsub ? " (HS)" : "");
      const maDisplayName = maNameMap[r.name] || r.name;
      servers.push({
        id: r.id,
        name: `${maDisplayName}${typeTag}`,
        source: "mioanime",
        provider: r.id,
        type: r.type,
        quality: r.quality,
        streamUrl: r.streamUrl,
        isM3U8: r.isM3U8,
        isMP4: r.isMP4,
        isEmbed: (r as any).isEmbed === true,
        hardsub: r.hardsub,
        subtitleTracks: r.subtitleTracks,
      });
    }

    console.log(`[MioAnime-Servers] AniList ${id} ep ${epNum}: ${servers.length} servers`);
    return NextResponse.json({ servers });
  } catch (err) {
    console.error("[MioAnime-Servers] error:", err);
    return NextResponse.json({ servers: [] });
  }
}
