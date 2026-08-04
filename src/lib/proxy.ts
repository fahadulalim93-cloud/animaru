/**
 * Proxy helper for LuffyTV.
 *
 * Uses our Cloudflare Worker (luffytv-proxy.ggy892767.workers.dev) as the
 * ONLY proxy for ALL anime streams. Every CDN goes through the worker now.
 * Animetsu streams go through their own scraper proxy (animetsu-scraper-jade.vercel.app).
 *
 * Encoding: XOR(url + "\0" + referer, key) → base64url → /p/{token}
 * Key: "10b06cdc1ca48c9fb0b94af97cc040cf" (32 ASCII bytes)
 *
 * The worker returns m3u8 with segment URLs rewritten to /p/{token}
 * (relative paths) — so segments go through the same proxy automatically.
 */

// ─────────────────────────────────────────────────────────────────────
// PROXY CONFIG — Cloudflare Worker (THE ONLY PROXY)
// ─────────────────────────────────────────────────────────────────────
const XOR_KEY = "10b06cdc1ca48c9fb0b94af97cc040cf"; // 32 ASCII bytes

// Our Cloudflare Worker proxy — handles ALL streams (token endpoint /p/{token})
// AND API calls (legacy /proxy?url=... endpoint).
const WORKER_PROXY = process.env.NEXT_PUBLIC_PROXY_BASE || "https://luffytv-proxy.ggy892767.workers.dev";

// The worker's token endpoint: /p/{xor-token}
const WORKER_TOKEN_BASE = `${WORKER_PROXY}/p`;

// Referer map — encoded into the token so the proxy sends the correct Referer.
const CDN_REFERERS: Record<string, string> = {
  // 24stream.xyz — animex.one referer
  "bd.24stream.xyz":       "https://animex.one/",
  "hawk.24stream.xyz":     "https://animex.one/",
  "mp4.24stream.xyz":      "https://animex.one/",
  "ply.24stream.xyz":      "https://allanime.uns.bio/",
  // Miruro CDNs
  "hls.anidb.app":         "https://www.miruro.tv/",
  // nekostream.site CDNs (AniKoto) — need vidtube.site or megaplay.buzz referer
  "mt.nekostream.site":    "https://vidtube.site/",
  "9hjkrt.nekostream.site": "https://megaplay.buzz/",
  "vault-16.owocdn.top":   "https://kwik.cx/",
  "vault-01.uwucdn.top":   "https://kwik.cx/",
  "hls.krussdomi.com":     "https://krussdomi.com/",
  "s1.streamzone1.site":   "https://megaplay.buzz/",
  "cdn.mewstream.buzz":    "https://megaplay.buzz/",
  // vibeplayer / vivibebe — same-origin referer
  "vibeplayer.site":       "https://vibeplayer.site/",
  "vivibebe.site":         "https://vivibebe.site/",
  // playeng — same-origin referer (CRITICAL: 403 without it)
  "playeng.animeapps.top": "https://playeng.animeapps.top/",
  // MegaPlay
  "megaplay.buzz":         "https://megaplay.buzz/",
  // AniLight quality variants
  "nanobyte.bigdreamsmalldih.site": "https://kwik.cx/",
  // Kwik — same-origin
  "kwik.cx":               "https://kwik.cx/",
  // AniKage
  "prox.anikage.cc":       "https://anikage.cc/",
  // Senshi — ninstream.com needs Referer: https://senshi.live/
  "ninstream.com":         "https://senshi.live/",
  "xin-cdn.xyz":           "https://anizone.to/",
  // Kyren
  "api.kyren.moe":         "https://kyren.moe/",
  "kyren.moe":             "https://kyren.moe/",
  // AniDB
  "anidb.app":             "https://anidb.app/",
  // AniKage
  "anikage.cc":            "https://anikage.cc/",
  // Ani.pm
  "ani.pm":                "https://ani.pm/",
  // AnimeHeaven CDNs
  "py.animeheaven.me":     "https://animeheaven.me/",
  "ct.animeheaven.me":     "https://animeheaven.me/",
  "ck.animeheaven.me":     "https://animeheaven.me/",
  "rt.animeheaven.me":     "https://animeheaven.me/",
  "cx.animeheaven.me":     "https://animeheaven.me/",
  // allanime — same-origin
  "allanime.uns.bio":      "https://allanime.uns.bio/",
  // FlixCLOUD (ReAnime) — video segments and m3u8 manifests
  "fetch.flixcloud.cc":    "https://flixcloud.cc/",
  "fetch1.flixcloud.cc":   "https://flixcloud.cc/",
  "flixcloud.cc":          "https://flixcloud.cc/",
  // SlopNet (ReAnime subtitles/fonts)
  "vault94.slopnet.site":  "https://flixcloud.cc/",
  // harmonix (miku) — allanime referer
  "soq6.harmonixwellnessgroup.store": "https://allanime.uns.bio/",
};

