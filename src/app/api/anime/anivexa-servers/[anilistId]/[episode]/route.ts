/**
 * GET /api/anime/anivexa-servers/[anilistId]/[episode]
 *
 * Returns AniVexa (allmanga, anineko) servers (HLS m3u8 + MP4).
 * Separate endpoint so it doesn't block other providers.
 */
import { NextRequest, NextResponse } from "next/server";
import { wrapM3u8Url, wrapM3u8UrlWithReferer, wrapStreamUrl } from "@/lib/proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ANIVEXA_API = "https://anivexa-api-tawny.vercel.app";
const ANIVEXA_PROVIDERS = ["allmanga", "anineko"] as const;

function buildProxyUrl(streamUrl: string, referer: string, isMP4: boolean = false): string {
  if (isMP4) return wrapStreamUrl(streamUrl);
  return wrapM3u8UrlWithReferer(streamUrl, referer);
}

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
    const servers: any[] = [];
    const jobs: Array<{ provider: string; type: "sub" | "dub" }> = [];
    for (const prov of ANIVEXA_PROVIDERS) {
      for (const cat of ["sub", "dub"] as const) {
        jobs.push({ provider: prov, type: cat });
      }
    }

    const results = await Promise.allSettled(
      jobs.map(async (job) => {
        try {
          const res = await Promise.race([
            fetch(`${ANIVEXA_API}/watch/${job.provider}/${id}/${job.type}/${job.provider}-${epNum}`).then(r => r.ok ? r.json() : null),
            new Promise<null>(r => setTimeout(() => r(null), 8000)),
          ]);
          if (!res) return null;

          let streamUrl: string | null = null;
          let streamReferer = "https://allmanga.to/";
          let quality = "auto";
          let isM3U8 = true;
          let isMP4 = false;

          if (job.provider === "allmanga") {
            const sources = res.sources || [];
            const clockSources = sources.filter((s: any) => s.url && s.url.includes("clock.json"));
            const ref = "https://allmanga.to";
            for (const cs of clockSources) {
              try {
                const clockRes = await Promise.race([
                  fetch(cs.url, { headers: { Referer: ref }, cache: "no-store" }).then(r => r.ok ? r.json() : null),
                  new Promise<null>(r => setTimeout(() => r(null), 5000)),
                ]);
                if (clockRes?.links?.length) {
                  const hlsLink = clockRes.links.find((l: any) => l.hls) || clockRes.links[0];
                  if (hlsLink?.link) {
                    streamUrl = hlsLink.link;
                    streamReferer = ref;
                    quality = hlsLink.resolutionStr || cs.name || "auto";
                    isM3U8 = true;
                    isMP4 = false;
                    break;
                  }
                }
              } catch { /* try next */ }
            }
          } else if (job.provider === "anineko") {
            const streams = (res.streams || []).filter((s: any) => s.type === "hls" && s.url);
            if (streams.length > 0) {
              streamUrl = streams[0].url;
              streamReferer = streams[0].referer || "https://vibeplayer.site/";
              quality = streams[0].server || "auto";
              isM3U8 = true;
              isMP4 = false;
            }
          }

          if (streamUrl) {
            const nameMap: Record<string, string> = { anineko: "Chopper", allmanga: "Robin" };
            const name = `${nameMap[job.provider] || job.provider}${job.type === "dub" ? " (Dub)" : ""}`;
            return {
              id: `anivexa:${job.provider}:${job.type}`,
              name,
              source: "anivexa",
              provider: job.provider,
              type: job.type,
              quality,
              streamUrl: buildProxyUrl(streamUrl, streamReferer, isMP4),
              isM3U8,
              isMP4,
              hardsub: false,
            };
          }
        } catch { /* skip */ }
        return null;
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value) servers.push(r.value);
    }

    console.log(`[AniVexa-Servers] AniList ${id} ep ${epNum}: ${servers.length} servers`);
    return NextResponse.json({ servers });
  } catch (err) {
    console.error("[AniVexa-Servers] error:", err);
    return NextResponse.json({ servers: [] });
  }
}
