/**
 * AnixTV API Client
 * -----------------
 * AnixTV (https://anixtv.in / https://anixx.fun — same site, both redirect to anixtv.in)
 * is a Hindi dubbed anime streaming portal. It uses the AniList ID system for anime
 * lookup and serves multi-audio HLS streams via the as-cdn21.top CDN.
 *
 * API flow:
 *   1. Watch page: GET https://anixtv.in/anime-watch?action=hindi_{N}_player&id={anilistId}&season={s}&episode={e}&title={title}
 *      → returns HTML with an <iframe src="https://as-cdn21.top/video/{videoId}"> tag
 *      (the action param "hindi_1_player" / "hindi_2_player" etc. selects different Hindi dub providers)
 *
 *   2. Video page: GET https://as-cdn21.top/video/{videoId}
 *      → sets a fireplayer_player cookie + returns HTML with the player shell
 *
 *   3. Get stream URL: POST https://as-cdn21.top/player/index.php?data={videoId}&do=getVideo
 *      with form body: hash={videoId}&r={watch_page_url}
 *      → returns JSON: { hls: true, videoSource: "https://as-cdn21.top/cdn/hls/{hash}/master.m3u8?md5=...&expires=...", ... }
 *
 *   4. The videoSource URL is a standard HLS master playlist — can be played directly
 *      with hls.js. Segments are JPG-wrapped TS files on as-cdn22.top / as-cdn23.top /
 *      as-cdn24.top / as-cdn25.top (round-robin). CORS headers are permissive.
 *
 * Languages: Hindi, Tamil, Telugu, Bengali, Malayalam, Marathi, Kannada, English, Korean, Japanese
 * (audio track selection happens inside the player via #EXT-X-MEDIA audio groups)
 *
 * NO decryption needed — videoSource is returned as plain text in the JSON response.
 */

const ANIXTV_BASE = "https://anixtv.in";
const ANIXTV_ALT = "https://anixx.fun"; // backup domain
const ASCDN_BASE = "https://as-cdn21.top";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

export interface AnixTVServer {
  id: string;
  name: string;
  source: "anixtv";
  provider: string;
  type: "sub" | "dub";
  quality: string;
  streamUrl: string;
  isM3U8: boolean;
  isMP4: boolean;
  hardsub: boolean;
  subtitleTracks: Array<{ url: string; lang: string; label: string }>;
  intro: { start: number; end: number } | null;
  outro: { start: number; end: number } | null;
}

export interface AnixTVFetchResult {
  servers: AnixTVServer[];
  videoId: string | null;
  title: string;
}

/**
 * Step 1: Fetch the watch page HTML to extract the iframe videoId.
 *
 * @param anilistId  AniList anime ID (e.g. 147105 for Witch Hat Atelier)
 * @param episode    Episode number (1-indexed)
 * @param season     Season number (default 1)
 * @param title      Anime title (for the URL param — AniList english title works)
 * @param providerNum Hindi provider number (1 = default hindi dub, 2/3 = alternate providers if available)
 */
