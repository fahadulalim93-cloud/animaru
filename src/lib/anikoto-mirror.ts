/**
 * AniKoto Mirror — single-mirror Inazuma scraper (anikototv.to)
 * =================================================================
 *
 * This complements the existing AniKoto source (which uses megaplay.buzz
 * direct + raw AniKoto fallback). The mirror source scrapes anikototv.to
 * directly and returns the SAME Inazuma VidPlay / Megaplay streams but
 * with megaplayFileId set so the player uses client-side getSources
 * (which works reliably — bypasses the proxy IP block entirely).
 *
 * Pipeline:
 *   1. Search: GET /filter?keyword={title} → /watch/{slug}/ep-1 URL
 *   2. Episode page: GET /watch/{slug}/ep-{N} → extract data-anime-id
 *   3. Episode list: GET /ajax/episode/list/{animeId} → HTML with data-ids
 *   4. Server list: GET /ajax/server/list?servers={data-ids} → HTML with
 *      <li data-sv-id data-link-id> elements (sub + dub blocks)
 *   5. Server URL: GET /ajax/server?get={link-id} → JSON {url, skip_data}
 *
 * Returned URLs:
 *   - https://megaplay.buzz/stream/s-2/{fileId}/{audio}         → megaplayFileId
 *     Player calls /stream/getSources?id={fileId} client-side, decrypts AES
 *     enc field, gets m3u8 + subtitles + intro/outro. BYPASSES proxy entirely.
 *   - https://vidtube.site/stream/{encId}/{audio}               → proxied embed
 *     Player iframes it (same as AniKoto's VidPlay handling).
 */

const MIRROR = "https://anikototv.to";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100100 Firefox/121.0";

export interface AnikotoMirrorStreamResult {
  provider: "anikoto-mirror";
  type: "sub" | "dub";
  quality: string;
  streamUrl: string;
  isM3U8: boolean;
  isMP4: boolean;
  isEmbed: boolean;
  hardsub: boolean;
  serverName: string;
  megaplayFileId?: string;
  megaplayAudio?: "sub" | "dub";
  subtitleTracks: Array<{ url: string; lang: string; label: string }>;
  intro?: { start: number; end: number } | null;
  outro?: { start: number; end: number } | null;
}

