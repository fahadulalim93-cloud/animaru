/**
 * AniNeko.to scraper — returns streams WITH subtitles + skip times
 *
 * Site structure:
 *   - Search: /browser?keyword={kw} → returns anime cards with /watch/{slug}
 *   - Episode page: /watch/{slug}/ep-{n} → has all servers in HTML directly
 *
 * Server HTML structure (per episode page):
 *   <div class="type" data-id="hsub">  → Hard Sub tab
 *   <div class="type" data-id="sub">   → Soft Sub tab (HAS SUBTITLES!)
 *   <div class="type" data-id="dub">   → Dub tab
 *
 *   Each server is a <button class="nv-server-btn server-video" data-video="{url}" data-tab="tab_{n}">
 *   The data-video URL is an embed URL. For soft sub servers, the subtitle URL
 *   is appended as a query param:
 *     - vivibebe.site: ?sub={subtitleUrl}
 *     - otakuhg.site:  ?caption_1={subtitleUrl}&sub_1=English
 *     - otakuvid.online: ?caption_1={subtitleUrl}&sub_1=English
 *     - playmogo.com: ?c1_file={subtitleUrl}&c1_label=English
 *
 * Subtitle CDN: cdn.anizara.store (returns 200, .vtt files)
 *
 * Embed CDNs (all iframe-able):
 *   - vivibebe.site/{hash}            → HD-1 (megaplay-style)
 *   - otakuhg.site/e/{id}             → StreamHG
 *   - otakuvid.online/embed/{id}      → Earnvids
 *   - playmogo.com/e/{id}             → Doodstream
 */

const ANINEKO_BASE = "https://anineko.to";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100100 Firefox/121.0";

export interface AninekoStreamResult {
  provider: "anineko";
  type: "sub" | "dub";
  quality: string;
  streamUrl: string; // embed URL (iframe-able)
  isM3U8: boolean;
  isMP4: boolean;
  isEmbed: boolean;
  hardsub: boolean;
  serverName: string;
  subtitleTracks: Array<{ url: string; lang: string; label: string }>;
}

/**
 * Fetch with proper headers
 */
