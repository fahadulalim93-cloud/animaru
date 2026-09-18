import { NextRequest, NextResponse } from "next/server";
import {
  blakiteFindByTitle,
  blakiteBuildStreamUrl,
  blakiteGetItem,
  blakiteSearchHindi,
  blakiteResolveStreams,
} from "@/lib/blakite-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/anime/blakite-servers/[id]/[episode]?title=...&season=1
 *
 * Blakite Hindi dub server resolver.
 *
 * Flow:
 *   1. Use the anime title (from ?title= query param) to search the Blakite catalog
 *   2. Find the matching Blakite uniqueId
 *   3. Build the streaming embed URL from uniqueId + type + season + episode
 *   4. Return as an embed/iframe server
 *
 * The Blakite streaming page is an iframe embed at blakiteanime.buzz
 * that loads video via their CDN. No direct m3u8/mp4 extraction needed —
 * the iframe handles playback internally.
 *
 * If the title is not provided or not found, falls back to trying
 * the AniList ID as a direct lookup (some Blakite IDs may overlap).
 */

const BLAKITE_STREAM_BASE = "https://www.blakiteanime.buzz";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; episode: string }> }
) {
  const { id, episode } = await params;
  const anilistId = parseInt(id, 10);
  const epNum = parseInt(episode, 10);

  if (isNaN(anilistId) || anilistId <= 0 || isNaN(epNum) || epNum < 1) {
    return NextResponse.json(
      { error: "Invalid id or episode", servers: [], total: 0 },
      { status: 400 }
    );
  }

  const title = req.nextUrl.searchParams.get("title") || "";
  const season = parseInt(req.nextUrl.searchParams.get("season") || "1", 10) || 1;
  const action = req.nextUrl.searchParams.get("action") || "stream";

  try {
    switch (action) {
      // ── STREAM: Resolve embed URL for an episode ──
      case "stream": {
        // Step 1: Find the Blakite uniqueId by title
        let blakiteItem = title ? await blakiteFindByTitle(title) : null;

        if (!blakiteItem) {
          // Try a broader search
          const results = title ? await blakiteSearchHindi(title) : [];
          if (results.length > 0) {
            blakiteItem = results[0]; // best partial match
          }
        }

        if (!blakiteItem) {
          return NextResponse.json({
            anilistId,
            episode: epNum,
            season,
            servers: [],
            total: 0,
            error: "Anime not found in Blakite catalog",
          });
        }

        // Step 2: Build streaming URL
        const streamUrl = blakiteBuildStreamUrl(
          blakiteItem.id,
          blakiteItem.type,
          epNum,
          season
        );

        // Step 3: Resolve streams (returns embed URLs)
        const resolvedServers = await blakiteResolveStreams(
          blakiteItem.id,
          epNum,
          season
        );

        const servers = resolvedServers.length > 0
          ? resolvedServers.map((s) => ({
              id: s.id,
              name: s.name,
              source: s.source,
              provider: "blakite",
              type: "dub" as const,
              language: s.language,
              quality: s.quality,
              streamUrl: s.streamUrl,
              isM3U8: s.isM3U8,
              isMP4: s.isMP4,
              isEmbed: s.isEmbed,
              noProxy: false,
              useEmbedProxy: true,
              priority: s.priority,
              hardsub: false,
              subtitleTracks: [],
              intro: null,
              outro: null,
            }))
          : [
              {
                id: `blakite:${blakiteItem.id}:embed`,
                name: `Blakite ${blakiteItem.type === "movie" ? "Movie" : "Hindi Dub"}`,
                source: "blakite",
                provider: "blakite",
                type: "dub" as const,
                language: blakiteItem.language,
                quality: "1080p",
                streamUrl,
                isM3U8: false,
                isMP4: false,
                isEmbed: true,
                noProxy: false,
                useEmbedProxy: true,
                priority: 1.0,
                hardsub: false,
                subtitleTracks: [],
                intro: null,
                outro: null,
              },
            ];

        return NextResponse.json(
          {
            anilistId,
            episode: epNum,
            season,
            blakiteId: blakiteItem.id,
            blakiteTitle: blakiteItem.title,
            servers,
            total: servers.length,
          },
          {
            headers: {
              "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
            },
          }
        );
      }

      // ── SEARCH: Search Blakite Hindi catalog ──
      case "search": {
        const q = req.nextUrl.searchParams.get("q") || title;
        if (!q) {
          return NextResponse.json(
            { error: "Missing search query (?q= or ?title=)", results: [] },
            { status: 400 }
          );
        }

        const results = await blakiteSearchHindi(q);
        return NextResponse.json({
          query: q,
          results: results.map((r) => ({
            id: r.id,
            title: r.title,
            language: r.language,
            type: r.type,
            status: r.status,
            poster: r.poster,
            genres: r.genres,
            totalSeasons: r.seasons ? Object.keys(r.seasons).length : 0,
          })),
          total: results.length,
        });
      }

      // ── INFO: Get info for a specific Blakite item ──
      case "info": {
        const blakiteId = req.nextUrl.searchParams.get("blakiteId") || "";
        if (!blakiteId) {
          return NextResponse.json(
            { error: "Missing blakiteId query param" },
            { status: 400 }
          );
        }

        const item = await blakiteGetItem(blakiteId);
        if (!item) {
          return NextResponse.json(
            { error: "Item not found in Blakite catalog" },
            { status: 404 }
          );
        }

        return NextResponse.json({ item });
      }

      default:
        return NextResponse.json(
          { error: "Invalid action. Use: stream, search, info" },
          { status: 400 }
        );
    }
  } catch (e: any) {
    console.error(`[BlakiteServers] failed for ${anilistId} ep${epNum}:`, e?.message);
    return NextResponse.json({ servers: [], total: 0, error: e?.message });
  }
}
