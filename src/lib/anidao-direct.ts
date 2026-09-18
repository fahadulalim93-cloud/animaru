/**
 * AniDao.to scraper — returns streams WITH subtitles + sub/dub
 *
 * AniDao is a clone of AniNeko.to with the same HTML structure but a
 * different domain. Same vivibebe.site / otakuhg.site / otakuvid.online /
 * playmogo.com embed CDNs, same cdn.anizara.store subtitle CDN.
 *
 * Differences from AniNeko.to:
 *   - Domain: anidao.to (vs anineko.to)
 *   - Episode URL: /watch-online/{slug}-episode-{N} (vs /watch/{slug}/ep-{N})
 *   - Anime page: /anime/{slug} (same as AniNeko)
 *   - Search: /search.html?keyword={kw} (AniNeko uses /browser?keyword=)
 *     BUT /search.html is Cloudflare-protected (returns 403 challenge).
 *     Workaround: scrape the /anime/{slug} page directly — it contains
 *     ALL episode URLs as /watch-online/{slug}-episode-{N} links.
 *     CF CHALLENGE BYPASS: all HTTP requests now go through curlFetch
 *     (curl subprocess) which solves the JS challenge automatically.
 *
 * Server HTML structure (per episode page):
 *   <button class="an-server-tab" data-an-tab="sub">   → Sub tab
 *   <button class="an-server-tab" data-an-tab="dub">   → Dub tab
 *   <button class="an-server-tab" data-an-tab="hsub"> → Hard Sub tab
 *
 *   Each server is a <button class="an-server-btn" data-an-server-btn="{type}-{N}"
 *                                          data-an-video="{url}">
 *
 * Subtitle URLs are in the data-an-video attribute as query params:
 *   - vivibebe.site: ?sub={subtitleUrl}
 *   - otakuhg.site:  ?caption_1={subtitleUrl}&sub_1=English
 *   - otakuvid.online: ?caption_1={subtitleUrl}&sub_1=English
 *   - playmogo.com: ?c1_file={subtitleUrl}&c1_label=English
 *
 * Subtitle CDN: cdn.anizara.store (returns 200, .vtt files — same as AniNeko)
 *
 * Embed CDNs (all iframe-able, same as AniNeko):
 *   - vivibebe.site/{hash}             → HD-1 (m3u8 extractable)
 *   - otakuhg.site/e/{id}              → StreamHG (obfuscated — skipped)
 *   - otakuvid.online/embed/{id}       → Earnvids (obfuscated — skipped)
 *   - playmogo.com/e/{id}              → Doodstream (obfuscated — skipped)
 */

import { curlFetch } from "./curl-fetch";

const ANIDAO_BASE = "https://anidao.to";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100100 Firefox/121.0";

export interface AnidaoStreamResult {
  provider: "anidao";
  type: "sub" | "dub";
  quality: string;
  streamUrl: string; // direct m3u8 URL
  isM3U8: boolean;
  isMP4: boolean;
  isEmbed: boolean;
  hardsub: boolean;
  serverName: string;
  subtitleTracks: Array<{ url: string; lang: string; label: string }>;
}