// Wildcard referer patterns — matched against the URL hostname.
// Format: { regex: referer }
// Used when a CDN serves content from many numbered subdomains
// (e.g. vault-01.uwucdn.top, vault-99.owocdn.top) — adding each one
// individually is unscalable.
const CDN_REFERER_PATTERNS: Array<{ regex: RegExp; referer: string }> = [
  // AnimePahe CDNs — kwik.si is the player, so kwik.cx referer is required.
  // Without it, vault-XX.{owocdn,uwucdn}.top returns 403.
  { regex: /^vault-\d+\.owocdn\.top$/i, referer: "https://kwik.cx/" },
  { regex: /^vault-\d+\.uwucdn\.top$/i, referer: "https://kwik.cx/" },
  // Also catch eu-XX.uwucdn.top and other regional variants
  { regex: /^eu-\d+\.uwucdn\.top$/i,    referer: "https://kwik.cx/" },
  { regex: /^us-\d+\.uwucdn\.top$/i,    referer: "https://kwik.cx/" },
  { regex: /^[a-z]{2}-\d+\.(owocdn|uwucdn)\.top$/i, referer: "https://kwik.cx/" },
  // AnimeOnsen CDN — requires same-origin referer
  { regex: /\.animeonsen\.xyz$/i, referer: "https://www.animeonsen.xyz/" },
  { regex: /^cdn\.animeonsen\.xyz$/i, referer: "https://www.animeonsen.xyz/" },
  // SlopNet (ReAnime subtitles/fonts) — vault94.slopnet.site, vault99.slopnet.site, etc.
  { regex: /^vault\d+\.slopnet\.site$/i, referer: "https://flixcloud.cc/" },
  // FlixCLOUD CDNs — fetch1.flixcloud.cc, fetch2.flixcloud.cc, etc.
  { regex: /^fetch\d*\.flixcloud\.cc$/i, referer: "https://flixcloud.cc/" },
];

function getRefererFor(url: string): string {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;

    // 1. Exact hostname match
    if (CDN_REFERERS[hostname]) return CDN_REFERERS[hostname];

    // 2. Suffix match (e.g. "cdn.example.com" matches "example.com")
    for (const h of Object.keys(CDN_REFERERS)) {
      if (hostname.endsWith("." + h)) return CDN_REFERERS[h];
    }

    // 3. Wildcard pattern match (for vault-XX.{owocdn,uwucdn}.top etc.)
    for (const { regex, referer } of CDN_REFERER_PATTERNS) {
      if (regex.test(hostname)) return referer;
    }
  } catch {}
  return "https://www.miruro.tv/"; // default
}

/**
 * XOR encode + base64url encode for the worker proxy token.
 * Format: XOR(url + "\0" + referer, key) → base64url
 */
