import { NextRequest, NextResponse } from "next/server";
import { resolveAllManga } from "@/lib/allmanga-direct";
import { wrapM3u8Url } from "@/lib/proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/anime/mkissa-servers/[anilistId]/[episode]
 * Uses api.mkissa.net (allanime GraphQL API) for multi-source streams.
 * Sources: mp4upload, streamsb, ok.ru, allanime.uns.bio, etc.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ anilistId: string; episode: string }> },
) {
  const { anilistId, episode } = await params;
  const id = parseInt(anilistId, 10);
  const epNum = parseInt(episode, 10);

  if (isNaN(id) || id <= 0) return NextResponse.json({ servers: [] }, { status: 400 });

  try {
    const [subResult, dubResult] = await Promise.allSettled([
      resolveAllManga(id, epNum, "sub"),
      resolveAllManga(id, epNum, "dub"),
    ]);

    const servers: any[] = [];

    if (subResult.status === "fulfilled" && subResult.value) {
      for (const s of subResult.value.sources) {
        servers.push({
          id: `mkissa:${s.name}:sub`,
          name: s.name,
          source: "mkissa" as const,
          provider: s.name.toLowerCase().replace(/\s/g, ""),
          type: "sub" as const,
          quality: s.quality || "1080p",
          streamUrl: wrapM3u8Url(s.url),
          isM3U8: true,
          isMP4: false,
          isEmbed: false,
          hardsub: false,
          subtitleTracks: [],
          priority: 7,
        });
      }
    }

    if (dubResult.status === "fulfilled" && dubResult.value) {
      for (const s of dubResult.value.sources) {
        servers.push({
          id: `mkissa:${s.name}:dub`,
          name: `${s.name} (Dub)`,
          source: "mkissa" as const,
          provider: s.name.toLowerCase().replace(/\s/g, ""),
          type: "dub" as const,
          quality: s.quality || "1080p",
          streamUrl: wrapM3u8Url(s.url),
          isM3U8: true,
          isMP4: false,
          isEmbed: false,
          hardsub: false,
          subtitleTracks: [],
          priority: 7,
        });
      }
    }

    console.log(`[Mkissa] ${id} ep${epNum}: ${servers.length} servers`);
    return NextResponse.json({ servers });
  } catch (e: any) {
    console.log(`[Mkissa] error: ${e?.message || e}`);
    return NextResponse.json({ servers: [] });
  }
}
