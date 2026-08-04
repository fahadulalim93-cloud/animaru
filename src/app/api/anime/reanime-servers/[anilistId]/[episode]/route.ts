/**
 * GET /api/anime/reanime-servers/[anilistId]/[episode]
 *
 * Fetches ReAnime servers INDEPENDENTLY from the main servers endpoint.
 * ReAnime uses FlixCLOUD infrastructure — the /api/flix/{anilistId}/{episode}
 * endpoint returns server list with dataLink URLs to flixcloud.cc embeds.
 *
 * If FlixCLOUD decryption succeeds → returns direct m3u8 URLs.
 * If CF blocks decryption → returns embed URLs as iframe sources.
 */
import { NextRequest, NextResponse } from "next/server";
import { fetchAllReAnimeSources } from "@/lib/reanime-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ReAnimeServer {
  id: string;
  name: string;
  source: "reanime";
  provider: string;
  type: "sub" | "dub";
  quality: string;
  streamUrl: string;
  isM3U8: boolean;
  isMP4: boolean;
  isEmbed: boolean;
  hardsub: boolean;
  subtitleTracks: Array<{ url: string; lang: string; label: string }>;
  intro?: { start: number; end: number } | null;
  outro?: { start: number; end: number } | null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ anilistId: string; episode: string }> }
) {
  const { anilistId, episode } = await params;
  const id = parseInt(anilistId, 10);
  const epNum = parseInt(episode, 10);
  if (isNaN(id) || id <= 0 || isNaN(epNum) || epNum <= 0) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }

  try {
    const results = await fetchAllReAnimeSources(id, epNum, undefined, {
      sub: true,
      dub: true,
      timeoutMs: 15000,
    });

    const servers: ReAnimeServer[] = results.map((r) => ({
      id: `reanime:${r.provider}`,
      name: `ReAnime ${r.provider.includes("hd-2") ? "HD-2" : "HD-1"} ${r.type === "dub" ? "Dub" : "Sub"}`,
      source: "reanime" as const,
      provider: r.provider,
      type: r.type,
      quality: r.quality || "auto",
      streamUrl: r.streamUrl,
      isM3U8: r.isM3U8,
      isMP4: r.isMP4 || false,
      isEmbed: r.isEmbed || false,
      hardsub: !r.isEmbed && r.subtitleTracks?.length === 0,
      subtitleTracks: r.subtitleTracks || [],
      intro: r.intro || null,
      outro: r.outro || null,
    }));

    console.log(`[ReAnime-Servers] ${anilistId} ep${epNum}: ${servers.length} servers (m3u8=${servers.filter(s => s.isM3U8).length}, embed=${servers.filter(s => s.isEmbed).length})`);
    return NextResponse.json({
      anilistId: id,
      episode: epNum,
      servers,
      total: servers.length,
    }, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (e: any) {
    console.error(`[ReAnime-Servers] failed for ${anilistId} ep${epNum}:`, e?.message || e);
    return NextResponse.json({
      servers: [],
      total: 0,
      error: e?.message || "Failed to fetch ReAnime servers",
    }, { status: 200 });
  }
}
