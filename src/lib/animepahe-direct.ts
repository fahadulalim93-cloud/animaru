/**
 * AnimePahe Direct — full scraper with FlareSolverr CF bypass
 * ============================================================
 *
 * Pipeline:
 *   1. FlareSolverr bypasses Cloudflare on animepahe.pw
 *   2. Search API: /api?m=search&q={title} → anime session ID
 *   3. Episodes API: /api?m=release&id={session} → episode session ID
 *   4. Play page: /play/{anime_session}/{episode_session} → kwik.cx embed URLs
 *   5. Kwik.cx embed page → packed JS → m3u8 URL on vault-XX.uwucdn.top
 *
 * FlareSolverr runs on the VPS (Docker, port 8191). It solves CF's managed
 * challenge using a headless browser. CF cookies are cached for ~30min so
 * subsequent requests are fast.
 *
 * AnimePahe is sub-only (Japanese audio, HorribleSubs releases).
 * Subtitles are hard-sub (burned into the video — no separate track).
 */

import { wrapM3u8UrlWithReferer } from "./proxy";

const ANIMEPAHE_BASE = "https://animepahe.pw";
const FLARESOLVERR_URL = process.env.FLARESOLVERR_URL || "http://172.17.0.1:8191";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// ── Types ──
export interface AnimePaheServer {
  name: string;
  m3u8Url: string;
  type: "sub";
  quality: string;
  referer: string;
}

export interface AnimePaheResult {
  servers: AnimePaheServer[];
}

// ── FlareSolverr helper ──
// Sends a request through FlareSolverr which solves the CF challenge
// and returns the page body. CF cookies are cached between requests.
async function flareGet(url: string, timeoutMs = 60000): Promise<string | null> {
  try {
    const res = await fetch(`${FLARESOLVERR_URL}/v1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cmd: "request.get",
        url,
        maxTimeout: timeoutMs,
      }),
      signal: AbortSignal.timeout(timeoutMs + 10000),
    });
    if (!res.ok) {
      console.error(`[animepahe] FlareSolverr HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    if (data.status !== "ok") {
      console.error(`[animepahe] FlareSolverr error: ${data.message || "unknown"}`);
      return null;
    }
    return data.solution?.response || null;
  } catch (err) {
    console.error(`[animepahe] FlareSolverr fetch error:`, err);
    return null;
  }
}

// ── Step 1: Search animepahe for the anime by title ──
interface SearchResult {
  id: number;
  title: string;
  session: string;
  year: number;
}

async function searchAnimePahe(title: string): Promise<SearchResult | null> {
  const body = await flareGet(
    `${ANIMEPAHE_BASE}/api?m=search&q=${encodeURIComponent(title)}&l=8`,
  );
  if (!body) return null;

  // Extract JSON from the HTML wrapper (FlareSolverr wraps JSON in <pre>)
  const jsonMatch = body.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const data = JSON.parse(jsonMatch[0]);
    const results: SearchResult[] = (data.data || []).map((d: any) => ({
      id: d.id,
      title: d.title,
      session: d.session,
      year: d.year,
    }));

    if (results.length === 0) return null;

    // Find the best match — exact title match, or first result
    const normalized = title.toLowerCase().replace(/[^a-z0-9]/g, "");
    const exact = results.find(r =>
      r.title.toLowerCase().replace(/[^a-z0-9]/g, "") === normalized
    );
    return exact || results[0];
  } catch {
    return null;
  }
}

// ── Step 2: Get episodes for an anime session ──
interface EpisodeResult {
  episode: number;
  session: string;
  audio: string;
}

async function getEpisodes(
  animeSession: string,
  episodeNum: number,
): Promise<EpisodeResult | null> {
  const body = await flareGet(
    `${ANIMEPAHE_BASE}/api?m=release&id=${animeSession}&sort=episode_asc&page=1&l=30`,
  );
  if (!body) return null;

  const jsonMatch = body.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const data = JSON.parse(jsonMatch[0]);
    const episodes: EpisodeResult[] = (data.data || []).map((e: any) => ({
      episode: e.episode,
      session: e.session,
      audio: e.audio,
    }));

    return episodes.find(e => e.episode === episodeNum) || null;
  } catch {
    return null;
  }
}

// ── Step 3: Get kwik.cx embed URLs from the play page ──
interface KwikLink {
  url: string;
  quality: string;
  audio: string;
  fansub: string;
}

