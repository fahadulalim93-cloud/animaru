/**
 * GET /api/anime/anilight-direct/[anilistId]/[episode]
 *
 * Fetches stream from AniLight API (api.anilight.live).
 * AniLight uses MAL IDs internally — we resolve AniList → MAL via AniList GraphQL.
 *
 * Query params:
 *   type: "sub" | "dub" (default: sub)
 *
 * Returns:
 *   {
 *     anilistId, malId, episode,
 *     sources: [{ quality, url, type: "hls" }],
 *     subtitles: [{ url, lang, label }],
 *     provider: "anilight"
 *   }
 *
 * AniLight streams come from `nanobyte.bigdreamsmalldih.site` (ESA CDN) —
 * works DIRECTLY from browser with no proxy needed.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  resolveMalId,
  getAniLightWatch,
} from "@/lib/anilight-api";

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

  try {
    const malId = await resolveMalId(id);
    if (!malId) {
      return NextResponse.json({
        error: "AniList ID has no MAL mapping — AniLight requires MAL IDs",
        anilistId: id,
      }, { status: 404 });
    }

    const data = await getAniLightWatch(malId, epNum, 10000);
    if (!data?.stream) {
      return NextResponse.json({
        error: "AniLight returned no stream data",
        anilistId: id, malId,
      }, { status: 404 });
    }

    const side = type === "dub" ? data.stream.dub : data.stream.sub;
    if (!side?.success) {
      return NextResponse.json({
        error: `AniLight has no ${type} stream for this episode`,
        anilistId: id, malId,
        subAvailable: data.stream.sub?.success || false,
        dubAvailable: data.stream.dub?.success || false,
      }, { status: 404 });
    }

    return NextResponse.json({
      anilistId: id,
      malId,
      episode: epNum,
      type,
      provider: "anilight",
      hostBase: data.hostBase,
      sources: (side.qualities || []).map(q => ({
        quality: q.quality,
        url: q.url,
        type: "hls",
      })),
      masterUrl: side.masterUrl,
      originalMasterUrl: side.originalMasterUrl,
      playerUrl: side.playerUrl,
      subtitles: (data.tracks || []).map(t => ({
        url: t.url,
        lang: t.lang,
        label: t.label,
        kind: t.kind,
        default: t.default,
      })),
      // Note: stream URLs are direct-playable from browser (ESA CDN, no proxy)
      _note: "Stream URLs work directly from browser — no proxy needed",
    }, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (e: any) {
    return NextResponse.json({
      error: "AniLight fetch failed",
      message: e?.message || String(e),
    }, { status: 502 });
  }
}
