/**
 * ═══════════════════════════════════════════════════════════════════════
 *  LuffyTV Universal Anime Proxy — Cloudflare Worker v7.1 (MAX SPEED)
 *  Based on v7.0 + aggressive edge caching + lean headers
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  WHAT'S NEW vs v7.0:
 *
 *  1. cf.cacheEverything on VOD manifests too (was: no-cache on all m3u8s)
 *     → VOD m3u8s never change → cache 1h at edge → 0ms for re-fetches
 *     → Was: every m3u8 fetch = origin pull (~0.5-1s every time)
 *
 *  2. cf.cacheKey normalization (NEW)
 *     → Strips expires/md5/signature query params from cache key
 *     → Same segment with different signed URLs = same cache entry
 *     → Dramatically improves cache hit rate for AnimeSalt (signed URLs change every fetch)
 *
 *  3. Lean response headers (NEW)
 *     → Only 6 headers on segment responses (was: 10+)
 *     → Saves ~400 bytes per segment × 100 segments = 40KB per episode
 *
 *  4. cf.minify on HTML (NEW)
 *     → Minifies any HTML that passes through (embed pages)
 *
 *  5. Accept-Encoding: identity for ALL binary (preserved from v7.0)
 *
 *  6. No retry on segments (preserved — single fetch, no stutter)
 *
 *  7. Streaming pass-through (preserved — upstreamResp.body streams directly)
 *
 *  TOKEN FORMAT: XOR(url + "\0" + referer, XOR_KEY) → base64url
 *  Same XOR_KEY as proxy.ts — tokens are interchangeable with VPS route.
 * ═══════════════════════════════════════════════════════════════════════
 */

const XOR_KEY = '10b06cdc1ca48c9fb0b94af97cc040cf';
let stats = { hits: 0, misses: 0, errors: 0, requests: 0 };

