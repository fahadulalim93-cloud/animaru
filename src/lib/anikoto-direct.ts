/**
 * AniKoto Direct — full scraper for anikototv.to / megaplay.buzz
 *
 * Based on working scraper code provided by the user.
 *
 * Pipeline:
 *   1. Fetch megaplay.buzz embed page: /stream/ani/{anilistId}/{epNum}/{sub|dub}
 *   2. Extract data-id from the page HTML
 *   3. Call megaplay.buzz/stream/getSources?id={fileId} → returns m3u8 URL + subtitles + intro/outro
 *   4. Also try vidwish.live as fallback (same pattern, uses data-realid)
 *   5. Also try anikototv.to AJAX endpoints for additional servers
 *
 * The m3u8 URL is wrapped through the Worker proxy for playback.
 */

const MEGAPLAY = "https://megaplay.buzz";
const VIDWISH = "https://vidwish.live";
const ANIKOTO = "https://anikototv.to";
const ANIZIP = "https://api.ani.zip/mappings";
const JIKAN = "https://api.jikan.moe/v4";
const SPOOF_REF = "https://hianimes.re/";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Import the skip-time validator. Megaplay's API returns {start: 0, end: 0}
// when there's no data (NOT null), and occasionally returns intro/outro
// that are swapped (intro at 1270s, outro at 0s). The validator filters
// both cases so garbage data never reaches the player.
import { validateSkipTime } from "./episode-metadata";

// ── Cache ──
const CACHE_TTL = 60 * 60 * 1000;
const cacheTimestamps = new Map<string, number>();
const anikotoShowCache = new Map<number, { slug: string; showId: string } | null>();

function isCacheFresh(key: string): boolean {
  const ts = cacheTimestamps.get(key);
  if (!ts) return false;
  return Date.now() - ts < CACHE_TTL;
}

async function httpGet(url: string, referer?: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,*/*",
      "Accept-Language": "en-US,en;q=0.9",
      ...(referer ? { "Referer": referer } : {}),
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function getJSON(url: string, referer?: string): Promise<any> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept": "application/json, */*",
      "Accept-Language": "en-US,en;q=0.9",
      "X-Requested-With": "XMLHttpRequest",
      ...(referer ? { "Referer": referer } : {}),
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Types ──
export interface AniKotoServer {
  name: string;
  m3u8Url: string | null;  // Direct m3u8 URL (null if embed only)
  embedUrl: string;        // Embed URL (fallback)
  type: "sub" | "dub";
  quality: string;
  referer: string;
  subtitleTracks?: Array<{ url: string; lang: string; label: string }>;
  intro?: { start: number; end: number } | null;
  outro?: { start: number; end: number } | null;
}

export interface AniKotoResult {
  servers: AniKotoServer[];
  intro: { start: number; end: number } | null;
  outro: { start: number; end: number } | null;
}

// ── Extract m3u8 from megaplay embed page ──
async function extractMegaPlayStream(embedUrl: string, audio: string): Promise<{
  m3u8Url: string | null;
  embedUrl: string;
  subtitles: Array<{ url: string; lang: string; label: string }>;
  intro: { start: number; end: number } | null;
  outro: { start: number; end: number } | null;
} | null> {
  try {
    const html = await httpGet(embedUrl, SPOOF_REF);

    // Extract data-id from the page
    const idMatch = html.match(/data-id="([^"]*)"/);
    if (!idMatch?.[1]) return null;
    const fileId = idMatch[1];

    // Extract data-realid (for VidWish fallback)
    const realIdMatch = html.match(/data-realid="([^"]*)"/);
    const realId = realIdMatch?.[1] || null;

    // Call getSources API → returns m3u8 URL
    const data = await getJSON(
      `${MEGAPLAY}/stream/getSources?id=${fileId}&id=${fileId}`,
      `${MEGAPLAY}/`,
    );

    const m3u8Url = data?.sources?.file || null;
    const subtitles: Array<{ url: string; lang: string; label: string }> = [];
    for (const t of data?.tracks || []) {
      subtitles.push({
        url: t.file,
        lang: t.label?.toLowerCase() || "en",
        label: t.label || "English",
      });
    }

    // Validate skip times — Megaplay returns {start: 0, end: 0} when there's
    // no data, and sometimes returns intro/outro that are swapped (e.g.
    // Demon Slayer had intro at 1270s — that's the outro position).
    // The validator filters all of these so only correct data reaches the player.
    const intro = validateSkipTime(
      data?.intro ? { start: data.intro.start, end: data.intro.end } : null,
      "intro",
    );
    const outro = validateSkipTime(
      data?.outro ? { start: data.outro.start, end: data.outro.end } : null,
      "outro",
    );

    return { m3u8Url, embedUrl, subtitles, intro, outro };
  } catch (err) {
    console.error(`[anikoto-direct] extractMegaPlayStream error:`, err);
    return null;
  }
}

// ── Extract m3u8 from VidWish embed (fallback) ──
async function extractVidWishStream(realId: string, audio: string): Promise<{
  m3u8Url: string | null;
  embedUrl: string;
  subtitles: Array<{ url: string; lang: string; label: string }>;
} | null> {
  try {
    const embedUrl = `${VIDWISH}/stream/s-2/${realId}/${audio}`;
    const html = await httpGet(embedUrl, SPOOF_REF);

    const idMatch = html.match(/data-id="([^"]*)"/);
    if (!idMatch?.[1]) return null;
    const fileId = idMatch[1];

    const data = await getJSON(
      `${VIDWISH}/stream/getSources?id=${fileId}&id=${fileId}`,
      `${VIDWISH}/`,
    );

    const m3u8Url = data?.sources?.file || null;
    const subtitles: Array<{ url: string; lang: string; label: string }> = [];
    for (const t of data?.tracks || []) {
      subtitles.push({
        url: t.file,
        lang: t.label?.toLowerCase() || "en",
        label: t.label || "English",
      });
    }

    return { m3u8Url, embedUrl, subtitles };
  } catch {
    return null;
  }
}

