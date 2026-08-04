import { NextRequest } from "next/server";

// ============================================================
// HLS RESOLVE — fetches master + sub-playlist in ONE request
//
// Instead of hls.js making 2 sequential requests:
//   1. GET /api/hls-proxy?url=MASTER → master m3u8
//   2. GET /api/hls-proxy?url=SUB-PLAYLIST → sub-playlist
//
// This endpoint does BOTH on the server side and returns
// the final sub-playlist with rewritten URLs directly.
// This cuts load time by ~50% (one round-trip instead of two).
// ============================================================

export const runtime = "edge";
export const dynamic = "force-dynamic";

const NO_CACHE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
};

const FETCH_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  Accept: "*/*",
};

function buildFetchHeaders(url: string, customReferer?: string | null): Record<string, string> {
  let referer = "https://dami-tv.pro/";
  let origin = "https://dami-tv.pro";
  if (customReferer) {
    referer = customReferer;
    try { origin = new URL(customReferer).origin; } catch {}
  } else {
    try {
      const parsed = new URL(url);
      referer = parsed.origin + "/";
      origin = parsed.origin;
    } catch {}
  }
  return { ...FETCH_HEADERS, Referer: referer, Origin: origin };
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return new Response(JSON.stringify({ error: "Missing url param" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...NO_CACHE_HEADERS },
    });
  }

  // SSRF protection: block private/internal IPs
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return new Response(JSON.stringify({ error: "Invalid protocol" }), {
        status: 400, headers: { "Content-Type": "application/json", ...NO_CACHE_HEADERS },
      });
    }
    const host = parsed.hostname;
    if (host === "localhost" || host === "127.0.0.1" || host.startsWith("192.168.") ||
        host.startsWith("10.") || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host) ||
        host.endsWith(".local") || host === "::1" || host.startsWith("fe80:") ||
        host.startsWith("fc00:") || host.startsWith("fd00:") ||
        host.startsWith("169.254.") || /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./.test(host)) {
      return new Response(JSON.stringify({ error: "Host not allowed" }), {
        status: 403, headers: { "Content-Type": "application/json", ...NO_CACHE_HEADERS },
      });
    }
  } catch {
    return new Response(JSON.stringify({ error: "Invalid URL" }), {
      status: 400, headers: { "Content-Type": "application/json", ...NO_CACHE_HEADERS },
    });
  }

  try {
    // Accept optional referer param
    const customReferer = request.nextUrl.searchParams.get("referer");
    const headers = buildFetchHeaders(url, customReferer);

    // Step 1: Fetch the master m3u8
    const masterResp = await fetch(url, {
      headers,
      cache: "no-store",
    });
    const masterText = await masterResp.text();

    if (!masterText.trimStart().startsWith("#EXTM3U")) {
      return new Response(masterText, {
        status: masterResp.status,
        headers: {
          "Content-Type":
            masterResp.headers.get("content-type") || "application/octet-stream",
          "Access-Control-Allow-Origin": "*",
          ...NO_CACHE_HEADERS,
        },
      });
    }

    // Step 2: Check if this is a master playlist (has #EXT-X-STREAM-INF)
    // If so, return the rewritten master so hls.js can choose quality levels.
    // Previously we resolved to a single sub-playlist here, but that always
    // picked the first (lowest quality) entry, breaking the quality selector.
    const isMasterPlaylist = masterText.includes("#EXT-X-STREAM-INF");

    if (isMasterPlaylist) {
      // Return the rewritten master playlist — hls.js will handle
      // quality level selection and sub-playlist loading itself.
      const rewritten = rewriteM3U8(masterText, url, customReferer || undefined);
      return new Response(rewritten, {
        status: masterResp.status,
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Access-Control-Allow-Origin": "*",
          ...NO_CACHE_HEADERS,
        },
      });
    }

    // Not a master playlist — this is a media playlist already.
    // Return it with rewritten URLs.
    const rewritten = rewriteM3U8(masterText, url, customReferer || undefined);
    return new Response(rewritten, {
      status: masterResp.status,
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Access-Control-Allow-Origin": "*",
        ...NO_CACHE_HEADERS,
      },
    });
  } catch (err: any) {
    console.error("HLS resolve error:", err.message, "URL:", url);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502,
      headers: { "Content-Type": "application/json", ...NO_CACHE_HEADERS },
    });
  }
}

function rewriteM3U8(content: string, baseUrl: string, referer?: string): string {
  const lines = content.split(/\r?\n/);
  const result: string[] = [];

  let parsedBase: URL;
  try {
    parsedBase = new URL(baseUrl);
  } catch {
    return content;
  }

  const baseDir = parsedBase.href.substring(
    0,
    parsedBase.href.lastIndexOf("/") + 1
  );
  const baseOrigin = parsedBase.origin;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      result.push(line);
      continue;
    }

    if (trimmed.startsWith("#")) {
      const rewritten = rewriteUriAttributes(trimmed, baseDir, baseOrigin, referer);
      result.push(rewritten);
      continue;
    }

    let absoluteUrl: string;
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      absoluteUrl = trimmed;
    } else if (trimmed.startsWith("/")) {
      absoluteUrl = baseOrigin + trimmed;
    } else {
      absoluteUrl = baseDir + trimmed;
    }

    try {
      const parsedUrl = new URL(absoluteUrl);
      const needsProxy =
        parsedUrl.hostname === "dami-tv.pro" ||
        parsedUrl.hostname.endsWith(".dami-tv.pro");

      if (needsProxy) {
        const refParam = referer ? `&referer=${encodeURIComponent(referer)}` : "";
        result.push(`/api/hls-proxy?url=${encodeURIComponent(absoluteUrl)}${refParam}`);
      } else {
        result.push(absoluteUrl);
      }
    } catch {
      result.push(line);
    }
  }

  return result.join("\n");
}

function rewriteUriAttributes(
  line: string,
  baseDir: string,
  baseOrigin: string,
  referer?: string
): string {
  return line.replace(/URI="([^"]+)"/g, (match, uri: string) => {
    let absoluteUrl: string;
    if (uri.startsWith("http://") || uri.startsWith("https://")) {
      absoluteUrl = uri;
    } else if (uri.startsWith("/")) {
      absoluteUrl = baseOrigin + uri;
    } else {
      absoluteUrl = baseDir + uri;
    }

    try {
      const parsedUrl = new URL(absoluteUrl);
      const needsProxy =
        parsedUrl.hostname === "dami-tv.pro" ||
        parsedUrl.hostname.endsWith(".dami-tv.pro");

      if (needsProxy) {
        const refParam = referer ? `&referer=${encodeURIComponent(referer)}` : "";
        return `URI="/api/hls-proxy?url=${encodeURIComponent(absoluteUrl)}${refParam}"`;
      }
      return `URI="${absoluteUrl}"`;
    } catch {
      return match;
    }
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      ...NO_CACHE_HEADERS,
    },
  });
}
