import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Anitaku.to (GogoAnime) scraper - WORKING as of 2025
// Uses Node.js native https module for reliable external HTTP requests

const ANITAKU_BASE = "https://anitaku.to";
const FETCH_TIMEOUT = 15000;
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

const slugCache = new Map<string, { slug: string; ts: number }>();

// Use native Node.js https module instead of fetch
function fetchHtml(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? require("https") : require("http");
    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error(`Timeout fetching ${url}`));
    }, FETCH_TIMEOUT);

    const req = mod.get(
      url,
      { headers: BROWSER_HEADERS, timeout: FETCH_TIMEOUT },
      (res: any) => {
        // Follow redirects
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          const redirectUrl = res.headers.location.startsWith("http")
            ? res.headers.location
            : new URL(res.headers.location, url).href;
          res.resume();
          clearTimeout(timer);
          fetchHtml(redirectUrl).then(resolve).catch(reject);
          return;
        }

        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => (data += chunk));
        res.on("end", () => {
          clearTimeout(timer);
          resolve(data);
        });
        res.on("error", (err: Error) => {
          clearTimeout(timer);
          reject(err);
        });
      }
    );
    req.on("error", (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

interface GogoSearchResult {
  slug: string;
  name: string;
}

async function searchAnime(query: string): Promise<GogoSearchResult[]> {
  const cached = slugCache.get(query.toLowerCase());
  // Cache is only for single-slug lookups, search always fresh

  const html = await fetchHtml(
    `${ANITAKU_BASE}/search.html?keyword=${encodeURIComponent(query)}`
  );

  const regex = /<a\s+href="\/category\/([^"]+)"[^>]*title="([^"]+)"/g;
  let match;
  const results: GogoSearchResult[] = [];
  while ((match = regex.exec(html)) !== null) {
    // Deduplicate
    if (!results.find(r => r.slug === match![1])) {
      results.push({ slug: match[1], name: match[2] });
    }
  }

  // Cache the best match
  if (results.length > 0) {
    const queryLower = query.toLowerCase();
    const best = results.find(r => r.name.toLowerCase() === queryLower) || results[0];
    slugCache.set(query.toLowerCase(), { slug: best.slug, ts: Date.now() });
  }

  return results;
}

async function getBestSlug(query: string): Promise<string | null> {
  const cached = slugCache.get(query.toLowerCase());
  if (cached && Date.now() - cached.ts < 30 * 60 * 1000) return cached.slug;

  const results = await searchAnime(query);
  if (results.length === 0) return null;

  const queryLower = query.toLowerCase();
  const exact = results.find(r => r.name.toLowerCase() === queryLower);
  const contains = results.find(r => r.name.toLowerCase().includes(queryLower));
  const slug = (exact || contains || results[0]).slug;
  slugCache.set(query.toLowerCase(), { slug, ts: Date.now() });
  return slug;
}

interface GogoEpisode {
  num: number;
  slug: string;
}

async function getEpisodeList(slug: string): Promise<GogoEpisode[]> {
  const html = await fetchHtml(`${ANITAKU_BASE}/category/${slug}`);

  // Method 1: data-num pattern (most reliable)
  const epRegex = /href="\/([^"]+)"\s+data-num="(\d+)"/g;
  let match;
  const episodes: GogoEpisode[] = [];
  const seen = new Set<number>();

  while ((match = epRegex.exec(html)) !== null) {
    const num = parseInt(match[2]);
    if (!seen.has(num)) {
      seen.add(num);
      episodes.push({ slug: match[1], num });
    }
  }

  // Method 2: Simple episode link pattern (fallback)
  if (episodes.length === 0) {
    const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const epRegex2 = new RegExp(`href="/(${escaped}-episode-(\\d+))"`, "g");
    let match2;
    while ((match2 = epRegex2.exec(html)) !== null) {
      const num = parseInt(match2[2]);
      if (!seen.has(num)) {
        seen.add(num);
        episodes.push({ slug: match2[1], num });
      }
    }
  }

  // Sort by episode number
  episodes.sort((a, b) => a.num - b.num);
  return episodes;
}

