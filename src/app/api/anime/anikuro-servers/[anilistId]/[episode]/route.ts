/**
 * GET /api/anime/anikuro-servers/[anilistId]/[episode]
 *
 * Fetches AniKuro servers INDEPENDENTLY from the main servers endpoint.
 * AniKuro has 11 providers (animepahe, anikoto, animegg, etc.) via
 * proxy.anikuro.ru — each provider needs a separate fetch + base64 decode.
 * Running separately prevents the slowest provider from blocking others.
 */
import { NextRequest, NextResponse } from "next/server";
import { fetchAnikuroSources } from "@/lib/anikuro-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface AniKuroServer {
  id: string;
  name: string;
  source: "anikuro";
  provider: string;
  type: "sub" | "dub";
  quality: string;
  streamUrl: string;
  isM3U8: boolean;
  isMP4: boolean;
  hardsub: boolean;
  subtitleTracks: Array<{ url: string; lang: string; label: string }>;
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
    const results = await fetchAnikuroSources(id, epNum, {
      sub: true,
      dub: true,
      timeoutMs: 15000,
    });

    const servers: AniKuroServer[] = results.map((r: any) => ({
      id: `anikuro:${r.provider}:${r.type}`,
      name: `AniKuro ${r.provider[0].toUpperCase() + r.provider.slice(1)}${r.type === "dub" ? " (Dub)" : ""}`,
      source: "anikuro" as const,
      provider: r.provider,
      type: r.type,
      quality: r.quality || "auto",
      streamUrl: r.streamUrl,
      isM3U8: r.isM3U8,
      isMP4: r.isMP4 || false,
      hardsub: false,
      subtitleTracks: [],
    }));

    console.log(`[AniKuro-Servers] ${anilistId} ep${epNum}: ${servers.length} servers`);
    return NextResponse.json({
      anilistId: id,
      episode: epNum,
      servers,
      total: servers.length,
    }, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (e: any) {
    console.error(`[AniKuro-Servers] failed for ${anilistId} ep${epNum}:`, e?.message || e);
    return NextResponse.json({
      servers: [],
      total: 0,
      error: e?.message || "Failed to fetch AniKuro servers",
    }, { status: 200 });
  }
}