function encodeWorkerToken(url: string, referer: string): string {
  const combined = url + "\0" + referer;
  const keyBytes = new TextEncoder().encode(XOR_KEY);
  const dataBytes = new TextEncoder().encode(combined);
  const xored = new Uint8Array(dataBytes.length);
  for (let i = 0; i < dataBytes.length; i++) {
    xored[i] = dataBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  // Convert to base64url — use Buffer (Node.js) or btoa (browser) for SSR compat
  let binary = "";
  for (let i = 0; i < xored.length; i++) binary += String.fromCharCode(xored[i]);
  const b64 = typeof Buffer !== "undefined"
    ? Buffer.from(binary, "binary").toString("base64")
    : btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Build a proxy URL through our Cloudflare Worker.
 * Everything goes through the worker's /p/{token} endpoint — the token
 * carries both the URL and the CDN referer (XOR-encoded).
 */
function buildProxyUrl(url: string): string {
  const referer = getRefererFor(url);
  const token = encodeWorkerToken(url, referer);
  return `${WORKER_TOKEN_BASE}/${token}`;
}

/**
 * SERVER-SIDE helper: wrap any URL through the worker proxy.
 */
export function wrapStreamUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (typeof url !== "string") return "";
  if (url.startsWith("/api/") || url.startsWith("/")) return url;
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  if (url.startsWith(WORKER_PROXY)) return url; // already wrapped
  return buildProxyUrl(url);
}

/**
 * SERVER-SIDE helper: wrap an m3u8 URL through the worker proxy.
 * The worker rewrites segment URLs to /p/{token} (relative) automatically.
 */
export function wrapM3u8Url(url: string | null | undefined): string {
  if (!url) return "";
  if (typeof url !== "string") return "";
  if (url.startsWith("/api/") || url.startsWith("/")) return url;
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  if (url.startsWith(WORKER_PROXY)) return url; // already wrapped
  return buildProxyUrl(url);
}

// ─────────────────────────────────────────────────────────────────────
// CLIENT-SIDE helpers (used by React components like HLSPlayer)
// ─────────────────────────────────────────────────────────────────────

export const PROXY_BASE = WORKER_TOKEN_BASE;

export type ProxyMode = "auto" | "m3u8" | "image" | "raw";

export function proxify(url: string | null | undefined, mode: ProxyMode = "auto"): string {
  if (!url) return "";
  if (typeof url !== "string") return "";
  if (url.startsWith("/api/") || url.startsWith("/")) return url;
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  if (url.startsWith(WORKER_PROXY)) return url;

  // Mode-specific routing:
  // - "m3u8": Use wrapM3u8Url (same as proxifyM3u8) — for HLS manifests
  // - "image": Use wrapStreamUrl (same path, but semantically different for future caching)
  // - "auto"/"raw": Use wrapStreamUrl (default)
  if (mode === "m3u8") return wrapM3u8Url(url);
  return wrapStreamUrl(url);
}

export const proxifyM3u8  = (url: string) => wrapM3u8Url(url);
export const proxifyRaw   = (url: string) => wrapStreamUrl(url);

/**
 * Wrap an image URL (banner / cover / thumbnail / poster) through the
 * Cloudflare Worker proxy. The worker edge-caches the binary response so
 * AniList/TMDB images load noticeably faster — especially on slow
 * connections or repeated page views.
 *
 * Uses the same XOR-token encoding as `wrapStreamUrl` (/p/{token}).
 * Local paths (e.g. `/hero-bg.png`), data: URIs and already-proxied URLs
 * are returned unchanged.
 */
export function proxifyImage(url: string | null | undefined): string {
  if (!url) return "";
  if (typeof url !== "string") return "";
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  if (url.startsWith("/")) return url;                 // local asset — don't proxy
  if (url.startsWith(WORKER_PROXY)) return url;         // already wrapped
  return buildProxyUrl(url);
}

/**
 * Wrap a manga image (poster/cover/banner/page) through the Cloudflare
 * Worker proxy, picking the right Referer for the source CDN so the
 * image doesn't 403. Used instead of round-tripping through our own
 * Next.js server (/api/manga/image) — the worker is edge-hosted and
 * a single hop, so pages load noticeably faster.
 */
export function proxifyMangaImage(url: string | null | undefined): string {
  if (!url) return "";
  if (typeof url !== "string") return "";
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  if (url.startsWith(WORKER_PROXY)) return url;

  let referer = "https://mangadex.org/";
  if (url.includes("atsu.moe")) referer = "https://atsu.moe/";
  else if (url.includes("mangadex.org") || url.includes("uploads.mangadex.org")) referer = "https://mangadex.org/";
  else if (url.includes("comix.to")) referer = "https://comix.to/";
  else if (url.includes("poke-black-and-white.net")) referer = "https://mangaball.net/";
  else if (url.includes("red-and-blue.net")) referer = "https://mangaball.net/";
  else if (url.includes("imggo.net")) referer = "https://mangaball.net/";

  const token = encodeWorkerToken(url, referer);
  return `${WORKER_TOKEN_BASE}/${token}`;
}

/**
 * Wrap a URL through our Cloudflare Worker (for API calls, NOT streams).
 * Used by anixtv-api.ts, anilight-api.ts, anistream-api.ts to bypass
 * Cloudflare bot detection on API endpoints. Uses the worker's legacy
 * /proxy?url=... endpoint (kept for backward compatibility).
 */
export function workerWrap(url: string): string {
  if (!WORKER_PROXY) return url;
  return `${WORKER_PROXY}/proxy?url=${encodeURIComponent(url)}`;
}

/**
 * Wrap an m3u8 URL through the proxy WITH a custom referer.
 * Use this when the source API (e.g., Miruro) provides the correct Referer.
 * Falls back to getRefererFor() if no custom referer provided.
 */
export function wrapM3u8UrlWithReferer(url: string | null | undefined, customReferer?: string): string {
  if (!url) return "";
  if (typeof url !== "string") return "";
  if (url.startsWith("/api/") || url.startsWith("/")) return url;
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  if (url.startsWith(WORKER_PROXY)) return url;

  const referer = customReferer || getRefererFor(url);
  const token = encodeWorkerToken(url, referer);
  return `${WORKER_TOKEN_BASE}/${token}`;
}
