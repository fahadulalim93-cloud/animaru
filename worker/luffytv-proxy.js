/**
 * ═══════════════════════════════════════════════════════════════════════
 *  LuffyTV Anime Proxy — Cloudflare Worker v3
 *  Based on: https://github.com/OTAKUWeBer/anime-proxy
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  ENDPOINTS:
 *    /p/{base64url}          → primary: encoded "url\0referer" → proxy
 *    /proxy?url=...&ref=...  → legacy: query params (backward compat)
 *    /health                 → health check
 *
 *  DEPLOY:
 *    1. Cloudflare dashboard → Workers → luffytv-proxy → Edit code
 *    2. Paste this entire file → Save & Deploy
 *    3. Set NEXT_PUBLIC_PROXY_BASE in Vercel to your worker URL
 * ═══════════════════════════════════════════════════════════════════════
 */

// WORKER_BASE is resolved per-request from request.url.origin.
// This variable is kept for backward compatibility but is always
// overridden in proxyTarget() → rewriteM3u8().
let WORKER_BASE = '';

/* ─── CDN rule table — Referer/Origin per host ──────────────────────────── */
const CDN_RULES = [
  // 24stream.xyz CDN subdomains (Animex/AniDap providers)
  { test: h => h.endsWith('.24stream.xyz') || h === '24stream.xyz',
    referer: 'https://animex.one/', origin: 'https://animex.one', secSite: 'cross-site' },
  // Miruro CDNs
  { test: h => h.endsWith('.anidb.app') || h === 'anidb.app',
    referer: 'https://www.miruro.tv/', origin: 'https://www.miruro.tv', secSite: 'cross-site' },
  // nekostream.site CDNs (AniKoto) — need vidtube.site or megaplay.buzz referer
  { test: h => h.endsWith('.nekostream.site') || h === 'nekostream.site',
    referer: 'https://vidtube.site/', origin: 'https://vidtube.site', secSite: 'cross-site' },
  { test: h => h.endsWith('.owocdn.top') || h === 'owocdn.top',
    referer: 'https://kwik.cx/', origin: 'https://kwik.cx', secSite: 'cross-site' },
  { test: h => h.endsWith('.uwucdn.top') || h === 'uwucdn.top',
    referer: 'https://kwik.cx/', origin: 'https://kwik.cx', secSite: 'cross-site' },
  { test: h => h.endsWith('.krussdomi.com') || h === 'krussdomi.com',
    referer: 'https://krussdomi.com/', origin: 'https://krussdomi.com', secSite: 'same-origin' },
  { test: h => h.endsWith('.streamzone1.site') || h === 'streamzone1.site',
    referer: 'https://megaplay.buzz/', origin: 'https://megaplay.buzz', secSite: 'cross-site' },
  // mewstream.buzz (AniKoto) — needs megaplay.buzz referer
  { test: h => h.endsWith('.mewstream.buzz') || h === 'mewstream.buzz',
    referer: 'https://megaplay.buzz/', origin: 'https://megaplay.buzz', secSite: 'cross-site' },
  { test: h => h.endsWith('.cinewave2.site') || h === 'cinewave2.site',
    referer: 'https://megaplay.buzz/', origin: 'https://megaplay.buzz', secSite: 'cross-site' },
  // vibeplayer / vivibebe
  { test: h => h === 'vibeplayer.site' || h.endsWith('.vibeplayer.site') ||
               h === 'vivibebe.site' || h.endsWith('.vivibebe.site'),
    referer: 'https://vibeplayer.site/', origin: 'https://vibeplayer.site', secSite: 'same-origin' },
  // playeng (beep provider) — CRITICAL: 403 without same-origin referer
  { test: h => h.endsWith('.animeapps.top') || h === 'animeapps.top',
    referer: 'https://playeng.animeapps.top/', origin: 'https://playeng.animeapps.top', secSite: 'same-origin' },
  // nanobyte (AniLight quality variants)
  { test: h => h.endsWith('.bigdreamsmalldih.site') || h === 'bigdreamsmalldih.site',
    referer: 'https://kwik.cx/', origin: 'https://kwik.cx', secSite: 'cross-site' },
  // kwik
  { test: h => h === 'kwik.cx' || h.endsWith('.kwik.cx'),
    referer: 'https://kwik.cx/', origin: 'https://kwik.cx', secSite: 'same-origin' },
  // AniKage
  { test: h => h === 'prox.anikage.cc' || h.endsWith('.anikage.cc'),
    referer: 'https://anikage.cc/', origin: 'https://anikage.cc', secSite: 'cross-site' },
  // allanime
  { test: h => h === 'allanime.uns.bio' || h.endsWith('.allanime.uns.bio'),
    referer: 'https://allanime.uns.bio/', origin: 'https://allanime.uns.bio', secSite: 'same-origin' },
  // harmonix (miku provider)
  { test: h => h.endsWith('.harmonixwellnessgroup.store'),
    referer: 'https://allanime.uns.bio/', origin: 'https://allanime.uns.bio', secSite: 'cross-site' },
  // ── AniNeko/AniDao CDNs (otakuhg.site / otakuvid.online packed JS) ──
  // These CDNs need megaplay.buzz referer (tested: works from CF Worker)
  { test: h => h.endsWith('.premilkyway.com') || h.endsWith('.dramiyos-cdn.com') ||
               h.endsWith('.acek-cdn.com') || h.endsWith('.cdn-centaurus.com') ||
               h.endsWith('.silvermarinaenterprises.cfd') || h.endsWith('.healthyrecipeideas.cyou') ||
               h.endsWith('.digitalecosystem.space') || h.endsWith('.shiora.site') ||
               h.endsWith('.norami.top'),
    referer: 'https://megaplay.buzz/', origin: 'https://megaplay.buzz', secSite: 'cross-site' },
  // megaplay
  { test: h => h === 'megaplay.buzz' || h.endsWith('.megaplay.buzz'),
    referer: 'https://megaplay.buzz/', origin: 'https://megaplay.buzz', secSite: 'same-origin' },
  // animeverse
  { test: h => h.endsWith('.animeverse.to') || h === 'animeverse.to',
    referer: 'https://animeverse.to/', origin: 'https://animeverse.to', secSite: 'same-origin' },
  // animeonsen
  { test: h => h.endsWith('.animeonsen.xyz') || h === 'animeonsen.xyz',
    referer: 'https://www.animeonsen.xyz/', origin: 'https://www.animeonsen.xyz', secSite: 'cross-site' },
  // anidb app
  { test: h => h === 'anidb.app',
    referer: 'https://anidb.app/', origin: 'https://anidb.app', secSite: 'same-origin' },
  // kem.clvd.xyz
  { test: h => h.endsWith('.clvd.xyz'),
    referer: 'https://kem.clvd.xyz/', origin: 'https://kem.clvd.xyz', secSite: 'cross-site' },
  // Raw IP addresses (Miruro Ally uses 185.237.x.x)
  { test: h => /^\d+\.\d+\.\d+\.\d+$/.test(h),
    referer: 'https://www.miruro.tv/', origin: 'https://www.miruro.tv', secSite: 'cross-site' },

  // ─── NEW SOURCES (added 2026-06-27) ───
  // Kyren (kyren.moe + api.kyren.moe) — CF-protected, needs kyren.moe referer
  { test: h => h === 'kyren.moe' || h.endsWith('.kyren.moe') ||
               h === 'api.kyren.moe' || h.endsWith('.api.kyren.moe'),
    referer: 'https://kyren.moe/', origin: 'https://kyren.moe', secSite: 'same-origin' },
  // Ani.pm (ani.pm API + streams) — CF-protected
  { test: h => h === 'ani.pm' || h.endsWith('.ani.pm'),
    referer: 'https://ani.pm/', origin: 'https://ani.pm', secSite: 'same-origin' },
  // AniLight (api.anilight.live) — CF-protected
  { test: h => h === 'api.anilight.live' || h.endsWith('.anilight.live'),
    referer: 'https://anilight.live/', origin: 'https://anilight.live', secSite: 'cross-site' },
  // Anistream (api.anistream.one) — CF-protected
  { test: h => h === 'api.anistream.one' || h.endsWith('.anistream.one'),
    referer: 'https://anistream.one/', origin: 'https://anistream.one', secSite: 'cross-site' },
  // AniDap (anidap.lol + chad.anidap.lol) — CF-protected front, API needs same-origin
  { test: h => h === 'anidap.lol' || h.endsWith('.anidap.lol') ||
               h === 'chad.anidap.lol' || h.endsWith('.chad.anidap.lol'),
    referer: 'https://anidap.lol/', origin: 'https://anidap.lol', secSite: 'same-site' },
  // AniKuro (anikuro.ru API + proxy.anikuro.ru streams)
  { test: h => h === 'anikuro.ru' || h.endsWith('.anikuro.ru') ||
               h === 'proxy.anikuro.ru',
    referer: 'https://anikuro.ru/', origin: 'https://anikuro.ru', secSite: 'same-origin' },
  // Animetsu scraper (animetsu-scraper-jade.vercel.app)
  { test: h => h === 'animetsu-scraper-jade.vercel.app',
    referer: 'https://animetsu.live/', origin: 'https://animetsu.live', secSite: 'cross-site' },
  // swiftstream.top (Animetsu stream CDN) — CF-protected
  { test: h => h === 'swiftstream.top' || h.endsWith('.swiftstream.top'),
    referer: 'https://animetsu.live/', origin: 'https://animetsu.live', secSite: 'cross-site' },
  // Animeyubi (animeyubi.com API)
  { test: h => h === 'animeyubi.com' || h.endsWith('.animeyubi.com'),
    referer: 'https://animeyubi.com/', origin: 'https://animeyubi.com', secSite: 'same-origin' },

  // ReAnime (reanime.to) — CF-protected, needs same-origin referer
  { test: h => h === 'reanime.to' || h.endsWith('.reanime.to'),
    referer: 'https://reanime.to/', origin: 'https://reanime.to', secSite: 'same-origin' },

  // ─── Flixcloud (reanime.to / flixcloud.cc video host) ───
  // flixcloud.cc embed pages + fetch7-9.flixcloud.cc segment CDN.
  // Needs Referer: https://flixcloud.cc/ (the embed page origin).
  // The m3u8 URL contains a JWT token bound to the Worker's IP, so the
  // Worker must proxy BOTH the m3u8 and segments (same IP for token validation).
  { test: h => h === 'flixcloud.cc' || h.endsWith('.flixcloud.cc'),
    referer: 'https://flixcloud.cc/', origin: 'https://flixcloud.cc', secSite: 'same-origin' },

  // ─── Vidlink CDN (movie/TV direct streams) ───
  // stormvv.vodvidl.site, storm.vodvidl.site — Vidlink MP4/DASH streams
  // Requires Referer: https://vidlink.pro/ (returns 403 without it)
  { test: h => h.endsWith('.vodvidl.site') || h === 'vodvidl.site',
    referer: 'https://vidlink.pro/', origin: 'https://vidlink.pro', secSite: 'cross-site' },
  // hakunaymatata.com — Vidlink CDN (bcdn, cacdn, sacdn subdomains)
  { test: h => h.endsWith('.hakunaymatata.com') || h === 'hakunaymatata.com',
    referer: 'https://vidlink.pro/', origin: 'https://vidlink.pro', secSite: 'cross-site' },

  // ─── Streaming CDNs (added 2026-07-13) ───
  // seiryuu.vid-cdn.xyz — AniZone HLS + ASS subtitles
  // Needs anizone.to referer (returns 403 without it)
  { test: h => h.endsWith('.vid-cdn.xyz') || h === 'vid-cdn.xyz',
    referer: 'https://anizone.to/', origin: 'https://anizone.to', secSite: 'cross-site' },
  // as-cdn21..29.top — AnimeSalt HLS + AnixTV + WatchAnimeWorld
  // CRITICAL: NO Origin header for as-cdn*.top — ASCDN returns 500 when Origin is present
  // Referer: https://animesalt.cx/ (the WordPress site hosting the embed)
  { test: h => /^as-cdn\d+\.top$/i.test(h),
    referer: 'https://animesalt.cx/', origin: null, secSite: 'cross-site' },
  // WatchAnimeWorld / Zephyrix — play.zephyrix.top serves HLS streams
  { test: h => h === 'play.zephyrix.top' || h.endsWith('.zephyrix.top'),
    referer: 'https://watchanimeworld.top/', origin: 'https://watchanimeworld.top', secSite: 'cross-site' },
  // as-cdn17.top — WatchAnimeWorld HLS segments
  { test: h => h.endsWith('.as-cdn17.top') || h === 'as-cdn17.top',
    referer: 'https://watchanimeworld.top/', origin: 'https://watchanimeworld.top', secSite: 'cross-site' },
  // stream.neongambit.com / stream2.neongambit.com — HadFree
  { test: h => h.endsWith('.neongambit.com') || h === 'neongambit.com',
    referer: 'https://luna-stream.me/', origin: 'https://luna-stream.me', secSite: 'cross-site' },
  // api.anime.nexus / assets.anime.nexus — AnimeNexus
  { test: h => h.endsWith('.anime.nexus') || h === 'anime.nexus',
    referer: 'https://anime.nexus/', origin: 'https://anime.nexus', secSite: 'same-origin' },
  // 1oe.lostproject.club — AniDap Yuki subtitle CDN
  { test: h => h.endsWith('.lostproject.club') || h === 'lostproject.club',
    referer: 'https://megaplay.buzz/', origin: 'https://megaplay.buzz', secSite: 'cross-site' },
  // subbl.krussdomi.com — AniDap Sora subtitle CDN
  { test: h => h.endsWith('.krussdomi.com') || h === 'krussdomi.com',
    referer: 'https://krussdomi.com/', origin: 'https://krussdomi.com', secSite: 'same-origin' },
  // ── Megaplay CDN domains — all need megaplay.buzz referer ──
  // cdn.imgnex.top is WAF-blocked (always 403) — rewrite to ncdn.imgnex.top
  // ncdn.imgnex.top works with Referer: megaplay.buzz
  { test: h => h === 'cdn.imgnex.top',
    referer: 'https://megaplay.buzz/', origin: 'https://megaplay.buzz', secSite: 'cross-site',
    rewriteHost: 'ncdn.imgnex.top' },
  { test: h => h === 'ncdn.imgnex.top' || h.endsWith('.imgnex.top'),
    referer: 'https://megaplay.buzz/', origin: 'https://megaplay.buzz', secSite: 'cross-site' },
  // bb.akirax.buzz — segment CDN (also needs megaplay referer)
  { test: h => h.endsWith('.akirax.buzz') || h === 'akirax.buzz',
    referer: 'https://megaplay.buzz/', origin: 'https://megaplay.buzz', secSite: 'cross-site' },
  // megap.shiora.site — alternative megaplay CDN
  { test: h => h.endsWith('.shiora.site') || h === 'shiora.site',
    referer: 'https://megaplay.buzz/', origin: 'https://megaplay.buzz', secSite: 'cross-site' },
  // vidtube.site — Inazuma VidPlay embed CDN
  { test: h => h === 'vidtube.site' || h.endsWith('.vidtube.site'),
    referer: 'https://megaplay.buzz/', origin: 'https://megaplay.buzz', secSite: 'cross-site' },

  // Catch-all: default to miruro.tv referer (matches proxy.ts default)
  { test: h => true,
    referer: 'https://www.miruro.tv/', origin: 'https://www.miruro.tv', secSite: 'cross-site' },
];

