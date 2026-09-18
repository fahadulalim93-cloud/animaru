/**
 * ═══════════════════════════════════════════════════════════════════════
 *  LuffyTV Standalone Proxy — Node.js (VPS, Coolify, Docker)
 *  NO Cloudflare Workers — runs on YOUR VPS behind CF's FREE CDN
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  HOW IT WORKS:
 *    Browser → CF CDN (free, unlimited) → Your VPS (this proxy) → Upstream CDN
 *
 *    CF caches responses at the edge based on Cache-Control headers.
 *    CF's free CDN has NO request limits — unlike Workers (100k/day).
 *    As long as we set Cache-Control: public, max-age=86400, immutable,
 *    CF caches segments at 300+ POPs for free.
 *
 *  KUROANIME STRATEGY:
 *    - Session-bound tokens: each viewer gets unique URLs
 *    - Lean headers: 6-8 headers max (no CSP, no Permissions-Policy bloat)
 *    - No Vary header (CF can cache freely)
 *    - Cache-Control: immutable on segments (24h edge cache)
 *    - Content-Type: application/javascript for .ts (bypasses Chrome limits)
 *
 *  DEPLOY:
 *    1. Build: docker build -t luffytv-proxy-standalone .
 *    2. Run:   docker run -p 8081:8081 luffytv-proxy-standalone
 *    3. CF DNS: proxy.luffytv.live → your VPS IP (proxied/orange cloud ON)
 *    4. CF Page Rule: proxy.luffytv.live/* → Cache Everything (TTL 24h)
 *
 *  TOKEN FORMAT: XOR(url + "\0" + referer, XOR_KEY) → base64url
 *  Same XOR_KEY as proxy.ts — tokens are interchangeable.
 * ═══════════════════════════════════════════════════════════════════════
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

const PORT = process.env.PORT || 8081;
const XOR_KEY = '10b06cdc1ca48c9fb0b94af97cc040cf';

// ═══ CDN RULE TABLE ════════════════════════════════════════════════════
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
  // ─── AnimeSalt (as-cdn{21..29}.top) — NO Origin (ASCDN returns 500 with Origin) ──
  { test: h => /^as-cdn\d+\.top$/i.test(h),
    referer: 'https://animesalt.cx/', origin: null, secSite: 'cross-site' },
  // ─── AniKoto CDNs ──────────────────────────────────────────────────────
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
  // ─── AniDap subs ────────────────────────────────────────────────────────
  { test: h => h.endsWith('.lostproject.club') || h === 'lostproject.club',
    referer: 'https://anidap.lol/', origin: null, secSite: 'cross-site' },
  // ─── AniStream ─────────────────────────────────────────────────────────
  { test: h => h.endsWith('.vodvidl.site') || h === 'vodvidl.site',
    referer: 'https://vodvidl.site/', origin: 'https://vodvidl.site', secSite: 'cross-site' },
  { test: h => h.endsWith('.hakunaymatata.com') || h === 'hakunaymatata.com',
    referer: 'https://hakunaymatata.com/', origin: 'https://hakunaymatata.com', secSite: 'cross-site' },
  // ─── Raw IPs ───────────────────────────────────────────────────────────
  { test: h => /^\d+\.\d+\.\d+\.\d+$/.test(h),
    referer: 'https://www.miruro.tv/', origin: 'https://www.miruro.tv', secSite: 'cross-site' },
  // ─── Fallback ──────────────────────────────────────────────────────────
  { test: h => true,
    referer: 'https://megaplay.buzz/', origin: 'https://megaplay.buzz', secSite: 'cross-site' },
];

// ═══ XOR HELPERS ═════════════════════════════════════════════════════════
function xorEncode(str) {
  const keyBytes = Buffer.from(XOR_KEY, 'utf-8');
  const dataBytes = Buffer.from(str, 'utf-8');
  const xored = Buffer.alloc(dataBytes.length);
  for (let i = 0; i < dataBytes.length; i++) xored[i] = dataBytes[i] ^ keyBytes[i % keyBytes.length];
  return xored.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function xorDecode(token) {
  try {
    const b64 = token.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
    const raw = Buffer.from(padded, 'base64');
    const keyBytes = Buffer.from(XOR_KEY, 'utf-8');
    const decoded = Buffer.alloc(raw.length);
    for (let i = 0; i < raw.length; i++) decoded[i] = raw[i] ^ keyBytes[i % keyBytes.length];
    const text = decoded.toString('utf-8');
    const idx = text.indexOf('\0');
    if (idx === -1) return { url: text, ref: null };
    return { url: text.slice(0, idx), ref: text.slice(idx + 1) || null };
  } catch { return null; }
}

function encodePayload(url, referer) {
  return xorEncode(url + '\0' + (referer || ''));
}

// ═══ URL HELPERS ═══════════════════════════════════════════════════════
function resolveUrl(rel, base) {
  if (/^https?:\/\//i.test(rel)) return rel;
  try { return new URL(rel, base).href; } catch { return rel; }
}

// ═══ PASSTHROUGH HOSTS ══════════════════════════════════════════════════
// CDNs that BLOCK worker/VPS IPs entirely (return 403 to our proxy IPs).
// For these CDNs, we must NOT rewrite segment URLs to point back through
// the proxy — the proxy can't fetch them. Instead, leave the original URL
// in the m3u8 so the browser fetches directly using the user's home IP.
//
// Example: p16-ad-sg.ibyteimg.com (ByteDance CDN used by vivibebe.site —
// AniKai's video host). Returns 403 "domain forbidden" to proxy IPs.
const PASSTHROUGH_HOSTS = [
  'ibyteimg.com',
  'byteimg.com',
  'bytecdntp.com',
  'bytecdntp.cn',
  'ibyteimg.org',
];

function isPassthroughHost(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return PASSTHROUGH_HOSTS.some(h => host === h || host.endsWith('.' + h));
  } catch {
    return false;
  }
}

function findRule(hostname) {
  return CDN_RULES.find(r => r.test(hostname.toLowerCase()));
}

function isVodManifest(text) {
  return text.includes('#EXT-X-ENDLIST');
}

// ═══ M3U8 REWRITE ══════════════════════════════════════════════════════
function rewriteM3u8(text, baseUrl, referer, proxyBase) {
  const lines = text.split('\n');
  return lines.map(raw => {
    const line = raw.trim();
    if (line.startsWith('#') && line.includes('URI="')) {
      return line.replace(/URI="([^"]+)"/g, (_, uri) => {
        const abs = resolveUrl(uri, baseUrl);
        // ── PASSTHROUGH: don't proxy URLs on CDNs that block our IPs ──
        if (isPassthroughHost(abs)) return `URI="${abs}"`;
        return `URI="${proxyBase}/p/${encodePayload(abs, referer)}"`;
      });
    }
    if (line && !line.startsWith('#')) {
      const abs = resolveUrl(line, baseUrl);
      // ── PASSTHROUGH: don't proxy URLs on CDNs that block our IPs ──
      if (isPassthroughHost(abs)) return abs;
      return `${proxyBase}/p/${encodePayload(abs, referer)}`;
    }
    return raw;
  }).join('\n');
}

// ═══ CORE PROXY LOGIC ══════════════════════════════════════════════════
async function proxyTarget(targetUrl, refParam, req, res) {
  let parsedTarget;
  try {
    parsedTarget = new URL(targetUrl);
    if (parsedTarget.protocol !== 'https:' && parsedTarget.protocol !== 'http:') throw new Error('bad protocol');
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid target URL' }));
    return;
  }

  const targetHost = parsedTarget.hostname.toLowerCase();
  const overrideReferer = refParam || null;
  const rule = findRule(targetHost);

  let effectiveReferer, effectiveOrigin, effectiveSecSite;
  if (rule) {
    effectiveReferer = overrideReferer || rule.referer || `https://${targetHost}/`;
    effectiveOrigin = rule.origin || `https://${targetHost}`;
    effectiveSecSite = rule.secSite || 'cross-site';
  } else if (overrideReferer) {
    effectiveReferer = overrideReferer;
    try { effectiveOrigin = new URL(overrideReferer).origin; } catch { effectiveOrigin = `https://${targetHost}`; }
    effectiveSecSite = 'cross-site';
  } else {
    effectiveReferer = `https://${targetHost}/`;
    effectiveOrigin = `https://${targetHost}`;
    effectiveSecSite = 'cross-site';
  }

  const urlPath = targetUrl.split('?')[0];
  const isM3u8 = urlPath.endsWith('.m3u8') || urlPath.endsWith('/master')
               || urlPath.endsWith('/index.m3u8') || urlPath.endsWith('/playlist');
  const isBinary = !isM3u8;
  const rangeHeader = req.headers['range'];

  // ── Build upstream request headers ────────────────────────────────────
  const upstreamHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': isBinary ? 'identity' : 'gzip',
    'Connection': 'keep-alive',
  };
  if (effectiveReferer) upstreamHeaders['Referer'] = effectiveReferer;
  if (effectiveOrigin) upstreamHeaders['Origin'] = effectiveOrigin;
  if (rangeHeader) upstreamHeaders['Range'] = rangeHeader;

  // ── Fetch upstream (use https for https URLs, http for http URLs) ─────
  const requester = parsedTarget.protocol === 'https:' ? https : http;
  const upstreamReq = requester.request(targetUrl, {
    method: req.method === 'HEAD' ? 'HEAD' : 'GET',
    headers: upstreamHeaders,
  }, (upstreamResp) => {
    // ── Error handling ────────────────────────────────────────────────────
    if (upstreamResp.statusCode !== 200 && upstreamResp.statusCode !== 206) {
      const errBody = JSON.stringify({ error: 'Upstream error', status: upstreamResp.statusCode, host: targetHost });
      res.writeHead(upstreamResp.statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(errBody);
      return;
    }

    const contentType = (upstreamResp.headers['content-type'] || '').toLowerCase();
    const reallyM3u8 = isM3u8 || contentType.includes('mpegurl') || contentType.includes('x-mpegurl');

    // ── M3U8 MANIFEST ────────────────────────────────────────────────────
    if (reallyM3u8) {
      const chunks = [];
      upstreamResp.on('data', c => chunks.push(c));
      upstreamResp.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf-8');
        const proxyBase = `http://localhost:${PORT}`;
        const rewritten = rewriteM3u8(text, targetUrl, effectiveReferer, proxyBase);

        const vod = isVodManifest(text);
        const cacheControl = vod ? 'public, max-age=3600' : 'public, max-age=3';

        // ── LEAN HEADERS (kuroanime style — 6 headers only) ───────────────
        res.writeHead(200, {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Cache-Control': cacheControl,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Range, Content-Type',
          'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
        });
        res.end(rewritten);
      });
      return;
    }

    // ── BINARY SEGMENT (.ts / .m4s / .mp4) ───────────────────────────────
    // ── LEAN HEADERS — 6 headers only (kuroanime style) ──────────────────
    // Content-Type: application/javascript (bypasses Chrome media buffering limits)
    // Cache-Control: public, max-age=86400, immutable (24h edge cache)
    // NO Vary, NO CSP, NO Permissions-Policy, NO X-Frame-Options
    const respHeaders = {
      'Content-Type': 'application/javascript',  // ← kuroanime trick — bypasses Chrome limits
      'Cache-Control': 'public, max-age=86400, immutable',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
    };

    const cl = upstreamResp.headers['content-length'];
    if (cl) respHeaders['Content-Length'] = cl;
    const cr = upstreamResp.headers['content-range'];
    if (cr) respHeaders['Content-Range'] = cr;

    res.writeHead(upstreamResp.statusCode, respHeaders);

    // ── Stream directly — no buffering ──────────────────────────────────
    // Handle pipe errors so a client disconnect doesn't crash the server
    upstreamResp.pipe(res);

    // If client disconnects, destroy upstream to free resources
    res.on('close', () => {
      if (!upstreamResp.destroyed) upstreamResp.destroy();
    });

    // If upstream errors mid-stream, end response gracefully
    upstreamResp.on('error', () => {
      if (!res.writableEnded) res.end();
    });
  });

  upstreamReq.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'Upstream fetch failed', detail: String(err).substring(0, 200), host: targetHost }));
    } else if (!res.writableEnded) {
      res.end();
    }
  });

  // Handle timeout — don't hang forever
  upstreamReq.setTimeout(15000, () => {
    upstreamReq.destroy();
    if (!res.headersSent) {
      res.writeHead(504, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'Upstream timeout', host: targetHost }));
    } else if (!res.writableEnded) {
      res.end();
    }
  });

  upstreamReq.end();
}

// ═══ HTTP SERVER ═══════════════════════════════════════════════════════
// CRASH-PROOFING: wrap every request in try/catch + uncaughtException handler
// The previous version crashed on upstream errors that escaped the handler.

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT]', new Date().toISOString(), err.message);
});

const server = http.createServer((req, res) => {
  // ── Crash guard: if anything throws, respond with 500 instead of dying ──
  try {
    // ── CORS preflight ──────────────────────────────────────────────────
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Range, Content-Type',
      });
      res.end();
      return;
    }

    const url = new URL(req.url, `http://localhost:${PORT}`);

    // ── Health check ────────────────────────────────────────────────────
    if (url.pathname === '/health' || url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: true, worker: 'luffytv-proxy-standalone v1.1', ts: Date.now() }));
      return;
    }

    // ── Primary: /p/{token} ─────────────────────────────────────────────
    if (url.pathname.startsWith('/p/')) {
      const token = url.pathname.slice(3);
      const decoded = xorDecode(token);
      if (!decoded) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: 'Invalid token' }));
        return;
      }
      proxyTarget(decoded.url, decoded.ref, req, res);
      return;
    }

    // ── Legacy: /proxy?url=...&ref=... ──────────────────────────────────
    if (url.pathname === '/proxy') {
      const targetRaw = url.searchParams.get('url');
      if (!targetRaw) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: 'Missing ?url=' }));
        return;
      }
      const refParam = url.searchParams.get('ref');
      proxyTarget(decodeURIComponent(targetRaw), refParam, req, res);
      return;
    }

    res.writeHead(404, { 'Access-Control-Allow-Origin': '*' });
    res.end('Not found');
  } catch (err) {
    // If anything throws synchronously, don't crash — respond 500
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'Internal proxy error', detail: String(err).substring(0, 200) }));
    }
  }
});

// ── Handle client disconnects gracefully ────────────────────────────────
server.on('clientError', (err, socket) => {
  if (socket.writable) {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  }
});

server.listen(PORT, () => {
  console.log(`[luffytv-proxy-standalone] Listening on port ${PORT}`);
  console.log(`[luffytv-proxy-standalone] Health: http://localhost:${PORT}/health`);
});
