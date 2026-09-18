/**
 * Proxy helper for LuffyTV.
 *
 * Uses our Cloudflare Worker (api.luffytv.live) as the
 * ONLY proxy for ALL anime streams. Every CDN goes through the worker now.
 * Animetsu streams go through their own scraper proxy (animetsu-scraper-jade.vercel.app).
 *
 * Encoding: XOR(url + "\0" + referer, key) → base64url → /p/{token}
 * Key: "10b06cdc1ca48c9fb0b94af97cc040cf" (32 ASCII bytes)
 *
 * The worker rewrites m3u8 segment URLs to absolute https://api.luffytv.live/p/{token}
 * so segments go through the same proxy automatically (cross-origin safe).
 */

// ─────────────────────────────────────────────────────────────────────
// PROXY CONFIG — SAME-DOMAIN proxy at /p/{token} (like yumezone.live)
// ─────────────────────────────────────────────────────────────────────
// The proxy runs INSIDE Next.js at /p/[token] — same domain as the site.
// This means the browser reuses the HTTP/2 connection already open from
// the page load (no DNS lookup, no TLS handshake, no extra TCP connection).
// Saves ~100-300ms per request vs the old api.luffytv.live cross-domain setup.
//
// NOTE: NEXT_PUBLIC_PROXY_BASE env var is now ONLY used for `workerWrap`
// (API calls that bypass CF bot detection — those don't need same-domain).
// Stream URLs ALWAYS go through /p/{token} on luffytv.live itself.
//
// To force cross-domain streams (legacy/debug), set NEXT_PUBLIC_USE_CROSS_DOMAIN_PROXY=1.
const XOR_KEY = "10b06cdc1ca48c9fb0b94af97cc040cf"; // 32 ASCII bytes

// ── CF Worker proxy — ALWAYS use luffytv-proxy.ggy892767.workers.dev ──
// This is the FAST Cloudflare Worker (28ms cached, 379ms cold).
// api.luffytv.live is 30x SLOWER (940ms) — it routes through Cloudflare's
// custom domain proxy which adds latency. The workers.dev subdomain goes
// directly to the edge worker.
const CF_WORKER_BASE = "https://luffytv-proxy.ggy892767.workers.dev";
const WORKER_TOKEN_BASE = `${CF_WORKER_BASE}/p`;
const WORKER_PROXY = CF_WORKER_BASE;

// ── Secondary worker base via api.luffytv.live (Cloudflare custom domain) ──
// Same worker code, different IP range. The AniNeko/AniDao CDNs (premilkyway,
// dramiyos-cdn, acek-cdn) rate-limit the *.workers.dev IP range but NOT the
// api.luffytv.live custom domain IP range. Tested: api.luffytv.live returns
// 200 OK 100% of the time vs workers.dev ~50%.
//
// Use wrapM3u8UrlWithCustomBase for routes that need this alternate IP range.
const API_LUFFYTV_BASE = "https://api.luffytv.live";
const API_LUFFYTV_TOKEN_BASE = `${API_LUFFYTV_BASE}/p`;

// ── FALLBACK Worker — used when the primary worker gets rate-limited (429) ──
// Cloudflare free tier workers have a daily request limit (~100k/day).
// When the primary hits the limit, we automatically fall back to this
// secondary worker. Set via NEXT_PUBLIC_FALLBACK_PROXY_BASE env var.
const FALLBACK_PROXY_BASE = process.env.NEXT_PUBLIC_FALLBACK_PROXY_BASE
  || "https://luffytv-proxy-all-source.m3u8-proxy2.workers.dev";

// ── Track which worker is rate-limited (runtime flag) ──
// When the primary returns 429, we set this to true and all subsequent
// requests go through the fallback until the page is refreshed.
let primaryRateLimited = false;

/**
 * Mark the primary worker as rate-limited. Called by the HLS player when
 * it gets a 429 from the primary proxy. All subsequent buildProxyUrl calls
 * will use the fallback worker until the page is refreshed.
 */
export function markPrimaryProxyRateLimited() {
  if (!primaryRateLimited) {
    console.warn("[Proxy] Primary worker rate-limited (429). Switching to fallback worker:", FALLBACK_PROXY_BASE);
    primaryRateLimited = true;
  }
}

