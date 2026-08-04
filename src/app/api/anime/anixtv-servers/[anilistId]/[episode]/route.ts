import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Worst case measured ~13s (deep relation walk + clamp probes, e.g. Attack on
// Titan: The Final Season). Headroom so that path can't be killed mid-flight;
// the response caches for an hour, so only the first hit ever pays it.
export const maxDuration = 30;

/**
 * GET /api/anime/anixtv-servers/[anilistId]/[episode]
 *
 * AnixTV Hindi dub, standalone.
 *
 * This used to live inside /api/anime/servers, which fans out to 17 scrapers
 * and measured 26-105s end to end — well past that route's 60s maxDuration, so
 * on Vercel it was killed and Hindi never reached the player (sub/dub survived
 * because they arrive from instant-servers/animex-servers on their own fetches).
 * Building this URL needs no scraping at all, so it has no business waiting
 * behind them.
 *
 * The AnixTV page is a plain iframe host. It used to allow framing directly,
 * but recently started blocking iframe embedding (X-Frame-Options / CSP).
 * Routing through the Cloudflare Worker proxy bypasses this — it fetches the
 * page server-side and serves it with permissive frame headers.
 */

const ANIXTV_BASE = "https://anixtv.in";
const ANILIST_GQL = "https://graphql.anilist.co";

/** Formats that represent an actual numbered season. AniList exposes specials,
 *  OVAs, ONAs and movies as PREQUEL relations too — counting those is what made
 *  One Piece resolve to "season 2" (its prequel is the MONSTERS ONA) and
 *  Attack on Titan S1 resolve to "season 2" (a Gaiden OVA). AnixTV indexes by
 *  broadcast season, so only TV entries may increment the counter. */
const SEASON_FORMATS = new Set(["TV", "TV_SHORT"]);

const MEDIA_QUERY = `
  query($id: Int) {
    Media(id: $id, type: ANIME) {
      id
      format
      title { romaji english }
      relations {
        edges {
          relationType
          node { id format type title { english romaji } }
        }
      }
    }
  }
`;

type Media = {
  id: number;
  format: string | null;
  title: { romaji?: string | null; english?: string | null };
  relations?: { edges?: Array<{ relationType: string; node: { id: number; format: string | null; type: string; title?: { english?: string | null; romaji?: string | null } } }> };
};

/** "Season 3 Part 2" is the same broadcast season as "Season 3". AniList lists
 *  them as separate TV entries, so counting both inflated the ordinal — Attack
 *  on Titan: The Final Season walked to 5 and had to be clamped back to 4. */
function isPartSplit(t?: { english?: string | null; romaji?: string | null }): boolean {
  const s = `${t?.english || ""} ${t?.romaji || ""}`;
  return /\b(part|cour)\s*\d+\b/i.test(s);
}

/** The season walk is inherently sequential (each hop needs the previous node's
 *  relations), so one slow AniList response set the cost of the whole request —
 *  deep sequels measured 11-13s. Each call is capped to bound the walk.
 *
 *  The root call gets more room than the hops on purpose: losing it costs the
 *  title AND the relations, which drops the request to a bare season-1 guess.
 *  A hop timing out only costs one season of depth. */
const ROOT_TIMEOUT = 6000;
const HOP_TIMEOUT = 3500;

async function fetchMedia(id: number, outerSignal: AbortSignal, timeoutMs = HOP_TIMEOUT): Promise<Media | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  const onAbort = () => ac.abort();
  outerSignal.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetch(ANILIST_GQL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query: MEDIA_QUERY, variables: { id } }),
      signal: ac.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data?.Media ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    outerSignal.removeEventListener("abort", onAbort);
  }
}

/** The TV prequel immediately preceding this entry, plus whether that prequel is
 *  merely an earlier part of the SAME season (so the caller hops without
 *  incrementing). Null when this entry starts a series. */
function tvPrequelOf(media: Media | null): { id: number; samSeason: boolean } | null {
  const edges = media?.relations?.edges || [];
  for (const e of edges) {
    if (e.relationType !== "PREQUEL") continue;
    if (e.node?.type !== "ANIME") continue;
    if (!SEASON_FORMATS.has(e.node?.format || "")) continue;
    return { id: e.node.id, samSeason: isPartSplit(e.node.title) };
  }
  return null;
}

const ORDINALS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };

/** Season number stated in the title, if any. This beats the relation walk
 *  whenever it fires: AniList entries get deleted (Attack on Titan S2, id
 *  25777, is now "Not Found"), which silently truncates the prequel chain.
 *  Note "Part N" is deliberately NOT treated as a season — AniList splits
 *  single seasons into parts (e.g. "Season 3 Part 2"). */
function seasonFromTitle(...titles: Array<string | null | undefined>): number | null {
  for (const t of titles) {
    if (!t) continue;
    const m = t.match(/\bSeason\s+(\d{1,2})\b/i)              // "Season 3"
      || t.match(/\b(\d{1,2})(?:st|nd|rd|th)\s+Season\b/i)     // "2nd Season"
      || t.match(/\bS(\d{1,2})\b\s*$/i);                       // trailing "S2"
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 1 && n <= 30) return n;
    }
    const word = t.match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+Season\b/i);
    if (word) return ORDINALS[word[1].toLowerCase()];
  }
  return null;
}