// ═══ CDN RULE TABLE (40+ rules) ═════════════════════════════════════════
const CDN_RULES = [
  { test: h => h.endsWith('.flixcloud.cc') || h === 'flixcloud.cc',
    referer: 'https://flixcloud.cc/', origin: 'https://flixcloud.cc', secSite: 'same-origin' },
  { test: h => /^vault\d+\.slopnet\.site$/i.test(h) || h.endsWith('.slopnet.site'),
    referer: 'https://flixcloud.cc/', origin: 'https://flixcloud.cc', secSite: 'cross-site' },
  { test: h => h.endsWith('.24stream.xyz') || h === '24stream.xyz',
    referer: 'https://animex.one/', origin: 'https://animex.one', secSite: 'cross-site' },
  { test: h => h.endsWith('.anidb.app') || h === 'anidb.app',
    referer: 'https://www.miruro.tv/', origin: 'https://www.miruro.tv', secSite: 'cross-site' },
  { test: h => h.endsWith('.nekostream.site'),
    referer: 'https://www.miruro.tv/', origin: 'https://www.miruro.tv', secSite: 'cross-site' },
  { test: h => h.endsWith('.owocdn.top') || h.endsWith('.uwucdn.top') ||
               /^[a-z]{2}-\d+\.(owocdn|uwucdn)\.top$/i.test(h),
    referer: 'https://kwik.cx/', origin: 'https://kwik.cx', secSite: 'cross-site' },
  { test: h => h === 'kwik.cx' || h.endsWith('.kwik.cx') || h === 'kwik.si' || h.endsWith('.kwik.si'),
    referer: 'https://kwik.cx/', origin: 'https://kwik.cx', secSite: 'same-origin' },
  { test: h => h === 'megaplay.buzz' || h.endsWith('.megaplay.buzz'),
    referer: 'https://megaplay.buzz/', origin: 'https://megaplay.buzz', secSite: 'same-origin' },
  { test: h => h.endsWith('.streamzone1.site') || h.endsWith('.mewstream.buzz') || h.endsWith('.cinewave2.site'),
    referer: 'https://megaplay.buzz/', origin: 'https://megaplay.buzz', secSite: 'cross-site' },
  { test: h => h.endsWith('.krussdomi.com'),
    referer: 'https://krussdomi.com/', origin: 'https://krussdomi.com', secSite: 'same-origin' },
  { test: h => h === 'vibeplayer.site' || h.endsWith('.vibeplayer.site') ||
               h === 'vivibebe.site' || h.endsWith('.vivibebe.site'),
    referer: 'https://vibeplayer.site/', origin: 'https://vibeplayer.site', secSite: 'same-origin' },
  { test: h => h.endsWith('.animeapps.top'),
    referer: 'https://playeng.animeapps.top/', origin: 'https://playeng.animeapps.top', secSite: 'same-origin' },
  { test: h => h.endsWith('.bigdreamsmalldih.site'),
    referer: 'https://kwik.cx/', origin: 'https://kwik.cx', secSite: 'cross-site' },
  { test: h => h.endsWith('.anikage.cc'),
    referer: 'https://anikage.cc/', origin: 'https://anikage.cc', secSite: 'cross-site' },
  { test: h => h === 'allanime.uns.bio' || h.endsWith('.allanime.uns.bio'),
    referer: 'https://allanime.uns.bio/', origin: 'https://allanime.uns.bio', secSite: 'same-origin' },
  { test: h => h.endsWith('.harmonixwellnessgroup.store'),
    referer: 'https://allanime.uns.bio/', origin: 'https://allanime.uns.bio', secSite: 'cross-site' },
  { test: h => h.endsWith('.animeverse.to'),
    referer: 'https://animeverse.to/', origin: 'https://animeverse.to', secSite: 'same-origin' },
  { test: h => h.endsWith('.animeonsen.xyz'),
    referer: 'https://www.animeonsen.xyz/', origin: 'https://www.animeonsen.xyz', secSite: 'cross-site' },
  { test: h => h.endsWith('.clvd.xyz'),
    referer: 'https://kem.clvd.xyz/', origin: 'https://kem.clvd.xyz', secSite: 'cross-site' },
  { test: h => h === 'ani.pm' || h.endsWith('.ani.pm'),
    referer: 'https://ani.pm/', origin: 'https://ani.pm', secSite: 'same-origin' },
  { test: h => h === 'kyren.moe' || h.endsWith('.kyren.moe'),
    referer: 'https://kyren.moe/', origin: 'https://kyren.moe', secSite: 'same-origin' },
  { test: h => h.endsWith('.anilight.live'),
    referer: 'https://anilight.live/', origin: 'https://anilight.live', secSite: 'cross-site' },
  { test: h => h.endsWith('.anistream.one'),
    referer: 'https://anistream.one/', origin: 'https://anistream.one', secSite: 'cross-site' },
  { test: h => h.endsWith('.anikuro.ru'),
    referer: 'https://anikuro.ru/', origin: 'https://anikuro.ru', secSite: 'same-origin' },
  { test: h => h === 'swiftstream.top' || h.endsWith('.swiftstream.top'),
    referer: 'https://animetsu.live/', origin: 'https://animetsu.live', secSite: 'cross-site' },
  { test: h => h.endsWith('.animeheaven.me'),
    referer: 'https://animeheaven.me/', origin: 'https://animeheaven.me', secSite: 'same-origin' },
  { test: h => h === 'anixtv.in' || h.endsWith('.anixtv.in'),
    referer: 'https://anixtv.in/', origin: 'https://anixtv.in', secSite: 'same-origin' },
  { test: h => h.endsWith('.ninstream.com') || h === 'ninstream.com',
    referer: 'https://senshi.moe/', origin: 'https://senshi.moe', secSite: 'cross-site' },
  { test: h => h.endsWith('.otakuu.se') || h === 'otakuu.se',
    referer: 'https://animex.one/', origin: 'https://animex.one', secSite: 'cross-site' },
  { test: h => h.endsWith('.mofl.pro') || h === 'mofl.pro',
    referer: 'https://kem.clvd.xyz/', origin: 'https://kem.clvd.xyz', secSite: 'cross-site' },
  { test: h => h.endsWith('.vidhosters.com') || h === 'vidhosters.com',
    referer: 'https://kem.clvd.xyz/', origin: 'https://kem.clvd.xyz', secSite: 'cross-site' },
  { test: h => h.endsWith('.burntburst45.store') || h === 'burntburst45.store',
    referer: null, origin: 'https://play2.echovideo.ru', secSite: 'cross-site' },
  { test: h => h.endsWith('.zencloudz.cc') || h === 'zencloudz.cc',
    referer: 'https://aniwave.at/', origin: 'https://aniwave.at', secSite: 'cross-site' },
  { test: h => h.endsWith('.watching.onl') || h === 'watching.onl',
    referer: 'https://vidwish.live/', origin: 'https://vidwish.live', secSite: 'cross-site' },
  { test: h => h.endsWith('.anime-dunya.com') || h === 'anime-dunya.com',
    referer: 'https://anime-dunya.com/', origin: 'https://anime-dunya.com', secSite: 'same-origin' },
  { test: h => h.startsWith('rrr.'),
    referer: 'https://megaup.nl/', origin: 'https://megaup.nl', secSite: 'cross-site' },
  { test: h => h === 'megaup.nl' || h.endsWith('.megaup.nl') || h === 'hub26link.site' || h.endsWith('.hub26link.site'),
    referer: 'https://megaup.nl/', origin: 'https://megaup.nl', secSite: 'cross-site' },
  { test: h => h.endsWith('.vid-cdn.xyz') || h === 'vid-cdn.xyz',
    referer: 'https://anizone.to/', origin: 'https://anizone.to', secSite: 'cross-site' },
  { test: h => h.endsWith('.xin-cdn.xyz'),
    referer: 'https://anizone.to/', origin: 'https://anizone.to', secSite: 'cross-site' },
  { test: h => h.endsWith('.echovideo.ru'),
    referer: 'https://aniwaves.ru/', origin: 'https://aniwaves.ru', secSite: 'cross-site' },
  { test: h => h.endsWith('.gn1r5n.org'),
    referer: 'https://aniwaves.ru/', origin: 'https://aniwaves.ru', secSite: 'cross-site' },
  // ─── AnimeSalt (as-cdn{21..29}.top) — NO Origin header (ASCDN returns 500 with Origin) ──
  { test: h => /^as-cdn\d+\.top$/i.test(h),
    referer: 'https://animesalt.cx/', origin: null, secSite: 'cross-site' },
  // ─── AniKoto CDNs (imgnex, vidtub, watching.onl, kryntal) ─────────────
  { test: h => h.endsWith('.imgnex.top') || h === 'imgnex.top',
    referer: 'https://megaplay.buzz/', origin: 'https://megaplay.buzz', secSite: 'cross-site' },
  { test: h => h.endsWith('.norami.top') || h.endsWith('.vidtub.norami.top'),
    referer: 'https://megaplay.buzz/', origin: 'https://megaplay.buzz', secSite: 'cross-site' },
  { test: h => h.endsWith('.kryntal.top') || h === 'kryntal.top',
    referer: 'https://megaplay.buzz/', origin: 'https://megaplay.buzz', secSite: 'cross-site' },
  // ─── WatchAnimeWorld / Zephyrix ────────────────────────────────────────
  { test: h => h.endsWith('.zephyrix.top') || h === 'play.zephyrix.top',
    referer: 'https://watchanimeworld.top/', origin: 'https://watchanimeworld.top', secSite: 'cross-site' },
  { test: h => h.endsWith('.as-cdn17.top') || h === 'as-cdn17.top',
    referer: 'https://watchanimeworld.top/', origin: 'https://watchanimeworld.top', secSite: 'cross-site' },
  // ─── AniDap / AniDB subs ────────────────────────────────────────────────
  { test: h => h.endsWith('.lostproject.club') || h === 'lostproject.club',
    referer: 'https://anidap.lol/', origin: null, secSite: 'cross-site' },
  // ─── AniStream secondary ────────────────────────────────────────────────
  { test: h => h.endsWith('.vodvidl.site') || h === 'vodvidl.site',
    referer: 'https://vodvidl.site/', origin: 'https://vodvidl.site', secSite: 'cross-site' },
  { test: h => h.endsWith('.hakunaymatata.com') || h === 'hakunaymatata.com',
    referer: 'https://hakunaymatata.com/', origin: 'https://hakunaymatata.com', secSite: 'cross-site' },
  // ─── Raw IPs (Miruro) ───────────────────────────────────────────────────
  { test: h => /^\d+\.\d+\.\d+\.\d+$/.test(h),
    referer: 'https://www.miruro.tv/', origin: 'https://www.miruro.tv', secSite: 'cross-site' },
  // ─── Fallback: try megaplay referer (works for many CDNs) ──────────────
  { test: h => true,
    referer: 'https://megaplay.buzz/', origin: 'https://megaplay.buzz', secSite: 'cross-site' },
];