/**
 * Check if the primary proxy is currently rate-limited.
 */
export function isPrimaryProxyRateLimited() {
  return primaryRateLimited;
}

/**
 * Get the fallback proxy base URL (for use when primary is rate-limited).
 */
export function getFallbackProxyBase() {
  return FALLBACK_PROXY_BASE;
}

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
  // s1.akirax.buzz — AniKage stream CDN, needs vidtube.site or megaplay.buzz referer
  // zuna (aniwatchtv.uk) — needs zokoanime.video referer
  "hls2.aniwatchtv.uk":     "https://zokoanime.video/",
  "aniwatchtv.uk":          "https://zokoanime.video/",
  // loli (echovideo.to) — needs play2.echovideo.ru referer
  "hlsx3cdn.echovideo.to":  "https://play2.echovideo.ru",
  "echovideo.to":           "https://play2.echovideo.ru",
  "s1.akirax.buzz":        "https://megaplay.buzz/",
  "akirax.buzz":           "https://megaplay.buzz/",
  // cdn.imgnex.top — MegaPlay subtitle CDN (needs megaplay.buzz referer)
  "cdn.imgnex.top":        "https://megaplay.buzz/",
  "imgnex.top":            "https://megaplay.buzz/",
  // fetch.nexabloom.top — MegaPlay NEW subtitle CDN (2026-09 rotation; needs megaplay.buzz referer)
  "nexabloom.top":          "https://megaplay.buzz/",
  "fetch.nexabloom.top":    "https://megaplay.buzz/",
  // playeng — same-origin referer (CRITICAL: 403 without it)
  "playeng.animeapps.top": "https://playeng.animeapps.top/",
  // MegaPlay
  "megaplay.buzz":         "https://megaplay.buzz/",
  // AniLight quality variants
  "nanobyte.bigdreamsmalldih.site": "https://kwik.cx/",
  // Kwik — same-origin
  "kwik.cx":               "https://kwik.cx/",

  // Senshi — ninstream.com needs Referer: https://senshi.live/
  "ninstream.com":         "https://senshi.live/",
  "xin-cdn.xyz":           "https://anizone.to/",
  // Kyren
  "api.kyren.moe":         "https://kyren.moe/",
  "kyren.moe":             "https://kyren.moe/",
  // AniDB
  "anidb.app":             "https://anidb.app/",
  // Ani.pm
  "ani.pm":                "https://ani.pm/",
  // allanime — same-origin
  "allanime.uns.bio":      "https://allanime.uns.bio/",
  // harmonix (miku) — allanime referer
  "soq6.harmonixwellnessgroup.store": "https://allanime.uns.bio/",
  // AnimeSalt CDN — as-cdn{21..29}.top serves multi-audio HLS streams.
  // Referer required: https://animesalt.cx/ (the WordPress site hosting the embed iframe).
  // Used by AnimeSalt scraper (src/lib/animesalt-api.ts) which replaced the
  // old AnixTV scraper (anixtv.in is offline).
  // NOTE: also update src/app/p/[token]/route.ts CDN_RULES — keep both in sync.
  "as-cdn21.top":               "https://animesalt.cx/",
  "as-cdn22.top":               "https://animesalt.cx/",
  "as-cdn23.top":               "https://animesalt.cx/",
  "as-cdn24.top":               "https://animesalt.cx/",
  "as-cdn25.top":               "https://animesalt.cx/",
  "as-cdn26.top":               "https://animesalt.cx/",
  "as-cdn27.top":               "https://animesalt.cx/",
  "as-cdn28.top":               "https://animesalt.cx/",
  "as-cdn29.top":               "https://animesalt.cx/",
  // WatchAnimeWorld / Zephyrix CDN — play.zephyrix.top serves HLS streams
  "play.zephyrix.top":          "https://watchanimeworld.top/",
  "as-cdn17.top":               "https://watchanimeworld.top/",
  // Blakite CDN — blakiteanime.buzz streaming frontend
  "blakiteanime.buzz":          "https://www.blakiteanime.buzz/",
  "stream.blakiteanime.buzz":   "https://www.blakiteanime.buzz/",
  "blakiteapi.xyz":             "https://blakiteapi.xyz/",
  // DesiDubAnime — WordPress/Kiranime Hindi dub site
  "desidubanime.me":            "https://www.desidubanime.me/",
  // DesiDubAnime embed CDNs — common third-party hosts they use
  "streamtape.com":             "https://streamtape.com/",
  "doodstream.com":             "https://doodstream.com/",
  "mixdrop.ag":                 "https://mixdrop.ag/",
  "mp4upload.com":              "https://www.mp4upload.com/",
  // VidNest Hindi — vidnest.fun embeds
  "vidnest.fun":                "https://vidnest.fun/",
  // ── AniNeko/AniDao CDNs (otakuhg.site / otakuvid.online packed JS) ──
  // These CDNs require Referer: https://megaplay.buzz/ from the proxy.
  // Without it they return 403 — the default "https://www.miruro.tv/"
  // referer is rejected. Tested via /api/megaplay-proxy (VPS-side) and the
  // CF Worker proxy: both work as long as the referer is megaplay.buzz.
  "premilkyway.com":            "https://megaplay.buzz/",
  "dramiyos-cdn.com":           "https://megaplay.buzz/",
  "acek-cdn.com":               "https://megaplay.buzz/",
  "cdn-centaurus.com":          "https://megaplay.buzz/",
  "silvermarinaenterprises.cfd": "https://megaplay.buzz/",
  "healthyrecipeideas.cyou":    "https://megaplay.buzz/",
  "digitalecosystem.space":     "https://megaplay.buzz/",
  "shiora.site":                "https://megaplay.buzz/",
  "norami.top":                 "https://megaplay.buzz/",
  // Xanime.me — xanivsrcN.org hosts m3u8 + VTT subtitles.
  // Fully CORS-open — no referer needed, but we set one for safety so xanime.me
  // can audit their CDN traffic if they ever block external scrapers.
  "xanivsrc.org":                "https://xanime.me/",
};