/* ─── Base64url helpers ──────────────────────────────────────────────────── */
function b64uEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64uDecode(b64u) {
  const b64 = b64u.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function encodePayload(url, referer) {
  return b64uEncode(url + '\0' + (referer || ''));
}

function decodePayload(b64u) {
  try {
    const plain = b64uDecode(b64u);
    const idx = plain.indexOf('\0');
    if (idx === -1) return { url: plain, ref: null };
    return { url: plain.slice(0, idx), ref: plain.slice(idx + 1) || null };
  } catch {
    return null;
  }
}

/* ─── Browser impersonation headers ─────────────────────────────────────── */
function browserHeaders(referer, origin, secSite) {
  const h = {
    'User-Agent':         'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept':             '*/*',
    'Accept-Language':    'en-US,en;q=0.9',
    'Accept-Encoding':    'gzip, deflate, br',
    'Sec-Fetch-Dest':     'empty',
    'Sec-Fetch-Mode':     'cors',
    'Sec-Fetch-Site':     secSite || 'cross-site',
    'Sec-CH-UA':          '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    'Sec-CH-UA-Mobile':   '?0',
    'Sec-CH-UA-Platform': '"Windows"',
    'Connection':         'keep-alive',
    'Cache-Control':      'no-cache',
    'Pragma':             'no-cache',
  };
  if (referer) h['Referer'] = referer;
  if (origin)  h['Origin']  = origin;
  return h;
}

/* ─── CORS headers ───────────────────────────────────────────────────────── */
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':   '*',
    'Access-Control-Allow-Methods':  'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers':  'Range, Content-Type',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Content-Type, Accept-Ranges',
    'Accept-Ranges':                 'bytes',
  };
}

