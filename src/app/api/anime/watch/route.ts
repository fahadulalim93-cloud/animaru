import { NextRequest, NextResponse } from "next/server";
import { createHash, createDecipheriv } from "crypto";
import { miruroInfo } from "@/lib/miruro-api";
import { searchAnime } from "@/lib/anime-api";
import { wrapM3u8Url } from "@/lib/proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Unified watch endpoint - uses ALL working sources:
// 1. AllAnime (primary - encrypted sources with decryption)
// 2. Anitaku/GogoAnime (fallback - iframe/m3u8 streams)
// 3. Miruro (info only - episodes/watch currently broken)

function parseAnimeId(rawId: string): { anilistId: number | null; cleanId: string } {
  const cleanId = rawId.replace(/^miruro_/, "");
  if (/^\d+$/.test(cleanId)) {
    return { anilistId: parseInt(cleanId), cleanId };
  }
  return { anilistId: null, cleanId };
}

// Anitaku scraper using native Node.js https
function fetchHtml(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? require("https") : require("http");
    const timer = setTimeout(() => { req.destroy(); reject(new Error("Timeout")); }, 15000);
    const req = mod.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      }
    }, (res: any) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const redirectUrl = res.headers.location.startsWith("http") ? res.headers.location : new URL(res.headers.location, url).href;
        res.resume();
        clearTimeout(timer);
        fetchHtml(redirectUrl).then(resolve).catch(reject);
        return;
      }
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => (data += chunk));
      res.on("end", () => { clearTimeout(timer); resolve(data); });
      res.on("error", (err: Error) => { clearTimeout(timer); reject(err); });
    });
    req.on("error", (err: Error) => { clearTimeout(timer); reject(err); });
  });
}

async function searchAnitaku(query: string): Promise<string | null> {
  try {
    const html = await fetchHtml(`https://anitaku.to/search.html?keyword=${encodeURIComponent(query)}`);
    const regex = /<a\s+href="\/category\/([^"]+)"[^>]*title="([^"]+)"/g;
    let match;
    const results: { slug: string; name: string }[] = [];
    while ((match = regex.exec(html)) !== null) {
      if (!results.find(r => r.slug === match![1])) {
        results.push({ slug: match[1], name: match[2] });
      }
    }
    if (results.length === 0) return null;
    const queryLower = query.toLowerCase();
    const exact = results.find(r => r.name.toLowerCase() === queryLower);
    const contains = results.find(r => r.name.toLowerCase().includes(queryLower));
    return (exact || contains || results[0]).slug;
  } catch { return null; }
}