// Wildcard referer patterns — matched against the URL hostname.
// Format: { regex: referer }
// Used when a CDN serves content from many numbered subdomains
// (e.g. vault-01.uwucdn.top, vault-99.owocdn.top) — adding each one
// individually is unscalable.
const CDN_REFERER_PATTERNS: Array<{ regex: RegExp; referer: string }> = [
  // Xanime.me — numbered xanivsrcN.org CDNs (1-10 observed, may grow)
  { regex: /^xanivsrc\d+\.org$/i, referer: "https://xanime.me/" },
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
export function encodeWorkerToken(url: string, referer: string): string {
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
 *
 * FALLBACK: If the primary worker is rate-limited (429), we automatically
 * switch to the fallback worker. This is a runtime flag that persists
 * until the page is refreshed.
 */
function buildProxyUrl(url: string): string {
  const referer = getRefererFor(url);
  const token = encodeWorkerToken(url, referer);
  // If primary is rate-limited, use the fallback worker
  if (primaryRateLimited) {
    return `${FALLBACK_PROXY_BASE}/p/${token}`;
  }
  return `${WORKER_TOKEN_BASE}/${token}`;
}

/**
 * URLs that are ALREADY proxied by their own service.
 * Routing these through our worker would double-proxy them, which often causes
 * Cloudflare challenge blocks (403/503) or broken segment URLs.
 * These services handle CORS + Referer themselves.
 *
 * NOTE: AniKage (prox.anikage.cc) REMOVED from this list — their URLs
 * do NOT have CORS headers and are Cloudflare-protected, so the browser
 * can't access them directly. We route them through our worker proxy instead,
 * which adds the correct Referer header (https://anikage.cc/) server-side.
 */
const SELF_PROXIED_HOSTS: string[] = [
  // Empty — all CDNs go through CF Worker proxy which adds correct Referer.
  // premilkyway/dramiyos/acek/cdn-centaurus work through CF Worker (tested 200 OK).
  // They were previously set to RAW (browser direct) but the browser gets 403
  // because it sends Referer: luffytv.live which these CDNs reject.
  // The CF Worker sends the correct Referer (megaplay.buzz or anineko.to).
];

function isSelfProxied(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return SELF_PROXIED_HOSTS.some(h => host === h || host.endsWith("." + h));
  } catch { return false; }
}

/**
 * SERVER-SIDE helper: wrap any URL through the proxy.
 * Returns a relative "/p/{token}" URL when using same-domain mode (default),
 * or an absolute URL when NEXT_PUBLIC_PROXY_BASE is set.
 */
export function wrapStreamUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (typeof url !== "string") return "";
  // Already internal Next.js route (e.g. /api/stream)
  if (url.startsWith("/api/") || url.startsWith("/p/")) return url;
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  // Already proxied through our worker (absolute URL)
  if (WORKER_PROXY && url.startsWith(WORKER_PROXY)) return url;
  if (isSelfProxied(url)) return url; // already proxied by source service
  return buildProxyUrl(url);
}