async function aninekoFetch(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "identity",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Search AniNeko for anime by title. Returns the best matching slug.
 * Prefers exact title matches (e.g. "One Piece" → "one-piece", not
 * "one-piece-episode-of-luffy-hand-island-adventure").
 */
export async function searchAnineko(title: string): Promise<string | null> {
  try {
    const url = `${ANINEKO_BASE}/browser?keyword=${encodeURIComponent(title)}`;
    const html = await aninekoFetch(url);
    if (!html) return null;

    // Collect ALL /watch/{slug} matches (not episode URLs)
    const slugs: string[] = [];
    const seen = new Set<string>();
    const matches = html.matchAll(/href="\/watch\/([a-z0-9-]+)"/gi);
    for (const m of matches) {
      const slug = m[1];
      if (slug.includes("-ep-")) continue; // skip episode URLs
      if (seen.has(slug)) continue;
      seen.add(slug);
      slugs.push(slug);
    }
    if (slugs.length === 0) return null;
    if (slugs.length === 1) return slugs[0];

    // Normalize the search title for comparison
    const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    // Score each slug: how well does it match the title?
    // Exact match = best. Starts with title = good. Contains title = ok.
    let bestSlug = slugs[0];
    let bestScore = -1;
    for (const slug of slugs) {
      let score = 0;
      if (slug === normalizedTitle) score = 100; // exact
      else if (slug.startsWith(normalizedTitle + "-") || slug.startsWith(normalizedTitle)) score = 80; // starts with title
      else if (slug.includes(normalizedTitle)) score = 60; // contains title
      else score = 10; // fallback — first result
      // Penalize movies/specials (longer slugs usually = specials)
      if (slug.includes("movie") || slug.includes("film") || slug.includes("special") || slug.includes("recap") || slug.includes("episode-of")) score -= 20;
      // Prefer shorter slugs (main series over specials)
      score -= slug.length * 0.05;
      if (score > bestScore) {
        bestScore = score;
        bestSlug = slug;
      }
    }
    return bestSlug;
  } catch {
    return null;
  }
}

/**
 * Extract subtitle URL from a data-video attribute.
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
    // Check all known param names
    const subUrl = params.get("sub") || params.get("caption_1") || params.get("c1_file") || params.get("subtitle") || params.get("captions");
    if (!subUrl) return null;
    const subLabel = params.get("sub_1") || params.get("c1_label") || params.get("label") || "English";
    return { url: subUrl, lang: "en", label: subLabel };
  } catch {
    return null;
  }
}

/**
 * Get all streams for an anime + episode. Returns one result per server.
 * URL: /watch/{slug}/ep-{n}
 */
export async function resolveAninekoStreams(
  anilistId: number,
  episodeNum: number,
  title?: string,
): Promise<AninekoStreamResult[]> {
  try {
    if (!title) return [];

    // 1. Search for the anime by title
    const slug = await searchAnineko(title);
    if (!slug) return [];

    // 2. Fetch the episode page
    const url = `${ANINEKO_BASE}/watch/${slug}/ep-${episodeNum}`;
    const html = await aninekoFetch(url);
    if (!html) return [];

    // 3. Parse all servers — they're in <button class="nv-server-btn" data-video="..." data-tab="tab_N">
    // The tab number maps to: tab_0 = hsub, tab_1 = sub, tab_2 = dub
    // (determined by the order of data-id="hsub", data-id="sub", data-id="dub" divs)

    // First, find the tab → type mapping by reading the data-id divs in order
    const tabTypeMap: Record<string, "sub" | "hsub" | "dub"> = {};
    const typeDivRegex = /<div[^>]*class="[^"]*"[^>]*data-id="(hsub|sub|dub)"[^>]*>/gi;
    let typeIdx = 0;
    let typeMatch;
    while ((typeMatch = typeDivRegex.exec(html)) !== null) {
      tabTypeMap[`tab_${typeIdx}`] = typeMatch[1] as "sub" | "hsub" | "dub";
      typeIdx++;
    }

    // Fallback: assume standard order if mapping not found
    if (Object.keys(tabTypeMap).length === 0) {
      tabTypeMap["tab_0"] = "hsub";
      tabTypeMap["tab_1"] = "sub";
      tabTypeMap["tab_2"] = "dub";
    }

    // 4. Extract all server buttons + extract m3u8 from each embed
    const results: AninekoStreamResult[] = [];
    const buttonRegex = /<button[^>]*class="nv-server-btn[^"]*"[^>]*data-video="([^"]+)"[^>]*data-tab="(tab_\d+)"[^>]*>([\s\S]*?)<\/button>/gi;
    const matchPromises: Promise<AninekoStreamResult | null>[] = [];
    let match;
    while ((match = buttonRegex.exec(html)) !== null) {
      const embedUrl = match[1];
      const tab = match[2];
      const buttonContent = match[3];
      // Extract server name — the button content is like "HD-1<span>Hard Sub</span>"
      // We want the FIRST text node (before any <span>), which is the actual server name.
      // Strip all tags, then take the first non-empty line.
      const textOnly = buttonContent.replace(/<[^>]+>/g, " ").trim();
      const serverName = textOnly.split(/\s+/)[0] || "Server";
      const tabType = tabTypeMap[tab] || "sub";
      const type: "sub" | "dub" = tabType === "dub" ? "dub" : "sub";
      const hardsub = tabType === "hsub";

      // Extract subtitle URL from the embed URL's query params (soft sub servers)
      const subtitle = extractSubtitleFromVideoUrl(embedUrl);
      const subtitleTracks = subtitle ? [subtitle] : [];

      // For each embed URL, extract the direct m3u8 (non-embed).
      // This lets us play in our HLS player with correct subtitle styling.
      matchPromises.push(
        extractM3u8FromAninekoEmbed(embedUrl).then(m3u8Url => {
          if (!m3u8Url) return null; // skip if we can't extract m3u8
          return {
            provider: "anineko" as const,
            type,
            quality: "1080p",
            streamUrl: m3u8Url, // DIRECT m3u8 URL
            isM3U8: true,
            isMP4: false,
            isEmbed: false, // NOT an embed — direct m3u8
            hardsub,
            serverName,
            subtitleTracks,
          } satisfies AninekoStreamResult;
        })
      );
    }
    const settled = await Promise.allSettled(matchPromises);
    for (const r of settled) {
      if (r.status === "fulfilled" && r.value) results.push(r.value);
    }

    console.log(`[AniNeko] ${anilistId} ep${episodeNum}: ${results.length} streams from ${slug} (${results.filter(r => r.subtitleTracks.length > 0).length} with subs)`);
    return results;
  } catch (e: any) {
    console.log(`[AniNeko] error for ${anilistId} ep${episodeNum}: ${e?.message || e}`);
    return [];
  }
}

/**
 * Extract the direct m3u8 URL from an AniNeko embed page.
 *
 * AniNeko uses these embed CDNs:
 *   - vivibebe.site  → m3u8 is directly in the HTML: /public/stream/{hash}/master.m3u8
 *   - otakuhg.site   → obfuscated JS (returns null — can't extract)
 *   - otakuvid.online → obfuscated JS (returns null — can't extract)
 *   - playmogo.com   → obfuscated JS (returns null — can't extract)
 *   - bibiemb.xyz    → similar to vivibebe (try same approach)
 *
 * For obfuscated CDNs, we return null and the server is skipped (not shown
 * in the list). This is better than showing a broken embed.
 */
async function extractM3u8FromAninekoEmbed(embedUrl: string): Promise<string | null> {
  try {
    const parsed = new URL(embedUrl);
    const hostname = parsed.hostname;
    const path = parsed.pathname;

    // vivibebe.site / bibiemb.xyz — m3u8 is directly in the HTML
    if (hostname.includes("vivibebe") || hostname.includes("bibiemb") ||
        hostname.includes("vibeplayer")) {
      const embedRes = await fetch(embedUrl, {
        headers: {
          "User-Agent": UA,
          Referer: ANINEKO_BASE + "/",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        redirect: "follow",
      });
      if (!embedRes.ok) return null;
      const html = await embedRes.text();

      // Pattern: const src = "https://vivibebe.site/public/stream/{hash}/master.m3u8";
      const m3u8Match = html.match(/(?:src|file|source)\s*=\s*["'](https?:\/\/[^"']+\.m3u8)["']/i);
      if (m3u8Match) return m3u8Match[1];

      // Fallback: construct from the hash in the path
      const hashMatch = path.match(/\/([a-f0-9]{16,})/i);
      if (hashMatch) {
        return `https://${hostname}/public/stream/${hashMatch[1]}/master.m3u8`;
      }
    }

    // otakuhg / otakuvid / playmogo — obfuscated JS, can't extract m3u8
    // Return null so the server is skipped (not shown as broken embed)
    return null;
  } catch {
    return null;
  }
}