export async function anixtvGetVideoId(
  anilistId: number,
  episode: number,
  season: number = 1,
  title: string = "Anime",
  providerNum: number = 1
): Promise<string | null> {
  const watchUrl = `${ANIXTV_BASE}/anime-watch?action=hindi_${providerNum}_player&id=${anilistId}&season=${season}&episode=${episode}&title=${encodeURIComponent(title)}`;
  const watchUrlAlt = `${ANIXTV_ALT}/anime-watch?action=hindi_${providerNum}_player&id=${anilistId}&season=${season}&episode=${episode}&title=${encodeURIComponent(title)}`;

  try {
    // Route through our Cloudflare Worker — anixtv.in is Cloudflare-protected
    // and blocks direct fetch from Vercel IPs (returns CF challenge page).
    // The worker runs on Cloudflare's network → bypasses the challenge.
    // BUG FIX: was using /proxy/raw?url= but the worker only has /proxy?url=
    const WORKER_BASE = process.env.NEXT_PUBLIC_PROXY_BASE || "https://luffytv-proxy.ggy892767.workers.dev";

    // Try anixtv.in first, then anixx.fun as fallback
    for (const url of [watchUrl, watchUrlAlt]) {
      try {
        const fetchUrl = `${WORKER_BASE}/proxy?url=${encodeURIComponent(url)}&ref=${encodeURIComponent(ANIXTV_BASE + "/")}`;
        const res = await fetch(fetchUrl, {
          headers: {
            "User-Agent": UA,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
          },
          cache: "no-store",
        });
        if (!res.ok) continue;
        const html = await res.text();

        // Extract iframe src="https://as-cdn21.top/video/{videoId}"
        const m = html.match(/<iframe[^>]+src=["']https?:\/\/as-cdn\d+\.top\/video\/([a-f0-9]+)/i);
        if (m) {
          return m[1];
        }
      } catch { /* try next domain */ }
    }

    console.error(`[AnixTV] no iframe found on any domain (tried anixtv.in + anixx.fun)`);
    return null;
  } catch (err) {
    console.error("[AnixTV] Failed to fetch videoId:", err);
    return null;
  }
}

/**
 * Step 2 + 3: Visit /video/{videoId} to establish session cookie,
 *             then POST to /player/index.php?do=getVideo to get the m3u8 URL.
 */
export async function anixtvResolveStream(
  videoId: string,
  referrerWatchUrl: string
): Promise<{ streamUrl: string; securedLink: string; raw: any } | null> {
  const videoPageUrl = `${ASCDN_BASE}/video/${videoId}`;

  try {
    // Step 2: visit /video/{videoId} to get the fireplayer_player cookie
    // (server uses this cookie to validate the subsequent getVideo POST)
    const videoPageRes = await fetch(videoPageUrl, {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": referrerWatchUrl,
      },
      cache: "no-store",
    });

    // Extract set-cookie (fireplayer_player=...) from response headers
    // fetch() in Next.js/edge auto-handles cookies per-request, so we
    // capture the cookie value to pass it explicitly in the POST.
    const setCookie = videoPageRes.headers.get("set-cookie") || "";
    const cookieMatch = setCookie.match(/fireplayer_player=([^;]+)/);
    const cookie = cookieMatch ? `fireplayer_player=${cookieMatch[1]}` : "";

    // Step 3: POST to /player/index.php?data={videoId}&do=getVideo
    //   body: hash={videoId}&r={watchUrl}
    //   (the `r` parameter is checked by the server — must be a valid anixtv.in URL)
    //
    // KEY: must include `Origin: https://as-cdn21.top` header — without it the
    // server returns HTML instead of JSON (CORS preflight/bot check).
    const postUrl = `${ASCDN_BASE}/player/index.php?data=${videoId}&do=getVideo`;
    const postRes = await fetch(postUrl, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.9",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": videoPageUrl,
        "Origin": ASCDN_BASE,
        ...(cookie ? { "Cookie": cookie } : {}),
      },
      body: new URLSearchParams({
        hash: videoId,
        r: referrerWatchUrl,
      }).toString(),
      cache: "no-store",
    });

    if (!postRes.ok) {
      console.error("[AnixTV] getVideo POST failed:", postRes.status);
      return null;
    }

    // Response can be HTML if the server rejected us (cookie missing/expired)
    const contentType = postRes.headers.get("content-type") || "";
    if (!contentType.includes("json")) {
      console.error("[AnixTV] getVideo returned non-JSON (likely bot detection):", contentType);
      return null;
    }

    const data = await postRes.json();
    if (!data?.videoSource && !data?.securedLink) {
      console.error("[AnixTV] getVideo response missing videoSource:", JSON.stringify(data).slice(0, 200));
      return null;
    }

    return {
      streamUrl: data.videoSource || data.securedLink,
      securedLink: data.securedLink || data.videoSource,
      raw: data,
    };
  } catch (err) {
    console.error("[AnixTV] Failed to resolve stream:", err);
    return null;
  }
}

/**
 * Full flow: AniList ID → videoId → m3u8 URL
 *
 * @param anilistId  AniList anime ID
 * @param episode    Episode number (1-indexed)
 * @param title      Anime title (for the URL param)
 * @param season     Season number (default 1)
 * @param providerNum Hindi provider number (1-5; some animes have multiple Hindi dubs)
 */
export async function anixtvFetchStream(
  anilistId: number,
  episode: number,
  title: string = "Anime",
  season: number = 1,
  providerNum: number = 1
): Promise<AnixTVServer | null> {
  // Step 1: get videoId from watch page
  const videoId = await anixtvGetVideoId(anilistId, episode, season, title, providerNum);
  if (!videoId) return null;

  // Build the watch URL (used as `r` referrer in the POST)
  const referrerWatchUrl = `${ANIXTV_BASE}/anime-watch?action=hindi_${providerNum}_player&id=${anilistId}&season=${season}&episode=${episode}&title=${encodeURIComponent(title)}`;

  // Step 2+3: resolve videoId → m3u8 URL
  const resolved = await anixtvResolveStream(videoId, referrerWatchUrl);
  if (!resolved) return null;

  const serverName = providerNum === 1 ? "AnixTV Hindi" : `AnixTV Hindi ${providerNum}`;
  return {
    id: `anixtv:hindi_${providerNum}:dub`,
    name: serverName,
    source: "anixtv",
    provider: `hindi_${providerNum}`,
    type: "dub",  // Hindi dub
    quality: "1080p",
    streamUrl: resolved.streamUrl,
    isM3U8: true,
    isMP4: false,
    hardsub: false,  // soft sub (multi-audio with selectable tracks)
    subtitleTracks: [],
    intro: null,
    outro: null,
  };
}

/**
 * Fetch all available AnixTV servers for an episode.
 * Tries providers 1-5 in parallel (most animes only have provider 1).
 */
export async function anixtvFetchAllServers(
  anilistId: number,
  episode: number,
  title: string = "Anime",
  season: number = 1
): Promise<AnixTVServer[]> {
  // Try providers 1-5 in parallel; ignore nulls (provider doesn't exist for this anime)
  const jobs = await Promise.allSettled(
    [1, 2, 3, 4, 5].map(n => anixtvFetchStream(anilistId, episode, title, season, n))
  );
  const servers: AnixTVServer[] = [];
  for (const r of jobs) {
    if (r.status === "fulfilled" && r.value) servers.push(r.value);
  }
  return servers;
}
