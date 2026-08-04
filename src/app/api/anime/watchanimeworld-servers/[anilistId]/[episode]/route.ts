import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/anime/watchanimeworld-servers/[anilistId]/[episode]?title=...
 *
 * WatchAnimeWorld.top Hindi/Indian dub provider.
 *
 * Scrapes watchanimeworld.top (WordPress) to find Hindi dubbed episodes
 * and resolves the m3u8 stream URL via the Zephyrix Fire HLS Player API.
 *
 * The site has multi-audio streams (Hindi, Tamil, Telugu, etc.) with
 * a JW Player–based player that serves m3u8 HLS streams from as-cdn17.top.
 */

const ANILIST_GQL = "https://graphql.anilist.co";

/** Normalize for matching */
const norm = (t: string) => t.toLowerCase().replace(/[:',.\-!]/g, "").replace(/\s+/g, " ").trim();

/** Strip season suffix for search */
const stripSeason = (t: string) => t
  .replace(/\s*[-:]\s*(season\s*\d+|s\d+|part\s*\d+|cour\s*\d+|final\s+season)\s*$/i, "")
  .replace(/\s+(season\s*\d+|s\d{1,2}|part\s*\d+|cour\s*\d+)\s*$/i, "")
  .trim();

/** Extract season number from anime title (0 = not found) */
function extractSeasonFromTitle(title: string): number {
  if (!title) return 0;
  let m = title.match(/(\d+)(?:st|nd|rd|th)\s+season/i);
  if (m) return parseInt(m[1], 10);
  m = title.match(/season\s+(\d+)/i);
  if (m) return parseInt(m[1], 10);
  m = title.match(/\bS(\d+)\b/i);
  if (m) return parseInt(m[1], 10);
  m = title.match(/\b(II|III|IV|V(?:I{0,3})?|IX|X{1,3}I{0,3})\b(?!\w)/);
  if (m) {
    const romanMap: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
    const n = romanMap[m[1]];
    if (n && n > 1) return n;
  }
  return 0;
}

async function getTitleFromAniList(id: number): Promise<string> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 5000);
  try {
    const res = await fetch(ANILIST_GQL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `query($id:Int){Media(id:$id,type:ANIME){title{english romaji}}}`,
        variables: { id },
      }),
      signal: ac.signal,
      cache: "no-store",
    });
    if (!res.ok) return "";
    const j = await res.json();
    const t = j?.data?.Media?.title;
    return t?.english || t?.romaji || "";
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ anilistId: string; episode: string }> },
) {
  const { anilistId, episode } = await params;
  const id = parseInt(anilistId, 10);
  const epNum = parseInt(episode, 10);

  if (isNaN(id) || id <= 0 || isNaN(epNum) || epNum < 1) {
    return NextResponse.json(
      { error: "Invalid anilistId or episode", servers: [], total: 0 },
      { status: 400 },
    );
  }

  const servers: any[] = [];
  let matchedTitle = "";

  try {
    const {
      searchWatchAnimeworld,
      getWatchAnimeworldEpisodes,
      getVideoHashFromEpisode,
      resolveWatchAnimeworldStream,
    } = await import("@/lib/watchanimeworld-api");

    // Get the title — from query param or AniList
    const qTitle = req.nextUrl.searchParams.get("title") || "";
    // Resolve season: client can pass ?season=N, otherwise extract from title
    let seasonParam = parseInt(req.nextUrl.searchParams.get("season") || "0", 10);
    const title = qTitle || await getTitleFromAniList(id);
    if (seasonParam < 1 && title) {
      seasonParam = extractSeasonFromTitle(title) || 1;
    }
    if (!title) {
      return NextResponse.json({ anilistId: id, episode: epNum, matchedTitle: "", servers: [], total: 0 });
    }

    // Search for the series on WatchAnimeWorld
    const searchTitle = stripSeason(title);
    const results = await searchWatchAnimeworld(searchTitle);
    if (results.length === 0) {
      return NextResponse.json({ anilistId: id, episode: epNum, matchedTitle: "", servers: [], total: 0 });
    }

    // Find best match by normalized title
    const normSearch = norm(searchTitle);
    const best = results.find(r => norm(r.title) === normSearch)
      || results.find(r => norm(r.title).startsWith(normSearch))
      || results[0];

    matchedTitle = best.title;

    // Get episodes for this series
    const episodes = await getWatchAnimeworldEpisodes(best.slug);
    if (episodes.length === 0) {
      return NextResponse.json({ anilistId: id, episode: epNum, matchedTitle, servers: [], total: 0 });
    }

    // Find the matching episode
    const ep = episodes.find(e => e.season === seasonParam && e.episode === epNum)
      || episodes.find(e => e.episode === epNum); // fallback: any season

    if (!ep) {
      return NextResponse.json({ anilistId: id, episode: epNum, matchedTitle, servers: [], total: 0 });
    }

    // Get video hash from episode page
    const videoHash = await getVideoHashFromEpisode(ep.slug);
    if (!videoHash) {
      return NextResponse.json({ anilistId: id, episode: epNum, matchedTitle, servers: [], total: 0 });
    }

    // Resolve the m3u8 stream URL
    const stream = await resolveWatchAnimeworldStream(videoHash);
    if (!stream?.m3u8Url) {
      // If m3u8 resolution fails, still offer the zephyrix player as an iframe embed
      servers.push({
        id: `watchanimeworld:zephyrix:${videoHash}`,
        name: "AW Hindi (Embed)",
        source: "watchanimeworld",
        provider: "zephyrix",
        type: "dub",
        quality: "1080p",
        streamUrl: `https://play.zephyrix.top/video/${videoHash}`,
        isM3U8: false,
        isMP4: false,
        isEmbed: true,
        noProxy: false,
        useEmbedProxy: true,
        hardsub: false,
        subtitleTracks: [],
        intro: null,
        outro: null,
      });
    } else {
      // Got direct m3u8 — offer both embed and direct stream
      servers.push({
        id: `watchanimeworld:hls:${videoHash}`,
        name: "AW Hindi",
        source: "watchanimeworld",
        provider: "fireplayer",
        type: "dub",
        quality: "1080p",
        streamUrl: stream.m3u8Url,
        isM3U8: true,
        isMP4: false,
        isEmbed: false,
        hardsub: false,
        subtitleTracks: [],
        intro: null,
        outro: null,
      });

      // Also offer the embed as a backup
      servers.push({
        id: `watchanimeworld:zephyrix:${videoHash}`,
        name: "AW Hindi (Embed)",
        source: "watchanimeworld",
        provider: "zephyrix",
        type: "dub",
        quality: "1080p",
        streamUrl: `https://play.zephyrix.top/video/${videoHash}`,
        isM3U8: false,
        isMP4: false,
        isEmbed: true,
        noProxy: false,
        useEmbedProxy: true,
        hardsub: false,
        subtitleTracks: [],
        intro: null,
        outro: null,
      });
    }
  } catch (e: any) {
    console.error(`[WatchAnimeworld] ${id} ep${epNum}:`, e?.message || e);
  }

  return NextResponse.json(
    { anilistId: id, episode: epNum, matchedTitle, servers, total: servers.length },
    {
      headers: {
        "Cache-Control": servers.length > 0
          ? "public, s-maxage=1800, stale-while-revalidate=86400"
          : "public, s-maxage=120, stale-while-revalidate=600",
      },
    },
  );
}
