import { NextRequest } from "next/server";

// ============================================================
// HLS PROXY — m3u8 MANIFESTS ONLY, NO CACHING
//
// Only proxies m3u8 manifest files. Segments go DIRECT to
// rotrimpalkis.shop (they have CORS headers).
//
// KEY DESIGN:
// 1. Detect m3u8 by #EXTM3U content (not content-type)
// 2. Rewrite dami-tv.pro URLs → through proxy
// 3. Rewrite rotrimpalkis.shop URLs → keep direct (CORS OK)
// 4. NEVER cache — fresh upstream request every time
// 5. If NOT m3u8, return 404 — segments should NOT come here
// ============================================================

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return new Response(JSON.stringify({ error: "Missing url param" }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  }

  // SSRF protection: only allow known CDN hosts
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return new Response(JSON.stringify({ error: "Invalid protocol" }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }
    // Block private/internal IPs
    const host = parsed.hostname;
    if (host === "localhost" || host === "127.0.0.1" || host.startsWith("192.168.") ||
        host.startsWith("10.") || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host) ||
        host.endsWith(".local") || host === "::1" || host.startsWith("fe80:") ||
        host.startsWith("fc00:") || host.startsWith("fd00:") ||
        host.startsWith("169.254.") || /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./.test(host)) {
      return new Response(JSON.stringify({ error: "Host not allowed" }), {
        status: 403, headers: { "Content-Type": "application/json" },
      });
    }
  } catch {
    return new Response(JSON.stringify({ error: "Invalid URL" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Accept optional referer param — fall back to the URL's own origin
    const customReferer = request.nextUrl.searchParams.get("referer");
    let referer = "https://dami-tv.pro/";
    let origin = "https://dami-tv.pro";
    if (customReferer) {
      referer = customReferer;
      try { origin = new URL(customReferer).origin; } catch {}
    } else {
      // Default to the upstream URL's own origin as referer
      try {
        const parsed = new URL(url);
        referer = parsed.origin + "/";
        origin = parsed.origin;
      } catch {}
    }

    const upstream = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "*/*",
        Referer: referer,
        Origin: origin,
      },
      // No caching — always get fresh from upstream
      cache: "no-store",
    });

    const text = await upstream.text();

    // ONLY process m3u8 manifests — detected by content
    if (text.trimStart().startsWith("#EXTM3U")) {
      const rewritten = rewriteM3U8(text, url, referer);

      return new Response(rewritten, {
        status: upstream.status,
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "*",
          // ABSOLUTELY NO CACHING — live playlists must be fresh
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
          "CDN-Cache-Control": "no-store",
          "Vercel-CDN-Cache-Control": "no-store",
        },
      });
    }

    // NOT m3u8 — this shouldn't happen in normal flow
    // Segments should go directly to rotrimpalkis.shop, NOT through proxy
    console.error("Non-m3u8 content received at proxy, URL:", url);

    return new Response(JSON.stringify({ error: "Non-m3u8 content received at proxy" }), {
      status: 502,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    console.error("HLS proxy error:", err.message, "URL:", url);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
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

    // URL line — resolve and route appropriately
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
        result.push(
          `/api/hls-proxy?url=${encodeURIComponent(absoluteUrl)}${refParam}`
        );
      } else {
        // Direct — segment servers have CORS
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
      "Cache-Control": "no-store",
    },
  });
}