async function getKwikLinks(
  animeSession: string,
  episodeSession: string,
): Promise<KwikLink[]> {
  const body = await flareGet(
    `${ANIMEPAHE_BASE}/play/${animeSession}/${episodeSession}`,
  );
  if (!body) return [];

  // Extract data-url attributes from the resolution menu buttons
  // Pattern: <button ... data-url="https://kwik.cx/e/xxx" data-resolution="1080" data-audio="jpn" ...>
  const buttonRegex = /<button[^>]*data-url="([^"]+)"[^>]*data-resolution="([^"]+)"[^>]*data-audio="([^"]+)"[^>]*data-fansub="([^"]*)"[^>]*>/gi;
  const links: KwikLink[] = [];
  let match;
  while ((match = buttonRegex.exec(body)) !== null) {
    links.push({
      url: match[1],
      quality: match[2],
      audio: match[3],
      fansub: match[4],
    });
  }

  // Also try reversed attribute order (data-resolution before data-url)
  const buttonRegex2 = /<button[^>]*data-resolution="([^"]+)"[^>]*data-url="([^"]+)"[^>]*data-audio="([^"]+)"[^>]*data-fansub="([^"]*)"[^>]*>/gi;
  while ((match = buttonRegex2.exec(body)) !== null) {
    const exists = links.some(l => l.url === match[2]);
    if (!exists) {
      links.push({
        url: match[2],
        quality: match[1],
        audio: match[3],
        fansub: match[4],
      });
    }
  }

  // Fallback: just find all kwik URLs in the page
  if (links.length === 0) {
    const kwikUrls = new Set<string>();
    const urlRegex = /https:\/\/kwik\.[a-z]+\/e\/[^\s"'<>]+/gi;
    while ((match = urlRegex.exec(body)) !== null) {
      kwikUrls.add(match[0]);
    }
    for (const url of kwikUrls) {
      links.push({ url, quality: "1080", audio: "jpn", fansub: "" });
    }
  }

  // Deduplicate by URL
  const seen = new Set<string>();
  return links.filter(l => {
    if (seen.has(l.url)) return false;
    seen.add(l.url);
    return true;
  });
}

// ── Step 4: Extract m3u8 from kwik.cx embed page ──
// kwik.cx uses Dean Edwards' packer to obfuscate the video source URL.
// We decode it using Node.js (the packer is just string substitution).
async function extractM3u8FromKwik(kwikUrl: string): Promise<string | null> {
  try {
    // kwik.cx is NOT Cloudflare-protected — direct fetch works
    const res = await fetch(kwikUrl, {
      headers: {
        "User-Agent": UA,
        Referer: ANIMEPAHE_BASE + "/",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Find ALL packed JS blocks and decode them
    // Pattern: }('packed_string', base, count, 'keywords'.split('|'), 0, {})
    const packerRegex = /\}\('([^']+)',(\d+),(\d+),'([^']+)'\.split\('\|'\)/g;
    let match;
    while ((match = packerRegex.exec(html)) !== null) {
      const packed = match[1];
      const base = parseInt(match[2]);
      const count = parseInt(match[3]);
      const keywords = match[4].split("|");

      // Decode the packer
      const decoded = decodePacker(packed, base, count, keywords);

      // Search for m3u8 URL in the decoded string
      const m3u8Match = decoded.match(/https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/);
      if (m3u8Match) {
        return m3u8Match[0];
      }
    }

    // Fallback: search for any vault URL in the raw HTML
    const vaultMatch = html.match(/https:\/\/vault-\d+\.(uwucdn|owocdn)\.top\/[^\s"'<>]+\.m3u8[^\s"'<>]*/);
    if (vaultMatch) return vaultMatch[0];

    return null;
  } catch (err) {
    console.error(`[animepahe] extractM3u8FromKwik error:`, err);
    return null;
  }
}

// ── Dean Edwards' packer decoder ──
function decodePacker(packed: string, base: number, count: number, keywords: string[]): string {
  const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

  function encodeBase(c: number, b: number): string {
    if (c < b) return chars[c] || String(c);
    return encodeBase(Math.floor(c / b), b) + (chars[c % b] || String(c % b));
  }

  // Build substitution map
  const subs: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    const encoded = encodeBase(i, base);
    const kw = keywords[i] || "";
    if (kw) subs[encoded] = kw;
  }

  // Apply substitutions with word boundaries
  let result = packed;
  for (const [enc, kw] of Object.entries(subs)) {
    if (enc && kw) {
      result = result.replace(new RegExp("\\b" + enc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g"), kw);
    }
  }

  return result;
}

// ── Main: resolve m3u8 for AniList ID + episode ──
export async function resolveAnimePahe(
  anilistId: number,
  episodeNum: number,
  title: string,
): Promise<AnimePaheResult | null> {
  try {
    if (!title) return null;

    // Step 1: Search for the anime
    console.log(`[animepahe] Searching for "${title}"...`);
    const searchResult = await searchAnimePahe(title);
    if (!searchResult) {
      console.log(`[animepahe] No results for "${title}"`);
      return null;
    }
    console.log(`[animepahe] Found: ${searchResult.title} (session: ${searchResult.session})`);

    // Step 2: Get episodes
    const episode = await getEpisodes(searchResult.session, episodeNum);
    if (!episode) {
      console.log(`[animepahe] Episode ${episodeNum} not found`);
      return null;
    }
    console.log(`[animepahe] Found episode ${episode.episode} (session: ${episode.session})`);

    // Step 3: Get kwik.cx embed URLs
    const kwikLinks = await getKwikLinks(searchResult.session, episode.session);
    if (kwikLinks.length === 0) {
      console.log(`[animepahe] No kwik links found`);
      return null;
    }
    console.log(`[animepahe] Found ${kwikLinks.length} kwik links: ${kwikLinks.map(k => k.quality + "p").join(", ")}`);

    // Step 4: Extract m3u8 from each kwik.cx embed (parallel)
    const servers: AnimePaheServer[] = [];
    const extracted = await Promise.all(
      kwikLinks.map(async (link) => {
        const m3u8 = await extractM3u8FromKwik(link.url);
        return { link, m3u8 };
      }),
    );

    for (const { link, m3u8 } of extracted) {
      if (m3u8) {
        servers.push({
          name: `Pahe ${link.quality}p`,
          m3u8Url: m3u8,
          type: "sub" as const,
          quality: `${link.quality}p`,
          referer: "https://kwik.cx/",
        });
      }
    }

    if (servers.length === 0) {
      console.log(`[animepahe] No m3u8 URLs extracted from kwik`);
      return null;
    }

    console.log(`[animepahe] Resolved ${servers.length} servers for AniList ${anilistId} ep${episodeNum}`);
    return { servers };
  } catch (err) {
    console.error(`[animepahe] resolveAnimePahe error:`, err);
    return null;
  }
}
