/**
 * GET /api/anime/kyren-direct/[anilistId]/[episode]
 *
 * Fetches stream from Kyren API (kyren.moe/api).
 * Kyren's `id` field IS the AniList ID (verified: One Piece = id 21 = AniList 21).
 *
 * Query params:
 *   type:   "sub" | "dub" (default: sub)
 *   server: "pahe" | "senshi" | "vidnest-direct" | "megaplay-direct" | "vidnest" | "vidnest-pahe"
 *           (default: tries all in parallel, returns first that works)
 *
 * Returns:
 *   {
 *     anilistId, episode, type,
 *     sources: [{ provider, url, type: "hls", quality }],
 *     subtitles: [{ url, lang, label }],
 *     anime: { id, slug, title }
 *   }
 *
 * Kyren's HLS URLs (api.kyren.moe/v1/hls/m/...) have permissive CORS headers
 * and play DIRECTLY from the browser — no proxy needed.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  resolveKyrenAnime,
  getKyrenStream,
  KYREN_HLS_SERVERS,
  KYREN_SERVER_NAMES,
  type KyrenServer,
} from "@/lib/kyren-api";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ anilistId: string; episode: string }> }
) {
  const { anilistId, episode } = await params;
  const id = parseInt(anilistId, 10);
  const epNum = parseInt(episode, 10);
  if (isNaN(id) || id <= 0 || isNaN(epNum) || epNum <= 0) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }

  const url = new URL(req.url);
  const type = (url.searchParams.get("type") || "sub") as "sub" | "dub";
  const requestedServer = url.searchParams.get("server") as KyrenServer | null;

  try {
    const anime = await resolveKyrenAnime(id, 10000);
    if (!anime) {
      return NextResponse.json({
        error: "Anime not found on Kyren",
        anilistId: id,
      }, { status: 404 });
    }

    // If a specific server is requested, return just that one
    // Otherwise try all servers in parallel and return the first that works
    const serversToTry = requestedServer
      ? [requestedServer]
      : KYREN_HLS_SERVERS;

    const results = await Promise.allSettled(
      serversToTry.map(async (server) => {
        const data = await getKyrenStream(id, epNum, type, server, anime.slug, 10000);
        if (!data?.ok || !data?.sources?.length) return null;
        const hls = data.sources.find(s => s.type === "hls" && s.url);
        if (!hls) return null;
        return {
          server,
          serverName: KYREN_SERVER_NAMES[server] || server,
          source: hls,
          subtitles: data.subtitles || [],
        };
      })
    );

    const valid = results
      .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled" && r.value !== null)
      .map(r => r.value);

    if (valid.length === 0) {
      return NextResponse.json({
        error: `No ${type} streams found on Kyren for this episode`,
        anilistId: id,
        anime: { id: anime.id, slug: anime.slug, title: anime.titleEnglish || anime.titleRomaji },
        triedServers: serversToTry,
      }, { status: 404 });
    }

    return NextResponse.json({
      anilistId: id,
      episode: epNum,
      type,
      provider: "kyren",
      anime: {
        id: anime.id,
        slug: anime.slug,
        title: anime.titleEnglish || anime.titleRomaji || anime.title,
      },
      sources: valid.map(v => ({
        provider: v.server,
        providerName: v.serverName,
        url: v.source.url,
        type: v.source.type,
        quality: v.source.quality,
        language: v.source.language,
        isDub: v.source.isDub,
      })),
      subtitles: valid[0]?.subtitles || [],
      // Note: stream URLs are direct-playable from browser (kyren's CF Worker has permissive CORS)
      _note: "Stream URLs work directly from browser — no proxy needed",
    }, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (e: any) {
    return NextResponse.json({
      error: "Kyren fetch failed",
      message: e?.message || String(e),
    }, { status: 502 });
  }
}