async function mirrorFetch(url: string, referer?: string, timeoutMs = 12000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept": "application/json, text/html, */*",
        "Accept-Language": "en-US,en;q=0.5",
        "X-Requested-With": "XMLHttpRequest",
        ...(referer ? { "Referer": referer } : {}),
      },
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Search anikototv.to for an anime by title.
 * Returns the slug (e.g. "one-punch-man-jylym") or null.
 */
async function searchMirror(title: string): Promise<string | null> {
  try {
    const norm = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const html = await mirrorFetch(`${MIRROR}/filter?keyword=${encodeURIComponent(title)}`);
    if (!html) return null;

    // Collect all /watch/{slug}/ep-N links
    const slugs = new Set<string>();
    const matches = html.matchAll(/href="(?:https?:\/\/anikototv\.to)?\/watch\/([a-z0-9-]+)\/ep-\d+"/gi);
    for (const m of matches) {
      const slug = m[1];
      // Skip specials, movies, season 2/3, road-to-hero, etc.
      if (slug.includes("special") || slug.includes("movie") || slug.includes("road-to-hero") ||
          slug.includes("season-2") || slug.includes("season-3") || slug.includes("2nd-season") ||
          slug.includes("3-specials") || slug.includes("recap") || slug.includes("ova") ||
          slug.includes("ona") || slug.includes("commemorative")) {
        continue;
      }
      slugs.add(slug);
    }
    if (slugs.size === 0) return null;

    // Pick best: exact slug match preferred
    let bestSlug = "";
    let bestScore = -1;
    for (const slug of slugs) {
      let score = 0;
      if (slug === norm) score = 100;
      else if (slug.startsWith(norm)) score = 80;
      else if (slug.includes(norm)) score = 60;
      else score = 10;
      // Prefer shorter slugs (main series)
      score -= slug.length * 0.05;
      if (score > bestScore) {
        bestScore = score;
        bestSlug = slug;
      }
    }
    return bestSlug || null;
  } catch {
    return null;
  }
}

/**
 * Scrape anikototv.to for streams.
 */
export async function resolveAnikotoMirrorStreams(
  anilistId: number,
  episodeNum: number,
  title?: string,
): Promise<AnikotoMirrorStreamResult[]> {
  try {
    if (!title) return [];

    // 1. Search for anime
    const slug = await searchMirror(title);
    if (!slug) return [];

    const episodePageUrl = `${MIRROR}/watch/${slug}/ep-${episodeNum}`;
    const epPageHtml = await mirrorFetch(episodePageUrl, `${MIRROR}/`);
    if (!epPageHtml) return [];

    // 2. Extract anime ID
    const animeIdMatch = epPageHtml.match(/data-anime-id="(\d+)"/);
    if (!animeIdMatch) return [];
    const animeId = animeIdMatch[1];

    // 3. Fetch episode list
    const episodeListHtml = await mirrorFetch(
      `${MIRROR}/ajax/episode/list/${animeId}`,
      episodePageUrl,
    );
    if (!episodeListHtml) return [];

    let episodeListResult: string;
    try {
      const data = JSON.parse(episodeListHtml);
      if (data.status !== 200 || !data.result) return [];
      episodeListResult = data.result;
    } catch {
      return [];
    }

    // Find ep N — has data-num="{N}" and data-ids="{base64}"
    const epRegex = new RegExp(`data-num="${episodeNum}"[^>]*data-ids="([^"]+)"`, "i");
    const epMatch = episodeListResult.match(epRegex);
    if (!epMatch) return [];
    const dataIds = epMatch[1];

    // 4. Fetch server list
    const serverListHtml = await mirrorFetch(
      `${MIRROR}/ajax/server/list?servers=${encodeURIComponent(dataIds)}`,
      episodePageUrl,
    );
    if (!serverListHtml) return [];

    let serverListResult: string;
    try {
      const data = JSON.parse(serverListHtml);
      if (data.status !== 200 || !data.result) return [];
      serverListResult = data.result;
    } catch {
      return [];
    }

    // Parse server list HTML:
    //   <div class="type" data-type="sub">
    //     <ul>
    //       <li data-ep-id="..." data-sv-id="..." data-link-id="...">Vidstream-2</li>
    //       ...
    //     </ul>
    //   </div>
    //   <div class="type" data-type="dub">...</div>
    const typeRegex = /<div[^>]*class="type"[^>]*data-type="(sub|dub)"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
    const serverRegex = /<li[^>]*data-sv-id="([^"]+)"[^>]*data-link-id="([^"]+)"[^>]*>([^<]+)<\/li>/gi;

    const servers: Array<{ type: "sub" | "dub"; svId: string; linkId: string; name: string }> = [];
    let typeMatch;
    while ((typeMatch = typeRegex.exec(serverListResult)) !== null) {
      const type = typeMatch[1] as "sub" | "dub";
      const block = typeMatch[2];
      let serverMatch;
      while ((serverMatch = serverRegex.exec(block)) !== null) {
        servers.push({
          type,
          svId: serverMatch[1],
          linkId: serverMatch[2],
          name: serverMatch[3].trim(),
        });
      }
    }
    if (servers.length === 0) return [];

    // 5. For each server, fetch its URL (in parallel)
    const urlPromises = servers.map(async (s) => {
      try {
        const res = await mirrorFetch(
          `${MIRROR}/ajax/server?get=${encodeURIComponent(s.linkId)}`,
          episodePageUrl,
        );
        if (!res) return null;
        const data = JSON.parse(res);
        if (data.status !== 200 || !data.result?.url) return null;
        return {
          ...s,
          url: data.result.url as string,
          skip: data.result.skip_data || null,
        };
      } catch {
        return null;
      }
    });
    const settled = await Promise.allSettled(urlPromises);

    const results: AnikotoMirrorStreamResult[] = [];
    for (const r of settled) {
      if (r.status !== "fulfilled" || !r.value) continue;
      const { type, name, url, skip } = r.value;

      // Parse URL — megaplay.buzz or vidtube.site
      let isMegaplay = false;
      let megaplayFileId: string | undefined;
      let megaplayAudio: "sub" | "dub" | undefined;
      let isEmbed = false;
      let isM3U8 = false;

      if (url.includes("megaplay.buzz")) {
        // Match: /stream/(s-2|ani)/{fileId}/{audio}
        const m = url.match(/megaplay\.buzz\/stream\/(?:s-2|ani)\/(\d+)\/(sub|dub|hsub)/);
        if (m) {
          isMegaplay = true;
          isM3U8 = true;
          megaplayFileId = m[1];
          megaplayAudio = m[2] === "hsub" ? "sub" : (m[2] as "sub" | "dub");
        } else {
          // Different megaplay URL shape — return as embed
          isEmbed = true;
          isM3U8 = false;
        }
      } else if (url.includes("vidtube.site")) {
        // VidPlay — vidtube.site is the Inazuma VidPlay CDN
        isEmbed = true;
        isM3U8 = false;
      } else {
        // Unknown URL — try as embed
        isEmbed = true;
        isM3U8 = false;
      }

      // Extract intro/outro from skip_data
      const intro = skip?.intro ? { start: skip.intro[0], end: skip.intro[1] } : null;
      const outro = skip?.outro ? { start: skip.outro[0], end: skip.outro[1] } : null;

      // Determine hardsub — VidPlay has /hsub variant
      const hardsub = url.endsWith("/hsub");

      results.push({
        provider: "anikoto-mirror",
        type,
        quality: "1080p",
        streamUrl: url,
        isM3U8,
        isMP4: false,
        isEmbed,
        hardsub,
        serverName: name,
        megaplayFileId,
        megaplayAudio,
        subtitleTracks: [],
        intro,
        outro,
      });
    }

    console.log(`[AniKoto-Mirror] AniList ${anilistId} ep${episodeNum}: ${results.length} streams from ${slug} (${results.filter(r => r.megaplayFileId).length} megaplay, ${results.filter(r => r.isEmbed).length} embed)`);
    return results;
  } catch (e: any) {
    console.log(`[AniKoto-Mirror] error for ${anilistId} ep${episodeNum}: ${e?.message || e}`);
    return [];
  }
}
