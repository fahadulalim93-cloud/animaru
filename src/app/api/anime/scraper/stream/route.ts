/**
 * GET /api/anime/scraper/stream
 *
 * OWN HLS/MP4 stream proxy — based on AniVault's proxy pattern.
 * Uses axios (not Node fetch) because axios uses Node's https module
 * which has a different TLS fingerprint that Cloudflare doesn't block.
 *
 * What it does:
 *   1. Fetches upstream URL with correct Referer + Origin headers
 *   2. For m3u8: rewrites ALL internal URLs (segments, AES keys, sub-playlists)
 *      to route back through this proxy with the same referer
 *   3. For segments/MP4/keys: passes through raw bytes with correct content-type
 *   4. Adds permissive CORS headers
 *
 * Query params:
 *   url:    The upstream URL (encoded)
 *   ref:    Referer to send upstream (e.g., https://kwik.cx/ for kiwi)
 */
import { NextRequest } from "next/server";
import axios from "axios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Max-Age": "86400",
};

/** Build the proxy URL for rewriting internal m3u8 URLs */
function buildProxyUrl(proxyBase: string, url: string, ref?: string): string {
  const refParam = ref ? `&ref=${encodeURIComponent(ref)}` : "";
  return `${proxyBase}?url=${encodeURIComponent(url)}${refParam}`;
}

/** Rewrite all URLs in an m3u8 playlist to route through this proxy.
 *  For AES keys: fetch the key server-side and embed as data URI (bypasses CDN 403). */
