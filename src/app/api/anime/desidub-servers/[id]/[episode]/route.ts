import { NextRequest, NextResponse } from "next/server";
import {
  desidubFindByTitle,
  desidubGetAnimeInfo,
  desidubGetEpisodeServers,
  desidubResolveServer4,
  desidubResolveAllServers,
  desidubSearch,
} from "@/lib/desidubanime-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/anime/desidub-servers/[id]/[episode]?title=...&server=selfhost|all|1|2|3|4
 *
 * DesiDubAnime Hindi dub server resolver — with Server 4 (self-host) support.
 *
 * Flow:
 *   1. Use the anime title (from ?title= query param) to search DesiDubAnime
 *   2. Find the matching slug
 *   3. Fetch the episode watch page and extract multi-server sources
 *   4. Based on ?server= param:
 *      - "selfhost" → Return ONLY Server 4 (self-hosted direct video)
 *      - "all"      → Return all servers (Server 4 first, then 3, 2, 1)
 *      - "4"        → Return Server 4 only
 *      - "3"/"2"/"1" → Return that specific server
 *      - default    → Return Server 4 (self-host) if available, else best fallback
 *
 * Server 4 (self-host) is preferred because it's a direct MP4/HLS URL
 * that can be played without iframe/proxy overhead. Other servers are
 * typically embed-based (StreamTape, DoodStream, etc.) that require iframes.
 *
 * The title param is used for cross-referencing the AniList ID → DesiDubAnime slug.
 * If not found by title, returns empty servers (frontend falls back to other Hindi servers).
 */

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
  const serverParam = req.nextUrl.searchParams.get("server") || "selfhost";
  const action = req.nextUrl.searchParams.get("action") || "stream";

  try {
    switch (action) {
      // ── STREAM: Resolve servers for an episode ──
      case "stream": {
        // Step 1: Find the DesiDubAnime slug by title
        const searchResult = title ? await desidubFindByTitle(title) : null;

        if (!searchResult || !searchResult.slug) {
          return NextResponse.json({
            anilistId,
            episode: epNum,
            servers: [],
            total: 0,
            error: "Anime not found on DesiDubAnime",
          });
        }

        const slug = searchResult.slug;

        // Step 2: Resolve servers based on the ?server= param
        let servers: any[] = [];

        if (serverParam === "selfhost" || serverParam === "4") {
          // Server 4 (self-host) only — preferred for direct playback
          const result = await desidubResolveServer4(slug, epNum, true);
          if (result) {
            servers.push(formatServer(result));
          }
        } else if (serverParam === "all") {
          // All servers, Server 4 first
          const results = await desidubResolveAllServers(slug, epNum);
          servers = results.map(formatServer);
        } else if (["1", "2", "3"].includes(serverParam)) {
          // Specific server by number
          const allResults = await desidubResolveAllServers(slug, epNum);
          const target = allResults.find((r) =>
            r.serverName.toLowerCase() === `server ${serverParam}`
          );
          if (target) {
            servers.push(formatServer(target));
          }
        } else {
          // Default: prefer self-host, fall back to any available
          const selfHostResult = await desidubResolveServer4(slug, epNum, false);
          if (selfHostResult) {
            servers.push(formatServer(selfHostResult));
          }
        }

        return NextResponse.json(
          {
            anilistId,
            episode: epNum,
            desidubSlug: slug,
            desidubTitle: searchResult.title,
            serverFilter: serverParam,
            servers,
            total: servers.length,
          },
          {
            headers: {
              "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
            },
          }
        );
      }

      // ── INFO: Get anime info + episode list ──
      case "info": {
        const slug = req.nextUrl.searchParams.get("slug") || "";

        if (!slug) {
          // Try to find by title
          const result = title ? await desidubFindByTitle(title) : null;
          if (!result) {
            return NextResponse.json(
              { error: "Anime not found. Provide ?slug= or ?title=" },
              { status: 404 }
            );
          }
          const info = await desidubGetAnimeInfo(result.slug);
          return NextResponse.json({ info });
        }

        const info = await desidubGetAnimeInfo(slug);
        if (!info) {
          return NextResponse.json(
            { error: "Anime not found on DesiDubAnime" },
            { status: 404 }
          );
        }

        return NextResponse.json({ info });
      }

      // ── SERVERS: Get servers for a specific episode (lightweight) ──
      case "servers": {
        const slug = req.nextUrl.searchParams.get("slug") || "";
        if (!slug) {
          return NextResponse.json(
            { error: "Missing slug query param" },
            { status: 400 }
          );
        }

        const servers = await desidubGetEpisodeServers(slug, epNum);
        return NextResponse.json({
          slug,
          episode: epNum,
          servers: servers.map((s) => ({
            name: s.name,
            url: s.url,
            isSelfHost: s.isSelfHost,
            isM3U8: s.isM3U8,
            isMP4: s.isMP4,
            isEmbed: s.isEmbed,
            language: s.language,
          })),
          total: servers.length,
          hasSelfHost: servers.some((s) => s.isSelfHost),
        });
      }

      // ── SEARCH: Search DesiDubAnime ──
      case "search": {
        const q = req.nextUrl.searchParams.get("q") || title;
        if (!q) {
          return NextResponse.json(
            { error: "Missing search query (?q= or ?title=)", results: [] },
            { status: 400 }
          );
        }

        const results = await desidubSearch(q);
        return NextResponse.json({
          query: q,
          results: results.map((r) => ({
            id: r.id,
            title: r.title,
            slug: r.slug,
            poster: r.poster,
            type: r.type,
            status: r.status,
            language: r.language,
            genres: r.genres,
            totalEpisodes: r.totalEpisodes,
          })),
          total: results.length,
        });
      }

      default:
        return NextResponse.json(
          { error: "Invalid action. Use: stream, info, servers, search" },
          { status: 400 }
        );
    }
  } catch (e: any) {
    console.error(`[DesiDubServers] failed for ${anilistId} ep${epNum}:`, e?.message);
    return NextResponse.json({ servers: [], total: 0, error: e?.message });
  }
}

/**
 * Format a DesiDubStreamResult for the API response.
 * Handles the difference between embed servers (need iframe proxy)
 * and self-host servers (direct MP4/HLS playback).
 */
function formatServer(result: any): object {
  const isDirectStream = result.isM3U8 || result.isMP4;

  return {
    id: result.id,
    name: result.name,
    source: result.source,
    provider: result.serverName ? result.serverName.toLowerCase().replace(/\s/g, "") : result.source,
    type: "dub",
    serverName: result.serverName,
    isSelfHost: result.isSelfHost,
    language: result.language || "Hindi",
    quality: result.quality,
    streamUrl: result.streamUrl,
    isM3U8: result.isM3U8,
    isMP4: result.isMP4,
    isEmbed: result.isEmbed,
    // Self-host direct streams don't need embed proxy
    noProxy: isDirectStream,
    useEmbedProxy: !isDirectStream && result.isEmbed,
    priority: result.priority,
    hardsub: false,
    subtitleTracks: [],
    intro: null,
    outro: null,
  };
}
