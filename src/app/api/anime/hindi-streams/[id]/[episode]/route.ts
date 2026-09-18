import { NextRequest, NextResponse } from "next/server";
import { resolveAnimoStreamStreams } from "@/lib/animostream-direct";
import { blakiteFindByTitle, blakiteBuildStreamUrl, blakiteResolveStreams } from "@/lib/blakite-api";
import { desidubFindByTitle, desidubResolveServer4, desidubResolveAllServers } from "@/lib/desidubanime-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/anime/hindi-streams/[id]/[episode]?postId=...&season=s1&title=...&source=...
 *
 * Unified Hindi stream resolver. Routes the request to the correct backend
 * based on the synthetic ID range or ?source= param:
 *
 *   - id < 2_000_000        → legacy Hindi Anime DB (megaplay.buzz) —
 *                             the existing /api/hindi/watch endpoint handles
 *                             this; here we return an empty list so the
 *                             frontend falls back to /api/hindi/watch
 *   - 2_000_000+ (with ?postId=...)  → animostream.com Hindi dub
 *   - 3_000_000+ (with ?title=...)   → Blakite Hindi dub (blakiteapi.xyz)
 *   - 4_000_000+ (with ?title=...)   → DesiDubAnime Hindi dub (desidubanime.me)
 *   - ?source=blakite                   → Force Blakite source
 *   - ?source=desidub                   → Force DesiDubAnime source
 *   - ?source=desidub-selfhost          → DesiDubAnime Server 4 (self-host) only
 *
 * The postId MUST be passed as a query param for animostream entries
 * (Blogger postIds are 18 digits and lose precision when encoded in a
 * JS number).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; episode: string }> }
) {
  const { id, episode } = await params;
  const animeId = parseInt(id, 10);
  const epNum = parseInt(episode, 10);

  if (isNaN(animeId) || isNaN(epNum) || epNum < 1) {
    return NextResponse.json({ error: "Invalid id or episode" }, { status: 400 });
  }

  const title = _req.nextUrl.searchParams.get("title") || "";
  const source = _req.nextUrl.searchParams.get("source") || "";
  const season = parseInt(_req.nextUrl.searchParams.get("season") || "1", 10) || 1;

  try {
    const servers: any[] = [];

    // ── Forced source routing ──
    if (source === "blakite" || (animeId >= 3_000_000 && animeId < 4_000_000)) {
      // Blakite Hindi dub
      if (title) {
        const blakiteItem = await blakiteFindByTitle(title);
        if (blakiteItem) {
          const resolved = await blakiteResolveStreams(blakiteItem.id, epNum, season);
          for (const r of resolved) {
            servers.push({
              id: r.id,
              name: r.name,
              source: r.source,
              type: r.type,
              language: r.language,
              quality: r.quality,
              streamUrl: r.streamUrl,
              isM3U8: r.isM3U8,
              isMP4: r.isMP4,
              isEmbed: r.isEmbed,
              priority: r.priority,
            });
          }
        }
      }
    } else if (source === "desidub" || source === "desidub-selfhost" || animeId >= 4_000_000) {
      // DesiDubAnime Hindi dub
      if (title) {
        const searchResult = await desidubFindByTitle(title);
        if (searchResult) {
          const preferSelfHost = source === "desidub-selfhost";
          if (preferSelfHost) {
            const result = await desidubResolveServer4(searchResult.slug, epNum, true);
            if (result) {
              servers.push({
                id: result.id,
                name: result.name,
                source: result.source,
                serverName: result.serverName,
                isSelfHost: result.isSelfHost,
                language: result.language,
                quality: result.quality,
                streamUrl: result.streamUrl,
                isM3U8: result.isM3U8,
                isMP4: result.isMP4,
                isEmbed: result.isEmbed,
                priority: result.priority,
              });
            }
          } else {
            const results = await desidubResolveAllServers(searchResult.slug, epNum);
            for (const r of results) {
              servers.push({
                id: r.id,
                name: r.name,
                source: r.source,
                serverName: r.serverName,
                isSelfHost: r.isSelfHost,
                language: r.language,
                quality: r.quality,
                streamUrl: r.streamUrl,
                isM3U8: r.isM3U8,
                isMP4: r.isMP4,
                isEmbed: r.isEmbed,
                priority: r.priority,
              });
            }
          }
        }
      }
    }
    // ── ID-range routing ──
    else if (animeId >= 2_000_000 && animeId < 3_000_000) {
      // animostream.com range — requires postId query param
      const postId = _req.nextUrl.searchParams.get("postId");
      if (!postId) {
        return NextResponse.json({
          error: "Missing postId query param (required for animostream streams)",
          servers: [],
          total: 0,
        }, { status: 400 });
      }
      const s = _req.nextUrl.searchParams.get("season") || "s1";
      const results = await resolveAnimoStreamStreams(postId, epNum, s);

      for (const r of results) {
        servers.push({
          id: `animostream:${postId}:${r.serverName}:${r.episode}`,
          name: `AnimoStream ${r.serverName} (Hindi Dub)`,
          source: "animostream",
          provider: r.serverName.toLowerCase().replace(/\s/g, ""),
          type: "dub",
          quality: r.quality,
          streamUrl: r.streamUrl,
          isM3U8: r.isM3U8,
          isMP4: r.isMP4,
          isEmbed: r.isEmbed,
          priority: 0.9,
          subtitleTracks: r.subtitleTracks,
        });
      }
    }
    // Legacy range (< 2_000_000) — frontend falls back to /api/hindi/watch

    return NextResponse.json({
      id: animeId,
      episode: epNum,
      source: source || "auto",
      servers,
      total: servers.length,
    }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
    });
  } catch (e: any) {
    console.error(`[HindiStreams] failed for ${animeId} ep${epNum}:`, e?.message);
    return NextResponse.json({ servers: [], total: 0, error: e?.message });
  }
}
