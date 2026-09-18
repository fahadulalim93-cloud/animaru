/**
 * ═══════════════════════════════════════════════════════════════════════
 *  LuffyTV Same-Domain Proxy — /p/{xor-token}
 *  Cloudflare-routed, served from luffytv.live (NOT api.luffytv.live)
 *
 *  This is the SAME logic as the api.luffytv.live Coolify proxy, but
 *  running inside Next.js so the browser reuses the HTTP/2 connection
 *  already open for the page (no DNS lookup, no TLS handshake, no extra
 *  TCP connection). Saves ~100-300ms per request vs cross-domain.
 *
 *  URL pattern: luffytv.live/p/{xor-token}
 *    Token = base64url(XOR(url + "\0" + referer, XOR_KEY))
 *
 *  ENDPOINTS:
 *    /p/{token}            → video / m3u8 / segments  (this file)
 *    /api/stream?url=...   → legacy subtitle + fallback proxy (unchanged)
 *
 *  CACHING:
 *    - Segments (.ts/.m4s/.mp4): edge-cached 24h via Cache-Control: immutable
 *    - VOD m3u8 (#EXT-X-ENDLIST): edge-cached 60s (short TTL — survives
 *      accidental purge but still fresh enough for VOD)
 *    - Live m3u8: no-cache (always fetch fresh)
 * ═══════════════════════════════════════════════════════════════════════
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
// IMPORTANT: Do NOT set `dynamic = "force-dynamic"` here.
// Next.js strips Cache-Control headers from dynamic routes, which prevents
// Cloudflare from edge-caching segments. Instead, we use `revalidate = 0`
// (always revalidate) combined with explicit Cache-Control headers in the
// Response object's headers. Cloudflare respects CDN-Cache-Control as a
// fallback hint when Cache-Control is stripped by the origin framework.
export const revalidate = 0;
// Don't let Next.js's fetch cache interfere — we manage caching via
// response headers, not Next.js's fetch wrapper.
export const fetchCache = "force-no-store";

// ─────────────────────────────────────────────────────────────────────
//  XOR KEY (must match src/lib/proxy.ts and worker.js EXACTLY)
// ─────────────────────────────────────────────────────────────────────
const XOR_KEY = "10b06cdc1ca48c9fb0b94af97cc040cf";

// ─────────────────────────────────────────────────────────────────────
//  CDN RULES — Referer / Origin per host (mirrors worker.js)
// ─────────────────────────────────────────────────────────────────────
type CdnRule = {
  test: (h: string) => boolean;
  referer: string;
  origin?: string;
  secSite?: "same-origin" | "cross-site";
};

const CDN_RULES: CdnRule[] = [
  { test: (h) => h.endsWith(".flixcloud.cc") || h === "flixcloud.cc",
    referer: "https://flixcloud.cc/", origin: "https://flixcloud.cc", secSite: "same-origin" },
  { test: (h) => /^vault\d+\.slopnet\.site$/i.test(h) || h.endsWith(".slopnet.site"),
    referer: "https://flixcloud.cc/", origin: "https://flixcloud.cc", secSite: "cross-site" },
  { test: (h) => h.endsWith(".24stream.xyz") || h === "24stream.xyz",
    referer: "https://animex.one/", origin: "https://animex.one", secSite: "cross-site" },
  { test: (h) => h.endsWith(".anidb.app") || h === "anidb.app",
    referer: "https://www.miruro.tv/", origin: "https://www.miruro.tv", secSite: "cross-site" },
  { test: (h) => h.endsWith(".nekostream.site"),
    referer: "https://anilight.live/", origin: "https://anilight.live", secSite: "cross-site" },
  // AniLight Rem subtitles are served from cdn.anizara.store (shared with AniNeko)
  { test: (h) => h.endsWith(".anizara.store") || h === "anizara.store",
    referer: "https://anineko.to/", origin: "https://anineko.to", secSite: "cross-site" },
  { test: (h) => h.endsWith(".owocdn.top") || h.endsWith(".uwucdn.top") ||
               /^[a-z]{2}-\d+\.(owocdn|uwucdn)\.top$/i.test(h),
    referer: "https://kwik.cx/", origin: "https://kwik.cx", secSite: "cross-site" },
  { test: (h) => h === "kwik.cx" || h.endsWith(".kwik.cx") || h === "kwik.si" || h.endsWith(".kwik.si"),
    referer: "https://kwik.cx/", origin: "https://kwik.cx", secSite: "same-origin" },
  { test: (h) => h === "megaplay.buzz" || h.endsWith(".megaplay.buzz"),
    referer: "https://megaplay.buzz/", origin: "https://megaplay.buzz", secSite: "same-origin" },
  { test: (h) => h.endsWith(".streamzone1.site") || h.endsWith(".mewstream.buzz") || h.endsWith(".cinewave2.site"),
    referer: "https://megaplay.buzz/", origin: "https://megaplay.buzz", secSite: "cross-site" },
  { test: (h) => h.endsWith(".krussdomi.com"),
    referer: "https://krussdomi.com/", origin: "https://krussdomi.com", secSite: "same-origin" },
  { test: (h) => h === "vibeplayer.site" || h.endsWith(".vibeplayer.site") ||
               h === "vivibebe.site" || h.endsWith(".vivibebe.site"),
    referer: "https://vibeplayer.site/", origin: "https://vibeplayer.site", secSite: "same-origin" },
  // s1.akirax.buzz — AniKage stream CDN (needs megaplay.buzz referer)
  // cdn.imgnex.top — MegaPlay subtitle CDN (needs megaplay.buzz referer)
  { test: (h) => h.endsWith(".imgnex.top") || h === "imgnex.top",
    referer: "https://megaplay.buzz/", origin: "https://megaplay.buzz", secSite: "cross-site" },
  // fetch.nexabloom.top — MegaPlay NEW subtitle CDN (rotated ~2026-09; needs megaplay.buzz referer)
  { test: (h) => h.endsWith(".nexabloom.top") || h === "nexabloom.top",
    referer: "https://megaplay.buzz/", origin: "https://megaplay.buzz", secSite: "cross-site" },
  // vidtub.norami.top — AniKoto VidPlay subtitle CDN (needs megaplay.buzz referer)
  { test: (h) => h.endsWith(".norami.top") || h.endsWith(".vidtub.norami.top"),
    referer: "https://megaplay.buzz/", origin: "https://megaplay.buzz", secSite: "cross-site" },
  // zuna (aniwatchtv.uk) — AniDap zuna provider
  { test: (h) => h.endsWith(".aniwatchtv.uk"),
    referer: "https://zokoanime.video/", origin: "https://zokoanime.video", secSite: "cross-site" },
  // loli (echovideo.to) — AniDap loli provider
  { test: (h) => h.endsWith(".echovideo.to") || h.endsWith(".echovideo.ru"),
    referer: "https://play2.echovideo.ru", origin: "https://play2.echovideo.ru", secSite: "cross-site" },
  { test: (h) => h.endsWith(".akirax.buzz") || h === "akirax.buzz",
    referer: "https://megaplay.buzz/", origin: "https://megaplay.buzz", secSite: "cross-site" },
  { test: (h) => h.endsWith(".animeapps.top"),
    referer: "https://playeng.animeapps.top/", origin: "https://playeng.animeapps.top", secSite: "same-origin" },
  { test: (h) => h.endsWith(".bigdreamsmalldih.site"),
    referer: "https://kwik.cx/", origin: "https://kwik.cx", secSite: "cross-site" },
  { test: (h) => h.endsWith(".anikage.cc"),
    referer: "https://anikage.cc/", origin: "https://anikage.cc", secSite: "cross-site" },
  { test: (h) => h === "allanime.uns.bio" || h.endsWith(".allanime.uns.bio"),
    referer: "https://allanime.uns.bio/", origin: "https://allanime.uns.bio", secSite: "same-origin" },
  { test: (h) => h.endsWith(".harmonixwellnessgroup.store"),
    referer: "https://allanime.uns.bio/", origin: "https://allanime.uns.bio", secSite: "cross-site" },
  { test: (h) => h.endsWith(".animeverse.to"),
    referer: "https://animeverse.to/", origin: "https://animeverse.to", secSite: "same-origin" },
  { test: (h) => h.endsWith(".animeonsen.xyz"),
    referer: "https://www.animeonsen.xyz/", origin: "https://www.animeonsen.xyz", secSite: "cross-site" },
  { test: (h) => h.endsWith(".clvd.xyz"),
    referer: "https://kem.clvd.xyz/", origin: "https://kem.clvd.xyz", secSite: "cross-site" },
  { test: (h) => h === "ani.pm" || h.endsWith(".ani.pm"),
    referer: "https://ani.pm/", origin: "https://ani.pm", secSite: "same-origin" },
  { test: (h) => h === "kyren.moe" || h.endsWith(".kyren.moe"),
    referer: "https://kyren.moe/", origin: "https://kyren.moe", secSite: "same-origin" },
  { test: (h) => h.endsWith(".anilight.live"),
    referer: "https://anilight.live/", origin: "https://anilight.live", secSite: "cross-site" },
  { test: (h) => h.endsWith(".anistream.one"),
    referer: "https://anistream.one/", origin: "https://anistream.one", secSite: "cross-site" },
  { test: (h) => h.endsWith(".anikuro.ru"),
    referer: "https://anikuro.ru/", origin: "https://anikuro.ru", secSite: "same-origin" },
  { test: (h) => h === "swiftstream.top" || h.endsWith(".swiftstream.top"),
    referer: "https://animetsu.live/", origin: "https://animetsu.live", secSite: "cross-site" },
  { test: (h) => h.endsWith(".animeheaven.me"),
    referer: "https://animeheaven.me/", origin: "https://animeheaven.me", secSite: "same-origin" },
  // anixtv.in rule removed — anixtv.in is offline, replaced by animesalt.cx (see as-cdn rule above)
  { test: (h) => h.endsWith(".blakiteanime.buzz") || h === "blakiteanime.buzz",
    referer: "https://www.blakiteanime.buzz/", origin: "https://www.blakiteanime.buzz", secSite: "same-origin" },
  { test: (h) => h === "blakiteapi.xyz",
    referer: "https://blakiteapi.xyz/", origin: "https://blakiteapi.xyz", secSite: "same-origin" },
  { test: (h) => h.endsWith(".desidubanime.me") || h === "desidubanime.me",
    referer: "https://www.desidubanime.me/", origin: "https://www.desidubanime.me", secSite: "same-origin" },
  { test: (h) => h.endsWith(".streamtape.com") || h === "streamtape.com",
    referer: "https://streamtape.com/", origin: "https://streamtape.com", secSite: "same-origin" },
  { test: (h) => h.endsWith(".doodstream.com") || h === "doodstream.com",
    referer: "https://doodstream.com/", origin: "https://doodstream.com", secSite: "same-origin" },
  { test: (h) => h.endsWith(".mixdrop.ag") || h === "mixdrop.ag",
    referer: "https://mixdrop.ag/", origin: "https://mixdrop.ag", secSite: "same-origin" },
  { test: (h) => h.endsWith(".mp4upload.com") || h === "mp4upload.com",
    referer: "https://www.mp4upload.com/", origin: "https://www.mp4upload.com", secSite: "same-origin" },
  { test: (h) => h.endsWith(".vidnest.fun") || h === "vidnest.fun",
    referer: "https://vidnest.fun/", origin: "https://vidnest.fun", secSite: "same-origin" },
  { test: (h) => h.endsWith(".zephyrix.top") || h === "play.zephyrix.top",
    referer: "https://watchanimeworld.top/", origin: "https://watchanimeworld.top", secSite: "cross-site" },
  // AnimeSalt CDN — as-cdn{21..29}.top serves multi-audio HLS streams.
  // Referer required: https://animesalt.cx/ (the WordPress site hosting the embed).
  // ⚠️ DO NOT send Origin header — ASCDN rejects requests that include Origin
  // (returns 500 / 403). Tested: Referer alone works, Referer+Origin fails.
  // Keep in sync with src/lib/proxy.ts CDN_REFERERS map.
  { test: (h) => /^as-cdn\d+\.top$/i.test(h),
    referer: "https://animesalt.cx/", secSite: "cross-site" },
  // Xanime.me — multi-CDN m3u8 + subtitle hosts (xanivsrc1.org ... xanivsrc10.org).
  // Fully open — no Referer / Origin required. Treat as cross-site to suppress
  // cookie relay (we don't want to forward user cookies to a third-party CDN).
  { test: (h) => /^xanivsrc\d+\.org$/i.test(h) || h === "xanivsrc.org",
    referer: "https://xanime.me/", origin: "https://xanime.me", secSite: "cross-site" },
];

function findRule(hostname: string): CdnRule | undefined {
  const h = hostname.toLowerCase();
  return CDN_RULES.find((r) => {
    try { return r.test(h); } catch { return false; }
  });
}

// ─────────────────────────────────────────────────────────────────────
//  XOR token decode (must match src/lib/proxy.ts encodeWorkerToken)
// ─────────────────────────────────────────────────────────────────────
function xorDecode(token: string): { url: string; ref: string } | null {
  try {
    // base64url → base64
    let b64 = token.replace(/-/g, "+").replace(/_/g, "/");
    // pad
    while (b64.length % 4) b64 += "=";
    const binary = Buffer.from(b64, "base64").toString("binary");
    const data = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) data[i] = binary.charCodeAt(i) & 0xff;

    const key = new TextEncoder().encode(XOR_KEY);
    const xored = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) xored[i] = data[i] ^ key[i % key.length];

    const combined = new TextDecoder().decode(xored);
    const parts = combined.split("\0");
    if (parts.length < 2) return null;
    return { url: parts[0], ref: parts[1] };
  } catch {
    return null;
  }
}

function xorEncode(url: string, referer: string): string {
  const combined = url + "\0" + referer;
  const key = new TextEncoder().encode(XOR_KEY);
  const data = new TextEncoder().encode(combined);
  const xored = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) xored[i] = data[i] ^ key[i % key.length];
  let binary = "";
  for (let i = 0; i < xored.length; i++) binary += String.fromCharCode(xored[i]);
  return Buffer.from(binary, "binary").toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ─────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, Content-Type",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, Content-Type, Accept-Ranges",
    "Accept-Ranges": "bytes",
  };
}

function browserHeaders(referer: string, origin: string | undefined, secSite: string, isBinary: boolean) {
  const h: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": isBinary ? "identity" : "gzip",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": secSite || "cross-site",
    "Sec-CH-UA": '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
    "Sec-CH-UA-Mobile": "?0",
    "Sec-CH-UA-Platform": '"Windows"',
    "Connection": "keep-alive",
  };
  if (referer) h["Referer"] = referer;
  if (origin) h["Origin"] = origin;
  return h;
}

function resolveUrl(rel: string, base: string): string {
  if (/^https?:\/\//i.test(rel)) return rel;
  try { return new URL(rel, base).href; } catch { return rel; }
}

function isVodManifest(text: string): boolean {
  return text.includes("#EXT-X-ENDLIST");
}

// Rewrite m3u8 so segment/key URLs go through OUR same-domain /p/{token}
// CF Worker URL — segments go through here for edge caching (NOT IP-locked)
const CF_WORKER_BASE = "https://luffytv-proxy.ggy892767.workers.dev";

// Rewrite m3u8: m3u8s → VPS /p/{token} (IP-locked), segments → CF Worker (cached)
function rewriteM3u8(text: string, baseUrl: string, referer: string): string {
  return text.split("\n").map((raw) => {
    const line = raw.trim();
    if (line.startsWith("#") && line.includes('URI="')) {
      return line.replace(/URI="([^"]+)"/g, (_, uri) => {
        const abs = resolveUrl(uri, baseUrl);
        // Audio playlist m3u8s → VPS (IP-locked)
        return `URI="/p/${xorEncode(abs, referer)}"`;
      });
    }
    if (line && !line.startsWith("#")) {
      const abs = resolveUrl(line, baseUrl);
      // .ts segments → CF Worker (NOT IP-locked, cached at edge for 24h)
      const token = xorEncode(abs, referer);
      return `${CF_WORKER_BASE}/p/${token}`;
    }
    return raw;
  }).join("\n");
}

// ─────────────────────────────────────────────────────────────────────
//  Main handler
// ─────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // ─── Decode token ─────────────────────────────────────────────────
  const decoded = xorDecode(token);
  if (!decoded || !decoded.url) {
    return NextResponse.json(
      { error: "Invalid token" },
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } }
    );
  }

  let targetUrl = decoded.url;
  let referer = decoded.ref;

  // Parse + validate
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("bad protocol");
  } catch {
    return NextResponse.json(
      { error: "Invalid target URL" },
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders() } }
    );
  }

  const targetHost = parsed.hostname.toLowerCase();
  const rule = findRule(targetHost);

  // Resolve effective Referer / Origin / Sec-Site
  let effectiveReferer = referer;
  let effectiveOrigin: string | undefined;
  let effectiveSecSite = "cross-site";
  if (rule) {
    effectiveReferer = rule.referer;
    effectiveOrigin = rule.origin;
    effectiveSecSite = rule.secSite || "cross-site";
  } else if (referer) {
    // Use the referer from token, derive origin from it
    try {
      const refUrl = new URL(referer);
      effectiveReferer = refUrl.origin + "/";
      effectiveOrigin = refUrl.origin;
      effectiveSecSite = "cross-site";
    } catch {
      effectiveReferer = `https://${targetHost}/`;
      effectiveOrigin = `https://${targetHost}`;
    }
  } else {
    effectiveReferer = `https://${targetHost}/`;
    effectiveOrigin = `https://${targetHost}`;
  }

  // ─── Determine request type ──────────────────────────────────────
  const urlPath = targetUrl.split("?")[0];
  const isM3u8 = urlPath.endsWith(".m3u8") || urlPath.endsWith("/master")
              || urlPath.endsWith("/index.m3u8") || urlPath.endsWith("/playlist");
  const isBinary = !isM3u8;
  const rangeHeader = request.headers.get("Range");

  // ─── HEAD request ────────────────────────────────────────────────
  if (request.method === "HEAD") {
    try {
      const headers = browserHeaders(effectiveReferer, effectiveOrigin, effectiveSecSite, isBinary);
      if (rangeHeader) headers["Range"] = rangeHeader;
      const resp = await fetch(targetUrl, { method: "HEAD", headers, redirect: "follow" });
      const h = {
        "Content-Type": resp.headers.get("Content-Type") || "application/octet-stream",
        ...corsHeaders(),
      };
      const cl = resp.headers.get("Content-Length");
      if (cl) (h as any)["Content-Length"] = cl;
      return new NextResponse(null, { status: resp.status, headers: h });
    } catch {
      return NextResponse.json(
        { error: "HEAD fetch failed" },
        { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders() } }
      );
    }
  }

  // ─── Build fetch headers ─────────────────────────────────────────
  const headers = browserHeaders(effectiveReferer, effectiveOrigin, effectiveSecSite, isBinary);
  if (rangeHeader) headers["Range"] = rangeHeader;

  // ─── Fetch upstream ──────────────────────────────────────────────
  // Smart retry: if 403/503 with cross-site referer, retry same-origin
  let upstreamResp: Response;
  try {
    upstreamResp = await fetch(targetUrl, {
      method: "GET",
      headers,
      redirect: "follow",
      cache: "no-store",
    });

    if (isM3u8 && (upstreamResp.status === 403 || upstreamResp.status === 503)) {
      // Retry with same-origin referer
      const h2 = browserHeaders(`https://${targetHost}/`, `https://${targetHost}`, "same-origin", false);
      if (rangeHeader) h2["Range"] = rangeHeader;
      upstreamResp = await fetch(targetUrl, { method: "GET", headers: h2, redirect: "follow", cache: "no-store" });
    }

    if (isM3u8 && (upstreamResp.status === 403 || upstreamResp.status === 503)) {
      // Last resort: no referer/origin
      const h3 = browserHeaders("", "", "cross-site", false);
      delete h3["Referer"];
      delete h3["Origin"];
      if (rangeHeader) h3["Range"] = rangeHeader;
      upstreamResp = await fetch(targetUrl, { method: "GET", headers: h3, redirect: "follow", cache: "no-store" });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Upstream fetch failed", detail: msg.substring(0, 200), host: targetHost },
      { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders() } }
    );
  }

  if (!upstreamResp.ok && upstreamResp.status !== 206) {
    return NextResponse.json(
      { error: "Upstream error", status: upstreamResp.status, host: targetHost },
      { status: upstreamResp.status, headers: { "Content-Type": "application/json", ...corsHeaders() } }
    );
  }

  // ─── M3U8 manifest: rewrite + return ─────────────────────────────
  const respCT = (upstreamResp.headers.get("Content-Type") || "").toLowerCase();
  const reallyM3u8 = isM3u8 || respCT.includes("mpegurl") || respCT.includes("x-mpegurl");

  if (reallyM3u8) {
    const text = await upstreamResp.text();
    const rewritten = rewriteM3u8(text, targetUrl, effectiveReferer);
    const vod = isVodManifest(text);
    // Cache VOD manifests at edge for 60s, live for 0s.
    const cc = vod ? "public, max-age=60, s-maxage=60" : "no-cache, must-revalidate";

    return new NextResponse(rewritten, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": cc,
        // Cloudflare-specific hints — CF respects these even when origin
        // strips Cache-Control via dynamic route handlers.
        ...(vod ? {
          "CDN-Cache-Control": "public, max-age=60",
          "Cloudflare-CDN-Cache-Control": "public, max-age=60",
        } : {}),
        ...corsHeaders(),
      },
    });
  }

  // ─── Binary segment: stream through ──────────────────────────────
  // Cache-Control: public, max-age=86400, immutable → CF edge caches for 24h.
  // Subsequent segment requests served from CF edge = ZERO latency.
  //
  // NOTE: We set Cache-Control, CDN-Cache-Control, AND Cloudflare-CDN-Cache-Control.
  // Next.js strips "Cache-Control" from dynamic route responses, but Cloudflare
  // respects "CDN-Cache-Control" and "Cloudflare-CDN-Cache-Control" as fallback
  // hints. Setting all three maximizes the chance CF will edge-cache the segment.
  const responseHeaders = new Headers();
  responseHeaders.set("Content-Type", upstreamResp.headers.get("Content-Type") || "application/octet-stream");
  for (const [k, v] of Object.entries(corsHeaders())) {
    responseHeaders.set(k, v as string);
  }
  const cl = upstreamResp.headers.get("Content-Length");
  const cr = upstreamResp.headers.get("Content-Range");
  if (cl) responseHeaders.set("Content-Length", cl);
  if (cr) responseHeaders.set("Content-Range", cr);
  responseHeaders.set("Cache-Control", "public, max-age=86400, immutable");
  responseHeaders.set("CDN-Cache-Control", "public, max-age=86400");
  responseHeaders.set("Cloudflare-CDN-Cache-Control", "public, max-age=86400");

  return new NextResponse(upstreamResp.body, {
    status: upstreamResp.status === 206 ? 206 : 200,
    headers: responseHeaders,
  });
}

// OPTIONS — CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}