async function anidaoFetch(url: string): Promise<string | null> {
  // ── Strategy: try curl first, fall back to flaresolverr for CF challenges ──
  //
  // AniDao.to is behind Cloudflare's "Just a moment..." JS challenge.
  // curlFetch (curl subprocess) sometimes gets through, sometimes doesn't —
  // depends on CF's current mood. When it fails, flaresolverr (running on
  // the VPS at port 8191) solves the JS challenge and returns the real HTML.
  //
  // flaresolverr is accessible from the container via:
  //   - http://10.0.1.1:8191/ (Coolify network gateway)
  //   - http://169.58.120.196:8191/ (VPS public IP)

  // Step 1: try curlFetch first (fast — 0.3-0.8s when it works)
  try {
    const res = await curlFetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      timeoutMs: 12000,
    });
    if (res.ok) {
      const text = await res.text();
      // Detect CF challenge page — small HTML with "Just a moment"
      if (text.length > 8000 || !/Just a moment/i.test(text)) {
        return text;
      }
      // Got CF challenge — fall through to flaresolverr
      console.log(`[anidao] curl got CF challenge (${text.length}b) for ${url.substring(0, 80)}... — trying flaresolverr`);
    }
  } catch { /* fall through to flaresolverr */ }

  // Step 2: flaresolverr fallback (solves JS challenge — 3-8s but always works)
  try {
    const fsUrl = process.env.FLARESOLVERR_URL || "http://10.0.1.1:8191/v1";
    const fsRes = await fetch(fsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cmd: "request.get",
        url,
        maxTimeout: 18000,
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!fsRes.ok) {
      console.warn(`[anidao] flaresolverr returned ${fsRes.status}`);
      return null;
    }
    const fsData = await fsRes.json() as {
      status: string;
      solution?: { response?: string; status?: number };
    };
    if (fsData.status !== "ok" || !fsData.solution?.response) {
      console.warn(`[anidao] flaresolverr status: ${fsData.status}`);
      return null;
    }
    const html = fsData.solution.response;
    // Verify we got real content (not another challenge page)
    if (html.length < 8000 && /Just a moment/i.test(html)) {
      console.warn(`[anidao] flaresolverr also got CF challenge for ${url.substring(0, 80)}`);
      return null;
    }
    return html;
  } catch (e) {
    console.warn(`[anidao] flaresolverr error:`, e instanceof Error ? e.message.slice(0, 100) : e);
    return null;
  }
}

/**
 * Resolve AniDao slug from the anime title.
 *
 * Since /search.html is Cloudflare-protected (returns 403), we use AniZip API
 * to get the English title, then try the kebab-case slug directly. If that
 * 404s, we fall back to /search.html (will return 403, but maybe future
 * Cloudflare changes will allow it).
 */
export async function searchAnidao(title: string): Promise<string | null> {
  try {
    // Convert title to kebab-case slug
    const normalizedTitle = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    // Try direct slug fetch first — fastest path
    const directUrl = `${ANIDAO_BASE}/anime/${normalizedTitle}`;
    const directHtml = await anidaoFetch(directUrl);
    if (directHtml && directHtml.includes("data-an-content-id=")) {
      return normalizedTitle;
    }

    // Fallback: try /browse?keyword= (NEW — same as AniNeko.to pattern)
    const searchUrl = `${ANIDAO_BASE}/browse?keyword=${encodeURIComponent(title)}`;
    const searchHtml = await anidaoFetch(searchUrl);
    if (!searchHtml) return null;

    // Extract first /watch/{slug} link from search results (AniDao.to uses
    // /watch/{slug} pattern in browse results, similar to AniNeko)
    const slugMatch = searchHtml.match(/href="\/watch\/([a-z0-9-]+)"/i) || searchHtml.match(/href="\/anime\/([a-z0-9-]+)"/i);
    if (slugMatch) return slugMatch[1];

    return null;
  } catch {
    return null;
  }
}

/**
 * Extract subtitle URL from a data-an-video attribute.
 * Different CDNs use different query param names:
 *   - vivibebe.site: ?sub={url}
 *   - otakuhg.site: ?caption_1={url}&sub_1=English
 *   - otakuvid.online: ?caption_1={url}&sub_1=English
 *   - playmogo.com: ?c1_file={url}&c1_label=English
 */
function extractSubtitleFromVideoUrl(videoUrl: string): { url: string; lang: string; label: string } | null {
  try {
    const url = new URL(videoUrl);
    const params = url.searchParams;
    const subUrl = params.get("sub") || params.get("caption_1") || params.get("c1_file") || params.get("subtitle") || params.get("captions");
    if (!subUrl) return null;
    const subLabel = params.get("sub_1") || params.get("c1_label") || params.get("label") || "English";
    return { url: subUrl, lang: "en", label: subLabel };
  } catch {
    return null;
  }
}

/**
 * Extract the direct m3u8 URL from an AniDao embed page.
 * Only vivibebe.site / bibiemb.xyz are supported (m3u8 is in the HTML).
 * Other CDNs use obfuscated JS and return null (server is skipped).
 */