async function getAnitakuStream(slug: string, episode: number): Promise<Array<{
  url: string; quality: string; sourceName: string; sourceType: "internal" | "external"; provider: string; type: string;
}>> {
  try {
    const epUrl = `https://anitaku.to/${slug}-episode-${episode}`;
    const html = await fetchHtml(epUrl);
    const sources: Array<{
      url: string; quality: string; sourceName: string; sourceType: "internal" | "external"; provider: string; type: string;
    }> = [];
    const seenUrls = new Set<string>();

    // Extract embed/iframe URLs
    const embedRegex = /https?:\/\/[^\s"'<>]+\/(?:embed|e)\/[a-zA-Z0-9]+/g;
    let match;
    while ((match = embedRegex.exec(html)) !== null) {
      if (!seenUrls.has(match[0])) {
        seenUrls.add(match[0]);
        try {
          const hostname = new URL(match[0]).hostname;
          const serverName = hostname.replace(/\.[a-z]+\.?\w*$/, "");
          const isM3u8 = hostname.includes("vibeplayer");
          sources.push({
            url: match[0],
            quality: isM3u8 ? "Auto" : "SD",
            sourceName: `Anitaku ${serverName}`,
            sourceType: isM3u8 ? "internal" : "external",
            provider: serverName,
            type: isM3u8 ? "hls" : "iframe",
          });
        } catch { /* skip */ }
      }
    }

    // Also look for data-video pattern
    const videoRegex = /data-video="([^"]+)"/g;
    while ((match = videoRegex.exec(html)) !== null) {
      let url = match[1];
      if (!url.startsWith("http")) url = `https:${url}`;
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        try {
          const hostname = new URL(url).hostname;
          const serverName = hostname.replace(/\.[a-z]+\.?\w*$/, "");
          const isM3u8 = url.includes(".m3u8");
          sources.push({
            url,
            quality: isM3u8 ? "Auto" : "SD",
            sourceName: `Anitaku ${serverName}`,
            sourceType: isM3u8 ? "internal" : "external",
            provider: serverName,
            type: isM3u8 ? "hls" : "iframe",
          });
        } catch { /* skip */ }
      }
    }

    return sources;
  } catch { return []; }
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  const episode = request.nextUrl.searchParams.get("episode") || "1";
  const translation = (request.nextUrl.searchParams.get("translation") || "sub") as "sub" | "dub";

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    const allSources: Array<{
      url: string;
      quality?: string;
      isM3U8?: boolean;
      sourceName: string;
      sourceType: "internal" | "external";
      provider: string;
      type?: string;
    }> = [];

    const { anilistId, cleanId } = parseAnimeId(id);
    let allAnimeId: string | null = null;
    let animeTitle: string | null = null;
    let anitakuSlug: string | null = null;

    // Step 1: Get anime title for cross-referencing
    if (anilistId) {
      try {
        const info = await miruroInfo(anilistId);
        animeTitle = info?.title?.english || info?.title?.romaji || null;
      } catch { /* ignore */ }
    } else {
      allAnimeId = cleanId;
    }

    // Step 2: Find AllAnime ID via title search
    if (animeTitle && !allAnimeId) {
      try {
        const searchResult = await searchAnime(animeTitle, 1, 5);
        if (searchResult.results?.length > 0) {
          const best = searchResult.results.find(
            (r: any) => r.englishName?.toLowerCase() === animeTitle!.toLowerCase() ||
                        r.name?.toLowerCase() === animeTitle!.toLowerCase()
          ) || searchResult.results[0];
          allAnimeId = best._id;
        }
      } catch { /* search failed */ }
    }

    // Step 3: Try AllAnime sources with server-side decrypt
    if (allAnimeId) {
      try {
        const aaSources = await getEpisodeSourcesServer(allAnimeId, episode, translation);
        for (const s of aaSources) {
          const sourceType = s.type === "iframe" ? "external" as const : "internal" as const;
          allSources.push({
            url: s.url,
            quality: s.quality || (s.type === "hls" ? "Auto" : "SD"),
            isM3U8: s.type === "hls",
            sourceName: s.sourceName,
            sourceType,
            provider: s.provider || "AllAnime",
            type: s.type,
          });
        }
      } catch (err) {
        console.error("[Watch API] AllAnime sources error:", err);
      }
    }

    // Step 4: Try Anitaku/GogoAnime as fallback/extra source
    if (animeTitle) {
      try {
        anitakuSlug = await searchAnitaku(animeTitle);
        // If not found, try with romaji title
        if (!anitakuSlug && anilistId) {
          const info = await miruroInfo(anilistId).catch(() => null);
          const romaji = info?.title?.romaji;
          if (romaji && romaji !== animeTitle) {
            anitakuSlug = await searchAnitaku(romaji);
          }
        }
        if (anitakuSlug) {
          // For dub, try "(Dub)" suffix
          const dubSlug = translation === "dub" ? await searchAnitaku(`${animeTitle} (Dub)`) : null;
          const activeSlug = dubSlug || anitakuSlug;

          const anitakuSources = await getAnitakuStream(activeSlug, parseInt(episode));
          for (const s of anitakuSources) {
            allSources.push({
              url: s.url,
              quality: s.quality,
              isM3U8: s.type === "hls",
              sourceName: s.sourceName,
              sourceType: s.sourceType,
              provider: s.provider,
              type: s.type,
            });
          }
        }
      } catch (err) {
        console.error("[Watch API] Anitaku sources error:", err);
      }
    }

    if (allSources.length === 0) {
      return NextResponse.json({
        error: "No sources found. Try a different episode or translation.",
        sources: [],
        _debug: { allAnimeId, anitakuSlug, animeTitle }
      }, { status: 404 });
    }

    // Separate into internal and external
    const internal = allSources.filter(s => s.sourceType === "internal");
    const external = allSources.filter(s => s.sourceType === "external");

    // Get unique provider names for UI
    const providerNames = [...new Set(allSources.map(s => s.provider))];

    return NextResponse.json({
      sources: allSources,
      internal,
      external,
      providers: providerNames,
      provider: allSources[0]?.provider || "Unknown",
      type: allSources[0]?.type || "hls",
      _debug: { allAnimeId, anitakuSlug, animeTitle },
    });
  } catch (error) {
    console.error("[Watch API] Unexpected error:", error);
    return NextResponse.json({ error: "Watch failed. Please try again." }, { status: 500 });
  }
}