/** Does AnixTV actually serve this season? Its player page returns an iframe
 *  when the season exists and an empty shell when it doesn't, so this is the
 *  only way to know the link we hand the player is live.
 *
 *  Returns null for "couldn't check" (timeout/network), which callers MUST NOT
 *  treat as absent — doing so clamped correct seasons down to 1 whenever the
 *  probe was slow. Gets its own budget rather than sharing the AniList
 *  deadline, which the relation walk has usually already spent. */
async function anixtvHasSeason(id: number, season: number, episode: number, title: string): Promise<boolean | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 4500);
  try {
    const url = `${ANIXTV_BASE}/anime-watch?action=hindi_1_player&id=${id}&season=${season}&episode=${episode}&title=${encodeURIComponent(title)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Referer: `${ANIXTV_BASE}/`,
      },
      signal: ac.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    return /<iframe[^>]+src=["']https?:\/\//i.test(await res.text());
  } catch {
    return null;
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

  // Hard ceiling on the whole season walk so a slow/ratelimited AniList can
  // never make this route the bottleneck it was created to escape.
  // Overall ceiling on the AniList work. Sized to fit a root call plus a few
  // hops; typical requests finish in 1-3s and the response caches for an hour,
  // so only the first hit on a deep sequel approaches this.
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 14000);

  let season = 1;
  let title = req.nextUrl.searchParams.get("title") || "";

  let seasonSource = "default";

  try {
    // Strategy 0 — the client passes the title it already resolved, and a
    // title like "Jujutsu Kaisen 2nd Season" states the season outright. When
    // it does, this request needs ZERO network calls: AniList measured 0.9-4.4s
    // per call with heavy variance, and it was the entire cost of this route.
    const titledFromClient = seasonFromTitle(title);
    if (titledFromClient) {
      season = titledFromClient;
      seasonSource = "title";
    }

    const root = seasonSource === "title" && title
      ? null                                    // nothing left to look up
      : await fetchMedia(id, controller.signal, ROOT_TIMEOUT);

    if (root) {
      if (!title) title = root.title?.english || root.title?.romaji || "";

      // Strategy 1 — same check against AniList's canonical titles, which are
      // often more explicit than whatever the client had.
      const titled = seasonFromTitle(root.title?.english, root.title?.romaji, title);
      if (titled) {
        season = titled;
        seasonSource = "title";
      } else {
        // Strategy 2 — walk backwards through TV prequels; each hop is one
        // earlier season. Capped at 12 so a cyclic relation graph terminates.
        const seen = new Set<number>([id]);
        let cursor = tvPrequelOf(root);
        let hops = 0;
        while (cursor && hops < 12 && !seen.has(cursor.id)) {
          seen.add(cursor.id);
          hops++;
          // A "Part N" prequel is the same season continued, so traverse it
          // without counting it as an earlier season.
          if (!cursor.samSeason) season++;
          const prev = await fetchMedia(cursor.id, controller.signal);
          if (!prev) break;
          cursor = tvPrequelOf(prev);
        }
        if (season > 1) seasonSource = "relations";
      }
    }

    // Strategy 3 — verify against AnixTV, but ONLY when the season came from
    // the relation walk. A season stated in the title is authoritative and
    // needs no confirmation, so skipping the probe there is both faster and
    // safer: probing in parallel made AnixTV return empty bodies under
    // concurrent load, and those false negatives clamped a correct "Jujutsu
    // Kaisen 2nd Season" down to season 1.
    //
    // Sequential and capped at 3 rungs — an off-by-one from a truncated
    // relation chain is the realistic error, not an off-by-five.
    // Only an explicit `false` clamps; null means the probe couldn't reach
    // AnixTV, and the computed season beats blindly resetting.
    if (season > 1 && seasonSource === "relations") {
      if ((await anixtvHasSeason(id, season, epNum, title)) === false) {
        const floor = Math.max(1, season - 3);
        for (let probe = season - 1; probe >= floor; probe--) {
          if ((await anixtvHasSeason(id, probe, epNum, title)) === true) {
            season = probe;
            seasonSource += "+clamped";
            break;
          }
        }
      }
    }
  } catch {
    // Any failure leaves season at its last good value — a wrong season is
    // still better than dropping the Hindi option entirely.
  } finally {
    clearTimeout(deadline);
  }

  const streamUrl =
    `${ANIXTV_BASE}/anime-watch?action=hindi_1_player&id=${id}` +
    `&season=${season}&episode=${epNum}&title=${encodeURIComponent(title)}`;

  return NextResponse.json(
    {
      anilistId: id,
      episode: epNum,
      season,
      seasonSource,
      servers: [
        {
          id: `anixtv:hindi_1:s${season}:dub`,
          name: `AnixTV Hindi${season > 1 ? ` (S${season})` : ""}`,
          source: "anixtv",
          provider: "hindi_1",
          type: "dub",
          quality: "1080p",
          streamUrl,
          isM3U8: false,
          isMP4: false,
          isEmbed: true,
          // Route through Cloudflare Worker proxy — anixtv.in now blocks
          // direct iframe embedding. The worker fetches the page and serves
          // it with X-Frame-Options: ALLOWALL so our iframe can load it.
          noProxy: false,
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