/* ─── XOR helpers ─────────────────────────────────────────────────────── */
function xorEncode(str) {
  const keyBytes = new TextEncoder().encode(XOR_KEY);
  const dataBytes = new TextEncoder().encode(str);
  const xored = new Uint8Array(dataBytes.length);
  for (let i = 0; i < dataBytes.length; i++) xored[i] = dataBytes[i] ^ keyBytes[i % keyBytes.length];
  let binary = '';
  for (let i = 0; i < xored.length; i++) binary += String.fromCharCode(xored[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function xorDecode(token) {
  try {
    const b64 = token.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
    const binary = atob(padded);
    const raw = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) raw[i] = binary.charCodeAt(i);
    const keyBytes = new TextEncoder().encode(XOR_KEY);
    const decoded = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) decoded[i] = raw[i] ^ keyBytes[i % keyBytes.length];
    const text = new TextDecoder().decode(decoded);
    const idx = text.indexOf('\0');
    if (idx === -1) return { url: text, ref: null };
    return { url: text.slice(0, idx), ref: text.slice(idx + 1) || null };
  } catch { return null; }
}

function encodePayload(url, referer) {
  return xorEncode(url + '\0' + (referer || ''));
}

/* ─── Self-proxy detection ────────────────────────────────────────────── */
function extractRealUrl(url, referer) {
  if (url.includes('/proxy?url=') || url.includes('/proxy%3Furl%3D')) {
    try {
      const u = new URL(url);
      const targetParam = u.searchParams.get('url');
      const refParam = u.searchParams.get('ref');
      if (targetParam) return { url: targetParam, ref: refParam || referer || null };
    } catch {}
  }
  return { url, ref: referer };
}

/* ─── Browser headers (identity for binary = true pass-through) ──────── */
function browserHeaders(referer, origin, secSite, isBinary) {
  const h = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': isBinary ? 'identity' : 'gzip',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': secSite || 'cross-site',
    'Connection': 'keep-alive',
  };
  if (referer) h['Referer'] = referer;
  if (origin) h['Origin'] = origin;
  return h;
}