async function rewriteHlsPlaylist(text: string, sourceUrl: string, proxyBase: string, ref?: string): Promise<string> {
  const base = new URL(sourceUrl);
  const lines = text.split(/\r?\n/);
  const rewritten: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { rewritten.push(line); continue; }

    // Handle #EXT-X-KEY with URI= — fetch the key server-side and embed as data URI
    // Uses curl (not axios) because curl's TLS fingerprint bypasses Cloudflare
    // for the key URL, while axios/fetch get 403'd.
    if (trimmed.startsWith("#EXT-X-KEY") && trimmed.includes('URI="')) {
      let newLine = line;
      const uriMatch = line.match(/URI="([^"]+)"/);
      if (uriMatch) {
        const keyUrl = new URL(uriMatch[1], base).toString();
        try {
          // Use curl for the AES key — curl works where axios/fetch fail
          const { execFile } = await import("node:child_process");
          const { promisify } = await import("node:util");
          const execFileAsync = promisify(execFile);

          const curlArgs = ["-s", "-L", "--max-time", "10", "-o", "-", "-w", "\n---HTTP:%{http_code}"];
          curlArgs.push("-H", `User-Agent: ${UA}`);
          curlArgs.push("-H", "Accept: *//*");
          curlArgs.push("-H", "Accept-Encoding: identity");
          if (ref) {
            curlArgs.push("-H", `Referer: ${ref}`);
            try { curlArgs.push("-H", `Origin: ${new URL(ref).origin}`); } catch {}
          }
          curlArgs.push(keyUrl);

          const { stdout } = await execFileAsync("curl", curlArgs, { timeout: 12000, encoding: "buffer" });
          const curlBuf = stdout as unknown as Buffer;
          const marker = Buffer.from("\n---HTTP:");
          const markerIdx = curlBuf.lastIndexOf(marker);
          let keyData: Buffer | null = null;
          let keyStatus = 0;
          if (markerIdx >= 0) {
            keyData = curlBuf.subarray(0, markerIdx);
            keyStatus = parseInt(curlBuf.subarray(markerIdx + marker.length).toString("utf-8"), 10) || 0;
          } else {
            keyData = curlBuf;
            keyStatus = 200;
          }

          if (keyStatus === 200 && keyData && keyData.length > 0 && keyData.length <= 64) {
            const keyBase64 = keyData.toString("base64");
            newLine = line.replace(/URI="[^"]+"/, `URI="data:application/octet-stream;base64,${keyBase64}"`);
            console.log(`[StreamProxy] AES key embedded via curl (${keyData.length} bytes)`);
          } else {
            throw new Error(`curl key fetch returned ${keyStatus}`);
          }
        } catch (curlErr) {
          // Fallback 2: cf-bypass pattern — Node https.request with explicit Host header
          // (from https://github.com/Shineii86/cf-bypass-server)
          // May work on Vercel's servers even if it fails locally (different IP)
          try {
            const keyUrlObj = new URL(keyUrl);
            const https = await import("node:https");
            const keyData2 = await new Promise<Buffer>((resolve, reject) => {
              const proxyReq = https.request({
                hostname: keyUrlObj.hostname,
                port: 443,
                path: keyUrlObj.pathname + keyUrlObj.search,
                method: "GET",
                headers: {
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
                  "Accept": "*/*",
                  "Accept-Encoding": "identity",
                  "Host": keyUrlObj.hostname,
                  ...(ref ? { Referer: ref } : {}),
                },
              }, (proxyRes) => {
                if (proxyRes.statusCode !== 200) {
                  reject(new Error(`https.request returned ${proxyRes.statusCode}`));
                  return;
                }
                const chunks: Buffer[] = [];
                proxyRes.on("data", (c) => chunks.push(c));
                proxyRes.on("end", () => resolve(Buffer.concat(chunks)));
              });
              proxyReq.on("error", reject);
              proxyReq.setTimeout(10000, () => { proxyReq.destroy(); reject(new Error("timeout")); });
              proxyReq.end();
            });

            if (keyData2.length > 0 && keyData2.length <= 64) {
              const keyBase64 = keyData2.toString("base64");
              newLine = line.replace(/URI="[^"]+"/, `URI="data:application/octet-stream;base64,${keyBase64}"`);
              console.log(`[StreamProxy] AES key embedded via https.request (${keyData2.length} bytes)`);
            } else {
              throw new Error("invalid key size");
            }
          } catch (httpsErr) {
            // Fallback 3: rewrite key URL through our proxy (may 403, but doesn't break manifest)
            newLine = line.replace(/URI="([^"]+)"/, (_m, uri) => {
              const absolute = new URL(uri, base).toString();
              return `URI="${buildProxyUrl(proxyBase, absolute, ref)}"`;
            });
            console.error(`[StreamProxy] AES key: curl + https.request both failed, using proxy URL fallback`);
          }
        }
      }
      rewritten.push(newLine);
      continue;
    }

    // Handle other URI= attributes (#EXT-X-MAP, #EXT-X-MEDIA, etc.)
    if (trimmed.startsWith("#") && trimmed.includes('URI="')) {
      rewritten.push(line.replace(/URI="([^"]+)"/g, (_m, uri) => {
        const absolute = new URL(uri, base).toString();
        return `URI="${buildProxyUrl(proxyBase, absolute, ref)}"`;
      }));
      continue;
    }

    // Pass through other comments
    if (trimmed.startsWith("#")) { rewritten.push(line); continue; }

    // Rewrite segment URLs
    try {
      const absolute = new URL(trimmed, base).toString();
      rewritten.push(buildProxyUrl(proxyBase, absolute, ref));
    } catch {
      rewritten.push(line);
    }
  }

  return rewritten.join("\n");
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const targetUrl = url.searchParams.get("url");
  const ref = url.searchParams.get("ref") || undefined;

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (!targetUrl) {
    return new Response(JSON.stringify({ error: "Missing 'url' parameter" }), {
      status: 400, headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  // Build referer + origin from ref param
  let referer: string | undefined;
  let origin: string | undefined;
  if (ref && /^https?:\/\//i.test(ref)) {
    referer = ref;
    try { origin = new URL(ref).origin; } catch {}
  }

  // Build proxy base for rewriting (preserves ref)
  const proxyBase = `/api/anime/scraper/stream`;
  const refParam = ref ? `&ref=${encodeURIComponent(ref)}` : "";

  try {
    // Use axios — it uses Node's https module which has a different
    // TLS fingerprint than undici (Node's fetch). Cloudflare doesn't block it.
    const response = await axios.get(targetUrl, {
      responseType: "arraybuffer",
      timeout: 15000,
      maxRedirects: 5,
      headers: {
        "User-Agent": UA,
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "identity", // no gzip — would corrupt binary
        ...(referer ? { Referer: referer } : {}),
        ...(origin ? { Origin: origin } : {}),
      },
    });

    const contentType = String(response.headers["content-type"] ?? "");
    const body = Buffer.from(response.data);

    // Check if this is an m3u8 manifest
    const isM3U8 = targetUrl.includes(".m3u8") ||
                   contentType.includes("mpegurl") ||
                   (body.length < 100000 && body.toString("utf8").trim().startsWith("#EXTM3U"));

    if (isM3U8) {
      const text = body.toString("utf8");
      if (!text.trim().startsWith("#EXTM3U")) {
        return new Response(JSON.stringify({
          error: "Upstream did not return a valid m3u8 playlist",
          body: text.slice(0, 300),
        }), { status: 502, headers: { "Content-Type": "application/json", ...CORS_HEADERS }});
      }
      const rewritten = await rewriteHlsPlaylist(text, targetUrl, proxyBase, ref);
      return new Response(rewritten, {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Cache-Control": "no-store, no-cache, must-revalidate",
          ...CORS_HEADERS,
        },
      });
    }

    // ─── Segment / Key / MP4 / VTT passthrough ──────────────────────
    // Force correct content-type based on URL, not upstream header
    // (uwucdn returns image/jpeg for TS segments, etc.)
    let responseContentType = contentType;
    const lowerUrl = targetUrl.toLowerCase();

    if (lowerUrl.includes(".key") || lowerUrl.includes("mon.key")) {
      responseContentType = "application/octet-stream"; // AES-128 key
    } else if (lowerUrl.includes(".vtt") || lowerUrl.includes("subtitles/")) {
      // WebVTT subtitle files (AniDap serves them from 1oe.lostproject.club)
      responseContentType = "text/vtt; charset=utf-8";
    } else if (lowerUrl.includes(".mp4") || lowerUrl.includes("video.mp4")) {
      responseContentType = "video/mp4";
    } else if (lowerUrl.includes(".ts") || lowerUrl.includes(".jpg") || lowerUrl.includes(".png")) {
      responseContentType = "video/MP2T"; // TS segments disguised as images
    } else if (lowerUrl.includes(".m4s")) {
      responseContentType = "video/mp4";
    } else if (contentType.includes("mp4") || contentType.includes("video")) {
      responseContentType = "video/mp4";
    } else if (contentType.includes("vtt") || contentType.includes("text")) {
      // Fallback: upstream says it's text/VTT — preserve it
      responseContentType = contentType;
    } else if (!contentType || contentType.includes("octet-stream")) {
      responseContentType = "video/MP2T"; // default for segments
    }

    return new Response(new Uint8Array(body), {
      status: 200,
      headers: {
        "Content-Type": responseContentType,
        "Cache-Control": "public, max-age=3600",
        "Content-Length": String(body.length),
        ...CORS_HEADERS,
      },
    });
  } catch (err: any) {
    const status = err?.response?.status || 502;
    const message = err?.message || String(err);
    console.error(`[StreamProxy] ${status} for ${targetUrl.slice(0, 80)}: ${message}`);
    return new Response(JSON.stringify({
      error: "Stream proxy failed",
      status,
      message,
    }), {
      status,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
}