// ── Main: resolve m3u8 for AniList ID + episode ──
export async function resolveAniKoto(
  anilistId: number,
  episodeNum: number,
  title: string,
): Promise<AniKotoResult | null> {
  try {
    const servers: AniKotoServer[] = [];
    let intro: { start: number; end: number } | null = null;
    let outro: { start: number; end: number } | null = null;

    // ── Step 1: Try Megaplay direct (fastest — uses AniList ID directly) ──
    for (const audio of ["sub", "dub"] as const) {
      const embedUrl = `${MEGAPLAY}/stream/ani/${anilistId}/${episodeNum}/${audio}`;
      const result = await extractMegaPlayStream(embedUrl, audio);

      if (result?.m3u8Url) {
        servers.push({
          name: `AniKoto ${audio === "sub" ? "Sub" : "Dub"}`,
          m3u8Url: result.m3u8Url,
          embedUrl: result.embedUrl,
          type: audio,
          quality: "1080p",
          referer: `${MEGAPLAY}/`,
          subtitleTracks: result.subtitles,
          intro: result.intro,
          outro: result.outro,
        });
        if (result.intro && !intro) intro = result.intro;
        if (result.outro && !outro) outro = result.outro;
      } else if (result) {
        // m3u8 extraction failed but we have the embed URL
        servers.push({
          name: `AniKoto ${audio === "sub" ? "Sub" : "Dub"} (Embed)`,
          m3u8Url: null,
          embedUrl: result.embedUrl,
          type: audio,
          quality: "1080p",
          referer: `${MEGAPLAY}/`,
          subtitleTracks: result.subtitles,
          intro: result.intro,
          outro: result.outro,
        });
      }
    }

    // ── Step 2: If Megaplay didn't work, try VidWish fallback ──
    if (servers.length === 0) {
      // Need to get the realId from the megaplay page first
      for (const audio of ["sub", "dub"] as const) {
        const embedUrl = `${MEGAPLAY}/stream/ani/${anilistId}/${episodeNum}/${audio}`;
        try {
          const html = await httpGet(embedUrl, SPOOF_REF);
          const realIdMatch = html.match(/data-realid="([^"]*)"/);
          if (realIdMatch?.[1]) {
            const vidwishResult = await extractVidWishStream(realIdMatch[1], audio);
            if (vidwishResult?.m3u8Url) {
              servers.push({
                name: `AniKoto VidWish ${audio === "sub" ? "Sub" : "Dub"}`,
                m3u8Url: vidwishResult.m3u8Url,
                embedUrl: vidwishResult.embedUrl,
                type: audio,
                quality: "1080p",
                referer: `${VIDWISH}/`,
                subtitleTracks: vidwishResult.subtitles,
              });
            }
          }
        } catch { /* ignore */ }
      }
    }

    // ── Step 3: If still nothing, try anikotoapi.site for embed URLs ──
    if (servers.length === 0) {
      try {
        // Search by title
        const searchRes = await fetch(
          `https://anikotoapi.site/recent-anime?q=${encodeURIComponent(title)}`,
          { headers: { "User-Agent": UA, "Accept": "application/json" }, signal: AbortSignal.timeout(10000) },
        );
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const match = (searchData?.data || []).find((a: any) => String(a.ani_id) === String(anilistId))
            || (searchData?.data || [])[0];
          if (match?.id) {
            const seriesRes = await fetch(
              `https://anikotoapi.site/series/${match.id}`,
              { headers: { "User-Agent": UA, "Accept": "application/json" }, signal: AbortSignal.timeout(10000) },
            );
            if (seriesRes.ok) {
              const seriesData = await seriesRes.json();
              const eps = seriesData?.data?.episodes || [];
              const ep = eps.find((e: any) => Number(e.number) === episodeNum);
              if (ep?.embed_url) {
                for (const audio of ["sub", "dub"] as const) {
                  const url = ep.embed_url[audio];
                  if (url) {
                    // Try to extract m3u8 from the embed URL
                    const result = await extractMegaPlayStream(url, audio);
                    servers.push({
                      name: `AniKoto ${audio === "sub" ? "Sub" : "Dub"}`,
                      m3u8Url: result?.m3u8Url || null,
                      embedUrl: url,
                      type: audio,
                      quality: "1080p",
                      referer: `${MEGAPLAY}/`,
                      subtitleTracks: result?.subtitles,
                      intro: result?.intro,
                      outro: result?.outro,
                    });
                    if (result?.intro && !intro) intro = result.intro;
                    if (result?.outro && !outro) outro = result.outro;
                  }
                }
              }
            }
          }
        }
      } catch { /* ignore */ }
    }

    if (servers.length === 0) return null;

    console.log(`[anikoto-direct] resolved ${servers.length} servers for AniList ${anilistId} ep${episodeNum} (${servers.filter(s => s.m3u8Url).length} with m3u8, ${servers.filter(s => !s.m3u8Url).length} embed-only)`);

    return { servers, intro, outro };
  } catch (err) {
    console.error(`[anikoto-direct] resolveAniKoto error:`, err);
    return null;
  }
}