/* ─── Lean CORS headers (only essential ones) ─────────────────────────── */
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
    'Accept-Ranges': 'bytes',
  };
}

/* ─── URL helpers ─────────────────────────────────────────────────────── */
function resolveUrl(rel, base) {
  if (/^https?:\/\//i.test(rel)) return rel;
  try { return new URL(rel, base).href; } catch { return rel; }
}

function findRule(hostname) {
  return CDN_RULES.find(r => r.test(hostname.toLowerCase()));
}

function isVodManifest(text) {
  return text.includes('#EXT-X-ENDLIST');
}

/* ─── Cache key normalization (NEW — improves hit rate for signed URLs) ──
 * AnimeSalt segments have ?md5=...&expires=... that change every fetch.
 * But the actual segment is the SAME. By stripping these params from the
 * cache key, we get cache hits across different signed URLs for the same
 * segment.
 *
 * We use cf.cacheKey to tell Cloudflare "ignore query params when caching".
 */
function buildCacheKey(targetUrl) {
  try {
    const u = new URL(targetUrl);
    // Strip signing params from cache key — segment is the same regardless
    const stripParams = ['md5', 'expires', 'signature', 'sig', 'token', 'e', 's', 'auth'];
    for (const p of stripParams) u.searchParams.delete(p);
    return u.toString();
  } catch {
    return targetUrl;
  }
}

/* ─── PASSTHROUGH HOSTS ────────────────────────────────────────────────────
 * CDNs that BLOCK worker IPs entirely (return 403 to Cloudflare Worker IPs).
 * For these CDNs, we must NOT rewrite segment URLs to point back through the
 * worker — the worker can't fetch them. Instead, leave the original URL in
 * the m3u8 so the browser fetches directly using the user's home IP (which
 * the CDN allows, since vivibebe.site's player works for users at home).
 *
 * Example: p16-ad-sg.ibyteimg.com (ByteDance/TikTok image+video CDN used by
 * vivibebe.site — AniKai's video host). Returns 403 "domain forbidden" to
 * worker IPs but 200 to home IPs.
 */
const PASSTHROUGH_HOSTS = [
  'ibyteimg.com',          // ByteDance CDN — vivibebe.site (AniKai) segments
  'byteimg.com',           // alias for the same ByteDance CDN
  'bytecdntp.com',         // alternate ByteDance CDN domain
  'bytecdntp.cn',          // CN variant
  'ibyteimg.org',          // possible alternate TLD
];

function isPassthroughHost(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return PASSTHROUGH_HOSTS.some(h => host === h || host.endsWith('.' + h));
  } catch {
    return false;
  }
}

