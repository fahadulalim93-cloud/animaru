import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/anime/animostream-hindi/[anilistId]/[episode]?title=...
 *
 * AnimoStream Hindi dub (Abyss + StreamTape), standalone.
 *
 * The Hindi fallback used to live inside /api/anime/servers alongside 16 other
 * scrapers. That route measured 26-105s against its 60s maxDuration, so it was
 * killed on Vercel and AnimoStream never reached the player even for the ~250
 * titles it does carry. Same treatment as anixtv-servers: its own route, its
 * own budget, fetched in parallel by the client.
 *
 * Title matching mirrors the original logic — animostream indexes by series,
 * not by season, so "Slime S4" has to be searched as "Slime".
 */

const ANILIST_GQL = "https://graphql.anilist.co";

/** Different story, not just a later season — never an acceptable match. */
const SPINOFF_KEYWORDS = [
  "infinity castle", "mugen train", "the movie", "movie:", "ova",
  "special", "spinoff", "vigilantes", "junji", "side story",
];

const normTitle = (t: string) =>
  t.toLowerCase().replace(/[:',.\-!]/g, "").replace(/\s+/g, " ").trim();

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

/** Strip "Season N" / "S2" / "Part 2" / "Final Season" so a sequel query still
 *  finds the single series entry animostream actually stores. */
const stripSeasonSuffix = (t: string) => t
  .replace(/\s*[-:]\s*(season\s*\d+|s\d+|part\s*\d+|cour\s*\d+|final\s+season|the\s+final|final\s+part)\s*$/i, "")
  .replace(/\s+(season\s*\d+|s\d{1,2}|part\s*\d+|cour\s*\d+)\s*$/i, "")
  .trim();

async function titlesFromAniList(id: number): Promise<string[]> {
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
    if (!res.ok) return [];
    const j = await res.json();
    const t = j?.data?.Media?.title;
    return [t?.english, t?.romaji].filter(Boolean) as string[];
  } catch {
    return [];
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
    return NextResponse.json({ error: "Invalid anilistId or episode", servers: [], total: 0 }, { status: 400 });
  }

  const servers: any[] = [];
  let matchedTitle = "";

  try {
    const { searchAnimoStream, resolveAnimoStreamStreams } = await import("@/lib/animostream-direct");

    const qTitle = req.nextUrl.searchParams.get("title") || "";
    const titlesToTry = [qTitle, ...(qTitle ? [] : await titlesFromAniList(id))].filter(Boolean);
    // Even when the client supplied a title, keep AniList's as a backup —
    // english/romaji naming differs from animostream's often enough to matter.
    if (qTitle) titlesToTry.push(...(await titlesFromAniList(id)));

    let best: any = null;

    for (const t of titlesToTry) {
      for (const candidate of [t, stripSeasonSuffix(t)]) {
        const matches = await searchAnimoStream(candidate);
        if (matches.length === 0) continue;
        const norm = normTitle(candidate);
        best = matches.find((m: any) => normTitle(m.title) === norm)
          || matches.find((m: any) => {
            const mt = normTitle(m.title);
            if (!mt.startsWith(norm)) return false;
            const extra = mt.slice(norm.length).trim();
            if (!extra) return true;
            return !SPINOFF_KEYWORDS.some(k => extra.includes(k));
          });
        if (best) { matchedTitle = candidate; break; }
      }
      if (best) break;
    }

    if (best) {
      // Resolve season: client can pass ?season=sN, otherwise extract from title
      const seasonParam = req.nextUrl.searchParams.get("season") || "";
      const season = seasonParam || (() => {
        const sn = extractSeasonFromTitle(qTitle) || extractSeasonFromTitle(best.title);
        return sn > 1 ? `s${sn}` : "s1";
      })();
      const results = await resolveAnimoStreamStreams(best.postId, epNum, season);
      for (const r of results) {
        servers.push({
          id: `animostream:${best.postId}:${r.serverName}:${r.episode}`,
          name: `AnimoStream ${r.serverName} (Hindi Dub)`,
          source: "animostream",
          provider: String(r.serverName).toLowerCase().replace(/\s/g, ""),
          type: "dub",
          quality: r.quality,
          streamUrl: r.streamUrl,
          isM3U8: r.isM3U8,
          isMP4: r.isMP4,
          isEmbed: r.isEmbed,
          hardsub: false,
          subtitleTracks: r.subtitleTracks || [],
          intro: null,
          outro: null,
        });
      }
    }
  } catch (e: any) {
    console.error(`[AnimoStreamHindi] ${id} ep${epNum}:`, e?.message || e);
  }

  return NextResponse.json(
    { anilistId: id, episode: epNum, matchedTitle, servers, total: servers.length },
    // Short cache on empty so a title that gets added upstream isn't pinned as
    // missing for an hour; long cache once we actually have streams.
    {
      headers: {
        "Cache-Control": servers.length > 0
          ? "public, s-maxage=1800, stale-while-revalidate=86400"
          : "public, s-maxage=120, stale-while-revalidate=600",
      },
    },
  );
}