/* ─── Resolve relative URL against base ─────────────────────────────────── */
function resolveUrl(rel, base) {
  if (/^https?:\/\//i.test(rel)) return rel;
  try { return new URL(rel, base).href; } catch { return rel; }
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

/* ─── Rewrite M3U8: all segment/key URIs → /p/<base64url> ───────────────── */
function rewriteM3u8(text, baseUrl, referer, workerBase) {
  const lines = text.split('\n');
  return lines.map(raw => {
    const line = raw.trim();

    if (line.startsWith('#') && line.includes('URI="')) {
      return line.replace(/URI="([^"]+)"/g, (_, uri) => {
        const abs = resolveUrl(uri, baseUrl);
        // ── PASSTHROUGH: don't proxy URLs on CDNs that block worker IPs ──
        // Leave the URL as-is so the browser fetches directly.
        if (isPassthroughHost(abs)) return `URI="${abs}"`;
        // Encode the m3u8's referer so the worker sends the same Referer
        // for sub-playlists and segments. This is critical for CDNs like
        // premilkyway.com that require a specific Referer (megaplay.buzz).
        return `URI="${workerBase}/p/${encodePayload(abs, referer)}"`;
      });
    }

    if (line && !line.startsWith('#')) {
      const abs = resolveUrl(line, baseUrl);
      // ── PASSTHROUGH: don't proxy URLs on CDNs that block worker IPs ──
      // Leave the URL as-is so the browser fetches directly. This is required
      // for CDNs like p16-ad-sg.ibyteimg.com (ByteDance CDN used by AniKai's
      // vivibebe.site) which 403 any request from a Cloudflare Worker IP.
      if (isPassthroughHost(abs)) return abs;
      // Encode the m3u8's referer so the worker sends the same Referer
      // for sub-playlists and segments.
      return `${workerBase}/p/${encodePayload(abs, referer)}`;
    }

    return raw;
  }).join('\n');
}

