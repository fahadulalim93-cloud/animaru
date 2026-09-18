/**
 * GET /api/anime/anidao-servers/[anilistId]/[episode]?title={title}
 *
 * Returns AniDao.to servers with direct m3u8 URLs + subtitle tracks.
 * AniDao is a clone of AniNeko.to — same vivibebe.site embed CDN, same
 * cdn.anizara.store subtitle CDN. Returns both sub and dub servers.
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveAnidaoStreams } from "@/lib/anidao-direct";
import { wrapM3u8UrlWithApiLuffytv } from "@/lib/proxy";
import { getTitle } from "@/lib/anilist-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ anilistId: string; episode: string }> },
) {
  const { anilistId, episode } = await params;
  const id = parseInt(anilistId, 10);
  const epNum = parseInt(episode, 10);
  let title = req.nextUrl.searchParams.get("title") || "";

  if (isNaN(id) || id <= 0) {
    return NextResponse.json({ servers: [] }, { status: 400 });
  }

  // If title wasn't passed, resolve from AniList cache so AniDao works
  // even when the watch page hasn't loaded the title yet.
  if (!title) {
    try {
      title = (await getTitle(id)) || "";
    } catch {
      /* fallthrough with empty title */
    }
  }

  try {
    const streams = await Promise.race([
      resolveAnidaoStreams(id, epNum, title),
      new Promise<[]>(r => setTimeout(() => r([]), 15000)),
    ]).catch(() => [] as any[]);

    // Filter out embed servers — they're broken CDNs (vivibebe, bibiemb,
    // playmogo) that never work. Only return m3u8 servers (otakuhg/otakuvid).
    const m3u8Streams = streams.filter((s: any) => s.isM3U8 && !s.isEmbed);

    const servers = m3u8Streams.map((s: any, i: number) => ({
      id: `anidao:${s.type}:${i}`,
      name: `Dao ${s.serverName}${s.type === "dub" ? " (Dub)" : s.hardsub ? " (HS)" : ""}`,
      source: "anidao",
      provider: "anidao",
      type: s.type,
      quality: s.quality || "1080p",
      // ── Use api.luffytv.live (Cloudflare custom domain) ──
      // The AniDao CDNs (premilkyway, dramiyos-cdn, acek-cdn) rate-limit
      // the *.workers.dev IP range at segment-load frequency (~50% 403).
      // The api.luffytv.live custom domain uses a different IP range and
      // returns 200 OK 100% of the time. Same XOR token, same worker code,
      // different IP range.
      //
      // Referer: megaplay.buzz (tested: works for premilkyway/dramiyos/acek)
      streamUrl: wrapM3u8UrlWithApiLuffytv(s.streamUrl, "https://megaplay.buzz/"),
      isM3U8: s.isM3U8,
      isMP4: false,
      isEmbed: false,
      hardsub: s.hardsub === true,
      subtitleTracks: s.subtitleTracks || [],
      intro: null,
      outro: null,
    }));

    console.log(`[AniDao-Servers] AniList ${id} ep ${epNum}: ${servers.length} servers (sub=${servers.filter(s=>s.type==="sub").length} dub=${servers.filter(s=>s.type==="dub").length})`);
    return NextResponse.json(
      { servers },
      { headers: { "Cache-Control": "public, s-maxage=300, max-age=300, must-revalidate" } },
    );
  } catch (err) {
    console.error("[AniDao-Servers] error:", err);
    return NextResponse.json({ servers: [] });
  }
}
