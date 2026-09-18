/**
 * GET /api/anime/anikoto-servers/[anilistId]/[episode]?title={title}&fast=1
 *
 * Returns AniKoto (anikototv.to / megaplay.buzz) servers with direct m3u8 URLs,
 * subtitle tracks, and skip times.
 *
 * Modes:
 *   ?fast=1  — ONLY Megaplay direct (sub+dub in parallel). ~2-4s.
 *              Returns "Inazuma Sub" and "Inazuma Dub" immediately.
 *   (default) — Megaplay + raw AniKoto (HD-1, HD-2, VidPlay). ~8-15s.
 *              Returns ALL servers (slower but complete).
 */
import { NextRequest, NextResponse } from "next/server";
import { resolveAniKoto, resolveAniKotoFast } from "@/lib/anikoto-direct";
import { wrapM3u8UrlWithReferer } from "@/lib/proxy";
import { getTitle } from "@/lib/anilist-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ anilistId: string; episode: string }> },
) {
  const { anilistId, episode } = await params;
  const id = parseInt(anilistId, 10);
  const epNum = parseInt(episode, 10);
  let title = req.nextUrl.searchParams.get("title") || "";
  const fast = req.nextUrl.searchParams.get("fast") === "1";

  if (isNaN(id) || id <= 0) {
    return NextResponse.json({ servers: [] }, { status: 400 });
  }

  // If title wasn't passed, resolve from AniList cache.
  if (!title && !fast) {
    try {
      title = (await getTitle(id)) || "";
    } catch {
      /* fallthrough with empty title */
    }
  }

  try {
    // ── Fast mode: ONLY Megaplay direct (2-4 seconds) ──
    // Returns "Inazuma Sub" + "Inazuma Dub" immediately.
    // The frontend calls this FIRST to show servers instantly, then
    // calls the full path to get HD-1/HD-2/VidPlay.
    if (fast) {
      const result = await Promise.race([
        resolveAniKotoFast(id, epNum),
        new Promise<null>(r => setTimeout(() => r(null), 8000)),
      ]);
      if (!result || !result.servers.length) {
        return NextResponse.json({ servers: [] });
      }
      const servers = result.servers.map((s, i) => ({
        id: `anikoto:${s.type}:${i}`,
        name: s.name,
        source: "anikoto",
        provider: "anikoto",
        type: s.type,
        quality: s.quality || "1080p",
        streamUrl: s.embedUrl,
        isM3U8: !!s.megaplayFileId,
        isMP4: false,
        isEmbed: false,
        hardsub: false,
        megaplayFileId: s.megaplayFileId || undefined,
        megaplayAudio: s.megaplayAudio || undefined,
        subtitleTracks: (s.subtitleTracks || []).map(t => ({
          url: `/api/stream?url=${encodeURIComponent(t.url)}&referer=${encodeURIComponent(s.referer || "https://megaplay.buzz/")}`,
          lang: t.lang,
          label: t.label,
        })),
        intro: s.intro || result.intro || null,
        outro: s.outro || result.outro || null,
      }));
      console.log(`[AniKoto-FAST] AniList ${id} ep ${epNum}: ${servers.length} servers`);
      return NextResponse.json({ servers });
    }

    // ── Full mode (default): Megaplay + raw AniKoto ──
    const result = await Promise.race([
      resolveAniKoto(id, epNum, title),
      new Promise<null>(r => setTimeout(() => r(null), 25000)),
    ]);
    if (!result || !result.servers.length) {
      return NextResponse.json({ servers: [] });
    }

    const servers = result.servers.map((s, i) => {
      const streamUrl = s.m3u8Url
        ? wrapM3u8UrlWithReferer(s.m3u8Url, s.referer)
        : s.embedUrl;
      const hasMegaplayFileId = !!s.megaplayFileId;
      return {
        id: `anikoto:${s.type}:${i}`,
        name: s.name,
        source: "anikoto",
        provider: "anikoto",
        type: s.type,
        quality: s.quality || "1080p",
        streamUrl,
        isM3U8: !!s.m3u8Url || hasMegaplayFileId,
        isMP4: false,
        isEmbed: !s.m3u8Url && !hasMegaplayFileId,
        hardsub: false,
        megaplayFileId: s.megaplayFileId || undefined,
        megaplayAudio: s.megaplayAudio || undefined,
        subtitleTracks: (s.subtitleTracks || []).map(t => ({
          url: `/api/stream?url=${encodeURIComponent(t.url)}&referer=${encodeURIComponent(s.referer || "https://megaplay.buzz/")}`,
          lang: t.lang,
          label: t.label,
        })),
        intro: s.intro || result.intro || null,
        outro: s.outro || result.outro || null,
      };
    });

    console.log(`[AniKoto-FULL] AniList ${id} ep ${epNum}: ${servers.length} servers (sub=${servers.filter(s=>s.type==="sub").length} dub=${servers.filter(s=>s.type==="dub").length})`);
    return NextResponse.json({ servers });
  } catch (err) {
    console.error("[AniKoto] error:", err);
    return NextResponse.json({ servers: [] });
  }
}