/* ─── Core proxy logic ───────────────────────────────────────────────────── */
async function proxyTarget(targetUrl, refParam, request) {
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

  const rule = CDN_RULES.find(r => r.test(targetHost));
  let effectiveReferer, effectiveOrigin, effectiveSecSite;

  if (rule) {
    effectiveReferer = overrideReferer || rule.referer || `https://${targetHost}/`;
    effectiveOrigin  = rule.origin || `https://${targetHost}`;
    effectiveSecSite = rule.secSite || 'cross-site';
  } else if (overrideReferer) {
    try {
      const refUrl = new URL(overrideReferer);
      effectiveReferer = overrideReferer;
      effectiveOrigin  = refUrl.origin;
      effectiveSecSite = 'cross-site';
    } catch {
      effectiveReferer = overrideReferer;
      effectiveOrigin  = `https://${targetHost}`;
      effectiveSecSite = 'cross-site';
    }
  } else {
    effectiveReferer = `https://${targetHost}/`;
    effectiveOrigin  = `https://${targetHost}`;
    effectiveSecSite = 'cross-site';
  }

  // If the rule specifies a rewriteHost (e.g., cdn.imgnex.top → ncdn.imgnex.top),
  // rewrite the target URL to use the working CDN host.
  if (rule && rule.rewriteHost) {
    targetUrl = targetUrl.replace(`://${targetHost}`, `://${rule.rewriteHost}`);
    targetHost = rule.rewriteHost;
  }

  const headers = browserHeaders(effectiveReferer, effectiveOrigin, effectiveSecSite);
  const rangeHeader = request.headers.get('Range');
  if (rangeHeader) headers['Range'] = rangeHeader;

  let upstreamResp;
  try {
    upstreamResp = await fetch(targetUrl, {
      method:   request.method === 'HEAD' ? 'HEAD' : 'GET',
      headers,
      redirect: 'follow',
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Upstream fetch failed', detail: String(err) }),
      { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
    );
  }

  if (!upstreamResp.ok && upstreamResp.status !== 206) {
    return new Response(
      JSON.stringify({ error: 'Upstream error', status: upstreamResp.status, host: targetHost }),
      { status: upstreamResp.status, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
    );
  }

  const contentType = (upstreamResp.headers.get('Content-Type') || '').toLowerCase();
  const isM3u8 = contentType.includes('mpegurl') || contentType.includes('x-mpegurl')
               || targetUrl.split('?')[0].endsWith('.m3u8')
               || targetUrl.split('?')[0].endsWith('/master')
               || targetUrl.split('?')[0].endsWith('/index.m3u8');

  if (request.method === 'HEAD') {
    const h = { 'Content-Type': upstreamResp.headers.get('Content-Type') || 'application/octet-stream', ...corsHeaders() };
    const cl = upstreamResp.headers.get('Content-Length');
    if (cl) h['Content-Length'] = cl;
    return new Response(null, { status: upstreamResp.status, headers: h });
  }

  if (isM3u8) {
    const text = await upstreamResp.text();
    // Force absolute URLs — the worker serves on luffytv-proxy.ggy892767.workers.dev
    // but hls.js runs on luffytv.live. Relative /p/{token} URLs would resolve to
    // luffytv.live/p/{token} (wrong domain). Must use absolute worker URLs.
    const workerBase = 'https://luffytv-proxy.ggy892767.workers.dev';
    const rewritten = rewriteM3u8(text, targetUrl, effectiveReferer, workerBase);
    return new Response(rewritten, {
      status: upstreamResp.status,
      headers: {
        'Content-Type':  'application/vnd.apple.mpegurl',
        'Cache-Control': 'no-cache',
        ...corsHeaders(),
      },
    });
  }

  // ── Subtitle files: convert SRT → WebVTT so browsers can render them ──
  // The <track> element ONLY supports text/vtt. SRT and ASS are not supported.
  // We convert SRT to VTT on-the-fly (timestamp comma → period + WEBVTT header).
  // ASS is too complex to convert losslessly, so we do a basic strip of the
  // styling header and extract dialogue lines as plain VTT cues.
  const urlPath = targetUrl.split('?')[0].toLowerCase().split('#')[0];

  if (urlPath.endsWith('.srt')) {
    const srtText = await upstreamResp.text();
    const vttBody = srtText
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/^\uFEFF/, '')           // strip BOM
      .replace(/^\d+\s*\n(?=\d{2}:\d{2}:\d{2}[,.])/gm, '')  // strip SRT index lines (only before timestamps)
      .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')  // , → . in timestamps
      .trim();
    const vtt = `WEBVTT\n\n${vttBody}\n`;
    return new Response(vtt, {
      status: 200,
      headers: {
        'Content-Type': 'text/vtt; charset=utf-8',
        'Cache-Control': 'public, max-age=86400, immutable',
        ...corsHeaders(),
      },
    });
  }

  if (urlPath.endsWith('.vtt')) {
    // Pass through with correct content-type (many CDNs return octet-stream)
    const vttText = await upstreamResp.text();
    return new Response(vttText, {
      status: 200,
      headers: {
        'Content-Type': 'text/vtt; charset=utf-8',
        'Cache-Control': 'public, max-age=86400, immutable',
        ...corsHeaders(),
      },
    });
  }

  if (urlPath.endsWith('.ass')) {
    // Basic ASS → VTT conversion: strip [Script Info] / [V4+ Styles] / [Events]
    // header, extract Dialogue lines, strip ASS styling tags {\...}
    const assText = await upstreamResp.text();
    const lines = assText.split(/\r?\n/);
    const vttCues = [];
    let idx = 1;
    for (const line of lines) {
      if (!line.startsWith('Dialogue:')) continue;
      const parts = line.split(',');
      // Dialogue: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
      if (parts.length < 10) continue;
      const start = parts[1].trim();
      const end = parts[2].trim();
      const text = parts.slice(9).join(',').trim()
        .replace(/\{[^}]*\}/g, '')    // strip ASS override tags {\...}
        .replace(/\\N/g, '\n')         // \N → newline
        .replace(/\\n/g, ' ')          // \n → space
        .replace(/\\h/g, ' ');         // \h → hard space
      if (!text) continue;
      // ASS time format: H:MM:SS.cc → VTT: HH:MM:SS.mmm
      const fmt = (t) => {
        const m = t.match(/^(\d+):(\d{2}):(\d{2})\.(\d{2})$/);
        if (!m) return null;
        return `${m[1].padStart(2,'0')}:${m[2]}:${m[3]}.${m[4]}0`;
      };
      const vStart = fmt(start);
      const vEnd = fmt(end);
      if (!vStart || !vEnd) continue;
      vttCues.push(`${idx++}\n${vStart} --> ${vEnd}\n${text}\n`);
    }
    const vtt = `WEBVTT\n\n${vttCues.join('\n')}`;
    return new Response(vtt, {
      status: 200,
      headers: {
        'Content-Type': 'text/vtt; charset=utf-8',
        'Cache-Control': 'public, max-age=86400, immutable',
        ...corsHeaders(),
      },
    });
  }

  // Binary / TS segment: stream as-is with correct content-type
  let binaryContentType = upstreamResp.headers.get('Content-Type') || 'application/octet-stream';

  const passHeaders = {
    'Content-Type':  binaryContentType,
    'Cache-Control': 'public, max-age=86400, immutable',
    ...corsHeaders(),
  };
  // For HTML responses, add X-Frame-Options: ALLOWALL so they can be
  // loaded in an iframe (needed for embed players like AnixTV).
  if (binaryContentType.includes('text/html')) {
    passHeaders['X-Frame-Options'] = 'ALLOWALL';
    passHeaders['Content-Security-Policy'] = 'frame-ancestors *';
  }
  const cl = upstreamResp.headers.get('Content-Length');
  if (cl) passHeaders['Content-Length'] = cl;
  const cr = upstreamResp.headers.get('Content-Range');
  if (cr) passHeaders['Content-Range'] = cr;

  return new Response(upstreamResp.body, { status: upstreamResp.status, headers: passHeaders });
}

/* ─── AniList GraphQL Cache (Cloudflare Cache API) ───────────────────────── */
async function handleAniListCached(request, ctx) {
  // Only accept POST with JSON body
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }),
      { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  // Build cache key from the query + variables
  // We hash the variables to get a stable, short cache key
  const cacheKeyStr = JSON.stringify({ q: body.query, v: body.variables });
  const cacheKeyUrl = `https://anilist-cache.luffytv.live/${hashStr(cacheKeyStr)}`;
  const cache = caches.default;
  const cacheKey = new Request(cacheKeyUrl);

  // Check Cloudflare edge cache
  const cached = await cache.match(cacheKey);
  if (cached) {
    const age = Math.round((Date.now() - parseInt(cached.headers.get('X-Cache-Ts') || '0')) / 1000);
    console.log(`[AniList-Cache] HIT (age=${age}s) key=${cacheKeyUrl.slice(-12)}`);
    return new Response(cached.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Cache': 'HIT',
        'X-Cache-Age': String(age),
        ...corsHeaders(),
      },
    });
  }

  // Cache MISS — fetch from AniList
  console.log(`[AniList-Cache] MISS key=${cacheKeyUrl.slice(-12)}`);
  let anilistResp;
  try {
    anilistResp = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'AniList fetch failed', detail: String(err) }),
      { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  if (!anilistResp.ok) {
    // Don't cache errors — return directly
    const errBody = await anilistResp.text();
    return new Response(errBody, {
      status: anilistResp.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const respBody = await anilistResp.text();

  // Store in Cloudflare edge cache (1 hour)
  const respToCache = new Response(respBody, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'X-Cache-Ts': String(Date.now()),
    },
  });

  // Use waitUntil to cache in background (don't block response)
  ctx.waitUntil(cache.put(cacheKey, respToCache));

  return new Response(respBody, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-Cache': 'MISS',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      ...corsHeaders(),
    },
  });
}

