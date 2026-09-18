/**
 * GET /api/anime/kaa-servers/[anilistId]/[episode]
 *
 * Calls the self-hosted KAA API at ap.luffytv.live
 * which returns HLS streams with intro/outro chapters.
 *
 * Endpoint: https://ap.luffytv.live/kaa/watch/{anilistId}/{sub|dub}/{episode}
 * Returns: { anilistId, episode, audio, streams: [{ url, playerUrl, type, server, headers, priority }] }
 */
import { NextRequest, NextResponse } from "next/server";
import { wrapM3u8Url } from "@/lib/proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KAA_API = "https://ap.luffytv.live/kaa/watch";

interface KAAServer {
  id: string;
  name: string;
  source: "kaa";
  provider: string;
  type: "sub" | "dub";
  quality: string;
  streamUrl: string;
  isM3U8: boolean;
  isMP4: boolean;
  hardsub: boolean;
  subtitleTracks: Array<{ url: string; lang: string; label: string }>;
  intro: { start: number; end: number } | null;
  outro: { start: number; end: number } | null;
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
    // Fetch both sub and dub in parallel
    const [subRes, dubRes] = await Promise.all([
      fetch(`${KAA_API}/${id}/sub/${epNum}`, {
        signal: AbortSignal.timeout(30000),
        headers: { "Accept": "application/json" },
      }).catch(() => null),
      fetch(`${KAA_API}/${id}/dub/${epNum}`, {
        signal: AbortSignal.timeout(30000),
        headers: { "Accept": "application/json" },
      }).catch(() => null),
    ]);

    const servers: KAAServer[] = [];

    // Process sub streams
    if (subRes?.ok) {
      try {
        const data = await subRes.json() as {
          streams?: Array<{
            url: string;
            playerUrl?: string;
            type?: string;
            server?: string;
            headers?: Record<string, string>;
            priority?: number;
            isActive?: boolean;
          }>;
          intro?: { start: number; end: number };
          outro?: { start: number; end: number };
        };

        for (const stream of data.streams || []) {
          const serverName = stream.server || "KAA";
          servers.push({
            id: `kaa:${serverName.toLowerCase().replace(/\s+/g, "-")}:sub`,
            name: `KAA ${serverName}`,
            source: "kaa",
            provider: serverName.toLowerCase().replace(/\s+/g, "-"),
            type: "sub",
            quality: "auto",
            streamUrl: wrapM3u8Url(stream.url),
            isM3U8: stream.type === "hls" || stream.url.includes(".m3u8"),
            isMP4: stream.url.includes(".mp4"),
            hardsub: false,
            subtitleTracks: [],
            intro: data.intro || null,
            outro: data.outro || null,
          });
        }
      } catch {}
    }

    // Process dub streams
    if (dubRes?.ok) {
      try {
        const data = await dubRes.json() as {
          streams?: Array<{
            url: string;
            playerUrl?: string;
            type?: string;
            server?: string;
            headers?: Record<string, string>;
            priority?: number;
            isActive?: boolean;
          }>;
          intro?: { start: number; end: number };
          outro?: { start: number; end: number };
        };

        for (const stream of data.streams || []) {
          const serverName = stream.server || "KAA";
          servers.push({
            id: `kaa:${serverName.toLowerCase().replace(/\s+/g, "-")}:dub`,
            name: `KAA ${serverName} (Dub)`,
            source: "kaa",
            provider: serverName.toLowerCase().replace(/\s+/g, "-"),
            type: "dub",
            quality: "auto",
            streamUrl: wrapM3u8Url(stream.url),
            isM3U8: stream.type === "hls" || stream.url.includes(".m3u8"),
            isMP4: stream.url.includes(".mp4"),
            hardsub: false,
            subtitleTracks: [],
            intro: data.intro || null,
            outro: data.outro || null,
          });
        }
      } catch {}
    }

    console.log(`[KAA-Servers] ${id} ep${epNum}: ${servers.length} servers`);
    return NextResponse.json({
      anilistId: id,
      episode: epNum,
      servers,
      total: servers.length,
    }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (e: any) {
    console.error(`[KAA-Servers] failed for ${id} ep${epNum}:`, e?.message || e);
    return NextResponse.json({ servers: [], total: 0 });
  }
}