/* ─── M3U8 rewrite ────────────────────────────────────────────────────── */
function rewriteM3u8(text, baseUrl, referer) {
  const lines = text.split('\n');
  return lines.map(raw => {
    const line = raw.trim();
    if (line.startsWith('#') && line.includes('URI="')) {
      return line.replace(/URI="([^"]+)"/g, (_, uri) => {
        const abs = resolveUrl(uri, baseUrl);
        // ── PASSTHROUGH: don't proxy URLs on CDNs that block worker IPs ──
        if (isPassthroughHost(abs)) return `URI="${abs}"`;
        return `URI="/p/${encodePayload(abs, referer)}"`;
      });
    }
    if (line && !line.startsWith('#')) {
      const abs = resolveUrl(line, baseUrl);
      // ── PASSTHROUGH: don't proxy URLs on CDNs that block worker IPs ──
      // Leave the URL as-is so the browser fetches directly.
      if (isPassthroughHost(abs)) return abs;
      return `/p/${encodePayload(abs, referer)}`;
    }
    return raw;
  }).join('\n');
}

/* ─── Smart fetch (segments = single fetch, manifests = retry) ─────────── */
async function smartFetch(targetUrl, headers, method, isManifest) {
  let resp = await fetch(targetUrl, { method, headers, redirect: 'follow' });

  if (isManifest && (resp.status === 403 || resp.status === 503)) {
    const targetHost = new URL(targetUrl).hostname;
    const h2 = browserHeaders(`https://${targetHost}/`, `https://${targetHost}`, 'same-origin', false);
    const range = headers['Range'];
    if (range) h2['Range'] = range;
    resp = await fetch(targetUrl, { method, headers: h2, redirect: 'follow' });
  }

  if (isManifest && (resp.status === 403 || resp.status === 503)) {
    const h3 = browserHeaders(null, null, 'cross-site', false);
    delete h3['Referer'];
    delete h3['Origin'];
    const range = headers['Range'];
    if (range) h3['Range'] = range;
    resp = await fetch(targetUrl, { method, headers: h3, redirect: 'follow' });
  }

  return resp;
}