// Classify a URL as internal (direct play) or external (iframe/redirect)
function classifySource(url: string): "internal" | "external" {
  if (!url) return "internal";
  const externalPatterns = [
    "/embed", "/e/", "vibeplayer", "otakuvid", "megaplay",
    "mp4upload", "vidnest", "ok.ru", "allanime.uns",
    "streamtape", "doodstream", "mixdrop",
  ];
  const lower = url.toLowerCase();
  if (externalPatterns.some(p => lower.includes(p))) return "external";
  return "internal";
}

// Server-side version that decrypts tobeparsed inline
async function getEpisodeSourcesServer(
  showId: string,
  episodeString: string,
  translationType: string = "sub"
) {
  const API_URL = "https://api.allanime.day/api";

  const PERSISTED_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
    Accept: "application/json",
    Referer: "https://allmanga.to/",
    Origin: "https://youtu-chan.com",
  };

  const HEADERS = {
    Origin: "https://allmanga.to",
    Referer: "https://allmanga.to/",
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
  };

  function decodeUrl(url: string): string {
    if (!url) return "";
    if (url.startsWith("--")) {
      const hex = url.slice(2);
      let result = "";
      for (let i = 0; i < hex.length; i += 2) {
        const byte = parseInt(hex.substr(i, 2), 16) ^ 56;
        result += String.fromCharCode(byte);
      }
      return result;
    }
    if (url.startsWith("ap/")) {
      const hex = url.slice(3);
      let result = "";
      for (let i = 0; i < hex.length; i += 2) {
        result += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
      }
      return result;
    }
    return url;
  }

  function decryptTobeparsed(blob: string) {
    try {
      const key = createHash("sha256").update("Xot36i3lK3:v1").digest();
      const buf = Buffer.from(blob, "base64");
      const iv = Buffer.concat([buf.slice(1, 13), Buffer.from("00000002", "hex")]);
      const ciphertext = buf.slice(13, buf.length - 16);
      const decipher = createDecipheriv("aes-256-ctr", key, iv);
      const decrypted = decipher.update(ciphertext).toString() + decipher.final().toString();

      try {
        const parsed = JSON.parse(decrypted);
        if (parsed?.episode?.sourceUrls) return parsed.episode.sourceUrls;
        if (Array.isArray(parsed)) return parsed;
      } catch { /* partial corruption */ }

      const sourceUrls: Array<{ sourceUrl: string; sourceName: string; type?: string }> = [];
      const urlRegex = /"sourceUrl"\s*:\s*"([^"]+)"/g;
      const nameRegex = /"sourceName"\s*:\s*"([^"]+)"/g;
      const typeRegex = /"type"\s*:\s*"([^"]+)"/g;
      const urls: string[] = [], names: string[] = [], types: string[] = [];
      let m;
      while ((m = urlRegex.exec(decrypted)) !== null) urls.push(m[1]);
      while ((m = nameRegex.exec(decrypted)) !== null) names.push(m[1]);
      while ((m = typeRegex.exec(decrypted)) !== null) types.push(m[1]);
      for (let i = 0; i < urls.length; i++) {
        sourceUrls.push({ sourceUrl: urls[i], sourceName: names[i] || "Unknown", type: types[i] || undefined });
      }
      return sourceUrls;
    } catch {
      return [];
    }
  }

  let data: any;
  try {
    const variables = JSON.stringify({ showId, translationType, episodeString });
    const extensions = JSON.stringify({
      persistedQuery: { version: 1, sha256Hash: "d405d0edd690624b66baba3068e0edc3ac90f1597d898a1ec8db4e5c43c00fec" },
    });
    const res = await fetch(
      `${API_URL}?variables=${encodeURIComponent(variables)}&extensions=${encodeURIComponent(extensions)}`,
      { headers: PERSISTED_HEADERS }
    );
    if (!res.ok) throw new Error(`Persisted query failed: ${res.status}`);
    const json = await res.json();
    if (json.errors) throw new Error(`GraphQL error`);
    data = json.data;
  } catch {
    try {
      const query = `query ($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) { episode(showId: $showId, translationType: $translationType, episodeString: $episodeString) { episodeString sourceUrls } }`;
      const res = await fetch(API_URL, {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({ query, variables: { showId, translationType, episodeString } }),
      });
      const json = await res.json();
      if (json.errors) throw new Error(`GraphQL error`);
      data = json.data;
    } catch { return []; }
  }

  const episodeData = data?.episode;
  let allSources: Array<{ sourceUrl: string; sourceName: string; type?: string }> = [];

  const tobeparsedData = data?.tobeparsed || episodeData?.tobeparsed;
  if (tobeparsedData && typeof tobeparsedData === "string") {
    const decrypted = decryptTobeparsed(tobeparsedData);
    if (decrypted.length > 0) allSources = decrypted;
  }

  if (allSources.length === 0 && Array.isArray(episodeData?.sourceUrls)) {
    allSources = episodeData.sourceUrls.map((s: any) => ({
      sourceUrl: typeof s === "string" ? s : s.sourceUrl || "",
      sourceName: typeof s === "string" ? "Unknown" : s.sourceName || "Unknown",
      type: typeof s === "string" ? undefined : s.type,
    }));
  }

  if (allSources.length === 0) return [];

  interface StreamSource {
    url: string; rawUrl: string; sourceName: string; type: "iframe" | "hls" | "mp4"; provider: string; quality?: string;
  }

  const sources: StreamSource[] = [];

  for (const s of allSources) {
    let url = s.sourceUrl || "";
    if (!url) continue;
    if (url.startsWith("--") || url.startsWith("ap/")) url = decodeUrl(url);
    if (!url.startsWith("http")) continue;

    const sourceName = s.sourceName || "Unknown";
    const apiType = s.type || "";
    const provider = sourceName.match(/^([^:]+):\/\//)?.[1]?.trim() || sourceName.split("-")[0]?.trim() || sourceName;

    let type: "iframe" | "hls" | "mp4";
    if (apiType === "iframe" || url.includes("/embed") || url.includes("/e/") ||
        url.includes("vibeplayer") || url.includes("otakuvid") || url.includes("megaplay") ||
        url.includes("mp4upload") || url.includes("vidnest") || url.includes("ok.ru") || url.includes("allanime.uns")) {
      type = "iframe";
    } else if (url.includes(".m3u8") || apiType === "hls" || url.includes("/clock.json") || provider.includes("Default") || url.includes("wixmp")) {
      type = "hls";
    } else {
      type = "mp4";
    }

    let streamUrl = url;
    if (type === "hls" || type === "mp4") {
      if (url.includes("/clock") || url.includes("wixmp") || url.includes("allanime.day")) {
        try {
          const resolveRes = await fetch(url, {
            headers: { ...HEADERS, Origin: "https://allmanga.to" },
            redirect: "follow",
          });
          if (resolveRes.ok) {
            const ct = resolveRes.headers.get("content-type") || "";
            if (ct.includes("json")) {
              const json = await resolveRes.json();
              const resolvedUrl = json?.links?.reduce?.((best: any, link: any) =>
                parseInt(link.resolutionStr) > parseInt(best.resolutionStr) ? link : best, json.links[0])?.link
                || json?.link || json?.url || json?.stream;
              if (resolvedUrl) {
                streamUrl = wrapM3u8Url(resolvedUrl);
                type = "hls";
              }
            } else if (ct.includes("mpegurl") || resolveRes.url?.includes?.(".m3u8")) {
              streamUrl = wrapM3u8Url(resolveRes.url);
              type = "hls";
            }
          }
        } catch { /* use original URL */ }
      }
      if (streamUrl === url) {
        streamUrl = wrapM3u8Url(url);
      }
    }

    sources.push({ url: streamUrl, rawUrl: url, sourceName, type, provider });
  }

  return sources;
}