/**
 * SERVER-SIDE helper: wrap an m3u8 URL through the proxy.
 * Same as wrapStreamUrl — the proxy rewrites segment URLs to /p/{token}
 * (relative) automatically.
 */
export function wrapM3u8Url(url: string | null | undefined): string {
  if (!url) return "";
  if (typeof url !== "string") return "";
  if (url.startsWith("/api/") || url.startsWith("/p/")) return url;
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  if (WORKER_PROXY && url.startsWith(WORKER_PROXY)) return url;
  if (isSelfProxied(url)) return url; // already proxied by source service
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
  if (url.startsWith("/api/") || url.startsWith("/p/")) return url;
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  if (WORKER_PROXY && url.startsWith(WORKER_PROXY)) return url;
  if (isSelfProxied(url)) return url; // already proxied by source service

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
 * CLIENT-SIDE helper: wrap any URL through the SAME-DOMAIN /p/{token} proxy
 * running inside Next.js (src/app/p/[token]/route.ts).
 *
 * Why this exists:
 *   - wrapM3u8Url/wrapStreamUrl return absolute workers.dev URLs (cross-domain)
 *   - wrapM3u8UrlWithApiLuffytv returns absolute api.luffytv.live URLs (slow)
 *   - This helper returns RELATIVE /p/{token} so the browser reuses the
 *     existing HTTP/2 connection from the page load — fastest option.
 *
 * Used by W2G room page (where low latency + cross-origin safety matter).
 */
export function wrapM3u8UrlSameDomain(url: string | null | undefined): string {
  if (!url) return "";
  if (typeof url !== "string") return "";
  // Already on same-domain proxy
  if (url.startsWith("/p/")) return url;
  if (url.startsWith("/api/") || url.startsWith("data:") || url.startsWith("blob:")) return url;

  // If the URL is ALREADY wrapped through workers.dev or api.luffytv.live,
  // we cannot easily un-wrap it (would need to decode the token). The caller
  // is expected to pass raw upstream URLs. If you have an already-wrapped URL,
  // return it as-is so we don't double-encode.
  if (url.startsWith("https://luffytv-proxy.ggy892767.workers.dev/p/")) return url;
  if (url.startsWith("https://api.luffytv.live/p/")) return url;
  if (WORKER_PROXY && url.startsWith(WORKER_PROXY)) return url;
  if (isSelfProxied(url)) return url;

  const referer = getRefererFor(url);
  const token = encodeWorkerToken(url, referer);
  return `/p/${token}`;
}

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
  if (url.startsWith("/p/")) return url;                  // already proxied (same-domain)
  if (WORKER_PROXY && url.startsWith(WORKER_PROXY)) return url;  // already proxied (cross-domain)
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
  if (url.startsWith("/p/")) return url;                  // already proxied (same-domain)
  if (WORKER_PROXY && url.startsWith(WORKER_PROXY)) return url;

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
 * Wrap a URL for an API call (not a stream). Bypasses Cloudflare bot
 * detection on anime site API endpoints (anixtv, anilight, anistream).
 *
 * When same-domain mode is active (default), this still uses the legacy
 * api.luffytv.live worker because API calls don't need the same HTTP/2
 * reuse benefit streams do (they're one-shot per page load, not per
 * segment).
 *
 * To override: set NEXT_PUBLIC_PROXY_BASE=https://your-worker.example.com
 */
const API_WORKER = CF_WORKER_BASE;
export function workerWrap(url: string): string {
  return `${API_WORKER}/proxy?url=${encodeURIComponent(url)}`;
}

/**
 * Wrap an m3u8 URL through the proxy WITH a custom referer.
 * Use this when the source API (e.g., Miruro) provides the correct Referer.
 * Falls back to getRefererFor() if no custom referer provided.
 */
export function wrapM3u8UrlWithReferer(url: string | null | undefined, customReferer?: string): string {
  if (!url) return "";
  if (typeof url !== "string") return "";
  if (url.startsWith("/api/") || url.startsWith("/p/")) return url;
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  if (WORKER_PROXY && url.startsWith(WORKER_PROXY)) return url;
  // ── Return RAW for self-proxied hosts (cdn.imgnex.top) ──
  // cdn.imgnex.top blocks our VPS IP but allows regular browser IPs.
  // Return the raw URL so the browser fetches directly from cdn.imgnex.top
  // using the user's home IP — same approach as anikura.club.
  if (isSelfProxied(url)) return url;

  const referer = customReferer || getRefererFor(url);
  const token = encodeWorkerToken(url, referer);
  return `${WORKER_TOKEN_BASE}/${token}`;
}

/**
 * Wrap an m3u8 URL through the proxy using api.luffytv.live as the worker
 * base (instead of the default luffytv-proxy.ggy892767.workers.dev).
 *
 * Why: The AniNeko/AniDao CDNs (premilkyway.com, dramiyos-cdn.com, acek-cdn.com)
 * rate-limit / 403 the *.workers.dev IP range at segment-load frequency
 * (5-10 req/sec). The api.luffytv.live custom domain uses a different IP
 * range that these CDNs don't throttle.
 *
 * Tested 2026-09-10: api.luffytv.live returns 200 OK 100% of the time for
 * the same URLs that workers.dev 403s ~50% of the time.
 *
 * Use this for AniNeko and AniDao server routes only. Other routes should
 * use wrapM3u8Url / wrapM3u8UrlWithReferer (faster workers.dev path).
 */
export function wrapM3u8UrlWithApiLuffytv(url: string | null | undefined, customReferer?: string): string {
  if (!url) return "";
  if (typeof url !== "string") return "";
  if (url.startsWith("/api/") || url.startsWith("/p/")) return url;
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  if (API_LUFFYTV_BASE && url.startsWith(API_LUFFYTV_BASE)) return url;
  if (isSelfProxied(url)) return url;

  const referer = customReferer || getRefererFor(url);
  const token = encodeWorkerToken(url, referer);
  return `${API_LUFFYTV_TOKEN_BASE}/${token}`;
}

// ─────────────────────────────────────────────────────────────────────
// CF Worker → VPS worker FALLBACK
// ─────────────────────────────────────────────────────────────────────
// When the CF Worker proxy fails (daily 100k limit, Worker down, edge
// cache miss storm), the player falls back to the VPS worker. Both
// use the SAME XOR_KEY + /p/{token} shape, so a token built for one is
// valid for the other — the player only needs to swap the base URL.
//
// `buildVpsBackupUrl(originalUrl)` takes the CURRENT proxy URL (which
// may be CF Worker /p/{token} or same-domain /p/{token}) and returns
// the equivalent VPS worker URL. If the input isn't a proxied URL or
// we're already on the VPS worker, it returns "" (no fallback).
//
// The player calls this when hls.js fires a fatal NETWORK_ERROR and
// retries through CF Worker have been exhausted.
export function buildVpsBackupUrl(currentProxyUrl: string): string {
  // No VPS fallback anymore — everything goes through CF Worker.
  // Return empty so the player doesn't try to switch.
  return "";
}

// True if `url` is already a VPS worker URL (so no fallback available).
export function isVpsWorkerUrl(url: string): boolean {
  // No VPS worker anymore — everything is CF Worker.
  return false;
}