interface GogoServer {
  server: string;
  url: string;
  type: "iframe" | "m3u8";
}

async function getEpisodeServers(slug: string, episode: number): Promise<GogoServer[]> {
  const epUrl = `${ANITAKU_BASE}/${slug}-episode-${episode}`;
  const html = await fetchHtml(epUrl);

  const servers: GogoServer[] = [];
  const seenUrls = new Set<string>();

  // Extract embed/iframe URLs
  const embedRegex = /https?:\/\/[^\s"'<>]+\/(?:embed|e)\/[a-zA-Z0-9]+/g;
  let match;
  while ((match = embedRegex.exec(html)) !== null) {
    if (!seenUrls.has(match[0])) {
      seenUrls.add(match[0]);
      try {
        const hostname = new URL(match[0]).hostname;
        servers.push({
          server: hostname.replace(/\.[a-z]+\.?\w*$/, ""),
          url: match[0],
          type: hostname.includes("vibeplayer") ? "m3u8" : "iframe",
        });
      } catch { /* skip */ }
    }
  }

  // Also look for stream links in the HTML (data-video pattern)
  const videoRegex = /data-video="([^"]+)"/g;
  while ((match = videoRegex.exec(html)) !== null) {
    let url = match[1];
    if (!url.startsWith("http")) url = `https:${url}`;
    if (!seenUrls.has(url)) {
      seenUrls.add(url);
      try {
        const hostname = new URL(url).hostname;
        servers.push({
          server: hostname.replace(/\.[a-z]+\.?\w*$/, ""),
          url,
          type: url.includes(".m3u8") ? "m3u8" : "iframe",
        });
      } catch { /* skip */ }
    }
  }

  return servers;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "search";
    const query = searchParams.get("q") || "";
    const slug = searchParams.get("slug") || "";
    const episode = parseInt(searchParams.get("ep") || "1", 10);

    if (action === "search") {
      if (!query) {
        return NextResponse.json({ error: "q parameter required" }, { status: 400 });
      }
      const results = await searchAnime(query);
      return NextResponse.json({ success: true, results });
    }

    if (action === "slug") {
      if (!query) {
        return NextResponse.json({ error: "q parameter required" }, { status: 400 });
      }
      const foundSlug = await getBestSlug(query);
      if (!foundSlug) {
        return NextResponse.json({ error: "Not found", query }, { status: 404 });
      }
      return NextResponse.json({ slug: foundSlug, query });
    }

    if (action === "episodes") {
      const foundSlug = slug || (query ? await getBestSlug(query) : null);
      if (!foundSlug) {
        return NextResponse.json({ error: "Not found", query }, { status: 404 });
      }
      const episodes = await getEpisodeList(foundSlug);
      return NextResponse.json({ success: true, slug: foundSlug, episodes, total: episodes.length });
    }

    if (action === "servers") {
      const foundSlug = slug || (query ? await getBestSlug(query) : null);
      if (!foundSlug) {
        return NextResponse.json({ error: "Not found", query }, { status: 404 });
      }
      const servers = await getEpisodeServers(foundSlug, episode);
      return NextResponse.json({ success: true, servers, slug: foundSlug, episode });
    }

    if (action === "stream") {
      const foundSlug = slug || (query ? await getBestSlug(query) : null);
      if (!foundSlug) {
        return NextResponse.json({ error: "Not found", query }, { status: 404 });
      }
      const servers = await getEpisodeServers(foundSlug, episode);
      const m3u8 = servers.find((s) => s.type === "m3u8");
      if (m3u8) {
        return NextResponse.json({ url: m3u8.url, type: "hls", server: m3u8.server, slug: foundSlug, episode });
      }
      const iframe = servers.find((s) => s.type === "iframe");
      if (iframe) {
        return NextResponse.json({ url: iframe.url, type: "iframe", server: iframe.server, slug: foundSlug, episode, allServers: servers });
      }
      return NextResponse.json({ error: "No streams found" }, { status: 404 });
    }

    return NextResponse.json(
      { error: "Invalid action. Use: search, slug, episodes, servers, stream" },
      { status: 400 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Anitaku API failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