async function extractM3u8FromAnidaoEmbed(embedUrl: string): Promise<string | null> {
  try {
    const parsed = new URL(embedUrl);
    const hostname = parsed.hostname;
    const path = parsed.pathname;

    // bibiemb.xyz — SKIP! The m3u8 worker (morning-credit-3bcc.vibevibe.workers.dev)
    // currently returns Backblaze 403 "account_trouble" — broken upstream.
    if (hostname.includes("bibiemb") || hostname.includes("vibeplayer")) {
      return null;
    }

    // vivibebe.site — SKIP! The m3u8 served by vivibebe.site contains
    // AD segments only (p16-ad-sg.ibyteimg.com), not real anime video.
    if (hostname.includes("vivibebe")) {
      return null;
    }

    // otakuhg.site / otakuvid.online — Dean Edwards packed JS containing the
    // REAL m3u8 URL inside a `links` object. Decode and extract.
    if (hostname.includes("otakuhg") || hostname.includes("otakuvid") || hostname.includes("earnvids") || hostname.includes("streamhg")) {
      return await extractM3u8FromPackedJS(embedUrl);
    }

    // playmogo.com (DoodStream) — Cloudflare challenge protected, skip
    return null;
  } catch {
    return null;
  }
}

/**
 * Decode Dean Edwards packed JavaScript from otakuhg.site / otakuvid.online.
 *
 * These embeds contain an eval(function(p,a,c,k,e,d){...}) packer that
 * decodes to JWPlayer setup code with a `links` object containing the
 * REAL m3u8 URL (hls2, hls3, hls4 keys).
 *
 * The decoded JS looks like:
 *   var links={"hls2":"https://...master.m3u8?t=...","hls4":"/stream/.../master.m3u8"};
 *
 * We extract the hls2 URL (it's absolute and works directly — these CDNs
 * return Access-Control-Allow-Origin: *).
 */
async function extractM3u8FromPackedJS(embedUrl: string): Promise<string | null> {
  try {
    const embedRes = await curlFetch(embedUrl, {
      headers: {
        "User-Agent": UA,
        "Referer": ANIDAO_BASE + "/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      timeoutMs: 8000,
    });
    if (!embedRes.ok) return null;
    const html = await embedRes.text();

    // Find the eval packer block
    const packerMatch = html.match(/eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\('([\s\S]*?)',(\d+),(\d+),'([\s\S]*?)'\.split\('\|'\)\)\)/);
    if (!packerMatch) return null;

    const pStr = packerMatch[1];
    const a = parseInt(packerMatch[2], 10);
    let c = parseInt(packerMatch[3], 10);
    const k = packerMatch[4].split('|');

    // Decode the packer
    let decoded = pStr;
    while (c--) {
      if (k[c]) {
        decoded = decoded.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]);
      }
    }

    // Extract the `links` object — find all m3u8 URLs inside `links={...}`
    const linksMatch = decoded.match(/links\s*=\s*\{[\s\S]*?\}/);
    if (linksMatch) {
      const linksObj = linksMatch[0];
      // Prefer hls2 (most reliable — direct CDN URL)
      const hls2Match = linksObj.match(/"hls2"\s*:\s*"(https?:\/\/[^"]+\.m3u8[^"]*)"/i);
      if (hls2Match) return hls2Match[1];
      // Fallback: any https m3u8 URL
      const anyM3u8 = linksObj.match(/"(https?:\/\/[^"]+\.m3u8[^"]*)"/i);
      if (anyM3u8) return anyM3u8[1];
    }

    // Last resort: any m3u8 URL in decoded JS
    const anyM3u8 = decoded.match(/https?:\/\/[^"'\s,;)]+\.m3u8[^"'\s,;)]*/);
    if (anyM3u8) return anyM3u8[0];

    return null;
  } catch {
    return null;
  }
}

/**
 * Get all streams for an anime + episode. Returns one result per server.
 * URL: /watch-online/{slug}-episode-{N}
 */
