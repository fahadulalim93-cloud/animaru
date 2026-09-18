import { NextRequest, NextResponse } from "next/server";
import { resolveXanimeByAnilist } from "@/lib/xanime-direct";
import { wrapM3u8UrlWithReferer } from "@/lib/proxy";
import { getTitle } from "@/lib/anilist-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ anilistId: string; episode: string }> }) {
  const { anilistId, episode } = await params;
  const id = parseInt(anilistId, 10);
  const epNum = parseInt(episode, 10);
  if (isNaN(id) || id <= 0) return NextResponse.json({ error: "Invalid" }, { status: 400 });

  let anilistTitle = "";
  try { anilistTitle = (await getTitle(id)) || ""; } catch {}

  try {
    const result = await resolveXanimeByAnilist(id, epNum, anilistTitle);
    if (!result || result.servers.length === 0) {
      return NextResponse.json({ anilistId: id, episode: epNum, servers: [], total: 0, reason: result === null ? "no_match" : "no_servers" }, { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" } });
    }
    const servers = result.servers.map((s, idx) => ({
      id: `xanime:${s.cdnHost}:${s.type}${idx > 0 ? `:${idx + 1}` : ""}`,
      name: s.name, source: "xanime" as const, provider: s.cdnHost, type: s.type, quality: s.quality,
      streamUrl: wrapM3u8UrlWithReferer(s.m3u8Url, "https://xanime.me/"),
      isM3U8: true, isMP4: false, isEmbed: false, hardsub: false, priority: 0.55,
      subtitleTracks: s.subtitleTracks.map(t => ({ url: `/api/stream?url=${encodeURIComponent(t.url)}&referer=${encodeURIComponent("https://xanime.me/")}`, lang: t.lang, label: t.label })),
      intro: null, outro: null,
    }));
    console.log(`[Xanime] AniList ${id} ep${epNum}: ${servers.length} servers`);
    return NextResponse.json({ anilistId: id, episode: epNum, servers, total: servers.length, episodeCount: result.episodes.length }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
  } catch (e: any) {
    console.error(`[Xanime] failed for ${id} ep${epNum}:`, e?.message);
    return NextResponse.json({ servers: [], total: 0, error: e?.message || "Failed" });
  }
}
