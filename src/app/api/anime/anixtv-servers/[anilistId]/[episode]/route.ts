import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Season resolution removed — always use season=1. Each AniList ID already
// represents the correct season entry on AnixTV, so the season parameter
// is always 1 within that entry. Walking the prequel chain was computing
// wrong seasons (e.g. S2 anime got season=2, but AnixTV expects season=1
// for that ID). This route is now instant — no AniList calls needed.
export const maxDuration = 10;

/**
 * GET /api/anime/anixtv-servers/[anilistId]/[episode]
 *
 * AnixTV Hindi dub, standalone.
 *
 * Season resolution: ALWAYS use season=1.
 *
 * AnixTV indexes each anime season as a separate entry identified by its
 * AniList ID. When the user is watching "Mushoku Tensei Season 2"
 * (AniList ID 146065), AnixTV expects id=146065&season=1 — NOT season=2.
 * The season parameter only matters for long-running shows where all episodes
 * live under a single AniList entry (rare for dubbed content).
 *
 * The previous prequel-walk logic was computing season=2/3/4 for sequels,
 * which caused AnixTV to return the wrong season's episodes (e.g. S2 anime
 * would show S1's 24 episodes instead of S2's episodes).
 */

const ANIXTV_BASE = "https://anixtv.in";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ anilistId: string; episode: string }> },
) {
  const { anilistId, episode } = await params;
  const id = parseInt(anilistId, 10);
  const epNum = parseInt(episode, 10);

  if (isNaN(id) || id <= 0 || isNaN(epNum) || epNum < 1) {
    return NextResponse.json({ error: "Invalid anilistId or episode", servers: [], total: 0 }, { status: 400 });
  }

  const title = req.nextUrl.searchParams.get("title") || "";

  // Always season=1 — each AniList ID IS the season entry on AnixTV
  const season = 1;

  const streamUrl =
    `${ANIXTV_BASE}/anime-watch?action=hindi_1_player&id=${id}` +
    `&season=${season}&episode=${epNum}&title=${encodeURIComponent(title)}`;

  return NextResponse.json(
    {
      anilistId: id,
      episode: epNum,
      season,
      seasonSource: "always-1",
      servers: [
        {
          id: `anixtv:hindi_1:s${season}:dub`,
          name: "AnixTV Hindi",
          source: "anixtv",
          provider: "hindi_1",
          type: "dub",
          quality: "1080p",
          streamUrl,
          isM3U8: false,
          isMP4: false,
          isEmbed: true,
          // Route through /api/embed/proxy — it strips sandbox detection,
          // injects anti-sandbox overrides, and for CF-protected sites like
          // anixtv.in, internally routes through the CF Worker to bypass
          // bot protection. This matches the reference Vercel app (luffytv2).
          noProxy: false,
          useEmbedProxy: true,
          hardsub: false,
          subtitleTracks: [],
          intro: null,
          outro: null,
        },
      ],
      total: 1,
    },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