export async function resolveAnidaoStreams(
  anilistId: number,
  episodeNum: number,
  title?: string,
): Promise<AnidaoStreamResult[]> {
  try {
    if (!title) return [];

    // 1. Resolve slug
    const slug = await searchAnidao(title);
    if (!slug) return [];

    // 2. Fetch the episode page
    const url = `${ANIDAO_BASE}/watch-online/${slug}-episode-${episodeNum}`;
    const html = await anidaoFetch(url);
    if (!html) return [];

    // 3. Parse all server buttons — same structure as AniNeko but with
    // data-an-server-btn="{type}-{N}" instead of data-tab="tab_N"
    // The type is encoded directly in the button id (sub-1, dub-2, hsub-3)

    // Extract all server buttons with their data-an-video + data-an-server-btn
    const buttonRegex = /<button[^>]*class="an-server-btn[^"]*"[^>]*data-an-server-btn="([^"]+)"[^>]*data-an-video="([^"]+)"/gi;
    const matchPromises: Promise<AnidaoStreamResult | null>[] = [];
    let match;
    while ((match = buttonRegex.exec(html)) !== null) {
      const buttonId = match[1]; // "sub-1", "dub-2", "hsub-3"
      const embedUrl = match[2]
        .replace(/&amp;/g, "&"); // unescape HTML entities in URL

      // Determine sub/dub type from button id prefix
      let type: "sub" | "dub";
      let hardsub = false;
      if (buttonId.startsWith("dub")) {
        type = "dub";
      } else if (buttonId.startsWith("hsub")) {
        type = "sub";
        hardsub = true;
      } else {
        type = "sub"; // "sub-" prefix
      }

      // DON'T skip hardsub — user wants them shown in the Sub tab.
      // Hardsub servers have subtitles burned into the video (no separate
      // subtitle URL needed — the video already has English subs baked in).
      // They appear in the Sub tab alongside the soft-sub servers.

      // Extract server name from button id:
      //   "sub-1"  → "HD-1" (soft sub)
      //   "hsub-1" → "HS-1" (hard sub — subs burned into video)
      //   "dub-1"  → "HD-1" (dub)
      const numMatch = buttonId.match(/-(\d+)$/);
      const num = numMatch ? numMatch[1] : "1";
      const serverName = hardsub ? `HS-${num}` : `HD-${num}`;

      // Extract subtitle URL from the embed URL's query params (soft sub servers)
      const subtitle = extractSubtitleFromVideoUrl(embedUrl);
      const subtitleTracks = subtitle ? [subtitle] : [];

      // For each embed URL, try to extract the direct m3u8.
      // If m3u8 extraction fails (otakuhg/otakuvid/playmogo), return as embed
      // so the browser can iframe it directly. This ensures dub servers show up
      // even when the embed CDN doesn't have an extractable m3u8.
      matchPromises.push(
        extractM3u8FromAnidaoEmbed(embedUrl).then(m3u8Url => {
          if (m3u8Url) {
            return {
              provider: "anidao" as const,
              type,
              quality: "1080p",
              streamUrl: m3u8Url, // DIRECT m3u8 URL
              isM3U8: true,
              isMP4: false,
              isEmbed: false,
              hardsub,
              serverName,
              subtitleTracks,
            } satisfies AnidaoStreamResult;
          }
          // m3u8 extraction failed — return as embed URL
          // The browser will iframe it directly (embed player handles streaming)
          return {
            provider: "anidao" as const,
            type,
            quality: "1080p",
            streamUrl: embedUrl, // EMBED URL (browser iframes it)
            isM3U8: false,
            isMP4: false,
            isEmbed: true,
            hardsub,
            serverName,
            subtitleTracks,
          } satisfies AnidaoStreamResult;
        })
      );
    }
    const settled = await Promise.allSettled(matchPromises);
    const results: AnidaoStreamResult[] = [];
    for (const r of settled) {
      if (r.status === "fulfilled" && r.value) results.push(r.value);
    }

    console.log(`[AniDao] ${anilistId} ep${episodeNum}: ${results.length} streams from ${slug} (${results.filter(r => r.subtitleTracks.length > 0).length} with subs)`);
    return results;
  } catch (e: any) {
    console.log(`[AniDao] error for ${anilistId} ep${episodeNum}: ${e?.message || e}`);
    return [];
  }
}