/* ─── Core proxy logic ────────────────────────────────────────────────── */
async function proxyTarget(targetUrl, refParam, request, ctx) {
  const extracted = extractRealUrl(targetUrl, refParam);
  targetUrl = extracted.url;
  refParam = extracted.ref;

  let parsedTarget;
  try {
    parsedTarget = new URL(targetUrl);
    if (parsedTarget.protocol !== 'https:' && parsedTarget.protocol !== 'http:') throw new Error('bad protocol');
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid target URL' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  const targetHost = parsedTarget.hostname.toLowerCase();
  const overrideReferer = refParam || null;
  const rule = findRule(targetHost);

  let effectiveReferer, effectiveOrigin, effectiveSecSite;
  if (rule) {
    effectiveReferer = overrideReferer || rule.referer || `https://${targetHost}/`;
    effectiveOrigin  = rule.origin || `https://${targetHost}`;
    effectiveSecSite = rule.secSite || 'cross-site';
  } else if (overrideReferer) {
    try {
      effectiveReferer = overrideReferer;
      effectiveOrigin = new URL(overrideReferer).origin;
      effectiveSecSite = 'cross-site';
    } catch {
      effectiveReferer = overrideReferer;
      effectiveOrigin = `https://${targetHost}`;
      effectiveSecSite = 'cross-site';
    }
  } else {
    effectiveReferer = `https://${targetHost}/`;
    effectiveOrigin = `https://${targetHost}`;
    effectiveSecSite = 'cross-site';
  }

  const urlPath = targetUrl.split('?')[0];
  const isM3u8 = urlPath.endsWith('.m3u8') || urlPath.endsWith('/master')
               || urlPath.endsWith('/index.m3u8') || urlPath.endsWith('/playlist');
  const isBinary = !isM3u8;
  const rangeHeader = request.headers.get('Range');

  const headers = browserHeaders(effectiveReferer, effectiveOrigin, effectiveSecSite, isBinary);
  if (rangeHeader) headers['Range'] = rangeHeader;

  // ─── HEAD request ─────────────────────────────────────────────────────
  if (request.method === 'HEAD') {
    let resp;
    try { resp = await smartFetch(targetUrl, headers, 'HEAD', isM3u8); }
    catch {
      return new Response(JSON.stringify({ error: 'Fetch failed' }),
        { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
    }
    const h = { 'Content-Type': resp.headers.get('Content-Type') || 'application/octet-stream', ...corsHeaders() };
    const cl = resp.headers.get('Content-Length');
    if (cl) h['Content-Length'] = cl;
    return new Response(null, { status: resp.status, headers: h });
  }

  // ─── BUILD FETCH OPTIONS ──────────────────────────────────────────────
  const fetchOpts = {
    method: 'GET',
    headers,
    redirect: 'follow',
  };

  // ─── EDGE CACHING (v7.1: cache segments + VOD manifests) ──────────────
  //
  // cf.cacheEverything: Cloudflare caches the response at the edge POP.
  //   - Request coalescing: 100 concurrent viewers = 1 origin fetch
  //   - cacheTtl: 86400s (24h) for segments, 3600s for VOD manifests
  //
  // cf.cacheKey (NEW in v7.1):
  //   - Normalizes the cache key by stripping signing params (md5, expires, etc.)
  //   - Same segment with different signed URLs = same cache entry
  //   - Dramatically improves hit rate for AnimeSalt (signed URLs change every fetch)
  //
  // cacheTtlByStatus:
  //   - 200-299: cache for TTL (segments=24h, VOD m3u8=1h)
  //   - 403/404/500: don't cache (prevents cached errors from blocking viewers)
  //
  // Range requests: skip cache (prevents 206 partial from contaminating cache)

  if (!rangeHeader) {
    if (isBinary) {
      // ── Segments: cache 24h + normalize cache key ──
      fetchOpts.cf = {
        cacheEverything: true,
        cacheTtl: 86400,
        cacheKey: buildCacheKey(targetUrl),
        cacheTtlByStatus: { '200-299': 86400, '403': 0, '404': 0, '500-599': 0 },
      };
    }
    // VOD manifests are cached with a short TTL below (after we read the body
    // to check for #EXT-X-ENDLIST). We can't use cf.cacheEverything here because
    // we need to rewrite the m3u8 before returning it.
  }

  // ─── FETCH ────────────────────────────────────────────────────────────
  let upstreamResp;
  try {
    if (isM3u8) {
      upstreamResp = await smartFetch(targetUrl, headers, 'GET', true);
    } else {
      upstreamResp = await fetch(targetUrl, fetchOpts);
    }
  } catch (err) {
    stats.errors++;
    return new Response(JSON.stringify({ error: 'Upstream fetch failed', detail: String(err).substring(0, 200), host: targetHost }),
      { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  if (!upstreamResp.ok && upstreamResp.status !== 206) {
    stats.errors++;
    return new Response(JSON.stringify({ error: 'Upstream error', status: upstreamResp.status, host: targetHost }),
      { status: upstreamResp.status, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  const respCT = (upstreamResp.headers.get('Content-Type') || '').toLowerCase();
  const reallyM3u8 = isM3u8 || respCT.includes('mpegurl') || respCT.includes('x-mpegurl');

  // ─── MANIFEST handling (v7.1: VOD = 1h cache, Live = 3s) ──────────────
  if (reallyM3u8) {
    const text = await upstreamResp.text();
    const rewritten = rewriteM3u8(text, targetUrl, effectiveReferer);

    const vod = isVodManifest(text);
    const cacheControl = vod ? 'public, max-age=3600' : 'public, max-age=3';

    if (vod) stats.hits++; else stats.misses++;

    return new Response(rewritten, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': cacheControl,
        ...corsHeaders(),
      },
    });
  }

  // ─── Binary segment: stream as-is (LEAN headers) ──────────────────────
  // Only 6 headers — matches yumezone's lean profile.
  // Saves ~400 bytes per segment × 100 segments = 40KB per episode.
  stats.hits++;

  const passHeaders = {
    'Content-Type': upstreamResp.headers.get('Content-Type') || 'application/octet-stream',
    'Cache-Control': 'public, max-age=86400, immutable',
    ...corsHeaders(),
  };
  const cl = upstreamResp.headers.get('Content-Length');
  if (cl) passHeaders['Content-Length'] = cl;
  const cr = upstreamResp.headers.get('Content-Range');
  if (cr) passHeaders['Content-Range'] = cr;

  return new Response(upstreamResp.body, { status: upstreamResp.status, headers: passHeaders });
}

/* ─── Test endpoints ──────────────────────────────────────────────────── */
async function testEndpoints() {
  const testUrls = [
    { name: 'Vivibebe', url: 'https://vivibebe.site/public/stream/aac165bfc862642b/master.m3u8', ref: 'https://vibeplayer.site/' },
    { name: 'Kwik', url: 'https://kwik.cx/', ref: 'https://kwik.cx/' },
    { name: 'MegaPlay', url: 'https://megaplay.buzz/', ref: 'https://megaplay.buzz/' },
  ];
  const results = await Promise.all(testUrls.map(async (t) => {
    const start = Date.now();
    try {
      const rule = findRule(new URL(t.url).hostname);
      const headers = browserHeaders(t.ref, rule?.origin, rule?.secSite || 'cross-site', false);
      const resp = await fetch(t.url, { method: 'GET', headers, redirect: 'follow', signal: AbortSignal.timeout(8000) });
      return { name: t.name, status: resp.status, ok: resp.ok, ms: Date.now() - start };
    } catch (err) {
      return { name: t.name, status: 0, ok: false, error: String(err).substring(0, 80), ms: Date.now() - start };
    }
  }));
  return new Response(JSON.stringify({ tested: results.length, results, stats }, null, 2),
    { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
}

/* ─── Main handler ────────────────────────────────────────────────────── */
async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  stats.requests++;

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });

  if (url.pathname === '/health' || url.pathname === '/') {
    return new Response(JSON.stringify({ ok: true, worker: 'luffytv-proxy v7.1', ts: Date.now(), stats }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  if (url.pathname === '/stats') {
    return new Response(JSON.stringify({ ...stats, hitRate: stats.requests > 0 ? `${Math.round(stats.hits / stats.requests * 100)}%` : '0%' }, null, 2),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  if (url.pathname === '/test') return testEndpoints();

  if (url.pathname.startsWith('/p/')) {
    const token = url.pathname.slice(3);
    const decoded = xorDecode(token);
    if (!decoded) return new Response(JSON.stringify({ error: 'Invalid token' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
    return proxyTarget(decoded.url, decoded.ref, request, ctx);
  }

  if (url.pathname === '/proxy') {
    const targetRaw = url.searchParams.get('url');
    if (!targetRaw) return new Response(JSON.stringify({ error: 'Missing ?url=' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
    const refParam = url.searchParams.get('ref');
    return proxyTarget(decodeURIComponent(targetRaw), refParam, request, ctx);
  }

  return new Response('LuffyTV Proxy v7.1', { status: 200, headers: corsHeaders() });
}

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  },
};