/* ─── Generic API Cache (Cloudflare Cache API) ──────────────────────────── */
async function handleApiCache(request, url, ctx) {
  const targetUrl = url.searchParams.get('url');
  const ttlSec = parseInt(url.searchParams.get('ttl') || '300', 10); // default 5 min
  const ref = url.searchParams.get('ref') || '';

  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'Missing ?url=' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  // Build cache key
  const cacheKeyUrl = `https://api-cache.luffytv.live/${hashStr(targetUrl)}`;
  const cache = caches.default;
  const cacheKey = new Request(cacheKeyUrl);

  // Check edge cache
  const cached = await cache.match(cacheKey);
  if (cached) {
    const age = Math.round((Date.now() - parseInt(cached.headers.get('X-Cache-Ts') || '0')) / 1000);
    console.log(`[API-Cache] HIT (age=${age}s, ttl=${ttlSec}s)`);
    return new Response(cached.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-Cache': 'HIT',
        'X-Cache-Age': String(age),
        ...corsHeaders(),
      },
    });
  }

  // Cache MISS — fetch the URL
  console.log(`[API-Cache] MISS url=${targetUrl.slice(0, 80)}`);
  const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'application/json' };
  if (ref) headers['Referer'] = ref;

  let upstreamResp;
  try {
    upstreamResp = await fetch(targetUrl, { headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Fetch failed', detail: String(err) }),
      { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  if (!upstreamResp.ok) {
    const errBody = await upstreamResp.text();
    return new Response(errBody, {
      status: upstreamResp.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const respBody = await upstreamResp.text();

  // Only cache valid JSON
  try { JSON.parse(respBody); } catch {
    return new Response(respBody, {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Cache': 'BYPASS', ...corsHeaders() },
    });
  }

  const respToCache = new Response(respBody, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${ttlSec}, s-maxage=${ttlSec}`,
      'X-Cache-Ts': String(Date.now()),
    },
  });

  ctx.waitUntil(cache.put(cacheKey, respToCache));

  return new Response(respBody, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-Cache': 'MISS',
      'Cache-Control': `public, max-age=${ttlSec}, s-maxage=${ttlSec}`,
      ...corsHeaders(),
    },
  });
}

/* ─── Hash helper ────────────────────────────────────────────────────────── */
function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

/* ─── Main handler ───────────────────────────────────────────────────────── */
async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (url.pathname === '/health' || url.pathname === '/') {
    return new Response(JSON.stringify({ ok: true, worker: 'luffytv-proxy v3', ts: Date.now() }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  // ── /al — AniList GraphQL proxy with Cloudflare Cache API ──
  // Caches AniList responses at the edge for 1 hour. ALL users share the cache.
  // POST /al  body: { query, variables }  →  { data: { Media: {...} } }
  // This eliminates AniList rate limits (one cache entry per anime, shared globally).
  if (url.pathname === '/al') {
    return handleAniListCached(request, ctx);
  }

  // ── /api-cache — Generic API response cache ──
  // GET /api-cache?url=<encoded>&ttl=<seconds>
  // Caches any JSON API response at Cloudflare's edge.
  // Used for provider server lists (anipm, anikage, etc.)
  if (url.pathname === '/api-cache') {
    return handleApiCache(request, url, ctx);
  }

  // Primary: /p/<base64url>
  if (url.pathname.startsWith('/p/')) {
    const b64u = url.pathname.slice(3);
    const decoded = decodePayload(b64u);
    if (!decoded) {
      return new Response(JSON.stringify({ error: 'Invalid payload' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
    }
    return proxyTarget(decoded.url, decoded.ref, request);
  }

  // Legacy: /proxy?url=...&ref=...
  if (url.pathname === '/proxy') {
    const targetRaw = url.searchParams.get('url');
    if (!targetRaw) {
      return new Response(JSON.stringify({ error: 'Missing ?url= parameter' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
    }
    let targetUrl;
    try { targetUrl = decodeURIComponent(targetRaw); } catch {
      return new Response(JSON.stringify({ error: 'Bad URL encoding' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
    }
    const refParam = url.searchParams.get('ref');
    return proxyTarget(targetUrl, refParam, request);
  }

  return new Response('Not found', { status: 404, headers: corsHeaders() });
}

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  },
};

/* ─── Node.js HTTP Server (Coolify / Docker / bare-metal) ────────────────
 * When running OUTSIDE Cloudflare Workers (no global `caches`), this starts
 * a real HTTP server on PORT (default 8080). This allows the same worker
 * code to run in both Cloudflare Workers AND Docker containers.
 *
 * Coolify deployment:
 *   1. Dockerfile: FROM node:20-alpine → COPY luffytv-proxy.js → node luffytv-proxy.js
 *   2. Set PORT env var (default 8080)
 *   3. Coolify will health-check against /health
 * ────────────────────────────────────────────────────────────────────── */
if (typeof caches === 'undefined') {
  // Polyfill Cloudflare Cache API stubs (no-op for Docker)
  globalThis.caches = {
    default: {
      match: async () => undefined,
      put: async () => {},
      delete: async () => false,
    },
  };

  const http = await import('node:http');
  const PORT = parseInt(process.env.PORT || '8080', 10);

  // Stub ExecutionContext for waitUntil (fire-and-forget in Node)
  class NodeCtx {
    promises = [];
    waitUntil(p) { this.promises.push(p.catch(() => {})); }
  }

  // Convert Node IncomingMessage → Web Request
  function toWebRequest(req) {
    const proto = 'http';
    const url = new URL(req.url, `${proto}://${req.headers.host || 'localhost'}`);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v != null) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    }
    // Body handling: for GET/HEAD, no body
    if (req.method === 'GET' || req.method === 'HEAD') {
      return new Request(url.href, { method: req.method, headers });
    }
    // For POST etc, consume body as ArrayBuffer
    return new Promise((resolve) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks);
        resolve(new Request(url.href, {
          method: req.method,
          headers,
          body: body.length ? body : undefined,
        }));
      });
    });
  }

  // Convert Web Response → Node ServerResponse
  // CRITICAL: preserve ALL headers from the Web Response, including Cache-Control
  function sendNodeResponse(webResp, res) {
    const headers = {};
    webResp.headers.forEach((v, k) => { headers[k] = v; });

    // ── STRIP headers that prevent CF edge caching ──────────────────────
    // CF won't cache if these are present:
    //   - Set-Cookie → CF never caches responses with cookies
    //   - Vary: * → CF treats response as unique
    delete headers['set-cookie'];
    delete headers['Set-Cookie'];
    if (headers['vary'] === '*' || headers['Vary'] === '*') {
      delete headers['vary'];
      delete headers['Vary'];
    }

    res.writeHead(webResp.status, headers);

    // ── Stream response body ────────────────────────────────────────────
    // Use arrayBuffer for compatibility (works for both m3u8 text + binary segments)
    if (webResp.body) {
      webResp.arrayBuffer().then((buf) => {
        res.end(Buffer.from(buf));
      }).catch(() => res.end());
    } else {
      res.end();
    }
  }

  const server = http.createServer(async (req, res) => {
    try {
      const webReq = await toWebRequest(req);
      const ctx = new NodeCtx();
      const webResp = await handleRequest(webReq, {}, ctx);
      sendNodeResponse(webResp, res);
    } catch (err) {
      console.error('[Server] Unhandled error:', err);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  });

  server.listen(PORT, () => {
    console.log(`[luffytv-proxy] Node.js server listening on port ${PORT}`);
    console.log(`[luffytv-proxy] Health check: http://localhost:${PORT}/health`);
  });
}
